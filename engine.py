import logging
import hashlib
import os
import io
import asyncio
import base64
from queue import Queue
from typing import Dict, Any, List, Optional, Union
from functools import lru_cache
import numpy as np
import torch
import torch.nn.functional as F
from PIL import Image

from liveportrait.config.argument_config import ArgumentConfig
from liveportrait.utils.camera import get_rotation_matrix
from liveportrait.utils.io import resize_to_limit
from liveportrait.utils.crop import prepare_paste_back, paste_back

# Configure logging
logging.basicConfig(level=logging.DEBUG, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Global constants
DATA_ROOT = os.environ.get('DATA_ROOT', '/tmp/data')
MODELS_DIR = os.path.join(DATA_ROOT, "models")

def base64_data_uri_to_PIL_Image(base64_string: str) -> Image.Image:
    """
    Convert a base64 data URI to a PIL Image.

    Args:
        base64_string (str): The base64 encoded image data.

    Returns:
        Image.Image: The decoded PIL Image.
    """
    if ',' in base64_string:
        base64_string = base64_string.split(',')[1]
    img_data = base64.b64decode(base64_string)
    return Image.open(io.BytesIO(img_data))

class Engine:
    """
    The main engine class for FacePoke
    """

    def __init__(self, live_portrait):
        """
        Initialize the FacePoke engine with necessary models and processors.

        Args:
            live_portrait (LivePortraitPipeline): The LivePortrait model for video generation.
        """
        self.live_portrait = live_portrait

        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

        self.image_cache = {}  # Stores the original images
        self.processed_cache = {}  # Stores the processed image data

        logger.info("✅ FacePoke Engine initialized successfully.")

    def get_image_hash(self, image: Union[Image.Image, str, bytes]) -> str:
        """
        Compute or retrieve the hash for an image.

        Args:
            image (Union[Image.Image, str, bytes]): The input image, either as a PIL Image,
                base64 string, or bytes.

        Returns:
            str: The computed hash of the image.
        """
        if isinstance(image, str):
            # Assume it's already a hash if it's a string of the right length
            if len(image) == 32:
                return image
            # Otherwise, assume it's a base64 string
            image = base64_data_uri_to_PIL_Image(image)

        if isinstance(image, Image.Image):
            return hashlib.md5(image.tobytes()).hexdigest()
        elif isinstance(image, bytes):
            return hashlib.md5(image).hexdigest()
        else:
            raise ValueError("Unsupported image type")

    @lru_cache(maxsize=256)
    def _process_image(self, image_hash: str) -> Dict[str, Any]:
        """
        Process the input image and cache the results.

        Args:
            image_hash (str): Hash of the input image.

        Returns:
            Dict[str, Any]: Processed image data.
        """
        # let's hide the logs as there are thousands of message slike this
        #logger.info(f"Processing image with hash: {image_hash}")

        if image_hash not in self.image_cache:
            raise ValueError(f"Image with hash {image_hash} not found in cache")

        image = self.image_cache[image_hash]
        img_rgb = np.array(image)

        inference_cfg = self.live_portrait.live_portrait_wrapper.cfg
        img_rgb = resize_to_limit(img_rgb, inference_cfg.ref_max_shape, inference_cfg.ref_shape_n)
        crop_info = self.live_portrait.cropper.crop_single_image(img_rgb)
        img_crop_256x256 = crop_info['img_crop_256x256']

        I_s = self.live_portrait.live_portrait_wrapper.prepare_source(img_crop_256x256)
        x_s_info = self.live_portrait.live_portrait_wrapper.get_kp_info(I_s)
        f_s = self.live_portrait.live_portrait_wrapper.extract_feature_3d(I_s)
        x_s = self.live_portrait.live_portrait_wrapper.transform_keypoint(x_s_info)

        processed_data = {
            'img_rgb': img_rgb,
            'crop_info': crop_info,
            'x_s_info': x_s_info,
            'f_s': f_s,
            'x_s': x_s,
            'inference_cfg': inference_cfg
        }

        self.processed_cache[image_hash] = processed_data

        return processed_data

    async def modify_image(self, image_or_hash: Union[Image.Image, str, bytes], params: Dict[str, float]) -> str:
        """
        Modify the input image based on the provided parameters, using caching for efficiency
        and outputting the result as a WebP image.

        Args:
            image_or_hash (Union[Image.Image, str, bytes]): Input image as a PIL Image, base64-encoded string,
                image bytes, or a hash string.
            params (Dict[str, float]): Parameters for face transformation.

        Returns:
            str: Modified image as a base64-encoded WebP data URI.

        Raises:
            ValueError: If there's an error modifying the image or WebP is not supported.
        """
        # let's disable those logs completely as there are thousands of message slike this
        #logger.info("Starting image modification")
        #logger.debug(f"Modification parameters: {params}")

        try:
            image_hash = self.get_image_hash(image_or_hash)

            # If we don't have the image in cache yet, add it
            if image_hash not in self.image_cache:
                if isinstance(image_or_hash, (Image.Image, bytes)):
                    self.image_cache[image_hash] = image_or_hash
                elif isinstance(image_or_hash, str) and len(image_or_hash) != 32:
                    # It's a base64 string, not a hash
                    self.image_cache[image_hash] = base64_data_uri_to_PIL_Image(image_or_hash)
                else:
                    raise ValueError("Image not found in cache and no valid image provided")

            # Process the image (this will use the cache if available)
            if image_hash not in self.processed_cache:
                processed_data = await asyncio.to_thread(self._process_image, image_hash)
            else:
                processed_data = self.processed_cache[image_hash]

            # Apply modifications based on params
            x_d_new = processed_data['x_s_info']['kp'].clone()
            await self._apply_facial_modifications(x_d_new, params)

            # Apply rotation
            R_new = get_rotation_matrix(
                processed_data['x_s_info']['pitch'] + params.get('rotate_pitch', 0),
                processed_data['x_s_info']['yaw'] + params.get('rotate_yaw', 0),
                processed_data['x_s_info']['roll'] + params.get('rotate_roll', 0)
            )
            x_d_new = processed_data['x_s_info']['scale'] * (x_d_new @ R_new) + processed_data['x_s_info']['t']

            # Apply stitching
            x_d_new = await asyncio.to_thread(self.live_portrait.live_portrait_wrapper.stitching, processed_data['x_s'], x_d_new)

            # Generate the output
            out = await asyncio.to_thread(self.live_portrait.live_portrait_wrapper.warp_decode, processed_data['f_s'], processed_data['x_s'], x_d_new)
            I_p = self.live_portrait.live_portrait_wrapper.parse_output(out['out'])[0]

            # Paste back to full size
            mask_ori = await asyncio.to_thread(
                prepare_paste_back,
                processed_data['inference_cfg'].mask_crop, processed_data['crop_info']['M_c2o'],
                dsize=(processed_data['img_rgb'].shape[1], processed_data['img_rgb'].shape[0])
            )
            I_p_to_ori_blend = await asyncio.to_thread(
                paste_back,
                I_p, processed_data['crop_info']['M_c2o'], processed_data['img_rgb'], mask_ori
            )

            # Convert the result to a PIL Image
            result_image = Image.fromarray(I_p_to_ori_blend)

            # Save as WebP
            buffered = io.BytesIO()
            result_image.save(buffered, format="WebP", quality=85)  # Adjust quality as needed
            modified_image_base64 = base64.b64encode(buffered.getvalue()).decode('utf-8')

            #logger.info("Image modification completed successfully")
            return f"data:image/webp;base64,{modified_image_base64}"

        except Exception as e:
            #logger.error(f"Error in modify_image: {str(e)}")
            #logger.exception("Full traceback:")
            raise ValueError(f"Failed to modify image: {str(e)}")

    async def _apply_facial_modifications(self, x_d_new: torch.Tensor, params: Dict[str, float]) -> None:
        """
        Apply facial modifications to the keypoints based on the provided parameters.

        Args:
            x_d_new (torch.Tensor): Tensor of facial keypoints to be modified.
            params (Dict[str, float]): Parameters for face transformation.
        """
        modifications = [
            ('smile', [
                (0, 20, 1, -0.01), (0, 14, 1, -0.02), (0, 17, 1, 0.0065), (0, 17, 2, 0.003),
                (0, 13, 1, -0.00275), (0, 16, 1, -0.00275), (0, 3, 1, -0.0035), (0, 7, 1, -0.0035)
            ]),
            ('aaa', [
                (0, 19, 1, 0.001), (0, 19, 2, 0.0001), (0, 17, 1, -0.0001)
            ]),
            ('eee', [
                (0, 20, 2, -0.001), (0, 20, 1, -0.001), (0, 14, 1, -0.001)
            ]),
            ('woo', [
                (0, 14, 1, 0.001), (0, 3, 1, -0.0005), (0, 7, 1, -0.0005), (0, 17, 2, -0.0005)
            ]),
            ('wink', [
                (0, 11, 1, 0.001), (0, 13, 1, -0.0003), (0, 17, 0, 0.0003),
                (0, 17, 1, 0.0003), (0, 3, 1, -0.0003)
            ]),
            ('pupil_x', [
                (0, 11, 0, 0.0007 if params.get('pupil_x', 0) > 0 else 0.001),
                (0, 15, 0, 0.001 if params.get('pupil_x', 0) > 0 else 0.0007)
            ]),
            ('pupil_y', [
                (0, 11, 1, -0.001), (0, 15, 1, -0.001)
            ]),
            ('eyes', [
                (0, 11, 1, -0.001), (0, 13, 1, 0.0003), (0, 15, 1, -0.001), (0, 16, 1, 0.0003),
                (0, 1, 1, -0.00025), (0, 2, 1, 0.00025)
            ]),
            ('eyebrow', [
                (0, 1, 1, 0.001 if params.get('eyebrow', 0) > 0 else 0.0003),
                (0, 2, 1, -0.001 if params.get('eyebrow', 0) > 0 else -0.0003),
                (0, 1, 0, -0.001 if params.get('eyebrow', 0) <= 0 else 0),
                (0, 2, 0, 0.001 if params.get('eyebrow', 0) <= 0 else 0)
            ])
        ]

        for param_name, adjustments in modifications:
            param_value = params.get(param_name, 0)
            for i, j, k, factor in adjustments:
                x_d_new[i, j, k] += param_value * factor

        # Special case for pupil_y affecting eyes
        x_d_new[0, 11, 1] -= params.get('pupil_y', 0) * 0.001
        x_d_new[0, 15, 1] -= params.get('pupil_y', 0) * 0.001
        params['eyes'] = params.get('eyes', 0) - params.get('pupil_y', 0) / 2.

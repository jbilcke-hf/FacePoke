import uuid
import logging
import hashlib
import os
import io
import asyncio
from async_lru import alru_cache
import base64
from queue import Queue
from typing import Dict, Any, List, Optional, Union
from functools import lru_cache
import numpy as np
import torch
import torch.nn.functional as F
from PIL import Image, ImageOps

from liveportrait.config.argument_config import ArgumentConfig
from liveportrait.utils.camera import get_rotation_matrix
from liveportrait.utils.io import resize_to_limit
from liveportrait.utils.crop import prepare_paste_back, paste_back, parse_bbox_from_landmark

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

        self.processed_cache = {}  # Stores the processed image data

        logger.info("✅ FacePoke Engine initialized successfully.")

    @alru_cache(maxsize=512)
    async def load_image(self, data):
        image = Image.open(io.BytesIO(data))

        # keep the exif orientation (fix the selfie issue on iphone)
        image = ImageOps.exif_transpose(image)

        # Convert the image to RGB mode (removes alpha channel if present)
        image = image.convert('RGB')

        uid = str(uuid.uuid4())
        img_rgb = np.array(image)

        inference_cfg = self.live_portrait.live_portrait_wrapper.cfg
        img_rgb = await asyncio.to_thread(resize_to_limit, img_rgb, inference_cfg.ref_max_shape, inference_cfg.ref_shape_n)
        crop_info = await asyncio.to_thread(self.live_portrait.cropper.crop_single_image, img_rgb)
        img_crop_256x256 = crop_info['img_crop_256x256']

        I_s = await asyncio.to_thread(self.live_portrait.live_portrait_wrapper.prepare_source, img_crop_256x256)
        x_s_info = await asyncio.to_thread(self.live_portrait.live_portrait_wrapper.get_kp_info, I_s)
        f_s = await asyncio.to_thread(self.live_portrait.live_portrait_wrapper.extract_feature_3d, I_s)
        x_s = await asyncio.to_thread(self.live_portrait.live_portrait_wrapper.transform_keypoint, x_s_info)

        processed_data = {
            'img_rgb': img_rgb,
            'crop_info': crop_info,
            'x_s_info': x_s_info,
            'f_s': f_s,
            'x_s': x_s,
            'inference_cfg': inference_cfg
        }

        self.processed_cache[uid] = processed_data

        # Calculate the bounding box
        bbox_info = parse_bbox_from_landmark(processed_data['crop_info']['lmk_crop'], scale=1.0)

        return {
            'u': uid,

            # those aren't easy to serialize
            'c': bbox_info['center'], # 2x1
            's': bbox_info['size'], # scalar
            'b': bbox_info['bbox'],  # 4x2
            'a': bbox_info['angle'],  # rad, counterclockwise
            # 'bbox_rot': bbox_info['bbox_rot'].toList(),  # 4x2
        }

    async def transform_image(self, uid: str, params: Dict[str, float]) -> bytes:
        # If we don't have the image in cache yet, add it
        if uid not in self.processed_cache:
            raise ValueError("cache miss")

        processed_data = self.processed_cache[uid]

        try:
            # Apply modifications based on params
            x_d_new = processed_data['x_s_info']['kp'].clone()

            # Adapted from https://github.com/PowerHouseMan/ComfyUI-AdvancedLivePortrait/blob/main/nodes.py#L408-L472
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
                ]),
                # Some other ones: https://github.com/jbilcke-hf/FacePoke/issues/22#issuecomment-2408708028
                # Still need to check how exactly we would control those in the UI,
                # as we don't have yet segmentation in the frontend UI for those body parts
                #('lower_lip', [
                #    (0, 19, 1, 0.02)
                #]),
                #('upper_lip', [
                #    (0, 20, 1, -0.01)
                #]),
                #('neck', [(0, 5, 1, 0.01)]),
            ]

            for param_name, adjustments in modifications:
                param_value = params.get(param_name, 0)
                for i, j, k, factor in adjustments:
                    x_d_new[i, j, k] += param_value * factor

            # Special case for pupil_y affecting eyes
            x_d_new[0, 11, 1] -= params.get('pupil_y', 0) * 0.001
            x_d_new[0, 15, 1] -= params.get('pupil_y', 0) * 0.001
            params['eyes'] = params.get('eyes', 0) - params.get('pupil_y', 0) / 2.


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
            I_p = await asyncio.to_thread(self.live_portrait.live_portrait_wrapper.parse_output, out['out'])

            buffered = io.BytesIO()

            ####################################################
            # this part is about stitching the image back into the original.
            #
            # this is an expensive operation, not just because of the compute
            # but because the payload will also be bigger (we send back the whole pic)
            #
            # I'm currently running some experiments to do it in the frontend
            #
            #  --- old way: we do it in the server-side: ---
            mask_ori = await asyncio.to_thread(prepare_paste_back,
                processed_data['inference_cfg'].mask_crop, processed_data['crop_info']['M_c2o'],
                dsize=(processed_data['img_rgb'].shape[1], processed_data['img_rgb'].shape[0])
            )
            I_p_to_ori_blend = await asyncio.to_thread(paste_back,
                I_p[0], processed_data['crop_info']['M_c2o'], processed_data['img_rgb'], mask_ori
            )
            result_image = Image.fromarray(I_p_to_ori_blend)

            # --- maybe future way: do it in the frontend: ---
            #result_image = Image.fromarray(I_p[0])
            ####################################################

            # write it into a webp
            result_image.save(buffered, format="WebP", quality=82, lossless=False, method=6)

            return buffered.getvalue()

        except Exception as e:
            raise ValueError(f"Failed to modify image: {str(e)}")

import os
import logging
import torch
import asyncio
import aiohttp
import requests
from huggingface_hub import hf_hub_download
import sentencepiece


# Configure logging
logging.basicConfig(level=logging.DEBUG, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Configuration
DATA_ROOT = os.environ.get('DATA_ROOT', '/tmp/data')
MODELS_DIR = os.path.join(DATA_ROOT, "models")
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# Hugging Face repository information
HF_REPO_ID = "jbilcke-hf/model-cocktail"

# Model files to download
MODEL_FILES = [
    "dwpose/dw-ll_ucoco_384.pth",
    "face-detector/s3fd-619a316812.pth",
    "liveportrait/spade_generator.pth",
    "liveportrait/warping_module.pth",
    "liveportrait/motion_extractor.pth",
    "liveportrait/stitching_retargeting_module.pth",
    "liveportrait/appearance_feature_extractor.pth",
    "liveportrait/landmark.onnx",

    # this is a hack, instead we should probably try to
    # fix liveportrait/utils/dependencies/insightface/utils/storage.py
    "insightface/models/buffalo_l.zip",

    "insightface/buffalo_l/det_10g.onnx",
    "insightface/buffalo_l/2d106det.onnx",
    "sd-vae-ft-mse/diffusion_pytorch_model.bin",
    "sd-vae-ft-mse/diffusion_pytorch_model.safetensors",
    "sd-vae-ft-mse/config.json",

    # we don't use those yet
    #"flux-dev/flux-dev-fp8.safetensors",
    #"flux-dev/flux_dev_quantization_map.json",
    #"pulid-flux/pulid_flux_v0.9.0.safetensors",
    #"pulid-flux/pulid_v1.bin"
]

def create_directory(directory):
    """Create a directory if it doesn't exist and log its status."""
    if not os.path.exists(directory):
        os.makedirs(directory)
        logger.info(f"  Directory created: {directory}")
    else:
        logger.info(f"  Directory already exists: {directory}")

def print_directory_structure(startpath):
    """Print the directory structure starting from the given path."""
    for root, dirs, files in os.walk(startpath):
        level = root.replace(startpath, '').count(os.sep)
        indent = ' ' * 4 * level
        logger.info(f"{indent}{os.path.basename(root)}/")
        subindent = ' ' * 4 * (level + 1)
        for f in files:
            logger.info(f"{subindent}{f}")

async def download_hf_file(filename: str) -> None:
    """Download a file from Hugging Face to the models directory."""
    dest = os.path.join(MODELS_DIR, filename)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    if os.path.exists(dest):
        # this is really for debugging purposes only
        logger.debug(f"    ✅ {filename}")
        return

    logger.info(f"    ⏳ Downloading {HF_REPO_ID}/{filename}")

    try:
        await asyncio.get_event_loop().run_in_executor(
            None,
            lambda: hf_hub_download(
                repo_id=HF_REPO_ID,
                filename=filename,
                local_dir=MODELS_DIR
            )
        )
        logger.info(f"    ✅ Downloaded {filename}")
    except Exception as e:
        logger.error(f"🚨 Error downloading file from Hugging Face: {e}")
        if os.path.exists(dest):
            os.remove(dest)
        raise

async def download_all_models():
    """Download all required models from the Hugging Face repository."""
    logger.info("  🔎 Looking for models...")
    tasks = [download_hf_file(filename) for filename in MODEL_FILES]
    await asyncio.gather(*tasks)
    logger.info("  ✅ All models are available")

    # are you looking to debug the app and verify that models are downloaded properly?
    # then un-comment the two following lines:
    #logger.info("💡 Printing directory structure of models:")
    #print_directory_structure(MODELS_DIR)

class ModelLoader:
    """A class responsible for loading and initializing all required models."""

    def __init__(self):
        self.device = DEVICE
        self.models_dir = MODELS_DIR

    async def load_live_portrait(self):
        """Load LivePortrait models."""
        from liveportrait.config.inference_config import InferenceConfig
        from liveportrait.config.crop_config import CropConfig
        from liveportrait.live_portrait_pipeline import LivePortraitPipeline

        logger.info("  ⏳ Loading LivePortrait models...")
        live_portrait_pipeline = await asyncio.to_thread(
            LivePortraitPipeline,
            inference_cfg=InferenceConfig(
                # default values
                flag_stitching=True,  # we recommend setting it to True!
                flag_relative=True,  # whether to use relative motion
                flag_pasteback=True,  # whether to paste-back/stitch the animated face cropping from the face-cropping space to the original image space
                flag_do_crop= True,  # whether to crop the source portrait to the face-cropping space
                flag_do_rot=True,  # whether to conduct the rotation when flag_do_crop is True
            ),
            crop_cfg=CropConfig()
        )
        logger.info("  ✅ LivePortrait models loaded successfully.")
        return live_portrait_pipeline

async def initialize_models():
    """Initialize and load all required models."""
    logger.info("🚀 Starting model initialization...")

    # Ensure all required models are downloaded
    await download_all_models()

    # Initialize the ModelLoader
    loader = ModelLoader()

    # Load LivePortrait models
    live_portrait = await loader.load_live_portrait()

    logger.info("✅ Model initialization completed.")
    return live_portrait

# Initial setup
logger.info("🚀 Setting up storage directories...")
create_directory(MODELS_DIR)
logger.info("✅ Storage directories setup completed.")

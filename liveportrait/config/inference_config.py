# coding: utf-8

"""
config dataclass used for inference
"""

import os
import os.path as osp
from dataclasses import dataclass
from typing import Literal, Tuple
from .base_config import PrintableConfig, make_abs_path

# Configuration
DATA_ROOT = os.environ.get('DATA_ROOT', '/tmp/data')
MODELS_DIR = os.path.join(DATA_ROOT, "models")

@dataclass(repr=False)  # use repr from PrintableConfig
class InferenceConfig(PrintableConfig):
    models_config: str = make_abs_path('./models.yaml')  # portrait animation config
    checkpoint_F = os.path.join(MODELS_DIR, "liveportrait", "appearance_feature_extractor.pth")
    checkpoint_M = os.path.join(MODELS_DIR, "liveportrait", "motion_extractor.pth")
    checkpoint_W = os.path.join(MODELS_DIR, "liveportrait", "warping_module.pth")
    checkpoint_G = os.path.join(MODELS_DIR, "liveportrait", "spade_generator.pth")
    checkpoint_S = os.path.join(MODELS_DIR, "liveportrait", "stitching_retargeting_module.pth")

    flag_use_half_precision: bool = True  # whether to use half precision

    flag_lip_zero: bool = True  # whether let the lip to close state before animation, only take effect when flag_eye_retargeting and flag_lip_retargeting is False
    lip_zero_threshold: float = 0.03

    flag_eye_retargeting: bool = False
    flag_lip_retargeting: bool = False
    flag_stitching: bool = True  # we recommend setting it to True!

    flag_relative: bool = True  # whether to use relative motion
    anchor_frame: int = 0  # set this value if find_best_frame is True

    input_shape: Tuple[int, int] = (256, 256)  # input shape
    output_format: Literal['mp4', 'gif'] = 'mp4'  # output video format
    output_fps: int = 25  # MuseTalk prefers 25 fps, so we use 25 as default fps for output video
    crf: int = 15  # crf for output video

    flag_write_result: bool = True  # whether to write output video
    flag_pasteback: bool = True  # whether to paste-back/stitch the animated face cropping from the face-cropping space to the original image space
    mask_crop = None
    flag_write_gif: bool = False
    size_gif: int = 256
    ref_max_shape: int = 1280
    ref_shape_n: int = 2

    device_id: int = 0
    flag_do_crop: bool = False  # whether to crop the source portrait to the face-cropping space
    flag_do_rot: bool = True  # whether to conduct the rotation when flag_do_crop is True

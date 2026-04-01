"""Model-specific image preprocessing and deprocessing."""

from __future__ import annotations

from typing import Literal

import torch
from torchvision import transforms

PreprocessingMode = Literal["imagenet", "inception", "none"]

# TF Keras convention for MobileNetV2/InceptionV3: [-1, 1]
INCEPTION_TRANSFORM = transforms.Compose([
    transforms.ToTensor(),  # [0, 255] → [0, 1]
    transforms.Normalize(mean=[0.5, 0.5, 0.5], std=[0.5, 0.5, 0.5]),  # → [-1, 1]
])

# PyTorch/ImageNet convention for VGG19
IMAGENET_TRANSFORM = transforms.Compose([
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
])


def get_transform(mode: PreprocessingMode) -> transforms.Compose:
    if mode == "inception":
        return INCEPTION_TRANSFORM
    elif mode == "imagenet":
        return IMAGENET_TRANSFORM
    else:
        return transforms.Compose([transforms.ToTensor()])


def deprocess(tensor: torch.Tensor, mode: PreprocessingMode) -> torch.Tensor:
    """Reverse preprocessing to get [0, 1] range tensor for display."""
    if mode == "inception":
        return tensor.mul(0.5).add(0.5).clamp(0, 1)
    elif mode == "imagenet":
        mean = torch.tensor([0.485, 0.456, 0.406], device=tensor.device).view(3, 1, 1)
        std = torch.tensor([0.229, 0.224, 0.225], device=tensor.device).view(3, 1, 1)
        return tensor.mul(std).add(mean).clamp(0, 1)
    else:
        return tensor.clamp(0, 1)

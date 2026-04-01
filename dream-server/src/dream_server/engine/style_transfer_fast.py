"""PyTorch AdaIN arbitrary style transfer engine (Huang & Belongie 2017).

Single forward pass — no iterative optimization. Resolution-agnostic.
Network definitions adapted from naoto0804/pytorch-AdaIN (MIT license).
"""

from __future__ import annotations

import io
from pathlib import Path

import torch
import torch.nn as nn
from PIL import Image
from torchvision import transforms

# ---------------------------------------------------------------------------
# Network architecture (from naoto0804/pytorch-AdaIN net.py)
# ---------------------------------------------------------------------------

decoder = nn.Sequential(
    nn.ReflectionPad2d((1, 1, 1, 1)),
    nn.Conv2d(512, 256, (3, 3)),
    nn.ReLU(),
    nn.Upsample(scale_factor=2, mode="nearest"),
    nn.ReflectionPad2d((1, 1, 1, 1)),
    nn.Conv2d(256, 256, (3, 3)),
    nn.ReLU(),
    nn.ReflectionPad2d((1, 1, 1, 1)),
    nn.Conv2d(256, 256, (3, 3)),
    nn.ReLU(),
    nn.ReflectionPad2d((1, 1, 1, 1)),
    nn.Conv2d(256, 256, (3, 3)),
    nn.ReLU(),
    nn.ReflectionPad2d((1, 1, 1, 1)),
    nn.Conv2d(256, 128, (3, 3)),
    nn.ReLU(),
    nn.Upsample(scale_factor=2, mode="nearest"),
    nn.ReflectionPad2d((1, 1, 1, 1)),
    nn.Conv2d(128, 128, (3, 3)),
    nn.ReLU(),
    nn.ReflectionPad2d((1, 1, 1, 1)),
    nn.Conv2d(128, 64, (3, 3)),
    nn.ReLU(),
    nn.Upsample(scale_factor=2, mode="nearest"),
    nn.ReflectionPad2d((1, 1, 1, 1)),
    nn.Conv2d(64, 64, (3, 3)),
    nn.ReLU(),
    nn.ReflectionPad2d((1, 1, 1, 1)),
    nn.Conv2d(64, 3, (3, 3)),
)

vgg = nn.Sequential(
    nn.Conv2d(3, 3, (1, 1)),
    nn.ReflectionPad2d((1, 1, 1, 1)),
    nn.Conv2d(3, 64, (3, 3)),
    nn.ReLU(),  # relu1-1
    nn.ReflectionPad2d((1, 1, 1, 1)),
    nn.Conv2d(64, 64, (3, 3)),
    nn.ReLU(),  # relu1-2
    nn.MaxPool2d((2, 2), (2, 2), (0, 0), ceil_mode=True),
    nn.ReflectionPad2d((1, 1, 1, 1)),
    nn.Conv2d(64, 128, (3, 3)),
    nn.ReLU(),  # relu2-1
    nn.ReflectionPad2d((1, 1, 1, 1)),
    nn.Conv2d(128, 128, (3, 3)),
    nn.ReLU(),  # relu2-2
    nn.MaxPool2d((2, 2), (2, 2), (0, 0), ceil_mode=True),
    nn.ReflectionPad2d((1, 1, 1, 1)),
    nn.Conv2d(128, 256, (3, 3)),
    nn.ReLU(),  # relu3-1
    nn.ReflectionPad2d((1, 1, 1, 1)),
    nn.Conv2d(256, 256, (3, 3)),
    nn.ReLU(),  # relu3-2
    nn.ReflectionPad2d((1, 1, 1, 1)),
    nn.Conv2d(256, 256, (3, 3)),
    nn.ReLU(),  # relu3-3
    nn.ReflectionPad2d((1, 1, 1, 1)),
    nn.Conv2d(256, 256, (3, 3)),
    nn.ReLU(),  # relu3-4
    nn.MaxPool2d((2, 2), (2, 2), (0, 0), ceil_mode=True),
    nn.ReflectionPad2d((1, 1, 1, 1)),
    nn.Conv2d(256, 512, (3, 3)),
    nn.ReLU(),  # relu4-1 — last layer used for AdaIN
)


# ---------------------------------------------------------------------------
# AdaIN core
# ---------------------------------------------------------------------------


def calc_mean_std(feat: torch.Tensor, eps: float = 1e-5) -> tuple[torch.Tensor, torch.Tensor]:
    n, c = feat.size()[:2]
    feat_var = feat.view(n, c, -1).var(dim=2) + eps
    feat_std = feat_var.sqrt().view(n, c, 1, 1)
    feat_mean = feat.view(n, c, -1).mean(dim=2).view(n, c, 1, 1)
    return feat_mean, feat_std


def adaptive_instance_normalization(
    content_feat: torch.Tensor, style_feat: torch.Tensor
) -> torch.Tensor:
    size = content_feat.size()
    style_mean, style_std = calc_mean_std(style_feat)
    content_mean, content_std = calc_mean_std(content_feat)
    normalized = (content_feat - content_mean.expand(size)) / content_std.expand(size)
    return normalized * style_std.expand(size) + style_mean.expand(size)


# ---------------------------------------------------------------------------
# Model building
# ---------------------------------------------------------------------------


def build_encoder(weights_path: Path, device: torch.device) -> nn.Module:
    """Load VGG encoder (up to relu4-1) from vgg_normalised.pth."""
    encoder = nn.Sequential(*list(vgg.children())[:31])  # up to relu4-1
    # The weights file has the full VGG19; strict=False ignores extra keys
    full_state = torch.load(weights_path, map_location="cpu", weights_only=True)
    encoder_keys = set(encoder.state_dict().keys())
    filtered = {k: v for k, v in full_state.items() if k in encoder_keys}
    encoder.load_state_dict(filtered)
    return encoder.to(device).eval()


def build_decoder(weights_path: Path, device: torch.device) -> nn.Module:
    """Load AdaIN decoder from decoder.pth."""
    dec = decoder
    dec.load_state_dict(torch.load(weights_path, map_location="cpu", weights_only=True))
    return dec.to(device).eval()


# ---------------------------------------------------------------------------
# Inference
# ---------------------------------------------------------------------------


@torch.no_grad()
def fast_style_transfer(
    encoder: nn.Module,
    dec: nn.Module,
    content_tensor: torch.Tensor,
    style_tensor: torch.Tensor,
    alpha: float,
    device: torch.device,
) -> torch.Tensor:
    """Single-pass arbitrary style transfer via AdaIN.

    Args:
        encoder: VGG encoder (up to relu4-1).
        dec: AdaIN decoder.
        content_tensor: [3, H, W] in [0, 1].
        style_tensor: [3, H, W] in [0, 1].
        alpha: Stylization strength [0, 1].
        device: Compute device.

    Returns:
        [3, H, W] tensor in [0, 1].
    """
    # Input must be [0, 255] for this encoder (normalization is baked in)
    content = (content_tensor * 255).unsqueeze(0).to(device)
    style = (style_tensor * 255).unsqueeze(0).to(device)

    content_feat = encoder(content)
    style_feat = encoder(style)

    t = adaptive_instance_normalization(content_feat, style_feat)
    t = alpha * t + (1 - alpha) * content_feat

    output = dec(t)
    # Back to [0, 1]
    return output.squeeze(0).clamp(0, 255).div(255)


def result_to_png(tensor: torch.Tensor) -> bytes:
    """Convert a [0, 1] result tensor to PNG bytes."""
    img = transforms.ToPILImage()(tensor.cpu().clamp(0, 1))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()

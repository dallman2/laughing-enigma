"""PyTorch optimization-based style transfer engine (Gatys et al. 2015)."""

from __future__ import annotations

import io
from collections.abc import Callable
from dataclasses import dataclass

import torch
import torch.nn.functional as F
from PIL import Image
from torchvision import transforms

from .deep_dream import HookCapture
from .preprocessing import PreprocessingMode, deprocess


@dataclass
class StyleTransferConfig:
    iterations: int = 500
    learning_rate: float = 0.01
    content_weight: float = 1
    style_weight: float = 1e5
    style_layer_weights: list[float] | None = None
    tv_weight: float = 1e-4


StyleProgressCallback = Callable[[int, float, float, float, float, bytes], None]


def gram_matrix(tensor: torch.Tensor) -> torch.Tensor:
    """Compute the Gram matrix of a feature map.

    Input shape: (C, H, W) or (1, C, H, W)
    Output shape: (C, C)
    """
    if tensor.dim() == 4:
        tensor = tensor.squeeze(0)
    c, h, w = tensor.shape
    features = tensor.view(c, h * w)
    gram = features.mm(features.t())
    return gram / (h * w)


def total_variation(image: torch.Tensor) -> torch.Tensor:
    """Total variation loss for spatial smoothness."""
    dx = image[:, :, :-1] - image[:, :, 1:]
    dy = image[:, :-1, :] - image[:, 1:, :]
    return dx.square().mean() + dy.square().mean()


def tensor_to_png(tensor: torch.Tensor, mode: PreprocessingMode) -> bytes:
    """Convert a preprocessed tensor to lossless PNG bytes for WebSocket streaming."""
    display = deprocess(tensor.detach().cpu(), mode)
    img = transforms.ToPILImage()(display.clamp(0, 1))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def style_transfer_optimize(
    model: torch.nn.Module,
    content_image: torch.Tensor,
    style_image: torch.Tensor,
    content_layer_modules: list[torch.nn.Module],
    style_layer_modules: list[torch.nn.Module],
    config: StyleTransferConfig,
    device: torch.device,
    preprocessing_mode: PreprocessingMode,
    on_progress: StyleProgressCallback | None = None,
    should_stop: Callable[[], bool] | None = None,
) -> torch.Tensor:
    """Run optimization-based style transfer (Gatys et al. 2015).

    Uses Adam optimizer on the generated image, minimizing a combination
    of content loss, style loss, and total variation loss.
    """
    # Register hooks on content and style layers
    content_hooks = HookCapture()
    style_hooks = HookCapture()

    for module in content_layer_modules:
        content_hooks.register(module)
    for module in style_layer_modules:
        style_hooks.register(module)

    try:
        # Pre-compute content targets
        content_hooks.clear()
        model(content_image.unsqueeze(0).to(device))
        content_targets = [a.detach().clone() for a in content_hooks.activations]

        # Pre-compute style Gram matrix targets
        style_hooks.clear()
        model(style_image.unsqueeze(0).to(device))
        style_gram_targets = [
            gram_matrix(a.detach().clone()) for a in style_hooks.activations
        ]

        # Initialize generated image as clone of content
        generated = content_image.clone().to(device).requires_grad_(True)
        optimizer = torch.optim.Adam([generated], lr=config.learning_rate)

        for iteration in range(config.iterations):
            if should_stop and should_stop():
                break

            optimizer.zero_grad()

            # Forward pass
            content_hooks.clear()
            style_hooks.clear()
            model(generated.unsqueeze(0))

            # Content loss
            c_loss = torch.tensor(0.0, device=device)
            for act, target in zip(content_hooks.activations, content_targets):
                c_loss = c_loss + F.mse_loss(act, target)

            # Style loss (weighted per layer)
            layer_weights = config.style_layer_weights or [
                1.0 / len(style_gram_targets)
            ] * len(style_gram_targets)
            s_loss = torch.tensor(0.0, device=device)
            for act, gram_target, lw in zip(
                style_hooks.activations, style_gram_targets, layer_weights
            ):
                gram = gram_matrix(act)
                s_loss = s_loss + F.mse_loss(gram, gram_target) * lw

            # TV loss
            tv_loss = total_variation(generated)

            # Total loss
            total_loss = (
                config.content_weight * c_loss
                + config.style_weight * s_loss
                + config.tv_weight * tv_loss
            )

            total_loss.backward()
            optimizer.step()

            # Clamp to valid range (imagenet preprocessing range)
            with torch.no_grad():
                generated.clamp_(-2.12, 2.64)

            # Report progress
            if on_progress and iteration % 10 == 0:
                jpeg = tensor_to_png(generated, preprocessing_mode)
                on_progress(
                    iteration,
                    c_loss.item(),
                    s_loss.item(),
                    tv_loss.item(),
                    total_loss.item(),
                    jpeg,
                )

    finally:
        content_hooks.remove_all()
        style_hooks.remove_all()

    return generated.detach()

"""PyTorch Deep Dream engine with octave processing."""

from __future__ import annotations

import io
from collections.abc import Callable
from dataclasses import dataclass

import torch
from PIL import Image
from torchvision import transforms

from .preprocessing import PreprocessingMode, deprocess


@dataclass
class DreamConfig:
    step_size: float = 0.01
    num_octaves: int = 3
    octave_scale: float = 1.3
    steps_per_octave: int = 20
    max_loss: float | None = None


ProgressCallback = Callable[[int, int, float, bytes], None]


class HookCapture:
    """Captures intermediate layer activations via forward hooks."""

    def __init__(self) -> None:
        self.activations: list[torch.Tensor] = []
        self._hooks: list[torch.utils.hooks.RemovableHook] = []

    def register(self, module: torch.nn.Module) -> None:
        hook = module.register_forward_hook(self._hook_fn)
        self._hooks.append(hook)

    def _hook_fn(
        self,
        _module: torch.nn.Module,
        _input: tuple[torch.Tensor, ...],
        output: torch.Tensor,
    ) -> None:
        self.activations.append(output)

    def clear(self) -> None:
        self.activations = []

    def remove_all(self) -> None:
        for hook in self._hooks:
            hook.remove()
        self._hooks = []


def gradient_ascent_step(
    image: torch.Tensor,
    model: torch.nn.Module,
    hooks: HookCapture,
    step_size: float,
) -> float:
    """Single gradient ascent step. Returns the loss value."""
    image.requires_grad_(True)
    if image.grad is not None:
        image.grad.zero_()

    hooks.clear()
    model(image.unsqueeze(0))

    loss = sum(act.mean() for act in hooks.activations)
    assert isinstance(loss, torch.Tensor)
    loss.backward()

    grad = image.grad
    assert grad is not None
    # Normalize gradient by std
    grad_data = grad / (grad.std() + 1e-8)
    image.data.add_(grad_data * step_size)
    image.data.clamp_(-1, 1)
    image.requires_grad_(False)

    return loss.item()


def tensor_to_png(tensor: torch.Tensor, mode: PreprocessingMode) -> bytes:
    """Convert a preprocessed tensor to lossless PNG bytes for WebSocket streaming."""
    display = deprocess(tensor.detach().cpu(), mode)
    img = transforms.ToPILImage()(display)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def deep_dream_with_octaves(
    model: torch.nn.Module,
    image: torch.Tensor,
    layer_modules: list[torch.nn.Module],
    config: DreamConfig,
    device: torch.device,
    preprocessing_mode: PreprocessingMode,
    on_progress: ProgressCallback | None = None,
    should_stop: Callable[[], bool] | None = None,
) -> torch.Tensor:
    """Run deep dream with multi-scale octave processing.

    Args:
        model: The feature extractor model (eval mode, no grad on weights).
        image: Input image tensor (C, H, W) in preprocessed range.
        layer_modules: List of nn.Module layers to capture activations from.
        config: Dream parameters.
        device: Compute device (mps, cuda, cpu).
        preprocessing_mode: How image was preprocessed (for deprocessing during preview).
        on_progress: Called with (octave, step, loss, jpeg_bytes) for live preview.
        should_stop: Called each step; return True to abort.

    Returns:
        The dreamed image tensor.
    """
    hooks = HookCapture()
    for module in layer_modules:
        hooks.register(module)

    _, orig_h, orig_w = image.shape
    print(f"[deep_dream] input: {image.shape}, octaves: {config.num_octaves}, steps/octave: {config.steps_per_octave}")

    # Compute octave shapes (smallest → largest)
    shapes: list[tuple[int, int]] = []
    for i in range(config.num_octaves - 1, -1, -1):
        scale = config.octave_scale**i
        shapes.append((round(orig_h / scale), round(orig_w / scale)))
    print(f"[deep_dream] octave shapes: {shapes}")

    img = image.clone().to(device)
    shrunk_original = torch.nn.functional.interpolate(
        image.unsqueeze(0), size=shapes[0], mode="bilinear", align_corners=False
    ).squeeze(0).to(device)

    try:
        for octave, (h, w) in enumerate(shapes):
            if should_stop and should_stop():
                break
            print(f"[deep_dream] octave {octave}: {h}x{w}")

            # Resize to octave scale
            img = torch.nn.functional.interpolate(
                img.unsqueeze(0), size=(h, w), mode="bilinear", align_corners=False
            ).squeeze(0)

            for step in range(config.steps_per_octave):
                if should_stop and should_stop():
                    break

                loss = gradient_ascent_step(img, model, hooks, config.step_size)

                if config.max_loss and loss > config.max_loss:
                    break

                if on_progress and step % 5 == 0:
                    jpeg = tensor_to_png(img, preprocessing_mode)
                    on_progress(octave, step, loss, jpeg)

            # Reinject lost detail
            if octave < len(shapes) - 1:
                upscaled_shrunk = torch.nn.functional.interpolate(
                    shrunk_original.unsqueeze(0), size=(h, w),
                    mode="bilinear", align_corners=False,
                ).squeeze(0)
                same_size_original = torch.nn.functional.interpolate(
                    image.unsqueeze(0).to(device), size=(h, w),
                    mode="bilinear", align_corners=False,
                ).squeeze(0)
                lost_detail = same_size_original - upscaled_shrunk
                img = img + lost_detail

                shrunk_original = torch.nn.functional.interpolate(
                    image.unsqueeze(0).to(device), size=shapes[octave + 1],
                    mode="bilinear", align_corners=False,
                ).squeeze(0)
    finally:
        hooks.remove_all()

    return img

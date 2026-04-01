"""WebSocket message types shared between client and server.

Mirrors src/dream/server/protocol.ts in the frontend.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal


# --- Client → Server messages ---


@dataclass
class DreamParams:
    step_size: float = 0.01
    num_octaves: int = 3
    octave_scale: float = 1.3
    steps_per_octave: int = 20
    max_loss: float | None = None


@dataclass
class StartDreamMessage:
    type: Literal["start_dream"] = "start_dream"
    model_id: str = "mobilenet_v2"
    layers: list[str] = field(default_factory=list)
    image: str = ""  # base64 JPEG
    params: DreamParams = field(default_factory=DreamParams)


@dataclass
class StyleTransferParams:
    iterations: int = 500
    learning_rate: float = 0.01
    content_weight: float = 1
    style_weight: float = 1e5
    tv_weight: float = 1e-4


@dataclass
class StartStyleTransferMessage:
    type: Literal["start_style_transfer"] = "start_style_transfer"
    model_id: str = "vgg19"
    content_image: str = ""  # base64 JPEG
    style_image: str = ""  # base64 JPEG
    content_layers: list[str] = field(default_factory=list)
    style_layers: list[str] = field(default_factory=list)
    params: StyleTransferParams = field(default_factory=StyleTransferParams)


@dataclass
class FastStyleTransferParams:
    alpha: float = 1.0


@dataclass
class StartFastStyleTransferMessage:
    type: Literal["start_fast_style_transfer"] = "start_fast_style_transfer"
    content_image: str = ""  # base64 JPEG/PNG
    style_image: str = ""  # base64 JPEG/PNG
    params: FastStyleTransferParams = field(default_factory=FastStyleTransferParams)


@dataclass
class PauseMessage:
    type: Literal["pause"] = "pause"


@dataclass
class ResumeMessage:
    type: Literal["resume"] = "resume"


@dataclass
class StopMessage:
    type: Literal["stop"] = "stop"


# --- Server → Client messages ---


@dataclass
class ProgressMessage:
    type: Literal["progress"] = "progress"
    octave: int = 0
    step: int = 0
    loss: float = 0.0


@dataclass
class StyleProgressMessage:
    type: Literal["style_progress"] = "style_progress"
    iteration: int = 0
    content_loss: float = 0.0
    style_loss: float = 0.0
    tv_loss: float = 0.0
    total_loss: float = 0.0


@dataclass
class CompleteMessage:
    type: Literal["complete"] = "complete"


@dataclass
class ErrorMessage:
    type: Literal["error"] = "error"
    message: str = ""

"""FastAPI server — REST endpoints + WebSocket for dream streaming."""

from __future__ import annotations

import asyncio
import base64
import io
import json
import threading
from pathlib import Path
from typing import Any

import torch
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
from torchvision import transforms

from .engine.deep_dream import DreamConfig, deep_dream_with_octaves, tensor_to_png
from .engine.preprocessing import get_transform
from .engine.style_transfer import StyleTransferConfig, style_transfer_optimize
from .engine.style_transfer import tensor_to_png as style_tensor_to_png
from .engine.style_transfer_fast import fast_style_transfer, result_to_png
from .models.loader import get_layer_info, get_layer_modules, load_adain_models, load_model
from .models.registry import REGISTRY, get_entry
from .proxy import router as proxy_router

WEIGHTS_DIR = Path(__file__).resolve().parent.parent.parent / "weights"

# Auto-detect compute device
if torch.backends.mps.is_available():
    DEVICE = torch.device("mps")
elif torch.cuda.is_available():
    DEVICE = torch.device("cuda")
else:
    DEVICE = torch.device("cpu")

app = FastAPI(title="Dream Server", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(proxy_router)


@app.get("/health")
async def health() -> dict[str, Any]:
    capabilities = ["dream", "style_transfer_optim"]
    if (WEIGHTS_DIR / "decoder.pth").exists() and (
        WEIGHTS_DIR / "vgg_normalised.pth"
    ).exists():
        capabilities.append("style_transfer_fast")
    return {"status": "ok", "device": str(DEVICE), "capabilities": capabilities}


@app.get("/api/models")
async def list_models() -> list[dict[str, Any]]:
    return [
        {
            "id": entry.id,
            "name": entry.name,
            "input_size": list(entry.input_size),
            "dream_layers": entry.dream_layers,
        }
        for entry in REGISTRY
    ]


@app.get("/api/model-info/{model_id}")
async def model_info(model_id: str) -> dict[str, Any]:
    entry = get_entry(model_id)
    if entry is None:
        return {"error": f"Unknown model: {model_id}"}

    model = load_model(model_id, DEVICE)
    layers = get_layer_info(model)

    return {
        "model_id": model_id,
        "name": entry.name,
        "input_size": list(entry.input_size),
        "dream_layers": entry.dream_layers,
        "layers": layers,
    }


@app.websocket("/ws/dream")
async def dream_websocket(ws: WebSocket) -> None:
    await ws.accept()

    stop_event = threading.Event()

    try:
        while True:
            data = await ws.receive_text()
            msg = json.loads(data)

            if msg["type"] == "stop":
                stop_event.set()
                continue

            if msg["type"] == "pause":
                stop_event.set()
                continue

            if msg["type"] == "start_style_transfer":
                stop_event.clear()
                await _handle_style_transfer(ws, msg, stop_event)
                continue

            if msg["type"] == "start_fast_style_transfer":
                stop_event.clear()
                await _handle_fast_style_transfer(ws, msg, stop_event)
                continue

            if msg["type"] != "start_dream":
                continue

            stop_event.clear()

            # Parse the dream request
            model_id: str = msg["model_id"]
            layer_names: list[str] = msg["layers"]
            image_b64: str = msg["image"]
            params = msg.get("params", {})

            entry = get_entry(model_id)
            if entry is None:
                await ws.send_text(
                    json.dumps({"type": "error", "message": f"Unknown model: {model_id}"})
                )
                continue

            # Decode image — use the resolution the client chose, not the registry default
            image_bytes = base64.b64decode(image_b64)
            pil_image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
            print(f"[dream] decoded image: {pil_image.size} ({len(image_bytes)} bytes)")

            transform = get_transform(entry.preprocessing)
            image_tensor = transform(pil_image).to(DEVICE)
            print(f"[dream] tensor shape: {image_tensor.shape}, device: {image_tensor.device}")

            # Load model and resolve layers using server-side PyTorch names
            # (client sends TF.js layer names which don't match PyTorch)
            model = load_model(model_id, DEVICE)
            layer_modules = get_layer_modules(model, entry.dream_layers)

            config = DreamConfig(
                step_size=params.get("step_size", 0.01),
                num_octaves=params.get("num_octaves", 3),
                octave_scale=params.get("octave_scale", 1.3),
                steps_per_octave=params.get("steps_per_octave", 20),
                max_loss=params.get("max_loss"),
            )

            loop = asyncio.get_event_loop()

            async def send_progress(
                octave: int, step: int, loss: float, jpeg: bytes
            ) -> None:
                try:
                    await ws.send_text(
                        json.dumps({
                            "type": "progress",
                            "octave": octave,
                            "step": step,
                            "loss": round(loss, 6),
                        })
                    )
                    await ws.send_bytes(jpeg)
                except Exception:
                    stop_event.set()

            def sync_progress(
                octave: int, step: int, loss: float, jpeg: bytes
            ) -> None:
                asyncio.run_coroutine_threadsafe(
                    send_progress(octave, step, loss, jpeg), loop
                )

            # Run dream in a thread to not block the event loop
            result = await loop.run_in_executor(
                None,
                lambda: deep_dream_with_octaves(
                    model=model,
                    image=image_tensor,
                    layer_modules=layer_modules,
                    config=config,
                    device=DEVICE,
                    preprocessing_mode=entry.preprocessing,
                    on_progress=sync_progress,
                    should_stop=stop_event.is_set,
                ),
            )

            # Send final frame
            final_jpeg = tensor_to_png(result, entry.preprocessing)
            await ws.send_bytes(final_jpeg)
            await ws.send_text(json.dumps({"type": "complete"}))

    except WebSocketDisconnect:
        stop_event.set()


async def _handle_style_transfer(
    ws: WebSocket, msg: dict[str, Any], stop_event: threading.Event
) -> None:
    """Handle a style transfer request over WebSocket."""
    model_id: str = msg["model_id"]
    content_b64: str = msg["content_image"]
    style_b64: str = msg["style_image"]
    content_layer_names: list[str] = msg["content_layers"]
    style_layer_names: list[str] = msg["style_layers"]
    params = msg.get("params", {})

    entry = get_entry(model_id)
    if entry is None:
        await ws.send_text(
            json.dumps({"type": "error", "message": f"Unknown model: {model_id}"})
        )
        return

    # Decode images — keep the resolution the client chose
    content_pil = Image.open(io.BytesIO(base64.b64decode(content_b64))).convert("RGB")
    style_pil = Image.open(io.BytesIO(base64.b64decode(style_b64))).convert("RGB")
    # Resize style to match content dimensions
    style_pil = style_pil.resize(content_pil.size)

    transform = get_transform(entry.preprocessing)
    content_tensor = transform(content_pil).to(DEVICE)
    style_tensor = transform(style_pil).to(DEVICE)

    # Load model and resolve layers
    model = load_model(model_id, DEVICE)
    # Use server-side PyTorch layer names from registry
    # (client sends TF.js layer names which don't match PyTorch)
    content_modules = get_layer_modules(model, entry.content_layers)
    style_modules = get_layer_modules(model, entry.style_layers)

    # Compute per-layer style weights from style_scale (0=fine, 1=coarse)
    import math
    style_scale = params.get("style_scale", 0.5)
    num_style = len(entry.style_layers)
    raw_weights = []
    for i in range(num_style):
        pos = i / (num_style - 1) if num_style > 1 else 0.5
        raw_weights.append(math.exp(-4 * (pos - style_scale) ** 2))
    weight_sum = sum(raw_weights)
    style_layer_weights = [w / weight_sum for w in raw_weights]

    config = StyleTransferConfig(
        iterations=params.get("iterations", 500),
        learning_rate=params.get("learning_rate", 0.01),
        content_weight=params.get("content_weight", 1),
        style_weight=params.get("style_weight", 1e5),
        tv_weight=params.get("tv_weight", 1e-4),
        style_layer_weights=style_layer_weights,
    )

    loop = asyncio.get_event_loop()

    async def send_style_progress(
        iteration: int,
        content_loss: float,
        style_loss: float,
        tv_loss: float,
        total_loss: float,
        jpeg: bytes,
    ) -> None:
        try:
            await ws.send_text(
                json.dumps({
                    "type": "style_progress",
                    "iteration": iteration,
                    "content_loss": round(content_loss, 6),
                    "style_loss": round(style_loss, 6),
                    "tv_loss": round(tv_loss, 6),
                    "total_loss": round(total_loss, 6),
                })
            )
            await ws.send_bytes(jpeg)
        except Exception:
            stop_event.set()

    def sync_style_progress(
        iteration: int,
        content_loss: float,
        style_loss: float,
        tv_loss: float,
        total_loss: float,
        jpeg: bytes,
    ) -> None:
        asyncio.run_coroutine_threadsafe(
            send_style_progress(
                iteration, content_loss, style_loss, tv_loss, total_loss, jpeg
            ),
            loop,
        )

    try:
        print(f"[style] starting optimization: {content_tensor.shape}, layers: content={entry.content_layers} style={entry.style_layers}")
        result = await loop.run_in_executor(
            None,
            lambda: style_transfer_optimize(
                model=model,
                content_image=content_tensor,
                style_image=style_tensor,
                content_layer_modules=content_modules,
                style_layer_modules=style_modules,
                config=config,
                device=DEVICE,
                preprocessing_mode=entry.preprocessing,
                on_progress=sync_style_progress,
                should_stop=stop_event.is_set,
            ),
        )
        print(f"[style] optimization complete, result shape: {result.shape}")

        final_png = style_tensor_to_png(result, entry.preprocessing)
        await ws.send_bytes(final_png)
    except Exception as e:
        print(f"[style] ERROR: {e}")
        import traceback
        traceback.print_exc()
        await ws.send_text(json.dumps({"type": "error", "message": str(e)}))

    await ws.send_text(json.dumps({"type": "complete"}))


async def _handle_fast_style_transfer(
    ws: WebSocket, msg: dict[str, Any], stop_event: threading.Event
) -> None:
    """Handle a fast (AdaIN) style transfer request over WebSocket."""
    content_b64: str = msg["content_image"]
    style_b64: str = msg["style_image"]
    params = msg.get("params", {})
    alpha = params.get("alpha", 1.0)

    # Decode images
    content_pil = Image.open(io.BytesIO(base64.b64decode(content_b64))).convert("RGB")
    style_pil = Image.open(io.BytesIO(base64.b64decode(style_b64))).convert("RGB")
    # Resize style to match content
    style_pil = style_pil.resize(content_pil.size)

    to_tensor = transforms.ToTensor()  # [0, 255] PIL -> [0, 1] tensor
    content_tensor = to_tensor(content_pil)
    style_tensor = to_tensor(style_pil)

    print(f"[fast_style] AdaIN: {content_pil.size}, alpha={alpha}")

    try:
        encoder, dec = load_adain_models(DEVICE, WEIGHTS_DIR)

        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            lambda: fast_style_transfer(
                encoder, dec, content_tensor, style_tensor, alpha, DEVICE
            ),
        )

        png_bytes = result_to_png(result)
        print(f"[fast_style] done, PNG size: {len(png_bytes) / 1024:.0f} KB")
        await ws.send_bytes(png_bytes)
    except Exception as e:
        print(f"[fast_style] ERROR: {e}")
        import traceback
        traceback.print_exc()
        await ws.send_text(json.dumps({"type": "error", "message": str(e)}))

    await ws.send_text(json.dumps({"type": "complete"}))

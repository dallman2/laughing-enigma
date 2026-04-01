# Dream Explorer — Architecture Document

**Project**: Dream Explorer — Deep Dream & Neural Style Transfer platform  
**Goal**: Replicate the original Deep Dream (2015) and Neural Style Transfer (Gatys 2015 / Ghiasi 2017) algorithms using modern tooling, with the long-term vision of letting users explore the dream space of *any* model they can run on their local GPU.  
**Date**: 2026-03-30  
**Status**: Pre-implementation spec

---

## 1. Problem Statement

The original DeepDreamGenerator website still runs the 2015/2017-era algorithms (Caffe/Keras, pre-TensorFlow) behind server-side inference. The algorithms themselves are simple — gradient ascent on intermediate layer activations (Deep Dream) and Gram-matrix style loss optimization (Style Transfer) — but the original tooling is dead. The original Caffe project (`google/deepdream`) is a single Jupyter notebook referencing `bvlc_googlenet.caffemodel`; modernizing it means using the same ImageNet-trained Inception weights that already exist natively in PyTorch (`torchvision.models.googlenet`) and TensorFlow (`tf.keras.applications.InceptionV3`). There is no model conversion step — the weights have been ported to every modern framework for years.

The goal is:

1. **Replicate both algorithms faithfully** with two compute modes: browser-only (TF.js + WebGPU) and local server (PyTorch + Metal/CUDA) for native GPU performance.
2. **Ship with InceptionV3 + MobileNetV2** as bundled models.
3. **Support arbitrary models via URL** — user pastes a URL to a TF.js-format model (primarily from HuggingFace) and explores its dream space. The local server additionally supports arbitrary PyTorch/HuggingFace models natively.
4. **Browser mode**: WebGPU primary compute backend, WebGL fallback. ~10-30fps interactive deep dream on proxy resolution.
5. **Server mode**: Native Metal (M3 Max) / CUDA / ROCm, achieving 60+ fps real-time deep dream. Web frontend connects via WebSocket.

---

## 2. Algorithm Review

### 2.1 Deep Dream (Mordvintsev et al., 2015)

**Core idea**: Gradient ascent on intermediate CNN layer activations, applied to the input image.

**Algorithm**:
```
for each octave (small → large):
    resize image to octave scale
    for N steps:
        activations = model.forward(image, up_to=target_layers)
        loss = Σ mean(activation_i) for each target layer i
        gradients = ∂loss/∂image_pixels
        gradients = normalize(gradients)  // ÷ std(gradients)
        image += gradients × step_size
        image = clip(image, -1, 1)
    upscale image
    reinject lost detail (original - upscaled_shrunk_original)
```

**Key parameters exposed to user**:
- Target layers (multi-select from available intermediate layers)
- Per-layer weight (how much each layer contributes to loss)
- Step size (learning rate for gradient ascent, typically 0.01)
- Number of octaves (scales, typically 3-5)
- Octave scale factor (typically 1.3-1.4)
- Steps per octave (typically 20-100)
- Max loss (early stopping threshold)
- Tile size (for large images — random-offset tiling to hide seams)

**Layer behavior**: Earlier layers → edges, textures, patterns. Deeper layers → eyes, faces, animals, complex objects. This is the core of the "exploration" UX.

### 2.2 Neural Style Transfer — Optimization-Based (Gatys et al., 2015)

**Core idea**: Define a loss function that combines content preservation with style reproduction, then optimize the generated image via gradient descent.

**Loss function**:
```
L_total = α × L_content + β × L_style + γ × L_tv

L_content = MSE(features(generated, layer_c), features(content, layer_c))
L_style  = Σ MSE(gram(features(generated, layer_s_i)), gram(features(style, layer_s_i)))
L_tv     = total_variation(generated)  // smoothness regularizer

gram(F) = F^T × F  // captures feature correlations independent of spatial arrangement
```

**Feature extractor**: Traditionally VGG19, using conv layers. Content from one deeper layer (e.g., block4_conv2), style from multiple layers (block1_conv1 through block5_conv1).

**Performance**: Slow — 500-2000 iterations of gradient descent. ~30-120 seconds on WebGPU depending on resolution. This is the "classic" approach that produces the highest-quality results but is interactive only at small resolutions.

### 2.3 Neural Style Transfer — Arbitrary Feedforward (Ghiasi et al., 2017)

**Core idea**: Train two networks offline — a style prediction network that encodes any style image into a latent vector, and a transformer network that applies that style vector to produce a stylized image in a single forward pass.

**Architecture** (as ported by Reiichiro Nakano to TF.js):
- **Style prediction network**: MobileNetV2 backbone, outputs 100-dim style vector. ~9.6 MB.
- **Transformer network**: Convolutional with instance normalization conditioned on style vector. ~7.9 MB.
- Total: ~17.5 MB model weights.

**Performance**: Sub-second on WebGPU. Real-time preview possible.

**Style interpolation**: Weighted average between style vectors of content and style images controls stylization strength. Can also interpolate between multiple style images.

---

## 3. Technical Architecture

### 3.1 Dual-Mode Runtime Architecture

The system operates in two modes with a shared web frontend:

**Browser-Only Mode** — zero install, runs everywhere, ~5x slower than native:

| Layer | Technology | Notes |
|---|---|---|
| **Compute backend** (primary) | `@tensorflow/tfjs-backend-webgpu` | ~3x faster than WebGL for CNN inference. All major browsers support WebGPU as of late 2025. |
| **Compute backend** (fallback) | `@tensorflow/tfjs-backend-webgl` | Automatic fallback for older browsers/devices. |
| **ML framework** | `@tensorflow/tfjs` (core + layers) | Required for `tf.grad()` / `tf.variableGrads()` — automatic differentiation on input tensors. |
| **Model loading** | `tf.loadLayersModel()` | **Critical**: Only `LayersModel` supports gradient computation. `GraphModel` does NOT support `tf.grad()`. |
| **Canvas rendering** | Raw `<canvas>` 2D context | Intermediate results painted directly from tensor → ImageData. |

**Local Server Mode** — requires `pip install dream-server`, native GPU, 60+ fps:

| Layer | Technology | Notes |
|---|---|---|
| **Compute backend** | PyTorch with MPS (Apple Silicon) / CUDA / ROCm | Native GPU, ~5x faster than WebGPU for gradient computation. |
| **Server** | FastAPI + WebSocket | Streams dream frames to browser. CORS proxy for arbitrary model URLs. |
| **Model loading** | `torchvision.models` + `torch.hub` + HuggingFace `transformers` | Any PyTorch model, no format restrictions. |
| **Communication** | WebSocket on `localhost:8420` | Binary frame streaming. JSON control messages for parameters. |

**Shared frontend** (both modes):

| Layer | Technology | Notes |
|---|---|---|
| **UI framework** | React 18+ | |
| **Build** | Vite | |
| **Mode detection** | Auto-probe `localhost:8420` on startup | If server responds → server mode (with browser fallback). If not → browser-only. |

### 3.1.1 Performance Tiers

The dual-mode architecture maps to three interaction tiers:

**Tier 1 — Real-time (30-60fps):** Fast feedforward style transfer in browser mode. Deep Dream in server mode (native Metal/CUDA). Slider dragging feels immediate.

**Tier 2 — Interactive (5-15fps effective):** Deep Dream in browser mode. Amortized single-step-per-frame on a 128×128 proxy canvas with MobileNetV2. Patterns emerge progressively as user adjusts sliders. Full-resolution render kicks off when interaction stops.

**Tier 3 — Batch:** Full deep dream with octaves at high resolution. Optimization-based style transfer. InceptionV3 deep dream in browser mode. Shows progress bar, streams intermediate results, pause/resume only.

### 3.2 The Gradient Problem — Critical Architectural Constraint

This is the single most important technical constraint in the entire project:

**Deep Dream and optimization-based Style Transfer both require computing gradients of a loss function with respect to the input image pixels.** This is not standard inference — it's backpropagation through the network to the *input*, not the *weights*.

In TF.js, this means:

| Model type | API | Gradient support | Use case |
|---|---|---|---|
| **LayersModel** | `tf.loadLayersModel()` | ✅ Full `tf.grad()` support | Deep Dream, optimization Style Transfer |
| **GraphModel** | `tf.loadGraphModel()` | ❌ No gradient support | Inference-only (feedforward Style Transfer) |

**Consequence for "arbitrary model" support**: Users can only dream through models that are in `tfjs_layers_model` format. Models converted as `tfjs_graph_model` won't work for Deep Dream. The conversion path matters:

```
Keras .h5 / SavedModel → tensorflowjs_converter --input_format=keras → LayersModel ✅
TFHub / Frozen Graph  → tensorflowjs_converter --input_format=tf_hub → GraphModel ❌
```

**Mitigation strategies**:

1. **Bundled models** (InceptionV3, MobileNetV2, VGG19) are pre-converted as LayersModels. These always work.
2. **URL-loaded models**: Accept both formats. If LayersModel → full Deep Dream. If GraphModel → inference-only modes (feedforward style transfer, feature visualization without gradient ascent).
3. **In-browser format detection**: Load the `model.json`, check the `format` field (`"layers-model"` vs `"graph-model"`), and surface the available modes to the user.
4. **Long-term**: Investigate ONNX Runtime Web for gradient computation. Currently ORT Web is inference-only in the browser — no autodiff. But the training API (`onnxruntime-training`) is actively developing gradient support. This is a future upgrade path, not a launch blocker.

### 3.3 Sub-Model Extraction (Intermediate Layer Access)

Deep Dream requires outputting activations from intermediate layers, not just the final classification output. For a loaded LayersModel, this is straightforward:

```typescript
// Given a loaded LayersModel, create a sub-model that outputs intermediate layers
function buildDreamModel(
  baseModel: tf.LayersModel,
  layerNames: string[]
): tf.LayersModel {
  const outputs = layerNames.map(name => baseModel.getLayer(name).output);
  return tf.model({
    inputs: baseModel.input,
    outputs: outputs,
  });
}
```

**Layer discovery**: `baseModel.layers` provides the full list. The UI should expose this list with metadata (layer type, output shape, depth) so the user can select which layers to dream through.

For InceptionV3 specifically, the canonical deep dream layers are the `mixed0` through `mixed10` concatenation layers. For MobileNetV2, the interesting layers are the bottleneck blocks (residual connections create richer feature maps).

### 3.4 Model Registry & Loading

#### 3.4.1 Bundled Models

Pre-converted, hosted on CDN (or bundled in the app's static assets). These are the "it just works" defaults:

| Model | Format | Size | Dream layers | Notes |
|---|---|---|---|---|
| **InceptionV3** (no top) | LayersModel | ~92 MB | `mixed0`–`mixed10` | Canonical deep dream. Heavy download. |
| **MobileNetV2** (no top) | LayersModel | ~14 MB | Block outputs | Fast, smaller patterns, good default. |
| **VGG19** (no top) | LayersModel | ~80 MB | `block1_conv1`–`block5_conv4` | Canonical style transfer feature extractor. |
| **Magenta arbitrary style** | GraphModel | ~17.5 MB | N/A (feedforward) | Style prediction + transformer. |

Conversion script (run offline, outputs hosted statically):
```bash
# InceptionV3
python -c "
import tensorflow as tf
import tensorflowjs as tfjs
model = tf.keras.applications.InceptionV3(weights='imagenet', include_top=False)
tfjs.converters.save_keras_model(model, './models/inception_v3_tfjs')
"

# MobileNetV2
python -c "
import tensorflow as tf
import tensorflowjs as tfjs
model = tf.keras.applications.MobileNetV2(weights='imagenet', include_top=False)
tfjs.converters.save_keras_model(model, './models/mobilenet_v2_tfjs')
"

# VGG19 (for style transfer)
python -c "
import tensorflow as tf
import tensorflowjs as tfjs
model = tf.keras.applications.VGG19(weights='imagenet', include_top=False)
tfjs.converters.save_keras_model(model, './models/vgg19_tfjs')
"
```

#### 3.4.2 User-Supplied Models via URL

The user provides a URL pointing to a `model.json` file (browser mode) or any PyTorch-compatible model identifier (server mode).

##### CORS Constraints — What Actually Works in the Browser

When JavaScript at `https://dream-explorer.app` calls `fetch()` on a remote URL, the remote server must respond with `Access-Control-Allow-Origin: *` (or the exact origin). If it doesn't, the browser blocks the response. This applies to every request in the model loading chain: the `model.json` manifest AND every `.bin` weight shard it references.

**Source-by-source CORS status:**

| Source | CORS Headers? | Browser-Only | Server Mode |
|---|---|---|---|
| **HuggingFace public repos** (`huggingface.co/*/resolve/main/*`) | ✅ `Access-Control-Allow-Origin: *` | ✅ Works | ✅ Works |
| **HuggingFace private/gated repos** | ❌ Auth triggers preflight failure | ❌ Blocked | ✅ Server fetches with token |
| **Google Cloud Storage** (TF.js official buckets) | ✅ Configured by Google | ✅ Works | ✅ Works |
| **Google Cloud Storage** (arbitrary user buckets) | ⚠️ Only if bucket owner configured CORS | ⚠️ Coin flip | ✅ Server proxies |
| **TensorFlow Hub** (`tfhub.dev`) | ❌ Redirects to Kaggle, which has no CORS | ❌ Broken | ✅ Server proxies |
| **Kaggle** (`kaggle.com/models/*`) | ❌ No CORS headers | ❌ Blocked | ✅ Server proxies |
| **GitHub raw** (`raw.githubusercontent.com`) | ✅ Has CORS, but 100MB file limit + rate limiting | ⚠️ Small models only | ✅ Works |
| **GitHub LFS / Releases** | ⚠️ Inconsistent across redirect chain | ⚠️ Unreliable | ✅ Server proxies |
| **CDNs** (jsDelivr, unpkg, cdnjs) | ✅ Full CORS by design | ✅ Works | ✅ Works |
| **Self-hosted** (user's server) | Depends on their config | ⚠️ Depends | ✅ Server proxies |
| **Cloudflare R2 / AWS S3 / Azure Blob** | Only if CORS configured on bucket | ⚠️ Depends | ✅ Server proxies |

**Key finding**: HuggingFace public repos are the only broadly reliable source for user-pasted URLs in browser-only mode. This is also how Transformers.js loads all its models — direct fetch from HF Hub. TFHub is actively broken (Kaggle redirect chain lacks CORS). Kaggle has no CORS at all.

**Recommended URL pattern for users:**
```
https://huggingface.co/{user}/{repo}/resolve/main/model.json
```

##### The model.json + Weight Shards Split Problem

TF.js `model.json` files contain relative paths to weight shards. If model.json is at `https://huggingface.co/user/repo/resolve/main/model.json` and references `group1-shard1of4.bin`, TF.js resolves this to `https://huggingface.co/user/repo/resolve/main/group1-shard1of4.bin`. This works when all files are on the same CORS-enabled host. But if model.json is on one host and shards reference a different host (or the same host has inconsistent CORS across file types), the load fails partway through — potentially after downloading hundreds of megabytes.

When proxying through the local server, the server must:
1. Fetch model.json from the remote URL
2. Parse the weight manifest to find shard filenames
3. Resolve shard URLs relative to the model.json URL
4. Fetch all shards
5. Serve the complete model from localhost, rewriting the manifest to point shard URLs to localhost

##### Local Server as Universal CORS Proxy

The dream-server acts as a CORS proxy for any URL the browser can't reach directly:

```python
# ~30 lines of FastAPI
@app.post("/api/proxy-fetch")
async def proxy_fetch(request: ProxyRequest):
    """Fetch a URL server-side, bypassing browser CORS restrictions."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(request.url, follow_redirects=True)
        return Response(
            content=resp.content,
            media_type=resp.headers.get("content-type", "application/octet-stream"),
            headers={"Access-Control-Allow-Origin": "*"}
        )
```

In server mode, **any URL works** — the server is not a browser and doesn't enforce CORS. This is the escape hatch for Kaggle, TFHub, private HF repos, and arbitrary hosts.

##### Drag-and-Drop Fallback

As a nuclear option, users can download model files manually (via browser, curl, whatever) and drag them into the app. The browser `File` API reads local files with zero CORS involvement. The UI accepts a folder drop containing `model.json` + weight shards, loads them via `tf.loadLayersModel(tf.io.browserFiles([...]))`.

##### Loading Flow — Complete Decision Tree

```
User pastes URL or selects bundled model
    │
    ├─ Bundled model selected?
    │   └─ YES → Load from our CDN (Cloudflare R2, CORS pre-configured) → done
    │
    ├─ Is local server connected? (auto-probed on startup)
    │   ├─ YES → Route fetch through server proxy → always works, any URL
    │   └─ NO  → Continue to browser-only path ↓
    │
    ├─ Is URL from a known CORS-friendly host?
    │   ├─ HuggingFace /resolve/main/ → ✅ green indicator, proceed
    │   ├─ storage.googleapis.com (tfjs buckets) → ✅ proceed
    │   ├─ cdn.jsdelivr.net / unpkg.com → ✅ proceed
    │   ├─ raw.githubusercontent.com → ⚠️ warn about size limits, proceed
    │   ├─ tfhub.dev → ❌ warn: "TFHub redirects to Kaggle which blocks
    │   │                        browser downloads. Start the local server
    │   │                        or re-host on HuggingFace."
    │   ├─ kaggle.com → ❌ same warning
    │   └─ Unknown host → ⚠️ "May not work — attempting..."
    │
    ├─ Probe: fetch model.json with HEAD or small GET
    │   ├─ SUCCESS (CORS ok) → proceed to full load
    │   └─ CORS ERROR (TypeError) → show error:
    │       "This host blocks browser downloads (CORS policy).
    │        Options:
    │        1. Start the local server: pip install dream-server && dream-server
    │        2. Re-upload model to HuggingFace (free, CORS-enabled)
    │        3. Drag-and-drop model files from your computer
    │        4. If you control the server, add Access-Control-Allow-Origin: * header"
    │
    ├─ Fetch model.json → parse JSON
    │   ├─ Check `format` field:
    │   │   ├─ "layers-model" → tf.loadLayersModel(url) → full gradient support
    │   │   └─ "graph-model" → tf.loadGraphModel(url) → inference-only, warn user
    │   ├─ Enumerate layers → populate layer selector UI
    │   └─ Detect input shape → configure preprocessing
    │
    └─ Cache in IndexedDB for subsequent visits
```

##### Server Mode Model Loading (PyTorch)

In server mode, model loading is unconstrained — no CORS, no format restrictions:

```python
# Any torchvision model
model = torchvision.models.inception_v3(pretrained=True)

# Any HuggingFace model
model = timm.create_model('efficientnet_b0', pretrained=True)

# Arbitrary URL (download + cache)
model = torch.hub.load('pytorch/vision', 'resnet50', pretrained=True)
```

The server exposes the model's layer structure to the frontend via a `/api/model-info` endpoint, enabling the same layer-picker UI regardless of compute mode.

### 3.5 Gradient Ascent Engine

The core computation loop, designed for reuse across Deep Dream and optimization-based Style Transfer:

```typescript
interface GradientAscentConfig {
  model: tf.LayersModel;           // Sub-model outputting target layers
  image: tf.Variable;              // Mutable image tensor (the thing being optimized)
  lossFn: (activations: tf.Tensor | tf.Tensor[]) => tf.Scalar;
  stepSize: number;
  normalize: 'std' | 'mean_abs' | 'none';
  clipRange: [number, number];     // e.g., [-1, 1]
}

function gradientAscentStep(config: GradientAscentConfig): { loss: number } {
  return tf.tidy(() => {
    const { value, grads } = tf.variableGrads(() => {
      const activations = config.model.predict(
        config.image.expandDims(0)
      );
      return config.lossFn(activations);
    });

    const gradient = grads[config.image.name];

    // Normalize gradient
    let normalizedGrad: tf.Tensor;
    switch (config.normalize) {
      case 'std':
        normalizedGrad = gradient.div(gradient.moments().variance.sqrt().add(1e-8));
        break;
      case 'mean_abs':
        normalizedGrad = gradient.div(gradient.abs().mean().maximum(1e-6));
        break;
      default:
        normalizedGrad = gradient;
    }

    // Ascent step
    config.image.assign(
      config.image.add(normalizedGrad.mul(config.stepSize))
        .clipByValue(config.clipRange[0], config.clipRange[1])
    );

    return { loss: value.dataSync()[0] };
  });
}
```

### 3.6 Octave Pipeline (Deep Dream)

```typescript
interface OctaveConfig {
  numOctaves: number;          // e.g., 3-5
  octaveScale: number;         // e.g., 1.3-1.4
  stepsPerOctave: number;      // e.g., 20-100
  stepSize: number;
  maxLoss: number | null;      // Early stopping
  onProgress: (octave: number, step: number, image: tf.Tensor3D) => void;
}

async function deepDreamWithOctaves(
  dreamModel: tf.LayersModel,
  originalImage: tf.Tensor3D,
  config: OctaveConfig
): Promise<tf.Tensor3D> {
  const originalShape = [originalImage.shape[0], originalImage.shape[1]];

  // Compute successive shapes (smallest → largest)
  const shapes: [number, number][] = [];
  for (let i = config.numOctaves - 1; i >= 0; i--) {
    const scale = config.octaveScale ** i;
    shapes.push([
      Math.round(originalShape[0] / scale),
      Math.round(originalShape[1] / scale),
    ]);
  }

  let img = tf.variable(originalImage);
  let shrunkOriginal = tf.image.resizeBilinear(
    originalImage.expandDims(0), shapes[0]
  ).squeeze();

  for (let octave = 0; octave < shapes.length; octave++) {
    const [h, w] = shapes[octave];

    // Resize current image to this octave's scale
    img.assign(
      tf.image.resizeBilinear(img.expandDims(0), [h, w]).squeeze()
    );

    // Run gradient ascent at this scale
    for (let step = 0; step < config.stepsPerOctave; step++) {
      const { loss } = gradientAscentStep({
        model: dreamModel,
        image: img,
        lossFn: (acts) => {
          const actArray = Array.isArray(acts) ? acts : [acts];
          return tf.addN(actArray.map(a => a.mean()));
        },
        stepSize: config.stepSize,
        normalize: 'std',
        clipRange: [-1, 1],
      });

      if (config.maxLoss && loss > config.maxLoss) break;

      // Yield to UI thread periodically
      if (step % 5 === 0) {
        config.onProgress(octave, step, img);
        await tf.nextFrame();
      }
    }

    // Reinject lost detail
    if (octave < shapes.length - 1) {
      const upscaledShrunk = tf.image.resizeBilinear(
        shrunkOriginal.expandDims(0), [h, w]
      ).squeeze();
      const sameSizeOriginal = tf.image.resizeBilinear(
        originalImage.expandDims(0), [h, w]
      ).squeeze();
      const lostDetail = sameSizeOriginal.sub(upscaledShrunk);
      img.assign(img.add(lostDetail));

      shrunkOriginal = tf.image.resizeBilinear(
        originalImage.expandDims(0), shapes[octave + 1]
      ).squeeze();
    }
  }

  return img;
}
```

### 3.7 Style Transfer — Optimization Pipeline

```typescript
interface StyleTransferConfig {
  featureModel: tf.LayersModel;    // VGG19 sub-model
  contentImage: tf.Tensor3D;
  styleImage: tf.Tensor3D;
  contentLayerName: string;        // e.g., 'block4_conv2'
  styleLayerNames: string[];       // e.g., ['block1_conv1', ..., 'block5_conv1']
  contentWeight: number;           // α, typically 1e3-1e4
  styleWeight: number;             // β, typically 1e-2-1e0
  tvWeight: number;                // γ, total variation, typically 1e-4
  iterations: number;
  learningRate: number;
  onProgress: (step: number, image: tf.Tensor3D, losses: object) => void;
}

function gramMatrix(featureMap: tf.Tensor): tf.Tensor {
  // featureMap shape: [1, H, W, C]
  const [_, h, w, c] = featureMap.shape;
  const reshaped = featureMap.reshape([h * w, c]);
  const gram = reshaped.transpose().matMul(reshaped);
  return gram.div(tf.scalar(h * w));  // Normalize by spatial size
}
```

### 3.8 Style Transfer — Arbitrary Feedforward Pipeline

Uses the Magenta-derived model pair. No gradient computation needed — pure forward inference.

```typescript
interface ArbitraryStyleConfig {
  stylePredictor: tf.GraphModel | tf.LayersModel;  // MobileNetV2-based
  transformer: tf.GraphModel | tf.LayersModel;
  contentImage: tf.Tensor3D;
  styleImage: tf.Tensor3D;
  stylizationStrength: number;  // 0.0 (content) → 1.0 (full style)
}

async function arbitraryStyleTransfer(config: ArbitraryStyleConfig): Promise<tf.Tensor3D> {
  return tf.tidy(() => {
    // Extract style vector from style image
    const styleVector = config.stylePredictor.predict(
      preprocessForMobileNet(config.styleImage).expandDims(0)
    ) as tf.Tensor;

    // Extract style vector from content image (for interpolation)
    const contentStyleVector = config.stylePredictor.predict(
      preprocessForMobileNet(config.contentImage).expandDims(0)
    ) as tf.Tensor;

    // Interpolate based on stylization strength
    const blendedStyle = contentStyleVector
      .mul(1 - config.stylizationStrength)
      .add(styleVector.mul(config.stylizationStrength));

    // Run transformer
    const output = config.transformer.predict([
      preprocessForTransformer(config.contentImage).expandDims(0),
      blendedStyle,
    ]) as tf.Tensor;

    return deprocess(output.squeeze());
  });
}
```

---

## 4. Application Architecture

### 4.1 Module Structure

```
dream-explorer/
├── dream-ui/                          # Web frontend (React + Vite)
│   └── src/
│       ├── engine/
│       │   ├── gradient-ascent.ts          # Core gradient ascent step (TF.js)
│       │   ├── deep-dream.ts              # Octave pipeline, tiled gradients
│       │   ├── style-transfer-optim.ts    # Gatys optimization loop
│       │   ├── style-transfer-fast.ts     # Arbitrary feedforward style transfer
│       │   ├── preprocessing.ts           # Per-model image preprocessing/deprocessing
│       │   └── tiled-gradient.ts          # Random-offset tile computation for large images
│       │
│       ├── models/
│       │   ├── registry.ts                # Model registry (bundled + user-loaded)
│       │   ├── loader.ts                  # URL loading, CORS detection, format sniffing
│       │   ├── cors-probe.ts              # Pre-flight CORS check before committing to download
│       │   ├── layer-inspector.ts         # Enumerate layers, shapes, types
│       │   └── cache.ts                   # IndexedDB caching for model weights
│       │
│       ├── server/
│       │   ├── client.ts                  # WebSocket client for local server communication
│       │   ├── probe.ts                   # Auto-detect server on localhost:8420
│       │   └── protocol.ts               # Shared message types (control + binary frames)
│       │
│       ├── ui/
│       │   ├── App.tsx
│       │   ├── components/
│       │   │   ├── ModelSelector.tsx       # Bundled models + URL input + CORS status
│       │   │   ├── LayerPicker.tsx         # Multi-select with layer metadata
│       │   │   ├── ParameterPanel.tsx      # Step size, octaves, weights sliders
│       │   │   ├── ImageCanvas.tsx         # Live rendering of dream/style output
│       │   │   ├── ProgressIndicator.tsx   # Octave/step progress, loss graph
│       │   │   ├── ImageUploader.tsx       # Content/style image input + drag-drop models
│       │   │   ├── BackendIndicator.tsx    # WebGPU/WebGL/Server status badge
│       │   │   └── CorsWarning.tsx         # Actionable CORS error messages
│       │   └── hooks/
│       │       ├── useBackend.ts           # WebGPU detection, fallback, server probe
│       │       ├── useDream.ts             # Deep dream pipeline state machine
│       │       ├── useStyleTransfer.ts     # Style transfer pipeline state machine
│       │       └── useModelLoader.ts       # Async model loading with CORS handling
│       │
│       ├── workers/
│       │   └── dream-worker.ts            # (future) OffscreenCanvas + worker thread
│       │
│       └── index.tsx
│
├── dream-server/                      # Local Python server (PyTorch)
│   ├── server.py                      # FastAPI + WebSocket entry point
│   ├── engine/
│   │   ├── deep_dream.py              # PyTorch gradient ascent + octaves
│   │   ├── style_transfer.py          # Gatys + feedforward style transfer
│   │   └── preprocessing.py           # Model-specific preprocessing configs
│   ├── models/
│   │   ├── registry.py                # Available models + layer metadata
│   │   └── loader.py                  # torchvision, timm, torch.hub loading
│   ├── proxy.py                       # CORS proxy for arbitrary URLs
│   └── protocol.py                    # Shared message types
│
└── models/                            # Pre-converted model weights (hosted on CDN)
    ├── inception_v3_tfjs/
    ├── mobilenet_v2_tfjs/
    ├── vgg19_tfjs/
    └── magenta_style_tfjs/
```

### 4.2 State Machine for Dream Pipeline

```
IDLE → LOADING_MODEL → MODEL_READY → CONFIGURING → RUNNING → PAUSED → RUNNING
                                         ↑                      ↓
                                         └──── COMPLETE ────────┘
```

The RUNNING state yields to the UI thread every N steps via `await tf.nextFrame()`, painting intermediate results to the canvas. The user can pause, adjust parameters, and resume — the image tensor persists as a `tf.Variable`.

### 4.3 Rendering Pipeline

```
tf.Tensor3D (float32, [-1,1] or [0,255])
    → deprocess (undo model-specific normalization)
    → tf.browser.toPixels(tensor, canvas)
    → canvas displayed to user
```

For live preview during gradient ascent:
- Paint every 5th step (configurable)
- Use `requestAnimationFrame` timing to not block the GPU pipeline
- Optional: downscale preview during octave processing, full-res on completion

---

## 5. Model Compatibility Matrix

| Source | Format | Deep Dream | Optim Style Transfer | Fast Style Transfer | CORS (Browser) | Server Mode | Notes |
|---|---|---|---|---|---|---|---|
| Bundled InceptionV3 | LayersModel | ✅ | ✅ (feature extractor) | — | ✅ Our CDN | ✅ | Canonical deep dream |
| Bundled MobileNetV2 | LayersModel | ✅ | ✅ | — | ✅ Our CDN | ✅ | Fast, lightweight |
| Bundled VGG19 | LayersModel | ✅ | ✅ (preferred) | — | ✅ Our CDN | ✅ | Canonical style transfer |
| Bundled Magenta | GraphModel | — | — | ✅ | ✅ Our CDN | ✅ | Feedforward only |
| HuggingFace URL (LayersModel) | LayersModel | ✅ | ✅ | — | ✅ HF has CORS | ✅ | Best path for user models |
| HuggingFace URL (GraphModel) | GraphModel | ❌ | ❌ | ⚠️ | ✅ HF has CORS | ✅ | No gradient support in browser |
| TFHub URL | GraphModel | ❌ | ❌ | ⚠️ | ❌ Broken (Kaggle) | ✅ via proxy | Redirects to Kaggle, no CORS |
| Kaggle URL | varies | ❌ | ❌ | ⚠️ | ❌ No CORS | ✅ via proxy | Must use server proxy |
| Arbitrary URL | varies | depends | depends | depends | ⚠️ Depends on host | ✅ via proxy | Server mode always works |
| Drag-and-drop files | LayersModel | ✅ | ✅ | — | N/A (local files) | N/A | Nuclear fallback, always works |
| PyTorch model (server only) | native | ✅ | ✅ | — | N/A | ✅ | Any torchvision/timm/hub model |

---

## 6. Performance Expectations

### Browser Mode (TF.js WebGPU)

Browser inference is roughly 5x slower than native GPU due to the JS→WGSL→Dawn→Metal/Vulkan dispatch chain. The backward pass (gradient computation) is especially penalized because TF.js WebGPU was optimized for inference first.

| Operation | Resolution | Expected Time | Effective FPS |
|---|---|---|---|
| Deep Dream — 1 gradient step (MobileNetV2) | 128×128 | ~5-15ms | 60+ fps (proxy preview) |
| Deep Dream — 1 gradient step (MobileNetV2) | 224×224 | ~15-40ms | 25-60 fps |
| Deep Dream — 1 gradient step (InceptionV3) | 224×224 | ~40-100ms | 10-25 fps |
| Deep Dream — full (3 octaves, 20 steps) | 512×512 | ~5-15s | Batch mode |
| Style Transfer — optimization (500 iter) | 512×512 | ~30-90s | Batch mode |
| Style Transfer — fast feedforward | 512×512 | <1s (~30ms) | 30+ fps |
| Model load (InceptionV3, cold) | — | ~5-15s | Network dependent |
| Model load (InceptionV3, cached) | — | ~1-3s | IndexedDB |

### Server Mode (PyTorch + Native GPU)

Native Metal (M3 Max, ~14.2 TFLOPS) or CUDA/ROCm performance. No browser overhead.

| Operation | Resolution | M3 Max (Metal) | RTX-class CUDA |
|---|---|---|---|
| Deep Dream — 1 gradient step (MobileNetV2) | 224×224 | ~3-5ms | ~1-3ms |
| Deep Dream — 1 gradient step (InceptionV3) | 299×299 | ~10-20ms | ~5-10ms |
| Deep Dream — 1 gradient step (MobileNetV2) | 512×512 | ~8-15ms | ~3-8ms |
| Deep Dream — full (3 octaves, 20 steps) | 512×512 | ~1-3s | ~0.5-1.5s |
| Style Transfer — optimization (500 iter) | 512×512 | ~5-15s | ~3-8s |
| Style Transfer — fast feedforward | 512×512 | <100ms | <50ms |
| WebSocket frame overhead | — | ~1-3ms | ~1-3ms |

Server mode enables real-time 60fps deep dream at 224×224 with MobileNetV2 on the M3 Max, with headroom for larger models or higher resolutions.

**Memory**: InceptionV3 intermediate activations at 512×512 consume ~200-500MB GPU memory depending on selected layers. MobileNetV2 is much lighter (~50-100MB). In browser mode, users with <4GB GPU memory should use MobileNetV2 or reduce resolution. Server mode benefits from the M3 Max's 64GB unified memory — no VRAM ceiling.

---

## 7. UX Flow

### 7.1 Deep Dream Mode

```
1. Select model (dropdown: MobileNetV2 [default], InceptionV3, or paste URL)
   → Model loads, layer list populates

2. Upload image (drag-drop or file picker)
   → Preview displayed on canvas

3. Select target layers (multi-select, checkboxes with layer visualization thumbnails)
   → Per-layer weight sliders appear

4. Adjust parameters (step size, octaves, steps/octave, scale)
   → Real-time preview: run 1 step on thumbnail to show effect

5. Click "Dream"
   → Progress bar shows octave/step
   → Canvas updates live every N steps
   → Pause/resume button available
   → Loss graph updates in sidebar

6. On completion: download button (PNG), "dream deeper" (continue from current image)
```

### 7.2 Style Transfer Mode

```
1. Upload content image + style image

2. Choose mode:
   a. Fast (arbitrary feedforward) — instant preview
   b. Optimization — configure iterations, weights, target layers

3. Adjust stylization strength slider (fast mode) or content/style weight ratio (optim mode)

4. Click "Stylize" → live preview during optimization, instant for fast mode

5. Download result
```

### 7.3 Layer Explorer (Bonus Feature)

A feature visualization mode: start from noise (or the user's image) and maximize a single channel or unit within a layer. This is the "what does this neuron see?" tool. Same gradient ascent engine, different loss function (maximize activation of a single feature map channel rather than the mean of all activations).

---

## 8. Open Questions & Risks

### 8.1 Resolved Questions

1. **Model hosting** (RESOLVED): Host bundled models on Cloudflare R2 with `Access-Control-Allow-Origin: *`. HuggingFace public repos are the recommended path for user-uploaded models — CORS is enabled on `/resolve/main/` endpoints. TFHub and Kaggle are broken for browser use (no CORS); the local server CORS proxy handles these.

2. **CORS for arbitrary models** (RESOLVED): Browser-only mode reliably supports HuggingFace, GCS (Google's TF.js buckets), jsDelivr/unpkg, and GitHub raw (small files). Everything else requires the local server proxy or drag-and-drop. See §3.4.2 for the complete decision tree.

3. **Original Caffe model conversion** (RESOLVED): Not needed. The original `bvlc_googlenet.caffemodel` is just GoogLeNet/Inception v1 trained on ImageNet. These exact weights exist natively in PyTorch (`torchvision.models.googlenet`) and TensorFlow (`tf.keras.applications.InceptionV3`). The algorithm is ~40 lines; the model conversion happened years ago.

### 8.2 Open Questions

1. **UI framework**: React is the safe choice (portfolio context, everyone knows it). Solid or Svelte would be lighter and the reactive model maps well to tensor state updates. Leaning React for portfolio visibility.

2. **Worker thread offloading**: TF.js WebGPU already runs compute on the GPU asynchronously. Moving the orchestration loop to a Web Worker with OffscreenCanvas would keep the main thread fully unblocked, but adds complexity. Worth it for optimization-based style transfer (long-running), maybe overkill for deep dream (shorter bursts).

3. **ONNX path**: When/if ONNX Runtime Web adds training/gradient APIs for in-browser use, this opens the door to PyTorch-exported models (via ONNX) for deep dream in browser mode. Monitor `onnxruntime-training` development. Currently inference-only in browser. Not a launch blocker — server mode already handles PyTorch models natively.

4. **HuggingFace model discovery**: The HF API supports querying for models tagged `tensorflowjs` + `image-classification`. Presenting a browsable list in the app is a nice-to-have for Phase 3+.

5. **6900 XT ROCm support**: ROCm on the 6900 XT (RDNA2) is spotty. May need to fall back to CPU inference on that GPU, or use Vulkan compute via wgpu-native (same WGSL shaders as WebGPU, compiled natively). Needs testing.

6. **WebSocket binary frame format**: For server mode, need to decide how dream frames are encoded over the wire. Raw RGBA pixels (~1MB per 512×512 frame at 60fps = ~60MB/s) vs JPEG-compressed frames (~50KB each) vs WebP. Localhost bandwidth isn't a constraint, but encoding overhead matters at 60fps.

### 8.3 Risks

| Risk | Impact | Mitigation |
|---|---|---|
| TF.js WebGPU gradient ops are missing or broken | Browser deep dream non-functional | Fall back to WebGL backend. Server mode unaffected. Test early with InceptionV3. |
| Arbitrary URL models have unsupported ops or layer types | "Any model" partially broken in browser | Detect on load, warn user. Server mode handles any PyTorch model. |
| HuggingFace changes CORS policy | Browser model loading breaks for user URLs | Bundled models unaffected (our CDN). Server proxy as fallback. |
| Memory pressure causes browser crash | Bad UX in browser mode | Detect available GPU memory (where possible), auto-limit resolution, warn before loading InceptionV3. Server mode has 64GB unified memory. |
| Model weight download size causes abandonment | Users leave before trying | Progressive loading UI, model size shown before download, MobileNetV2 (14MB) as default. |
| WebSocket latency spikes in server mode | Frame drops during real-time dream | Buffer 2-3 frames, drop stale frames, decouple render from compute. |
| TF.js WebGPU backward pass significantly slower than forward | Browser Tier 2 interactive mode too slow | Reduce proxy canvas to 64×64, or limit to MobileNetV2 only for interactive mode. |

---

## 9. Implementation Phases

### Phase 1: Deep Dream MVP (Browser + Server)
- WebGPU/WebGL backend initialization with detection and fallback
- MobileNetV2 LayersModel bundled on Cloudflare R2 (CORS configured)
- Layer enumeration and multi-select UI
- TF.js gradient ascent engine with octaves (browser mode)
- PyTorch gradient ascent engine with octaves (server mode)
- FastAPI + WebSocket server with CORS proxy endpoint
- Auto-probe for local server on startup
- Live canvas rendering during computation
- Basic parameter controls (step size, octaves, layer selection)
- Image upload and download

### Phase 2: Style Transfer
- VGG19 LayersModel for optimization-based style transfer
- Gram matrix loss implementation (both engines)
- Magenta arbitrary style transfer (feedforward) integration
- Content/style image dual upload UX
- Style strength interpolation slider

### Phase 3: Arbitrary Models + CORS Handling
- URL-based model loading with CORS pre-probe
- Known-good host detection (HuggingFace, GCS, CDNs)
- CORS error UI with actionable alternatives
- Server-side CORS proxy for blocked URLs
- Drag-and-drop model files fallback
- IndexedDB caching (browser) + filesystem caching (server)
- Preprocessing auto-detection / user override
- Layer inspector (shapes, types, connectivity)
- Tested-models directory (curated list of known-working URLs)

### Phase 4: Polish
- Worker thread offloading for long-running style transfer
- Tiled gradient computation for high-resolution images
- Layer explorer / feature visualization mode
- Animation mode (smooth interpolation between layer selections)
- HuggingFace model browser integration (API query for tfjs models)
- Export as video (morph between dream states)
- 6900 XT testing (ROCm / wgpu-native fallback)

---

## 10. Dependencies

### NPM Packages (dream-ui)
```json
{
  "@tensorflow/tfjs": "^4.22.0",
  "@tensorflow/tfjs-backend-webgpu": "^4.22.0",
  "react": "^18.3.0",
  "react-dom": "^18.3.0",
  "vite": "^6.0.0"
}
```

### Python Packages (dream-server)
```
torch>=2.2
torchvision>=0.17
fastapi>=0.110
uvicorn>=0.29
websockets>=12.0
httpx>=0.27        # For CORS proxy
Pillow>=10.0
```

### Python (offline model conversion only)
```
tensorflow>=2.16
tensorflowjs>=4.22
```

### External Model Weights (hosted on Cloudflare R2 with CORS)
- InceptionV3 (no top): ~92 MB
- MobileNetV2 (no top): ~14 MB
- VGG19 (no top): ~80 MB
- Magenta arbitrary style transfer: ~17.5 MB

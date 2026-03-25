# laughing-enigma — Claude context

## What this repo is

Browser-based stereo computer vision research/demo platform. Runs OpenCV.js (WASM), Three.js, and TensorFlow.js entirely in the browser, no backend. Deployed to GitHub Pages at base path `/laughing-enigma/`.

Three tabs:

| Tab | Purpose | Completeness |
|-----|---------|-------------|
| **threejs** | Stereo camera simulation, calibration workflow, disparity map, 3D reprojection | ~85% — core pipeline works |
| **tfjs** | MobileNet image classification (static panda.jpg) | ~40% — model loads, results only go to console |
| **easypic** | File picker + canvas image viewer | ~60% — renders image, stubs for Button 2/3 |

The **threejs** tab is the real project. The other two are scaffolding.

## Tech stack

- React 18 + TypeScript 5.5 + Vite 5
- Three.js 0.168 (3D rendering, stereo camera, raycasting)
- OpenCV.js via `mirada` 0.0.15 (WASM — requires manual Mat memory management)
- TensorFlow.js 4.22 + MobileNet
- Radix UI Tabs
- pnpm

## Key files

```
src/
  App.tsx                        — tab shell, OpenCV Suspense loader
  main.tsx                       — entry, StrictMode + Suspense
  ThreeImpl/ThreeImpl.tsx        — main UI component (controls, canvas refs, config)
  services/useThree.ts           — gfx service (misnamed as a hook; not a React hook)
  lib/
    gfx_state.ts                 — GFXState singleton (all Three.js + OpenCV state)
    stereoVision.ts              — doStereoVis: disparity + reprojection pipeline
    stereoCalibration.ts         — doStereoCalibration: chessboard → rectification maps
    sceneCreation.ts             — calibration scene (chessboard) + production scene (cubes)
    ScalarMatMap.ts              — cached OpenCV Mat objects filled with scalar values
    constants.ts                 — INITIAL_STEREO_WIDTH/HEIGHT, VIEWER_SCALING_FACTOR, etc.
    Timer.ts                     — suppressible perf timer
    vfsApi.ts                    — saveCalibResultsToDisk (JSON download)
  TfjsImpl/TfjsImpl.tsx          — TF.js tab
  EasyPicImpl/EasyPicImpl.tsx    — image viewer tab
```

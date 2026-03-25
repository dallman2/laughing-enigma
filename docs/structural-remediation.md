# Structural Remediation Plan

Audited 2026-03-24. Implement phases in order. No feature additions — structural fixes only.

---

## Phase A — Safety & Correctness

### A1. Fix WebGL context leak — renderers created at module import

**File:** `src/services/useThree.ts:101-102`

```ts
// runs at import time, before any component mounts, never disposed
const renderer = new THREE.WebGLRenderer({ antialias: true }),
  stereoRenderer = new THREE.WebGLRenderer({ antialias: true });
```

Fix: move renderer construction inside `gfxSetup()`. Return a `dispose()` function from `attachAndRender` that calls `renderer.dispose()` and `stereoRenderer.dispose()`. Call it in the useEffect cleanup in ThreeImpl.

### A2. Add useEffect cleanup — RAF loop and event listeners leak on tab switch

**File:** `src/ThreeImpl/ThreeImpl.tsx:59-92`

The useEffect has no return value. When ThreeImpl unmounts (tab switch), the RAF loop continues forever and `pointermove`/`click` listeners on `renderer.domElement` are orphaned.

Fix: `attachAndRender` returns a `dispose()` function; useEffect returns it. dispose must:
1. `cancelAnimationFrame(f)` — read current `f` from gfx_state
2. `renderer.domElement.removeEventListener('pointermove', movePointerHandler)`
3. `renderer.domElement.removeEventListener('click', clickHandler)`
4. `renderer.dispose()` + `stereoRenderer.dispose()`

### A3. Decouple config changes from full scene rebuild

**Files:** `src/ThreeImpl/ThreeImpl.tsx:84-92`, `src/services/useThree.ts:158-220`

`config` is a useEffect dep, so every slider move calls `attachAndRender` → `gfxSetup` → recreates cameras, scenes, controls, and restarts the loop. `THREE.Cache.clear()` fires on every slider move too (line 159).

Fix:
- Mount effect runs once with `[]` deps, calls `attachAndRender`
- Add a separate `updateConfig(config: ConfigType)` to the service: calls `setEyeSep`, `setViewerDimensions`, resizes renderers — no scene recreation, no loop restart
- Second `useEffect([config])` calls only `updateConfig`
- Remove `THREE.Cache.clear()` from `attachAndRender`

### A4. Fix useEffect dependency array — refs must not be deps

**File:** `src/ThreeImpl/ThreeImpl.tsx:84-92`

Current: `[threeContainer, threeStereoContainer, leftEye, rightEye, dispMap, config, attachAndRender]`

Problems: ref objects are stable identity — including them does nothing but is misleading. `reprojectMap` is passed on line 77 but absent from deps. After A3, `config` moves to the second effect.

Fix: mount effect deps `[]`. Config effect deps `[config]`.

### A5. Fix `calibResults` null typing

**File:** `src/lib/gfx_state.ts:60, 98-99, 134-135`

`calibResults` is typed `DistMapsAndQ` but initialized to `null` with `@ts-expect-error` (twice). `haveCalibResults: boolean` exists only to paper over the missing `| null`.

Fix:
- Type: `calibResults: DistMapsAndQ | null = null`
- Remove both `@ts-expect-error` suppression comments
- Remove `haveCalibResults` field; callers use `calibResults !== null` directly
- Update all call sites: `getAPI().haveCalibResults` → `getAPI().calibResults !== null`

---

## Phase B — Structure & Naming

### B1. `useThree` is not a hook — rename and fix eager init

**File:** `src/services/useThree.ts`

`init()` runs at module load (line 14), instantiating GFXState before any component exists. `useThree` uses no React hooks; it's a plain service factory. The `use` prefix is a false contract.

Fix:
- Rename to `src/services/gfxService.ts`, export functions directly
- Remove top-level `init()` call; call lazily inside `attachAndRender` with an already-initialized guard
- Update import in `ThreeImpl.tsx`

### B2. Reduce `getAPI()` allocation in the render loop

**File:** `src/services/useThree.ts:177, 50`

`stateAPI()` allocates a fresh 20-property object every call. Called at least twice per frame (`render()` + `checkIntersections()`). ~120 allocations/second.

Fix: call `getAPI()` once at the top of `render()`, destructure, pass values down. Or expose the GFXState instance directly via `export function getInstance(): GFXState`.

### B3. Extract slider bounds to constants

**Files:** `src/ThreeImpl/ThreeImpl.tsx:172-190`, `src/lib/constants.ts`

Magic numbers: `min={270}`, `max={1280}`, `step={16}` (dimensions); `min={0.05}`, `max={2}`, `step={0.01}` (eye sep).

Fix: add `STEREO_DIM_MIN`, `STEREO_DIM_MAX`, `STEREO_DIM_STEP`, `EYE_SEP_MIN`, `EYE_SEP_MAX`, `EYE_SEP_STEP` to `constants.ts`.

---

## Phase C — Cleanup

### C1. Delete dead code in main.tsx
**File:** `src/main.tsx:10-48` — 38 lines of commented-out camera/WebXR init. Delete.

### C2. Delete dead code in vfsApi.ts
**File:** `src/lib/vfsApi.ts` — large commented-out persistent storage block. Delete.

### C3. Remove EasyPicImpl stubs
**File:** `src/EasyPicImpl/EasyPicImpl.tsx:15-16` — `handle2`/`handle3` are empty. Remove functions and their buttons.

### C4. Fix error swallowing in render loop
**File:** `src/services/useThree.ts:211` — `console.log('fug', {e})`. Change to `console.error('stereoVis error', e)`.

### C5. Remove redundant display override in App.tsx
**File:** `src/App.tsx:50, 58, 66` — `style={{ display: activeTab === "tabN" ? "flex" : "none" }}` duplicates what Radix `<Content>` already does. Remove the inline style props.

### C6. Fix TfjsImpl useEffect deps
**File:** `src/TfjsImpl/TfjsImpl.tsx:68` — `imgRef.current` (ref, not a dep) and `loadModel` (module-scope fn, causes reload every render) are in the dep array. Fix: remove `imgRef.current`, wrap `loadModel` in `useCallback`.

### C7. Remove unused TensorFlow backend
**File:** `src/TfjsImpl/TfjsImpl.tsx:5-6`, `package.json` — both `webgl` and `webgpu` backends imported; only one runs. Keep `webgl`, remove `webgpu` import and package.

---

## Phase D — Tooling

### D1. ESLint rules
**File:** `eslint.config.js` — add `'no-console': 'warn'` and `'@typescript-eslint/no-explicit-any': 'error'`.

### D2. tsconfig strictness
**File:** `tsconfig.app.json` — add `"noImplicitReturns": true`.

### D3. Pre-commit lint gate
Add a pre-commit hook that runs `pnpm lint` and blocks on errors (use `lint-staged` or a plain `.git/hooks/pre-commit` script).

---

## Verification

After Phase A:
- [ ] Devtools → Performance: no orphaned RAF callbacks after tab switch
- [ ] `document.querySelectorAll('canvas')`: 2 while ThreeImpl mounted, 0 after unmount
- [ ] Rapid slider moves: `gfxSetup` not called (verify with temp log)
- [ ] `pnpm build` passes

After all phases:
- [ ] `pnpm lint` — zero warnings
- [ ] `pnpm build` — zero TS errors
- [ ] Smoke test: chessboard mode → 10+ pair captures → Calibrate → disparity + reproject maps appear
- [ ] Tab switching: loop pauses when ThreeImpl hidden, resumes on return

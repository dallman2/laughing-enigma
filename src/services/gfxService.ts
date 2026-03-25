import * as THREE from 'three';

import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import { doStereoCalibration } from '../lib/stereoCalibration';
import { doStereoVis } from '../lib/stereoVision';
import { prepareCalibrationScene, generateProps } from '../lib/sceneCreation';
import { init, getAPI } from '../lib/gfx_state';
import { ConfigType } from '../ThreeImpl/ThreeImpl';
import { INITIAL_STEREO_HEIGHT, INITIAL_STEREO_WIDTH, VIEWER_SCALING_FACTOR } from '../lib/constants';

let initialized = false;

function ensureInit() {
  if (!initialized) {
    init();
    initialized = true;
  }
}

/**
 * the active scene
 */
function getScene(): THREE.Scene {
  const { scene, calibrationScene, calibrationMode } = getAPI();
  return calibrationMode ? calibrationScene : scene;
}

/**
 * this function acts as a toggle switch
 * between calibration mode and normal mode
 */
function toggleCalibrationMode() {
  const { setCalibrationMode, calibrationMode } = getAPI();
  const newVal = !calibrationMode;
  setCalibrationMode(newVal);
  return newVal;
}

/**
 * set the capture flag to true, a frame will be captured on the next render loop
 */
function captureCalibrationPair(): number {
  const { setCaptureCalibPair, capturedCalibPairs } = getAPI();
  setCaptureCalibPair(true);
  return capturedCalibPairs.length + 1;
}

/**
 * calculate objects intersecting the picking ray
 */
function checkIntersections(state: ReturnType<typeof getAPI>) {
  const { raycaster, pointer, scene, camera, raycastExcludeList, intersectedObj, oldColor, setIntersectedObj, handleIntersectionUpdate, revertIntersectedObjColor } = state;
  raycaster.setFromCamera(pointer, camera);
  const intersects = raycaster.intersectObjects<THREE.Mesh<THREE.BufferGeometry, THREE.MeshLambertMaterial>>(scene.children, false);
  if (
    intersects.length > 0 &&
    !raycastExcludeList.includes(intersects[0].object.id)
  ) {
    if (intersectedObj != intersects[0].object) {
      if (intersectedObj) {
        intersectedObj.material.emissive.setHex(oldColor);
      }
      setIntersectedObj(intersects[0].object);
      handleIntersectionUpdate();
    }
  } else {
    if (intersectedObj) {
      revertIntersectedObjColor()
    }
    setIntersectedObj(null);
  }
}

/**
 * calculate pointer position in normalized device coordinates,
 * (-1 to +1) for both components
 */
const movePointerHandler = (ev: PointerEvent) => {
  const { pointer } = getAPI();
  pointer.y = -(ev.offsetY / (INITIAL_STEREO_HEIGHT * VIEWER_SCALING_FACTOR)) * 2 + 1;
  pointer.x = (ev.offsetX / (INITIAL_STEREO_WIDTH * VIEWER_SCALING_FACTOR)) * 2 - 1;
}

const clickHandler = () => {
  const { intersectedObj } = getAPI();
  if (intersectedObj?.type == 'Mesh') console.log(intersectedObj.uuid);
}

let renderer: THREE.WebGLRenderer | null = null;
let stereoRenderer: THREE.WebGLRenderer | null = null;

/**
 * stuff that only has to happen on first load
 */
function gfxSetup(el: HTMLDivElement, stereoEl: HTMLDivElement) {
  const { origin, viewerDims, resetState, setCamera, setStereoCamera } = getAPI();
  resetState();

  renderer = new THREE.WebGLRenderer({ antialias: true });
  stereoRenderer = new THREE.WebGLRenderer({ antialias: true });

  const newCamera = new THREE.PerspectiveCamera(
    90,
    viewerDims.w / viewerDims.h,
    0.1,
    1000
  );
  newCamera.position.set(10, 10, 10);
  newCamera.lookAt(origin);

  prepareCalibrationScene(8, 8);
  generateProps();
  const newStereoCam = new THREE.StereoCamera();
  newStereoCam.update(newCamera);
  renderer.setSize(viewerDims.w * 2, viewerDims.h * 2);
  stereoRenderer.setSize(viewerDims.w, viewerDims.h / 2);
  const controls = new OrbitControls(newCamera, renderer.domElement);
  controls.update();
  el.replaceChildren(renderer.domElement);
  stereoEl.replaceChildren(stereoRenderer.domElement);
  renderer.domElement.style.width = `${Math.floor(INITIAL_STEREO_WIDTH * VIEWER_SCALING_FACTOR).toFixed(0)}px`;
  renderer.domElement.style.height = `${Math.floor(INITIAL_STEREO_HEIGHT * VIEWER_SCALING_FACTOR).toFixed(0)}px`;
  renderer.domElement.id = 'main-viewer';
  stereoRenderer.domElement.style.width = `${INITIAL_STEREO_WIDTH * 2}px`;
  stereoRenderer.domElement.style.height = `${INITIAL_STEREO_HEIGHT}px`;
  stereoRenderer.domElement.id = 'stereo-viewer';
  renderer.domElement.addEventListener('pointermove', movePointerHandler);
  renderer.domElement.addEventListener('click', clickHandler);

  setCamera(newCamera);
  setStereoCamera(newStereoCam);
}

/**
 * calls the setup method, preps the render function,
 * and attaches the render loop. returns a dispose function for cleanup.
 */
function attachAndRender(el: HTMLDivElement, stereoEl: HTMLDivElement, leftOut: HTMLCanvasElement, rightOut: HTMLCanvasElement, dispMapEl: HTMLCanvasElement, reprojectMapEl: HTMLCanvasElement, config: ConfigType): () => void {
  ensureInit();

  const { eyeSep: newEyeSep, stereoWidth, stereoHeight } = config;
  const { f, setEyeSep, setViewerDimensions } = getAPI();
  setEyeSep(newEyeSep);
  setViewerDimensions({ w: stereoWidth, h: stereoHeight });

  gfxSetup(el, stereoEl);
  const size = new THREE.Vector2();

  cancelAnimationFrame(f);

  /**
   * this is the render loop
   */
  function render() {
    const state = getAPI();
    const { camera, origin, stereoCam, eyeSep, setFrameCounter } = state;

    camera.lookAt(origin);
    camera.updateMatrixWorld();
    checkIntersections(state);

    renderer!.clear();
    renderer!.render(getScene(), camera);

    // ============================================================================
    // code from stackoverflow https://stackoverflow.com/questions/61052900/can-anyone-explain-what-is-going-on-in-this-code-for-three-js-stereoeffect
    camera.updateWorldMatrix(true, true);
    stereoCam.update(camera);
    stereoCam.eyeSep = eyeSep;
    stereoRenderer!.getSize(size);
    stereoRenderer!.setScissorTest(true);
    stereoRenderer!.setScissor(0, 0, size.width / 2, size.height);
    stereoRenderer!.setViewport(0, 0, size.width / 2, size.height);
    stereoRenderer!.render(getScene(), stereoCam.cameraL);
    stereoRenderer!.setScissor(size.width / 2, 0, size.width / 2, size.height);
    stereoRenderer!.setViewport(size.width / 2, 0, size.width / 2, size.height);
    stereoRenderer!.render(getScene(), stereoCam.cameraR);

    stereoRenderer!.setScissorTest(false);
    // ============================================================================
    // every fourth frame, do stereovis
    if (state.f % 4 == 0) {
      try {
        doStereoVis(stereoRenderer!.domElement, leftOut, rightOut, dispMapEl, reprojectMapEl);
      } catch (e) {
        console.error('stereoVis error', e);
      }
    }
    setFrameCounter(requestAnimationFrame(render));
  }

  render();

  return function dispose() {
    const { f } = getAPI();
    cancelAnimationFrame(f);
    if (renderer) {
      renderer.domElement.removeEventListener('pointermove', movePointerHandler);
      renderer.domElement.removeEventListener('click', clickHandler);
      renderer.domElement.remove();
      renderer.dispose();
      renderer = null;
    }
    if (stereoRenderer) {
      stereoRenderer.domElement.remove();
      stereoRenderer.dispose();
      stereoRenderer = null;
    }
  };
}

/**
 * update config values without rebuilding the scene or restarting the render loop
 */
function updateConfig(config: ConfigType) {
  ensureInit();
  const { eyeSep, stereoWidth, stereoHeight } = config;
  const { setEyeSep, setViewerDimensions } = getAPI();
  setEyeSep(eyeSep);
  setViewerDimensions({ w: stereoWidth, h: stereoHeight });
  if (renderer && stereoRenderer) {
    const { viewerDims } = getAPI();
    renderer.setSize(viewerDims.w * 2, viewerDims.h * 2);
    stereoRenderer.setSize(viewerDims.w, viewerDims.h / 2);
  }
}

function getStereoCalibrationResults() {
  return getAPI().calibResults;
}

export {
  attachAndRender,
  updateConfig,
  toggleCalibrationMode,
  captureCalibrationPair,
  doStereoCalibration,
  getStereoCalibrationResults,
};

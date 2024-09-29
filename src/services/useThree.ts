import * as THREE from 'three';

import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import { doStereoCalibration } from '../lib/stereoCalibration';
import { doStereoVis } from '../lib/stereoVision';
import { prepareCalibrationScene, generateProps } from '../lib/sceneCreation';
import { init, getAPI } from '../lib/gfx_state';
import { ConfigType } from '../ThreeImpl/ThreeImpl';
import { INITIAL_STEREO_HEIGHT, INITIAL_STEREO_WIDTH } from '../lib/constants';


console.log('calling init');
init();

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
 * effectively, the emissiveity property 'travels' from object to object
 * thats why we have an intersectedObj variable
 */
function checkIntersections() {
  const { raycaster, pointer, scene, camera, raycastExcludeList, intersectedObj, oldColor, setIntersectedObj, handleIntersectionUpdate, revertIntersectedObjColor } = getAPI();
  // update the picking ray with the camera and pointer position
  raycaster.setFromCamera(pointer, camera);
  const intersects = raycaster.intersectObjects<THREE.Mesh<THREE.BufferGeometry, THREE.MeshLambertMaterial>>(scene.children, false);
  //are there objects in the intersection list and are they NOT excluded?
  if (
    intersects.length > 0 &&
    !raycastExcludeList.includes(intersects[0].object.id)
  ) {
    //is the intersected object from the last frame the same as the current intersected object?
    if (intersectedObj != intersects[0].object) {
      // does the previous intersected object exist? (ie, are we going from one object straight to another?)
      if (intersectedObj) {
        //set the emissivity back to the old color, this prevents us from leaving a 'trail' of highlighted objects
        intersectedObj.material.emissive.setHex(oldColor);
      }
      // set the intersected object to the currently moused over object
      setIntersectedObj(intersects[0].object);
      // save the old emissivity color before changing it, 
      // then set the emissive light color of the newly moused over obj
      handleIntersectionUpdate();
    }
  } else {
    // if we had an object that was intersected before, but now we dont, set its color back to original
    // then we set it to null
    if (intersectedObj) {
      revertIntersectedObjColor()
    }
    setIntersectedObj(null);
  }
}

/**
 * calculate pointer position in normalized device coordinates,
 * (-1 to +1) for both components. note that the y component is inverted,
 * and that we assume that the main viewer is double the size of each
 * camera in the stereo pair, (ie, the viewer is 2x the width and 2x the height)
 */
const movePointerHandler = (ev: PointerEvent) => {
  const { pointer } = getAPI();
  pointer.y = -(ev.offsetY / (INITIAL_STEREO_HEIGHT * 2)) * 2 + 1;
  pointer.x = (ev.offsetX / (INITIAL_STEREO_WIDTH * 2)) * 2 - 1;
}

const clickHandler = () => {
  const { intersectedObj } = getAPI();
  if (intersectedObj?.type == 'Mesh') console.log(intersectedObj.uuid);
}


// create the renderers
const renderer = new THREE.WebGLRenderer({ antialias: true }),
  stereoRenderer = new THREE.WebGLRenderer({ antialias: true });

/**
 * stuff that only has to happen on first load
 */
function gfxSetup(el: HTMLDivElement, stereoEl: HTMLDivElement) {
  const { origin, viewerDims, resetState, setCamera, setStereoCamera } = getAPI();
  resetState();
  // create the camera and set it up
  const newCamera = new THREE.PerspectiveCamera(
    90,
    viewerDims.w / viewerDims.h,
    0.1,
    1000
  );
  newCamera.position.set(10, 10, 10);
  newCamera.lookAt(origin);

  // // create the calibration props for stereo vis
  prepareCalibrationScene(8, 8);
  // create some props and add them
  generateProps();
  // create the stereo cam
  const newStereoCam = new THREE.StereoCamera();
  newStereoCam.update(newCamera);
  // setup for renderers
  renderer.setSize(viewerDims.w * 2, viewerDims.h * 2);
  stereoRenderer.setSize(viewerDims.w, viewerDims.h / 2);
  // dont really know where to put this
  const controls = new OrbitControls(newCamera, renderer.domElement);
  controls.update();
  // add the renderers to the dom (maybe)
  if (el.children.length === 0) el.appendChild(renderer.domElement);
  if (stereoEl.children.length === 0) stereoEl.appendChild(stereoRenderer.domElement);
  // ensure the renderer is a consistent size
  renderer.domElement.style.width = `${INITIAL_STEREO_WIDTH * 2}px`;
  renderer.domElement.style.height = `${INITIAL_STEREO_HEIGHT * 2}px`;
  stereoRenderer.domElement.style.width = `${INITIAL_STEREO_WIDTH * 2}px`;
  stereoRenderer.domElement.style.height = `${INITIAL_STEREO_HEIGHT}px`;
  // setup event listeners for raycasting stuff
  renderer.domElement.removeEventListener('pointermove', movePointerHandler)
  renderer.domElement.removeEventListener('click', clickHandler);
  renderer.domElement.addEventListener('pointermove', movePointerHandler);
  renderer.domElement.addEventListener('click', clickHandler);

  setCamera(newCamera);
  setStereoCamera(newStereoCam);
  return { renderer, stereoRenderer };
}

/**
 * calls the setup method, preps the render function,
 * and attaches the render loop
 */
function attachAndRender(el: HTMLDivElement, stereoEl: HTMLDivElement, leftOut: HTMLCanvasElement, rightOut: HTMLCanvasElement, dispMapEl: HTMLCanvasElement, reprojectMapEl: HTMLCanvasElement, config: ConfigType) {
  THREE.Cache.clear();

  const { eyeSep: newEyeSep, stereoWidth, stereoHeight } = config;
  const { scene, calibrationScene, f, setEyeSep, setViewerDimensions } = getAPI();
  // set the config values
  setEyeSep(newEyeSep);
  setViewerDimensions({ w: stereoWidth, h: stereoHeight });

  const { renderer, stereoRenderer } = gfxSetup(el, stereoEl);
  const size = new THREE.Vector2();
  console.log('gfx setup complete');

  cancelAnimationFrame(f);

  /**
   * this is the render loop. it performs dark magic
   */
  function render() {
    const { camera, origin, stereoCam, eyeSep, f, setFrameCounter } = getAPI();

    camera.lookAt(origin);
    camera.updateMatrixWorld();
    // do the raycasting
    checkIntersections();

    renderer.clear();
    renderer.render(getScene(), camera);

    // ============================================================================
    // code from stackoverflow https://stackoverflow.com/questions/61052900/can-anyone-explain-what-is-going-on-in-this-code-for-three-js-stereoeffect
    camera.updateWorldMatrix(true, true);
    stereoCam.update(camera);
    // baseline setter
    // console.log('eye sep', eyeSep);
    stereoCam.eyeSep = eyeSep;
    // this is described in the post on stackoverflow
    stereoRenderer.getSize(size);
    stereoRenderer.setScissorTest(true);
    stereoRenderer.setScissor(0, 0, size.width / 2, size.height);
    stereoRenderer.setViewport(0, 0, size.width / 2, size.height);
    stereoRenderer.render(getScene(), stereoCam.cameraL);
    stereoRenderer.setScissor(size.width / 2, 0, size.width / 2, size.height);
    stereoRenderer.setViewport(size.width / 2, 0, size.width / 2, size.height);
    stereoRenderer.render(getScene(), stereoCam.cameraR);

    stereoRenderer.setScissorTest(false);
    // ============================================================================
    // every fourth frame, do stereovis
    if (f % 4 == 0) {
      try {
        doStereoVis(stereoRenderer.domElement, leftOut, rightOut, dispMapEl, reprojectMapEl);
      } catch (e) {
        console.log('fug', { e });
      }
    }
    setFrameCounter(requestAnimationFrame(render));
  }

  console.log('render loop started', scene, calibrationScene);

  render();
}

export default function useThree() {
  return {
    attachAndRender,
    toggleCalibrationMode,
    captureCalibrationPair,
    doStereoCalibration,
    getStereoCalibrationResults: () => getAPI().calibResults,
    haveCalibResults: getAPI().haveCalibResults,
  };
}

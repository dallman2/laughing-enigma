import * as THREE from 'three';
import ScalarMatMap from './ScalarMatMap';
import { Mat } from 'mirada';
import { INITIAL_EYE_SEP, INITIAL_HIGHLIGHT_COLOR, INITIAL_STEREO_HEIGHT, INITIAL_STEREO_WIDTH } from './constants';

type ViewerDimensions = {
  w: number;
  h: number;
};
type StereoImagePair = {
  l: Mat;
  r: Mat;
};
type MapPair = {
  map1: Mat;
  map2: Mat;
};
type DistMapsAndQ = {
  l: MapPair;
  r: MapPair;
  q: Mat;
};

let classInstance: GFXState | null = null;

class StereoMatcher {
  stereoBM: any;
  constructor() {
    this.stereoBM = null;
  }
  setBM(inst: any) {
    this.stereoBM = inst;
  }
}
/**
 * this is a singleton class of the state object. we use this
 * state object rather than pinia for *pure speed*
 */
class GFXState {
  HIGHLIGHT_COLOR: number;
  origin: THREE.Vector3;
  viewerDims: ViewerDimensions;
  /** the camera we use to look at the scene */
  camera: THREE.PerspectiveCamera;
  /** the stereo cam helper obj used for stereo vis */
  stereoCam: THREE.StereoCamera;
  /** the scene */
  scene: THREE.Scene;
  /** the scene used for stereo calibration */
  calibrationScene: THREE.Scene;
  /** render the calibration scene? */
  calibrationMode: boolean;
  /** should i capture a frame for calibration on the next render? */
  captureCalibPair: boolean;
  /** list of captured pairs to be used in calibration*/
  capturedCalibPairs: StereoImagePair[];
  /** an object with the results of stereo calibration */
  calibResults: DistMapsAndQ;
  /** do we have calibration results to show? */
  haveCalibResults: boolean;
  /** stereo bm object */
  stereoMatcher: StereoMatcher;
  /** this class contains mats filled with scalars */
  scalarMap: ScalarMatMap;
  /** used for raycasting, the actual raycaster */
  raycaster: THREE.Raycaster;
  /** used for raycasting, stores the location of the mouse on the canvas */
  pointer: THREE.Vector2;
  /** used for raycasting, stores the currently intersected object  */
  intersectedObj: THREE.Mesh<THREE.BufferGeometry, THREE.MeshLambertMaterial> | null;
  /** used for raycasting, stores the original color of an object */
  oldColor: number;
  /** a list of all objects which are to be passed over during raycasting */
  raycastExcludeList: THREE.Object3D['id'][];
  /** a map representing all renderable objects currently in the world */
  worldMap: { calib: Record<string, THREE.Object3D>; prod: Record<string, THREE.Object3D>; };
  /** the distance between the two eyes */
  eyeSep: number;
  /** frame counter */
  f: number;

  constructor() {
    this.HIGHLIGHT_COLOR = INITIAL_HIGHLIGHT_COLOR;
    this.origin = new THREE.Vector3(0, 0, 0);
    this.viewerDims = {
      w: INITIAL_STEREO_WIDTH,
      h: INITIAL_STEREO_HEIGHT,
    };
    this.camera = new THREE.PerspectiveCamera();
    this.stereoCam = new THREE.StereoCamera();
    this.scene = new THREE.Scene();
    this.calibrationScene = new THREE.Scene();
    this.calibrationMode = false;
    this.captureCalibPair = false;
    this.capturedCalibPairs = [];
    //@ts-expect-error this is really a `DistMapsAndQ` object, but we have to initialize it as null
    this.calibResults = null;
    this.haveCalibResults = false;
    this.stereoMatcher = new StereoMatcher();
    this.scalarMap = new ScalarMatMap();
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.intersectedObj = null;
    this.oldColor = 0;
    this.raycastExcludeList = [];
    this.worldMap = {
      calib: {},
      prod: {},
    };
    this.eyeSep = INITIAL_EYE_SEP;
    this.f = 0;

    this.resetState();
  }
  /**
   * this function just resets the hidden state in this file.
   * We have to do this because we might navigate away from the page that is rendering.
   * When we navigate back, the attachAndRender function is called again, which would
   * duplicate items and cause all sorts of issues if everything is not in the original state
   */
  resetState() {
    this.freeMats(this.capturedCalibPairs.map((pair) => pair.l).concat(this.capturedCalibPairs.map((pair) => pair.r)));
    if (this.haveCalibResults) this.freeMats([this.calibResults.l.map1, this.calibResults.l.map2, this.calibResults.r.map1, this.calibResults.r.map2, this.calibResults.q]);

    this.camera = new THREE.PerspectiveCamera();
    this.stereoCam = new THREE.StereoCamera();
    this.scene = new THREE.Scene();
    this.calibrationScene = new THREE.Scene();
    this.calibrationMode = false;
    this.captureCalibPair = false;
    this.capturedCalibPairs = [];
    //@ts-expect-error this is really a `DistMapsAndQ` object, but we have to initialize it as null
    this.calibResults = null;
    this.haveCalibResults = false;
    this.stereoMatcher = new StereoMatcher();
    this.scalarMap = new ScalarMatMap();
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.intersectedObj = null;
    this.oldColor = 0;
    this.raycastExcludeList = [];
    this.worldMap = {
      calib: {},
      prod: {},
    };
    // this.eyeSep = INITIAL_EYE_SEP;
    this.f = 0;

    this.scene.background = new THREE.Color(0xf0f0f0);
    this.scene.name = 'prod';
    this.calibrationScene.background = new THREE.Color(0xffffff);
    this.calibrationScene.name = 'calib';
  }

  /**
   * free memory of all the mats passed in
   */
  freeMats(mats: Mat[]) {
    for (const mat of mats) {
      mat.delete();
      // mat.release();
    }
  }

  stateAPI() {
    return {
      HIGHLIGHT_COLOR: this.HIGHLIGHT_COLOR,
      origin: this.origin,
      viewerDims: this.viewerDims,
      camera: this.camera,
      stereoCam: this.stereoCam,
      scene: this.scene,
      calibrationScene: this.calibrationScene,
      calibrationMode: this.calibrationMode,
      captureCalibPair: this.captureCalibPair,
      capturedCalibPairs: this.capturedCalibPairs,
      calibResults: this.calibResults,
      haveCalibResults: this.haveCalibResults,
      stereoMatcher: this.stereoMatcher,
      scalarMap: this.scalarMap,
      raycaster: this.raycaster,
      pointer: this.pointer,
      intersectedObj: this.intersectedObj,
      oldColor: this.oldColor,
      raycastExcludeList: this.raycastExcludeList,
      worldMap: this.worldMap,
      eyeSep: this.eyeSep,
      f: this.f,
      resetState: () => this.resetState(),
      freeMats: (...mats: Mat[]) => this.freeMats(mats),

      setCamera: (val: THREE.PerspectiveCamera) => (this.camera = val),
      setStereoCamera: (val: THREE.StereoCamera) => (this.stereoCam = val),
      setFrameCounter: (val: number) => (this.f = val),
      setCalibrationMode: (val: boolean) => (this.calibrationMode = val),
      setCaptureCalibPair: (val: boolean) => (this.captureCalibPair = val),
      setIntersectedObj: (val: THREE.Mesh<THREE.BufferGeometry, THREE.MeshLambertMaterial> | null) => (this.intersectedObj = val),
      setHaveCalibResults: (val: boolean) => (this.haveCalibResults = val),
      setCalibResults: (val: DistMapsAndQ) => (this.calibResults = val),
      setEyeSep: (val: number) => (this.eyeSep = val),
      /** supply this with the target dims of __ONE OF__ the stereo cameras (the main viewer is 4x the size, 2x each edge dimension) */
      setViewerDimensions: ({ w, h }: ViewerDimensions) => (this.viewerDims = { w: w * 2, h: h * 2 }),
      revertIntersectedObjColor: () => {
        if (this.intersectedObj !== null) {
          this.intersectedObj.material.emissive.setHex(this.oldColor);
        }
      },
      handleIntersectionUpdate: () => {
        if (this.intersectedObj !== null) {
          this.oldColor = this.intersectedObj.material.emissive.getHex()
          this.intersectedObj.material.emissive.setHex(this.HIGHLIGHT_COLOR)
        }
      }
    };
  }
}
/**
 * to be called at the very beginning to set up the instance
 */
function init() {
  if (classInstance) console.log('gfxstate already initialized?');
  else classInstance = new GFXState();
}
/**
 * the singleton instances properties as a callable function
 */
function getAPI() {
  return (classInstance as GFXState).stateAPI();
}

export { init, getAPI };

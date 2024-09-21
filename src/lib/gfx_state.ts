import * as THREE from 'three';
import ScalarMatMap from './ScalarMatMap';
import { Mat } from 'mirada';

type ViewerDimensions = {
  w: number;
  h: number;
};
type StereoImagePair = {
  l: Mat;
  r: Mat;
};
type MapPair = {
  mat1: Mat;
  mat2: Mat;
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
  calibResults: DistMapsAndQ | null;
  /** do we have calibration results to show? */
  haveCalibResults: boolean;
  /** stereo bm object */
  stereoMatcher: StereoMatcher;
  /** this class contains mats filled with scalars */
  scalarMap: ScalarMatMap | null;
  /** used for raycasting, the actual raycaster */
  raycaster: THREE.Raycaster;
  /** used for raycasting, stores the location of the mouse on the canvas */
  pointer: THREE.Vector2;
  /** used for raycasting, stores the currently intersected object  */
  intersectedObj: THREE.Mesh<any, THREE.MeshLambertMaterial> | null;
  /** used for raycasting, stores the original color of an object */
  oldColor: number;
  /** a list of all objects which are to be passed over during raycasting */
  raycastExcludeList: THREE.Object3D['id'][];
  /** a map representing all renderable objects currently in the world */
  worldMap: { calib: Record<string, THREE.Object3D>; prod: Record<string, THREE.Object3D>; };
  /** frame counter */
  f: number;

  constructor() {
    this.HIGHLIGHT_COLOR = 0xff0000;
    this.origin = new THREE.Vector3(0, 0, 0);
    this.viewerDims = {
      w: 1280,
      h: 720,
    };
    this.camera = new THREE.PerspectiveCamera();
    this.stereoCam = new THREE.StereoCamera();
    this.scene = new THREE.Scene();
    this.calibrationScene = new THREE.Scene();
    this.calibrationMode = false;
    this.captureCalibPair = false;
    this.capturedCalibPairs = [];
    this.calibResults = null;
    this.haveCalibResults = false;
    this.stereoMatcher = new StereoMatcher();
    this.scalarMap = null;
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.intersectedObj = null;
    this.oldColor = 0;
    this.raycastExcludeList = [];
    this.worldMap = {
      calib: {},
      prod: {},
    };
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
    this.camera = new THREE.PerspectiveCamera();
    this.stereoCam = new THREE.StereoCamera();
    this.scene = new THREE.Scene();
    this.calibrationScene = new THREE.Scene();
    this.calibrationMode = false;
    this.captureCalibPair = false;
    this.capturedCalibPairs = [];
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
      f: this.f,
      resetState: () => this.resetState(),
      freeMats: (...mats: Mat[]) => this.freeMats(mats),
    };
  }
}
/**
 * to be called at the very beginning to set up the instance
 */
function init() {
  console.log('gfxstate init');
  if (!classInstance) classInstance = new GFXState();
}
/**
 * the singleton instances properties as a callable function
 */
function getAPI() {
  return (classInstance as GFXState).stateAPI();
}

export { init, getAPI };

import * as THREE from 'three';
import { init, getAPI } from './gfx_state';

let {
  HIGHLIGHT_COLOR,
  origin,
  viewerDims,
  camera,
  stereoCam,
  scene,
  calibrationScene,
  calibrationMode,
  captureCalibPair,
  capturedCalibPairs,
  calibResults,
  haveCalibResults,
  stereoMatcher,
  scalarMap,
  raycaster,
  pointer,
  intersectedObj,
  oldColor,
  raycastExcludeList,
  worldMap,
  f,
  resetState,
  freeMats,
} = getAPI();
/**
 * create the scene for calibration
 * @param {number} rows rows in the chessboard
 * @param {number} cols cols in the chessboard
 * @return {obj<string, array>} an object with two keys, ```inc``` and ```exc```, refering to objects to include and exclude
 */
function prepareCalibrationScene(rows, cols) {
  const ambLight = new THREE.AmbientLight(0xffffff, 0.5),
    geometry = new THREE.PlaneGeometry(1, 1),
    blackMaterial = new THREE.MeshBasicMaterial({
      color: 0x000000,
      side: THREE.DoubleSide,
    }),
    whiteMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
    });

  let squares = [];
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      // every other square should be white
      let square;
      if ((i % 2 && j % 2) || (!(i % 2) && !(j % 2)))
        square = new THREE.Mesh(geometry, blackMaterial);
      else square = new THREE.Mesh(geometry, whiteMaterial);
      square.position.set(i - cols / 2, j - rows / 2, 0);
      squares.push(square);
    }
  }

  addObjToCollection(
    {
      inc: [...squares],
      exc: [ambLight],
    },
    calibrationScene,
    calibrationScene.name
  );
}

/**
 * @return {obj<string, array>} an object with two keys, ```inc``` and ```exc```, refering to objects to include and exclude
 */
function generateProps() {
  const ambLight = new THREE.AmbientLight(0xffffff, 0.3),
    lightGroup = new THREE.Group(),
    light1 = new THREE.PointLight(0xffffff, 0.8),
    helper = new THREE.Box3Helper(
      new THREE.Box3(origin, new THREE.Vector3(2, 2, 2)),
      0x000000
    ),
    gridHelper = new THREE.GridHelper(10, 10, 0x00ffff, 0xff00ff),
    geometry = new THREE.BoxBufferGeometry(1, 1, 1);

  helper.position.set(origin);
  light1.position.set(1, 1, 1);
  addObjToCollection(
    { inc: [], exc: [helper, light1] },
    lightGroup,
    scene.name
  );
  lightGroup.position.set(10, 75, 10);
  gridHelper.position.set(0, -10, 0);

  const cubes = [
    0x00ff00, 0x44ff00, 0x00ff88, 0x88ff00, 0x00ffcc, 0xccff00, 0x00ffee,
  ].map((c, idx) => {
    const cube = new THREE.Mesh(
      geometry,
      new THREE.MeshLambertMaterial({ color: c })
    );
    cube.position.set(idx * 2, 0, idx);
    return cube;
  });

  addObjToCollection(
    {
      inc: [...cubes],
      exc: [gridHelper, ambLight, lightGroup],
    },
    scene,
    scene.name
  );
}

/**
 * @typedef IncExcMap this is an object that contains information necessary to add object to a scene
 * @type {Object}
 * @prop {THREE.Object3D[]} inc - this list is for objects that are to be included in raycasting calculations
 * @prop {THREE.Object3D[]} exc - this list is for objects that are to be excluded in raycasting calculations
 */

/**
 *
 * @param {IncExcMap} objMap the object(s) you want to add to the scene
 * @param {THREE.Scene | THREE.Group} collection which collection should this object be added to?
 * @param {string} sceneKey the scene (either ```calib``` or ```prod```) to associate this collection of objects with
 */
function addObjToCollection(objMap, collection, sceneKey) {
  /**
   * @param {THREE.Object3D} el
   */
  let pusher = (el) => {
    worldMap[sceneKey][el.uuid] = el;
    collection.add(el);
  };
  objMap.exc.forEach((el) => raycastExcludeList.push(el.id));
  objMap.exc.forEach(pusher);
  objMap.inc.forEach(pusher);
}

export { generateProps, prepareCalibrationScene };

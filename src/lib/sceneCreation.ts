import * as THREE from 'three';
import { getAPI } from './gfx_state';

type IncExcMap = {
  inc: THREE.Object3D[];
  exc: THREE.Object3D[];
};

/**
 * create the scene for calibration
 * @param {number} rows rows in the chessboard
 * @param {number} cols cols in the chessboard
 */
function prepareCalibrationScene(rows: number, cols: number) {
  const { calibrationScene } = getAPI();

  const ambLight = new THREE.AmbientLight(0xffffff, 0.3),
    geometry = new THREE.PlaneGeometry(1, 1),
    blackMaterial = new THREE.MeshBasicMaterial({
      color: 0x000000,
      side: THREE.DoubleSide,
    }),
    whiteMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
    });

  const squares = [];
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      // every other square should be white
      const square = ((i % 2 && j % 2) || (!(i % 2) && !(j % 2))) ? new THREE.Mesh(geometry, blackMaterial) : new THREE.Mesh(geometry, whiteMaterial);
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
    calibrationScene.name as 'calib' | 'prod'
  );
}

function generateProps() {
  const { scene, origin } = getAPI();

  const ambLight = new THREE.AmbientLight(0xffffff, 0.3),
    lightGroup = new THREE.Group(),
    light1 = new THREE.PointLight(0xffffff, 0.8),
    helper = new THREE.Box3Helper(
      new THREE.Box3(origin, new THREE.Vector3(2, 2, 2)),
      0x000000
    ),
    gridHelper = new THREE.GridHelper(20, 20, 0x005353, 0x530053),
    geometry = new THREE.BoxGeometry(1, 1, 1);

  helper.position.set(origin.x, origin.y, origin.z);
  light1.position.set(1, 1, 1);
  addObjToCollection(
    { inc: [], exc: [helper, light1] },
    lightGroup,
    scene.name as 'calib' | 'prod'
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
    scene.name as 'calib' | 'prod'
  );
}

/**
 * @param {IncExcMap} objMap the object(s) you want to add to the scene
 * @param {THREE.Scene | THREE.Group} collection which collection should this object be added to?
 * @param {string} sceneKey the scene (either ```calib``` or ```prod```) to associate this collection of objects with
 */
function addObjToCollection(objMap: IncExcMap, collection: THREE.Scene | THREE.Group, sceneKey: 'calib' | 'prod') {
  const { raycastExcludeList, worldMap } = getAPI();
  const pusher = (el: THREE.Object3D) => {
    worldMap[sceneKey][el.uuid] = el;
    collection.add(el);
  };
  objMap.exc.forEach((el) => raycastExcludeList.push(el.id));
  objMap.exc.forEach(pusher);
  objMap.inc.forEach(pusher);

  // console.log('worldMap', worldMap);
}

export { generateProps, prepareCalibrationScene };

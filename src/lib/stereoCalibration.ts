import { Mat, MatVector, TermCriteria } from 'mirada';
import { init, getAPI } from './gfx_state';


/**
 * do a chessboard calibration for each of the stereo cameras.
 * i followed the guide found here pretty closely:
 * https://docs.opencv.org/3.4/dc/dbb/tutorial_py_calibration.html
*/
function doStereoCalibration() {
  console.log('calibrating');
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
  // dont do it if there arent pairs
  if (!capturedCalibPairs.length) return;

  /**
   * Perform vision calibration on one image for one camera,
   * to avoid having two of every call
   * @param {Mat} img the image to calibrate on
   * @param {number} r number of inner rows in the chessboard
   * @param {number} c number of inner cols in the chessboard
   * @param {Mat} prePoints grid representing inner corners, use ```prefabbedPoints``` for this
   * @param {MatVector} objPoints part of parallel array, stores the grid
   * @param {MatVector} imgPoints other part of parallel array, stores the distorted grid
   * @param {TermCriteria} crit term critera for finding subpixel corners
   */
  function singleImageCalib(img: Mat, r: number, c: number, prePoints: Mat, objPoints: MatVector, imgPoints: MatVector, crit: TermCriteria) {
    let gray = new cv.Mat(img.size(), cv.CV_8UC1),
      corners = new cv.Mat(new cv.Size(r * c, 2), cv.CV_32F);
    cv.cvtColor(img, gray, cv.COLOR_BGR2GRAY);
    let found = cv.findChessboardCorners(gray, new cv.Size(r, c), corners);
    if (found) {
      objPoints.push_back(prePoints);
      // get this from img proc
      cv.cornerSubPix(
        gray,
        corners,
        new cv.Size(5, 5),
        new cv.Size(-1, -1),
        crit
      );
      imgPoints.push_back(corners);
      // a drawChessboardCorners hook goes here
    }
    freeMats(gray, corners);
  }

  const rows = 7,
    cols = 7,
    dims = 3,
    tc = new cv.TermCriteria(
      cv.TermCriteria_EPS + cv.TermCriteria_MAX_ITER,
      30,
      0.001
    );

  let imgPointsL = new cv.MatVector(),
    imgPointsR = new cv.MatVector(),
    objPointsL: MatVector = new cv.MatVector(),
    objPointsR = new cv.MatVector();
  /** 
   * the prefab matrix which yields the same output as
   * ```
   * objp = np.zeros((6*7,3), np.float32)
   * objp[:,:2] = np.mgrid[0:7,0:6].T.reshape(-1,2)
   * ```
   */
  const prefabbedPoints = cv.Mat.zeros(rows * cols, 1, cv.CV_32FC3);
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      prefabbedPoints.data32F[i * cols * dims + j * dims + 0] = j;
      prefabbedPoints.data32F[i * cols * dims + j * dims + 1] = i;
    }
  }

  capturedCalibPairs.forEach((pair) => {
    let { l, r } = pair;
    singleImageCalib(
      l,
      rows,
      cols,
      prefabbedPoints,
      objPointsL,
      imgPointsL,
      tc
    );
    singleImageCalib(
      r,
      rows,
      cols,
      prefabbedPoints,
      objPointsR,
      imgPointsR,
      tc
    );
  });
  let camMatL = new cv.Mat(),
    distCoeffsL = new cv.Mat(),
    camMatR = new cv.Mat(),
    distCoeffsR = new cv.Mat(),
    rL = new cv.MatVector(),
    tL = new cv.MatVector(),
    rR = new cv.MatVector(),
    tR = new cv.MatVector(),
    essMat = new cv.Mat(),
    fundMat = new cv.Mat(),
    rotL2R = new cv.Mat(),
    transL2R = new cv.Mat();
  try {
    let lCalib = cv.calibrateCamera(
      objPointsL,
      imgPointsL,
      capturedCalibPairs[0].l.size(),
      camMatL,
      distCoeffsL,
      rL,
      tL
    );
    console.log(`left calib err: ${lCalib}`);
    let newCamMatL = cv.getOptimalNewCameraMatrix(
      camMatL,
      distCoeffsL,
      capturedCalibPairs[0].l.size(),
      0
    );
    let rCalib = cv.calibrateCamera(
      objPointsR,
      imgPointsR,
      capturedCalibPairs[0].l.size(),
      camMatR,
      distCoeffsR,
      rR,
      tR
    );
    console.log(`left calib err: ${rCalib}`);
    let newCamMatR = cv.getOptimalNewCameraMatrix(
      camMatR,
      distCoeffsR,
      capturedCalibPairs[0].l.size(),
      0
    );
    let e = cv.stereoCalibrate(
      objPointsL,
      imgPointsL,
      imgPointsR,
      newCamMatL,
      distCoeffsL,
      newCamMatR,
      distCoeffsR,
      capturedCalibPairs[0].l.size(),
      rotL2R,
      transL2R,
      essMat,
      fundMat
    );
    console.log(`error of stereo calib: ${e}`);
    let r1 = new cv.Mat(),
      r2 = new cv.Mat(),
      p1 = new cv.Mat(),
      p2 = new cv.Mat(),
      q = new cv.Mat();
    cv.stereoRectify(
      newCamMatL,
      distCoeffsL,
      newCamMatR,
      distCoeffsR,
      capturedCalibPairs[0].l.size(),
      rotL2R,
      transL2R,
      r1,
      r2,
      p1,
      p2,
      q
    );
    let map1L = new cv.Mat(),
      map2L = new cv.Mat(),
      map1R = new cv.Mat(),
      map2R = new cv.Mat();
    cv.initUndistortRectifyMap(
      newCamMatL,
      distCoeffsL,
      r1,
      p1,
      capturedCalibPairs[0].l.size(),
      cv.CV_16SC2,
      map1L,
      map2L
    );
    cv.initUndistortRectifyMap(
      newCamMatR,
      distCoeffsR,
      r2,
      p2,
      capturedCalibPairs[0].l.size(),
      cv.CV_16SC2,
      map1R,
      map2R
    );

    calibResults['l'] = {
      map1: map1L,
      map2: map2L,
    };
    calibResults['r'] = {
      map1: map1R,
      map2: map2R,
    };
    calibResults['q'] = q;
    haveCalibResults = true;

    // some mats are trapped in vectors, so push all their refs into a list
    let matList = [];
    // @ts-expect-error this is really a vector of mats, but the typescript defs seem to alias `MatVector` to `Mat`
    for (let i = 0; i < objPointsL.size(); i++)
      matList.push(
        imgPointsL.get(i),
        imgPointsR.get(i),
        objPointsL.get(i),
        objPointsR.get(i)
      );
    freeMats(
      // this unnests the images from the captured img pairs list
      ...capturedCalibPairs.reduce((acc, el, idx) => { acc.push(el.l, el.r); return acc }, [] as Mat[]),
      prefabbedPoints,
      camMatL,
      newCamMatL,
      distCoeffsL,
      rL,
      tL,
      camMatR,
      newCamMatR,
      distCoeffsR,
      rR,
      tR,
      essMat,
      fundMat,
      rotL2R,
      transL2R,
      r1,
      r2,
      p1,
      p2,
      ...matList, // destructure the stuff from the matvec
      objPointsL,
      objPointsR,
      imgPointsL,
      imgPointsR
    );
  } catch (err) {
    console.log(err);
  }
}

export { doStereoCalibration };

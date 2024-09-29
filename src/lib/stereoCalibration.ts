import { Mat, MatVector, TermCriteria } from 'mirada';
import { getAPI } from './gfx_state';

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
  const { freeMats } = getAPI();
  const gray = new cv.Mat(img.size(), cv.CV_8UC1),
    corners = new cv.Mat(new cv.Size(r * c, 2), cv.CV_32F);
  cv.cvtColor(img, gray, cv.COLOR_BGR2GRAY);
  if (cv.findChessboardCorners(gray, new cv.Size(r, c), corners)) {
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
    freeMats(gray);
    // a drawChessboardCorners hook goes here
  } else {
    freeMats(gray, corners);
  }
}

/**
 * do a chessboard calibration for each of the stereo cameras.
 * i followed the guide found here pretty closely:
 * https://docs.opencv.org/3.4/dc/dbb/tutorial_py_calibration.html
*/
function doStereoCalibration() {
  console.log('calibrating');
  const {
    setHaveCalibResults,
    capturedCalibPairs,
    setCalibResults,
    freeMats,
  } = getAPI();
  // dont do it if there arent pairs
  if (!capturedCalibPairs.length) {
    console.log('no calib pairs, skipping calibration')
    return
  };
  if (capturedCalibPairs.some(pair => !pair.l || !pair.r)) {
    console.error('how did this even happen? a pair is missing its left or right image')
    return
  };
  if (capturedCalibPairs.some(pair => pair.l.isDeleted() || pair.r.isDeleted())) {
    console.error('how did this even happen? an image has been deleted')
    return
  }


  const rows = 7,
    cols = 7,
    dims = 3,
    tc = new cv.TermCriteria(
      cv.TermCriteria_EPS + cv.TermCriteria_MAX_ITER,
      30,
      0.001
    );

  // these are the parallel arrays that store the calibration data
  const imgPointsL: MatVector = new cv.MatVector(),
    imgPointsR: MatVector = new cv.MatVector(),
    objPointsL: MatVector = new cv.MatVector(),
    objPointsR: MatVector = new cv.MatVector();
  // these are the matrices that will be filled by the calibration functions
  const camMatL = new cv.Mat(),
    camMatR = new cv.Mat(),
    distCoeffsL = new cv.Mat(),
    distCoeffsR = new cv.Mat(),
    translationVecsL = new cv.MatVector(),
    translationVecsR = new cv.MatVector(),
    rotationVecsL = new cv.MatVector(),
    rotationVecsR = new cv.MatVector(),
    essMat = new cv.Mat(),
    fundementalsMat = new cv.Mat(),
    rotationVecTransformL2R = new cv.Mat(),
    translationVecTranformL2R = new cv.Mat();
  // rectification maps
  const r1 = new cv.Mat(),
    r2 = new cv.Mat(),
    p1 = new cv.Mat(),
    p2 = new cv.Mat(),
    q = new cv.Mat();
  // undistort maps
  const map1L = new cv.Mat(),
    map2L = new cv.Mat(),
    map1R = new cv.Mat(),
    map2R = new cv.Mat();
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

  capturedCalibPairs.forEach(({ l, r }) => {
    singleImageCalib(
      l,
      rows,
      cols,
      prefabbedPoints,
      objPointsL,
      imgPointsL,
      tc,
    );
    singleImageCalib(
      r,
      rows,
      cols,
      prefabbedPoints,
      objPointsR,
      imgPointsR,
      tc,
    );
  });
  console.log(`captured ${capturedCalibPairs.length} calibration pairs. results from left camera: ${imgPointsL.size()}, from right camera: ${imgPointsR.size()}`);

  try {
    const lCalib = cv.calibrateCamera(
      objPointsL,
      imgPointsL,
      capturedCalibPairs[0].l.size(),
      camMatL,
      distCoeffsL,
      rotationVecsL,
      translationVecsL
    );
    const newCamMatL = cv.getOptimalNewCameraMatrix(
      camMatL,
      distCoeffsL,
      capturedCalibPairs[0].l.size(),
      0
    );
    const rCalib = cv.calibrateCamera(
      objPointsR,
      imgPointsR,
      capturedCalibPairs[0].l.size(),
      camMatR,
      distCoeffsR,
      rotationVecsR,
      translationVecsR
    );
    const newCamMatR = cv.getOptimalNewCameraMatrix(
      camMatR,
      distCoeffsR,
      capturedCalibPairs[0].l.size(),
      0
    );
    const e = cv.stereoCalibrate(
      objPointsL,
      imgPointsL,
      imgPointsR,
      newCamMatL,
      distCoeffsL,
      newCamMatR,
      distCoeffsR,
      capturedCalibPairs[0].l.size(),
      rotationVecTransformL2R,
      translationVecTranformL2R,
      essMat,
      fundementalsMat
    );
    console.log(`calibration errors:`, { lCalib, rCalib, stereo: e });
    cv.stereoRectify(
      newCamMatL,
      distCoeffsL,
      newCamMatR,
      distCoeffsR,
      capturedCalibPairs[0].l.size(),
      rotationVecTransformL2R,
      translationVecTranformL2R,
      r1,
      r2,
      p1,
      p2,
      q
    );
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

    const calibResults = {
      l: {
        map1: map1L,
        map2: map2L,
      },
      r: {
        map1: map1R,
        map2: map2R,
      },
      q
    }
    setCalibResults(calibResults);
    setHaveCalibResults(true);

    // some mats are trapped in vectors, so push all their refs into a list
    const matList = [];
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
      ...capturedCalibPairs.reduce((acc, el) => { acc.push(el.l, el.r); return acc }, [] as Mat[]),
      prefabbedPoints,
      camMatL,
      newCamMatL,
      distCoeffsL,
      rotationVecsL,
      translationVecsL,
      camMatR,
      newCamMatR,
      distCoeffsR,
      rotationVecsR,
      translationVecsR,
      essMat,
      fundementalsMat,
      rotationVecTransformL2R,
      translationVecTranformL2R,
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
    console.error({ err });
  }
}

export { doStereoCalibration };

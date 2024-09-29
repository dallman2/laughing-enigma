import Timer from './Timer';
import { getAPI } from './gfx_state';


/**
 * do the thing, ya know?
 * the block matching/ calib stuff tutorial was found on
 * https://learnopencv.com/depth-perception-using-stereo-camera-python-c/#block-matching-for-dense-stereo-correspondence
 * as well as
 * https://docs.opencv.org/3.4/dc/dbb/tutorial_py_calibration.html
*/
function doStereoVis(stereoCamDomEl: HTMLCanvasElement, leftOut: HTMLCanvasElement, rightOut: HTMLCanvasElement, dispMapEl: HTMLCanvasElement, reprojectMapEl: HTMLCanvasElement) {
  const {
    calibrationMode,
    captureCalibPair,
    capturedCalibPairs,
    calibResults,
    haveCalibResults,
    stereoMatcher,
    scalarMap,
    setCaptureCalibPair,
    freeMats,
  } = getAPI();

  let gl = stereoCamDomEl.getContext('webgl2');
  if (!gl) {
    console.error('no gl context');
    return;
  }
  const pixels = new Uint8Array(
    gl.drawingBufferHeight * gl.drawingBufferWidth * 4
  ),
    h = gl.drawingBufferHeight,
    w = gl.drawingBufferWidth,
    t = new Timer();

  t.start('stereo vis');
  // get image from stereo canvas
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  // create a mat for the flipped version of the image
  const orig = cv.matFromArray(h, w, cv.CV_8UC4, pixels),
    flipped = new cv.Mat(new cv.Size(w, h), cv.CV_8UC4);
  // flip it
  cv.flip(orig, flipped, 0);
  // cut into left and right eye views
  const leftEye = flipped.roi(new cv.Rect(0, 0, w / 2, h));
  const rightEye = flipped.roi(new cv.Rect(w / 2, 0, w / 2, h));

  // the user has issued a command to capture a stereo image pair
  let del = true;
  if (calibrationMode && captureCalibPair) {
    capturedCalibPairs.push({ l: leftEye, r: rightEye });
    setCaptureCalibPair(false);
    del = false;
  }

  // if we have loaded in or found a mapping
  if (haveCalibResults) {
    if (!stereoMatcher.stereoBM) {
      //@ts-expect-error stereoBM is a mystery
      stereoMatcher.setBM(new cv.StereoBM());
    }
    const undistL = new cv.Mat(),
      undistR = new cv.Mat(),
      grayL = new cv.Mat(),
      grayR = new cv.Mat(),
      dispMap = new cv.Mat(),
      dispMapConv = new cv.Mat();
    cv.cvtColor(leftEye, grayL, cv.COLOR_BGR2GRAY);
    cv.cvtColor(rightEye, grayR, cv.COLOR_BGR2GRAY);
    cv.remap(
      grayL,
      undistL,
      calibResults.l.map1,
      calibResults.l.map2,
      cv.INTER_LANCZOS4,
      cv.BORDER_CONSTANT
    );
    cv.remap(
      grayR,
      undistR,
      calibResults.r.map1,
      calibResults.r.map2,
      cv.INTER_LANCZOS4,
      cv.BORDER_CONSTANT
    );
    cv.imshow(leftOut, undistL);
    cv.imshow(rightOut, undistR);
    // compute disp
    stereoMatcher.stereoBM.compute(undistL, undistR, dispMap);
    // do the conversion
    dispMap.convertTo(dispMapConv, cv.CV_32F);
    // dispMapConv = dispMapConv / 16;
    cv.divide(
      dispMapConv,
      scalarMap.getMat(leftEye.size(), 16, cv.CV_32F),
      dispMapConv
    );
    // dispMapConv = dispMapConv - stereoMatcher.getMinDisparity();
    cv.subtract(
      dispMapConv,
      scalarMap.getMat(
        leftEye.size(),
        stereoMatcher.stereoBM.getMinDisparity(),
        cv.CV_32F
      ),
      dispMapConv
    );
    // dispMapConv = dispMapConv / stereoMatcher.getNumDisparities();
    cv.divide(
      dispMapConv,
      scalarMap.getMat(
        leftEye.size(),
        stereoMatcher.stereoBM.getNumDisparities(),
        cv.CV_32F
      ),
      dispMapConv
    );

    const pointCloudOutImg = new cv.Mat(dispMapConv.size(), cv.CV_32FC3);

    cv.reprojectImageTo3D(dispMapConv, pointCloudOutImg, calibResults.q, true);

    cv.imshow(dispMapEl, dispMapConv);
    cv.imshow(reprojectMapEl, pointCloudOutImg);
    // clean up
    freeMats(undistL, undistR, grayL, grayR, dispMap, dispMapConv);
  } else {
    cv.imshow(leftOut, leftEye);
    cv.imshow(rightOut, rightEye);
  }

  freeMats(orig, flipped);
  if (del) {
    freeMats(leftEye, rightEye);
  }
  t.finish();
}

export { doStereoVis };

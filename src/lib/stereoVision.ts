import Timer from "./Timer";
import { getAPI } from "./gfx_state";
import { Mat } from "mirada";

// Persistent caches to prevent per-frame allocations
let cachedPixels: Uint8Array | null = null;

function getPixelsBuffer(w: number, h: number): Uint8Array {
  const size = w * h * 4;
  if (!cachedPixels || cachedPixels.length !== size) {
    cachedPixels = new Uint8Array(size);
  }
  return cachedPixels;
}

interface StereoMats {
  initialized: boolean;
  undistL?: Mat;
  undistR?: Mat;
  grayL?: Mat;
  grayR?: Mat;
  dispMap?: Mat;
  dispMapConv?: Mat;
  flipped?: Mat;
  orig?: Mat;
  pointCloudOutImg?: Mat;
  pointCloudOutImgTformed?: Mat;
}

const matCache: StereoMats = {
  initialized: false,
};

function getMats() {
  if (matCache.initialized) return matCache as Required<StereoMats>;
  matCache.undistL = new cv.Mat();
  matCache.undistR = new cv.Mat();
  matCache.grayL = new cv.Mat();
  matCache.grayR = new cv.Mat();
  matCache.dispMap = new cv.Mat();
  matCache.dispMapConv = new cv.Mat();
  matCache.flipped = new cv.Mat();
  matCache.orig = new cv.Mat();
  matCache.pointCloudOutImg = new cv.Mat();
  matCache.pointCloudOutImgTformed = new cv.Mat();
  matCache.initialized = true;
  return matCache as Required<StereoMats>;
}

/**
 * do the thing, ya know?
 * the block matching/ calib stuff tutorial was found on
 * https://learnopencv.com/depth-perception-using-stereo-camera-python-c/#block-matching-for-dense-stereo-correspondence
 * as well as
 * https://docs.opencv.org/3.4/dc/dbb/tutorial_py_calibration.html
 */
function doStereoVis(
  stereoCamDomEl: HTMLCanvasElement,
  leftOut: HTMLCanvasElement,
  rightOut: HTMLCanvasElement,
  dispMapEl: HTMLCanvasElement,
  reprojectMapEl: HTMLCanvasElement
) {
  const mats = getMats();
  const {
    calibrationMode,
    captureCalibPair,
    capturedCalibPairs,
    calibResults,
    stereoMatcher,
    scalarMap,
    setCaptureCalibPair,
    freeMats,
  } = getAPI();

  const gl = stereoCamDomEl.getContext("webgl2");
  if (!gl) {
    console.error("no gl context");
    return;
  }

  const h = gl.drawingBufferHeight;
  const w = gl.drawingBufferWidth;
  const pixels = getPixelsBuffer(w, h);
  const t = new Timer();

  t.start("stereo vis");
  // get image from stereo canvas
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

  // Ensure 'orig' is allocated with the correct type and size
  if (mats.orig.cols !== w || mats.orig.rows !== h || mats.orig.type() !== cv.CV_8UC4) {
    mats.orig.create(h, w, cv.CV_8UC4);
  }
  // Copy straight into the Mat's data heap view to avoid cv.matFromArray allocation
  mats.orig.data.set(pixels);

  mats.flipped.create(h, w, cv.CV_8UC4);
  // flip it
  cv.flip(mats.orig, mats.flipped, 0);
  
  // cut into left and right eye views (ROIs create small headers we still must clean up)
  const leftEye = mats.flipped.roi(new cv.Rect(0, 0, w / 2, h));
  const rightEye = mats.flipped.roi(new cv.Rect(w / 2, 0, w / 2, h));

  // the user has issued a command to capture a stereo image pair
  if (calibrationMode && captureCalibPair) {
    // Clone matrices so they persist safely apart from our per-frame mats.flipped
    capturedCalibPairs.push({ l: leftEye.clone(), r: rightEye.clone() });
    setCaptureCalibPair(false);
  }

  // if we have loaded in or found a mapping
  if (calibResults !== null) {
    if (!stereoMatcher.stereoBM) {
      //@ts-expect-error stereoBM is a mystery
      stereoMatcher.setBM(new cv.StereoBM());
    }

    cv.cvtColor(leftEye, mats.grayL, cv.COLOR_BGR2GRAY);
    cv.cvtColor(rightEye, mats.grayR, cv.COLOR_BGR2GRAY);
    cv.remap(
      mats.grayL,
      mats.undistL,
      calibResults.l.map1,
      calibResults.l.map2,
      cv.INTER_LANCZOS4,
      cv.BORDER_CONSTANT
    );
    cv.remap(
      mats.grayR,
      mats.undistR,
      calibResults.r.map1,
      calibResults.r.map2,
      cv.INTER_LANCZOS4,
      cv.BORDER_CONSTANT
    );
    cv.imshow(leftOut, mats.undistL);
    cv.imshow(rightOut, mats.undistR);
    // compute disp
    stereoMatcher.stereoBM.compute(mats.undistL, mats.undistR, mats.dispMap);
    // do the conversion
    mats.dispMap.convertTo(mats.dispMapConv, cv.CV_32F);
    
    cv.divide(
      mats.dispMapConv,
      scalarMap.getMat(leftEye.size(), 16, cv.CV_32F),
      mats.dispMapConv
    );
    
    cv.subtract(
      mats.dispMapConv,
      scalarMap.getMat(
        leftEye.size(),
        stereoMatcher.stereoBM.getMinDisparity(),
        cv.CV_32F
      ),
      mats.dispMapConv
    );
    
    cv.divide(
      mats.dispMapConv,
      scalarMap.getMat(
        leftEye.size(),
        stereoMatcher.stereoBM.getNumDisparities(),
        cv.CV_32F
      ),
      mats.dispMapConv
    );

    cv.reprojectImageTo3D(mats.dispMapConv, mats.pointCloudOutImg, calibResults.q, true);

    cv.imshow(dispMapEl, mats.dispMapConv);
    cv.imshow(reprojectMapEl, mats.pointCloudOutImg);
  } else {
    cv.imshow(leftOut, leftEye);
    cv.imshow(rightOut, rightEye);
  }

  // Clean up ROIs allocated this frame
  freeMats(leftEye, rightEye);
  t.finish();
}

export { doStereoVis };

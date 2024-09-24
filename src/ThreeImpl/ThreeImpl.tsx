import React from "react";
import "./ThreeImpl.css";

const ThreeImpl = () => {
  const threeContainer = React.useRef<HTMLDivElement>(null);
  const threeStereoContainer = React.useRef<HTMLDivElement>(null);
  const leftEye = React.useRef<HTMLCanvasElement>(null);
  const rightEye = React.useRef<HTMLCanvasElement>(null);
  const dispMap = React.useRef<HTMLCanvasElement>(null);

  const handleCalibModeToggle = () => {
    calibMode = toggleCalibrationMode();
  };
  const handleCapturePair = () => {
    capturedPairs = captureCalibrationPair();
  };
  const handleStereoCalib = () => {
    doStereoCalibration;
  };
  return (
    <div>
      <div className="row justify-center align-center">
        <button onClick={handleCalibModeToggle}>
          Toggle Chessboard/ Normal mode
        </button>
        <button onClick={handleCapturePair}>Capture calibration pair</button>
        <button onClick={handleStereoCalib}>Calibrate Cameras</button>
        {/* <q-chip
                    v-if="calibMode"
                    square:label="`Pairs captured: ${capturedPairs}`"
                /> */}
      </div>
      <div className="row justify-center align-center">The single cam view</div>
      <div
        className="row justify-center align-center"
        ref={threeContainer}
      ></div>
      <div className="row justify-center align-center">The stereo cam view</div>
      <div
        className="row justify-center align-center"
        ref={threeStereoContainer}
      ></div>
      <div className="row justify-around align-center">
        <div>Undistorted Left Eye View</div>
        <div>Undistorted Right Eye View</div>
      </div>
      <div className="row justify-around align-center ">
        <canvas
          style={{ border: "solid 1px black" }}
          width="640"
          height="360"
          ref={leftEye}
        />
        <canvas
          style={{ border: "solid 1px black" }}
          width="640"
          height="360"
          ref={rightEye}
        />
      </div>
      <div className="row justify-around align-center">
        <div>Disparity Map</div>
      </div>
      <div className="row justify-center align-center ">
        <canvas
          style={{ border: "solid 1px black" }}
          width="640"
          height="360"
          ref={dispMap}
        />
      </div>
    </div>
  );
};

export default ThreeImpl;

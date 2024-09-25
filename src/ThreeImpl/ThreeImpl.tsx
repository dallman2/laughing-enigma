import React from "react";
import "./ThreeImpl.css";
import useThree from "../services/useThree";

const ThreeImpl = () => {
  const threeContainer = React.useRef<HTMLDivElement>(null);
  const threeStereoContainer = React.useRef<HTMLDivElement>(null);
  const leftEye = React.useRef<HTMLCanvasElement>(null);
  const rightEye = React.useRef<HTMLCanvasElement>(null);
  const dispMap = React.useRef<HTMLCanvasElement>(null);

  const [calibMode, setCalibMode] = React.useState(false);
  const [capturedPairs, setCapturedPairs] = React.useState(0);

  const {
    attachAndRender,
    toggleCalibrationMode,
    captureCalibrationPair,
    doStereoCalibration,
  } = useThree();

  React.useEffect(() => {
    if (
      threeContainer.current &&
      threeStereoContainer.current &&
      leftEye.current &&
      rightEye.current &&
      dispMap.current
    ) {
      console.log("attaching and rendering");
      attachAndRender(
        threeContainer.current,
        threeStereoContainer.current,
        leftEye.current,
        rightEye.current,
        dispMap.current
      );

      // return () => {
      //   setRendered(false);
      // };
    }
  }, [
    threeContainer,
    threeStereoContainer,
    leftEye,
    rightEye,
    dispMap,
    attachAndRender,
  ]);

  const handleCalibModeToggle = () => {
    setCalibMode(toggleCalibrationMode());
  };
  const handleCapturePair = () => {
    setCapturedPairs(captureCalibrationPair());
  };
  const handleStereoCalib = () => {
    doStereoCalibration();
  };
  return (
    <div>
      <div className="row justify-center align-center my-2">
        <button className="mx-1 py-1 px-2" onClick={handleCalibModeToggle}>
          Toggle Chessboard/ Normal mode
        </button>
        <button className="mx-1 py-1 px-2" onClick={handleCapturePair}>
          Capture calibration pair
        </button>
        <button className="mx-1 py-1 px-2" onClick={handleStereoCalib}>
          Calibrate Cameras
        </button>
      </div>
      {calibMode && (
        <div className="row justify-center align-center">
          <h5>Calibration pairs captured: {capturedPairs}</h5>
        </div>
      )}
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

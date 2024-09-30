import React from "react";
import "./ThreeImpl.css";
import useThree from "../services/useThree";
import { setSuppressTimer } from "../lib/Timer";
import {
  INITIAL_EYE_SEP,
  INITIAL_STEREO_HEIGHT,
  INITIAL_STEREO_WIDTH,
} from "../lib/constants";

const defaultConfig = {
  eyeSep: INITIAL_EYE_SEP,
  stereoWidth: INITIAL_STEREO_WIDTH,
  stereoHeight: INITIAL_STEREO_HEIGHT,
};

const canvasStyle = {
  border: "solid 1px black",
  width: INITIAL_STEREO_WIDTH,
  height: INITIAL_STEREO_HEIGHT,
};

export type ConfigType = typeof defaultConfig;

const checkConfig = (config: ConfigType) => {
  if (config.eyeSep <= 0) {
    throw new Error("Eye separation must be greater than 0");
  }
  if (config.stereoWidth <= 0) {
    throw new Error("Stereo width must be greater than 0");
  }
  if (config.stereoHeight <= 0) {
    throw new Error("Stereo height must be greater than 0");
  }
};

const ThreeImpl = () => {
  const threeContainer = React.useRef<HTMLDivElement>(null);
  const threeStereoContainer = React.useRef<HTMLDivElement>(null);
  const leftEye = React.useRef<HTMLCanvasElement>(null);
  const rightEye = React.useRef<HTMLCanvasElement>(null);
  const dispMap = React.useRef<HTMLCanvasElement>(null);
  const reprojectMap = React.useRef<HTMLCanvasElement>(null);

  const [calibMode, setCalibMode] = React.useState(false);
  const [localSuppressTimer, setLocalSuppressTimer] = React.useState(true);
  const [capturedPairs, setCapturedPairs] = React.useState(0);
  const [config, setConfig] = React.useState(defaultConfig);

  const {
    attachAndRender,
    toggleCalibrationMode,
    captureCalibrationPair,
    doStereoCalibration,
    getStereoCalibrationResults,
    haveCalibResults,
  } = useThree();

  React.useEffect(() => {
    try {
      checkConfig(config);
      if (
        threeContainer.current &&
        threeStereoContainer.current &&
        leftEye.current &&
        rightEye.current &&
        dispMap.current &&
        reprojectMap.current
      ) {
        // console.log("attaching and rendering");
        attachAndRender(
          threeContainer.current,
          threeStereoContainer.current,
          leftEye.current,
          rightEye.current,
          dispMap.current,
          reprojectMap.current,
          config
        );
      }
    } catch (e) {
      console.error("error in effect", { e });
    }
  }, [
    threeContainer,
    threeStereoContainer,
    leftEye,
    rightEye,
    dispMap,
    config,
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
  const handleTimerToggle = () => {
    setLocalSuppressTimer(setSuppressTimer(!localSuppressTimer));
  };
  const handleCalibDump = () => {
    console.log("stereo calibration results", {
      distMapsAndQ: getStereoCalibrationResults(),
    });
  };
  const bindConfigChangeHandler =
    (target: keyof typeof config): React.ChangeEventHandler<HTMLInputElement> =>
    (e) =>
      setConfig((oldState) => ({
        ...oldState,
        [target]: parseFloat(e.target.value),
      }));

  return (
    <div>
      <div className="row justify-between align-center my-2">
        <div className="row align-center">
          <button className="mx-1 py-1 px-2" onClick={handleCalibModeToggle}>
            Toggle Chessboard/ Normal mode
          </button>
          <button className="mx-1 py-1 px-2" onClick={handleCapturePair}>
            Capture calibration pair
          </button>
          <button className="mx-1 py-1 px-2" onClick={handleStereoCalib}>
            Calibrate Cameras
          </button>
          <button className="mx-1 py-1 px-2" onClick={handleTimerToggle}>
            Suppress timer logging: {localSuppressTimer ? "ON" : "OFF"}
          </button>
          {haveCalibResults && (
            <button className="mx-1 py-1 px-2" onClick={handleCalibDump}>
              Dump calibration results to console
            </button>
          )}
        </div>
        {calibMode && (
          <div className="row justify-center align-center">
            <h5>Calibration pairs captured: {capturedPairs}</h5>
          </div>
        )}
      </div>
      <div className="row justify-around align-center px-3">
        <label>
          Eye separation:
          <input
            className="mx-3 px-1"
            step={0.01}
            min={0.05}
            max={2}
            type="number"
            value={config.eyeSep}
            onChange={bindConfigChangeHandler("eyeSep")}
          />
        </label>
        <label>
          Stereo viewer dimensions (per eye width):
          <input
            className="mx-3 px-1"
            min={270}
            max={1280}
            step={16}
            type="number"
            value={config.stereoWidth}
            onChange={bindConfigChangeHandler("stereoWidth")}
          />
        </label>
        <label>
          Stereo viewer dimensions (per eye height):
          <input
            className="mx-3 px-1"
            min={270}
            max={1280}
            step={16}
            type="number"
            value={config.stereoHeight}
            onChange={bindConfigChangeHandler("stereoHeight")}
          />
        </label>
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
      <div className="row justify-around align-center">
        <canvas
          style={canvasStyle}
          width={config.stereoWidth}
          height={config.stereoHeight}
          ref={leftEye}
        />
        <canvas
          style={canvasStyle}
          width={config.stereoWidth}
          height={config.stereoHeight}
          ref={rightEye}
        />
      </div>
      <div className="row justify-around align-center">
        <div>Disparity Map</div>
        <div>Reproject Map</div>
      </div>
      <div className="row justify-around align-center ">
        <canvas
          style={canvasStyle}
          width={config.stereoWidth}
          height={config.stereoHeight}
          ref={dispMap}
        />
        <canvas
          style={canvasStyle}
          width={config.stereoWidth}
          height={config.stereoHeight}
          ref={reprojectMap}
        />
      </div>
    </div>
  );
};

export default ThreeImpl;

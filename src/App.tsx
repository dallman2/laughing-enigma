import useThree from "./services/useThree";
import opencv from "./lib/opencv_js.js";
import "./App.css";

import { type CV } from "mirada";
import ThreeImpl from "./ThreeImpl/ThreeImpl.js";

const App = () => {
  console.log("loading opencv");

  if (!cv) {
    throw new Promise<void>((resolve) => {
      // call the render loop as a promise fulfillment because this module is lorg
      // @ts-expect-error
      opencv().then((val: CV) => {
        console.log("opencv ready");
        // @ts-expect-error we are setting the cv object here... typescript is not happy
        cv = val;
        resolve();
      });
    });
  }

  console.log("calling app");
  const {
    attachAndRender,
    toggleCalibrationMode,
    captureCalibrationPair,
    doStereoCalibration,
  } = useThree();

  return (
    <>
      <h1>Vite + React</h1>
      <div className="card">
        <p>
          Edit <code>src/App.tsx</code> and save to test HMR
        </p>
      </div>
      <p className="read-the-docs">
        Click on the Vite and React logos to learn more
      </p>
      <ThreeImpl />
    </>
  );
};

export default App;

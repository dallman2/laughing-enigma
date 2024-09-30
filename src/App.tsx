import opencv from "./lib/opencv_js.js";
import "./App.css";

import { type CV } from "mirada";
import ThreeImpl from "./ThreeImpl/ThreeImpl.js";

const App = () => {
  if (!cv) {
    throw new Promise<void>((resolve) => {
      // call the render loop as a promise fulfillment because this module is lorg
      (opencv as () => Promise<CV>)().then((val: CV) => {
        console.log("opencv ready");
        // @ts-expect-error we are setting the cv object here... typescript is not happy
        cv = val;
        resolve();
      });
    });
  }

  return (
    <div style={{ maxHeight: "100vh" }} className="column align-center">
      <h1>OpenCV, in the browser</h1>
      <ThreeImpl />
    </div>
  );
};

export default App;

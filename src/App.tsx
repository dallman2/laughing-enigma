import opencv from "./lib/opencv_js.js";
import "./App.css";

import { type CV } from "mirada";
import ThreeImpl from "./ThreeImpl";
import TfjsImpl from "./TfjsImpl";
import { Content, List, Root, Trigger } from "@radix-ui/react-tabs";
import EasyPicImpl from "./EasyPicImpl";
import { useState } from "react";

const App = () => {
  const [activeTab, setActiveTab] = useState("tab1");

  if (!cv) {
    throw new Promise<void>((resolve) => {
      // call the render loop as a promise fulfillment because this module is lorg
      (opencv as () => Promise<CV>)().then((val: CV) => {
        console.log(`opencv ready, version: ${val.getBuildInformation()}`);
        // @ts-expect-error we are setting the cv object here... typescript is not happy
        cv = val;
        resolve();
      });
    });
  }

  return (
    <div
      style={{ maxHeight: "100vh", height: "100%" }}
      className="column align-center"
    >
      <Root
        className="tab-root"
        defaultValue="tab1"
        value={activeTab}
        onValueChange={setActiveTab}
      >
        <List className="tab-list">
          <Trigger className="tab-trigger" value="tab1">
            tfjs
          </Trigger>
          <Trigger className="tab-trigger" value="tab2">
            threejs
          </Trigger>
          <Trigger className="tab-trigger" value="tab3">
            easypic
          </Trigger>
        </List>
        <Content
          className="tab-content"
          style={{ display: activeTab === "tab1" ? "flex" : "none" }}
          value="tab1"
        >
          <h1>Tensorflow, in the browser</h1>
          <TfjsImpl />
        </Content>
        <Content
          className="tab-content"
          style={{ display: activeTab === "tab2" ? "flex" : "none" }}
          value="tab2"
        >
          <h1>OpenCV, in the browser</h1>
          <ThreeImpl />
        </Content>
        <Content
          className="tab-content"
          style={{ display: activeTab === "tab3" ? "flex" : "none" }}
          value="tab3"
        >
          <EasyPicImpl />
        </Content>
      </Root>
    </div>
  );
};

export default App;

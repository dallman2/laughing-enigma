// import * as tf from "@tensorflow/tfjs";
// import * as tfvis from "@tensorflow/tfjs-vis";
// import * as mobilenet from "@tensorflow-models/mobilenet";
import { useEffect, useRef, useState } from "react";

import "@tensorflow/tfjs-backend-webgl";

const loadModel = async (_imgElement: HTMLImageElement) => {
  // const resp = await tf.setBackend("webgl");
  // console.log("tfjs backend success:", resp);
  // console.log("tf data:", {
  //   version: tf.version.tfjs,
  //   backend: tf.getBackend(),
  //   tfENV: tf.ENV,
  // });
  // const loadedModel = await tf.loadLayersModel(
  //   tf.io.browserFiles(files)
  //   // "/home/dan/repos/laughing-enigma/model_dir/model.json"
  // );
  // const loadedModel = await tf.loadGraphModel(
  //   "https://www.kaggle.com/models/google/mobilenet-v2/TfJs/035-224-classification/3",
  //   { fromTFHub: true }
  // );
  // https://stackoverflow.com/questions/52825696/tensorflowjs-error-the-shape-of-dictimages-provided-in-model-executedict
  // const example = (await tf.browser.fromPixelsAsync(imgElement))
  //   .resizeNearestNeighbor([224, 224])
  //   .toFloat()
  //   .expandDims(0);
  // console.log("example shape", example.shape);

  // const result = loadedModel.predict(example) as tf.Tensor<tf.Rank>;

  // console.log("result", await result.argMax().data());
  // print("Top 1 prediction: ", x.argmax(),label_map[x.argmax()], x.max())
};

const TfjsImpl = () => {
  const imgRef = useRef<HTMLImageElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = event.target.files;
    if (selectedFiles) {
      const fileArray = Array.from(selectedFiles);
      console.log("selected files", fileArray);
      setFiles(fileArray);
    }
  };
  // Call the loadModel function when the component mounts
  useEffect(() => {
    if (imgRef.current === null) {
      console.error("Image ref is null");
      return;
      // } else if (files.length === 0) {
      //   console.error("No files selected");
      //   return;
    } else {
      const executor = async () => {
        try {
          await loadModel(imgRef.current as HTMLImageElement);
          console.log("done");
        } catch (error) {
          console.error("Error loading model:", error);
        }
      };
      executor();
    }
  }, [files]);

  return (
    <div>
      <p>This is a placeholder for the Tensorflow.js implementation.</p>
      <input
        type="file"
        accept=".json, .bin"
        onChange={handleFileChange}
        multiple
      />
      <img
        ref={imgRef}
        src={"./panda.jpg"} // Use a local image file named 'panda.jpg'
        // src="https://upload.wikimedia.org/wikipedia/commons/f/fe/Giant_Panda_in_Beijing_Zoo_1.JPG"
        alt="panda"
        style={{ width: "300px", height: "auto" }}
      />
    </div>
  );
};

export default TfjsImpl;

import { StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import Loading from "./Loading";
import "./index.css";
import "./styles/flex.css";
import "./styles/spacing.css";
import "./styles/tag-boilerplate.css";

// // console.log(navigator.xr);
// const videoElement = document.getElementById(
//   "cameraFeed"
// ) as HTMLVideoElement | null;

// async function startCamera() {
//   try {
//     if (!videoElement) throw new Error("Video element not found");
//     const stream = await navigator.mediaDevices.getUserMedia({ video: true });
//     videoElement.srcObject = stream;

//     // Get the video track from the stream
//     const [videoTrack] = stream.getVideoTracks();

//     // Create a MediaStreamTrackProcessor for the video track
//     const trackProcessor = new MediaStreamTrackProcessor({ track: videoTrack });
//     const readableStream = trackProcessor.readable;

//     // Set up a loop to read frames from the readable stream
//     const reader = readableStream.getReader();
//   } catch (error) {
//     console.error("Error accessing the camera:", error);
//     alert("Could not access the camera. Please check permissions.");
//   }
// }

// // Call startCamera() when your page loads or a button is clicked
// // startCamera();

// // To stop the camera (e.g., on a button click)
// function stopCamera() {
//   if (!videoElement) throw new Error("Video element not found");
//   const stream = videoElement.srcObject;
//   if (stream) {
//     const tracks = stream.getTracks();
//     tracks.forEach((track) => track.stop());
//     videoElement.srcObject = null;
//   }
// }

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Suspense fallback={<Loading />}>
      <App />
    </Suspense>
  </StrictMode>
);

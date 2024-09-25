import { StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import Loading from "./Loading";
import "./index.css";
import "./styles/flex.css";
import "./styles/spacing.css";
import "./styles/tag-boilerplate.css";

createRoot(document.getElementById("root")!).render(
  <Suspense fallback={<Loading />}>
    <App />
  </Suspense>
);

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./style.css";

const root = document.querySelector("#app");

if (!root) {
  throw new Error("Missing #app root element");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);

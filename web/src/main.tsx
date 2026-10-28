import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { Vangnet, foutenVolgen } from "./vangnet";
import { versieVolgen } from "./versie";

foutenVolgen();
versieVolgen();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Vangnet naam="app">
      <App />
    </Vangnet>
  </StrictMode>,
);

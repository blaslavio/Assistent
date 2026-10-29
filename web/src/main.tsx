import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { Vangnet, foutenVolgen } from "./vangnet";
import { versieVolgen } from "./versie";
import { schermVastzetten } from "./vastScherm";
import { netVolgen } from "./lib/net";

netVolgen();
foutenVolgen();
versieVolgen();
schermVastzetten();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Vangnet naam="app">
      <App />
    </Vangnet>
  </StrictMode>,
);

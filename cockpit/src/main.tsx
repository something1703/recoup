import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
// The SDK ships this as a real public export (package.json "exports" +
// "sideEffects" both name it) but nothing in this app ever imported it —
// without it, TrueForgeUI's own layout/utility classes (including the
// existing "h-full"/"min-h-0" on <TrueForgeUI> itself) have no matching
// CSS. Import order matters: this first, so index.css's overrides below
// still win on anything they both touch.
import "@truefoundry/trueforge-ui/styles.css";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

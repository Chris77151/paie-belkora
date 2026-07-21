import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { applyLangToDocument } from "./lib/i18n";

// Applique la langue mémorisée (dir/lang) avant le premier rendu.
applyLangToDocument();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

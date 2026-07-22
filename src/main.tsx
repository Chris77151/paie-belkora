import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { applyLangToDocument } from "./lib/i18n";
import { hydrateFromRemote } from "./data/store";

// Applique la langue mémorisée (dir/lang) avant le premier rendu.
applyLangToDocument();

// Persistance cloud : si Supabase est configuré, on hydrate l'état partagé (sans bloquer
// le rendu — l'app démarre sur le cache localStorage puis se met à jour).
void hydrateFromRemote();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

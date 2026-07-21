import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  server: {
    port: 5180,
    open: true,
    // Contournement CORS pour l'import Odoo en dev : Odoo (SaaS *.odoo.com) ne renvoie
    // AUCUN en-tête CORS, un appel direct du navigateur est donc bloqué. On passe par ce
    // proxy même-origine : renseigner l'URL Odoo = "/odoo" dans l'application.
    // La cible peut être surchargée : VITE_ODOO_TARGET=https://autre-odoo npm run dev
    proxy: {
      "/odoo": {
        target: process.env.VITE_ODOO_TARGET || "https://pepiniere-belkora.odoo.com",
        changeOrigin: true,
        secure: false,
        rewrite: (p) => p.replace(/^\/odoo/, ""),
      },
    },
  },
});

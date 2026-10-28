import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// De nieuwe app staat naast de oude op GitHub Pages: blaslavio.github.io/Assistent/app/
// Met --mode enkel komt hij ook als één script en één stylesheet in nieuwe_app/; de huidige app (Streamlit) zet die
// in een pagina, zodat de nieuwe app ook op het adres van de huidige app werkt.
export default defineConfig(({ mode }) => ({
  base: "./",
  plugins: [react(), tailwindcss()],
  build: mode === "enkel"
    ? { outDir: "../nieuwe_app", emptyOutDir: true, assetsDir: "", chunkSizeWarningLimit: 1500, rollupOptions: { output: {
        inlineDynamicImports: true, entryFileNames: "app.js", assetFileNames: "app[extname]" } } }
    : { outDir: "../docs/app", emptyOutDir: true },
  test: { environment: "jsdom" },
}));

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import type { Plugin } from "vite";

// versie.json noemt het hoofdscript van de nieuwste versie. Een app die nog een oude versie uit de cache draait (vaak
// vanaf het beginscherm van een iPhone) ziet zo dat er een nieuwe is en laadt die.
function versie(mode: string): Plugin {
  return {
    name: "versie",
    generateBundle(_, bundel) {
      if (mode === "enkel") return;
      const hoofd = Object.values(bundel).find((b) => b.type === "chunk" && b.isEntry);
      if (hoofd) this.emitFile({ type: "asset", fileName: "versie.json", source: JSON.stringify({ script: hoofd.fileName }) });
    },
  };
}

// De nieuwe app staat naast de oude op GitHub Pages: blaslavio.github.io/Assistent/app/
// Met --mode enkel komt hij ook als één script en één stylesheet in nieuwe_app/; de huidige app (Streamlit) zet die
// in een pagina, zodat de nieuwe app ook op het adres van de huidige app werkt.
export default defineConfig(({ mode }) => ({
  base: "./",
  plugins: [react(), tailwindcss(), versie(mode)],
  build: mode === "enkel"
    ? { outDir: "../nieuwe_app", emptyOutDir: true, assetsDir: "", chunkSizeWarningLimit: 1500, rollupOptions: { output: {
        inlineDynamicImports: true, entryFileNames: "app.js", assetFileNames: "app[extname]" } } }
    : { outDir: "../docs/app", emptyOutDir: true },
  test: { environment: "jsdom" },
}));

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// De nieuwe app staat naast de oude op GitHub Pages: blaslavio.github.io/Assistent/app/
export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  build: { outDir: "../docs/app", emptyOutDir: true },
  test: { environment: "jsdom" },
});

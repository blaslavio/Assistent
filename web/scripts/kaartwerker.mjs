// Eén zelfstandige kaartwerker voor zowel de webbuild als de ingebouwde Streamlit-app.
// Geen runtime-import van een ontbrekend workerbestand of een externe code-CDN.
import { build } from "esbuild";
import { createRequire } from "node:module";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const output = fileURLToPath(new URL("../src/kaartwerker.bundel.ts", import.meta.url));
const result = await build({ entryPoints: [require.resolve("maplibre-gl/dist/maplibre-gl-worker.mjs")],
  bundle: true, format: "iife", platform: "browser", target: "es2022", minify: true, write: false,
  legalComments: "inline", metafile: true, logLevel: "warning" });
if (result.outputFiles.length !== 1 || Object.values(result.metafile.outputs).some(o => o.imports.some(i => i.external))) throw new Error("De kaartwerker moet zelfstandig gebundeld zijn.");
const text = "// Automatisch gegenereerd door scripts/kaartwerker.mjs.\nexport default " + JSON.stringify(result.outputFiles[0].text) + ";\n";
if (await readFile(output,"utf8").catch(()=>"") !== text) await writeFile(output,text);

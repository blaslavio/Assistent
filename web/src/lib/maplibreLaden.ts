// De kaartbibliotheek (MapLibre, ruim 1,6 MB) zat in de app zelf, waardoor iedereen hem bij elke nieuwe versie
// downloadde, ook wie de kaart nooit opent. Nu halen we hem pas op als de kaart opengaat, van jsDelivr.
// De integriteitscode zorgt dat de browser alleen exact deze versie accepteert; elk ander bestand wordt geweigerd.
import type * as MapLibre from "maplibre-gl";

export const MAPLIBRE_VERSIE = "6.16.0";
const BASIS = `https://cdn.jsdelivr.net/npm/maplibre-gl@${MAPLIBRE_VERSIE}/dist/`;
const CODE = {
  "maplibre-gl.mjs": "sha384-uLwQnFL74rrONqIWx/ubL4wcAtA2h08tbMDZd9U4KbQ7GhaA7S1XKepHU89UkU7C",
  "maplibre-gl-worker.mjs": "sha384-FgyfFzov+/WGwlmjlowNT14eHNk/fCYPBsD/J2FkqC+Pef7/36bn0gdsHaB/Oso/",
} as const;

async function haal(bestand: keyof typeof CODE): Promise<string> {
  const r = await fetch(BASIS + bestand, { integrity: CODE[bestand], credentials: "omit" });
  if (!r.ok) throw new Error("Kaart laden lukte niet.");
  return r.text();
}
const alsScript = (tekst: string) => URL.createObjectURL(new Blob([tekst], { type: "text/javascript" }));

let bezig: Promise<typeof MapLibre> | null = null;

/** Laadt MapLibre één keer per sessie. Bij een fout probeert de volgende kaart het opnieuw. */
export function maplibreLaden(): Promise<typeof MapLibre> {
  bezig ??= (async () => {
    const [lib, werker] = await Promise.all([haal("maplibre-gl.mjs"), haal("maplibre-gl-worker.mjs")]);
    const m = (await import(/* @vite-ignore */ alsScript(lib))) as typeof MapLibre;
    m.setWorkerUrl(alsScript(werker));
    return m;
  })().catch((e) => {
    bezig = null;
    throw e;
  });
  return bezig;
}

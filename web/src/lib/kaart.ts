// Gedeelde geografie, winkelzoeking en navigatielinks. De vectorkaart zelf gebruikt MapLibre en OpenFreeMap;
// de omliggende winkels en adreszoeking gebruiken de bestaande OpenStreetMap-diensten.
export type Punt = { lat: number; lon: number };
export type KaartWinkel = Punt & { naam: string; soort: string; adres?: string; app: boolean; producten?: number; prive?: boolean; plekId?: string; winkelAdres?: string };

export const TEGEL = 256;
export const STANDAARD: Punt = { lat: 52.09, lon: 5.12 };

/** Plek op de wereldkaart in pixels bij een zoomniveau (Web Mercator, zoals alle gewone kaarten). */
export function naarPixel(p: Punt, zoom: number) {
  const schaal = TEGEL * 2 ** zoom;
  const sin = Math.sin((Math.max(-85, Math.min(85, p.lat)) * Math.PI) / 180);
  return { x: ((p.lon + 180) / 360) * schaal, y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * schaal };
}

export function naarPunt(x: number, y: number, zoom: number): Punt {
  const schaal = TEGEL * 2 ** zoom;
  const n = Math.PI - (2 * Math.PI * Math.max(0, Math.min(schaal, y))) / schaal;
  return { lat: (180 / Math.PI) * Math.atan(Math.sinh(n)), lon: (((x / schaal) * 360) % 360 + 360) % 360 - 180 };
}

/** Afstand in meters tussen twee plekken. */
export function afstand(a: Punt, b: Punt) {
  const r = 6371000, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(Math.max(0, Math.min(1, h))));
}

export const afstandTekst = (m: number) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1).replace(".", ",")} km`);

const SOORTEN: Record<string, string> = {
  supermarket: "Supermarkt", bakery: "Bakker", butcher: "Slager", greengrocer: "Groenteboer", clothes: "Kleding",
  shoes: "Schoenen", books: "Boeken", florist: "Bloemen", hairdresser: "Kapper", chemist: "Drogist", pharmacy: "Apotheek",
  bicycle: "Fietsen", hardware: "Bouwmarkt", doityourself: "Bouwmarkt", electronics: "Elektronica", furniture: "Meubels",
  gift: "Cadeaus", toys: "Speelgoed", optician: "Opticien", convenience: "Buurtwinkel", cheese: "Kaas", deli: "Delicatessen",
  sports: "Sport", jewelry: "Sieraden", mobile_phone: "Telefoons", pet: "Dieren", second_hand: "Tweedehands",
  department_store: "Warenhuis", beauty: "Schoonheid", stationery: "Kantoor", garden_centre: "Tuincentrum",
};
export const soortNaam = (s: string) => SOORTEN[s] ?? "Winkel";

const vergelijk = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * App-winkels eerst; een winkel uit OpenStreetMap met dezelfde naam binnen 300 meter is dezelfde winkel en valt weg.
 * Daarna gesorteerd op afstand tot het midden.
 */
export function samenvoegen(app: KaartWinkel[], osm: KaartWinkel[], midden: Punt) {
  const rest = osm.filter((o) => !app.some((a) => vergelijk(a.naam) === vergelijk(o.naam) && afstand(a, o) < 300));
  const opAfstand = (l: KaartWinkel[]) => [...l].sort((a, b) => afstand(a, midden) - afstand(b, midden));
  return [...opAfstand(app), ...opAfstand(rest)];
}

type OsmElement = { lat?: number; lon?: number; center?: Punt; tags?: Record<string, string> };

/** Winkels uit OpenStreetMap rond een plek. Eén keer per plek per kwartier opgehaald. */
const bewaard = new Map<string, { tijd: number; lijst: KaartWinkel[] }>();
export async function winkelsInBuurt(p: Punt, meter = 1500): Promise<KaartWinkel[]> {
  const sleutel = `${p.lat.toFixed(3)},${p.lon.toFixed(3)},${meter}`;
  const oud = bewaard.get(sleutel);
  if (oud && Date.now() - oud.tijd < 15 * 60_000) return oud.lijst;
  const vraag = `[out:json][timeout:15];nwr(around:${meter},${p.lat},${p.lon})["shop"]["name"];out center 300;`;
  const r = await fetch("https://overpass-api.de/api/interpreter", { method: "POST", body: "data=" + encodeURIComponent(vraag),
    headers: { "content-type": "application/x-www-form-urlencoded" } });
  if (!r.ok) throw new Error("De winkels in de buurt zijn even niet op te halen.");
  const d = (await r.json()) as { elements: OsmElement[] };
  const lijst = d.elements.flatMap((e): KaartWinkel[] => {
    const plek = e.center ?? (e.lat != null && e.lon != null ? { lat: e.lat, lon: e.lon } : null);
    const t = e.tags ?? {};
    if (!plek || !t.name) return [];
    const adres = [t["addr:street"] && `${t["addr:street"]} ${t["addr:housenumber"] ?? ""}`.trim(), t["addr:city"]]
      .filter(Boolean).join(", ");
    return [{ ...plek, naam: t.name, soort: soortNaam(t.shop), adres: adres || undefined, app: false }];
  });
  bewaard.set(sleutel, { tijd: Date.now(), lijst });
  return lijst;
}

/** Een adres omzetten naar een plek op de kaart (OpenStreetMap Nominatim). */
export async function zoekPlek(adres: string): Promise<(Punt & { naam: string }) | null> {
  if (!adres.trim()) return null;
  const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(adres)}`);
  if (!r.ok) return null;
  const [eerste] = (await r.json()) as { lat: string; lon: string; display_name: string }[];
  if (!eerste) return null;
  const lat = Number(eerste.lat), lon = Number(eerste.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat)>90 || Math.abs(lon)>180) return null;
  return { lat, lon, naam: eerste.display_name };
}

export type RouteApp = "apple" | "google" | "waze";
export type Reiswijze = "auto" | "lopen" | "fiets" | "ov";
/** Een echte navigatie-app berekent afstand, verkeer en reistijd; de app deelt alleen de gekozen bestemming. */
export function routeLink(w: Punt & { naam: string; prive?: boolean }, app: RouteApp = "apple", wijze: Reiswijze = "auto") {
  if (!Number.isFinite(w.lat) || !Number.isFinite(w.lon) || Math.abs(w.lat)>90 || Math.abs(w.lon)>180) throw new Error("Ongeldige bestemming.");
  const co = `${w.lat},${w.lon}`;
  if (app === "waze") return `https://waze.com/ul?ll=${co}&navigate=yes`;
  if (app === "google") return `https://www.google.com/maps/dir/?api=1&destination=${co}&travelmode=${({auto:"driving",lopen:"walking",fiets:"bicycling",ov:"transit"})[wijze]}`;
  return `https://maps.apple.com/?daddr=${co}&q=${encodeURIComponent(w.prive ? "Bestemming" : w.naam)}&dirflg=${({auto:"d",lopen:"w",fiets:"b",ov:"r"})[wijze]}`;
}

// Het weer via Open-Meteo (zonder sleutel). Je thuisadres wordt één keer omgezet naar een plek en onthouden.
const STANDAARD = { lat: 52.09, lon: 5.12, plaats: "Utrecht" };

export type Weer = { graden: number; tekst: string; plaats: string };

const TEKSTEN: [number[], string][] = [
  [[0], "Zonnig"], [[1, 2], "Half bewolkt"], [[3], "Bewolkt"], [[45, 48], "Mist"],
  [[51, 53, 55, 56, 57], "Motregen"], [[61, 63, 65, 66, 67, 80, 81, 82], "Regen"],
  [[71, 73, 75, 77, 85, 86], "Sneeuw"], [[95, 96, 99], "Onweer"],
];

export function weerTekst(code: number) {
  return TEKSTEN.find(([codes]) => codes.includes(code))?.[1] ?? "";
}

async function plek(adres: string) {
  if (!adres) return STANDAARD;
  const sleutel = `assistent.plek.${adres}`;
  try {
    const bewaard = localStorage.getItem(sleutel);
    if (bewaard) return JSON.parse(bewaard) as typeof STANDAARD;
  } catch {
    /* geen opslag: dan elke keer opzoeken */
  }
  const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(adres)}`);
  const [eerste] = (await r.json()) as { lat: string; lon: string; display_name: string }[];
  if (!eerste) return STANDAARD;
  const p = { lat: +eerste.lat, lon: +eerste.lon, plaats: adres.split(",").pop()!.trim().replace(/^\d{4}\s?[A-Z]{2}\s+/, "") };
  try {
    localStorage.setItem(sleutel, JSON.stringify(p));
  } catch {
    /* niet erg */
  }
  return p;
}

export async function weerNu(adres = ""): Promise<Weer | null> {
  try {
    const p = await plek(adres);
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${p.lat}&longitude=${p.lon}` +
      "&current=temperature_2m,weather_code&timezone=Europe%2FAmsterdam");
    const d = await r.json();
    return { graden: Math.round(d.current.temperature_2m), tekst: weerTekst(d.current.weather_code), plaats: p.plaats };
  } catch {
    return null;
  }
}

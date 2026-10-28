// Winkelen via de assistent: zoeken in de webshops in de app en op de marktplaats, en een bestelling klaarzetten.
// De assistent bestelt nooit zelf. Hij zet een kaart klaar; pas als jij daar op Bestellen tikt, gaat de bestelling weg.
import { alsIk } from "../api";

export type Product = {
  sleutel: string; bron: "winkel" | "marktplaats"; id: number; titel: string; prijs: number; omschrijving: string;
  verkoper: string; levering: string[]; betaalwijzen: string[]; voorraad: number | null; plaats?: string;
};

export type Bestelling = { product: Product; aantal: number; levering: string; betaalwijze: string; bericht?: string };

export const LEVERING: Record<string, string> = { verzenden: "Verzenden", ophalen: "Ophalen", op_locatie: "Op locatie",
  online: "Online" };
export const BETAALWIJZE: Record<string, string> = { app: "Via de app", tikkie: "Tikkie", contant: "Contant",
  overmaken: "Overmaken" };

export const euro = (n: number) => n.toLocaleString("nl-NL", { style: "currency", currency: "EUR" });

// Wat de assistent net vond. Een bestelling kan alleen een product uit deze lijst klaarzetten, met de echte prijs.
const gevonden = new Map<string, Product>();

type WinkelRij = { id: number; titel: string; omschrijving?: string; prijs: number; voorraad: number | null;
  levering: string[]; winkelnaam: string };
type AanbodRij = { id: number; soort: string; titel: string; omschrijving?: string; prijs: number | null;
  plaats?: string; aanbieder: string; van_mij: boolean; in_winkel: boolean; levering: string[]; betaalwijzen: string[] };

export async function zoeken(zoek: string): Promise<Product[]> {
  const term = zoek.trim().slice(0, 80);
  const [winkels, markt] = await Promise.all([
    alsIk<{ producten?: WinkelRij[] }>("winkelen_producten", { p_zoek: term, p_lat: null, p_lon: null, p_inkopen: false })
      .catch(() => ({ producten: [] as WinkelRij[] })),
    alsIk<{ aanbod?: AanbodRij[] }>("aanbod_zoeken", { p_zoekterm: term, p_soort: "product" })
      .catch(() => ({ aanbod: [] as AanbodRij[] })),
  ]);
  const lijst: Product[] = [
    ...(winkels.producten ?? []).map((p): Product => ({ sleutel: `w${p.id}`, bron: "winkel", id: p.id, titel: p.titel,
      prijs: Number(p.prijs), omschrijving: (p.omschrijving ?? "").slice(0, 200), verkoper: p.winkelnaam,
      levering: p.levering ?? [], betaalwijzen: ["app"], voorraad: p.voorraad })),
    ...(markt.aanbod ?? []).filter((a) => !a.van_mij && !a.in_winkel && a.prijs !== null)
      .map((a): Product => ({ sleutel: `m${a.id}`, bron: "marktplaats", id: a.id, titel: a.titel, prijs: Number(a.prijs),
        omschrijving: (a.omschrijving ?? "").slice(0, 200), verkoper: a.aanbieder, levering: a.levering ?? [],
        betaalwijzen: a.betaalwijzen ?? [], voorraad: null, plaats: a.plaats })),
  ].sort((a, b) => a.prijs - b.prijs).slice(0, 12);
  for (const p of lijst) gevonden.set(p.sleutel, p);
  return lijst;
}

/** Controleert een bestelling die de assistent wil klaarzetten. Geeft een fout in gewone taal, of de bestelling. */
export function klaarzetten(sleutel: string, aantal: number, levering: string, betaalwijze: string):
  { fout: string } | { bestelling: Bestelling } {
  const product = gevonden.get(sleutel);
  if (!product) return { fout: "Onbekend product. Zoek eerst met producten_zoeken en gebruik de sleutel uit de uitkomst." };
  if (!product.levering.includes(levering))
    return { fout: `Kies een levering uit: ${product.levering.join(", ")}.` };
  const wijze = product.bron === "winkel" ? "app" : betaalwijze;
  if (!product.betaalwijzen.includes(wijze))
    return { fout: `Kies een betaalwijze uit: ${product.betaalwijzen.join(", ")}.` };
  if (!Number.isInteger(aantal) || aantal < 1 || aantal > (product.bron === "winkel" ? Math.min(99, product.voorraad ?? 1) : 1))
    return { fout: "Dat aantal kan niet." };
  return { bestelling: { product, aantal, levering, betaalwijze: wijze } };
}

/** Plaatst de bestelling echt. Alleen aanroepen na een tik van de gebruiker op Bestellen. */
export async function bestellen(b: Bestelling) {
  const r = b.product.bron === "winkel"
    ? await alsIk<{ ok?: boolean; id?: number; bedrag?: number; fout?: string }>("webshop_bestellen", {
      p_aanbod: b.product.id, p_aantal: b.aantal, p_levering: b.levering, p_bericht: b.bericht ?? "", p_code: "" })
    : await alsIk<{ ok?: boolean; id?: number; bedrag?: number; fout?: string }>("bestellen", {
      p_aanbod: b.product.id, p_betaalwijze: b.betaalwijze, p_levering: b.levering, p_bericht: b.bericht ?? "" });
  if (!r?.ok) throw new Error(r?.fout || "Bestellen lukte niet.");
  return { id: r.id!, bedrag: Number(r.bedrag ?? b.product.prijs * b.aantal) };
}

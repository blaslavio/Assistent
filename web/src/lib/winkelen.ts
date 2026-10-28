// Winkelen via de assistent: zoeken in de webshops in de app en op de marktplaats, en een bestelling klaarzetten.
// De assistent bestelt nooit zelf. Hij zet een kaart klaar; pas als jij daar op Bestellen tikt, gaat de bestelling weg.
import { alsIk, rpc } from "../api";

export type Product = {
  sleutel: string; bron: "winkel" | "marktplaats"; id: number; titel: string; prijs: number; omschrijving: string;
  verkoper: string; levering: string[]; betaalwijzen: string[]; voorraad: number | null; plaats?: string;
  foto: boolean; winkel?: string; verkoperId?: number;
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
  levering: string[]; winkelnaam: string; winkel: string; heeft_foto?: boolean; plaats?: string };
type AanbodRij = { id: number; soort: string; titel: string; omschrijving?: string; prijs: number | null;
  plaats?: string; aanbieder: string; aanbieder_id: number; van_mij: boolean; in_winkel: boolean; levering: string[];
  betaalwijzen: string[]; heeft_foto?: boolean; winkel?: string | null };

const uitWinkel = (p: WinkelRij, naam = p.winkelnaam, adres = p.winkel): Product => ({ sleutel: `w${p.id}`, bron: "winkel",
  id: p.id, titel: p.titel, prijs: Number(p.prijs), omschrijving: (p.omschrijving ?? "").slice(0, 600), verkoper: naam,
  levering: p.levering ?? [], betaalwijzen: ["app"], voorraad: p.voorraad, plaats: p.plaats || undefined,
  foto: !!p.heeft_foto, winkel: adres });

const uitAanbod = (a: AanbodRij): Product => ({ sleutel: `m${a.id}`, bron: "marktplaats", id: a.id, titel: a.titel,
  prijs: Number(a.prijs), omschrijving: (a.omschrijving ?? "").slice(0, 600), verkoper: a.aanbieder,
  levering: a.levering ?? [], betaalwijzen: a.betaalwijzen ?? [], voorraad: null, plaats: a.plaats || undefined,
  foto: !!a.heeft_foto, verkoperId: a.aanbieder_id });

export async function zoeken(zoek: string): Promise<Product[]> {
  const term = zoek.trim().slice(0, 80);
  const [winkels, markt] = await Promise.all([
    alsIk<{ producten?: WinkelRij[] }>("winkelen_producten", { p_zoek: term, p_lat: null, p_lon: null, p_inkopen: false })
      .catch(() => ({ producten: [] as WinkelRij[] })),
    alsIk<{ aanbod?: AanbodRij[] }>("aanbod_zoeken", { p_zoekterm: term, p_soort: "product" })
      .catch(() => ({ aanbod: [] as AanbodRij[] })),
  ]);
  const lijst: Product[] = [
    ...(winkels.producten ?? []).map((p) => uitWinkel(p)),
    ...(markt.aanbod ?? []).filter((a) => !a.van_mij && !a.in_winkel && a.prijs !== null).map(uitAanbod),
  ].sort((a, b) => a.prijs - b.prijs).slice(0, 12);
  lijst.forEach(onthouden);
  return lijst;
}

/** Een product dat de gebruiker zelf opende (in een winkel of bij een verkoper) mag de assistent ook klaarzetten. */
export function onthouden(p: Product) {
  gevonden.set(p.sleutel, p);
}

// Foto's komen los, per product, pas als het kaartje in beeld is. Zo blijven de zoekresultaten klein.
const fotos = new Map<number, Promise<string | null>>();
export function productFoto(id: number) {
  let f = fotos.get(id);
  if (!f) {
    f = rpc<string | null>("product_foto", { p_aanbod: id })
      .then((d) => (typeof d === "string" && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(d) ? d : null))
      .catch(() => { fotos.delete(id); return null; });
    fotos.set(id, f);
  }
  return f;
}

export type Winkel = { adres: string; naam: string; omschrijving: string; actie: string; verzendkosten: number | null;
  gratis_vanaf: number | null; retour: string; winkeladres?: string; producten: Product[]; uitverkocht: Set<string> };

export async function winkelBekijken(adres: string): Promise<Winkel> {
  const w = await rpc<{ fout?: string; adres: string; naam: string; omschrijving?: string; actie?: string;
    verzendkosten?: number | null; gratis_vanaf?: number | null; retour?: string; winkeladres?: string;
    producten?: (WinkelRij & { uitverkocht: boolean })[] }>("winkel_bekijken", { p_adres: adres });
  if (!w || w.fout) throw new Error(w?.fout || "Deze winkel kan ik nu niet openen.");
  const producten = (w.producten ?? []).map((p) => uitWinkel(p, w.naam, w.adres));
  return { adres: w.adres, naam: w.naam, omschrijving: w.omschrijving ?? "", actie: w.actie ?? "",
    verzendkosten: w.verzendkosten ?? null, gratis_vanaf: w.gratis_vanaf ?? null, retour: w.retour ?? "",
    winkeladres: w.winkeladres || undefined, producten,
    uitverkocht: new Set((w.producten ?? []).filter((p) => p.uitverkocht).map((p) => `w${p.id}`)) };
}

export type Verkoper = { naam: string; winkel?: { adres: string; naam: string }; sterren: number | null;
  beoordelingen: number; verkocht: number; nieuw: boolean; producten: Product[] };

export async function verkoperBekijken(id: number): Promise<Verkoper> {
  const v = await alsIk<{ fout?: string; naam: string; winkel?: { adres: string; naam: string } | null;
    vertrouwen?: { sterren: number | null; beoordelingen: number; verkocht: number; nieuw: boolean };
    aanbod?: AanbodRij[] }>("verkoper_bekijken", { p_verkoper: id });
  if (!v || v.fout) throw new Error(v?.fout || "Deze verkoper kan ik nu niet openen.");
  return { naam: v.naam, winkel: v.winkel ?? undefined, sterren: v.vertrouwen?.sterren ?? null,
    beoordelingen: v.vertrouwen?.beoordelingen ?? 0, verkocht: v.vertrouwen?.verkocht ?? 0, nieuw: !!v.vertrouwen?.nieuw,
    producten: (v.aanbod ?? []).filter((a) => !a.in_winkel && a.prijs !== null).map(uitAanbod) };
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

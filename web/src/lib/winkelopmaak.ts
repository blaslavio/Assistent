// De opmaak van een winkel: stijl, banner, teksten en welke delen in welke volgorde. Zie sql/winkel_ontwerpen.sql.
import { alsIk, rpc } from "../api";

export type Stijl = "etalage" | "lijst" | "magazine";
export type Deel = "uitgelicht" | "producten" | "over" | "vragen" | "links" | "openingstijden";
export type Opmaak = { stijl: Stijl; kop: string; welkom: string; over: string; openingstijden: string; knop: string;
  volgorde: Deel[]; vragen: { vraag: string; antwoord: string }[]; links: { label: string; url: string }[];
  uitgelicht: number[] };

export const STIJLEN: [Stijl, string, string][] = [
  ["etalage", "Etalage", "Grote foto's in twee rijen"],
  ["magazine", "Magazine", "Eén groot product, dan de rest"],
  ["lijst", "Lijst", "Rustig onder elkaar, met tekst"],
];

export const DELEN: [Deel, string][] = [["uitgelicht", "Uitgelicht"], ["producten", "Producten"], ["over", "Over ons"],
  ["vragen", "Vragen"], ["links", "Links"], ["openingstijden", "Openingstijden"]];

export const STANDAARD_VOLGORDE: Deel[] = DELEN.map(([d]) => d);

const tekst = (x: unknown) => (typeof x === "string" ? x : "");
const lijst = <T,>(x: unknown) => (Array.isArray(x) ? (x as T[]) : []);

/** Wat de database gaf, aangevuld tot een volledige opmaak (oudere winkels hebben nog niets). */
export function opmaakVan(x: unknown): Opmaak {
  const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
  const stijl = STIJLEN.some(([s]) => s === o.stijl) ? (o.stijl as Stijl) : "etalage";
  const volgorde = Array.isArray(o.volgorde)
    ? (o.volgorde as Deel[]).filter((d) => STANDAARD_VOLGORDE.includes(d)) : STANDAARD_VOLGORDE;
  return { stijl, kop: tekst(o.kop), welkom: tekst(o.welkom), over: tekst(o.over), openingstijden: tekst(o.openingstijden),
    knop: tekst(o.knop), volgorde, vragen: lijst(o.vragen), links: lijst(o.links),
    uitgelicht: lijst<number>(o.uitgelicht).filter((n) => typeof n === "number") };
}

/** Een link moet met https beginnen; "instagram.com/sanne" wordt "https://instagram.com/sanne". */
export function linkNetjes(url: string) {
  const u = url.trim();
  if (!u) return "";
  const met = /^https?:\/\//i.test(u) ? u.replace(/^http:/i, "https:") : `https://${u}`;
  try {
    const p = new URL(met);
    return p.protocol === "https:" && p.hostname.includes(".") ? p.toString() : "";
  } catch {
    return "";
  }
}

/** Bewaart de opmaak. `banner`: undefined laat de foto staan, "" haalt hem weg, anders de nieuwe foto. */
export async function opmaakBewaren(opmaak: Opmaak, banner?: string) {
  const r = await alsIk<{ ok?: boolean; fout?: string; opmaak?: unknown }>("winkel_opmaak_bewaren",
    { p_opmaak: opmaak, p_banner: banner ?? null });
  if (r.fout) throw new Error(r.fout);
  return opmaakVan(r.opmaak);
}

const banners = new Map<string, Promise<string | null>>();
/** De bannerfoto van een open winkel, één keer per keer openen opgehaald. */
export function winkelBanner(adres: string) {
  if (!banners.has(adres)) banners.set(adres, rpc<string | null>("winkel_banner", { p_adres: adres }).catch(() => null));
  return banners.get(adres)!;
}

/** Bannerfoto: breed en klein genoeg voor de database (450 kB). */
export async function bannerFoto(bestand: File): Promise<string> {
  const beeld = await createImageBitmap(bestand);
  for (const [maat, kwaliteit] of [[1600, 0.8], [1280, 0.75], [1080, 0.7], [800, 0.6]]) {
    const schaal = Math.min(1, maat / beeld.width);
    const doek = document.createElement("canvas");
    doek.width = Math.round(beeld.width * schaal);
    doek.height = Math.round(beeld.height * schaal);
    doek.getContext("2d")!.drawImage(beeld, 0, 0, doek.width, doek.height);
    const url = doek.toDataURL("image/jpeg", kwaliteit);
    if (url.length <= 440000) return url;
  }
  throw new Error("Deze foto is te groot. Kies een andere.");
}

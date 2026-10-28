// Deellinks: een link naar jouw product of dienst die vanzelf verloopt. Wie hem krijgt, ziet het aanbod zonder in te
// loggen, tot de link verloopt of je hem intrekt. Contactgegevens staan er nooit op.
import { OUDE_APP, alsIk, rpc } from "../api";

export type MijnAanbod = { id: number; soort: string; titel: string; prijs: number | null; prijs_per: string; actief: boolean };
export type Deellink = { code: string; aanbod: number; titel: string; verloopt: string; bekeken: number };
export type Gedeeld = { id: number; soort: string; titel: string; omschrijving: string; prijs: number | null;
  prijs_per: string; plaats: string; aanbieder: string; heeft_foto: boolean; verloopt: string };

export const DUUR = [{ dagen: 1, naam: "1 dag" }, { dagen: 7, naam: "1 week" }, { dagen: 30, naam: "30 dagen" }];

/** De code uit het adres (?deel=...). In de Streamlit-app staat het adres op het venster eromheen. */
export function deelCode(): string | null {
  const uit = (zoek: string) => new URLSearchParams(zoek).get("deel");
  let code = uit(location.search);
  if (!code) {
    try {
      code = uit(window.parent.location.search);
    } catch {
      /* ander adres: dan niet */
    }
  }
  return code && /^[A-Za-z0-9_-]{16,40}$/.test(code) ? code : null;
}

/** Het adres om te delen: de app op Streamlit (met ?nieuw=1), of de pagina waar de app nu staat. */
export function deelAdres(code: string) {
  if (/^https?:\/\//.test(OUDE_APP)) return `${OUDE_APP}?deel=${code}`;
  return `${location.origin}${location.pathname}?deel=${code}`;
}

/** Terug naar de app zonder de deellink in het adres. */
export function naarApp() {
  const weg = (w: Window) => {
    const u = new URL(w.location.href);
    u.searchParams.delete("deel");
    w.location.href = u.toString();
  };
  try {
    if (new URLSearchParams(window.parent.location.search).get("deel")) return weg(window.parent);
  } catch {
    /* ander adres */
  }
  weg(window);
}

export async function mijnAanbod(): Promise<MijnAanbod[]> {
  const a = await alsIk<{ aanbod?: MijnAanbod[] }>("mijn_aanbod");
  return (a.aanbod ?? []).filter((x) => x.actief);
}

export async function mijnLinks(): Promise<Deellink[]> {
  return (await alsIk<{ links?: Deellink[] }>("deellinks_mijn")).links ?? [];
}

export async function linkMaken(aanbod: number, dagen: number) {
  const a = await alsIk<{ code?: string; verloopt?: string; fout?: string }>("deellink_maken", { p_aanbod: aanbod, p_dagen: dagen });
  if (a.fout || !a.code) throw new Error(a.fout || "Delen lukte niet.");
  return { code: a.code, verloopt: a.verloopt! };
}

export const intrekken = (code: string) => alsIk("deellink_intrekken", { p_code: code });

export async function bekijken(code: string): Promise<Gedeeld | null> {
  const a = await rpc<Gedeeld & { verlopen?: boolean }>("deellink_bekijken", { p_code: code });
  return !a || a.verlopen ? null : a;
}

export const totDatum = (iso: string) =>
  new Date(iso).toLocaleDateString("nl-NL", { weekday: "short", day: "numeric", month: "long" });

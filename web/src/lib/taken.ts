// Taken afvinken, ook als ze terugkomen: een taak die elke week terugkomt, krijgt bij afvinken een nieuwe met de
// volgende datum. Zo hoef je "vuilnis buiten zetten" maar één keer in te typen.
import type { Gegevens, Herhaal, Taak } from "../api";
import { datumTekst, nuTekst, plusDagen } from "./tijd";

export const HERHALEN: [Herhaal, string][] = [["dag", "Elke dag"], ["week", "Elke week"], ["maand", "Elke maand"]];

/** De volgende datum na `d` (yyyy-mm-dd), en altijd na vandaag. */
export function volgendeDatum(d: string, herhaal: Herhaal, vandaag = datumTekst(new Date())): string {
  let x = new Date(`${d}T12:00`);
  const stap = () => {
    if (herhaal === "dag") x = plusDagen(x, 1);
    else if (herhaal === "week") x = plusDagen(x, 7);
    else {
      const dag = x.getDate();
      const n = new Date(x.getFullYear(), x.getMonth() + 1, 1, 12);
      n.setDate(Math.min(dag, new Date(n.getFullYear(), n.getMonth() + 1, 0).getDate()));
      x = n;
    }
  };
  stap();
  for (let i = 0; i < 400 && datumTekst(x) <= vandaag; i++) stap();
  return datumTekst(x);
}

/** Vinkt een taak af in de gegevens. Komt hij terug, dan staat de volgende er meteen bij. */
export function afvinkenIn(g: Gegevens, id: number, nu = new Date()): Taak | null {
  const taak = g.taken.find((t) => t.id === id);
  if (!taak || taak.klaar) return null;
  taak.klaar = true;
  // Ingeplande focusblokken voor deze taak die nog moeten komen, zijn niet meer nodig.
  const tekst = nuTekst(nu);
  g.afspraken = g.afspraken.filter((a) => (a as { taak_id?: number }).taak_id !== id || a.start < tekst);
  if (!taak.herhaal) return null;
  const vandaag = datumTekst(nu);
  const nieuw: Taak = { ...taak, id: g.volgend_id, klaar: false,
    deadline: volgendeDatum((taak.deadline ?? vandaag).slice(0, 10), taak.herhaal, vandaag) };
  g.volgend_id += 1;
  g.taken.push(nieuw);
  return nieuw;
}

/** Belangrijk eerst, dan op datum. */
export function sorteer(a: Taak, b: Taak) {
  const p = Number(b.prioriteit === "hoog") - Number(a.prioriteit === "hoog");
  return p || (a.deadline ?? "9").localeCompare(b.deadline ?? "9") || a.id - b.id;
}

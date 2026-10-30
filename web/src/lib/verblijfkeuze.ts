import { kosten, nachten, type Vakantie } from "./vakantie";
import type { Verblijf } from "./verhuur";
export function prijsVoorReis(v: Verblijf, van: string, tot: string, personen: number) {
  const n = nachten(van,tot);
  if (!Number.isInteger(personen) || personen < 1 || personen > v.personen
    || [v.prijs,v.schoonmaak].some(c => !Number.isSafeInteger(c) || c < 0)) throw new Error("Controleer gasten en verblijfprijzen.");
  const totaal = n*v.prijs+v.schoonmaak;
  if (!Number.isSafeInteger(totaal)) throw new Error("De totaalprijs is te groot.");
  return {nachten:n,totaal,schoonmaak:v.schoonmaak,perPersoonPerNacht:Math.round(totaal/personen/n)};
}
export function selecteerVerblijf(lijst: Verblijf[], v: Verblijf) {
  if (lijst.some(p => p.id === v.id)) return lijst.filter(p => p.id !== v.id);
  if (lijst.length >= 3) throw new Error("Vergelijk maximaal drie verblijven tegelijk.");
  return [...lijst,v];
}
export function ruimteVoorVerblijf(v: Vakantie) {
  if (!v.budget) return null;
  return v.budget-(kosten(v).totaal-v.verblijf);
}

export function sorteerVerblijven(lijst: Verblijf[], van: string, tot: string, personen: number) {
  return [...lijst].sort((a,b) => prijsVoorReis(a,van,tot,personen).totaal-prijsVoorReis(b,van,tot,personen).totaal || a.id.localeCompare(b.id));
}

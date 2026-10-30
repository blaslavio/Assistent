import type { Afspraak, Gegevens } from "../api";

export type Vakantie = { id: string; titel: string; plaats: string; van: string; tot: string; personen: number;
  budget: number; verblijf: number; vervoer: number; perDag: number; checklist: string[] };
export const VOORBEREIDING = ["Reisdocumenten en geldigheid controleren", "Verzekering en annuleringsvoorwaarden controleren",
  "Vervoer en aankomst afstemmen", "Sleuteloverdracht en noodcontact afspreken", "Huisdieren, planten en post regelen"];
export function dagGetal(d: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error("Kies geldige datums.");
  const n = Date.parse(`${d}T00:00:00Z`);
  if (!Number.isFinite(n) || new Date(n).toISOString().slice(0, 10) !== d) throw new Error("Kies geldige datums.");
  return n / 86400000;
}
export function nachten(van: string, tot: string) {
  const n = dagGetal(tot) - dagGetal(van);
  if (n < 1 || n > 90) throw new Error("Kies 1 tot en met 90 nachten. Vertrek is na aankomst.");
  return n;
}
export function centen(tekst: string): number {
  if (!/^\d{1,7}([.,]\d{1,2})?$/.test(tekst.trim())) throw new Error("Gebruik een bedrag met maximaal twee decimalen.");
  return Math.round(Number(tekst.replace(",", ".")) * 100);
}
export const euro = (c: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(c / 100);
export function controleer(v: Vakantie): Vakantie {
  if (!v || typeof v !== "object" || [v.id, v.titel, v.plaats, v.van, v.tot].some(s => typeof s !== "string")) throw new Error("Vakantieplan is niet leesbaar.");
  nachten(v.van, v.tot);
  if (!/^[\da-f-]{36}$/i.test(v.id) || !v.titel.trim() || v.titel.length > 100 || !v.plaats.trim() || v.plaats.length > 160
    || !Number.isInteger(v.personen) || v.personen < 1 || v.personen > 30
    || [v.budget, v.verblijf, v.vervoer, v.perDag].some(n => !Number.isSafeInteger(n) || n < 0 || n > 100000000)
    || !Array.isArray(v.checklist) || v.checklist.length > 30 || v.checklist.some(s => typeof s !== "string" || s.length > 150)) {
    throw new Error("Controleer de naam, bestemming, reizigers en bedragen.");
  }
  return { ...v, titel: v.titel.trim(), plaats: v.plaats.trim() };
}
export function plannen(g: Gegevens): Vakantie[] {
  if (g.vakanties === undefined) return [];
  if (!Array.isArray(g.vakanties) || g.vakanties.length > 100) throw new Error("Vakantiegegevens zijn niet leesbaar. Vernieuw voordat je iets wijzigt.");
  return g.vakanties.map(x => controleer(x as Vakantie));
}
export function kosten(v: Vakantie) {
  const n = nachten(v.van, v.tot), dagen = n + 1;
  const totaal = v.verblijf + v.vervoer + dagen * v.personen * v.perDag;
  return { nachten: n, dagen, totaal, verschil: v.budget - totaal };
}
export function botsingen(afspraken: Afspraak[], v: Vakantie) {
  const van = dagGetal(v.van), tot = dagGetal(v.tot);
  return afspraken.filter(a => a.id !== `vakantie:${v.id}` && (() => {
    try { return dagGetal(a.start.slice(0, 10)) <= tot && dagGetal((a.einde || a.start).slice(0, 10)) >= van; }
    catch { return true; } // onleesbare afspraken blijven zichtbaar voor controle
  })());
}
// Een vaste afspraak-ID maakt herhalen veilig. De normale CAS-opslag voorkomt overschrijven van andere wijzigingen.
export function bewaren(g: Gegevens, v: Vakantie, basis?: Vakantie) {
  const schoon = controleer(v), lijst = plannen(g), bestaand = lijst.find(x => x.id === v.id);
  if (bestaand && JSON.stringify(bestaand) === JSON.stringify(schoon)) return;
  if (basis) {
    if (basis.id !== v.id || !bestaand || JSON.stringify(bestaand) !== JSON.stringify(basis)) throw new Error("Het plan is intussen gewijzigd. Vernieuw eerst.");
    g.vakanties = lijst.map(x => x.id === v.id ? schoon : x);
  } else {
    if (bestaand) throw new Error("Dit plan bestaat al met andere gegevens. Open het opnieuw.");
    if (lijst.length >= 100) throw new Error("Je hebt al 100 vakantieplannen.");
    g.vakanties = [...lijst, schoon];
  }
}

export function inAgenda(g: Gegevens, v: Vakantie) {
  const actueel = plannen(g).find(x => x.id === v.id);
  if (!actueel || JSON.stringify(actueel) !== JSON.stringify(v)) throw new Error("Dit vakantieplan is gewijzigd. Vernieuw eerst.");
  const id = `vakantie:${v.id}`;
  const a: Afspraak = { id, titel: `Vakantie: ${v.titel}`, start: v.van, einde: v.tot, locatie: v.plaats,
    soort: "reizen", notitie: "Privévakantieplan. Dit is geen reserverings- of betaalbevestiging. Terugreisdag inbegrepen." };
  const oud = g.afspraken.find(x => x.id === id);
  if (oud && JSON.stringify(oud) !== JSON.stringify(a)) throw new Error("De agenda-afspraak is elders aangepast. Verwijder die eerst bewust vanuit de agenda.");
  if (!oud) g.afspraken.push(a);
}
export function verwijderen(g: Gegevens, v: Vakantie) {
  const lijst = plannen(g), oud = lijst.find(x => x.id === v.id);
  if (oud && JSON.stringify(oud) !== JSON.stringify(v)) throw new Error("Het plan is intussen gewijzigd. Vernieuw eerst.");
  g.vakanties = lijst.filter(x => x.id !== v.id);
  // Een los bewerkte agenda-afspraak blijft behouden: verwijderen van een plan is geen agenda-annulering.
}
export function reisbrief(v: Vakantie) {
  const k = kosten(v);
  return `${v.titel}\nBestemming: ${v.plaats}\n${v.van} t/m ${v.tot} · ${k.nachten} nachten · ${v.personen} reizigers\nBegroting: ${euro(k.totaal)} (schatting)\nNog te regelen:\n${VOORBEREIDING.filter(t => !v.checklist.includes(t)).map(t => `- ${t}`).join("\n") || "Basischecklist afgerond"}\nDit plan is geen boeking. Controleer actuele prijzen en voorwaarden.`;
}

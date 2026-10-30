/** Kleine, controleerbare taakopdrachten. Geen AI, netwerk of agenda-aanpassingen. */
import type { Gegevens, Taak } from "../api";
import { afvinkenIn } from "./taken";

export type DagActie = { soort: "toevoegen"; opdracht: string; titel: string; basis: Taak[] }
  | { soort: "afronden"; taak: Taak };
type MetOpdracht = Taak & { vandaag_opdracht?: string };

export function taakVoorstel(titel: string, basis: Taak[], opdracht: string = crypto.randomUUID()): DagActie {
  const schoon = titel.trim();
  if (!schoon || schoon.length > 160 || /[\p{Cc}\p{Cs}]/u.test(schoon)) {
    throw new Error("Geef de taak een titel van 1 tot 160 tekens zonder controletekens.");
  }
  if (!/^[a-zA-Z0-9_-]{8,80}$/.test(opdracht)) throw new Error("Ongeldige opdrachtcode.");
  return { soort: "toevoegen", opdracht, titel: schoon, basis: structuredClone(basis) };
}

function canoniek(waarde: unknown): unknown {
  if (Array.isArray(waarde)) return waarde.map(canoniek);
  if (waarde && typeof waarde === "object") return Object.fromEntries(
    Object.entries(waarde).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canoniek(v)]));
  return waarde;
}

export function gelijk(a: unknown, b: unknown) {
  return JSON.stringify(canoniek(a)) === JSON.stringify(canoniek(b));
}

export function taakUitvoeren(g: Gegevens, actie: DagActie): void {
  if (actie.soort === "toevoegen") {
    taakVoorstel(actie.titel, actie.basis, actie.opdracht);
    const bestaand = (g.taken as MetOpdracht[]).find(t => t.vandaag_opdracht === actie.opdracht);
    // Een verloren antwoord mag bij opnieuw proberen geen tweede taak maken.
    if (bestaand) return;
    if (!gelijk(g.taken, actie.basis)) throw new Error("De takenlijst is intussen gewijzigd. Vernieuw en controleer eerst of je taak al bestaat.");
    const gebruikt = [...g.taken, ...g.afspraken].map(t => t.id).filter((id): id is number => typeof id === "number");
    const hoogste = gebruikt.reduce((max, id) => Math.max(max, id), 0);
    if (!Number.isSafeInteger(g.volgend_id) || g.volgend_id < 1) throw new Error("De ID-teller is ongeldig. Controleer eerst je gegevens.");
    const id = Math.max(g.volgend_id, hoogste + 1);
    if (!Number.isSafeInteger(id + 1)) throw new Error("Er is geen veilig taaknummer beschikbaar.");
    (g.taken as MetOpdracht[]).push({ id, titel: actie.titel, deadline: null, klaar: false, vandaag_opdracht: actie.opdracht });
    g.volgend_id = id + 1;
    return;
  }
  const taak = g.taken.find(t => t.id === actie.taak.id);
  if (!taak) throw new Error("Deze taak is inmiddels verwijderd. Vernieuw je overzicht.");
  const verwacht = { ...actie.taak, klaar: true };
  const zonderAfrondtijd = (t: Taak) => {
    const { klaar_op: _tijd, ...rest } = t as Taak & { klaar_op?: string };
    return rest;
  };
  if (taak.klaar && gelijk(zonderAfrondtijd(taak), zonderAfrondtijd(verwacht))) return;
  if (!gelijk(taak, actie.taak)) throw new Error("Deze taak is intussen gewijzigd. Vernieuw en controleer opnieuw.");
  if (taak.herhaal) {
    const hoogste = [...g.taken, ...g.afspraken].reduce((max, t) => typeof t.id === "number" ? Math.max(max, t.id) : max, 0);
    const volgend = Math.max(g.volgend_id, hoogste + 1);
    if (!Number.isSafeInteger(volgend) || volgend < 1 || !Number.isSafeInteger(volgend + 1)) {
      throw new Error("Er is geen veilig taaknummer beschikbaar.");
    }
    g.volgend_id = volgend;
  }
  // Behoud hoofdversiegedrag voor herhaling en afrondtijd, zonder agenda te wissen.
  afvinkenIn(g, taak.id, new Date(), true);
}

export function taakResultaat(g: Gegevens, actie: DagActie): Taak {
  const taak = actie.soort === "toevoegen"
    ? (g.taken as MetOpdracht[]).find(t => t.vandaag_opdracht === actie.opdracht)
    : g.taken.find(t => t.id === actie.taak.id && t.klaar);
  if (!taak) throw new Error("Het taakresultaat kon niet worden bevestigd. Vernieuw je overzicht.");
  return taak;
}

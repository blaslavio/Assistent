/** Bevestigde projectfeiten met echte afzender en bron. Geen AI-inferenties of netwerk. */
import type { Bericht, Regel } from "./chat";
import { valideerStappen, type Stap } from "./projectplan";
import { tijdInstant, valideerVensters, type Venster } from "./projecttijd";

export type Bron = { soort: "eigen" } | { soort: "bericht"; id: number }
  | { soort: "bestand"; id: string; citaat: string };
export type Soort = "kennis" | "besluit" | "actie" | "vraag" | "aandacht" | "bereikbaar" | "toestemming" | "afgerond" | "aanpak" | "stapstatus" | "werkvenster" | "staptijd";
export type ProjectActie = Bericht & { t: "projectactie"; versie: 1; sleutel: string; soort: Soort; tekst: string;
  bron: Bron; geldigMinuten?: number; doel?: string; minuten?: number; verantwoordelijke?: number; keuze?: string; leden?: number[];
  stappen?: Stap[]; vervangt?: string; stap?: string; uiterlijk?: string; vensters?: Venster[]; van?: string; tot?: string; afspraak?: number };
export type Feit = { bericht: number; afzender: number; tijd: string; actie: ProjectActie };
const ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const SOORTEN: Soort[] = ["kennis", "besluit", "actie", "vraag", "aandacht", "bereikbaar", "toestemming", "afgerond", "aanpak", "stapstatus", "werkvenster", "staptijd"];
export const PROJECTKENNIS = ["kennis", "besluit", "actie", "vraag", "aanpak", "stapstatus", "staptijd"];
export const PROJECT_SCOPE = "00000000-0000-4000-8000-000000000000";
const veilig = (x: unknown, max: number, regels = false): x is string => typeof x === "string" && x.length <= max
  && !(/[\p{Cs}\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/u.test(x)) && (regels || !/[\n\r\t]/.test(x));

export function valideerBron(b: unknown): Bron {
  if (!b || typeof b !== "object") throw new Error("Kies een herleidbare bron.");
  const r = b as Record<string, unknown>;
  if (r.soort === "eigen" && Object.keys(r).length === 1) return { soort: "eigen" };
  if (r.soort === "bericht" && Object.keys(r).length === 2 && Number.isSafeInteger(r.id) && Number(r.id) > 0) return { soort: "bericht", id: Number(r.id) };
  if (r.soort === "bestand" && Object.keys(r).length === 3 && typeof r.id === "string" && ID.test(r.id)
    && veilig(r.citaat, 500, true) && r.citaat.trim()) return { soort: "bestand", id: r.id, citaat: r.citaat };
  throw new Error("Ongeldige bronverwijzing.");
}
export function projectActie(waarde: unknown): ProjectActie {
  if (!waarde || typeof waarde !== "object") throw new Error("Ongeldig projectvoorstel.");
  const b = { ...waarde as ProjectActie };
  if (Object.keys(b).some(k => !["t", "versie", "sleutel", "soort", "tekst", "bron", "geldigMinuten", "doel", "minuten", "verantwoordelijke", "keuze", "leden", "stappen", "vervangt", "stap", "uiterlijk", "vensters", "van", "tot", "afspraak"].includes(k))
    || b.t !== "projectactie" || b.versie !== 1 || typeof b.sleutel !== "string" || !ID.test(b.sleutel) || !SOORTEN.includes(b.soort)
    || !veilig(b.tekst, 1500, true) || !b.tekst.trim()) throw new Error("Gebruik een geldig projectvoorstel van maximaal 1500 tekens.");
  const bron = valideerBron(b.bron);
  if (b.geldigMinuten !== undefined && (b.soort !== "toestemming" || ![15, 60, 1440].includes(b.geldigMinuten))) throw new Error("Kies toestemming voor 15 minuten, 1 uur of 24 uur.");
  if (b.doel !== undefined && (typeof b.doel !== "string" || !ID.test(b.doel))) throw new Error("Ongeldig projectdoel.");
  if (b.minuten !== undefined && (!Number.isSafeInteger(b.minuten) || b.minuten < 5 || b.minuten > 480)) throw new Error("Kies 5 tot 480 minuten.");
  if (b.verantwoordelijke !== undefined && (!Number.isSafeInteger(b.verantwoordelijke) || b.verantwoordelijke < 1)) throw new Error("Kies een deelnemer.");
  if (b.soort === "toestemming" && (!b.doel || !["geen", "titel", "tekst"].includes(b.keuze ?? ""))) throw new Error("Kies een geldige bestandstoestemming.");
  if (b.soort === "toestemming" && (!Array.isArray(b.leden) || b.leden.length < 1 || b.leden.length > 100
    || b.leden.some(id => !Number.isSafeInteger(id) || id < 1) || new Set(b.leden).size !== b.leden.length)) throw new Error("Controleer de deelnemers voor deze toestemming.");
  if (b.leden !== undefined && b.soort !== "toestemming") throw new Error("Onverwachte deelnemerslijst.");
  if (b.soort === "bereikbaar" && !["beschikbaar", "focus", "urgent", "afwezig"].includes(b.keuze ?? "")) throw new Error("Kies je bereikbaarheid.");
  if (b.soort === "afgerond" && !b.doel) throw new Error("Kies een bestaande actie of vraag.");
  if (b.keuze !== undefined && !["toestemming", "bereikbaar", "stapstatus"].includes(b.soort)) throw new Error("Onverwachte projectkeuze.");
  if (b.soort === "aanpak") {
    if (!b.doel || (b.vervangt !== undefined && (typeof b.vervangt !== "string" || !ID.test(b.vervangt)))) throw new Error("Kies een bestaand projectdoel en geldige aanpakversie.");
    b.stappen = valideerStappen(b.stappen);
    if (b.uiterlijk !== undefined) tijdInstant(b.uiterlijk);
  } else if (b.stappen !== undefined || b.vervangt !== undefined || b.uiterlijk !== undefined) throw new Error("Onverwachte aanpakvelden.");
  if (b.soort === "stapstatus" && (!b.doel || typeof b.stap !== "string" || !ID.test(b.stap) || !["te_doen", "bezig", "klaar", "vast"].includes(b.keuze ?? ""))) throw new Error("Kies een geldige stap en uitvoerstatus.");
  if (b.stap !== undefined && !["stapstatus", "staptijd"].includes(b.soort)) throw new Error("Onverwachte stapverwijzing.");
  if (b.soort === "staptijd") {
    if (!b.doel || typeof b.stap !== "string" || !ID.test(b.stap) || !Number.isSafeInteger(b.afspraak) || b.afspraak! < 1) throw new Error("Kies een geldige stap en bevestigde eigen afspraak.");
    valideerVensters([{ van: b.van, tot: b.tot }]);
  } else if (b.van !== undefined || b.tot !== undefined || b.afspraak !== undefined) throw new Error("Onverwachte afspraakgegevens.");
  if (b.soort === "werkvenster") b.vensters = valideerVensters(b.vensters);
  else if (b.vensters !== undefined) throw new Error("Onverwachte beschikbaarheid.");
  if (JSON.stringify(b).length > 16_000) throw new Error("Het projectvoorstel is te groot.");
  return { ...b, bron };
}
export const nieuwFeit = (soort: Soort, tekst: string, bron: Bron = { soort: "eigen" }, extra: Partial<ProjectActie> = {}) =>
  projectActie({ ...extra, t: "projectactie", versie: 1, sleutel: crypto.randomUUID(), soort, tekst, bron });

export function projectFeiten(regels: Regel[]): Feit[] {
  const gezien = new Map<string, Feit>();
  for (const r of [...regels].sort((a, b) => a.id - b.id)) {
    if (r.weg || r.fout || r.bericht?.t !== "projectactie" || !Number.isSafeInteger(r.afzender) || r.afzender < 1) continue;
    try {
      const actie = projectActie(r.bericht);
      if (actie.soort === "toestemming" && !actie.leden?.includes(r.afzender)) continue;
      if (actie.soort === "aanpak") {
        const doel = gezien.get(actie.doel!);
        if (!doel || !["actie", "besluit", "vraag"].includes(doel.actie.soort)) continue;
        if (actie.vervangt && (gezien.get(actie.vervangt)?.actie.soort !== "aanpak" || gezien.get(actie.vervangt)?.actie.doel !== actie.doel)) continue;
      }
      if (["stapstatus", "staptijd"].includes(actie.soort)) {
        const plan = gezien.get(actie.doel!); const stap = plan?.actie.stappen?.find(s => s.id === actie.stap);
        if (!plan || !stap || (r.afzender !== plan.afzender && r.afzender !== stap.eigenaar)) continue;
      }
      if (!gezien.has(actie.sleutel)) gezien.set(actie.sleutel, { bericht: r.id, afzender: r.afzender, tijd: r.tijd, actie });
    } catch { /* Onbekende/ongeldige protocollen leveren geen bewezen projectfeit op. */ }
  }
  return [...gezien.values()];
}
export function isAfgerond(feit: Feit, feiten: Feit[]) {
  return feiten.some(f => f.actie.soort === "afgerond" && f.actie.doel === feit.actie.sleutel
    && f.bericht > feit.bericht && (f.afzender === feit.afzender || f.afzender === feit.actie.verantwoordelijke));
}
export function toestemmingen(feiten: Feit[], bestand: string, leden: number[], nu = Date.now()) {
  const ids = [...new Set(leden)].filter(i => Number.isSafeInteger(i) && i > 0);
  const waarden = ids.map(id => [...feiten].reverse().find(f => f.afzender === id && f.actie.soort === "toestemming"
    && f.actie.doel === bestand));
  const actueel = waarden.every(f => f && [...f.actie.leden ?? []].sort((a,b)=>a-b).join() === [...ids].sort((a,b)=>a-b).join()
    && Number.isFinite(Date.parse(f.tijd)) && nu >= Date.parse(f.tijd)
    && nu - Date.parse(f.tijd) < (f.actie.geldigMinuten ?? 1440) * 60_000);
  return { titel: ids.length > 0 && actueel && waarden.every(f => ["titel", "tekst"].includes(f!.actie.keuze!)),
    tekst: ids.length > 0 && actueel && waarden.every(f => f!.actie.keuze === "tekst") };
}
export function bronStatus(bron: Bron, regels: Regel[], bestanden: Map<string, { inhoud: string }>) {
  if (bron.soort === "eigen") return "Eigen inbreng, expliciet bevestigd";
  if (bron.soort === "bericht") return regels.some(r => r.id === bron.id && !r.weg && !r.fout && r.bericht?.t === "tekst")
    ? `Chatbericht ${bron.id}` : "Bronbericht ontbreekt of kan niet worden gelezen";
  const b = bestanden.get(bron.id);
  return b && b.inhoud.includes(bron.citaat) ? "Geselecteerde tekst in projectbestand" : "De aangewezen tekst is gewijzigd of ontbreekt";
}
export function overdracht(feiten: Feit[], namen: Map<number, string>, bestanden: { titel: string; wacht: boolean }[]) {
  const sectie = (soort: Soort) => feiten.filter(f => f.actie.soort === soort).map(f =>
    `- ${f.actie.tekst}${f.actie.uiterlijk ? " (deadline: " + f.actie.uiterlijk + ")" : ""}${f.actie.stappen?.map(s => "\n  - " + s.titel + "; klaar als: " + s.klaarAls + "; " + s.minuten + " minuten; uitvoerder: " + (namen.get(s.eigenaar ?? 0) ?? "nog toewijzen") + "; alternatief: " + (s.alternatief || "nog niet opgegeven")).join("") ?? ""}${isAfgerond(f, feiten) ? " [afgerond]" : ""} — ${namen.get(f.afzender) ?? "Deelnemer"}; bevestiging: projectbericht ${f.bericht}; bron: ${f.actie.bron.soort === "bericht" ? "chatbericht " + f.actie.bron.id : f.actie.bron.soort === "bestand" ? "bestand " + f.actie.bron.id : "eigen inbreng"}`);
  return ["# Projectoverdracht", "", "Samengesteld uit de op dit apparaat beschikbare bevestigde feiten; geen AI-samenvatting.", "",
    ...([ ["kennis", "Projectkennis"], ["besluit", "Besluiten"], ["actie", "Acties"], ["vraag", "Open vragen"], ["aanpak", "Aanpakken en deadlines"], ["stapstatus", "Stapresultaten"], ["staptijd", "Gedeelde tijdvakken"] ] as const)
      .flatMap(([s, label]) => [`## ${label}`, ...sectie(s), ""]),
    "## Bestanden", ...bestanden.map(b => `- ${b.titel}${b.wacht ? " [lokale wijzigingen nog niet bevestigd]" : ""}`),
    "", "Ontbrekende chatgeschiedenis, verwijderde bronnen en externe afspraken zijn niet gecontroleerd."].join("\n");
}
export function oefenplanning(feiten: Feit[], minuten: number, personen: number[]) {
  if (!Number.isSafeInteger(minuten) || minuten < 5 || minuten > 480 || !personen.length) throw new Error("Kies deelnemers en 5 tot 480 beschikbare minuten per persoon.");
  const gebruikt = new Map(personen.map(id => [id, 0]));
  return feiten.filter(f => f.actie.soort === "actie" && !isAfgerond(f, feiten)).map(f => {
    const duur = f.actie.minuten ?? 30;
    const opties = f.actie.verantwoordelijke ? personen.filter(i => i === f.actie.verantwoordelijke) : personen;
    const wie = [...opties].sort((a, b) => gebruikt.get(a)! - gebruikt.get(b)!).find(id => gebruikt.get(id)! + duur <= minuten);
    if (wie !== undefined) gebruikt.set(wie, gebruikt.get(wie)! + duur);
    return { feit: f, wie, minuten: duur };
  });
}

export function assistentContext(feiten: Feit[], bestanden: { id: string; titel: string; inhoud: string; auteurs?: number[]; onbekendeHerkomst?: boolean }[], leden: number[], kennis: boolean, nu = Date.now()) {
  const delen: string[] = [];
  if (kennis) {
    const nodig = [...new Set([...leden, ...feiten.filter(f => PROJECTKENNIS.includes(f.actie.soort)).map(f => f.afzender)])];
    if (!toestemmingen(feiten, PROJECT_SCOPE, nodig, nu).tekst) throw new Error("Niet alle deelnemers en bronbijdragers geven actuele toestemming voor projectkennis.");
    delen.push(...feiten.filter(f => PROJECTKENNIS.includes(f.actie.soort))
      .map(f => `[bron:projectbericht-${f.bericht}] ${f.actie.soort}: ${f.actie.tekst}${f.actie.stappen ? "\n" + f.actie.stappen.map(s => `${s.id}: ${s.titel}; klaar als: ${s.klaarAls}; alternatief: ${s.alternatief}`).join("\n") : ""}${f.actie.keuze ? "; status: " + f.actie.keuze : ""}`));
  }
  for (const b of bestanden) {
    if (b.onbekendeHerkomst) throw new Error("Van dit herstelde bestand zijn niet alle bronbijdragers bekend. Het kan niet automatisch met AI worden gedeeld.");
    const mag = toestemmingen(feiten, b.id, [...new Set([...leden, ...b.auteurs ?? []])], nu);
    if (!mag.titel) throw new Error("Niet alle huidige deelnemers geven actuele toestemming voor dit bestand.");
    delen.push(mag.tekst ? `[bestand:${b.id}] ${b.titel}\n${b.inhoud}` : `[bestand:${b.id}] Alleen titel: ${b.titel}`);
  }
  const tekst = delen.join("\n\n");
  if (!tekst || tekst.length > 16_000) throw new Error("Kies toegestane bronnen met samen maximaal 16.000 tekens.");
  return tekst;
}

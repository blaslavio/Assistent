/** Gedeelde tekstbestanden: Yjs-updates reizen als bestaande versleutelde chatberichten. */
import * as Y from "yjs";
import { huidigeSessie } from "../api";
import { versturen, type Bericht, type Regel } from "./chat";

export const MAX_TEKST = 50_000;
const MAX_UPDATE = 256_000;
const ORIGIN = "ontvangen";
const ONGELDIGE_TEKST = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]|\p{Cs}/u;
export type ProjectBericht = Bericht & { t: "project"; versie: 1; bestand: string; titel: string; update: string };

const coderen = (bytes: Uint8Array) => {
  let s = "";
  for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(s);
};
const decoderen = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));

export function leesProjectbericht(b: Bericht | undefined): ProjectBericht | null {
  if (!b || b.t !== "project" || b.versie !== 1 || typeof b.bestand !== "string"
    || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(b.bestand)
    || typeof b.titel !== "string" || !b.titel.trim() || b.titel.length > 100 || /[\p{Cc}\p{Cs}]/u.test(b.titel)
    || !/\.(txt|md)$/i.test(b.titel)
    || typeof b.update !== "string" || b.update.length > MAX_UPDATE * 1.4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(b.update)) return null;
  return b as ProjectBericht;
}

export class Werkbestand {
  readonly doc = new Y.Doc();
  readonly tekst = this.doc.getText("inhoud");
  private wachtrij: Uint8Array[] = [];
  private luisteraars = new Set<() => void>();
  bezig = false;
  fout = "";
  bevestigd = false;
  laatstVerstuurd = 0;

  constructor(readonly id: string, readonly titel: string) {
    this.doc.on("update", (update: Uint8Array, oorsprong: unknown) => {
      if (oorsprong !== ORIGIN) this.wachtrij.push(update);
      this.meld();
    });
  }
  volgen = (f: () => void) => { this.luisteraars.add(f); return () => { this.luisteraars.delete(f); }; };
  meld() { this.luisteraars.forEach(f => f()); }
  get wacht() { return this.wachtrij.length > 0; }
  get inhoud() { return this.tekst.toString(); }

  invoerBasis() { return Y.encodeStateAsUpdate(this.doc); }
  bewerk(nieuw: string, basis?: Uint8Array) {
    if (nieuw.length > MAX_TEKST || ONGELDIGE_TEKST.test(nieuw)) throw new Error("Gebruik maximaal 50.000 geldige teksttekens.");
    if (basis) {
      // Een IME-concept kan nog op een oudere zichtbare tekst zijn gebaseerd.
      // Bewerk die eigen versie en merge de CRDT-delta; wis geen intussen ontvangen tekst.
      const invoer = new Werkbestand(this.id, this.titel);
      try {
        Y.applyUpdate(invoer.doc, basis, ORIGIN);
        invoer.bewerk(nieuw);
        this.toepassen(Y.encodeStateAsUpdate(invoer.doc, Y.encodeStateVector(this.doc)), "lokale-invoer");
      } finally { invoer.doc.destroy(); }
      return;
    }
    const oud = this.inhoud;
    let voor = 0, achter = 0;
    while (voor < oud.length && voor < nieuw.length && oud[voor] === nieuw[voor]) voor++;
    while (achter < oud.length - voor && achter < nieuw.length - voor && oud[oud.length - 1 - achter] === nieuw[nieuw.length - 1 - achter]) achter++;
    // UTF-16-grenzen niet midden in een emoji leggen.
    if (voor > 0 && /[\uD800-\uDBFF]/.test(oud[voor - 1])) voor--;
    if (achter > 0 && /[\uDC00-\uDFFF]/.test(oud[oud.length - achter])) achter--;
    this.doc.transact(() => {
      const weg = oud.length - voor - achter;
      if (weg) this.tekst.delete(voor, weg);
      const erbij = nieuw.slice(voor, nieuw.length - achter);
      if (erbij) this.tekst.insert(voor, erbij);
    });
  }
  maakLeeg() { this.wachtrij.push(Y.encodeStateAsUpdate(this.doc)); this.meld(); }

  ontvang(b: ProjectBericht) {
    if (b.bestand !== this.id) throw new Error("Deze wijziging hoort bij een ander bestand.");
    this.toepassen(decoderen(b.update), ORIGIN);
    this.bevestigd = true;
    this.meld();
  }
  private toepassen(bytes: Uint8Array, oorsprong: string) {
    if (bytes.length > MAX_UPDATE) throw new Error("De gedeelde wijziging is te groot.");
    const controle = new Y.Doc();
    try {
      Y.applyUpdate(controle, Y.encodeStateAsUpdate(this.doc));
      Y.applyUpdate(controle, bytes);
      if (controle.getText("inhoud").length > MAX_TEKST || ONGELDIGE_TEKST.test(controle.getText("inhoud").toString())) throw new Error("Het gedeelde bestand is te groot of bevat ongeldige tekens.");
      Y.applyUpdate(this.doc, bytes, oorsprong);
    } finally { controle.destroy(); }
  }

  async verstuur(stuur: (b: ProjectBericht) => Promise<unknown>) {
    if (this.bezig || !this.wacht) return;
    const aantal = this.wachtrij.length;
    const bytes = Y.mergeUpdates(this.wachtrij.slice(0, aantal));
    if (bytes.length > MAX_UPDATE) throw new Error("De wijziging is te groot. Download je tekst voordat je verdergaat.");
    this.bezig = true; this.fout = ""; this.meld();
    try {
      await stuur({ t: "project", versie: 1, bestand: this.id, titel: this.titel, update: coderen(bytes) });
      this.wachtrij.splice(0, aantal);
      this.bevestigd = true;
      this.laatstVerstuurd = Date.now();
    } catch {
      this.fout = "Delen is nog niet bevestigd. Je tekst blijft op dit apparaat klaarstaan; probeer opnieuw of download een kopie.";
    } finally { this.bezig = false; this.meld(); }
  }
}

type Ruimte = { bestanden: Map<string, Werkbestand>; gezien: Set<number>; fout: string; laatstPoging: number };
let account = huidigeSessie();
const ruimtes = new Map<number, Ruimte>();
function bewaak() {
  if (account !== huidigeSessie()) {
    ruimtes.forEach(r => { r.bestanden.forEach(b => b.doc.destroy()); r.bestanden.clear(); });
    ruimtes.clear(); account = huidigeSessie();
  }
}
export function werkruimte(gesprek: number): Ruimte {
  bewaak();
  if (!ruimtes.has(gesprek)) ruimtes.set(gesprek, { bestanden: new Map(), gezien: new Set(), fout: "", laatstPoging: 0 });
  return ruimtes.get(gesprek)!;
}
export function projectLezen(gesprek: number, regels: Regel[]) {
  const r = werkruimte(gesprek);
  for (const regel of regels) {
    if (r.gezien.has(regel.id) || regel.weg || regel.bericht?.t !== "project") continue;
    const b = leesProjectbericht(regel.bericht);
    if (!b) { r.fout = "Een onleesbare projectwijziging is overgeslagen."; r.gezien.add(regel.id); continue; }
    try {
      if (!r.bestanden.has(b.bestand)) {
        if (r.bestanden.size >= 50) throw new Error("Maximaal 50 bestanden per gesprek.");
        const nieuw = new Werkbestand(b.bestand, b.titel);
        try { nieuw.ontvang(b); } catch (e) { nieuw.doc.destroy(); throw e; }
        r.bestanden.set(b.bestand, nieuw);
      } else {
        r.bestanden.get(b.bestand)!.ontvang(b);
      }
      r.gezien.add(regel.id);
    } catch { r.gezien.add(regel.id); r.fout = "Een projectwijziging kon niet worden samengevoegd. Download een kopie van je eigen tekst."; }
  }
  return r;
}
export function bestandMaken(gesprek: number, titel: string, inhoud = "") {
  const r = werkruimte(gesprek);
  titel = titel.trim();
  if (!/\.[^.]+$/.test(titel)) titel += ".md";
  if (!/\.(txt|md)$/i.test(titel)) throw new Error("Gedeeld bewerken ondersteunt .txt en .md; geen Word-, Excel- of PDF-bestanden.");
  if (!titel.trim() || titel.length > 100 || /[\p{Cc}\p{Cs}]/u.test(titel) || r.bestanden.size >= 50) throw new Error("Kies een geldige bestandsnaam; maximaal 50 bestanden per gesprek.");
  const b = new Werkbestand(crypto.randomUUID(), titel.trim());
  b.bewerk(inhoud); b.maakLeeg();
  r.bestanden.set(b.id, b);
  return b;
}
export async function bestandDelen(gesprek: number, b: Werkbestand) {
  const sessie = huidigeSessie();
  if (!sessie || werkruimte(gesprek).bestanden.get(b.id) !== b) throw new Error("Open het project opnieuw binnen je huidige account.");
  werkruimte(gesprek).laatstPoging = Date.now();
  await b.verstuur(async bericht => {
    if (huidigeSessie() !== sessie) throw new Error("Account gewijzigd.");
    return versturen(gesprek, bericht);
  });
}
if (typeof window !== "undefined") window.addEventListener("assistent-sessie", bewaak);
if (typeof window !== "undefined") window.addEventListener("beforeunload", event => {
  if (account === huidigeSessie() && [...ruimtes.values()].some(r => [...r.bestanden.values()].some(b => b.wacht))) {
    event.preventDefault(); event.returnValue = "";
  }
});

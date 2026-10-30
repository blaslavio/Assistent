/** Nederlandse kloktijden expliciet omzetten; geen afhankelijkheid van de browsertijdzone. */
const nl = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
export function lokaleTijd(instant: number) {
  const p = Object.fromEntries(nl.formatToParts(new Date(instant)).map(p => [p.type,p.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
}
export function tijdInstant(tekst: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{3})?)?(Z|[+-]\d{2}:\d{2})$/.exec(tekst);
  if (!m) throw new Error("Gebruik een tijdstip met expliciete tijdzone.");
  const [y,mo,d,h,mi,s] = m.slice(1,7).map(x => Number(x || 0));
  const offset = m[7]; const oh = Number(offset.slice(1,3)), om = Number(offset.slice(4,6));
  if (y < 100 || y > 9999 || mo < 1 || mo > 12 || d < 1 || d > new Date(Date.UTC(y,mo,0)).getUTCDate()
    || h > 23 || mi > 59 || s > 59 || (offset !== "Z" && (oh > 14 || om > 59 || (oh === 14 && om > 0)))) throw new Error("Ongeldig tijdstip.");
  const n = Date.parse(tekst); if (!Number.isFinite(n)) throw new Error("Ongeldig tijdstip."); return n;
}
export function nederlandseInstant(tekst: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(tekst)) throw new Error("Kies een geldige Nederlandse datum en tijd.");
  const doel = tekst.length === 16 ? tekst + ":00" : tekst;
  const opties = ["+01:00", "+02:00"].map(o => { try { return tijdInstant(doel + o); } catch { return NaN; } })
    .filter(n => Number.isFinite(n) && lokaleTijd(n) === doel);
  if (opties.length !== 1) throw new Error("Dit tijdstip bestaat niet of is dubbel door de klokwissel. Kies een ander tijdstip.");
  return new Date(opties[0]).toISOString();
}
export type Venster = { van: string; tot: string };
export function valideerVensters(waarde: unknown): Venster[] {
  if (!Array.isArray(waarde) || !waarde.length || waarde.length > 14) throw new Error("Kies 1 tot 14 beschikbare tijdvakken.");
  const uit = waarde.map(v => {
    if (!v || Object.keys(v).sort().join() !== "tot,van" || typeof v.van !== "string" || typeof v.tot !== "string") throw new Error("Ongeldig tijdvak.");
    const van = tijdInstant(v.van), tot = tijdInstant(v.tot);
    if (tot <= van || tot - van > 24 * 3600_000) throw new Error("Een tijdvak duurt meer dan nul en maximaal 24 uur.");
    return { van: new Date(van).toISOString(), tot: new Date(tot).toISOString() };
  }).sort((a,b) => tijdInstant(a.van) - tijdInstant(b.van));
  if (tijdInstant(uit.at(-1)!.tot) - tijdInstant(uit[0].van) > 14 * 86400_000) throw new Error("Verdeel beschikbaarheid over maximaal veertien dagen.");
  return uit;
}

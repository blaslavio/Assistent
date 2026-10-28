// Datums zoals de oude app ze bewaart: "2026-10-28T10:00" (lokale tijd, zonder tijdzone).
export const DAGEN = ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"];
export const DAGEN_KORT = ["zo", "ma", "di", "wo", "do", "vr", "za"];
export const MAANDEN = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september",
  "oktober", "november", "december"];

export const twee = (n: number) => String(n).padStart(2, "0");

export function datumTekst(d: Date) {
  return `${d.getFullYear()}-${twee(d.getMonth() + 1)}-${twee(d.getDate())}`;
}

export function moment(tekst: string) {
  return new Date(tekst.length <= 10 ? `${tekst}T00:00` : tekst);
}

export function uur(tekst?: string | null) {
  return tekst && tekst.length > 10 ? tekst.slice(11, 16) : "";
}

export function heleDag(tekst: string) {
  return tekst.length <= 10 || tekst.slice(11, 16) === "00:00";
}

export function dagTitel(d: Date) {
  const tekst = `${DAGEN[d.getDay()]} ${d.getDate()} ${MAANDEN[d.getMonth()]}`;
  return tekst[0].toUpperCase() + tekst.slice(1);
}

export function groet(d = new Date()) {
  const u = d.getHours();
  return u < 6 ? "Goedenacht" : u < 12 ? "Goedemorgen" : u < 18 ? "Goedemiddag" : "Goedenavond";
}

/** "Over 25 min", "Over 2 uur", "Nu bezig" of "" als het niet vandaag is. */
export function hoeLang(start: Date, einde: Date | null, nu = new Date()) {
  const minuten = Math.round((start.getTime() - nu.getTime()) / 60000);
  if (minuten <= 0) return einde && einde > nu ? "Nu bezig" : "";
  if (minuten < 60) return `Over ${minuten} min`;
  if (minuten < 24 * 60) return `Over ${Math.round(minuten / 60)} uur`;
  return "";
}

/** Maandag van de week waarin d valt. */
export function weekBegin(d: Date) {
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return m;
}

export function plusDagen(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** Nu als "2026-10-28T09:41", in lokale tijd zoals de afspraken bewaard zijn. */
export function nuTekst(d = new Date()) {
  return `${datumTekst(d)}T${twee(d.getHours())}:${twee(d.getMinutes())}`;
}

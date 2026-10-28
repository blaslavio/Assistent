// Kleine voorstellen op Vandaag, met één tik af te handelen. Ze worden hier op het apparaat bedacht uit je agenda en
// taken, zonder de assistent: snel, gratis en er gaat niets het huis uit. Hoogstens één tegelijk, zodat het rustig blijft.
import type { Afspraak, Gegevens } from "../api";
import { datumTekst, heleDag, moment, nuTekst, plusDagen, twee } from "./tijd";

export type Optie = { label: string; gevolg: string; doe?: (g: Gegevens) => void };
export type Voorstel = { sleutel: string; vraag: string; opties: Optie[]; aanbevolen: number };

const tijdTekst = (d: Date) => `${datumTekst(d)}T${twee(d.getHours())}:${twee(d.getMinutes())}`;

/** Het eerste vrije blok van `minuten` vandaag, tussen nu (afgerond op het halfuur) en 21:00. */
export function vrijBlok(afspraken: Afspraak[], nu: Date, minuten: number) {
  const vandaag = datumTekst(nu);
  let van = new Date(nu);
  van.setMinutes(van.getMinutes() < 30 ? 30 : 60, 0, 0);
  const begin = new Date(`${vandaag}T08:00`);
  if (van < begin) van = begin;
  const grens = new Date(`${vandaag}T21:00`);
  const bezet = afspraken.filter((a) => a.start.slice(0, 10) === vandaag && !heleDag(a.start))
    .map((a) => [moment(a.start), a.einde ? moment(a.einde) : new Date(moment(a.start).getTime() + 3600_000)])
    .sort((a, b) => a[0].getTime() - b[0].getTime());
  for (const [s, e] of bezet) {
    if (s.getTime() - van.getTime() >= minuten * 60_000) break;
    if (e > van) van = e;
  }
  const tot = new Date(van.getTime() + minuten * 60_000);
  return tot <= grens ? { van, tot } : null;
}

export function voorstel(data: Gegevens, nu = new Date()): Voorstel | null {
  const gezien = new Set(((data.instellingen as { voorstellen_gezien?: string[] } | undefined)?.voorstellen_gezien) ?? []);
  const vandaag = datumTekst(nu);
  const morgen = datumTekst(plusDagen(nu, 1));
  const open = data.taken.filter((t) => !t.klaar);

  // 1. Een taak die over tijd is.
  for (const t of open) {
    const sleutel = `laat:${t.id}:${vandaag}`;
    if (!t.deadline || t.deadline.slice(0, 10) >= vandaag || gezien.has(sleutel)) continue;
    const zet = (g: Gegevens, deadline: string | null, klaar = false) =>
      g.taken.forEach((x) => { if (x.id === t.id) { x.deadline = deadline; x.klaar = klaar; } });
    return { sleutel, vraag: `"${t.titel}" is over tijd. Wat doe je ermee?`, aanbevolen: 0, opties: [
      { label: "Vandaag", gevolg: "De deadline wordt vandaag.", doe: (g) => zet(g, vandaag) },
      { label: "Morgen", gevolg: "Schuift een dag op.", doe: (g) => zet(g, morgen) },
      { label: "Is al klaar", gevolg: "Vinkt de taak af.", doe: (g) => zet(g, t.deadline ?? null, true) },
    ] };
  }

  // 2. Een taak voor vandaag of morgen waar nog geen tijd voor is ingepland.
  const nuT = nuTekst(nu);
  for (const t of open) {
    const sleutel = `plan:${t.id}:${vandaag}`;
    if (!t.deadline || t.deadline.slice(0, 10) > morgen || gezien.has(sleutel)) continue;
    if (data.afspraken.some((a) => (a as { taak_id?: number }).taak_id === t.id && (a.einde ?? a.start) >= nuT)) continue;
    const minuten = Math.min(Math.max((t as { minuten?: number }).minuten || 60, 15), 180);
    const blok = vrijBlok(data.afspraken, nu, minuten);
    if (!blok) continue;
    const om = `${twee(blok.van.getHours())}:${twee(blok.van.getMinutes())}`;
    return { sleutel, vraag: `Vandaag tijd maken voor "${t.titel}"?`, aanbevolen: 0, opties: [
      { label: `Om ${om}`, gevolg: `Zet ${minuten} minuten in je agenda om eraan te werken.`, doe: (g) => {
        g.afspraken.push({ id: g.volgend_id, titel: t.titel, start: tijdTekst(blok.van), einde: tijdTekst(blok.tot),
          soort: "focus", locatie: "", notitie: "", taak_id: t.id } as Afspraak);
        g.volgend_id += 1;
      } },
      { label: "Niet nodig", gevolg: "Je krijgt deze vraag vandaag niet meer." },
    ] };
  }
  return null;
}

/** Voert de gekozen optie uit en onthoudt dat dit voorstel klaar is. */
export function afhandelen(g: Gegevens, v: Voorstel, optie: number) {
  v.opties[optie]?.doe?.(g);
  g.instellingen ??= {};
  const lijst = ((g.instellingen.voorstellen_gezien as string[] | undefined) ?? []).filter((s) => s !== v.sleutel);
  g.instellingen.voorstellen_gezien = [...lijst, v.sleutel].slice(-60);
}

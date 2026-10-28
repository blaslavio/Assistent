// Afspraken met gasten zonder account. De gast plant in via jouw boekingspagina (?boek=linknaam) en laat eventueel een
// bericht achter; dat komt bij jou in de chat onder Gasten. Jouw antwoord gaat per mail naar de gast, met een link
// (?boeking=code) waarmee de gast zonder account zijn afspraak en het gesprek ziet en terugschrijft.
import { adresWaarde, alsIk, bijwerken, rpc } from "../api";

export type Soort = { naam: string; minuten: number; prijs?: number };
export type Uren = Record<string, [string, string][]>;
export type Boekpagina = { adres: string; aan: boolean; titel: string; intro: string; soorten: Soort[]; uren: Uren;
  buffer: number; min_vooraf: number; vooruit: number; max_per_dag: number; bevestigen: boolean; locatie: string;
  betalen?: Record<string, string> };
export type Boeking = { id: number; soort: string; start: string; minuten: number; naam: string; email: string;
  telefoon: string; notitie: string; status: "aangevraagd" | "bevestigd" | "afgewezen" | "geannuleerd";
  afspraak_id: string | null; verwerkt: boolean; via_chat?: boolean };
export type GastGesprek = { boeking: number; naam: string; soort: string; start: string; status: string; laatst: string;
  tekst: string; van: "gast" | "eigenaar"; ongelezen: number };
export type GastBericht = { id: number; van: "gast" | "eigenaar"; tekst: string; aangemaakt: string; gemaild?: boolean };

async function ik<T>(functie: string, parameters: Record<string, unknown> = {}) {
  const a = await alsIk<T & { fout?: string }>(functie, parameters);
  if (a && typeof a === "object" && "fout" in a && a.fout) throw new Error(a.fout);
  return a as T;
}
async function open<T>(functie: string, parameters: Record<string, unknown>) {
  const a = await rpc<T & { fout?: string }>(functie, parameters);
  if (a && typeof a === "object" && "fout" in a && a.fout) throw new Error(a.fout);
  return a as T;
}

// --- Voor de gast, zonder account --------------------------------------------------------------------------------

const code = (naam: string, patroon: RegExp) => {
  const v = adresWaarde(naam);
  return v && patroon.test(v) ? v : null;
};
export const boekAdres = () => code("boek", /^[a-z0-9-]{3,40}$/);
export const boekingCode = () => code("boeking", /^[a-f0-9]{24,64}$/);

export type PaginaVoorGast = { naam: string; titel: string; intro: string; soorten: Soort[]; locatie: string;
  bevestigen: boolean; dagen: string[] };
export const paginaBekijken = (adres: string, soort: number) => open<PaginaVoorGast>("boekpagina_bekijken", { p_adres: adres, p_soort: soort });
export const tijden = async (adres: string, soort: number, datum: string) =>
  (await open<{ tijden: string[] }>("boekpagina_tijden", { p_adres: adres, p_soort: soort, p_datum: datum })).tijden;
export const boeken = (adres: string, soort: number, start: string, naam: string, email: string, telefoon: string, bericht: string) =>
  open<{ code: string; status: string }>("boeken", { p_adres: adres, p_soort: soort, p_start: start, p_kiezer: naam,
    p_email: email, p_telefoon: telefoon, p_notitie: bericht });

export type AfspraakVoorGast = { soort: string; start: string; minuten: number; status: Boeking["status"]; gast: string;
  naam: string; locatie: string; mag_annuleren: boolean; berichten: GastBericht[] };
export const gastBekijken = (c: string) => open<AfspraakVoorGast>("gast_bekijken", { p_code: c });
export const gastSturen = (c: string, tekst: string) => open("gast_bericht_sturen", { p_code: c, p_tekst: tekst });
export const gastAnnuleren = (c: string) => open("boeking_annuleren", { p_code: c });

/** Zet de code in het adres, zodat herladen of een bladwijzer je afspraak terugbrengt. */
export function naarBoeking(c: string) {
  for (const w of [window.parent, window]) {
    try {
      const u = new URL(w.location.href);
      u.searchParams.delete("boek");
      u.searchParams.set("boeking", c);
      w.history.replaceState(null, "", u.toString());
      return;
    } catch {
      /* ander adres */
    }
  }
}

// --- Voor jou ----------------------------------------------------------------------------------------------------

export const gesprekken = () => ik<{ mail: boolean; gesprekken: GastGesprek[] }>("gast_gesprekken");
export const gesprek = (boeking: number) =>
  ik<{ boeking: Boeking; mail: boolean; berichten: GastBericht[] }>("gast_gesprek", { p_boeking: boeking });
export const antwoorden = (boeking: number, tekst: string) =>
  ik<{ gemaild: boolean }>("gast_antwoorden", { p_boeking: boeking, p_tekst: tekst });

export const mijnPagina = () => ik<{ pagina: Boekpagina | null; boekingen: Boeking[] }>("mijn_boekpagina");
export async function paginaBewaren(p: Boekpagina) {
  const a = await ik<{ pagina: Boekpagina }>("boekpagina_instellen", { p_instellingen: p });
  await bijwerken((g) => { g.instellingen = { ...(g.instellingen ?? {}), boekpagina: p.aan }; }).catch(() => {});
  return a.pagina;
}
export const afhandelen = (id: number, actie: "bevestigen" | "afwijzen" | "annuleren") =>
  ik("boeking_afhandelen", { p_id: id, p_actie: actie });

export const STANDAARD: Boekpagina = { adres: "", aan: true, titel: "", intro: "", soorten: [{ naam: "Afspraak", minuten: 30 }],
  uren: Object.fromEntries(["1", "2", "3", "4", "5"].map((d) => [d, [["09:00", "17:00"]]])) as Uren, buffer: 15,
  min_vooraf: 12, vooruit: 30, max_per_dag: 4, bevestigen: true, locatie: "" };

export const linkNaam = (tekst: string) =>
  tekst.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

/** Het adres om te delen. Op Streamlit is dat het adres van het venster eromheen. */
export function boekLink(adres: string) {
  let basis = location.origin + location.pathname;
  try {
    basis = window.top!.location.origin + "/";
  } catch {
    /* ander adres */
  }
  return `${basis}?boek=${adres}`;
}

const pad = (n: number) => String(n).padStart(2, "0");
const lokaal = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** Bevestigde boekingen in je agenda zetten en afgezegde eruit halen, zoals de oude app deed. */
export async function verwerken() {
  const { pagina, boekingen } = await mijnPagina();
  const open = boekingen.filter((b) => !b.verwerkt);
  if (!open.length) return 0;
  const klaar: [number, string | null][] = [];
  await bijwerken((g) => {
    for (const b of open) {
      let id = b.afspraak_id;
      if (b.status === "bevestigd" && !id) {
        const start = new Date(b.start);
        id = String(g.volgend_id);
        g.volgend_id += 1;
        g.afspraken.push({ id: Number(id), titel: `${b.soort} met ${b.naam}`, start: lokaal(start),
          einde: lokaal(new Date(start.getTime() + b.minuten * 60000)), locatie: pagina?.locatie ?? "", soort: "afspraak",
          notitie: [b.email, b.telefoon, b.notitie, "Geboekt via je boekingspagina."].filter(Boolean).join("\n") });
      } else if ((b.status === "afgewezen" || b.status === "geannuleerd") && id) {
        const weg = id;
        g.afspraken = g.afspraken.filter((a) => String(a.id) !== weg);
        id = null;
      }
      klaar.push([b.id, id]);
    }
  });
  for (const [id, afspraak] of klaar) await alsIk("boeking_verwerkt", { p_id: id, p_afspraak: afspraak });
  return klaar.length;
}

// Alleen de eigenaar van de app: mail versturen via Brevo.
export const mailIngesteld = () => rpc<boolean>("mail_ingesteld", {});
export const mailInstellen = (sleutel: string, afzender: string) =>
  ik("mail_instellen", { p_sleutel: sleutel.trim(), p_afzender: afzender.trim() });

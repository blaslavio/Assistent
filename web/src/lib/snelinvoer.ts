// De vraagbalk op Vandaag: begrijpt een korte zin zonder Claude. "morgen 9u tandarts in Ede" wordt een afspraak,
// "vrijdag boodschappen" een taak met datum, en een vraag gaat naar de assistent. Je ziet altijd eerst wat hij ervan maakt.
import { DAGEN, datumTekst, plusDagen, twee } from "./tijd";

export type Begrip =
  | { soort: "vraag"; tekst: string }
  | { soort: "taak"; titel: string; deadline: string | null }
  | { soort: "afspraak"; titel: string; datum: string; tijd: string; locatie: string };

const VRAAGWOORD = /^(wat|wie|waar|wanneer|hoe|hoeveel|hoelang|waarom|welke|welk|kun|kan|kunt|zou|zal|mag|moet ik|heb ik|ben ik|is er|zijn er|vertel|zoek|help|plan mijn|schrijf|leg uit|vat)\b/i;
const MAAND: Record<string, number> = { jan: 0, feb: 1, mrt: 2, maa: 2, apr: 3, mei: 4, jun: 5, jul: 6, aug: 7, sep: 8, okt: 9, nov: 10, dec: 11 };

/** Wat de zin betekent. `nu` staat vast in tests. */
export function begrijp(invoer: string, nu = new Date()): Begrip {
  const tekst = invoer.trim().replace(/\s+/g, " ");
  if (tekst.endsWith("?") || VRAAGWOORD.test(tekst)) return { soort: "vraag", tekst };
  let rest = ` ${tekst} `;
  const weg = (m: RegExpMatchArray) => { rest = rest.replace(m[0], " "); };

  // De dag.
  let datum: string | null = null;
  const vandaag = new Date(nu.getFullYear(), nu.getMonth(), nu.getDate());
  let m = rest.match(/\s(vandaag|vanavond|vanmiddag|overmorgen|morgen)\s/i);
  if (m) {
    const w = m[1].toLowerCase();
    datum = datumTekst(plusDagen(vandaag, w === "morgen" ? 1 : w === "overmorgen" ? 2 : 0));
    if (w === "vanavond" || w === "vanmiddag") rest = rest.replace(m[0], ` ${w === "vanavond" ? "@19" : "@14"} `);
    else weg(m);
  }
  if (!datum && (m = rest.match(/\s(?:volgende\s+)?(zondag|maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zo|ma|di|wo|do|vr|za)\s/i))) {
    const naam = m[1].toLowerCase();
    const dag = DAGEN.findIndex((d) => d === naam || d.slice(0, 2) === naam);
    let over = (dag - vandaag.getDay() + 7) % 7 || 7;
    if (/volgende/i.test(m[0]) && over < 7) over += 7;
    datum = datumTekst(plusDagen(vandaag, over));
    weg(m);
  }
  if (!datum && (m = rest.match(/\s(\d{1,2})\s(jan|feb|mrt|maa|apr|mei|jun|jul|aug|sep|okt|nov|dec)[a-z]*\.?\s/i))) {
    datum = volgende(vandaag, Number(m[1]), MAAND[m[2].toLowerCase()]);
    weg(m);
  }
  if (!datum && (m = rest.match(/\s(\d{1,2})[-/](\d{1,2})\s/))) {
    datum = volgende(vandaag, Number(m[1]), Number(m[2]) - 1);
    weg(m);
  }

  // Het tijdstip: 9u, 9u30, 9:30, 14.00, 9 uur, om 9.
  let tijd: string | null = null;
  m = rest.match(/\s(?:om\s+)?@?(\d{1,2})(?:[:.](\d{2})|u(\d{2})?|\s?uur)(?=\s)/i) ?? rest.match(/\s(?:om\s+|@)(\d{1,2})(?=\s)/i);
  if (m && Number(m[1]) < 24 && Number(m[2] ?? m[3] ?? 0) < 60) {
    tijd = `${twee(Number(m[1]))}:${twee(Number(m[2] ?? m[3] ?? 0))}`;
    weg(m);
  }

  // De plek: "in Ede", "bij De Smidse" aan het eind.
  let locatie = "";
  if (tijd && (m = rest.match(/\s(?:in|bij|op)\s+([A-ZÀ-Ý][^\s]*(?:\s[A-ZÀ-Ý0-9][^\s]*)*)\s*$/))) {
    locatie = m[1].trim();
    weg(m);
  }

  const titel = netjes(rest) || (tijd ? "Afspraak" : tekst);
  if (tijd) {
    // Alleen een tijd die vandaag al voorbij is, bedoelt morgen.
    if (!datum) datum = `${datumTekst(vandaag)}T${tijd}` < `${datumTekst(nu)}T${twee(nu.getHours())}:${twee(nu.getMinutes())}`
      ? datumTekst(plusDagen(vandaag, 1)) : datumTekst(vandaag);
    return { soort: "afspraak", titel, datum, tijd, locatie };
  }
  return { soort: "taak", titel, deadline: datum };
}

function volgende(vandaag: Date, dag: number, maand: number): string | null {
  if (!(maand >= 0 && maand < 12 && dag >= 1 && dag <= 31)) return null;
  let d = new Date(vandaag.getFullYear(), maand, dag);
  if (d.getMonth() !== maand) return null;
  if (d < vandaag) d = new Date(vandaag.getFullYear() + 1, maand, dag);
  return datumTekst(d);
}

function netjes(s: string) {
  const t = s.replace(/\s+/g, " ").replace(/^[\s,.:;-]+|[\s,.:;-]+$/g, "").replace(/^(om|op|aan)\s/i, "");
  return t ? t[0].toUpperCase() + t.slice(1) : "";
}

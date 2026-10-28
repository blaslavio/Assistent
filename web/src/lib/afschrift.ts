// Bankafschriften inlezen (CSV van ING, Rabobank, bunq, SNS/ASN/RegioBank, Knab, Triodos en de TXT van ABN AMRO),
// net als in de vorige app. Alles gebeurt op je eigen toestel; alleen de gelezen regels gaan naar je account.
// De sleutel per regel is dezelfde als in de vorige app, zodat een afschrift twee keer inlezen niets dubbel zet.

export type AfschriftRegel = { datum: string; bedrag: number; tegenpartij: string; omschrijving: string; rekening: string };

// Bekende namen per categorie, gelijk aan budget.py.
const WOORDEN: Record<string, string[]> = {
  "Boodschappen": ["albert heijn", "ah to go", "jumbo", "lidl", "aldi", "plus ", "dirk", "coop", "spar", "dekamarkt", "vomar", "hoogvliet", "picnic", "ekoplaza", "crisp", "flink", "poiesz", "boni", "nettorama", "jan linders", "deen"],
  "Wonen": ["huur", "hypotheek", "woningcorporatie", "woonstichting", "vve", "gemeentelijke belastingen", "waterschap", "belastingsamenwerking", "ozb"],
  "Energie en water": ["vattenfall", "eneco", "essent", "greenchoice", "budget energie", "energiedirect", "vandebron", "pure energie", "engie", "vitens", "evides", "brabant water", "oasen", "pwn", "dunea", "waternet", "wml", "wmd"],
  "Verzekeringen": ["zilveren kruis", "cz groep", " cz ", "vgz", "menzis", "dsw", "ohra", "centraal beheer", "interpolis", "nationale-nederlanden", "achmea", "unive", "univé", "fbto", "ditzo", "anwb verzeker", "allianz", "asr ", "a.s.r", "inshared", "verzekering", "zorgverzeker"],
  "Abonnementen": ["netflix", "spotify", "disney", "videoland", "apple.com", "itunes", "icloud", "google", "youtube", "kpn", "ziggo", "odido", "t-mobile", "vodafone", "tele2", "simyo", "lebara", "ben ", "youfone", "amazon prime", "hbo", "max.com", "nlziet", "viaplay", "dazn", "abonnement", "chatgpt", "openai", "anthropic", "claude.ai", "microsoft", "adobe", "dropbox", "storytel", "audible"],
  "Vervoer": ["ns groep", "ns reizigers", "ov-chipkaart", "translink", "shell", "bp ", "esso", "tinq", "tango", "totalenergies", "gulf", "q8", "texaco", "argos", "parkeren", "yellowbrick", "parkmobile", "easypark", "anwb", "swapfiets", "greenwheels", "uber ", "bolt", "arriva", "connexxion", "ret ", "gvb", "htm", "qbuzz", "keolis", "ebs", "fastned", "allego", "vattenfall incharge", "wegenbelasting", "apk"],
  "Eten en drinken": ["thuisbezorgd", "uber eats", "deliveroo", "mcdonald", "burger king", "kfc", "starbucks", "restaurant", "cafe", "café", "domino", "new york pizza", "febo", "subway", "lunch", "koffie", "broodje", "diner", "borrel", "eetcafe", "bakkerij", "brasserie"],
  "Winkelen": ["bol.com", "amazon", "zalando", "coolblue", "hema", "action", "ikea", "kruidvat", "etos", "primark", "h&m", "mediamarkt", "blokker", "gamma", "praxis", "karwei", "hornbach", "wehkamp", "temu", "shein", "aliexpress", "decathlon", "intertoys", "bijenkorf", "c&a", "zeeman", "xenos", "flying tiger", "vinted", "marktplaats"],
  "Gezondheid": ["apotheek", "tandarts", "fysio", "huisarts", "ziekenhuis", "opticien", "specsavers", "pearle", "eigen risico"],
  "Vrije tijd": ["basic-fit", "basic fit", "sportschool", "fitness", "pathe", "pathé", "vue ", "kinepolis", "ticketmaster", "efteling", "museum", "bioscoop", "concert", "steam", "playstation", "nintendo", "xbox", "booking.com", "airbnb", "transavia", "klm", "ryanair", "easyjet", "tui", "sunweb", "corendon"],
  "Kinderen": ["kinderopvang", "kdv", "bso", "school", "ouderbijdrage"],
  "Sparen en beleggen": ["spaarrekening", "spaardeposito", "degiro", "meesman", "brand new day", "bux", "trading 212", "saxo", "peaks", "lynx", "bitvavo", "eigen rekening"],
  "Inkomen": ["salaris", "loon", "uwv", "svb", "toeslag", "duo", "studiefinanciering", "kinderbijslag", "pensioen", "teruggave", "vakantiegeld"],
  "Overig": [],
};

export class AfschriftFout extends Error {}

/** Raadt de categorie: eerst je eigen regels, dan bekende namen, anders Inkomen (bij plus) of Overig. */
export function categorieRaden(tegenpartij: string, omschrijving: string, bedrag: number, regels: Record<string, string> = {}) {
  const eigen = regels[tegenpartij.trim().toLowerCase()];
  if (eigen && eigen in WOORDEN) return eigen;
  const tekst = ` ${tegenpartij} ${omschrijving} `.toLowerCase();
  for (const [naam, woorden] of Object.entries(WOORDEN)) {
    if (naam === "Inkomen" && bedrag < 0) continue;
    if (woorden.some((w) => tekst.includes(w))) return naam;
  }
  return bedrag > 0 ? "Inkomen" : "Overig";
}

export function bedragLezen(tekst: string): number | null {
  let t = (tekst ?? "").trim().replace(/€|EUR|\s| /g, "");
  if (!t || !/\d/.test(t)) return null;
  t = /,\d{1,2}$/.test(t) ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function datumLezen(tekst: string): string | null {
  const t = (tekst ?? "").trim();
  const iso = (j: string, m: string, d: string) => {
    const datum = new Date(Date.UTC(+j, +m - 1, +d));
    return datum.getUTCMonth() === +m - 1 && datum.getUTCDate() === +d ? datum.toISOString().slice(0, 10) : null;
  };
  let m = /^(\d{4})[-/](\d{2})[-/](\d{2})/.exec(t);
  if (m) return iso(m[1], m[2], m[3]);
  m = /^(\d{4})(\d{2})(\d{2})$/.exec(t.slice(0, 8));
  if (m && !/^\d{2}[-/.]/.test(t)) return iso(m[1], m[2], m[3]);
  m = /^(\d{2})[-/.](\d{2})[-/.](\d{4})/.exec(t);
  if (m) return iso(m[3], m[2], m[1]);
  return null;
}

export function decoderen(inhoud: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(inhoud).replace(/^﻿/, "");
  } catch {
    return new TextDecoder("windows-1252").decode(inhoud);
  }
}

// Eenvoudige CSV-lezer met aanhalingstekens (zoals Python's csv-module).
function csvRijen(tekst: string, scheiding: string): string[][] {
  const rijen: string[][] = [];
  let rij: string[] = [], veld = "", tussen = false;
  for (let i = 0; i < tekst.length; i++) {
    const c = tekst[i];
    if (tussen) {
      if (c === '"' && tekst[i + 1] === '"') { veld += '"'; i++; }
      else if (c === '"') tussen = false;
      else veld += c;
    } else if (c === '"' && veld === "") tussen = true;
    else if (c === scheiding) { rij.push(veld); veld = ""; }
    else if (c === "\n") { rij.push(veld); rijen.push(rij); rij = []; veld = ""; }
    else if (c !== "\r") veld += c;
  }
  if (veld || rij.length) { rij.push(veld); rijen.push(rij); }
  return rijen;
}

const schoon = (t: string) => (t ?? "").replace(/\s+/g, " ").trim();

function kolom(kop: string[], namen: string[], behalve: string[] = []) {
  for (const naam of namen) {
    const i = kop.findIndex((k) => (k === naam || k.startsWith(naam)) && !behalve.some((b) => k.includes(b)));
    if (i >= 0) return i;
  }
  return null;
}

function abnOmschrijving(ruw: string): [string, string] {
  const tekst = schoon(ruw);
  if (tekst.includes("/NAME/")) {
    return [(/\/NAME\/([^/]*)/.exec(tekst)?.[1] ?? "").trim(), (/\/REMI\/([^/]*)/.exec(tekst)?.[1] ?? "").trim()];
  }
  const naam = /Naam:\s*(.+?)(?:\s{2,}|Omschrijving:|IBAN:|Kenmerk:|$)/.exec(tekst);
  if (naam) {
    const oms = /Omschrijving:\s*(.+?)(?:\s{2,}|IBAN:|Kenmerk:|$)/.exec(tekst);
    return [naam[1].trim(), oms ? oms[1].trim() : ""];
  }
  const pas = /^(?:BEA, Betaalpas|GEA, Betaalpas|eCom, Betaalpas|BEA|GEA)[,\s]+(.+?),PAS\d+/.exec(tekst);
  if (pas) return [pas[1].trim(), tekst];
  return [tekst.slice(0, 60), tekst];
}

/** Leest een afschrift en geeft de regels; gooit AfschriftFout met een uitleg als het niet lukt. */
export function afschriftLezen(tekst: string): AfschriftRegel[] {
  const regels = tekst.split(/\r?\n/).filter((r) => r.trim());
  if (!regels.length) throw new AfschriftFout("Het bestand is leeg.");
  const eerste = regels[0];
  const tel = (c: string) => eerste.split(c).length - 1;
  const scheiding = tel("\t") >= 3 ? "\t" : tel(";") > tel(",") ? ";" : ",";
  const rijen = csvRijen(regels.join("\n"), scheiding);
  const kop = rijen[0].map((k) => k.trim().replace(/^"|"$/g, "").toLowerCase());
  const heeftKop = kop.some((k) => /datum|date|bedrag|amount|omschrijving|description/.test(k));
  const uit: AfschriftRegel[] = [];
  const voeg = (datum: string | null, bedrag: number | null, tegenpartij: string, omschrijving: string, rekening: string) => {
    if (datum && bedrag !== null) uit.push({ datum, bedrag: Math.round(bedrag * 100) / 100, tegenpartij, omschrijving, rekening });
  };

  if (heeftKop) {
    const iDatum = kolom(kop, ["datum", "date", "transactiedatum", "boekingsdatum"], ["rente", "interest", "valuta"]);
    const iBedrag = kolom(kop, ["bedrag (eur)", "bedrag", "amount", "transactiebedrag"]);
    const iAfbij = kolom(kop, ["af bij", "af/bij", "credit/debit", "debet/credit"]);
    const iNaam = kolom(kop, ["naam tegenpartij", "naam / omschrijving", "counterparty name", "name", "naam", "tegenpartij", "counterparty"],
      ["iban", "rekening"]);
    const iOms = kop.flatMap((k, i) => (/^(omschrijving|mededelingen|description|beschrijving)/.test(k) && i !== iNaam ? [i] : []));
    const iRek = kolom(kop, ["iban/bban", "rekening", "account"], ["tegen"]);
    if (iDatum === null || iBedrag === null)
      throw new AfschriftFout("In dit bestand staan geen kolommen voor datum en bedrag. Download het afschrift als CSV.");
    for (const rij of rijen.slice(1)) {
      if (rij.length <= Math.max(iDatum, iBedrag)) continue;
      let b = bedragLezen(rij[iBedrag]);
      if (b !== null && iAfbij !== null) {
        const ab = (rij[iAfbij] ?? "").trim().toLowerCase();
        if (["af", "debit", "d", "debet"].includes(ab)) b = -Math.abs(b);
        else if (["bij", "credit", "c"].includes(ab)) b = Math.abs(b);
      }
      voeg(datumLezen(rij[iDatum]), b, iNaam !== null && iNaam < rij.length ? schoon(rij[iNaam]) : "",
        schoon(iOms.filter((i) => i < rij.length).map((i) => rij[i]).join(" ")),
        iRek !== null && iRek < rij.length ? rij[iRek].trim() : "");
    }
  } else if (scheiding === "\t" && rijen[0].length >= 8) {
    for (const rij of rijen) {
      const [tegenpartij, oms] = abnOmschrijving(rij[7] ?? "");
      voeg(datumLezen(rij[2]), bedragLezen(rij[6]), tegenpartij, oms, (rij[0] ?? "").trim());
    }
  } else if (rijen[0].length >= 18 && datumLezen(rijen[0][0])) {
    for (const rij of rijen) voeg(datumLezen(rij[0]), bedragLezen(rij[10]), schoon(rij[3]), schoon(rij[17] ?? ""), (rij[1] ?? "").trim());
  } else {
    throw new AfschriftFout("Dit afschrift herken ik niet. Download het bij je bank als CSV (of bij ABN AMRO als TXT).");
  }
  if (!uit.length) throw new AfschriftFout("Er staan geen betalingen in dit bestand.");
  return uit;
}

// Python's f"{x:.2f}" en hashlib.sha1, zodat de sleutels gelijk zijn aan die van de vorige app.
async function sha1(tekst: string) {
  const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(tekst));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function metSleutels(regels: AfschriftRegel[]) {
  const gezien = new Map<string, number>();
  const uit = [];
  for (const r of regels) {
    const basis = `${r.datum}|${r.bedrag.toFixed(2)}|${r.tegenpartij.toLowerCase()}|${r.omschrijving.toLowerCase()}|${r.rekening}`;
    const n = (gezien.get(basis) ?? 0) + 1;
    gezien.set(basis, n);
    uit.push({ ...r, sleutel: "imp:" + (await sha1(`${basis}|${n}`)).slice(0, 32) });
  }
  return uit;
}

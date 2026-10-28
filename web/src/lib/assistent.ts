// De assistent in de nieuwe app: Claude met hulpmiddelen voor je agenda, taken en geheugen, en zoeken op internet.
// Met je eigen Anthropic-sleutel praat de app rechtstreeks met Claude; anders via de functie `ai` van het platform,
// die controleert wie je bent en je maandgrens bijhoudt.
import Anthropic from "@anthropic-ai/sdk";
import { SUPABASE, SLEUTEL, alsIk, bijwerken, gegevensLaden, huidigeSessie, type Gegevens } from "../api";
import { DAGEN, datumTekst, nuTekst, plusDagen } from "./tijd";

const MODEL = "claude-opus-5-5";
const MAX_RONDES = 12;

export const SOORTEN = ["afspraak", "sport", "uitgaan", "etentje", "werk", "familie en vrienden", "gezondheid",
  "reizen", "verjaardag", "herinnering", "overig"];

const SYSTEEM = `Je bent een persoonlijke assistent die in het Nederlands antwoordt.
Je helpt met dagelijkse taken, de agenda, plannen en uitzoeken. Je antwoorden zijn feitelijk.

Werkwijze:
- Wees slim en nuchter. Is een plan onrealistisch of niet haalbaar, zeg dat vriendelijk en geef een haalbaar
  alternatief. Geen vleierij. Zeg het gewoon als je iets niet weet.
- Houd antwoorden kort en praktisch. Begin met het antwoord, geen inleiding, en vraag hooguit één ding tegelijk.
- Eén bericht kan meerdere dingen vragen ("plan morgen om 14:00 overleg en zet koffie op mijn takenlijst"):
  doe ze allemaal en meld per ding in een paar woorden wat je deed.
- Neem zorgen uit handen: noemt de gebruiker een deadline, afspraak of iets dat geregeld moet worden, zet het meteen
  als taak of in de agenda. Doe het direct als het duidelijk genoeg is; vul redelijke aannames zelf in en noem ze kort.
- Kijk eerst in de agenda voordat je iets inplant en voorkom overlap.
- Wat je doet met een hulpmiddel ziet de gebruiker als een kaartje onder je antwoord, met een knop om het ongedaan
  te maken. Herhaal dus niet alle details; een korte bevestiging is genoeg.
- Verwijderen doe je alleen nadat de gebruiker het bevestigd heeft.
- Actuele informatie (openingstijden, prijzen, nieuws): zoek op internet en noem je bron kort.
- Geheugen: je krijgt hieronder wat je al over de gebruiker weet; gebruik het zonder ernaar te vragen. Hoor je iets
  dat later nuttig is (voorkeuren, gewoontes, namen), bewaar het met onthouden, kort en als één feit.
- Geld, contracten en codes: nooit zelf iets betalen, ondertekenen of doorgeven.
- Herken nooit wie iemand is aan zijn gezicht.
- Begin elk antwoord met een gevoelslabel, precies zo: [gevoel: blij]. Kies uit neutraal, blij, enthousiast, rustig,
  meelevend, bemoedigend, serieus, grappig, verrast of trots. Het label wordt niet getoond.`;

// --- Hulpmiddelen --------------------------------------------------------------------------------------------------

type Schema = { type: "object"; properties: Record<string, unknown>; required?: string[] };
const tekst = (beschrijving: string) => ({ type: "string", description: beschrijving });

type Hulpmiddel = { name: string; description: string; input_schema: Schema };
const LIJST: Hulpmiddel[] = [
  {
    name: "agenda_bekijken", description: "Toon afspraken in een periode.",
    input_schema: { type: "object", properties: { van: tekst("Begindatum JJJJ-MM-DD."),
      tot: tekst("Einddatum JJJJ-MM-DD (inclusief).") }, required: ["van", "tot"] },
  },
  {
    name: "afspraak_toevoegen",
    description: "Zet een afspraak in de agenda. Sport, uitjes, etentjes en herinneringen gaan ook in de agenda.",
    input_schema: { type: "object", properties: {
      titel: tekst("Naam van de afspraak."),
      start: tekst("Begin als JJJJ-MM-DDTHH:MM, of JJJJ-MM-DD voor een hele dag."),
      einde: tekst("Optioneel einde in hetzelfde formaat."),
      locatie: tekst("Optioneel adres of plaats."),
      soort: { type: "string", enum: SOORTEN, description: "Soort afspraak." },
    }, required: ["titel", "start"] },
  },
  {
    name: "afspraak_verwijderen", description: "Verwijder een afspraak. Alleen nadat de gebruiker dit bevestigd heeft.",
    input_schema: { type: "object", properties: { afspraak_id: { type: "integer" } }, required: ["afspraak_id"] },
  },
  {
    name: "taken_bekijken", description: "Toon alle open taken, gesorteerd op deadline.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "taak_toevoegen", description: "Voeg een taak toe aan de takenlijst.",
    input_schema: { type: "object", properties: {
      titel: tekst("Korte omschrijving, beginnend met een werkwoord."),
      deadline: tekst("Optionele datum JJJJ-MM-DD."),
      minuten: { type: "integer", description: "Hoe lang de taak ongeveer duurt, 0 als onbekend." },
      belangrijk: { type: "boolean", description: "true bij geld, boetes, werk of school, of een deadline binnen 3 dagen." },
    }, required: ["titel"] },
  },
  {
    name: "taak_afronden", description: "Markeer een taak als klaar.",
    input_schema: { type: "object", properties: { taak_id: { type: "integer" } }, required: ["taak_id"] },
  },
  {
    name: "onthouden", description: "Bewaar iets over de gebruiker voor alle volgende gesprekken.",
    input_schema: { type: "object", properties: { feit: tekst("Eén kort feit."),
      onderwerp: tekst("Bijvoorbeeld eten, sport, werk, familie, vervoer, planning of algemeen.") }, required: ["feit"] },
  },
  {
    name: "vergeten", description: "Vergeet een bewaard feit dat niet meer klopt.",
    input_schema: { type: "object", properties: { feit_id: { type: "integer" } }, required: ["feit_id"] },
  },
];
const HULPMIDDELEN = LIJST.map((h) => ({ ...h, eager_input_streaming: true })) as (Anthropic.Tool & Hulpmiddel)[];

const SERVER_HULPMIDDELEN = [
  { type: "web_search_20260209", name: "web_search", max_uses: 5 },
  { type: "web_fetch_20260209", name: "web_fetch", max_uses: 5 },
] as unknown as Anthropic.ToolUnion[];

/** Controleert de invoer tegen het schema (verplichte velden en soorten), want die komt per stukje binnen. */
export function klopt(naam: string, invoer: unknown): invoer is Record<string, unknown> {
  const h = HULPMIDDELEN.find((x) => x.name === naam);
  if (!h || !invoer || typeof invoer !== "object" || Array.isArray(invoer)) return false;
  const v = invoer as Record<string, unknown>;
  for (const veld of h.input_schema.required ?? []) if (v[veld] === undefined || v[veld] === "") return false;
  for (const [veld, waarde] of Object.entries(v)) {
    const s = h.input_schema.properties[veld] as { type?: string; enum?: string[] } | undefined;
    if (!s) return false;
    if (s.type === "string" && typeof waarde !== "string") return false;
    if (s.type === "integer" && !Number.isInteger(waarde)) return false;
    if (s.type === "boolean" && typeof waarde !== "boolean") return false;
    if (s.enum && !s.enum.includes(waarde as string)) return false;
  }
  return true;
}

const DATUM = /^\d{4}-\d{2}-\d{2}$/;
const MOMENT = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/;

/** Wat de gebruiker onder het antwoord ziet, met wat nodig is om het ongedaan te maken. */
export type Actie = {
  soort: "afspraak" | "taak" | "klaar" | "onthouden" | "weg";
  titel: string; detail?: string; ongedaan?: Ongedaan; teruggedraaid?: boolean;
};
type Ongedaan =
  | { soort: "afspraak_weg"; id: number }
  | { soort: "taak_weg"; id: number }
  | { soort: "taak_open"; id: number }
  | { soort: "feit_weg"; id: number }
  | { soort: "afspraak_terug"; afspraak: Gegevens["afspraken"][number] };

function nieuwId(g: Gegevens) {
  const id = g.volgend_id;
  g.volgend_id += 1;
  return id;
}

type Feit = { id: number; feit: string; onderwerp: string; datum: string };
function feiten(g: Gegevens): Feit[] {
  if (!Array.isArray(g.geheugen)) g.geheugen = [];
  return g.geheugen as Feit[];
}

/** Voert één hulpmiddel uit. Geeft de tekst voor Claude en eventueel een kaartje voor de gebruiker. */
export async function uitvoeren(naam: string, v: Record<string, unknown>): Promise<{ resultaat: string; actie?: Actie }> {
  const s = (k: string) => (typeof v[k] === "string" ? (v[k] as string).trim() : "");
  switch (naam) {
    case "agenda_bekijken": {
      const { data } = await gegevensLaden();
      const lijst = data.afspraken.filter((a) => s("van") <= a.start.slice(0, 10) && a.start.slice(0, 10) <= s("tot"));
      return { resultaat: JSON.stringify(lijst.map(({ id, titel, start, einde, locatie, soort }) =>
        ({ id, titel, start, einde, locatie, soort }))) };
    }
    case "taken_bekijken": {
      const { data } = await gegevensLaden();
      const open = data.taken.filter((t) => !t.klaar)
        .sort((a, b) => (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999"));
      return { resultaat: JSON.stringify(open) };
    }
    case "afspraak_toevoegen": {
      if (!MOMENT.test(s("start")) || (s("einde") && !MOMENT.test(s("einde"))))
        return { resultaat: "Fout: gebruik JJJJ-MM-DDTHH:MM of JJJJ-MM-DD." };
      let id = 0;
      await bijwerken((g) => {
        id = nieuwId(g);
        g.afspraken.push({ id, titel: s("titel"), start: s("start"), einde: s("einde") || null, locatie: s("locatie"),
          soort: s("soort") || "afspraak", notitie: "" });
      });
      const wanneer = new Date(s("start").length > 10 ? s("start") : `${s("start")}T12:00`);
      return { resultaat: JSON.stringify({ id, opgeslagen: true }), actie: { soort: "afspraak", titel: s("titel"),
        detail: `${DAGEN[wanneer.getDay()]} ${wanneer.getDate()}/${wanneer.getMonth() + 1}`
          + (s("start").length > 10 ? ` · ${s("start").slice(11, 16)}` : " · hele dag")
          + (s("locatie") ? ` · ${s("locatie")}` : ""),
        ongedaan: { soort: "afspraak_weg", id } } };
    }
    case "afspraak_verwijderen": {
      let weg: Gegevens["afspraken"][number] | undefined;
      await bijwerken((g) => {
        weg = g.afspraken.find((a) => a.id === v.afspraak_id);
        g.afspraken = g.afspraken.filter((a) => a !== weg);
      });
      if (!weg) return { resultaat: "Afspraak niet gevonden." };
      return { resultaat: "Verwijderd.", actie: { soort: "weg", titel: weg.titel, detail: "Uit je agenda gehaald",
        ongedaan: { soort: "afspraak_terug", afspraak: weg } } };
    }
    case "taak_toevoegen": {
      if (s("deadline") && !DATUM.test(s("deadline"))) return { resultaat: "Fout: deadline als JJJJ-MM-DD." };
      let id = 0;
      await bijwerken((g) => {
        id = nieuwId(g);
        g.taken.push({ id, titel: s("titel"), deadline: s("deadline") || null, klaar: false,
          ...(v.minuten ? { minuten: v.minuten as number } : {}), ...(v.belangrijk ? { prioriteit: "hoog" } : {}) });
      });
      return { resultaat: JSON.stringify({ id, opgeslagen: true }), actie: { soort: "taak", titel: s("titel"),
        detail: s("deadline") ? `Voor ${s("deadline").slice(8, 10)}/${Number(s("deadline").slice(5, 7))}` : "Op je takenlijst",
        ongedaan: { soort: "taak_weg", id } } };
    }
    case "taak_afronden": {
      let titel = "";
      await bijwerken((g) => {
        const t = g.taken.find((x) => x.id === v.taak_id);
        if (!t) return;
        t.klaar = true;
        titel = t.titel;
        const nu = nuTekst();
        g.afspraken = g.afspraken.filter((a) => (a as { taak_id?: number }).taak_id !== t.id || a.start < nu);
      });
      if (!titel) return { resultaat: `Geen taak met id ${v.taak_id}.` };
      return { resultaat: "Afgerond.", actie: { soort: "klaar", titel, detail: "Afgevinkt",
        ongedaan: { soort: "taak_open", id: v.taak_id as number } } };
    }
    case "onthouden": {
      const { data } = await gegevensLaden();
      if ((data.instellingen as { geheugen_uit?: boolean } | undefined)?.geheugen_uit)
        return { resultaat: "Niet bewaard: onthouden staat uit bij Instellingen. Zeg dat kort." };
      let feit: Feit | undefined;
      let nieuw = false;
      await bijwerken((g) => {
        const lijst = feiten(g);
        feit = lijst.find((f) => f.feit.toLowerCase() === s("feit").toLowerCase());
        if (feit) return;
        feit = { id: nieuwId(g), feit: s("feit"), onderwerp: s("onderwerp").toLowerCase() || "algemeen",
          datum: datumTekst(new Date()) };
        lijst.push(feit);
        nieuw = true;
      });
      return { resultaat: JSON.stringify(feit), actie: nieuw ? { soort: "onthouden", titel: s("feit"),
        detail: "Onthouden", ongedaan: { soort: "feit_weg", id: feit!.id } } : undefined };
    }
    case "vergeten": {
      let gevonden = false;
      await bijwerken((g) => {
        const voor = feiten(g).length;
        g.geheugen = feiten(g).filter((f) => f.id !== v.feit_id);
        gevonden = feiten(g).length < voor;
      });
      return { resultaat: gevonden ? "Vergeten." : `Geen feit met id ${v.feit_id}.` };
    }
  }
  return { resultaat: `Onbekend hulpmiddel ${naam}.` };
}

export async function ongedaanMaken(o: Ongedaan) {
  return bijwerken((g) => {
    if (o.soort === "afspraak_weg") g.afspraken = g.afspraken.filter((a) => a.id !== o.id);
    if (o.soort === "taak_weg") g.taken = g.taken.filter((t) => t.id !== o.id);
    if (o.soort === "taak_open") g.taken.forEach((t) => { if (t.id === o.id) t.klaar = false; });
    if (o.soort === "feit_weg") g.geheugen = feiten(g).filter((f) => f.id !== o.id);
    if (o.soort === "afspraak_terug" && !g.afspraken.some((a) => a.id === o.afspraak.id)) g.afspraken.push(o.afspraak);
  });
}

// --- Context ---------------------------------------------------------------------------------------------------

type Stijl = { toon?: string; lengte?: string; aanspreken?: string; nadenken?: string };

export function context(data: Gegevens, nu = new Date()) {
  const inst = (data.instellingen ?? {}) as { stijl?: Stijl; avatar?: { naam?: string }; geheugen_uit?: boolean };
  const delen = [`Nu is het ${DAGEN[nu.getDay()]} ${nuTekst(nu).replace("T", " ")}.`];
  const naam = inst.avatar?.naam;
  delen.push(!naam || naam === "Assistent" || naam === "Sam"
    ? "Je hebt geen eigen naam: je bent gewoon de assistent. Verzin zelf geen naam." : `Je naam is ${naam}.`);
  const stijl = inst.stijl ?? {};
  const regels = [];
  if (stijl.toon === "Informeel" || stijl.toon === "Zakelijk") regels.push(`toon: ${stijl.toon.toLowerCase()}`);
  if (stijl.lengte === "Kort" || stijl.lengte === "Uitgebreid") regels.push(`antwoorden: ${stijl.lengte.toLowerCase()}`);
  if (stijl.aanspreken === "u") regels.push("spreek de gebruiker aan met u");
  if (regels.length) delen.push(`Stijlinstellingen van de gebruiker: ${regels.join("; ")}.`);
  const vandaag = datumTekst(nu);
  const over3 = datumTekst(plusDagen(nu, 3));
  const afspraken = data.afspraken.filter((a) => a.start.slice(0, 10) === vandaag).sort((a, b) => a.start.localeCompare(b.start));
  const taken = data.taken.filter((t) => !t.klaar && t.deadline && t.deadline <= over3);
  if (afspraken.length || taken.length)
    delen.push("Vandaag en de komende dagen:\n" + [
      ...afspraken.map((a) => `- afspraak ${a.start.length > 10 ? a.start.slice(11, 16) : "hele dag"} ${a.titel} (id ${a.id})`),
      ...taken.map((t) => `- taak ${t.titel} (deadline ${t.deadline}, id ${t.id})`)].join("\n"));
  const geheugen = (data.geheugen as Feit[] | undefined) ?? [];
  if (geheugen.length && !inst.geheugen_uit)
    delen.push("Wat je over de gebruiker weet (id: feit):\n" + geheugen.slice(-150).map((f) => `- ${f.id}: ${f.feit}`).join("\n"));
  return delen.join("\n\n");
}

const NADENKEN: Record<string, "low" | "medium" | "high"> = { Snel: "low", Normaal: "medium", Grondig: "high" };

// --- Verbinding --------------------------------------------------------------------------------------------------

let platform: boolean | null = null;

/** Een Claude-client, of null als de assistent nog uit staat (geen eigen sleutel en geen toegang via het platform). */
export async function verbinding(data: Gegevens): Promise<Anthropic | null> {
  const eigen = (data.instellingen as { anthropic_sleutel?: string } | undefined)?.anthropic_sleutel;
  if (eigen) return new Anthropic({ apiKey: eigen, dangerouslyAllowBrowser: true, maxRetries: 1 });
  if (platform === null) {
    try {
      platform = Boolean((await alsIk<{ ai_platform?: boolean }>("toegang_status"))?.ai_platform);
    } catch {
      platform = false;
    }
  }
  const s = huidigeSessie();
  if (!platform || !s) return null;
  const wie = btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify([s.naam, s.token]))))
    .replace(/\+/g, "-").replace(/\//g, "_");
  return new Anthropic({ apiKey: `abo.${wie}`, baseURL: `${SUPABASE}/functions/v1/ai`, dangerouslyAllowBrowser: true,
    defaultHeaders: { apikey: SLEUTEL }, maxRetries: 1 });
}

/** Het gevoelslabel en klanken weghalen; die zijn voor de stem, niet om te lezen. */
export function zonderLabels(t: string) {
  return t.replace(/\[gevoel:[^\]]*\]\s*/gi, "").replace(/\[\[[^\]]*\]\]\s*/g, "");
}

export const BEZIG: Record<string, string> = {
  agenda_bekijken: "Kijkt in je agenda", taken_bekijken: "Kijkt naar je taken", afspraak_toevoegen: "Zet het in je agenda",
  afspraak_verwijderen: "Haalt het uit je agenda", taak_toevoegen: "Zet het op je lijst", taak_afronden: "Vinkt af",
  onthouden: "Onthoudt dit", vergeten: "Vergeet dit", web_search: "Zoekt op internet", web_fetch: "Leest een pagina",
};

export type Gebeurtenissen = {
  tekst: (stukje: string) => void;
  bezig: (wat: string) => void;
  actie: (a: Actie) => void;
};

/**
 * Laat Claude reageren op het gesprek. `berichten` wordt aangevuld met de beurten en de resultaten van hulpmiddelen,
 * zodat de volgende vraag de hele geschiedenis meestuurt.
 */
export async function antwoord(client: Anthropic, berichten: Anthropic.MessageParam[], data: Gegevens,
                               op: Gebeurtenissen, signaal?: AbortSignal) {
  const systeem: Anthropic.TextBlockParam[] = [
    { type: "text", text: SYSTEEM, cache_control: { type: "ephemeral" } },
    { type: "text", text: context(data) },
  ];
  const effort = NADENKEN[((data.instellingen ?? {}) as { stijl?: Stijl }).stijl?.nadenken ?? ""] ?? "medium";
  let mislukt = 0;
  let gezegd = false;
  for (let ronde = 0; ronde < MAX_RONDES; ronde++) {
    const stroom = client.messages.stream({
      model: MODEL, max_tokens: 16000, system: systeem, messages: berichten,
      tools: [...HULPMIDDELEN, ...SERVER_HULPMIDDELEN], output_config: { effort },
    } as Anthropic.MessageStreamParams, { signal: signaal });
    let nieuweRonde = true;
    // Tekst uit een volgende ronde (na een hulpmiddel) komt als nieuwe alinea.
    stroom.on("text", (stukje) => {
      op.tekst(gezegd && nieuweRonde ? `\n\n${stukje}` : stukje);
      nieuweRonde = false;
      gezegd = true;
    });
    stroom.on("streamEvent", (e) => {
      if (e.type === "content_block_start" && (e.content_block.type === "tool_use" || e.content_block.type === "server_tool_use"))
        op.bezig(BEZIG[e.content_block.name] ?? "Even bezig");
    });
    let bericht: Anthropic.Message;
    try {
      bericht = await stroom.finalMessage();
      mislukt = 0;
    } catch (e) {
      // Alleen een half binnengekomen hulpmiddel-verzoek proberen we opnieuw; andere fouten gaan naar het scherm.
      if (e instanceof Anthropic.APIError || signaal?.aborted || mislukt++ >= 2) throw e;
      continue;
    }
    if (bericht.stop_reason === "refusal") return "Hier kan ik je helaas niet mee helpen.";
    berichten.push({ role: "assistant", content: bericht.content });
    if (bericht.stop_reason === "pause_turn") continue;
    const verzoeken = bericht.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (!verzoeken.length) return "";
    if (bericht.stop_reason === "max_tokens") {
      berichten.pop();
      return "Het antwoord werd te lang. Probeer het korter te vragen.";
    }
    const resultaten: Anthropic.ToolResultBlockParam[] = [];
    for (const v of verzoeken) {
      if (!klopt(v.name, v.input)) {
        resultaten.push({ type: "tool_result", tool_use_id: v.id, is_error: true,
          content: JSON.stringify({ INVALID_JSON: JSON.stringify(v.input) }) });
        continue;
      }
      try {
        const { resultaat, actie } = await uitvoeren(v.name, v.input);
        if (actie) op.actie(actie);
        resultaten.push({ type: "tool_result", tool_use_id: v.id, content: resultaat });
      } catch {
        resultaten.push({ type: "tool_result", tool_use_id: v.id, is_error: true, content: "Opslaan lukte niet." });
      }
    }
    berichten.push({ role: "user", content: resultaten });
  }
  return "";
}

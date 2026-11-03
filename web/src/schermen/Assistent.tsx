import InstellingenKnop from "./InstellingenKnop";
import type Anthropic from "@anthropic-ai/sdk";
import { useSchermActief } from "./BewaarScherm";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Staat } from "../App";
import { Opstellen } from "./MailOpstellen";
import { Bestand, Hartslag, Bijlage, Boek, Envelop, Herstel, Kalender, Klok, Kruis, Microfoon, Pijl, Plus, Vinkje, Vonk } from "../iconen";
import { GrafiekKaart, type Grafiek } from "../grafiek";
import { ACCEPTEER, BijlageFout, MAX_SAMEN, lezen, type Bijlage as Bijlagebestand } from "../lib/bijlagen";
import { antwoord, gebruikerBeurt, gesprekLeeg, notitie, ongedaanMaken, verbinding, zonderLabels, type Actie,
  type Keuze } from "../lib/assistent";
import { KeuzeKaart } from "../keuzekaart";
import { Mascotte, type Stemming } from "../mascotte";
import { alsBerichten, bewaar, bewarenAan, nieuwId, schoon, type Opgeslagen } from "../lib/geschiedenis";
import { Gesprekken } from "./Gesprekken";
import { Opmaak } from "../lib/opmaak";
import { GEEN_INTERNET } from "../lib/net";
import { bestellen, euro, onthouden, type Product } from "../lib/winkelen";
import { BestelKaart, type Bestelkaart } from "./BestelKaart";
import { Bladen, ProductRij, type Blad } from "./Winkelen";

type Beurt = { wie: "jij" | "assistent"; tekst: string; acties: Actie[]; fout?: boolean; opnieuw?: Herhaling; keuze?: Keuze;
  gekozen?: number;
  producten?: Product[]; bestellingen?: Bestelkaart[]; bijlagen?: { naam: string; soort: Bijlagebestand["soort"] }[];
  grafieken?: Grafiek[] };

// Een vraag die door de verbinding mislukte, zodat je opnieuw kunt proberen zonder alles opnieuw te typen.
type Herhaling = { vraag: string; gekozen?: string; bijlagen: Bijlagebestand[]; vanJou: boolean };

const CONCEPT = "assistent.concept";
const conceptLezen = () => { try { return sessionStorage.getItem(CONCEPT) ?? ""; } catch { return ""; } };
const conceptBewaren = (t: string) => {
  try { if (t) sessionStorage.setItem(CONCEPT, t); else sessionStorage.removeItem(CONCEPT); } catch { /* privé-modus */ }
};

// Blijft staan tussen tab-wissels, zodat je gesprek niet verdwijnt als je even naar een andere pagina gaat.
// `gebruikt` telt de meegestuurde bestanden op: het hele gesprek gaat bij elke vraag opnieuw mee.
const gesprek: { id: string; beurten: Beurt[]; berichten: Anthropic.MessageParam[]; gebruikt: number } =
  { id: nieuwId(), beurten: [], berichten: [], gebruikt: 0 };

function voorstellen(nu = new Date()): string[] {
  const uur = nu.getHours();
  const dag = nu.getDay();
  const lijst = uur < 11
    ? ["Plan mijn dag tussen mijn afspraken door", "Wat staat er vandaag?"]
    : uur < 17
      ? ["Wat moet ik vandaag nog doen?", "Zoek een lunchplek in de buurt"]
      : ["Wat staat er morgen?", "Zet morgen een uur vrij voor mijn taken"];
  if (dag >= 4) lijst.push("Wat is er dit weekend te doen?");
  return [...lijst, "Hoeveel heb ik deze maand uitgegeven?", "Zoek een tweedehands fiets onder de 150 euro"];
}

type Herkenning = {
  lang: string; continuous: boolean; interimResults: boolean;
  start: () => void; stop: () => void;
  onresult: ((e: { results: { [i: number]: { isFinal: boolean; [j: number]: { transcript: string } }; length: number } }) => void) | null;
  onend: (() => void) | null; onerror: (() => void) | null;
};
const Spraak = (window as unknown as { SpeechRecognition?: new () => Herkenning; webkitSpeechRecognition?: new () => Herkenning })
  .SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: new () => Herkenning }).webkitSpeechRecognition;

type Props = { staat: Staat; vernieuw: () => void; teKopen?: Product | null; gekocht?: () => void; vooraf?: string;
  voorafGebruikt?: () => void; naarBestellingen?: () => void; sluit?: () => void };

export default function Assistent({ staat, vernieuw, teKopen, gekocht, vooraf, voorafGebruikt, naarBestellingen, sluit }: Props) {
  const schermActief=useSchermActief();
  const [beurten, setBeurten] = useState<Beurt[]>(gesprek.beurten);
  const [invoer, setInvoer] = useState(conceptLezen);
  useEffect(() => conceptBewaren(invoer), [invoer]);
  const [herhaal, setHerhaal] = useState<Herhaling | null>(null);
  const [bezig, setBezig] = useState<string | null>(null);
  const [luistert, setLuistert] = useState(false);
  const [klaarNr, setKlaarNr] = useState(0);
  const [geschiedenis, setGeschiedenis] = useState(false);
  const [teVersturen, setTeVersturen] = useState<{ plek: [number, number]; mail: NonNullable<Actie["mail"]> } | null>(null);
  const stemming: Stemming = bezig ? "denkt" : luistert ? "luistert" : invoer.trim() ? "kijkt" : "wacht";
  const [hup, setHup] = useState(0);
  const [voorstelNr, setVoorstelNr] = useState(0);
  const [lijstVoorstellen] = useState(voorstellen);
  const voorstel = lijstVoorstellen[voorstelNr % lijstVoorstellen.length];
  const [bladen, setBladen] = useState<Blad[]>([]);
  const [klaar, setKlaar] = useState<Bijlagebestand[]>([]);
  const [lezend, setLezend] = useState(false);
  const [melding, setMelding] = useState<string | null>(null);
  const kiezer = useRef<HTMLInputElement>(null);
  const onder = useRef<HTMLDivElement>(null);
  const veld = useRef<HTMLTextAreaElement>(null);
  const stoppen = useRef<AbortController | null>(null);
  const herkenning = useRef<Herkenning | null>(null);

  useEffect(() => {
    gesprek.beurten = beurten;
    if(schermActief)onder.current?.scrollIntoView?.({ block: "end" });
  }, [beurten, bezig,schermActief]);
  useEffect(() => () => {
    stoppen.current?.abort();
    herkenning.current?.stop();
  }, []);
  // Na elk afgerond antwoord de tekst bewaren bij je eerdere gesprekken.
  useEffect(() => {
    if (!klaarNr || !bewarenAan(staat.data)) return;
    bewaar(gesprek.id, schoon(beurten)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [klaarNr]);

  function wijzig(i: number, aanpassen: (b: Beurt) => Beurt) {
    setBeurten((lijst) => lijst.map((b, j) => (j === i ? aanpassen(b) : b)));
  }

  function vraag(tekst: string, bijlagen: Bijlagebestand[] = []) {
    const v = tekst.trim();
    if ((!v && !bijlagen.length) || bezig) return;
    setInvoer("");
    setKlaar([]);
    pasHoogteAan(veld.current);
    void praat(v, undefined, bijlagen);
    // Houd de focus op het veld zodat je meteen door kunt typen.
    requestAnimationFrame(() => veld.current?.focus({ preventScroll: true }));
  }

  async function bestandenGekozen(lijst: FileList | null) {
    if (!lijst?.length || bezig) return;
    setMelding(null);
    setLezend(true);
    const nieuw: Bijlagebestand[] = [];
    let fout: string | null = null;
    let som = gesprek.gebruikt + klaar.reduce((n, b) => n + b.grootte, 0);
    for (const f of Array.from(lijst)) {
      try {
        const b = await lezen(f);
        if (som + b.grootte > MAX_SAMEN) {
          fout = "Dit past niet meer bij wat je al hebt meegestuurd. Begin een nieuw gesprek of stuur minder tegelijk.";
          break;
        }
        som += b.grootte;
        nieuw.push(b);
      } catch (e) {
        fout = e instanceof BijlageFout ? e.message : "Dit bestand kon niet worden gelezen.";
        break;
      }
    }
    if (fout) setMelding(fout);
    setKlaar((k) => [...k, ...nieuw]);
    setLezend(false);
    if (kiezer.current) kiezer.current.value = "";
    veld.current?.focus({ preventScroll: true });
  }

  /** Bestellen vanuit een productblad: de assistent zet de kaart klaar, jij tikt daarna zelf op Bestellen. */
  function koop(p: Product) {
    if (bezig) return;
    setBladen([]);
    onthouden(p);
    notitie(`De gebruiker tikte in het productblad op ${p.bron === "winkel" ? "Bestellen" : "Kopen"} bij sleutel ${p.sleutel} `
      + `(${p.titel}, ${euro(p.prijs)}, ${p.verkoper}; levering ${p.levering.join("/") || "onbekend"}; `
      + `betaalwijzen ${p.betaalwijzen.join("/") || "onbekend"}). Vraag alleen wat nog ontbreekt en zet het dan klaar.`);
    praat(`Ik wil ${p.titel} ${p.bron === "winkel" ? "bestellen" : "kopen"}.`);
  }

  // Bestellen vanuit de winkel in de chat: hier verder met dezelfde stap als vanuit een productblad.
  useEffect(() => {
    if (!teKopen || bezig) return;
    gekocht?.();
    koop(teKopen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teKopen]);

  // Wat je via Siri zei: als vraag na openen van de assistent.
  useEffect(() => {
    if (!vooraf || bezig) return;
    voorafGebruikt?.();
    vraag(vooraf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vooraf]);

  function kies(i: number, j: number) {
    const k = beurten[i].keuze;
    if (!k || bezig || beurten[i].gekozen !== undefined) return;
    wijzig(i, (b) => ({ ...b, gekozen: j }));
    void praat("", k.opties[j].label);
  }

  async function praat(vraagTekst: string, gekozen?: string, bijlagen: Bijlagebestand[] = []) {
    const client = await verbinding(staat.data);
    const vanJou = Boolean(vraagTekst || bijlagen.length);
    const plek = beurten.length + (vanJou ? 1 : 0);
    setBeurten((l) => [...l, ...(vanJou ? [{ wie: "jij" as const, tekst: vraagTekst, acties: [] as Actie[],
      bijlagen: bijlagen.map(({ naam, soort }) => ({ naam, soort })) }] : []),
      { wie: "assistent" as const, tekst: "", acties: [] as Actie[] }]);
    if (!client) {
      wijzig(plek, (b) => ({ ...b, fout: true, tekst: "De assistent staat nog uit. Zet hem aan bij Instellingen › Assistent, "
        + "met je eigen sleutel." }));
      return;
    }
    setBezig("Denkt na");
    stoppen.current = new AbortController();
    const terugzetten = gebruikerBeurt(gesprek.berichten, vraagTekst, gekozen, bijlagen.map((b) => b.blok));
    const extra = bijlagen.reduce((n, b) => n + b.grootte, 0);
    gesprek.gebruikt += extra;
    let ruw = "";
    let veranderd = false;
    try {
      const slot = await antwoord(client, gesprek.berichten, staat.data, {
        tekst: (stukje) => {
          ruw += stukje;
          setBezig(null);
          wijzig(plek, (b) => ({ ...b, tekst: zonderLabels(ruw) }));
        },
        bezig: (wat) => setBezig(wat),
        actie: (a) => {
          veranderd = true;
          wijzig(plek, (b) => ({ ...b, acties: [...b.acties, a] }));
        },
        keuze: (k) => wijzig(plek, (b) => ({ ...b, keuze: k })),
        producten: (p) => wijzig(plek, (b) => ({ ...b, producten: p })),
        bestelling: (x) => wijzig(plek, (b) => ({ ...b, bestellingen: [...(b.bestellingen ?? []), { b: x, status: "klaar" }] })),
        grafiek: (g) => wijzig(plek, (b) => ({ ...b, grafieken: [...(b.grafieken ?? []), g] })),
      }, stoppen.current.signal);
      if (slot) wijzig(plek, (b) => ({ ...b, tekst: (zonderLabels(ruw) + "\n\n" + slot).trim() }));
      else if (!ruw.trim()) wijzig(plek, (b) => ({ ...b, tekst: b.acties.length || b.keuze || b.producten || b.bestellingen
        || b.grafieken
        ? "" : "Klaar." }));
    } catch (e) {
      if (!stoppen.current?.signal.aborted) {
        // Een gesprek dat halverwege afbrak, sturen we niet opnieuw mee: dan blijft het geldig.
        terugzetten();
        gesprek.gebruikt -= extra;
        const status = (e as { status?: number }).status;
        const herhaling = status === 401 || status === 413 ? undefined : { vraag: vraagTekst, gekozen, bijlagen, vanJou };
        wijzig(plek, (b) => ({ ...b, fout: true, opnieuw: herhaling, tekst: navigator.onLine === false ? GEEN_INTERNET
          : status === 429
          ? "Je hebt deze maand je ruimte voor de assistent gebruikt, of het is even te druk. Probeer het later opnieuw."
          : status === 401 ? "Log opnieuw in om verder te praten."
          : status === 413 ? "Dat is te veel in één keer. Begin een nieuw gesprek of stuur een kleiner bestand."
          : "De assistent is even niet bereikbaar. Probeer het zo opnieuw." }));
      }
    } finally {
      setBezig(null);
      stoppen.current = null;
      setKlaarNr((n) => n + 1);
      if (veranderd) vernieuw();
    }
  }

  function opnieuw(i: number) {
    const h = beurten[i].opnieuw;
    if (!h || bezig) return;
    setBeurten((l) => l.slice(0, i - (h.vanJou ? 1 : 0)));
    setHerhaal(h);
  }

  useEffect(() => {
    if (!herhaal) return;
    setHerhaal(null);
    void praat(herhaal.vraag, herhaal.gekozen, herhaal.bijlagen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [herhaal]);

  function pasHoogteAan(el: HTMLTextAreaElement | null) {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }

  function stopAntwoord() {
    // Alleen afbreken; finally ruimt op en catch negeert aborted requests.
    stoppen.current?.abort();
    setBezig(null);
  }

  function luisteren() {
    if (!Spraak || bezig || luistert) return;
    const r = new Spraak();
    r.lang = "nl-NL";
    r.continuous = false;
    r.interimResults = true;
    herkenning.current = r;
    setLuistert(true);
    r.onresult = (e) => {
      let tekst = "";
      for (let i = 0; i < e.results.length; i++) {
        tekst += e.results[i][0]?.transcript ?? "";
      }
      setInvoer(tekst);
      if (e.results[e.results.length - 1]?.isFinal) {
        setLuistert(false);
        herkenning.current = null;
      }
    };
    r.onend = () => { setLuistert(false); herkenning.current = null; };
    r.onerror = () => { setLuistert(false); herkenning.current = null; };
    try { r.start(); } catch { setLuistert(false); }
  }

  function stopLuisteren() {
    herkenning.current?.stop();
    setLuistert(false);
    herkenning.current = null;
  }

  async function terugdraaien(i: number, j: number) {
    const a = beurten[i].acties[j];
    if (!a?.ongedaan || a.teruggedraaid) return;
    wijzig(i, (b) => ({ ...b, acties: b.acties.map((x, k) => (k === j ? { ...x, teruggedraaid: true } : x)) }));
    try {
      await ongedaanMaken(a.ongedaan);
      notitie(`De gebruiker heeft "${a.titel}" ongedaan gemaakt met de knop.`);
      vernieuw();
    } catch {
      wijzig(i, (b) => ({ ...b, acties: b.acties.map((x, k) => (k === j ? { ...x, teruggedraaid: false } : x)) }));
    }
  }

  /** Alleen hier gaat een bestelling echt weg: na een tik van de gebruiker zelf. */
  async function bestel(i: number, j: number) {
    const kaart = beurten[i].bestellingen?.[j];
    if (!kaart || kaart.status !== "klaar") return;
    const zet = (k: Partial<Bestelkaart>) =>
      wijzig(i, (b) => ({ ...b, bestellingen: b.bestellingen!.map((x, n) => (n === j ? { ...x, ...k } : x)) }));
    zet({ status: "bezig", fout: undefined });
    try {
      const r = await bestellen(kaart.b);
      zet({ status: "besteld", bedrag: r.bedrag });
      notitie(`De gebruiker heeft "${kaart.b.product.titel}" besteld met de knop (bestelling ${r.id}, ${euro(r.bedrag)}).`);
    } catch (e) {
      zet({ status: "klaar", fout: e instanceof Error ? e.message : "Bestellen lukte niet." });
    }
  }

  function nieuw() {
    stoppen.current?.abort();
    gesprek.id = nieuwId();
    gesprek.berichten = [];
    gesprek.gebruikt = 0;
    gesprekLeeg();
    setKlaar([]);
    setMelding(null);
    setBeurten([]);
    setBezig(null);
    veld.current?.focus();
  }

  /** Verder praten in een eerder gesprek: alleen de tekst komt terug, kaarten en bestanden niet. */
  function verderIn(g: Opgeslagen) {
    stoppen.current?.abort();
    gesprekLeeg();
    gesprek.id = g.id;
    gesprek.berichten = alsBerichten(g.beurten);
    gesprek.gebruikt = 0;
    setKlaar([]);
    setMelding(null);
    setBezig(null);
    setBeurten(g.beurten.map((b) => ({ ...b, acties: [] })));
    setGeschiedenis(false);
  }

  function naVersturen(verstuurd: boolean) {
    const t = teVersturen;
    setTeVersturen(null);
    if (!t || !verstuurd) return;
    const [i, j] = t.plek;
    wijzig(i, (b) => ({ ...b, acties: b.acties.map((x, k) => (k === j ? { ...x, detail: "Verstuurd" } : x)) }));
    notitie(`De gebruiker heeft de mail "${t.mail.onderwerp}" verstuurd.`);
  }

  function verstuur(e: FormEvent) {
    e.preventDefault();
    if (luistert) stopLuisteren();
    vraag(invoer, klaar);
  }

  const leeg = beurten.length === 0;

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-10 flex items-center justify-between bg-white/85 px-6 pt-14 pb-3 backdrop-blur dark:bg-[#0b0b0e]/85">
        <div className="flex items-center gap-2">
          {sluit && (
            <button type="button" onClick={sluit} aria-label="Sluiten"
              className="-ml-2 flex size-10 items-center justify-center rounded-full text-rustig">
              <Kruis className="size-5" />
            </button>
          )}
          <h1 className="text-[28px] font-bold tracking-tight">Assistent</h1>
        </div>
        <div className="flex gap-2">
          <InstellingenKnop pagina="assistent" label="Assistent instellen" />
          <button type="button" onClick={() => setGeschiedenis(true)} aria-label="Eerdere gesprekken"
            className="flex size-10 items-center justify-center rounded-full bg-vlak">
            <Klok className="size-5" />
          </button>
          {!leeg && (
            <button type="button" onClick={nieuw} aria-label="Nieuw gesprek"
              className="flex size-10 items-center justify-center rounded-full bg-vlak">
              <Plus className="size-5" />
            </button>
          )}
        </div>
      </header>

      {leeg ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 py-10">
          <button type="button" onClick={() => { setHup((h) => h + 1); setVoorstelNr((n) => n + 1); }}
            aria-label="Andere suggesties">
            <Mascotte className="h-20 w-16" hup={hup} stemming={stemming} />
          </button>
          <p className="text-center text-[15px] text-rustig">Waarmee kan ik helpen?</p>
          <div className="flex max-w-md flex-wrap justify-center gap-2">
            {lijstVoorstellen.slice(voorstelNr % lijstVoorstellen.length, (voorstelNr % lijstVoorstellen.length) + 3)
              .concat(lijstVoorstellen.slice(0, Math.max(0, (voorstelNr % lijstVoorstellen.length) + 3 - lijstVoorstellen.length)))
              .slice(0, 3)
              .map((s) => (
                <button key={s} type="button" onClick={() => vraag(s)}
                  className="rounded-full bg-vlak px-4 py-2.5 text-sm text-left">{s}</button>
              ))}
          </div>
        </div>
      ) : (
        <main className="flex flex-1 flex-col gap-4 px-4 pb-4 pt-2">
          {beurten.map((b, i) => (
            <div key={i} className={`flex gap-2 ${b.wie === "jij" ? "flex-row-reverse" : ""}`}>
              {b.wie === "assistent" && (
                <Bol actief={i === beurten.length - 1 && !!bezig} />
              )}
              <div className={`flex min-w-0 flex-1 flex-col gap-2 ${b.wie === "jij" ? "items-end" : "items-start"}`}>
                {b.bijlagen && b.bijlagen.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {b.bijlagen.map((x, j) => <Chip key={j} naam={x.naam} />)}
                  </div>
                )}
                {(b.tekst || b.wie === "jij") && (
                  <div className={`max-w-[92%] rounded-3xl px-4 py-2.5 text-[15px] leading-relaxed ${
                    b.wie === "jij" ? "bg-accent text-white" : "bg-vlak"}`}>
                    <Opmaak tekst={b.tekst} />
                  </div>
                )}
                {b.fout && b.opnieuw && (
                  <button type="button" onClick={() => opnieuw(i)}
                    className="self-start rounded-full bg-vlak px-4 py-2 text-sm font-medium">Opnieuw proberen</button>
                )}
                {b.acties.length > 0 && (
                  <ul className="flex flex-col gap-2">
                    {b.acties.map((a, j) => <Kaartje key={j} actie={a} terug={() => void terugdraaien(i, j)}
                      versturen={a.mail ? () => setTeVersturen({ plek: [i, j], mail: a.mail! }) : undefined} />)}
                  </ul>
                )}
                {b.grafieken?.map((g, j) => <GrafiekKaart key={j} g={g} />)}
                {b.producten && <ProductRij producten={b.producten} open={(p) => setBladen([{ soort: "product", p }])} />}
                {b.bestellingen?.map((k, j) => (
                  <BestelKaart key={j} kaart={k} bestel={() => void bestel(i, j)} naarBestellingen={naarBestellingen} />
                ))}
                {b.keuze && (
                  <KeuzeKaart keuze={b.keuze} gekozen={b.gekozen} kies={(j) => kies(i, j)}
                    open={i === beurten.length - 1 && !bezig && b.gekozen === undefined} />
                )}
                {i === beurten.length - 1 && bezig && (
                  <p className="flex items-center gap-2 text-[15px] text-rustig">
                    <span className="bezig-tekst">{bezig}</span>
                  </p>
                )}
              </div>
            </div>
          ))}
          <div ref={onder} />
        </main>
      )}

      <Bladen stapel={bladen} zet={setBladen} bestel={koop} />
      {teVersturen && <Opstellen data={staat.data} begin={teVersturen.mail} sluit={naVersturen} />}
      {geschiedenis && <Gesprekken sluit={() => setGeschiedenis(false)} open={verderIn} huidig={leeg ? undefined : gesprek.id} />}

      <form onSubmit={verstuur} className="sticky bottom-0 bg-white px-4 pb-3 pt-2 dark:bg-[#0b0b0e]">
        {melding && <p role="alert" className="px-3 pb-2 text-sm text-red-600 dark:text-red-400">{melding}</p>}
        {(klaar.length > 0 || lezend) && (
          <div className="flex flex-wrap gap-2 px-1 pb-2">
            {klaar.map((b, i) => (
              <Chip key={i} naam={b.naam} weg={() => setKlaar((k) => k.filter((_, j) => j !== i))} />
            ))}
            {lezend && <span className="bezig-tekst px-2 py-1.5 text-sm">Bestand lezen</span>}
          </div>
        )}
        <div className={`flex items-end gap-1 rounded-3xl bg-vlak py-1.5 pr-1.5 pl-1.5 ${luistert ? "ring-2 ring-accent" : ""}`}>
          <input ref={kiezer} type="file" accept={ACCEPTEER} multiple className="hidden"
            onChange={(e) => void bestandenGekozen(e.target.files)} />
          <button type="button" onClick={() => kiezer.current?.click()} disabled={!!bezig || lezend}
            aria-label="Bestand toevoegen" className="flex size-10 shrink-0 items-center justify-center rounded-full text-rustig disabled:opacity-40">
            <Bijlage className="size-5" />
          </button>
          <textarea ref={veld} value={invoer}
            onChange={(e) => { setInvoer(e.target.value); pasHoogteAan(e.target); }}
            rows={1}
            disabled={!!bezig}
            placeholder={bezig ? "Even geduld…" : luistert ? "Luisteren…" : "Stel een vraag…"}
            className="max-h-32 min-h-10 flex-1 resize-none bg-transparent px-1 py-2 outline-none disabled:opacity-60"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); vraag(invoer, klaar); }
            }} />
          {bezig ? (
            <button type="button" onClick={stopAntwoord} aria-label="Stoppen"
              className="flex size-10 shrink-0 items-center justify-center rounded-full bg-vlak text-rustig">
              <Kruis className="size-5" />
            </button>
          ) : luistert ? (
            <button type="button" onClick={stopLuisteren} aria-label="Stoppen met luisteren"
              className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-white">
              <Kruis className="size-5" />
            </button>
          ) : invoer.trim() || klaar.length || !Spraak ? (
            <button type="submit" disabled={!invoer.trim() && !klaar.length}
              className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-white disabled:opacity-40"
              aria-label="Versturen">
              <Pijl className="size-5" />
            </button>
          ) : (
            <button type="button" onClick={luisteren}
              aria-label="Spreken" className="flex size-10 shrink-0 items-center justify-center rounded-full text-rustig">
              <Microfoon className="size-5" />
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

/** Een meegestuurd bestand, als klein label. Met `weg` kun je het er nog af halen voor je verstuurt. */
function Chip({ naam, weg }: { naam: string; weg?: () => void }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-vlak px-3 py-1.5 text-[13px]">
      <Bestand className="size-3.5 shrink-0 text-rustig" />
      <span className="truncate">{naam}</span>
      {weg && (
        <button type="button" onClick={weg} aria-label={`${naam} weghalen`} className="-mr-1 shrink-0 rounded-full p-0.5 text-rustig">
          <Kruis className="size-3.5" />
        </button>
      )}
    </span>
  );
}

function Bol({ groot = false, actief = false }: { groot?: boolean; actief?: boolean }) {
  return (
    <span aria-hidden className={`bol shrink-0 rounded-full ${groot ? "size-20" : "mt-0.5 size-7"} ${actief ? "bol-actief" : ""}`} />
  );
}

const KLEUR: Record<Actie["soort"], string> = {
  afspraak: "bg-accent/10 text-accent", taak: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  klaar: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400", onthouden: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  weg: "bg-vlak text-rustig", leren: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  mail: "bg-sky-500/10 text-sky-600 dark:text-sky-400", sport: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
};

function Kaartje({ actie, terug, versturen }: { actie: Actie; terug: () => void; versturen?: () => void }) {
  const Icoon = actie.soort === "afspraak" ? Kalender : actie.soort === "onthouden" ? Vonk
    : actie.soort === "leren" ? Boek : actie.soort === "mail" ? Envelop : actie.soort === "sport" ? Hartslag : Vinkje;
  return (
    <li className={`flex items-center gap-3 rounded-2xl border border-lijn py-2.5 pr-2 pl-3 ${actie.teruggedraaid ? "opacity-50" : ""}`}>
      <span className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${KLEUR[actie.soort]}`}>
        <Icoon className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className={`line-clamp-2 font-medium ${actie.teruggedraaid ? "line-through" : ""}`}>{actie.titel}</span>
        <span className="truncate text-[13px] text-rustig">{actie.teruggedraaid ? "Ongedaan gemaakt" : actie.detail}</span>
      </span>
      {versturen && !actie.teruggedraaid && (
        <button type="button" onClick={versturen} className="shrink-0 rounded-full bg-accent px-3 py-1.5 text-sm font-medium text-white">
          Versturen
        </button>
      )}
      {actie.ongedaan && !actie.teruggedraaid && (
        <button type="button" onClick={terug} aria-label={`${actie.titel} ongedaan maken`} title="Ongedaan maken"
          className="flex size-9 shrink-0 items-center justify-center rounded-full text-rustig">
          <Herstel className="size-5" />
        </button>
      )}
    </li>
  );
}

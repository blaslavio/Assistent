import type Anthropic from "@anthropic-ai/sdk";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Staat } from "../App";
import { OUDE_APP } from "../api";
import { Bestand, Bijlage, Herstel, Kalender, Kruis, Microfoon, Pijl, Plus, Vinkje, Vonk } from "../iconen";
import { GrafiekKaart, type Grafiek } from "../grafiek";
import { ACCEPTEER, BijlageFout, MAX_SAMEN, lezen, type Bijlage as Bijlagebestand } from "../lib/bijlagen";
import { antwoord, gebruikerBeurt, gesprekLeeg, notitie, ongedaanMaken, verbinding, zonderLabels, type Actie,
  type Keuze } from "../lib/assistent";
import { KeuzeKaart } from "../keuzekaart";
import { Opmaak } from "../lib/opmaak";
import { BETAALWIJZE, LEVERING, bestellen, euro, onthouden, type Bestelling, type Product } from "../lib/winkelen";
import { Bladen, ProductRij, type Blad } from "./Winkelen";

type Bestelkaart = { b: Bestelling; status: "klaar" | "bezig" | "besteld"; fout?: string; bedrag?: number };
type Beurt = { wie: "jij" | "assistent"; tekst: string; acties: Actie[]; fout?: boolean; keuze?: Keuze; gekozen?: number;
  producten?: Product[]; bestellingen?: Bestelkaart[]; bijlagen?: { naam: string; soort: Bijlagebestand["soort"] }[];
  grafieken?: Grafiek[] };

// Het gesprek blijft bewaard zolang dit tabblad open is, ook als je even naar Vandaag gaat. Niet op het apparaat.
// `gebruikt` telt de meegestuurde bestanden op: het hele gesprek gaat bij elke vraag opnieuw mee.
const gesprek: { beurten: Beurt[]; berichten: Anthropic.MessageParam[]; gebruikt: number } =
  { beurten: [], berichten: [], gebruikt: 0 };

const VOORBEELDEN = ["Wat staat er vandaag?", "Plan morgen een uur voor mijn taken", "Zet vrijdag 19:00 etentje met Sanne",
  "Wat is er dit weekend te doen?"];

type Herkenning = {
  lang: string; interimResults: boolean; continuous: boolean; start(): void; stop(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null; onerror: (() => void) | null;
};
const Spraak = (window as unknown as { SpeechRecognition?: new () => Herkenning; webkitSpeechRecognition?: new () => Herkenning })
  .SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: new () => Herkenning }).webkitSpeechRecognition;

type Props = { staat: Staat; vernieuw: () => void; teKopen?: Product | null; gekocht?: () => void };

export default function Assistent({ staat, vernieuw, teKopen, gekocht }: Props) {
  const [beurten, setBeurten] = useState<Beurt[]>(gesprek.beurten);
  const [invoer, setInvoer] = useState("");
  const [bezig, setBezig] = useState<string | null>(null);
  const [luistert, setLuistert] = useState(false);
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
    onder.current?.scrollIntoView({ block: "end" });
  }, [beurten, bezig]);
  useEffect(() => () => stoppen.current?.abort(), []);

  function wijzig(i: number, aanpassen: (b: Beurt) => Beurt) {
    setBeurten((lijst) => lijst.map((b, j) => (j === i ? aanpassen(b) : b)));
  }

  /** Een getypt of ingesproken bericht. */
  function vraag(tekst: string) {
    const vraag = tekst.trim();
    if ((!vraag && !klaar.length) || bezig || lezend) return;
    setInvoer("");
    setMelding(null);
    if (veld.current) veld.current.style.height = "auto";
    const mee = klaar;
    setKlaar([]);
    praat(vraag, undefined, mee);
  }

  /** Gekozen bestanden lezen en klaarzetten; ze gaan mee met het volgende bericht. */
  async function bestandenGekozen(lijst: FileList | null) {
    if (!lijst?.length) return;
    setLezend(true);
    setMelding(null);
    let ruimte = MAX_SAMEN - gesprek.gebruikt - klaar.reduce((n, b) => n + b.grootte, 0);
    const nieuw: Bijlagebestand[] = [];
    for (const bestand of Array.from(lijst).slice(0, 5)) {
      try {
        const b = await lezen(bestand);
        if (b.grootte > ruimte) {
          setMelding("Dit gesprek zit vol met bestanden. Begin een nieuw gesprek met Nieuw.");
          break;
        }
        ruimte -= b.grootte;
        nieuw.push(b);
      } catch (e) {
        setMelding(e instanceof BijlageFout ? e.message : `${bestand.name} kon ik niet openen.`);
      }
    }
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

  /** Een tik op een optie van een keuzekaart. */
  function kies(i: number, j: number) {
    const k = beurten[i].keuze;
    if (!k || bezig || beurten[i].gekozen !== undefined) return;
    wijzig(i, (b) => ({ ...b, gekozen: j }));
    praat("", k.opties[j].label);
  }

  async function praat(vraag: string, gekozen?: string, bijlagen: Bijlagebestand[] = []) {
    const client = await verbinding(staat.data);
    const vanJou = Boolean(vraag || bijlagen.length);
    const plek = beurten.length + (vanJou ? 1 : 0);
    setBeurten((l) => [...l, ...(vanJou ? [{ wie: "jij" as const, tekst: vraag, acties: [],
      bijlagen: bijlagen.map(({ naam, soort }) => ({ naam, soort })) }] : []),
      { wie: "assistent", tekst: "", acties: [] }]);
    if (!client) {
      wijzig(plek, (b) => ({ ...b, fout: true, tekst: "De assistent staat nog uit. Zet hem aan in de huidige app bij "
        + "Instellingen › Assistent, met je eigen sleutel of een abonnement." }));
      return;
    }
    setBezig("Denkt na");
    stoppen.current = new AbortController();
    const terugzetten = gebruikerBeurt(gesprek.berichten, vraag, gekozen, bijlagen.map((b) => b.blok));
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
        wijzig(plek, (b) => ({ ...b, fout: true, tekst: status === 429
          ? "Je hebt deze maand je ruimte voor de assistent gebruikt, of het is even te druk. Probeer het later opnieuw."
          : status === 401 ? "Log opnieuw in om verder te praten."
          : status === 413 ? "Dat is te veel in één keer. Begin een nieuw gesprek of stuur een kleiner bestand." : "De assistent is even niet bereikbaar. Probeer het zo opnieuw." }));
      }
    } finally {
      setBezig(null);
      stoppen.current = null;
      if (veranderd) vernieuw();
    }
  }

  function verstuur(e: FormEvent) {
    e.preventDefault();
    vraag(invoer);
  }

  function luister() {
    if (!Spraak) return;
    if (luistert) {
      herkenning.current?.stop();
      return;
    }
    const h = new Spraak();
    h.lang = "nl-NL";
    h.interimResults = true;
    h.continuous = false;
    let gehoord = "";
    h.onresult = (e) => {
      gehoord = Array.from(e.results).map((r) => r[0].transcript).join("");
      setInvoer(gehoord);
    };
    h.onerror = () => setLuistert(false);
    h.onend = () => {
      setLuistert(false);
      if (gehoord.trim()) vraag(gehoord);
    };
    herkenning.current = h;
    setLuistert(true);
    h.start();
  }

  async function terugdraaien(i: number, j: number) {
    const a = beurten[i].acties[j];
    if (!a.ongedaan || a.teruggedraaid) return;
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
    gesprek.berichten = [];
    gesprek.gebruikt = 0;
    gesprekLeeg();
    setKlaar([]);
    setMelding(null);
    setBeurten([]);
    setBezig(null);
    veld.current?.focus();
  }

  const leeg = beurten.length === 0;
  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-10 flex items-center justify-between bg-white/85 px-6 pt-14 pb-3 backdrop-blur dark:bg-[#0b0b0e]/85">
        <h1 className="text-[32px] font-bold tracking-tight">Assistent</h1>
        {!leeg && (
          <button onClick={nieuw} className="flex h-10 items-center gap-1.5 rounded-full bg-vlak px-4 text-sm font-medium">
            <Plus className="size-4" /> Nieuw
          </button>
        )}
      </header>

      {leeg ? (
        <main className="flex flex-1 flex-col items-center justify-center gap-8 px-6 pb-10 text-center">
          <Bol groot />
          <h2 className="text-2xl font-semibold tracking-tight">Waarmee kan ik helpen?</h2>
          <div className="flex flex-wrap justify-center gap-2">
            {VOORBEELDEN.map((v) => (
              <button key={v} onClick={() => vraag(v)}
                className="rounded-full border border-lijn px-4 py-2.5 text-[15px] text-rustig hover:bg-vlak">{v}</button>
            ))}
          </div>
        </main>
      ) : (
        <main className="flex flex-1 flex-col gap-6 px-6 pt-2 pb-6" aria-live="polite">
          {beurten.map((b, i) => b.wie === "jij" ? (
            <div key={i} className="ml-auto flex max-w-[85%] flex-col items-end gap-1.5">
              {b.bijlagen?.map((x, j) => <Chip key={j} naam={x.naam} />)}
              {b.tekst && (
                <p className="whitespace-pre-wrap rounded-[22px] rounded-br-md bg-accent px-4 py-2.5 text-white">{b.tekst}</p>
              )}
            </div>
          ) : (
            <div key={i} className="flex gap-3">
              <Bol actief={i === beurten.length - 1 && bezig !== null} />
              <div className="flex min-w-0 flex-1 flex-col gap-3 pt-0.5">
                {b.tekst && (b.fout ? <p className="text-rustig">{b.tekst}</p> : <Opmaak tekst={b.tekst} />)}
                {b.acties.length > 0 && (
                  <ul className="flex flex-col gap-2">
                    {b.acties.map((a, j) => <Kaartje key={j} actie={a} terug={() => terugdraaien(i, j)} />)}
                  </ul>
                )}
                {b.grafieken?.map((g, j) => <GrafiekKaart key={j} g={g} />)}
                {b.producten && <ProductRij producten={b.producten} open={(p) => setBladen([{ soort: "product", p }])} />}
                {b.bestellingen?.map((k, j) => <BestelKaart key={j} kaart={k} bestel={() => bestel(i, j)} />)}
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
        <div className={`flex items-end gap-1 rounded-[26px] bg-vlak py-1.5 pr-1.5 pl-1.5 ${luistert ? "ring-2 ring-accent" : ""}`}>
          <input ref={kiezer} type="file" multiple accept={ACCEPTEER} className="hidden"
            onChange={(e) => bestandenGekozen(e.target.files)} />
          <button type="button" onClick={() => kiezer.current?.click()} aria-label="Bestand toevoegen" disabled={lezend}
            className="flex size-10 shrink-0 items-center justify-center rounded-full text-rustig disabled:opacity-40">
            <Bijlage className="size-5" />
          </button>
          <label className="flex-1 self-center">
            <span className="sr-only">Bericht aan de assistent</span>
            <textarea ref={veld} rows={1} value={invoer} placeholder={luistert ? "Ik luister…" : "Vraag of zeg iets"}
              onChange={(e) => {
                setInvoer(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  vraag(invoer);
                }
              }}
              className="block max-h-40 w-full resize-none bg-transparent py-2 leading-6 outline-none placeholder:text-zacht" />
          </label>
          {bezig ? (
            <button type="button" onClick={() => stoppen.current?.abort()} aria-label="Stoppen"
              className="flex size-10 shrink-0 items-center justify-center rounded-full bg-inkt">
              <span className="size-3 rounded-[3px] bg-white dark:bg-black" />
            </button>
          ) : invoer.trim() || klaar.length || !Spraak ? (
            <button aria-label="Versturen" disabled={(!invoer.trim() && !klaar.length) || lezend}
              className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-white disabled:opacity-30">
              <Pijl className="size-5" />
            </button>
          ) : (
            <button type="button" onClick={luister} aria-label={luistert ? "Stop met luisteren" : "Inspreken"}
              className={`flex size-10 shrink-0 items-center justify-center rounded-full ${luistert ? "bg-accent text-white" : "text-rustig"}`}>
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
    <span className="flex max-w-full items-center gap-1.5 rounded-2xl border border-lijn bg-white py-1.5 pr-1.5 pl-3 text-sm dark:bg-[#0b0b0e]">
      <Bestand className="size-4 shrink-0 text-rustig" />
      <span className="truncate">{naam}</span>
      {weg ? (
        <button type="button" onClick={weg} aria-label={`${naam} weghalen`}
          className="flex size-6 shrink-0 items-center justify-center rounded-full text-rustig hover:bg-vlak">
          <Kruis className="size-3.5" />
        </button>
      ) : <span className="w-1.5" />}
    </span>
  );
}

/** De assistent als zachte, levende bol in plaats van een gezicht of naam. Hij ademt terwijl hij bezig is. */
function Bol({ groot = false, actief = false }: { groot?: boolean; actief?: boolean }) {
  return (
    <span aria-hidden className={`bol shrink-0 rounded-full ${groot ? "size-20" : "mt-0.5 size-7"} ${actief ? "bol-actief" : ""}`} />
  );
}

const KLEUR: Record<Actie["soort"], string> = {
  afspraak: "bg-accent/10 text-accent", taak: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  klaar: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400", onthouden: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  weg: "bg-vlak text-rustig",
};

function Kaartje({ actie, terug }: { actie: Actie; terug: () => void }) {
  const Icoon = actie.soort === "afspraak" ? Kalender : actie.soort === "onthouden" ? Vonk : Vinkje;
  return (
    <li className={`flex items-center gap-3 rounded-2xl border border-lijn py-2.5 pr-2 pl-3 ${actie.teruggedraaid ? "opacity-50" : ""}`}>
      <span className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${KLEUR[actie.soort]}`}>
        <Icoon className="size-[18px]" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={`line-clamp-2 font-medium ${actie.teruggedraaid ? "line-through" : ""}`}>{actie.titel}</span>
        <span className="truncate text-[13px] text-rustig">{actie.teruggedraaid ? "Ongedaan gemaakt" : actie.detail}</span>
      </span>
      {actie.ongedaan && !actie.teruggedraaid && (
        <button onClick={terug} aria-label={`${actie.titel} ongedaan maken`} title="Ongedaan maken"
          className="flex size-10 shrink-0 items-center justify-center rounded-full text-rustig hover:bg-vlak">
          <Herstel className="size-[18px]" />
        </button>
      )}
    </li>
  );
}


/** Wat de assistent vond, als rij kaartjes om langs te vegen. */
function BestelKaart({ kaart, bestel }: { kaart: Bestelkaart; bestel: () => void }) {
  const { b } = kaart;
  const totaal = kaart.bedrag ?? b.product.prijs * b.aantal;
  const winkel = b.product.bron === "winkel";
  return (
    <div className="flex flex-col gap-3 rounded-3xl border border-lijn p-4">
      <div className="flex items-start justify-between gap-3">
        <span className="flex min-w-0 flex-col">
          <span className="font-medium">{b.aantal > 1 ? `${b.aantal}× ` : ""}{b.product.titel}</span>
          <span className="text-[13px] text-rustig">
            {b.product.verkoper} · {LEVERING[b.levering] ?? b.levering}{winkel ? "" : ` · ${BETAALWIJZE[b.betaalwijze] ?? b.betaalwijze}`}
          </span>
        </span>
        <span className="shrink-0 font-semibold">{euro(totaal)}</span>
      </div>
      {kaart.status === "besteld" ? (
        <p className="flex items-start gap-2 text-[15px]">
          <Vinkje className="mt-0.5 size-5 shrink-0 text-accent" />
          <span>{winkel ? "Besteld. Afrekenen doe je bij Bestellingen in de huidige app." : "Verzoek verstuurd. De verkoper laat weten of het doorgaat."}
            {" "}<a href={OUDE_APP} target="_top" className="font-medium text-accent">Naar Bestellingen</a></span>
        </p>
      ) : (
        <>
          {kaart.fout && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{kaart.fout}</p>}
          <button onClick={bestel} disabled={kaart.status === "bezig"}
            className="h-11 rounded-full bg-accent font-medium text-white disabled:opacity-50">
            {kaart.status === "bezig" ? "Bezig…" : winkel ? `Bestellen · ${euro(totaal)}` : "Koopverzoek sturen"}
          </button>
          <p className="text-center text-xs text-zacht">
            {winkel ? (b.levering === "verzenden" ? "Verzendkosten komen er eventueel bij. " : "") + "Er gaat pas iets weg als je tikt."
              : "De verkoper moet het eerst accepteren. Er gaat pas iets weg als je tikt."}
          </p>
        </>
      )}
    </div>
  );
}

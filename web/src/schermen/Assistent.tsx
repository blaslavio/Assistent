import type Anthropic from "@anthropic-ai/sdk";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Staat } from "../App";
import { Herstel, Kalender, Microfoon, Pijl, Plus, Vinkje, Vonk } from "../iconen";
import { antwoord, ongedaanMaken, verbinding, zonderLabels, type Actie } from "../lib/assistent";
import { Opmaak } from "../lib/opmaak";

type Beurt = { wie: "jij" | "assistent"; tekst: string; acties: Actie[]; fout?: boolean };

// Het gesprek blijft bewaard zolang dit tabblad open is, ook als je even naar Vandaag gaat. Niet op het apparaat.
const gesprek: { beurten: Beurt[]; berichten: Anthropic.MessageParam[] } = { beurten: [], berichten: [] };

const VOORBEELDEN = ["Wat staat er vandaag?", "Plan morgen een uur voor mijn taken", "Zet vrijdag 19:00 etentje met Sanne",
  "Wat is er dit weekend te doen?"];

type Herkenning = {
  lang: string; interimResults: boolean; continuous: boolean; start(): void; stop(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null; onerror: (() => void) | null;
};
const Spraak = (window as unknown as { SpeechRecognition?: new () => Herkenning; webkitSpeechRecognition?: new () => Herkenning })
  .SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: new () => Herkenning }).webkitSpeechRecognition;

type Props = { staat: Staat; vernieuw: () => void };

export default function Assistent({ staat, vernieuw }: Props) {
  const [beurten, setBeurten] = useState<Beurt[]>(gesprek.beurten);
  const [invoer, setInvoer] = useState("");
  const [bezig, setBezig] = useState<string | null>(null);
  const [luistert, setLuistert] = useState(false);
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

  async function vraag(tekst: string) {
    const vraag = tekst.trim();
    if (!vraag || bezig) return;
    setInvoer("");
    if (veld.current) veld.current.style.height = "auto";
    const client = await verbinding(staat.data);
    const plek = beurten.length + 1;
    setBeurten((l) => [...l, { wie: "jij", tekst: vraag, acties: [] }, { wie: "assistent", tekst: "", acties: [] }]);
    if (!client) {
      wijzig(plek, (b) => ({ ...b, fout: true, tekst: "De assistent staat nog uit. Zet hem aan in de huidige app bij "
        + "Instellingen › Assistent, met je eigen sleutel of een abonnement." }));
      return;
    }
    setBezig("Denkt na");
    stoppen.current = new AbortController();
    const voor = gesprek.berichten.length;
    gesprek.berichten.push({ role: "user", content: vraag });
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
      }, stoppen.current.signal);
      if (slot) wijzig(plek, (b) => ({ ...b, tekst: (zonderLabels(ruw) + "\n\n" + slot).trim() }));
      else if (!ruw.trim()) wijzig(plek, (b) => ({ ...b, tekst: b.acties.length ? "" : "Klaar." }));
    } catch (e) {
      if (!stoppen.current?.signal.aborted) {
        // Een gesprek dat halverwege afbrak, sturen we niet opnieuw mee: dan blijft het geldig.
        gesprek.berichten.length = voor;
        const status = (e as { status?: number }).status;
        wijzig(plek, (b) => ({ ...b, fout: true, tekst: status === 429
          ? "Je hebt deze maand je ruimte voor de assistent gebruikt, of het is even te druk. Probeer het later opnieuw."
          : status === 401 ? "Log opnieuw in om verder te praten." : "De assistent is even niet bereikbaar. Probeer het zo opnieuw." }));
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
      gesprek.berichten.push(
        { role: "user", content: `(De gebruiker heeft "${a.titel}" ongedaan gemaakt met de knop.)` },
        { role: "assistant", content: "Begrepen." });
      vernieuw();
    } catch {
      wijzig(i, (b) => ({ ...b, acties: b.acties.map((x, k) => (k === j ? { ...x, teruggedraaid: false } : x)) }));
    }
  }

  function nieuw() {
    stoppen.current?.abort();
    gesprek.berichten = [];
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
            <p key={i} className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-[22px] rounded-br-md bg-accent px-4 py-2.5 text-white">
              {b.tekst}
            </p>
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

      <form onSubmit={verstuur} className="sticky bottom-0 bg-white px-4 pb-3 pt-2 dark:bg-[#0b0b0e]">
        <div className={`flex items-end gap-2 rounded-[26px] bg-vlak py-1.5 pr-1.5 pl-5 ${luistert ? "ring-2 ring-accent" : ""}`}>
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
          ) : invoer.trim() || !Spraak ? (
            <button aria-label="Versturen" disabled={!invoer.trim()}
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

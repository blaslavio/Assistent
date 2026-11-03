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
import { BETAALWIJZE, LEVERING, bestellen, euro, onthouden, type Bestelling, type Product } from "../lib/winkelen";
import { BestelKaart, type Bestelkaart } from "./BestelKaart";
import { Bladen, ProductRij, type Blad } from "./Winkelen";

type Beurt = { wie: "jij" | "assistent"; tekst: string; acties: Actie[]; fout?: boolean; opnieuw?: Herhaling; keuze?: Keuze;
  gekozen?: number;
  producten?: Product[]; bestellingen?: Bestelkaart[]; bijlagen?: { naam: string; soort: Bijlagebestand["soort"] }[];
  grafieken?: Grafiek[] };

type Herhaling = { vraag: string; gekozen?: string; bijlagen: Bijlagebestand[]; vanJou: boolean };

const CONCEPT = "assistent.concept";
const conceptLezen = () => { try { return sessionStorage.getItem(CONCEPT) ?? ""; } catch { return ""; } };
const conceptBewaren = (t: string) => { try { if (t) sessionStorage.setItem(CONCEPT, t); else sessionStorage.removeItem(CONCEPT); } catch { /* privé */ } };

const gesprek: { id: string; beurten: Beurt[]; berichten: Anthropic.MessageParam[]; gebruikt: number } =
  { id: nieuwId(), beurten: [], berichten: [], gebruikt: 0 };

function voorstellen(nu = new Date()): string[] {
  const uur = nu.getHours();
  const dag = nu.getDay();
  const lijst = uur < 11 ? ["Plan mijn dag tussen mijn afspraken door", "Wat staat er vandaag?"]
    : uur < 17 ? ["Wat moet ik vandaag nog doen?", "Zoek een lunchplek in de buurt"]
    : ["Wat staat er morgen?", "Zet morgen een uur vrij voor mijn taken"];
  if (dag >= 4) lijst.push("Wat is er dit weekend te doen?");
  return [...lijst, "Hoeveel heb ik deze maand uitgegeven?", "Zoek een tweedehands fiets onder de 150 euro",
    "Maak een boodschappenlijst voor het weekend"];
}

type Props = {
  staat: Staat;
  vernieuw: () => Promise<void>;
  teKopen?: Product[];
  gekocht?: () => void;
  vooraf?: string;
  voorafGebruikt?: () => void;
  naarBestellingen?: () => void;
  sluit?: () => void;
};

export default function Assistent({
  staat, vernieuw, teKopen, gekocht, vooraf, voorafGebruikt, naarBestellingen, sluit,
}: Props) {
  const actief = useSchermActief();
  const [tekst, setTekst] = useState(conceptLezen);
  const [beurten, setBeurten] = useState<Beurt[]>(gesprek.beurten);
  const [bezig, setBezig] = useState(false);
  const [stemming, setStemming] = useState<Stemming>("rustig");
  const [bladen, setBladen] = useState<Blad[]>([]);
  const [bijlagen, setBijlagen] = useState<Bijlagebestand[]>([]);
  const [mail, setMail] = useState(false);
  const [geschiedenis, setGeschiedenis] = useState(false);
  const onder = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (teKopen?.length) {
      setBladen([{ soort: "product", p: teKopen[0] }]);
    }
  }, [teKopen]);

  useEffect(() => {
    if (vooraf && vooraf.trim()) {
      void praat(vooraf.trim());
      voorafGebruikt?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    conceptBewaren(tekst);
  }, [tekst]);

  useEffect(() => {
    if (actief) onder.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [beurten, bezig, actief]);

  function toon(beurt: Beurt) {
    gesprek.beurten = [...gesprek.beurten, beurt];
    setBeurten(gesprek.beurten);
  }

  async function praat(vraag: string, gekozen?: string, bestanden: Bijlagebestand[] = []) {
    if (bezig) return;
    setBezig(true);
    setStemming("denkt");
    const vanJou = !gekozen;
    if (vanJou) {
      toon({
        wie: "jij",
        tekst: vraag,
        acties: [],
        bijlagen: bestanden.map((b) => ({ naam: b.naam, soort: b.soort })),
      });
    }
    try {
      const r = await antwoord(gesprek.berichten, vraag, gekozen, bestanden, gesprek.gebruikt);
      gesprek.berichten = r.berichten;
      gesprek.gebruikt = r.gebruikt;
      const producten = r.producten ?? [];
      const bestellingen: Bestelkaart[] = (r.bestellingen ?? []).map((b) => ({
        b,
        status: "klaar" as const,
      }));
      toon({
        wie: "assistent",
        tekst: r.tekst,
        acties: r.acties ?? [],
        keuze: r.keuze,
        producten: producten.length ? producten : undefined,
        bestellingen: bestellingen.length ? bestellingen : undefined,
        grafieken: r.grafieken,
      });
      setStemming(r.stemming ?? "rustig");
      if (bewarenAan()) {
        void bewaar(gesprek.id, alsBerichten(gesprek.beurten));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Dat lukte niet.";
      toon({
        wie: "assistent",
        tekst: msg === GEEN_INTERNET ? "Geen verbinding. Probeer het zo opnieuw." : msg,
        acties: [],
        fout: true,
        opnieuw: { vraag, gekozen, bijlagen: bestanden, vanJou },
      });
      setStemming("sorry");
    } finally {
      setBezig(false);
    }
  }

  async function verstuur(e?: FormEvent) {
    e?.preventDefault();
    const v = tekst.trim();
    if (!v && !bijlagen.length) return;
    setTekst("");
    const files = bijlagen;
    setBijlagen([]);
    await praat(v || "(bijlage)", undefined, files);
  }

  async function bestel(beurtIndex: number, kaartIndex: number) {
    const beurt = gesprek.beurten[beurtIndex];
    const kaarten = beurt?.bestellingen;
    if (!kaarten?.[kaartIndex]) return;
    const kaart = kaarten[kaartIndex];
    kaarten[kaartIndex] = { ...kaart, status: "bezig" };
    setBeurten([...gesprek.beurten]);
    try {
      await bestellen(kaart.b);
      kaarten[kaartIndex] = { ...kaart, status: "besteld" };
      setBeurten([...gesprek.beurten]);
      gekocht?.();
    } catch (e) {
      kaarten[kaartIndex] = {
        ...kaart,
        status: "klaar",
        fout: e instanceof Error ? e.message : "Bestellen lukte niet.",
      };
      setBeurten([...gesprek.beurten]);
    }
  }

  function openProduct(p: Product) {
    setBladen([{ soort: "product", p }]);
  }

  async function bestelProduct(p: Product) {
    setBladen([]);
    await praat(`Ik wil ${p.titel} ${p.bron === "winkel" ? "bestellen" : "kopen"}.`);
  }

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-10 flex items-center gap-2 bg-white/90 px-3 pt-3 pb-2 backdrop-blur dark:bg-[#0b0b0e]/90">
        {sluit && (
          <button type="button" onClick={sluit} aria-label="Sluiten" className="flex size-10 items-center justify-center rounded-full text-rustig hover:bg-vlak">
            <Kruis className="size-5" />
          </button>
        )}
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="font-semibold">Assistent</span>
          <span className="text-[13px] text-rustig">Vraag wat je wilt regelen</span>
        </span>
        <InstellingenKnop />
        <button type="button" onClick={() => setGeschiedenis(true)} className="text-sm font-medium text-accent">Gesprekken</button>
      </header>

      <div className="flex flex-1 flex-col gap-4 px-4 pb-4 pt-2">
        {!beurten.length && (
          <div className="flex flex-col items-center gap-4 py-8">
            <Mascotte stemming={stemming} />
            <p className="text-center text-[15px] text-rustig">Waarmee kan ik helpen?</p>
            <div className="flex max-w-md flex-wrap justify-center gap-2">
              {voorstellen().slice(0, 4).map((v) => (
                <button key={v} type="button" onClick={() => void praat(v)} className="rounded-full bg-vlak px-4 py-2 text-sm">
                  {v}
                </button>
              ))}
            </div>
          </div>
        )}

        <ul className="flex flex-col gap-4">
          {beurten.map((b, i) => (
            <li key={i} className={`flex flex-col gap-2 ${b.wie === "jij" ? "items-end" : "items-start"}`}>
              <div className={`max-w-[92%] rounded-3xl px-4 py-2.5 text-[15px] leading-relaxed ${
                b.wie === "jij" ? "bg-accent text-white" : "bg-vlak"
              }`}>
                <Opmaak tekst={b.tekst} />
              </div>
              {b.producten && b.producten.length > 0 && (
                <div className="w-full max-w-md">
                  <ProductRij producten={b.producten} open={openProduct} />
                </div>
              )}
              {b.bestellingen?.map((k, j) => (
                <div key={j} className="w-full max-w-md">
                  <BestelKaart
                    kaart={k}
                    bestel={() => void bestel(i, j)}
                    naarBestellingen={naarBestellingen}
                  />
                </div>
              ))}
              {b.keuze && (
                <KeuzeKaart keuze={b.keuze} gekozen={b.gekozen} kies={(id) => void praat(b.tekst, id)} />
              )}
              {b.grafieken?.map((g, gi) => (
                <div key={gi} className="w-full max-w-md">
                  <GrafiekKaart grafiek={g} />
                </div>
              ))}
              {b.fout && b.opnieuw && (
                <button
                  type="button"
                  className="flex items-center gap-1 text-sm text-accent"
                  onClick={() => void praat(b.opnieuw!.vraag, b.opnieuw!.gekozen, b.opnieuw!.bijlagen)}
                >
                  <Herstel className="size-[18px]" /> Opnieuw proberen
                </button>
              )}
            </li>
          ))}
          {bezig && (
            <li className="flex items-center gap-2 text-sm text-rustig">
              <Mascotte stemming="denkt" compact />
              <span className="bezig-tekst">Even nadenken…</span>
            </li>
          )}
        </ul>
        <div ref={onder} />
      </div>

      <form onSubmit={(e) => void verstuur(e)} className="sticky bottom-0 border-t border-lijn bg-white px-3 py-2 dark:bg-[#0b0b0e]">
        <div className="mx-auto flex max-w-xl items-end gap-2">
          <textarea
            ref={input}
            value={tekst}
            onChange={(e) => setTekst(e.target.value)}
            rows={1}
            placeholder="Stel een vraag…"
            className="max-h-32 min-h-11 flex-1 resize-none rounded-2xl bg-vlak px-4 py-2.5 outline-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void verstuur();
              }
            }}
          />
          <button
            type="submit"
            disabled={bezig || (!tekst.trim() && !bijlagen.length)}
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent text-white disabled:opacity-40"
            aria-label="Versturen"
          >
            <Pijl className="size-5" />
          </button>
        </div>
      </form>

      {bladen.length > 0 && (
        <Bladen stapel={bladen} zet={setBladen} bestel={bestelProduct} />
      )}
      {geschiedenis && (
        <Gesprekken
          sluit={() => setGeschiedenis(false)}
          open={(id, berichten) => {
            gesprek.id = id;
            gesprek.beurten = [];
            gesprek.berichten = berichten;
            gesprek.gebruikt = 0;
            setBeurten([]);
            setGeschiedenis(false);
          }}
        />
      )}
      {mail && <Opstellen sluit={() => setMail(false)} />}
    </div>
  );
}

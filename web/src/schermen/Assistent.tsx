import InstellingenKnop from "./InstellingenKnop";
import type Anthropic from "@anthropic-ai/sdk";
import { useSchermActief } from "./BewaarScherm";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Staat } from "../App";
import { Opstellen } from "./MailOpstellen";
import { Herstel, Kruis, Pijl } from "../iconen";
import { GrafiekKaart, type Grafiek } from "../grafiek";
import type { Bijlage as Bijlagebestand } from "../lib/bijlagen";
import { antwoord, gebruikerBeurt, notitie, verbinding, zonderLabels, type Actie, type Keuze } from "../lib/assistent";
import { KeuzeKaart } from "../keuzekaart";
import { Mascotte, type Stemming } from "../mascotte";
import { alsBerichten, bewaar, bewarenAan, nieuwId, schoon } from "../lib/geschiedenis";
import { Gesprekken } from "./Gesprekken";
import { Opmaak } from "../lib/opmaak";
import { GEEN_INTERNET } from "../lib/net";
import { bestellen, euro, onthouden, type Product } from "../lib/winkelen";
import { BestelKaart, type Bestelkaart } from "./BestelKaart";
import { Bladen, ProductRij, type Blad } from "./Winkelen";

type Beurt = {
  wie: "jij" | "assistent";
  tekst: string;
  acties: Actie[];
  fout?: boolean;
  opnieuw?: Herhaling;
  keuze?: Keuze;
  gekozen?: number;
  producten?: Product[];
  bestellingen?: Bestelkaart[];
  bijlagen?: { naam: string; soort: Bijlagebestand["soort"] }[];
  grafieken?: Grafiek[];
};

type Herhaling = { vraag: string; gekozen?: string; bijlagen: Bijlagebestand[]; vanJou: boolean };

const CONCEPT = "assistent.concept";
const conceptLezen = () => { try { return sessionStorage.getItem(CONCEPT) ?? ""; } catch { return ""; } };
const conceptBewaren = (t: string) => {
  try { if (t) sessionStorage.setItem(CONCEPT, t); else sessionStorage.removeItem(CONCEPT); } catch { /* privé */ }
};

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

type Props = {
  staat: Staat;
  vernieuw: () => void;
  teKopen?: Product | null;
  gekocht?: () => void;
  vooraf?: string;
  voorafGebruikt?: () => void;
  naarBestellingen?: () => void;
  sluit?: () => void;
};

export default function Assistent({
  staat, vernieuw, teKopen, gekocht, vooraf, voorafGebruikt, naarBestellingen, sluit,
}: Props) {
  const schermActief = useSchermActief();
  const [beurten, setBeurten] = useState<Beurt[]>(gesprek.beurten);
  const [invoer, setInvoer] = useState(conceptLezen);
  useEffect(() => conceptBewaren(invoer), [invoer]);
  const [bezig, setBezig] = useState<string | null>(null);
  const [klaarNr, setKlaarNr] = useState(0);
  const [geschiedenis, setGeschiedenis] = useState(false);
  const stemming: Stemming = bezig ? "denkt" : invoer.trim() ? "kijkt" : "wacht";
  const [hup, setHup] = useState(0);
  const [voorstelNr, setVoorstelNr] = useState(0);
  const [lijstVoorstellen] = useState(voorstellen);
  const voorstel = lijstVoorstellen[voorstelNr % lijstVoorstellen.length];
  const [bladen, setBladen] = useState<Blad[]>([]);
  const onder = useRef<HTMLDivElement>(null);
  const veld = useRef<HTMLTextAreaElement>(null);
  const stoppen = useRef<AbortController | null>(null);

  useEffect(() => {
    gesprek.beurten = beurten;
    if (schermActief) onder.current?.scrollIntoView?.({ block: "end" });
  }, [beurten, bezig, schermActief]);
  useEffect(() => () => stoppen.current?.abort(), []);

  useEffect(() => {
    if (!klaarNr || !bewarenAan(staat.data)) return;
    bewaar(gesprek.id, schoon(beurten)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [klaarNr]);

  function wijzig(i: number, aanpassen: (b: Beurt) => Beurt) {
    setBeurten((lijst) => lijst.map((b, j) => (j === i ? aanpassen(b) : b)));
  }

  function vraag(tekst: string) {
    const v = tekst.trim();
    if (!v || bezig) return;
    setInvoer("");
    if (veld.current) veld.current.style.height = "auto";
    void praat(v);
  }

  function koop(p: Product) {
    if (bezig) return;
    setBladen([]);
    onthouden(p);
    notitie(
      `De gebruiker tikte op ${p.bron === "winkel" ? "Bestellen" : "Kopen"} bij ${p.titel} (${euro(p.prijs)}). `
      + "Vraag alleen wat nog ontbreekt en zet het dan klaar.",
    );
    void praat(`Ik wil ${p.titel} ${p.bron === "winkel" ? "bestellen" : "kopen"}.`);
  }

  useEffect(() => {
    if (!teKopen || bezig) return;
    gekocht?.();
    koop(teKopen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teKopen]);

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
    setBeurten((l) => [
      ...l,
      ...(vanJou
        ? [{
            wie: "jij" as const,
            tekst: vraagTekst,
            acties: [] as Actie[],
            bijlagen: bijlagen.map(({ naam, soort }) => ({ naam, soort })),
          }]
        : []),
      { wie: "assistent" as const, tekst: "", acties: [] as Actie[] },
    ]);
    if (!client) {
      wijzig(plek, (b) => ({
        ...b,
        fout: true,
        tekst: "De assistent staat nog uit. Zet hem aan bij Instellingen › Assistent, met je eigen sleutel.",
      }));
      return;
    }
    setBezig("Denkt na");
    stoppen.current = new AbortController();
    const terugzetten = gebruikerBeurt(
      gesprek.berichten,
      vraagTekst,
      gekozen,
      bijlagen.map((b) => b.blok),
    );
    const extra = bijlagen.reduce((n, b) => n + b.grootte, 0);
    gesprek.gebruikt += extra;
    let ruw = "";
    let veranderd = false;
    try {
      const slot = await antwoord(
        client,
        gesprek.berichten,
        staat.data,
        {
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
          bestelling: (x) =>
            wijzig(plek, (b) => ({
              ...b,
              bestellingen: [...(b.bestellingen ?? []), { b: x, status: "klaar" }],
            })),
          grafiek: (g) =>
            wijzig(plek, (b) => ({ ...b, grafieken: [...(b.grafieken ?? []), g] })),
        },
        stoppen.current.signal,
      );
      if (slot) {
        wijzig(plek, (b) => ({ ...b, tekst: (zonderLabels(ruw) + "\n\n" + slot).trim() }));
      } else if (!ruw.trim()) {
        wijzig(plek, (b) => ({
          ...b,
          tekst:
            b.acties.length || b.keuze || b.producten || b.bestellingen || b.grafieken
              ? ""
              : "Klaar.",
        }));
      }
    } catch (e) {
      if (!stoppen.current?.signal.aborted) {
        terugzetten();
        gesprek.gebruikt -= extra;
        const status = (e as { status?: number }).status;
        const herhaling =
          status === 401 || status === 413
            ? undefined
            : { vraag: vraagTekst, gekozen, bijlagen, vanJou };
        wijzig(plek, (b) => ({
          ...b,
          fout: true,
          opnieuw: herhaling,
          tekst:
            navigator.onLine === false
              ? GEEN_INTERNET
              : status === 429
                ? "Je hebt deze maand je ruimte voor de assistent gebruikt, of het is even te druk. Probeer het later opnieuw."
                : status === 401
                  ? "Log opnieuw in om verder te praten."
                  : status === 413
                    ? "Dat is te veel in één keer. Begin een nieuw gesprek of stuur een kleiner bestand."
                    : "De assistent is even niet bereikbaar. Probeer het zo opnieuw.",
        }));
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
    void praat(h.vraag, h.gekozen, h.bijlagen);
  }

  async function bestel(i: number, j: number) {
    const kaart = beurten[i].bestellingen?.[j];
    if (!kaart || kaart.status !== "klaar") return;
    const zet = (k: Partial<Bestelkaart>) =>
      wijzig(i, (b) => ({
        ...b,
        bestellingen: b.bestellingen!.map((x, n) => (n === j ? { ...x, ...k } : x)),
      }));
    zet({ status: "bezig", fout: undefined });
    try {
      const r = await bestellen(kaart.b);
      zet({ status: "besteld", bedrag: r.bedrag });
      notitie(
        `De gebruiker heeft "${kaart.b.product.titel}" besteld met de knop (bestelling ${r.id}, ${euro(r.bedrag)}).`,
      );
    } catch (e) {
      zet({
        status: "klaar",
        fout: e instanceof Error ? e.message : "Bestellen lukte niet.",
      });
    }
  }

  function verstuur(e: FormEvent) {
    e.preventDefault();
    vraag(invoer);
  }

  const leeg = beurten.length === 0;

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-10 flex items-center gap-2 bg-white/90 px-3 pt-3 pb-2 backdrop-blur dark:bg-[#0b0b0e]/90">
        {sluit && (
          <button
            type="button"
            onClick={sluit}
            aria-label="Sluiten"
            className="flex size-10 items-center justify-center rounded-full text-rustig hover:bg-vlak"
          >
            <Kruis className="size-5" />
          </button>
        )}
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="font-semibold">Assistent</span>
          <span className="text-[13px] text-rustig">Vraag wat je wilt regelen</span>
        </span>
        <InstellingenKnop />
        <button
          type="button"
          onClick={() => setGeschiedenis(true)}
          className="text-sm font-medium text-accent"
        >
          Gesprekken
        </button>
      </header>

      {leeg ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 py-10">
          <button
            type="button"
            onClick={() => {
              setHup((h) => h + 1);
              setVoorstelNr((n) => n + 1);
            }}
            aria-label="Ander voorstel"
          >
            <Mascotte className="h-20 w-16" hup={hup} stemming={stemming} />
          </button>
          <p className="text-center text-[15px] text-rustig">Waarmee kan ik helpen?</p>
          <button
            type="button"
            onClick={() => vraag(voorstel)}
            className="max-w-sm rounded-full bg-vlak px-5 py-2.5 text-sm"
          >
            {voorstel}
          </button>
        </div>
      ) : (
        <main className="flex flex-1 flex-col gap-4 px-4 pb-4 pt-2">
          {beurten.map((b, i) => (
            <div
              key={i}
              className={`flex flex-col gap-2 ${b.wie === "jij" ? "items-end" : "items-start"}`}
            >
              {(b.tekst || b.wie === "jij") && (
                <div
                  className={`max-w-[92%] rounded-3xl px-4 py-2.5 text-[15px] leading-relaxed ${
                    b.wie === "jij" ? "bg-accent text-white" : "bg-vlak"
                  }`}
                >
                  <Opmaak tekst={b.tekst} />
                </div>
              )}
              {b.fout && b.opnieuw && (
                <button
                  type="button"
                  onClick={() => opnieuw(i)}
                  className="self-start rounded-full bg-vlak px-4 py-2 text-sm font-medium"
                >
                  Opnieuw proberen
                </button>
              )}
              {b.grafieken?.map((g, j) => <GrafiekKaart key={j} g={g} />)}
              {b.producten && (
                <div className="w-full max-w-md">
                  <ProductRij
                    producten={b.producten}
                    open={(p) => setBladen([{ soort: "product", p }])}
                  />
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
                <KeuzeKaart
                  keuze={b.keuze}
                  gekozen={b.gekozen}
                  kies={(j) => kies(i, j)}
                  open={i === beurten.length - 1 && !bezig && b.gekozen === undefined}
                />
              )}
              {i === beurten.length - 1 && bezig && (
                <p className="flex items-center gap-2 text-[15px] text-rustig">
                  <span className="bezig-tekst">{bezig}</span>
                </p>
              )}
            </div>
          ))}
          <div ref={onder} />
        </main>
      )}

      <Bladen stapel={bladen} zet={setBladen} bestel={koop} />
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
          huidig={leeg ? undefined : gesprek.id}
        />
      )}

      <form
        onSubmit={verstuur}
        className="sticky bottom-0 border-t border-lijn bg-white px-3 py-2 dark:bg-[#0b0b0e]"
      >
        <div className="mx-auto flex max-w-xl items-end gap-2">
          <textarea
            ref={veld}
            value={invoer}
            onChange={(e) => setInvoer(e.target.value)}
            rows={1}
            placeholder="Stel een vraag…"
            className="max-h-32 min-h-11 flex-1 resize-none rounded-2xl bg-vlak px-4 py-2.5 outline-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                vraag(invoer);
              }
            }}
          />
          <button
            type="submit"
            disabled={!!bezig || !invoer.trim()}
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent text-white disabled:opacity-40"
            aria-label="Versturen"
          >
            <Pijl className="size-5" />
          </button>
        </div>
      </form>
    </div>
  );
}

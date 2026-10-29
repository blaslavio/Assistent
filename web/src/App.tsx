import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { GeenToegang, adresOpruimen, adresWaarde, gegevensLaden, huidigeSessie, momentopnameBewaren, opstarten, overstappen,
  type Staat } from "./api";
import { openVragen } from "./lib/bestellingen";
import { winkelVragen } from "./lib/mijnwinkel";
import { Ballon, Kalender, Tandwiel, Vonk, Zon } from "./iconen";
import Inloggen from "./schermen/Inloggen";
import Vandaag from "./schermen/Vandaag";
import { weergaveToepassen, type Weergave } from "./schermen/Algemeen";
import type { Bestemming } from "./lib/naar";
import { MascotteFeest } from "./mascotte";
import type { OnderdeelNaam } from "./lib/onderdeel-lijst";
import BelLaag from "./schermen/Bellen";
import { luisteren } from "./lib/bellen";
import { startenAlsBekend } from "./lib/chat";
import type { Product } from "./lib/winkelen";
import { deelCode } from "./lib/delen";
import { boekAdres, boekingCode, verwerken } from "./lib/gasten";
import { prikCode } from "./lib/prikken";
import { Vangnet } from "./vangnet";

// Een gedeelde link (?deel=...) opent een pagina die je zonder inloggen kunt zien.
const GEDEELD = deelCode();
// Afspraak maken zonder account (?boek=linknaam) en de eigen pagina van de gast (?boeking=code).
const BOEK = boekAdres();
const BOEKING = boekingCode();
// Stemmen op een datum via een gedeelde link (?prik=code), ook zonder account.
const PRIK = prikCode();

// Terug van betalen bij Stripe (?betaald=...): meteen naar je bestellingen.
const BETAALD = adresWaarde("betaald");
// Siri (app Opdrachten) opent de app met ?zeg=wat je zei: dat gaat naar de assistent.
const ZEG = (adresWaarde("zeg") ?? "").trim().slice(0, 500);
// Een gedeelde winkellink (?winkel=adres): die winkel opent in Chat › Winkel.
const WINKEL = winkelVragen(adresWaarde("winkel") ?? "");
adresOpruimen("betaald", "zeg", "ochtend", "winkel");
if (BETAALD !== null) openVragen(BETAALD === "0" ? "Betalen is afgebroken. Je kunt het opnieuw proberen."
  : "Gelukt. Je betaling is binnen en het geld staat vast tot je bevestigt dat alles goed is.");
// Alleen Vandaag zit in het eerste stuk van de app. De andere schermen komen los, en worden opgehaald zodra de app
// even niets te doen heeft, zodat ze klaarstaan voordat je erop tikt. Claude laden we pas als je de assistent opent.
const laden = {
  agenda: () => import("./schermen/Agenda"),
  chat: () => import("./schermen/Chat"),
  instellingen: () => import("./schermen/Instellingen"),
};
const Agenda = lazy(laden.agenda);
const Chat = lazy(laden.chat);
const Instellingen = lazy(laden.instellingen);
const Assistent = lazy(() => import("./schermen/Assistent"));
const GedeeldScherm = lazy(() => import("./schermen/Delen").then((m) => ({ default: m.GedeeldScherm })));
const GastScherm = lazy(() => import("./schermen/Gasten").then((m) => ({ default: m.GastScherm })));
const BoekScherm = lazy(() => import("./schermen/Gasten").then((m) => ({ default: m.BoekScherm })));
const PrikScherm = lazy(() => import("./schermen/Prikken").then((m) => ({ default: m.PrikScherm })));

function vooraf() {
  const doe = () => Object.values(laden).forEach((l) => l().catch(() => {}));
  const w = window as Window & { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => void };
  if (w.requestIdleCallback) w.requestIdleCallback(doe, { timeout: 2500 });
  else setTimeout(doe, 1200);
}

export type Tab = "vandaag" | "agenda" | "chat" | "assistent" | "instellingen";

const TABS: { id: Tab; naam: string; Icoon: typeof Zon }[] = [
  { id: "vandaag", naam: "Vandaag", Icoon: Zon },
  { id: "agenda", naam: "Agenda", Icoon: Kalender },
  { id: "chat", naam: "Chat", Icoon: Ballon },
  { id: "assistent", naam: "Assistent", Icoon: Vonk },
  { id: "instellingen", naam: "Instellingen", Icoon: Tandwiel },
];

export type { Staat };

export default function App() {
  const [klaar, setKlaar] = useState(false);
  const [staat, setStaat] = useState<Staat | null>(null);
  const [tab, setTabRuw] = useState<Tab>(BETAALD !== null || WINKEL ? "chat" : ZEG ? "assistent" : "vandaag");
  const [voorafVraag, setVooraf] = useState(ZEG);
  const [vorige, setVorige] = useState<Tab>("vandaag");
  const [teKopen, setTeKopen] = useState<Product | null>(null);
  const [fout, setFout] = useState("");
  // De vorige stand staat op het scherm terwijl het inloggen nog loopt (of zonder verbinding).
  const [voorlopig, setVoorlopig] = useState(false);

  const [voorChat, setVoorChat] = useState<Tab>("vandaag");
  // Een onderdeel dat je via "Je apps" opent; het getal laat Instellingen weten dat het opnieuw gevraagd is.
  const [startOnderdeel, setStartOnderdeel] = useState<{ naam: OnderdeelNaam; n: number } | null>(null);
  const setTab = (t: Tab) => {
    if (t === "instellingen") setVorige(tab === "instellingen" ? vorige : tab);
    else setStartOnderdeel(null);
    if (t === "chat" && tab !== "chat") setVoorChat(tab);
    setTabRuw(t);
  };

  const herladen = useCallback(async () => {
    try {
      setStaat(await gegevensLaden());
      setVoorlopig(false);
      setFout("");
      overstappen().catch(() => {});
    } catch (e) {
      if (e instanceof GeenToegang) setStaat(null);
      else setFout("Even geen verbinding. Probeer het zo opnieuw.");
    }
  }, []);

  // Bliksemstart: meteen de stand van de vorige keer, en zodra het inloggen met de sleutel van dit apparaat klaar is
  // de nieuwste. Zonder verbinding blijft de vorige stand staan en proberen we het opnieuw als je weer online bent.
  const starten = useCallback(() => {
    let vers = false;
    const { vorige, vers: nieuw } = opstarten();
    vorige.then((v) => {
      if (v && !vers) { setStaat((s) => s ?? v); setVoorlopig(true); setKlaar(true); }
    });
    nieuw.then((n) => {
      vers = true;
      if (n === "offline") {
        setFout("Even geen verbinding. Je ziet de stand van de vorige keer.");
        return vorige.then((v) => { if (!v) setFout("Even geen verbinding. Probeer het zo opnieuw."); });
      }
      setVoorlopig(false);
      setStaat(n);
      setFout("");
      if (n) overstappen().catch(() => {});
    }, () => { vers = true; setVoorlopig(false); setStaat(null); }).finally(() => setKlaar(true));
  }, []);

  useEffect(() => {
    starten();
    vooraf();
  }, [starten]);

  useEffect(() => {
    if (!fout || !klaar || huidigeSessie()) return;
    window.addEventListener("online", starten, { once: true });
    return () => window.removeEventListener("online", starten);
  }, [fout, klaar, starten]);

  // Wat je nu ziet, bewaren we versleuteld voor de volgende keer openen (alleen als je hier ingelogd blijft).
  useEffect(() => {
    if (!staat || !huidigeSessie()) return;
    const t = setTimeout(() => { momentopnameBewaren(staat).catch(() => {}); }, 800);
    return () => clearTimeout(t);
  }, [staat]);

  // Oproepen komen overal in de app binnen, als dit apparaat al eens in de chat was.
  const ingelogd = !!staat;
  useEffect(() => {
    if (!ingelogd) return;
    startenAlsBekend().then((id) => id && luisteren(id)).catch(() => {});
  }, [ingelogd]);

  // Nieuwe boekingen van gasten in je agenda zetten, als je een boekingspagina hebt.
  const boekpagina = !!staat?.data.instellingen?.boekpagina;
  useEffect(() => {
    if (boekpagina) verwerken().catch(() => {});
  }, [boekpagina]);

  // Vanuit een app in de app (chat, winkel) naar een ander deel van de app.
  useEffect(() => {
    const ga = (e: Event) => {
      const b = (e as CustomEvent<Bestemming>).detail;
      if (b.onderdeel) setStartOnderdeel((o) => ({ naam: b.onderdeel!, n: (o?.n ?? 0) + 1 }));
      setTab(b.tab);
    };
    window.addEventListener("app-naar", ga);
    return () => window.removeEventListener("app-naar", ga);
  });

  // Kleur, tekstgrootte en toegankelijkheid uit je instellingen op de hele app.
  const weergave = staat?.data.instellingen;
  useEffect(() => { weergaveToepassen((weergave ?? {}) as Weergave); }, [weergave]);

  if (GEDEELD) return <Suspense fallback={null}><GedeeldScherm code={GEDEELD} /></Suspense>;
  if (BOEKING) return <Suspense fallback={null}><GastScherm code={BOEKING} /></Suspense>;
  if (BOEK) return <Suspense fallback={null}><BoekScherm adres={BOEK} /></Suspense>;
  if (PRIK) return <Suspense fallback={null}><PrikScherm code={PRIK} /></Suspense>;
  if (!klaar) return <div className="h-full" />;
  // Tijdens de bliksemstart is er nog geen sessie, maar wel de vorige stand: die laten we alvast zien.
  if (!staat || (!huidigeSessie() && !voorlopig)) return <Inloggen opIngelogd={herladen} />;

  const scherm = {
    vandaag: <Vandaag staat={staat} setStaat={setStaat} naarInstellingen={() => setTab("instellingen")} ga={setTab}
      vraag={(t) => { setVooraf(t); setTab("assistent"); }} />,
    agenda: <Agenda staat={staat} setStaat={setStaat} />,
    chat: <Chat staat={staat} setStaat={setStaat} naarInstellingen={() => setTab("instellingen")}
      verlaat={() => setTab(voorChat)} terugNaam={TABS.find((t) => t.id === voorChat)?.naam}
      bestel={(p) => { setTeKopen(p); setTab("assistent"); }} />,
    assistent: <Assistent staat={staat} vernieuw={herladen} teKopen={teKopen}
      gekocht={() => setTeKopen(null)} vooraf={voorafVraag} voorafGebruikt={() => setVooraf("")}
      naarBestellingen={() => { openVragen(); setTab("chat"); }} />,
    instellingen: <Instellingen staat={staat} vernieuw={herladen} terug={() => setTab(vorige)} opUitgelogd={() => setStaat(null)}
      setStaat={setStaat} vraag={(t) => { setVooraf(t); setTab("assistent"); }} start={startOnderdeel}
      vorigeNaam={TABS.find((t) => t.id === vorige)?.naam} />,
  }[tab];

  return (
    <div className="mx-auto flex h-full max-w-xl flex-col">
      {fout && <p role="alert" className="bg-vlak px-6 py-3 text-sm text-rustig">{fout}</p>}
      <div className="flex-1 overflow-y-auto"><Vangnet key={tab} naam={tab}><Suspense fallback={null}>{scherm}</Suspense></Vangnet></div>
      <Vangnet naam="bellen" klein><BelLaag /></Vangnet>
      <MascotteFeest />
      {/* In de chat heeft de chat zijn eigen menu, zoals een aparte app; linksboven ga je terug. */}
      {tab !== "chat" && <nav aria-label="Hoofdmenu"
        className="flex shrink-0 justify-around border-t border-lijn pt-2.5 pb-[max(env(safe-area-inset-bottom),12px)]">
        {TABS.map(({ id, naam, Icoon }) => {
          const actief = tab === id;
          return (
            <button key={id} onClick={() => setTab(id)} aria-current={actief ? "page" : undefined}
              className={`flex min-w-14 flex-col items-center gap-1 text-[11px] ${actief ? "font-semibold text-inkt" : "text-zacht"}`}>
              <Icoon />
              {naam}
            </button>
          );
        })}
      </nav>}
    </div>
  );
}

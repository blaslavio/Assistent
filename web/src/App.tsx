import { ticketAdres } from "./lib/studio";
import { isExterneTerugkomst } from "./lib/externAanmelden";
import HoofdNavigatie from "./schermen/HoofdNavigatie";
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { GeenToegang, adresOpruimen, adresWaarde, gegevensLaden, huidigeSessie, momentopnameBewaren, opstarten, overstappen,
  type Staat } from "./api";
import { openVragen } from "./lib/bestellingen";
import { winkelVragen } from "./lib/mijnwinkel";
import { terugVanBank } from "./lib/bank";
import { cursusLinkVragen, terugVanCursus } from "./lib/cursus";
import { Ballon, Kalender, Persoon, Projectmap, Tandwiel, Vonk, Zon } from "./iconen";
import Inloggen from "./schermen/Inloggen";
import { useWerkplekken } from "./schermen/useWerkplekken";
import MijnDag from "./schermen/MijnDag";
import BewaarScherm from "./schermen/BewaarScherm";
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
import { terugkomst, vanzelf as sportVanzelf } from "./lib/sport";
import { profielAdres } from "./lib/profielpagina";
import { Vangnet } from "./vangnet";
import { useOnline } from "./lib/net";
import { eersteMinuutKlaar, track } from "./lib/platform-kern";
import { postGevraagd, postVragen } from "./lib/feed";
const PostBlad = lazy(() => import("./schermen/Feed").then((m) => ({ default: m.PostBlad })));
const EersteMinuut = lazy(() => import("./schermen/EersteMinuut"));
const GlobaalZoek = lazy(() => import("./schermen/GlobaalZoek"));

// Een gedeelde link (?deel=...) opent een pagina die je zonder inloggen kunt zien.
const EXTERN_TERUG = isExterneTerugkomst();
const GEDEELD = deelCode();
// Afspraak maken zonder account (?boek=linknaam) en de eigen pagina van de gast (?boeking=code).
const BOEK = boekAdres();
const PROFIEL = profielAdres();
// Terug van inloggen bij een sportapp (?state=gz....): meteen naar Sport en gezondheid, daar wordt het afgemaakt.
const SPORT_TERUG = !!terugkomst();
const TICKET_EVENT=ticketAdres();
const BOEKING = boekingCode();
// Stemmen op een datum via een gedeelde link (?prik=code), ook zonder account.
const PRIK = prikCode();

// Terug van betalen bij Stripe (?betaald=...): meteen naar je bestellingen in Chat.
const BETAALD = adresWaarde("betaald");
const CURSUS_TERUG = !!adresWaarde("cursus");

// Alleen Vandaag zit in het eerste stuk van de app. De andere schermen komen los, en worden opgehaald zodra de app
// rust heeft — of meteen als je ernaartoe navigeert.
const Assistent = lazy(() => import("./schermen/Assistent"));
const Chat = lazy(() => import("./schermen/Chat"));
const Werkruimte = lazy(() => import("./schermen/Werkruimte"));
const Instellingen = lazy(() => import("./schermen/Instellingen"));
const GedeeldScherm = lazy(() => import("./schermen/Delen").then(m => ({ default: m.GedeeldScherm })));
const GastScherm = lazy(() => import("./schermen/Gasten").then(m => ({ default: m.GastScherm })));
const BoekScherm = lazy(() => import("./schermen/Gasten").then(m => ({ default: m.BoekScherm })));
const ProfielScherm = lazy(() => import("./schermen/ProfielPagina").then(m => ({ default: m.default })));
const PrikScherm = lazy(() => import("./schermen/Prikken").then(m => ({ default: m.PrikScherm })));

const TABS = [
  { id: "vandaag" as const, naam: "Vandaag" },
  { id: "projecten" as const, naam: "Werkruimte" },
  { id: "chat" as const, naam: "Chat" },
  { id: "assistent" as const, naam: "Assistent" },
  { id: "instellingen" as const, naam: "Instellingen" },
];

function voorladen() {
  const verbinding = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (verbinding?.saveData || /(^|-)2g$/.test(verbinding?.effectiveType ?? "")) return () => {};
  const w = window as Window & { requestIdleCallback?: (cb: () => void) => number; cancelIdleCallback?: (id: number) => void };
  if (w.requestIdleCallback) {
    const id = w.requestIdleCallback(() => { void import("./schermen/Chat"); void import("./schermen/Werkruimte"); });
    return () => w.cancelIdleCallback?.(id);
  }
  const id = window.setTimeout(() => { void import("./schermen/Chat"); void import("./schermen/Werkruimte"); }, 1200);
  return () => clearTimeout(id);
}

export type { Staat };
export default function App() {
  const [staat, setStaat] = useState<Staat | null>(null);
  const [klaar, setKlaar] = useState(false);
  const [fout, setFout] = useState("");
  const [tab, setTabRuw] = useState<string>("vandaag");
  const [dagDeel, setDagDeel] = useState("vandaag");
  const [voorAssistent, setVoorAssistent] = useState("vandaag");
  const [voorChat, setVoorChat] = useState("vandaag");
  const [vorige, setVorige] = useState("vandaag");
  const [startOnderdeel, setStartOnderdeel] = useState<{ naam: OnderdeelNaam; n: number } | null>(null);
  const [werkGesprek, setWerkGesprek] = useState<{ id: number; ronde: number; gebruiker: number } | null>(null);
  const [voorafVraag, setVooraf] = useState("");
  const [teKopen, setTeKopen] = useState<Product | null>(null);
  const [ongelezen, setOngelezen] = useState(0);
  const [gedeeldePost, setGedeeldePost] = useState<number | null>(() => postGevraagd());
  const [toonEerste, setToonEerste] = useState(() => !eersteMinuutKlaar());
  const [toonZoek, setToonZoek] = useState(false);
  const [voorlopig, setVoorlopig] = useState(false);
  const online = useOnline();
  const tabRef = useRef(tab);
  tabRef.current = tab;
  const { gebruikWerkplek } = useWerkplekken(staat);

  const setTab = useCallback((t: string) => {
    setTabRuw((oud) => {
      if (oud === t) return oud;
      if (oud === "assistent") setVoorAssistent(t === "assistent" ? "vandaag" : t);
      if (t === "vandaag" || t === "agenda") setDagDeel(t);
      if (oud !== "instellingen") setVorige(oud);
      return t;
    });
  }, []);

  const herladen = useCallback(async () => {
    try {
      const s = await gegevensLaden();
      setStaat(s);
      setFout("");
      setVoorlopig(false);
      if (s) momentopnameBewaren(s);
    } catch (e) {
      if (e instanceof GeenToegang) {
        setStaat(null);
        setVoorlopig(false);
      } else setFout("Kon niet vernieuwen. Controleer je verbinding.");
    }
  }, []);

  const starten = useCallback(async () => {
    try {
      const s = await opstarten();
      setStaat(s);
      setFout("");
    } catch (e) {
      if (e instanceof GeenToegang) setStaat(null);
      else setFout("Opstarten mislukt.");
    } finally {
      setKlaar(true);
    }
  }, []);

  useEffect(() => {
    void starten();
    return voorladen();
  }, [starten]);

  useEffect(() => {
    if (!staat || SPORT_TERUG) return;
    sportVanzelf(staat.data).then((n) => { if (n) herladen(); }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!staat]);

  const ingelogd = !!staat;
  useEffect(() => {
    if (!ingelogd) return;
    startenAlsBekend().then((id) => id && luisteren(id)).catch(() => {});
  }, [ingelogd]);

  const boekpagina = !!staat?.data.instellingen?.boekpagina;
  useEffect(() => {
    if (boekpagina) verwerken().catch(() => {});
  }, [boekpagina]);

  useEffect(() => {
    const ga = (e: Event) => {
      const b = (e as CustomEvent<Bestemming>).detail;
      if (b.tab === "instellingen" && !b.onderdeel) setStartOnderdeel(null);
      if (b.onderdeel) setStartOnderdeel((o) => ({ naam: b.onderdeel!, n: (o?.n ?? 0) + 1 }));
      if (b.tab === "chat") setVoorChat(tabRef.current);
      setTab(b.onderdeel ? "projecten" : b.tab);
    };
    window.addEventListener("app-naar", ga);
    return () => window.removeEventListener("app-naar", ga);
  }, [setTab]);

  useLayoutEffect(() => { setOngelezen(0); }, [staat?.gebruiker.id]);
  const weergave = staat?.data.instellingen;
  useEffect(() => { weergaveToepassen((weergave ?? {}) as Weergave); }, [weergave]);

  useEffect(() => {
    if (staat) track("app_open");
  }, [staat?.gebruiker.id]);

  if (GEDEELD) return <Suspense fallback={null}><GedeeldScherm code={GEDEELD} /></Suspense>;
  if (BOEKING) return <Suspense fallback={null}><GastScherm code={BOEKING} /></Suspense>;
  if (BOEK) return <Suspense fallback={null}><BoekScherm adres={BOEK} /></Suspense>;
  if (PROFIEL) return <Suspense fallback={null}><ProfielScherm adres={PROFIEL} /></Suspense>;
  if (PRIK) return <Suspense fallback={null}><PrikScherm code={PRIK} /></Suspense>;
  if (!klaar) return <div className="h-full" />;
  if (!staat || (!huidigeSessie() && !voorlopig)) return <Inloggen opIngelogd={herladen} />;

  const openProject = (gesprek:number) => {gebruikWerkplek({soort:"project",gesprek});setWerkGesprek(oud => ({ id:gesprek,ronde:(oud?.ronde??0)+1,gebruiker:staat.gebruiker.id }));setTab("chat");};
  const scherm = {
    vandaag: <MijnDag staat={staat} setStaat={setStaat} deel={dagDeel} ga={setTab} vernieuw={herladen}
      naarProject={openProject} vraag={t=>{setVooraf(t);setTab("assistent");}} />,
    projecten: <Werkruimte gebruik={gebruikWerkplek} staat={staat} vernieuw={herladen} start={startOnderdeel} vraag={t=>{setVooraf(t);setTab("assistent");}}
      naarChat={()=>{setWerkGesprek(null);setTab("chat");}} openProject={openProject}/>,
    chat: <Chat key={staat.gebruiker.id} werkGesprek={werkGesprek} projectGeopend={id=>gebruikWerkplek({soort:"project",gesprek:id})} ongelezenGewijzigd={setOngelezen} staat={staat} setStaat={setStaat}
      verlaat={() => setTab(voorChat)} terugNaam={TABS.find((t) => t.id === voorChat)?.naam}
      bestel={(p) => { setTeKopen(p); setTab("assistent"); }} />,
    assistent: <Assistent staat={staat} vernieuw={herladen} teKopen={teKopen}
      gekocht={() => setTeKopen(null)} vooraf={voorafVraag} voorafGebruikt={() => setVooraf("")}
      naarBestellingen={() => { setWerkGesprek(null); openVragen(); setTab("chat"); }} sluit={() => setTabRuw(voorAssistent)} />,
    instellingen: <Instellingen staat={staat} vernieuw={herladen} terug={() => setTab(vorige)} opUitgelogd={() => setStaat(null)}
      setStaat={setStaat} vraag={(t) => { setVooraf(t); setTab("assistent"); }}
      vorigeNaam={TABS.find((t) => t.id === vorige)?.naam} />,
  };
  const hoofd = tab === "agenda" ? "vandaag" : tab;

  return (
    <div key={staat.gebruiker.id} data-hoofdplek={hoofd} className="mx-auto flex h-full max-w-xl flex-col">
      {!online ? <p role="status" className="bg-vlak px-6 py-3 text-sm text-rustig">
        Geen internet. Je ziet de laatste stand en wat je typt blijft staan.</p>
        : fout && <div role="alert" className="flex items-center gap-3 bg-vlak px-6 py-3 text-sm text-rustig">
          <p className="flex-1">{fout}</p>
          <button onClick={() => (huidigeSessie() ? herladen() : starten())}
            className="shrink-0 rounded-full bg-accent px-3 py-1.5 text-xs font-medium text-white">Opnieuw</button>
        </div>}
      {tab !== "assistent" && <header className="flex shrink-0 items-center justify-between gap-3 px-6 pt-[max(env(safe-area-inset-top),8px)] pb-2">
        <button onClick={() => setTab("assistent")} aria-label="Open de AI-assistent" className="flex min-h-11 items-center gap-2 rounded-full bg-vlak px-3 text-[13px] font-medium"><Vonk className="size-4" /><span>Assistent</span></button>
        <button type="button" onClick={() => setToonZoek(true)} aria-label="Zoeken in de app" className="flex size-11 items-center justify-center rounded-full bg-vlak text-rustig text-[13px] font-medium">Zoek</button>
        <button onClick={() => setTab("instellingen")} aria-label="Profiel en instellingen" aria-current={tab === "instellingen" ? "page" : undefined} className="flex size-11 items-center justify-center rounded-full bg-vlak text-rustig ring-1 ring-transparent transition hover:ring-accent/20">
          {staat.gebruiker.foto ? <img src={staat.gebruiker.foto} alt="" className="size-full object-cover" /> : <Persoon className="size-5" />}
        </button>
      </header>}
      <main className="min-h-0 flex-1 overflow-hidden">
        {(Object.keys(scherm) as (keyof typeof scherm)[]).map(id => <BewaarScherm key={id} actief={hoofd === id} naam={TABS.find(t => t.id === id)!.naam}>
          <Vangnet naam={id}><Suspense fallback={<p role="status" className="px-6 py-8 text-rustig">Scherm laden…</p>}>{scherm[id]}</Suspense></Vangnet>
        </BewaarScherm>)}
      </main>
      <Vangnet naam="bellen" klein><BelLaag naarProject={(gesprek) => { setWerkGesprek(oud => ({ id: gesprek, ronde: (oud?.ronde ?? 0) + 1, gebruiker: staat.gebruiker.id })); setTab("chat"); }} /></Vangnet>
      <MascotteFeest />
      {toonEerste && (
        <Suspense fallback={null}>
          <EersteMinuut
            openAssistent={() => setTab("assistent")}
            openChat={() => setTab("chat")}
            sluit={() => setToonEerste(false)}
          />
        </Suspense>
      )}
      {toonZoek && (
        <Suspense fallback={null}>
          <GlobaalZoek sluit={() => setToonZoek(false)} />
        </Suspense>
      )}
      {gedeeldePost !== null && huidigeSessie() && (
        <Suspense fallback={null}><PostBlad id={gedeeldePost} sluit={() => setGedeeldePost(null)} /></Suspense>
      )}
      <div data-onderbalk className="shrink-0"><HoofdNavigatie actief={hoofd === "assistent" ? voorAssistent : hoofd} ongelezen={ongelezen} kies={t => setTab(t === "vandaag" ? dagDeel : t)} /></div>
    </div>
  );
}

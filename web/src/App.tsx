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
import { postGevraagd, postVragen } from "./lib/feed";
const PostBlad = lazy(() => import("./schermen/Feed").then((m) => ({ default: m.PostBlad })));

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

// Terug van betalen bij Stripe (?betaald=...): meteen naar je bestellingen.
const BETAALD = adresWaarde("betaald");
// Siri (app Opdrachten) opent de app met ?zeg=wat je zei: dat gaat naar de assistent.
const ZEG = (adresWaarde("zeg") ?? "").trim().slice(0, 500);
// Een gedeelde winkellink (?winkel=adres): die winkel opent in Chat › Winkel.
const WINKEL = winkelVragen(adresWaarde("winkel") ?? "");
// Terug van inloggen bij je bank (?code=...&state=...): de koppeling afmaken in Budget.
const BANK = terugVanBank(adresWaarde("code"), adresWaarde("state"));
// Terug van betalen voor een cursus, pakket of abonnement in een community: de app controleert het in Chat.
const CURSUSLINK = cursusLinkVragen(adresWaarde("cursus"));
const POST = postVragen(adresWaarde("post"));
const CURSUS = terugVanCursus(adresWaarde("cursus_betaald"), adresWaarde("pakket_betaald"), adresWaarde("community_abonnement"));
adresOpruimen("betaald", "zeg", "ochtend", "winkel", "code", "state", "cursus_betaald", "pakket_betaald", "community_abonnement", "cursus", "post");
if (BETAALD !== null) openVragen(BETAALD === "0" ? "Betalen is afgebroken. Je kunt het opnieuw proberen."
  : "Je bent terug van de betaalpagina. Controleer de actuele betaalstatus bij je bestelling.");
// Alleen Vandaag zit in het eerste stuk van de app. De andere schermen komen los, en worden opgehaald zodra de app
// even niets te doen heeft, zodat ze klaarstaan voordat je erop tikt. Claude laden we pas als je de assistent opent.
const laden = {
  agenda: () => import("./schermen/Agenda"),
  chat: () => import("./schermen/Chat"),
  instellingen: () => import("./schermen/Instellingen"),
};
const Werkruimte = lazy(() => import("./schermen/Werkruimte"));
const Chat = lazy(laden.chat);
const Instellingen = lazy(laden.instellingen);
const Assistent = lazy(() => import("./schermen/Assistent"));
const GedeeldScherm = lazy(() => import("./schermen/Delen").then((m) => ({ default: m.GedeeldScherm })));
const GastScherm = lazy(() => import("./schermen/Gasten").then((m) => ({ default: m.GastScherm })));
const ProfielScherm = lazy(() => import("./schermen/ProfielPagina").then((m) => ({ default: m.ProfielScherm })));
const BoekScherm = lazy(() => import("./schermen/Gasten").then((m) => ({ default: m.BoekScherm })));
const PrikScherm = lazy(() => import("./schermen/Prikken").then((m) => ({ default: m.PrikScherm })));

function vooraf() {
  const w = window as Window & {
    requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number;
    cancelIdleCallback?: (id: number) => void;
  };
  const verbinding = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (verbinding?.saveData || /(^|-)2g$/.test(verbinding?.effectiveType ?? "")) return () => {};
  const doe = () => { if (!document.hidden) Object.values(laden).forEach(l => l().catch(() => {})); };
  if (w.requestIdleCallback && w.cancelIdleCallback) {
    const id = w.requestIdleCallback(doe, { timeout: 2500 });
    return () => w.cancelIdleCallback?.(id);
  }
  const id = setTimeout(doe, 1200);
  return () => clearTimeout(id);
}

export type Tab = "projecten" | "vandaag" | "agenda" | "chat" | "assistent" | "instellingen";

const TABS: { id: Tab; naam: string; Icoon: typeof Zon }[] = [
  { id: "vandaag", naam: "Mijn dag", Icoon: Zon },
  { id: "projecten", naam: "Werkruimte", Icoon: Projectmap },
  { id: "agenda", naam: "Agenda", Icoon: Kalender },
  { id: "chat", naam: "Chat", Icoon: Ballon },
  { id: "assistent", naam: "Assistent", Icoon: Vonk },
  { id: "instellingen", naam: "Instellingen", Icoon: Tandwiel },
];

export type { Staat };

export default function App() {
  const [klaar, setKlaar] = useState(false);
  const [staat, setStaat] = useState<Staat | null>(null);
  const gebruikWerkplek = useWerkplekken(staat, setStaat);
  const [tab, setTabRuw] = useState<Tab>(BETAALD !== null || WINKEL || CURSUS || CURSUSLINK ? "chat" : ZEG ? "assistent" : BANK || SPORT_TERUG || TICKET_EVENT ? "projecten" : "vandaag");
  const [voorafVraag, setVooraf] = useState(ZEG);
  const [vorige, setVorige] = useState<Tab>("vandaag");
  const [voorAssistent, setVoorAssistent] = useState<Tab>("vandaag");
  const tabRef = useRef(tab);
  const vorigeRef = useRef(vorige);
  const voorAssistentRef = useRef(voorAssistent);
  const [teKopen, setTeKopen] = useState<Product | null>(null);
  const [fout, setFout] = useState("");
  const [dagDeel, setDagDeel] = useState<"vandaag" | "agenda">("vandaag");
  const [ongelezen, setOngelezen] = useState(0);
  const [werkGesprek, setWerkGesprek] = useState<{ id: number; ronde: number; gebruiker: number } | null>(null);
  const [voorlopig, setVoorlopig] = useState(false);
  const [voorChat, setVoorChat] = useState<Tab>("vandaag");
  const [startOnderdeel, setStartOnderdeel] = useState<{ naam: OnderdeelNaam; n: number } | null>(
    TICKET_EVENT ? { naam: "studio", n: 1 } : BANK ? { naam: "budget", n: 1 } : SPORT_TERUG ? { naam: "sport", n: 1 } : null);

  useEffect(() => {
    tabRef.current = tab;
  }, [tab]);
  useEffect(() => {
    vorigeRef.current = vorige;
  }, [vorige]);
  useEffect(() => {
    voorAssistentRef.current = voorAssistent;
  }, [voorAssistent]);

  const setTab = useCallback((t: Tab) => {
    if (t === "vandaag" || t === "agenda") setDagDeel(t);
    if (t === "instellingen") {
      const vorigeTab = tabRef.current === "instellingen" ? vorigeRef.current : tabRef.current === "assistent" ? voorAssistentRef.current : tabRef.current;
      setVorige(vorigeTab);
    }
    if (t === "assistent" && tabRef.current !== "assistent") setVoorAssistent(tabRef.current);
    else if (t !== "projecten") setStartOnderdeel(null);
    if (t === "chat" && tabRef.current !== "chat") setVoorChat(tabRef.current);
    setTabRuw(t);
  }, []);

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

  const starten = useCallback(() => {
    if (EXTERN_TERUG) { setStaat(null); setKlaar(true); return; }
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
    return vooraf();
  }, [starten]);

  const [gedeeldePost, setGedeeldePost] = useState<number | null>(() => (POST ? postGevraagd() : null));

  const online = useOnline();
  const wasOffline = useRef(false);
  useEffect(() => {
    if (!online) { wasOffline.current = true; return; }
    if (wasOffline.current && staat && huidigeSessie()) herladen();
    wasOffline.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

  useEffect(() => {
    if (!fout || !klaar || huidigeSessie()) return;
    window.addEventListener("online", starten, { once: true });
    return () => window.removeEventListener("online", starten);
  }, [fout, klaar, starten]);

  useEffect(() => {
    if (!staat || !huidigeSessie()) return;
    const t = setTimeout(() => { momentopnameBewaren(staat).catch(() => {}); }, 800);
    return () => clearTimeout(t);
  }, [staat]);

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
      {gedeeldePost !== null && huidigeSessie() && (
        <Suspense fallback={null}><PostBlad id={gedeeldePost} sluit={() => setGedeeldePost(null)} /></Suspense>
      )}
      <div data-onderbalk className="shrink-0"><HoofdNavigatie actief={hoofd === "assistent" ? voorAssistent : hoofd} ongelezen={ongelezen} kies={t => setTab(t === "vandaag" ? dagDeel : t)} /></div>
    </div>
  );
}

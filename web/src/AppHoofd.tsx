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
import { Persoon, Vonk, Zoek } from "./iconen";
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

const EXTERN_TERUG = isExterneTerugkomst();
const GEDEELD = deelCode();
const BOEK = boekAdres();
const PROFIEL = profielAdres();
const SPORT_TERUG = !!terugkomst();
const TICKET_EVENT = ticketAdres();
const BOEKING = boekingCode();
const PRIK = prikCode();
const BETAALD = adresWaarde("betaald");
const ZEG = (adresWaarde("zeg") ?? "").trim().slice(0, 500);
const WINKEL = winkelVragen(adresWaarde("winkel") ?? "");
const BANK = terugVanBank(adresWaarde("code"), adresWaarde("state"));
const CURSUSLINK = cursusLinkVragen(adresWaarde("cursus"));
const POST = postVragen(adresWaarde("post"));
const CURSUS = terugVanCursus(adresWaarde("cursus_betaald"), adresWaarde("pakket_betaald"), adresWaarde("community_abonnement"));
adresOpruimen("betaald", "zeg", "ochtend", "winkel", "code", "state", "cursus_betaald", "pakket_betaald", "community_abonnement", "cursus", "post");
if (BETAALD !== null) openVragen(BETAALD === "0" ? "Betalen is afgebroken. Je kunt het opnieuw proberen." : "Je bent terug van de betaalpagina. Controleer de actuele betaalstatus bij je bestelling.",
  /^\d+$/.test(BETAALD) && BETAALD !== "0" ? Number(BETAALD) : undefined);

const laden = {
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

export type Tab = "vandaag" | "agenda" | "projecten" | "chat" | "assistent" | "instellingen";
const TABS: { id: Tab; naam: string }[] = [
  { id: "vandaag", naam: "Vandaag" },
  { id: "projecten", naam: "Werkruimte" },
  { id: "chat", naam: "Chat" },
  { id: "assistent", naam: "Assistent" },
  { id: "instellingen", naam: "Instellingen" },
];

export default function App() {
  const online = useOnline();
  const [staat, setStaat] = useState<Staat | null>(null);
  const [klaar, setKlaar] = useState(false);
  const [fout, setFout] = useState("");
  const [tab, setTabRuw] = useState<Tab>(BETAALD !== null || WINKEL || CURSUS || CURSUSLINK ? "chat" : ZEG ? "assistent" : BANK || SPORT_TERUG || TICKET_EVENT ? "projecten" : "vandaag");
  const [dagDeel, setDagDeel] = useState<"vandaag" | "agenda">("vandaag");
  const [voorAssistent, setVoorAssistent] = useState<Tab>("vandaag");
  const [voorChat, setVoorChat] = useState<Tab>("vandaag");
  const [vorige, setVorige] = useState<Tab>("vandaag");
  const [startOnderdeel, setStartOnderdeel] = useState<{ naam: OnderdeelNaam; n: number } | null>(
    TICKET_EVENT ? { naam: "studio", n: 1 } : BANK ? { naam: "budget", n: 1 } : SPORT_TERUG ? { naam: "sport", n: 1 } : null,
  );
  const [werkGesprek, setWerkGesprek] = useState<{ id: number; ronde: number; gebruiker: number } | null>(null);
  const [voorafVraag, setVooraf] = useState(ZEG);
  const [teKopen, setTeKopen] = useState<Product | null>(null);
  const [ongelezen, setOngelezen] = useState(0);
  const [gedeeldePost, setGedeeldePost] = useState<number | null>(() => postGevraagd());
  const [toonEerste, setToonEerste] = useState(() => !eersteMinuutKlaar());
  const [toonZoek, setToonZoek] = useState(false);
  const [voorlopig, setVoorlopig] = useState(false);
  const tabRef = useRef(tab);
  tabRef.current = tab;
  const gebruikWerkplek = useWerkplekken(staat, setStaat);

  const vorigeRef = useRef(vorige);
  vorigeRef.current = vorige;
  const voorAssistentRef = useRef(voorAssistent);
  voorAssistentRef.current = voorAssistent;
  // Instellingen en de assistent leggen zich over een scherm heen; sluiten brengt je terug waar je was.
  const setTab = useCallback((naar: string) => {
    const t = naar as Tab;
    const nu = tabRef.current;
    if (t === "vandaag" || t === "agenda") setDagDeel(t);
    if (t === "instellingen") setVorige(nu === "instellingen" ? vorigeRef.current : nu === "assistent" ? voorAssistentRef.current : nu);
    if (t === "assistent" && nu !== "assistent") setVoorAssistent(nu);
    else if (t !== "projecten") setStartOnderdeel(null);
    if (t === "chat" && nu !== "chat") setVoorChat(nu);
    tabRef.current = t;
    setTabRuw(t);
  }, []);

  const herladen = useCallback(async () => {
    try {
      const s = await gegevensLaden();
      setStaat(s);
      setFout("");
      setVoorlopig(false);
      overstappen().catch(() => {});
    } catch (e) {
      if (e instanceof GeenToegang) {
        setStaat(null);
        setVoorlopig(false);
      } else setFout("Kon niet vernieuwen. Controleer je verbinding.");
    }
  }, []);

  const starten = useCallback(() => {
    if (EXTERN_TERUG) { setStaat(null); setKlaar(true); return; }
    let vers = false;
    const { vorige, vers: nieuw } = opstarten();
    vorige.then((v) => {
      if (v && !vers) { setStaat((s) => s ?? (v as Staat)); setVoorlopig(true); setKlaar(true); }
    });
    nieuw.then((n) => {
      vers = true;
      if (n === "offline") {
        setFout("Even geen verbinding. Je ziet de stand van de vorige keer.");
        return;
      }
      setVoorlopig(false);
      setStaat(n);
      setFout("");
      if (n) overstappen().catch(() => {});
    }, () => { vers = true; setVoorlopig(false); setStaat(null); }).finally(() => setKlaar(true));
  }, []);

  useEffect(() => { starten(); }, [starten]);

  useEffect(() => {
    if (!staat || SPORT_TERUG) return;
    sportVanzelf(staat.data).then((n) => { if (n) herladen(); }).catch(() => {});
  }, [!!staat]);

  useEffect(() => {
    if (!staat) return;
    startenAlsBekend().then((id) => id && luisteren(id)).catch(() => {});
  }, [!!staat]);

  useEffect(() => {
    if (staat?.data.instellingen?.boekpagina) verwerken().catch(() => {});
  }, [!!staat?.data.instellingen?.boekpagina]);

  useEffect(() => {
    const ga = (e: Event) => {
      const b = (e as CustomEvent<Bestemming>).detail;
      if (b.tab === "instellingen" && !b.onderdeel) setStartOnderdeel(null);
      if (b.onderdeel) setStartOnderdeel((o) => ({ naam: b.onderdeel as OnderdeelNaam, n: (o?.n ?? 0) + 1 }));
      if (b.tab === "chat") setVoorChat(tabRef.current);
      setTab(b.onderdeel ? "projecten" : b.tab);
    };
    window.addEventListener("app-naar", ga);
    return () => window.removeEventListener("app-naar", ga);
  }, [setTab]);

  useLayoutEffect(() => { setOngelezen(0); }, [staat?.gebruiker.id]);
  useEffect(() => { weergaveToepassen((staat?.data.instellingen ?? {}) as Weergave); }, [staat?.data.instellingen]);
  useEffect(() => { if (staat) track("app_open"); }, [staat?.gebruiker.id]);
  useEffect(() => {
    if (!staat) return;
    const t = setTimeout(() => { momentopnameBewaren(staat).catch(() => {}); }, 800);
    return () => clearTimeout(t);
  }, [staat]);

  if (GEDEELD) return <Suspense fallback={null}><GedeeldScherm code={GEDEELD} /></Suspense>;
  if (BOEKING) return <Suspense fallback={null}><GastScherm code={BOEKING} /></Suspense>;
  if (BOEK) return <Suspense fallback={null}><BoekScherm adres={BOEK} /></Suspense>;
  if (PROFIEL) return <Suspense fallback={null}><ProfielScherm adres={PROFIEL} /></Suspense>;
  if (PRIK) return <Suspense fallback={null}><PrikScherm code={PRIK} /></Suspense>;
  if (!klaar) return <div className="h-full" />;
  if (!staat || (!huidigeSessie() && !voorlopig)) return <Inloggen opIngelogd={herladen} />;

  const openProject = (gesprek: number) => {
    gebruikWerkplek({ soort: "project", gesprek });
    setWerkGesprek((oud) => ({ id: gesprek, ronde: (oud?.ronde ?? 0) + 1, gebruiker: staat.gebruiker.id }));
    setTab("chat");
  };

  const scherm = {
    vandaag: <MijnDag staat={staat} setStaat={setStaat} deel={dagDeel} ga={setTab} vernieuw={herladen} naarProject={openProject} vraag={(t) => { setVooraf(t); setTab("assistent"); }} />,
    projecten: <Werkruimte gebruik={gebruikWerkplek} staat={staat} vernieuw={herladen} start={startOnderdeel} vraag={(t) => { setVooraf(t); setTab("assistent"); }} naarChat={() => { setWerkGesprek(null); setTab("chat"); }} openProject={openProject} />,
    chat: <Chat key={staat.gebruiker.id} naarInstellingen={() => setTab("instellingen")} werkGesprek={werkGesprek} projectGeopend={(id) => gebruikWerkplek({ soort: "project", gesprek: id })} ongelezenGewijzigd={setOngelezen} staat={staat} setStaat={setStaat} verlaat={() => setTab(voorChat)} terugNaam={TABS.find((t) => t.id === voorChat)?.naam} bestel={(p) => { setTeKopen(p); setTab("assistent"); }} />,
    assistent: <Assistent staat={staat} vernieuw={herladen} teKopen={teKopen} gekocht={() => setTeKopen(null)} vooraf={voorafVraag} voorafGebruikt={() => setVooraf("")} naarBestellingen={() => { setWerkGesprek(null); openVragen(); setTab("chat"); }} sluit={() => setTabRuw(voorAssistent)} />,
    instellingen: <Instellingen staat={staat} vernieuw={herladen} terug={() => setTab(vorige)} opUitgelogd={() => setStaat(null)} setStaat={setStaat} vraag={(t) => { setVooraf(t); setTab("assistent"); }} vorigeNaam={TABS.find((t) => t.id === vorige)?.naam} />,
  };
  const hoofd = tab === "agenda" ? "vandaag" : tab;

  return (
    <div key={staat.gebruiker.id} data-hoofdplek={hoofd} className="mx-auto flex h-full max-w-xl flex-col md:max-w-none md:pl-24 lg:pl-60">
      {!online ? (
        <p role="status" className="bg-vlak px-6 py-3 text-sm text-rustig">Geen internet. Je ziet de laatste stand en wat je typt blijft staan.</p>
      ) : fout && (
        <div role="alert" className="flex items-center gap-3 bg-vlak px-6 py-3 text-sm text-rustig">
          <p className="flex-1">{fout}</p>
          <button onClick={() => (huidigeSessie() ? herladen() : starten())} className="shrink-0 rounded-full bg-accent px-3 py-1.5 text-xs font-medium text-white">Opnieuw</button>
        </div>
      )}
      {tab !== "assistent" && (
        <header className="flex shrink-0 items-center gap-2 px-5 pt-[max(env(safe-area-inset-top),8px)] pb-2 md:mx-auto md:w-full md:max-w-3xl md:px-8 md:pt-6">
          <div className="flex h-10 min-w-0 flex-1 items-center rounded-full bg-vlak">
            <button type="button" onClick={() => setToonZoek(true)} aria-label="Zoeken in de app" className="flex h-full min-w-0 flex-1 items-center gap-2 pl-3.5 text-left text-[14px] text-zacht">
              <Zoek className="size-4 shrink-0 text-rustig" /><span className="truncate">Zoek of vraag iets</span>
            </button>
            <button onClick={() => setTab("assistent")} aria-label="Open de AI-assistent" className="mr-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-white"><Vonk className="size-4" /></button>
          </div>
          <button onClick={() => setTab("instellingen")} aria-label="Profiel en instellingen" aria-current={tab === "instellingen" ? "page" : undefined} className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-vlak text-rustig">
            {staat.gebruiker.foto ? <img src={staat.gebruiker.foto} alt="" className="size-full object-cover" /> : <Persoon className="size-5" />}
          </button>
        </header>
      )}
      <main className="min-h-0 flex-1 overflow-hidden md:mx-auto md:w-full md:max-w-3xl md:px-3">
        {(Object.keys(scherm) as (keyof typeof scherm)[]).map((id) => (
          <BewaarScherm key={id} actief={hoofd === id} naam={TABS.find((t) => t.id === id)!.naam}>
            <Vangnet naam={id}><Suspense fallback={<p role="status" className="px-6 py-8 text-rustig">Scherm laden…</p>}>{scherm[id]}</Suspense></Vangnet>
          </BewaarScherm>
        ))}
      </main>
      <Vangnet naam="bellen" klein><BelLaag naarProject={(gesprek) => { setWerkGesprek((oud) => ({ id: gesprek, ronde: (oud?.ronde ?? 0) + 1, gebruiker: staat.gebruiker.id })); setTab("chat"); }} /></Vangnet>
      <MascotteFeest />
      {toonEerste && (<Suspense fallback={null}><EersteMinuut openAssistent={() => setTab("assistent")} openChat={() => setTab("chat")} sluit={() => setToonEerste(false)} /></Suspense>)}
      {toonZoek && (<Suspense fallback={null}><GlobaalZoek sluit={() => setToonZoek(false)} vraag={(t) => { setToonZoek(false); setVooraf(t); setTab("assistent"); }} /></Suspense>)}
      {gedeeldePost !== null && huidigeSessie() && (<Suspense fallback={null}><PostBlad id={gedeeldePost} sluit={() => setGedeeldePost(null)} /></Suspense>)}
      <div data-onderbalk className="shrink-0"><HoofdNavigatie actief={hoofd === "assistent" ? voorAssistent : hoofd} ongelezen={ongelezen} kies={(t) => setTab(t === "vandaag" ? dagDeel : t)} /></div>
    </div>
  );
}

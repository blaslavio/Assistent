import HoofdNavigatie, { dokVan } from "./schermen/HoofdNavigatie";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { GeenToegang, adresOpruimen, adresWaarde, gegevensLaden, huidigeSessie, momentopnameBewaren, opstarten, overstappen,
  type Staat } from "./api";
import { openVragen } from "./lib/bestellingen";
import { winkelVragen } from "./lib/mijnwinkel";
import { terugVanBank } from "./lib/bank";
import { cursusLinkVragen, terugVanCursus } from "./lib/cursus";
import { Ballon, Kalender, Persoon, Projectmap, Tandwiel, Vonk, Zon } from "./iconen";
import Inloggen from "./schermen/Inloggen";
import Vandaag from "./schermen/Vandaag";
import { Vraagbalk } from "./schermen/Vraagbalk";
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
const GEDEELD = deelCode();
// Afspraak maken zonder account (?boek=linknaam) en de eigen pagina van de gast (?boeking=code).
const BOEK = boekAdres();
const PROFIEL = profielAdres();
// Terug van inloggen bij een sportapp (?state=gz....): meteen naar Sport en gezondheid, daar wordt het afgemaakt.
const SPORT_TERUG = !!terugkomst();
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
const Projecten = lazy(() => import("./schermen/Projecten"));
const Agenda = lazy(laden.agenda);
const Chat = lazy(laden.chat);
const Instellingen = lazy(laden.instellingen);
const Assistent = lazy(() => import("./schermen/Assistent"));
const GedeeldScherm = lazy(() => import("./schermen/Delen").then((m) => ({ default: m.GedeeldScherm })));
const GastScherm = lazy(() => import("./schermen/Gasten").then((m) => ({ default: m.GastScherm })));
const ProfielScherm = lazy(() => import("./schermen/ProfielPagina").then((m) => ({ default: m.ProfielScherm })));
const BoekScherm = lazy(() => import("./schermen/Gasten").then((m) => ({ default: m.BoekScherm })));
const PrikScherm = lazy(() => import("./schermen/Prikken").then((m) => ({ default: m.PrikScherm })));

function vooraf() {
  const doe = () => Object.values(laden).forEach((l) => l().catch(() => {}));
  const w = window as Window & { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => void };
  if (w.requestIdleCallback) w.requestIdleCallback(doe, { timeout: 2500 });
  else setTimeout(doe, 1200);
}

export type Tab = "projecten" | "vandaag" | "agenda" | "chat" | "assistent" | "instellingen";

const TABS: { id: Tab; naam: string; Icoon: typeof Zon }[] = [
  { id: "vandaag", naam: "Vandaag", Icoon: Zon },
  { id: "projecten", naam: "Projecten", Icoon: Projectmap },
  { id: "agenda", naam: "Agenda", Icoon: Kalender },
  { id: "chat", naam: "Chat", Icoon: Ballon },
  { id: "assistent", naam: "Assistent", Icoon: Vonk },
  { id: "instellingen", naam: "Instellingen", Icoon: Tandwiel },
];

export type { Staat };

// Wat de balk onderin voorstelt, passend bij waar je bent.
const PLEK: Record<Tab, string> = { vandaag: "Wat wil je doen?", agenda: "Plan iets of vraag het", chat: "Vraag de assistent",
  projecten: "Vraag iets over je projecten", assistent: "", instellingen: "Zoek of vraag iets" };

export default function App() {
  const [klaar, setKlaar] = useState(false);
  const [staat, setStaat] = useState<Staat | null>(null);
  const [tab, setTabRuw] = useState<Tab>(BETAALD !== null || WINKEL || CURSUS || CURSUSLINK ? "chat" : ZEG ? "assistent" : BANK || SPORT_TERUG ? "instellingen" : "vandaag");
  const [voorafVraag, setVooraf] = useState(ZEG);
  const [vorige, setVorige] = useState<Tab>("vandaag");
  const [voorAssistent, setVoorAssistent] = useState<Tab>("vandaag");
  const [teKopen, setTeKopen] = useState<Product | null>(null);
  const [fout, setFout] = useState("");
  const [werkGesprek, setWerkGesprek] = useState<{ id: number; ronde: number; gebruiker: number } | null>(null);
  // De vorige stand staat op het scherm terwijl het inloggen nog loopt (of zonder verbinding).
  const [voorlopig, setVoorlopig] = useState(false);


  const [voorChat, setVoorChat] = useState<Tab>("vandaag");
  // Een onderdeel dat je via "Je apps" opent; het getal laat Instellingen weten dat het opnieuw gevraagd is.
  const [startOnderdeel, setStartOnderdeel] = useState<{ naam: OnderdeelNaam; n: number } | null>(
    BANK ? { naam: "budget", n: 1 } : SPORT_TERUG ? { naam: "sport", n: 1 } : null);
  const setTab = (t: Tab) => {
    // Instellingen en de assistent leggen zich over een scherm heen; sluiten brengt je terug waar je was.
    if (t === "instellingen") setVorige(tab === "instellingen" || tab === "assistent" ? vorige : tab);
    if (t === "assistent" && tab !== "assistent") setVoorAssistent(tab);
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

  // Een gedeeld bericht (?post=id) opent over de app zodra je bent ingelogd.
  const [gedeeldePost, setGedeeldePost] = useState<number | null>(() => (POST ? postGevraagd() : null));

  // Komt de verbinding terug, dan halen we meteen de nieuwste stand op.
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

  // Wat je nu ziet, bewaren we versleuteld voor de volgende keer openen (alleen als je hier ingelogd blijft).
  useEffect(() => {
    if (!staat || !huidigeSessie()) return;
    const t = setTimeout(() => { momentopnameBewaren(staat).catch(() => {}); }, 800);
    return () => clearTimeout(t);
  }, [staat]);

  // Trainingen, stappen en slaap uit gekoppelde sportapps op de achtergrond bijhalen (hooguit eens per 2 uur per app).
  useEffect(() => {
    if (!staat || SPORT_TERUG) return;
    sportVanzelf(staat.data).then((n) => { if (n) herladen(); }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!staat]);

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
  if (PROFIEL) return <Suspense fallback={null}><ProfielScherm adres={PROFIEL} /></Suspense>;
  if (PRIK) return <Suspense fallback={null}><PrikScherm code={PRIK} /></Suspense>;
  if (!klaar) return <div className="h-full" />;
  // Tijdens de bliksemstart is er nog geen sessie, maar wel de vorige stand: die laten we alvast zien.
  if (!staat || (!huidigeSessie() && !voorlopig)) return <Inloggen opIngelogd={herladen} />;

  const scherm = {
    vandaag: <Vandaag key={staat.gebruiker.id} staat={staat} setStaat={setStaat} naarInstellingen={() => setTab("instellingen")} ga={setTab}
      vraag={(t) => { setVooraf(t); setTab("assistent"); }} />,
    projecten: <Projecten key={staat.gebruiker.id} staat={staat} naarChat={() => { setWerkGesprek(null); setTab("chat"); }} open={gesprek => {
      setWerkGesprek(oud => ({ id: gesprek, ronde: (oud?.ronde ?? 0) + 1, gebruiker: staat.gebruiker.id })); setTab("chat");
    }} />,
    agenda: <Agenda staat={staat} setStaat={setStaat} />,
    chat: <Chat key={staat.gebruiker.id} werkGesprek={werkGesprek} staat={staat} setStaat={setStaat} naarInstellingen={() => setTab("instellingen")}
      verlaat={() => setTab(voorChat)} terugNaam={TABS.find((t) => t.id === voorChat)?.naam}
      bestel={(p) => { setTeKopen(p); setTab("assistent"); }} />,
    assistent: <Assistent staat={staat} vernieuw={herladen} teKopen={teKopen}
      gekocht={() => setTeKopen(null)} vooraf={voorafVraag} voorafGebruikt={() => setVooraf("")}
      naarBestellingen={() => { setWerkGesprek(null); openVragen(); setTab("chat"); }} sluit={() => setTabRuw(voorAssistent)} />,
    instellingen: <Instellingen staat={staat} vernieuw={herladen} terug={() => setTab(vorige)} opUitgelogd={() => setStaat(null)}
      setStaat={setStaat} vraag={(t) => { setVooraf(t); setTab("assistent"); }} start={startOnderdeel}
      vorigeNaam={TABS.find((t) => t.id === vorige)?.naam} />,
  }[tab];

  return (
    <div className="mx-auto flex h-full max-w-xl flex-col">
      {!online ? <p role="status" className="bg-vlak px-6 py-3 text-sm text-rustig">
        Geen internet. Je ziet de laatste stand en wat je typt blijft staan.</p>
        : fout && <div role="alert" className="flex items-center gap-3 bg-vlak px-6 py-3 text-sm text-rustig">
          <p className="flex-1">{fout}</p>
          <button onClick={() => (huidigeSessie() ? herladen() : starten())}
            className="shrink-0 rounded-full bg-accent px-3 py-1.5 text-xs font-medium text-white">Opnieuw</button>
        </div>}
      <div className="flex-1 overflow-y-auto"><Vangnet key={tab} naam={tab}><Suspense fallback={null}>{scherm}</Suspense></Vangnet></div>
      <Vangnet naam="bellen" klein><BelLaag naarProject={(gesprek) => { setWerkGesprek(oud => ({ id: gesprek, ronde: (oud?.ronde ?? 0) + 1, gebruiker: staat.gebruiker.id })); setTab("chat"); }} /></Vangnet>
      <MascotteFeest />
      {gedeeldePost !== null && huidigeSessie() && (
        <Suspense fallback={null}><PostBlad id={gedeeldePost} sluit={() => setGedeeldePost(null)} /></Suspense>
      )}
      {/* Onderin altijd hetzelfde: je foto (Instellingen en al je onderdelen), de assistent en drie vaste plekken.
          In een geopend gesprek verdwijnt het, daar heeft het gesprek zijn eigen invoer. */}
      {tab !== "assistent" && (
        <div data-onderbalk className="shrink-0">
          <Vraagbalk staat={staat} setStaat={setStaat} plek={PLEK[tab]} vraag={(t) => { setVooraf(t); setTab("assistent"); }}
            links={<button type="button" onClick={() => setTab("instellingen")} aria-label="Instellingen en al je onderdelen"
              aria-current={tab === "instellingen" ? "page" : undefined}
              className={`flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-vlak text-rustig ${tab === "instellingen" ? "ring-2 ring-inkt" : ""}`}>
              {staat.gebruiker.foto ? <img src={staat.gebruiker.foto} alt="" className="size-full object-cover" /> : <Persoon className="size-5" />}
            </button>} />
          <HoofdNavigatie actief={tab} tabs={dokVan((staat.data.instellingen as Record<string, unknown> | undefined)?.dok)}
            kies={(t) => { if (t === "chat") setWerkGesprek(null); setTab(t); }} />
        </div>
      )}
    </div>
  );
}

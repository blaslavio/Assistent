import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { GeenToegang, adresOpruimen, adresWaarde, gegevensLaden, huidigeSessie, terugkomen, type Gebruiker,
  type Gegevens } from "./api";
import { openVragen } from "./lib/bestellingen";
import { Ballon, Kalender, Tandwiel, Vonk, Zon } from "./iconen";
import Inloggen from "./schermen/Inloggen";
import Vandaag from "./schermen/Vandaag";
import Agenda from "./schermen/Agenda";
import Instellingen from "./schermen/Instellingen";
import { weergaveToepassen, type Weergave } from "./schermen/Algemeen";
import Chat from "./schermen/Chat";
import BelLaag from "./schermen/Bellen";
import { luisteren } from "./lib/bellen";
import { startenAlsBekend } from "./lib/chat";
import type { Product } from "./lib/winkelen";
import { deelCode } from "./lib/delen";
import { GedeeldScherm } from "./schermen/Delen";
import { BoekScherm, GastScherm } from "./schermen/Gasten";
import { boekAdres, boekingCode, verwerken } from "./lib/gasten";
import { Vangnet } from "./vangnet";

// Een gedeelde link (?deel=...) opent een pagina die je zonder inloggen kunt zien.
const GEDEELD = deelCode();
// Afspraak maken zonder account (?boek=linknaam) en de eigen pagina van de gast (?boeking=code).
const BOEK = boekAdres();
const BOEKING = boekingCode();

// Terug van betalen bij Stripe (?betaald=...): meteen naar je bestellingen.
const BETAALD = adresWaarde("betaald");
// Siri (app Opdrachten) opent de app met ?zeg=wat je zei: dat gaat naar de assistent.
const ZEG = (adresWaarde("zeg") ?? "").trim().slice(0, 500);
adresOpruimen("betaald", "zeg", "ochtend");
if (BETAALD !== null) openVragen(BETAALD === "0" ? "Betalen is afgebroken. Je kunt het opnieuw proberen."
  : "Gelukt. Je betaling is binnen en het geld staat vast tot je bevestigt dat alles goed is.");
// Claude laden we pas als je de assistent opent; zo start de app sneller.
const Assistent = lazy(() => import("./schermen/Assistent"));

export type Tab = "vandaag" | "agenda" | "chat" | "assistent" | "instellingen";

const TABS: { id: Tab; naam: string; Icoon: typeof Zon }[] = [
  { id: "vandaag", naam: "Vandaag", Icoon: Zon },
  { id: "agenda", naam: "Agenda", Icoon: Kalender },
  { id: "chat", naam: "Chat", Icoon: Ballon },
  { id: "assistent", naam: "Assistent", Icoon: Vonk },
  { id: "instellingen", naam: "Instellingen", Icoon: Tandwiel },
];

export type Staat = { gebruiker: Gebruiker; data: Gegevens };

export default function App() {
  const [klaar, setKlaar] = useState(false);
  const [staat, setStaat] = useState<Staat | null>(null);
  const [tab, setTabRuw] = useState<Tab>(BETAALD !== null ? "chat" : ZEG ? "assistent" : "vandaag");
  const [vooraf, setVooraf] = useState(ZEG);
  const [vorige, setVorige] = useState<Tab>("vandaag");
  const [teKopen, setTeKopen] = useState<Product | null>(null);
  const [fout, setFout] = useState("");

  const setTab = (t: Tab) => {
    if (t === "instellingen") setVorige(tab === "instellingen" ? vorige : tab);
    setTabRuw(t);
  };

  const laden = useCallback(async () => {
    try {
      setStaat(await gegevensLaden());
      setFout("");
    } catch (e) {
      if (e instanceof GeenToegang) setStaat(null);
      else setFout("Even geen verbinding. Probeer het zo opnieuw.");
    }
  }, []);

  useEffect(() => {
    terugkomen().then(async (gelukt) => {
      if (gelukt) await laden();
      setKlaar(true);
    });
  }, [laden]);

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

  // Kleur, tekstgrootte en toegankelijkheid uit je instellingen op de hele app.
  const weergave = staat?.data.instellingen;
  useEffect(() => { weergaveToepassen((weergave ?? {}) as Weergave); }, [weergave]);

  if (GEDEELD) return <GedeeldScherm code={GEDEELD} />;
  if (BOEKING) return <GastScherm code={BOEKING} />;
  if (BOEK) return <BoekScherm adres={BOEK} />;
  if (!klaar) return <div className="h-full" />;
  if (!staat || !huidigeSessie()) return <Inloggen opIngelogd={laden} />;

  const scherm = {
    vandaag: <Vandaag staat={staat} setStaat={setStaat} naarInstellingen={() => setTab("instellingen")} ga={setTab} />,
    agenda: <Agenda staat={staat} setStaat={setStaat} />,
    chat: <Chat staat={staat} setStaat={setStaat} naarInstellingen={() => setTab("instellingen")}
      bestel={(p) => { setTeKopen(p); setTab("assistent"); }} />,
    assistent: <Suspense fallback={null}><Assistent staat={staat} vernieuw={laden} teKopen={teKopen}
      gekocht={() => setTeKopen(null)} vooraf={vooraf} voorafGebruikt={() => setVooraf("")}
      naarBestellingen={() => { openVragen(); setTab("chat"); }} /></Suspense>,
    instellingen: <Instellingen staat={staat} vernieuw={laden} terug={() => setTab(vorige)} opUitgelogd={() => setStaat(null)}
      setStaat={setStaat} vraag={(t) => { setVooraf(t); setTab("assistent"); }} />,
  }[tab];

  return (
    <div className="mx-auto flex h-full max-w-xl flex-col">
      {fout && <p role="alert" className="bg-vlak px-6 py-3 text-sm text-rustig">{fout}</p>}
      <div className="flex-1 overflow-y-auto"><Vangnet key={tab} naam={tab}>{scherm}</Vangnet></div>
      <Vangnet naam="bellen" klein><BelLaag /></Vangnet>
      <nav aria-label="Hoofdmenu"
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
      </nav>
    </div>
  );
}

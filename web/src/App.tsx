import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { GeenToegang, gegevensLaden, huidigeSessie, terugkomen, type Gebruiker, type Gegevens } from "./api";
import { Ballon, Kalender, Vonk, Zon } from "./iconen";
import Inloggen from "./schermen/Inloggen";
import Vandaag from "./schermen/Vandaag";
import Agenda from "./schermen/Agenda";
import Instellingen from "./schermen/Instellingen";
import Chat from "./schermen/Chat";
import BelLaag from "./schermen/Bellen";
import { luisteren } from "./lib/bellen";
import { startenAlsBekend } from "./lib/chat";
import type { Product } from "./lib/winkelen";
import { deelCode } from "./lib/delen";
import { GedeeldScherm } from "./schermen/Delen";

// Een gedeelde link (?deel=...) opent een pagina die je zonder inloggen kunt zien.
const GEDEELD = deelCode();
// Claude laden we pas als je de assistent opent; zo start de app sneller.
const Assistent = lazy(() => import("./schermen/Assistent"));

export type Tab = "vandaag" | "agenda" | "chat" | "assistent" | "instellingen";

const TABS: { id: Tab; naam: string; Icoon: typeof Zon }[] = [
  { id: "vandaag", naam: "Vandaag", Icoon: Zon },
  { id: "agenda", naam: "Agenda", Icoon: Kalender },
  { id: "chat", naam: "Chat", Icoon: Ballon },
  { id: "assistent", naam: "Assistent", Icoon: Vonk },
];

export type Staat = { gebruiker: Gebruiker; data: Gegevens };

export default function App() {
  const [klaar, setKlaar] = useState(false);
  const [staat, setStaat] = useState<Staat | null>(null);
  const [tab, setTabRuw] = useState<Tab>("vandaag");
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

  if (GEDEELD) return <GedeeldScherm code={GEDEELD} />;
  if (!klaar) return <div className="h-full" />;
  if (!staat || !huidigeSessie()) return <Inloggen opIngelogd={laden} />;

  const scherm = {
    vandaag: <Vandaag staat={staat} setStaat={setStaat} naarInstellingen={() => setTab("instellingen")} />,
    agenda: <Agenda staat={staat} setStaat={setStaat} />,
    chat: <Chat staat={staat} naarInstellingen={() => setTab("instellingen")}
      bestel={(p) => { setTeKopen(p); setTab("assistent"); }} />,
    assistent: <Suspense fallback={null}><Assistent staat={staat} vernieuw={laden} teKopen={teKopen}
      gekocht={() => setTeKopen(null)} /></Suspense>,
    instellingen: <Instellingen staat={staat} vernieuw={laden} terug={() => setTab(vorige)} opUitgelogd={() => setStaat(null)} />,
  }[tab];

  return (
    <div className="mx-auto flex h-full max-w-xl flex-col">
      {fout && <p role="alert" className="bg-vlak px-6 py-3 text-sm text-rustig">{fout}</p>}
      <div className="flex-1 overflow-y-auto">{scherm}</div>
      <BelLaag />
      <nav aria-label="Hoofdmenu"
        className="flex shrink-0 justify-around border-t border-lijn pt-2.5 pb-[max(env(safe-area-inset-bottom),12px)]">
        {TABS.map(({ id, naam, Icoon }) => {
          const actief = tab === id;
          return (
            <button key={id} onClick={() => setTab(id)} aria-current={actief ? "page" : undefined}
              className={`flex min-w-16 flex-col items-center gap-1 text-[11px] ${actief ? "font-semibold text-inkt" : "text-zacht"}`}>
              <Icoon />
              {naam}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

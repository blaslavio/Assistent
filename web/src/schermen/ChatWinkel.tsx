// De winkel binnen Chat: ontdekken, verkopen, bestellingen en de kaart.
import { KaartVouw } from "../iconen";
import { Suspense, lazy, useEffect, useState } from "react";
import { Tas, Plus } from "../iconen";
import { Handel } from "./Handel";
import { JouwAanbod } from "./Delen";
import Bestellingen from "./Bestellingen";
import { lijst as bestellingenLijst, wachtOpMij } from "../lib/bestellingen";
import { Verkopen } from "./Verkopen";
import { MijnWinkel } from "./MijnWinkel";
import { AppKop } from "./AppMenu";
import type { Gegevens } from "../api";
import type { Staat } from "../App";
import type { Product } from "../lib/winkelen";

const WinkelKaart = lazy(() => import("./WinkelKaart").then((m) => ({ default: m.WinkelKaart })));

export type WinkelDeelNaam = "ontdekken" | "verkopen" | "bestellingen" | "kaart";

/** De winkel als eigen app: ontdekken, zelf verkopen en je bestellingen, met een eigen menu onderin. */
export function WinkelApp({ start, melding, adres, thuisadres, bestel, terug, staat, setData,terugNaam,losseKaart }: { terugNaam?:string;losseKaart?:boolean; staat:Staat;setData:(g:Gegevens)=>void; start: WinkelDeelNaam; melding?: string;
  adres?: string; thuisadres?: string; bestel: (p: Product) => void; terug: () => void }) {
  const [deel, setDeel] = useState<WinkelDeelNaam>(start);
  const [openWinkel, setOpenWinkel] = useState(adres);
  const [wacht, setWacht] = useState(0);
  const [verkopen, setVerkopen] = useState(false);
  const [bijgewerkt, setBijgewerkt] = useState(0);
  useEffect(() => {
    bestellingenLijst().then((l) => setWacht(l.filter(wachtOpMij).length)).catch(() => {});
  }, [deel]);
  // Eén scherm: zoeken en kopen. Verkopen en Bestellingen zijn knoppen rechtsboven, met één stap terug naar de winkel.
  const knop = "relative flex size-10 items-center justify-center rounded-full bg-vlak";
  if (deel === "kaart")
    return (
      <Suspense fallback={<p className="bezig-tekst px-6 py-6 text-[15px] text-rustig">Kaart laden</p>}>
        <WinkelKaart staat={staat} setData={setData} thuisadres={thuisadres}
          terug={losseKaart ? terug : () => setDeel("ontdekken")} terugNaam={losseKaart ? terugNaam ?? "Chat" : "Winkel"}
          open={(a) => { setOpenWinkel(a); setDeel("ontdekken"); }} />
      </Suspense>
    );
  return (
    <div className="flex min-h-full flex-col">
      <AppKop terug={deel === "ontdekken" ? terug : () => setDeel("ontdekken")} terugNaam={deel === "ontdekken" ? terugNaam??"Chat" : "Winkel"}
        titel={deel === "ontdekken" ? "Winkel" : deel === "verkopen" ? "Verkopen" : "Bestellingen"}
        rechts={deel === "ontdekken" && (
          <span className="flex shrink-0 gap-2">
            <button onClick={() => setDeel("kaart")} aria-label="Kaart en routes" className={knop}><KaartVouw className="size-5" /></button>
            <button onClick={() => setDeel("verkopen")} aria-label="Verkopen" className={knop}><Plus className="size-5" /></button>
            <button onClick={() => setDeel("bestellingen")} aria-label={wacht ? `Bestellingen, ${wacht} wachten op jou` : "Bestellingen"} className={knop}>
              <Tas className="size-5" />
              {wacht > 0 && <span className="absolute -top-1 -right-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[11px] font-semibold text-white">{wacht}</span>}
            </button>
          </span>
        )} />
      {deel === "ontdekken" && <Handel kaartOpen={() => setDeel("kaart")} bestel={bestel} verkoop={() => setVerkopen(true)}
        winkel={openWinkel} />}
      {deel === "verkopen" && (
        <div className="flex flex-col gap-5 px-6 pb-8">
          <button onClick={() => setVerkopen(true)} className="flex items-center gap-3 rounded-2xl bg-accent/10 p-4 text-left">
            <Plus className="size-6 text-accent" />
            <span className="flex flex-col">
              <span className="font-medium">Zet iets te koop</span>
              <span className="text-[13px] text-rustig">Een product of een dienst, met foto en prijs</span>
            </span>
          </button>
          <MijnWinkel key={bijgewerkt} nieuwProduct={() => setVerkopen(true)} bekijk={(a) => { setOpenWinkel(a); setDeel("ontdekken"); }} />
          <JouwAanbod key={bijgewerkt} />
        </div>
      )}
      {deel === "bestellingen" && <Bestellingen melding={deel === start ? melding : undefined} />}
      {verkopen && <Verkopen sluit={() => setVerkopen(false)}
        geplaatst={() => { setVerkopen(false); setBijgewerkt((n) => n + 1); }} />}
    </div>
  );
}

/** Een nieuw gesprek: alleen een naamveld bovenaan de lijst. Geen venster, dus het scherm blijft stil staan. */

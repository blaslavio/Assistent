// De winkel binnen Chat: ontdekken, verkopen, bestellingen en de kaart.
import { KaartVouw } from "../iconen";
import { Suspense, lazy, useEffect, useState, type ReactNode } from "react";
import { Bal, Boek, Fiets, Gereedschap, Huis, Kind, Penseel, Raster as RasterIcoon, Scherm, Shirt, Truck, Winkelpand, Tas, Mensen, Plus, Zoek } from "../iconen";
import { JouwAanbod } from "./Delen";
import Bestellingen from "./Bestellingen";
import { lijst as bestellingenLijst, wachtOpMij } from "../lib/bestellingen";
import { Rondje } from "../rondje";
import { Verkopen } from "./Verkopen";
import { MijnWinkel } from "./MijnWinkel";
import { AppKop } from "./AppMenu";
import type { Gegevens } from "../api";
import { Bladen, Raster, type Blad } from "./Winkelen";
import { rpc } from "../api";
import { zoeken, type Filter, type Product } from "../lib/winkelen";
import type { Staat } from "../App";

const foutVan = (e: unknown) => (e instanceof Error ? e.message : "Dat lukte niet.");
const WinkelKaart = lazy(() => import("./WinkelKaart").then((m) => ({ default: m.WinkelKaart })));
type WinkelKaartje = { adres: string; naam: string; omschrijving?: string; producten?: number; lat?: number | null;
  lon?: number | null; winkeladres?: string };

type Ic = (p: { className?: string }) => ReactNode;
const BRONNEN: [NonNullable<Filter["bron"]>, string, Ic][] = [["alles", "Alles", RasterIcoon], ["marktplaats", "Marktplaats", Mensen],
  ["winkels", "Winkels", Winkelpand], ["diensten", "Diensten", Gereedschap]];
const CATEGORIEEN: [string, Ic][] = [["Kleding", Shirt], ["Elektronica", Scherm], ["Huis en tuin", Huis], ["Fietsen", Fiets],
  ["Sport", Bal], ["Boeken", Boek], ["Kinderen", Kind], ["Hobby", Penseel]];
const chip = (aan: boolean) => `flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm ${aan ? "bg-accent font-medium text-white" : "bg-vlak text-rustig"}`;

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
  return (
    <div className="flex min-h-full flex-col">
      <AppKop terug={deel === "ontdekken"||(deel==="kaart"&&losseKaart) ? terug : () => setDeel("ontdekken")} terugNaam={deel === "ontdekken"||(deel==="kaart"&&losseKaart) ? terugNaam??"Chat" : "Winkel"}
        titel={deel === "ontdekken" ? "Winkel" : deel === "kaart" ? "Kaart en routes" : deel === "verkopen" ? "Verkopen" : "Bestellingen"}
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
      {(deel === "ontdekken" || deel === "kaart") && <WinkelDeel staat={staat} setData={setData} key={deel} kaart={deel === "kaart"} bestel={bestel} verkoop={() => setVerkopen(true)}
        winkel={openWinkel} thuisadres={thuisadres} />}
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

export function WinkelDeel({ bestel, verkoop, winkel, thuisadres, kaart, staat, setData }: { staat:Staat;setData:(g:Gegevens)=>void; bestel: (p: Product) => void; verkoop: () => void;
  winkel?: string; thuisadres?: string; kaart?: boolean }) {
  const [zoek, setZoek] = useState("");
  const [term, setTerm] = useState("");
  const [bron, setBron] = useState<NonNullable<Filter["bron"]>>(kaart ? "winkels" : "alles");
  const [bezorgen, setBezorgen] = useState(false);
  const [producten, setProducten] = useState<Product[] | null>(null);
  const [winkels, setWinkels] = useState<WinkelKaartje[]>([]);
  const [stapel, setStapel] = useState<Blad[]>(() => (winkel ? [{ soort: "winkel", adres: winkel }] : []));
  const [fout, setFout] = useState("");

  useEffect(() => {
    setFout("");
    setProducten(null);
    zoeken(term, { bron, bezorgen, max: 40 }).then(setProducten).catch((e) => { setProducten([]); setFout(foutVan(e)); });
    if (bron === "alles" || bron === "winkels")
      rpc<WinkelKaartje[]>("winkels_zoeken", { p_zoekterm: term }).then((w) => setWinkels(Array.isArray(w) ? w : [])).catch(() => {});
  }, [term, bron, bezorgen]);
  const zoekt = term.trim() !== "";
  return (
    <div className="flex flex-col gap-5 px-6 pb-8">
      <form onSubmit={(e) => { e.preventDefault(); setTerm(zoek); }} className="flex items-center gap-2 rounded-2xl bg-vlak px-4">
        <Zoek className="size-5 shrink-0 text-zacht" />
        <input value={zoek} onChange={(e) => { setZoek(e.target.value); if (!e.target.value) setTerm(""); }}
          placeholder="Zoek in winkels en marktplaats" aria-label="Zoeken"
          enterKeyHint="search" className="h-12 flex-1 bg-transparent outline-none placeholder:text-zacht" />
      </form>
      <div className="-mx-6 flex gap-2 overflow-x-auto px-6 [scrollbar-width:none]">
        {BRONNEN.map(([k, naam, Icoon]) => (
          <button key={k} aria-pressed={bron === k} onClick={() => setBron(k)} className={chip(bron === k)}>
            <Icoon className="size-4" />{naam}
          </button>
        ))}
        <button aria-pressed={bezorgen} onClick={() => setBezorgen((b) => !b)} className={chip(bezorgen)}>
          <Truck className="size-4" />Bezorgen
        </button>
      </div>
      {bron === "winkels" && !zoekt && (
        <Suspense fallback={<p className="bezig-tekst py-6 text-[15px] text-rustig">Kaart laden</p>}>
          <WinkelKaart staat={staat} setData={setData} winkels={winkels} thuisadres={thuisadres} open={(a) => setStapel([{ soort: "winkel", adres: a }])} />
        </Suspense>
      )}
      {!zoekt && bron !== "winkels" && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-rustig">Categorieën</h2>
          <div className="grid grid-cols-4 gap-2">
            {CATEGORIEEN.map(([c, Icoon]) => (
              <button key={c} onClick={() => { setZoek(c); setTerm(c); }}
                className="flex flex-col items-center gap-1.5 rounded-2xl bg-vlak px-1 py-3 text-[12px] leading-tight">
                <Icoon className="size-6 text-accent dark:text-accent-donker" />{c}
              </button>
            ))}
          </div>
        </section>
      )}
      {(bron === "alles" || bron === "winkels") && winkels.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-rustig">Winkels</h2>
          <ul className="-mx-6 flex gap-2.5 overflow-x-auto px-6 [scrollbar-width:none]">
            {winkels.slice(0, 20).map((w) => (
              <li key={w.adres} className="shrink-0">
                <button onClick={() => setStapel([{ soort: "winkel", adres: w.adres }])}
                  className="flex w-36 flex-col items-start gap-2 rounded-2xl bg-vlak p-3 text-left">
                  <Rondje naam={w.naam} id={w.naam.length * 7 + w.adres.length} />
                  <span className="w-full truncate text-[15px] font-medium">{w.naam}</span>
                  <span className="text-[13px] text-rustig">{w.producten ?? 0} producten</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-rustig">{zoekt ? `Gevonden voor "${term}"` : bron === "diensten" ? "Diensten" : "Te koop"}</h2>
        {fout && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{fout}</p>}
        {producten === null ? <p className="bezig-tekst py-6 text-[15px] text-rustig">Laden</p>
          : producten.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-2xl bg-vlak px-6 py-8 text-center">
              <Tas className="size-8 text-zacht" />
              <p className="font-medium">{zoekt ? "Niets gevonden" : "Hier staat nog niets"}</p>
              <p className="text-sm text-rustig">{bezorgen ? "Zet Bezorgen uit om ook ophalen te zien, of " : ""}zet zelf als eerste iets te koop.</p>
              <button onClick={verkoop} className="h-10 rounded-full bg-accent px-5 text-sm font-medium text-white">Verkopen</button>
            </div>
          ) : <Raster producten={producten} open={(p) => setStapel([{ soort: "product", p }])} />}
      </section>
      <p className="text-[13px] text-zacht">Je kunt ook de assistent vragen iets te zoeken. Er gaat pas iets weg als jij zelf op Bestellen tikt.</p>
      <Bladen stapel={stapel} zet={setStapel} bestel={(p) => { setStapel([]); bestel(p); }} />
    </div>
  );
}


/** Een nieuw gesprek: alleen een naamveld bovenaan de lijst. Geen venster, dus het scherm blijft stil staan. */

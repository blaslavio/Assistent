// Productkaartjes met foto, en de bladen die erachter zitten: het product zelf, de winkel en de verkoper.
// Alles blijft in de app; bestellen loopt via de assistent, die een kaart klaarzet waarop jij zelf tikt.
import { useEffect, useState } from "react";
import { Beeld, Kruis, Tas, Terug } from "../iconen";
import { WinkelPagina } from "./WinkelPagina";
import { LEVERING, euro, productFoto, verkoperBekijken, winkelBekijken, type Product, type Verkoper,
  type Winkel } from "../lib/winkelen";

export type Blad = { soort: "product"; p: Product; uitverkocht?: boolean } | { soort: "winkel"; adres: string }
  | { soort: "verkoper"; id: number };

export function Foto({ p, className = "" }: { p: Product; className?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let weg = false;
    if (p.foto) productFoto(p.id).then((f) => !weg && setSrc(f));
    return () => { weg = true; };
  }, [p.id, p.foto]);
  return (
    <span className={`flex items-center justify-center overflow-hidden bg-vlak text-zacht ${className}`}>
      {src ? <img src={src} alt="" className="size-full object-cover" /> : <Beeld className="size-7 opacity-60" />}
    </span>
  );
}

export function ProductRij({ producten, open }: { producten: Product[]; open: (p: Product) => void }) {
  return (
    <ul aria-label="Gevonden producten" className="-mx-1 flex snap-x gap-2.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
      {producten.map((p) => (
        <li key={p.sleutel} className="w-40 shrink-0 snap-start">
          <button onClick={() => open(p)} aria-label={`${p.titel}, ${euro(p.prijs)}, ${p.verkoper}`}
            className="flex w-full flex-col gap-1 text-left">
            <Foto p={p} className="aspect-square w-full rounded-2xl" />
            <span className="mt-1 line-clamp-2 text-[15px] leading-snug">{p.titel}</span>
            <span className="font-semibold">{euro(p.prijs)}</span>
            <span className="truncate text-[13px] text-rustig">{p.bron === "winkel" ? p.verkoper : `${p.verkoper} · marktplaats`}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function Raster({ producten, open, uitverkocht }: { producten: Product[]; open: (p: Product) => void;
  uitverkocht?: Set<string> }) {
  if (!producten.length) return <p className="text-sm text-rustig">Nu niets te koop.</p>;
  return (
    <ul className="grid grid-cols-2 gap-x-3 gap-y-4">
      {producten.map((p) => (
        <li key={p.sleutel}>
          <button onClick={() => open(p)} className="flex w-full flex-col gap-1 text-left">
            <Foto p={p} className={`aspect-square w-full rounded-2xl ${uitverkocht?.has(p.sleutel) ? "opacity-40" : ""}`} />
            <span className="mt-1 line-clamp-2 text-[15px] leading-snug">{p.titel}</span>
            <span className="text-[15px] font-semibold">
              {uitverkocht?.has(p.sleutel) ? <span className="font-normal text-rustig">Uitverkocht</span> : euro(p.prijs)}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Het bovenste blad van de stapel, met terug naar het vorige. */
export function Bladen({ stapel, zet, bestel }: { stapel: Blad[]; zet: (s: Blad[]) => void;
  bestel: (p: Product) => void }) {
  const blad = stapel.at(-1);
  useEffect(() => {
    if (!blad) return;
    const toets = (e: KeyboardEvent) => e.key === "Escape" && zet([]);
    window.addEventListener("keydown", toets);
    return () => window.removeEventListener("keydown", toets);
  }, [blad, zet]);
  if (!blad) return null;
  const open = (b: Blad) => zet([...stapel, b]);
  const titel = blad.soort === "product" ? blad.p.titel : blad.soort === "winkel" ? "Winkel" : "Verkoper";
  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/30" onClick={() => zet([])}>
      <div role="dialog" aria-label={titel} onClick={(e) => e.stopPropagation()}
        className="flex max-h-[88%] w-full max-w-xl flex-col rounded-t-[28px] bg-white pt-3 dark:bg-[#16161a]">
        <span className="mx-auto h-1 w-10 shrink-0 rounded-full bg-lijn" />
        <div className="flex shrink-0 items-center justify-between px-3 pt-1">
          {stapel.length > 1 ? (
            <button onClick={() => zet(stapel.slice(0, -1))} aria-label="Terug"
              className="flex size-10 items-center justify-center rounded-full hover:bg-vlak"><Terug className="size-5" /></button>
          ) : <span className="size-10" />}
          <button onClick={() => zet([])} aria-label="Sluiten"
            className="flex size-10 items-center justify-center rounded-full hover:bg-vlak"><Kruis className="size-5" /></button>
        </div>
        <div className="flex flex-col gap-4 overflow-y-auto px-6 pb-[max(env(safe-area-inset-bottom),24px)]">
          {blad.soort === "product" && <ProductBlad p={blad.p} uitverkocht={blad.uitverkocht} open={open} bestel={bestel} />}
          {blad.soort === "winkel" && <WinkelBlad adres={blad.adres} open={open} />}
          {blad.soort === "verkoper" && <VerkoperBlad id={blad.id} open={open} />}
        </div>
      </div>
    </div>
  );
}

function ProductBlad({ p, uitverkocht, open, bestel }: { p: Product; uitverkocht?: boolean; open: (b: Blad) => void;
  bestel: (p: Product) => void }) {
  const details = [
    ...p.levering.map((l) => LEVERING[l] ?? l),
    p.plaats,
    p.voorraad !== null && p.voorraad > 0 && p.voorraad <= 5 ? `Nog ${p.voorraad} op voorraad` : "",
  ].filter(Boolean);
  return (
    <>
      {p.foto && <Foto p={p} className="aspect-[4/3] w-full rounded-3xl" />}
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold leading-snug">{p.titel}</h2>
        <span className="text-xl">{euro(p.prijs)}</span>
        {details.length > 0 && <span className="text-sm text-rustig">{details.join(" · ")}</span>}
      </div>
      {p.omschrijving && <p className="whitespace-pre-line text-[15px] leading-relaxed">{p.omschrijving}</p>}
      <button onClick={() => p.bron === "winkel" ? open({ soort: "winkel", adres: p.winkel! }) : open({ soort: "verkoper", id: p.verkoperId! })}
        disabled={p.bron === "winkel" ? !p.winkel : !p.verkoperId}
        className="flex items-center gap-3 rounded-2xl bg-vlak px-4 py-3 text-left disabled:opacity-50">
        <Tas className="size-5 shrink-0 text-rustig" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-medium">{p.verkoper}</span>
          <span className="text-[13px] text-rustig">{p.bron === "winkel" ? "Bekijk winkel" : "Meer van deze verkoper"}</span>
        </span>
        <Terug className="size-4 shrink-0 rotate-180 text-zacht" />
      </button>
      <button onClick={() => bestel(p)} disabled={uitverkocht}
        className="h-12 rounded-2xl bg-accent font-medium text-white disabled:opacity-40">
        {uitverkocht ? "Uitverkocht" : p.bron === "winkel" ? "Bestellen" : "Kopen"}
      </button>
    </>
  );
}

function useLaden<T>(laden: () => Promise<T>, sleutel: string | number) {
  const [staat, setStaat] = useState<{ data?: T; fout?: string }>({});
  useEffect(() => {
    let weg = false;
    setStaat({});
    laden().then((data) => !weg && setStaat({ data }),
      (e) => !weg && setStaat({ fout: e instanceof Error ? e.message : "Dat lukte niet." }));
    return () => { weg = true; };
  }, [sleutel]);
  return staat;
}

const Laden = ({ fout }: { fout?: string }) => fout
  ? <p role="alert" className="py-6 text-sm text-red-600 dark:text-red-400">{fout}</p>
  : <p className="bezig-tekst py-6 text-[15px] text-rustig">Laden</p>;

function WinkelBlad({ adres, open }: { adres: string; open: (b: Blad) => void }) {
  const { data: w, fout } = useLaden<Winkel>(() => winkelBekijken(adres), adres);
  if (!w) return <Laden fout={fout} />;
  return <WinkelPagina w={w} open={(p) => open({ soort: "product", p, uitverkocht: w.uitverkocht.has(p.sleutel) })} />;
}

function VerkoperBlad({ id, open }: { id: number; open: (b: Blad) => void }) {
  const { data: v, fout } = useLaden<Verkoper>(() => verkoperBekijken(id), id);
  if (!v) return <Laden fout={fout} />;
  const vertrouwen = [
    v.sterren !== null ? `${v.sterren.toLocaleString("nl-NL")} van 5 (${v.beoordelingen})` : "",
    v.verkocht ? `${v.verkocht} verkocht` : "",
    v.nieuw ? "Nieuw lid" : "",
  ].filter(Boolean);
  return (
    <>
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold">{v.naam}</h2>
        <span className="text-sm text-rustig">{vertrouwen.length ? vertrouwen.join(" · ") : "Nog geen beoordelingen"}</span>
      </div>
      {v.winkel && (
        <button onClick={() => open({ soort: "winkel", adres: v.winkel!.adres })}
          className="flex items-center gap-3 rounded-2xl bg-vlak px-4 py-3 text-left">
          <Tas className="size-5 shrink-0 text-rustig" />
          <span className="flex-1 font-medium">{v.winkel.naam}</span>
          <span className="text-[13px] text-rustig">Bekijk winkel</span>
        </button>
      )}
      <Raster producten={v.producten} open={(p) => open({ soort: "product", p })} />
    </>
  );
}

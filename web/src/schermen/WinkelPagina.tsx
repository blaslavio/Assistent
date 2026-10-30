import WinkelContactPubliek from "./WinkelContactPubliek";
// Een winkel zoals kopers hem zien, in de stijl en volgorde die de eigenaar koos. Ook gebruikt voor het voorbeeld
// tijdens het ontwerpen, met de opmaak die je nog aan het maken bent.
import { useEffect, useState, type ReactNode } from "react";
import { Foto, Raster } from "./Winkelen";
import { euro, type Product, type Winkel } from "../lib/winkelen";
import { winkelBanner, type Deel, type Opmaak } from "../lib/winkelopmaak";

type Props = { w: Winkel; opmaak?: Opmaak; banner?: string | null; open: (p: Product) => void };

export function WinkelPagina({ w, opmaak = w.opmaak, banner, open }: Props) {
  const [opgehaald, setOpgehaald] = useState<string | null>(null);
  useEffect(() => {
    let weg = false;
    if (banner === undefined && w.heeftBanner) winkelBanner(w.adres).then((b) => !weg && setOpgehaald(b));
    return () => { weg = true; };
  }, [banner, w.adres, w.heeftBanner]);
  const foto = banner === undefined ? opgehaald : banner;
  const verzending = w.verzendkosten === null ? "" : w.verzendkosten === 0 ? "Gratis verzending"
    : `Verzenden ${euro(w.verzendkosten)}${w.gratis_vanaf ? `, gratis vanaf ${euro(w.gratis_vanaf)}` : ""}`;
  const uitgelicht = opmaak.uitgelicht.map((id) => w.producten.find((p) => p.id === id)).filter((p): p is Product => !!p);
  const kleur = { color: w.kleur };

  const delen: Record<Deel, ReactNode> = {
    uitgelicht: uitgelicht.length > 0 && (
      <Sectie titel="Uitgelicht" kleur={w.kleur}>
        {opmaak.stijl === "lijst"
          ? <Lijst producten={uitgelicht} w={w} open={open} />
          : <ul className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
            {uitgelicht.map((p) => (
              <li key={p.sleutel} className="w-36 shrink-0 snap-start">
                <button onClick={() => open(p)} className="flex w-full flex-col gap-1 text-left">
                  <Foto p={p} className="aspect-square w-full rounded-2xl" />
                  <span className="mt-1 line-clamp-1 text-[15px]">{p.titel}</span>
                  <span className="font-semibold">{euro(p.prijs)}</span>
                </button>
              </li>
            ))}
          </ul>}
      </Sectie>
    ),
    producten: (
      <Sectie titel={uitgelicht.length ? "Alle producten" : "Producten"} kleur={w.kleur}>
        {opmaak.stijl === "lijst" ? <Lijst producten={w.producten} w={w} open={open} />
          : opmaak.stijl === "magazine" && w.producten.length > 1 ? <>
            <Groot p={w.producten[0]} w={w} open={open} knop={opmaak.knop} />
            <Raster producten={w.producten.slice(1)} uitverkocht={w.uitverkocht} open={open} />
          </> : <Raster producten={w.producten} uitverkocht={w.uitverkocht} open={open} />}
      </Sectie>
    ),
    over: opmaak.over && (
      <Sectie titel="Over ons" kleur={w.kleur}>
        <p className="whitespace-pre-line text-[15px] leading-relaxed">{opmaak.over}</p>
      </Sectie>
    ),
    vragen: opmaak.vragen.length > 0 && (
      <Sectie titel="Veelgestelde vragen" kleur={w.kleur}>
        <div className="flex flex-col divide-y divide-lijn rounded-2xl bg-vlak">
          {opmaak.vragen.map((v, i) => (
            <details key={i} className="group px-4 py-3">
              <summary className="cursor-pointer list-none font-medium marker:hidden">{v.vraag}</summary>
              {v.antwoord && <p className="mt-2 whitespace-pre-line text-[15px] text-rustig">{v.antwoord}</p>}
            </details>
          ))}
        </div>
      </Sectie>
    ),
    links: opmaak.links.length > 0 && (
      <Sectie titel="Volg ons" kleur={w.kleur}>
        <div className="flex flex-wrap gap-2">
          {opmaak.links.map((l, i) => (
            <a key={i} href={l.url} target="_blank" rel="noopener noreferrer nofollow"
              className="rounded-full bg-vlak px-4 py-2 text-sm font-medium" style={kleur}>{l.label}</a>
          ))}
        </div>
      </Sectie>
    ),
    openingstijden: opmaak.openingstijden && (
      <Sectie titel="Openingstijden" kleur={w.kleur}>
        <p className="whitespace-pre-line text-[15px]">{opmaak.openingstijden}</p>
      </Sectie>
    ),
  };

  return (
    <div className="flex flex-col gap-4">
      {foto ? <img src={foto} alt="" className="aspect-[5/2] w-full rounded-3xl object-cover" />
        : <div className="h-3 rounded-full" style={{ background: w.kleur }} />}
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-semibold leading-tight">{opmaak.kop || w.naam}</h2>
        {opmaak.kop && <span className="text-sm font-medium" style={kleur}>{w.naam}</span>}
        {(opmaak.welkom || w.omschrijving) && (
          <p className="whitespace-pre-line text-[15px] text-rustig">{opmaak.welkom || w.omschrijving}</p>
        )}
        {(verzending || w.winkeladres) && (
          <span className="text-sm text-rustig">{[verzending, w.winkeladres].filter(Boolean).join(" · ")}</span>
        )}
      </div>
      {w.actie && <p className="rounded-2xl px-4 py-2.5 text-[15px] font-medium text-white" style={{ background: w.kleur }}>
        {w.actie}</p>}
      {opmaak.volgorde.map((d) => delen[d] ? <div key={d}>{delen[d]}</div> : null)}
      <WinkelContactPubliek adres={w.adres} />
      {w.retour && <p className="text-[13px] text-rustig">Retour: {w.retour}</p>}
    </div>
  );
}

function Sectie({ titel, kleur, children }: { titel: string; kleur: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3" aria-label={titel}>
      <h3 className="text-lg font-semibold" style={{ color: kleur }}>{titel}</h3>
      {children}
    </section>
  );
}

function Groot({ p, w, open, knop }: { p: Product; w: Winkel; open: (p: Product) => void; knop: string }) {
  const op = w.uitverkocht.has(p.sleutel);
  return (
    <button onClick={() => open(p)} className="mb-4 flex w-full flex-col gap-2 text-left">
      <Foto p={p} className={`aspect-[16/9] w-full rounded-3xl ${op ? "opacity-40" : ""}`} />
      <span className="text-lg font-semibold leading-snug">{p.titel}</span>
      {p.omschrijving && <span className="line-clamp-2 text-[15px] text-rustig">{p.omschrijving}</span>}
      <span className="flex items-center justify-between">
        <span className="text-lg">{op ? "Uitverkocht" : euro(p.prijs)}</span>
        {!op && <span className="rounded-full px-4 py-2 text-sm font-medium text-white" style={{ background: w.kleur }}>
          {knop || "Bekijken"}</span>}
      </span>
    </button>
  );
}

function Lijst({ producten, w, open }: { producten: Product[]; w: Winkel; open: (p: Product) => void }) {
  if (!producten.length) return <p className="text-sm text-rustig">Nu niets te koop.</p>;
  return (
    <ul className="flex flex-col divide-y divide-lijn">
      {producten.map((p) => {
        const op = w.uitverkocht.has(p.sleutel);
        return (
          <li key={p.sleutel}>
            <button onClick={() => open(p)} className="flex w-full items-center gap-3 py-2 text-left">
              <Foto p={p} className={`size-16 shrink-0 rounded-2xl ${op ? "opacity-40" : ""}`} />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="font-medium leading-snug">{p.titel}</span>
                {p.omschrijving && <span className="line-clamp-2 text-[13px] text-rustig">{p.omschrijving}</span>}
                <span className="text-[15px] font-semibold">{op ? <span className="font-normal text-rustig">Uitverkocht</span> : euro(p.prijs)}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

// Winkels op de kaart: winkels in de app (groot, in je accentkleur) en andere winkels in de buurt uit OpenStreetMap.
import { useEffect, useMemo, useState } from "react";
import { Kaart } from "./Kaart";
import { STANDAARD, afstand, afstandTekst, routeLink, samenvoegen, winkelsInBuurt, zoekPlek, type KaartWinkel,
  type Punt, type RouteApp, type Reiswijze } from "../lib/kaart";

export type AppWinkel = { adres: string; naam: string; lat?: number | null; lon?: number | null; producten?: number;
  winkeladres?: string };

export function WinkelKaart({ winkels, thuisadres, open }: { winkels: AppWinkel[]; thuisadres?: string;
  open: (adres: string) => void }) {
  const [midden, setMidden] = useState<Punt | null>(null);
  const [ik, setIk] = useState<Punt | null>(null);
  const [thuis, setThuis] = useState<Punt | null>(null);
  const [osm, setOsm] = useState<KaartWinkel[]>([]);
  const [gekozen, setGekozen] = useState<KaartWinkel | null>(null);
  const [zoek, setZoek] = useState("");
  const [zoekt, setZoekt] = useState(false);
  const [routeApp, setRouteApp] = useState<RouteApp>("google");
  const [reiswijze, setReiswijze] = useState<Reiswijze>("auto");
  const [melding, setMelding] = useState("");

  useEffect(() => {
    let weg = false;
    const zet = (p: Punt) => { if (!weg) { setMidden(p); setThuis(p); } };
    zoekPlek(thuisadres ?? "").then((p) => zet(p ?? STANDAARD)).catch(() => zet(STANDAARD));
    return () => { weg = true; };
  }, [thuisadres]);

  useEffect(() => {
    if (!midden) return;
    let weg = false;
    const t = setTimeout(() => {
      winkelsInBuurt(midden).then((l) => { if (!weg) { setOsm(l); setMelding(""); } })
        .catch((e) => !weg && setMelding(e instanceof Error ? e.message : "Winkels in de buurt laden lukte niet."));
    }, 400);
    return () => { weg = true; clearTimeout(t); };
  }, [midden]);

  const app = useMemo(() => winkels.flatMap((w): KaartWinkel[] => w.lat != null && w.lon != null
    ? [{ lat: w.lat, lon: w.lon, naam: w.naam, soort: "In de app", adres: w.winkeladres || w.adres, app: true, producten: w.producten }]
    : []), [winkels]);
  const alle = useMemo(() => (thuis ? samenvoegen(app, osm, ik ?? thuis) : []), [app, osm, ik, thuis]);

  function bijMij() {
    if (!navigator.geolocation) { setMelding("Je plek is op dit apparaat niet beschikbaar."); return; }
    navigator.geolocation.getCurrentPosition((p) => {
      const plek = { lat: p.coords.latitude, lon: p.coords.longitude };
      setIk(plek);
      setMidden(plek);
    }, () => setMelding("Je plek delen staat uit. Je kunt de kaart ook zelf verschuiven."), { timeout: 8000 });
  }

  if (!midden) return <p className="bezig-tekst py-6 text-[15px] text-rustig">Kaart laden</p>;
  // Afstanden vanaf jou (of je thuisadres), niet vanaf waar de kaart nu staat.
  const vanaf = ik ?? thuis ?? midden;
  return (
    <section className="flex flex-col gap-3" aria-label="Winkelkaart">
      <form className="flex gap-2 rounded-2xl border border-lijn bg-vlak p-2" onSubmit={async e => {
        e.preventDefault(); if (zoekt || !zoek.trim()) return; setZoekt(true); setMelding("");
        try { const p = await zoekPlek(zoek); if (!p) setMelding("Geen bestemming gevonden. Voeg een plaats of land toe."); else { setMidden(p); setGekozen({ ...p, naam: zoek.trim(), soort: "Bestemming", app: false }); } }
        catch { setMelding("Bestemming zoeken lukt niet. Probeer opnieuw."); } finally { setZoekt(false); }
      }}><input aria-label="Zoek bestemming wereldwijd" placeholder="Waar wil je heen? Adres, plaats of land" value={zoek} onChange={e=>setZoek(e.target.value)} className="h-11 min-w-0 flex-1 bg-transparent px-2 outline-none" />
        <button disabled={zoekt || !zoek.trim()} className="h-11 rounded-full bg-accent px-4 text-sm font-medium text-white disabled:opacity-50">{zoekt ? "Zoeken…" : "Zoek"}</button></form>
      <Kaart midden={midden} zet={setMidden} punten={alle} gekozen={gekozen} kies={setGekozen} ik={ik} />
      <div className="flex items-center gap-2">
        <button onClick={bijMij} className="h-9 rounded-full bg-vlak px-4 text-sm font-medium">Bij mij</button>
        <span className="text-[13px] text-rustig">{app.length > 0 ? "Grote punten zijn winkels in de app." : "Sleep om rond te kijken."}</span>
      </div>
      {gekozen && <div className="flex flex-col gap-3 rounded-3xl border border-lijn p-4">
        <div className="flex gap-2"><label className="flex-1 text-xs text-rustig">Navigatie-app<select aria-label="Navigatie-app" value={routeApp} onChange={e=>setRouteApp(e.target.value as RouteApp)} className="mt-1 h-11 w-full rounded-2xl bg-vlak px-3 text-sm text-inkt"><option value="google">Google Maps</option><option value="apple">Apple Kaarten</option><option value="waze">Waze (auto)</option></select></label>
          <label className="flex-1 text-xs text-rustig">Reizen met<select aria-label="Reizen met" disabled={routeApp === "waze"} value={routeApp === "waze" ? "auto" : reiswijze} onChange={e=>setReiswijze(e.target.value as Reiswijze)} className="mt-1 h-11 w-full rounded-2xl bg-vlak px-3 text-sm text-inkt"><option value="auto">Auto</option><option value="lopen">Lopen</option><option value="fiets">Fiets</option><option value="ov">Openbaar vervoer</option></select></label></div>
        <a href={routeLink(gekozen, routeApp, reiswijze)} target="_blank" rel="noreferrer" className="flex min-h-12 items-center justify-center rounded-full bg-accent px-4 font-medium text-white">Navigeer naar {gekozen.naam}</a>
        <p className="text-xs text-rustig">Afstand in de lijst is hemelsbreed. Je navigatie-app berekent de route, reistijd en actuele situatie, ook voor lange afstanden. De gekozen bestemming wordt met die dienst gedeeld.</p>
      </div>}
      {gekozen && (
        <div className="flex items-center gap-3 rounded-2xl bg-vlak p-4">
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate font-medium">{gekozen.naam}</span>
            <span className="truncate text-[13px] text-rustig">
              {[gekozen.soort, afstandTekst(afstand(vanaf, gekozen)), gekozen.app ? `${gekozen.producten ?? 0} producten` : gekozen.adres]
                .filter(Boolean).join(" · ")}
            </span>
          </span>
          {gekozen.app ? (
            <button onClick={() => { const w = winkels.find((x) => x.naam === gekozen.naam && x.lat === gekozen.lat); if (w) open(w.adres); }}
              className="h-10 shrink-0 rounded-full bg-accent px-4 text-sm font-medium text-white">Bekijken</button>
          ) : (
            <a href={routeLink(gekozen, routeApp, reiswijze)} target="_blank" rel="noreferrer"
              className="flex h-10 shrink-0 items-center rounded-full bg-white px-4 text-sm font-medium dark:bg-black/30">Route</a>
          )}
        </div>
      )}
      {melding && <p role="status" className="px-1 text-[13px] text-rustig">{melding}</p>}
      {alle.length > 0 && (
        <ul className="flex flex-col divide-y divide-lijn rounded-2xl bg-vlak" aria-label="Dichtbij">
          {alle.slice(0, 8).map((w, i) => (
            <li key={`${w.naam}-${i}`}>
              <button onClick={() => { setGekozen(w); setMidden({ lat: w.lat, lon: w.lon }); }}
                className="flex w-full items-center gap-3 px-4 py-3 text-left">
                <span className={`size-2.5 shrink-0 rounded-full ${w.app ? "bg-accent" : "bg-[#6b7280]"}`} />
                <span className="min-w-0 flex-1 truncate">{w.naam}</span>
                <span className="shrink-0 text-[13px] text-rustig">{afstandTekst(afstand(vanaf, w))}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

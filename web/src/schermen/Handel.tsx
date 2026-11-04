// Handel: elke soort heeft een eigen wereld. Tweedehands is een fotomuur, winkels een schap met bezorging, diensten
// zijn mensen met een vak en eten zijn zaken met grote kaarten. Wisselen verandert kleur, kop, zoekvraag en indeling.
// Zonder foto tekent de app zelf een kleurvlak met de naam, zodat er nooit grijze vakken staan.
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Bestek, Gereedschap, KaartVouw, Mensen, Tas, Truck, Winkelpand, Zoek } from "../iconen";
import { rpc } from "../api";
import { LEVERING, euro, productFoto, zoeken, type Product } from "../lib/winkelen";
import { Bladen, type Blad } from "./Winkelen";

export type Soort = "alles" | "marktplaats" | "winkels" | "diensten" | "eten";
type Ic = (p: { className?: string }) => ReactNode;
export type WinkelKaartje = { adres: string; naam: string; omschrijving?: string; producten?: number;
  lat?: number | null; lon?: number | null; winkeladres?: string };

type Info = { naam: string; icoon: Ic; vraag: string; woorden: string[] };
export const SOORTEN: Record<Soort, Info> = {
  alles: { naam: "Ontdek", icoon: Zoek, vraag: "Zoek in alles", woorden: [] },
  marktplaats: { naam: "Tweedehands", icoon: Mensen, vraag: "Zoek tweedehands", woorden: ["Kleding", "Fietsen", "Meubels", "Telefoons", "Boeken", "Speelgoed", "Sport", "Vintage"] },
  winkels: { naam: "Winkels", icoon: Winkelpand, vraag: "Zoek een product", woorden: ["Cadeau", "Elektronica", "Huis", "Mode", "Beauty", "Kinderen"] },
  diensten: { naam: "Diensten", icoon: Gereedschap, vraag: "Wat moet er gebeuren?", woorden: ["Klussen", "Schoonmaak", "Bijles", "Kapper", "Fotograaf", "Oppas", "Tuin", "Verhuizen"] },
  eten: { naam: "Eten", icoon: Bestek, vraag: "Waar heb je trek in?", woorden: ["Pizza", "Sushi", "Burger", "Bakker", "Lunch", "Gezond", "Indiaas", "Dessert"] },
};
const VOLGORDE: Soort[] = ["alles", "marktplaats", "winkels", "diensten", "eten"];

// Zaken die eten verkopen herkennen we aan hun naam en omschrijving. Zo is er geen extra instelling nodig.
const ETEN = /restaurant|eetcaf|caf[eé]|pizz|sushi|burger|snack|friet|bakker|brood|lunch|catering|maaltijd|keuken|kebab|shoarma|wok|thai|indiaas|surinaams|poke|bistro|ijs|patisserie|taart|eten|food/i;
export const isEten = (w: { naam: string; omschrijving?: string }) => ETEN.test(`${w.naam} ${w.omschrijving ?? ""}`);

// Een vaste kleur per naam, zodat hetzelfde product of dezelfde zaak overal dezelfde kleur heeft.
// Eén kleur, in tinten: dezelfde naam krijgt overal dezelfde tint van de accentkleur.
const TINTEN = [0, 18, 32, 46, 60];
const hash = (s: string) => [...s].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7);
const verloopStijl = (s: string, hoek = 135): CSSProperties => {
  const t = TINTEN[hash(s) % TINTEN.length];
  return { backgroundImage: `linear-gradient(${hoek}deg, color-mix(in oklab, var(--color-accent) ${100 - t}%, white), color-mix(in oklab, var(--color-accent) ${88 - t / 2}%, black))` };
};
const inloop = (i: number): CSSProperties => ({ animationDelay: `${Math.min(i, 10) * 45}ms` });

const foutVan = (e: unknown) => (e instanceof Error ? e.message : "Dat lukte niet.");
const bron = (s: Soort) => (s === "eten" ? null : s === "alles" ? "alles" : s);

/** De foto van een product, of een eigen kleurvlak met de naam erop als er geen foto is. */
function Beeld({ p, className = "", tekstGroot = false }: { p: Product; className?: string; tekstGroot?: boolean }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let weg = false;
    if (p.foto) productFoto(p.id).then((f) => !weg && setSrc(f));
    return () => { weg = true; };
  }, [p.id, p.foto]);
  if (src) return <span className={`block overflow-hidden ${className}`}><img src={src} alt="" className="size-full object-cover" /></span>;
  const woorden = p.titel.split(/\s+/).filter(Boolean);
  return (
    <span style={verloopStijl(p.titel)} className={`handel-patroon relative flex overflow-hidden ${className}`}>
      <span className="absolute -right-6 -top-6 size-24 rounded-full bg-white/20" />
      <span className="absolute -bottom-8 -left-4 size-20 rounded-full bg-black/10" />
      <span className={`relative mt-auto line-clamp-3 p-3 font-bold leading-[1.1] tracking-tight text-white ${tekstGroot ? "text-[20px]" : "text-[16px]"}`}>
        {woorden.slice(0, 4).join(" ")}
      </span>
    </span>
  );
}

function Initiaal({ naam, className = "" }: { naam: string; className?: string }) {
  return (
    <span style={verloopStijl(naam)} aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-full font-bold text-white ${className}`}>
      {(naam.trim()[0] ?? "?").toUpperCase()}
    </span>
  );
}

export function Handel({ bestel, verkoop, winkel, kaartOpen }: { bestel: (p: Product) => void; verkoop: () => void;
  winkel?: string; kaartOpen?: () => void }) {
  const [soort, setSoort] = useState<Soort>("alles");
  const [zoek, setZoek] = useState("");
  const [term, setTerm] = useState("");
  const [bezorgen, setBezorgen] = useState(false);
  const [producten, setProducten] = useState<Product[] | null>(null);
  const [winkels, setWinkels] = useState<WinkelKaartje[]>([]);
  const [stapel, setStapel] = useState<Blad[]>(() => (winkel ? [{ soort: "winkel", adres: winkel }] : []));
  const [fout, setFout] = useState("");

  useEffect(() => {
    setFout("");
    setProducten(null);
    const b = bron(soort);
    if (b) zoeken(term, { bron: b, bezorgen, max: 40 }).then(setProducten).catch((e) => { setProducten([]); setFout(foutVan(e)); });
    else setProducten([]);
    if (soort === "alles" || soort === "winkels" || soort === "eten")
      rpc<WinkelKaartje[]>("winkels_zoeken", { p_zoekterm: term }).then((w) => setWinkels(Array.isArray(w) ? w : [])).catch(() => setWinkels([]));
  }, [term, soort, bezorgen]);

  const kies = (s: Soort) => { setSoort(s); setZoek(""); setTerm(""); window.scrollTo?.({ top: 0, behavior: "smooth" }); };
  const zoekOp = (w: string) => { setZoek(w); setTerm(w); };
  const open = (p: Product) => setStapel([{ soort: "product", p }]);
  const openWinkel = (adres: string) => setStapel([{ soort: "winkel", adres }]);
  const info = SOORTEN[soort];
  const zoekt = term.trim() !== "";
  const leeg = (tekst: string) => (
    <div className="handel-in relative flex flex-col items-center gap-3 overflow-hidden rounded-2xl bg-vlak px-6 py-8 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-accent/10 text-accent">
        <info.icoon className="size-7" />
      </span>
      <p className="text-[17px] font-semibold">{zoekt ? "Niets gevonden" : tekst}</p>
      <p className="max-w-xs text-sm text-rustig">{bezorgen ? "Zet Bezorgen uit om ook ophalen te zien, of " : ""}zet zelf als eerste iets online.</p>
      <button onClick={verkoop} className="h-10 rounded-full bg-accent px-5 text-sm font-semibold text-white">Verkopen</button>
    </div>
  );
  const laden = (
    <div aria-label="Laden" className="grid grid-cols-2 gap-3">
      {[0, 1, 2, 3].map((i) => <span key={i} className="animate-pulse aspect-[3/4] rounded-3xl bg-vlak" />)}
    </div>
  );

  return (
    <div data-soort={soort} className="flex flex-col pb-10">
      <div className="px-5 pb-2 pt-1">
        <form onSubmit={(e) => { e.preventDefault(); setTerm(zoek); }}
          className="flex h-10 items-center gap-2 rounded-full bg-vlak px-3.5">
          <Zoek className="size-4 shrink-0 text-rustig" />
          <input value={zoek} onChange={(e) => { setZoek(e.target.value); if (!e.target.value) setTerm(""); }}
            placeholder={info.vraag} aria-label="Zoeken" enterKeyHint="search"
            className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-zacht" />
        </form>
      </div>

      {/* Soorten: een zwevende glazen balk die bovenaan blijft staan. */}
      <nav aria-label="Soort" className="handel-glas sticky top-0 z-10 flex gap-1 overflow-x-auto border-b border-lijn px-5 [scrollbar-width:none]">
        {VOLGORDE.map((s) => {
          const I = SOORTEN[s].icoon;
          const aan = soort === s;
          return (
            <button key={s} type="button" aria-pressed={aan} onClick={() => kies(s)}
              className={`-mb-px flex h-11 shrink-0 items-center gap-1.5 border-b-2 px-2.5 text-[14px] transition-colors ${aan
                ? "border-inkt font-semibold text-inkt dark:border-white dark:text-white" : "border-transparent text-rustig"}`}>
              <I className="size-4" />{SOORTEN[s].naam}
            </button>
          );
        })}
      </nav>

      {info.woorden.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto px-5 pt-2.5 [scrollbar-width:none]">
          {(soort === "marktplaats" || soort === "winkels") && (
            <button type="button" aria-pressed={bezorgen} onClick={() => setBezorgen((b) => !b)}
              className={`flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition ${bezorgen ? "border-transparent bg-[#16161a] text-white dark:bg-white dark:text-[#16161a]" : "border-lijn text-rustig"}`}>
              <Truck className="size-3.5" />Bezorgen
            </button>
          )}
          {info.woorden.map((w) => (
            <button key={w} type="button" aria-pressed={term === w} onClick={() => (term === w ? zoekOp("") : zoekOp(w))}
              className={`h-8 shrink-0 rounded-full border px-3 text-[13px] font-medium transition ${term === w ? "border-transparent bg-[#16161a] text-white dark:bg-white dark:text-[#16161a]" : "border-lijn text-rustig"}`}>
              {w}
            </button>
          ))}
        </div>
      )}

      <div key={soort} className="flex flex-col gap-5 px-5 pt-4">
        {fout && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{fout}</p>}
        {soort === "alles" && <Ontdek producten={producten} winkels={winkels} kies={kies} open={open} openWinkel={openWinkel} zoekt={zoekt} term={term} laden={laden} />}
        {soort === "marktplaats" && (producten === null ? laden : producten.length ? <Fotomuur producten={producten} open={open} /> : leeg("Nog niets tweedehands"))}
        {soort === "winkels" && (
          <>
            {!zoekt && kaartOpen && (
              <button type="button" onClick={kaartOpen}
                className="handel-in flex items-center gap-3 rounded-2xl bg-vlak p-3 text-left active:scale-[.98]">
                <span className="flex size-10 items-center justify-center rounded-xl bg-accent/10 text-accent"><KaartVouw className="size-5" /></span>
                <span className="flex flex-col"><span className="text-[15px] font-semibold">Winkels op de kaart</span>
                  <span className="text-[13px] text-rustig">In de buurt, met route erheen</span></span>
              </button>
            )}
            <Winkelrij winkels={winkels.filter((w) => !isEten(w))} open={openWinkel} />
            {producten === null ? laden : producten.length ? <Schap producten={producten} open={open} /> : leeg("Nog geen producten")}
          </>
        )}
        {soort === "diensten" && (producten === null ? laden : producten.length ? <Vakmensen producten={producten} open={open} /> : leeg("Nog geen diensten"))}
        {soort === "eten" && <Zaken winkels={winkels.filter((w) => zoekt || isEten(w))} open={openWinkel} zoekt={zoekt} verkoop={verkoop} />}
        <p className="text-center text-[12px] text-zacht">Er gaat pas iets weg als jij zelf op Bestellen tikt.</p>
      </div>
      <Bladen stapel={stapel} zet={setStapel} bestel={(p) => { setStapel([]); bestel(p); }} />
    </div>
  );
}

/** Ontdek: uitgelichte stukken in een carrousel, winkels als rondjes en wat net binnen is. */
function Ontdek({ producten, winkels, kies, open, openWinkel, zoekt, term, laden }: { producten: Product[] | null;
  winkels: WinkelKaartje[]; kies: (s: Soort) => void; open: (p: Product) => void; openWinkel: (a: string) => void;
  zoekt: boolean; term: string; laden: ReactNode }) {
  const uitgelicht = (producten ?? []).slice(0, 6);
  return (
    <>
      {!zoekt && uitgelicht.length > 0 && (
        <section className="flex flex-col gap-3">
          <h3 className="text-[16px] font-semibold">Uitgelicht</h3>
          <ul aria-label="Uitgelicht" className="-mx-5 flex snap-x snap-mandatory scroll-px-5 gap-2.5 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
            {uitgelicht.map((p, i) => (
              <li key={p.sleutel} className="w-[62%] max-w-xs shrink-0 snap-start">
                <button onClick={() => open(p)} style={inloop(i)} aria-label={`${p.titel}, ${euro(p.prijs)}`}
                  className="handel-in flex w-full flex-col gap-1.5 text-left active:scale-[.98]">
                  <Beeld p={p} tekstGroot className="aspect-[4/3] w-full rounded-2xl" />
                  <span className="flex items-baseline justify-between gap-2 px-0.5">
                    <span className="truncate text-[13px] text-rustig">{p.verkoper}</span>
                    <span className="shrink-0 text-[14px] font-semibold">{euro(p.prijs)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {winkels.length > 0 && <Winkelrondjes winkels={winkels} open={openWinkel} />}
      <section className="flex flex-col gap-3">
        <h3 className="text-[16px] font-semibold">{zoekt ? `Gevonden voor "${term}"` : "Net binnen"}</h3>
        {producten === null ? laden : producten.length ? <Fotomuur producten={producten} open={open} />
          : <p className="text-sm text-rustig">Nog niets te koop.</p>}
      </section>
    </>
  );
}

/** Winkels als rondjes met een kleurring, zoals verhalen bovenin een app. */
function Winkelrondjes({ winkels, open }: { winkels: WinkelKaartje[]; open: (a: string) => void }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-[16px] font-semibold">Winkels</h3>
      <ul className="-mx-5 flex gap-3 overflow-x-auto px-5 [scrollbar-width:none]">
        {winkels.slice(0, 20).map((w, i) => (
          <li key={w.adres} className="shrink-0">
            <button onClick={() => open(w.adres)} style={inloop(i)} className="handel-in flex w-16 flex-col items-center gap-1.5 active:scale-95">
              <span style={verloopStijl(w.naam, 45)} className="rounded-full p-[3px]">
                <span className="flex rounded-full bg-white p-[3px] dark:bg-[#0b0b0e]">
                  <Initiaal naam={w.naam} className="size-12 text-[17px]" />
                </span>
              </span>
              <span className="w-full truncate text-center text-[12px] font-medium">{w.naam}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Tweedehands: een fotomuur in twee kolommen met wisselende hoogtes; de prijs zweeft op de foto. */
function Fotomuur({ producten, open }: { producten: Product[]; open: (p: Product) => void }) {
  const kolommen: Product[][] = [[], []];
  producten.forEach((p, i) => kolommen[i % 2].push(p));
  return (
    <ul aria-label="Te koop" className="grid grid-cols-2 items-start gap-2.5">
      {kolommen.map((kolom, k) => (
        <li key={k} className="flex flex-col gap-3">
          {kolom.map((p, i) => (
            <button key={p.sleutel} onClick={() => open(p)} style={inloop(i * 2 + k)} aria-label={`${p.titel}, ${euro(p.prijs)}`}
              className="handel-in flex w-full flex-col gap-1.5 text-left active:scale-[.97]">
              <span className="relative block">
                <Beeld p={p} className={`w-full rounded-2xl ${(i + k) % 3 === 1 ? "aspect-square" : "aspect-[3/4]"}`} />
                
                {p.levering.includes("verzenden") && (
                  <span className="absolute right-2.5 top-2.5 flex size-7 items-center justify-center rounded-full bg-white/90 text-[#16161a]" title="Verzenden kan">
                    <Truck className="size-3.5" />
                  </span>
                )}
              </span>
              <span className="flex items-baseline justify-between gap-2 px-0.5"><span className="truncate text-[14px]">{p.titel}</span><span className="shrink-0 text-[14px] font-semibold">{euro(p.prijs)}</span></span>
              <span className="-mt-1.5 flex items-center gap-1.5 px-0.5 text-[12px] text-rustig">
                <Initiaal naam={p.verkoper} className="size-4 text-[9px]" />
                <span className="truncate">{[p.verkoper, p.plaats].filter(Boolean).join(" · ")}</span>
              </span>
            </button>
          ))}
        </li>
      ))}
    </ul>
  );
}

/** Winkels: zwevende kaarten met foto, winkel, een grote prijs en hoe het bij je komt. */
function Schap({ producten, open }: { producten: Product[]; open: (p: Product) => void }) {
  return (
    <ul aria-label="Producten" className="flex flex-col gap-2">
      {producten.map((p, i) => (
        <li key={p.sleutel}>
          <button onClick={() => open(p)} style={inloop(i)} aria-label={`${p.titel}, ${euro(p.prijs)}, ${p.verkoper}`}
            className="handel-in flex w-full gap-3 rounded-2xl bg-vlak p-2.5 text-left active:scale-[.98]">
            <Beeld p={p} className="size-20 shrink-0 rounded-xl" />
            <span className="flex min-w-0 flex-1 flex-col gap-1 py-1">
              <span className="truncate text-[12px] text-rustig">{p.verkoper}</span>
              <span className="line-clamp-2 text-[15px] font-medium leading-snug">{p.titel}</span>
              <span className="mt-auto flex items-end justify-between gap-2">
                <span className="text-[17px] font-bold">{euro(p.prijs)}</span>
                <span className={`flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold ${p.voorraad === 0 ? "bg-vlak text-rustig"
                  : p.levering.includes("verzenden") ? "bg-accent/10 text-accent" : "bg-vlak text-rustig"}`}>
                  {p.voorraad === 0 ? "Uitverkocht" : p.levering.includes("verzenden")
                    ? <><Truck className="size-3" />Bezorgd</> : p.levering.map((l) => LEVERING[l] ?? l).join(" · ") || "Ophalen"}
                </span>
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Diensten: de aanbieder voorop, met wat hij doet, waar en vanaf welke prijs. */
function Vakmensen({ producten, open }: { producten: Product[]; open: (p: Product) => void }) {
  return (
    <ul aria-label="Diensten" className="flex flex-col gap-2">
      {producten.map((p, i) => (
        <li key={p.sleutel}>
          <button onClick={() => open(p)} style={inloop(i)} aria-label={`${p.titel}, vanaf ${euro(p.prijs)}, ${p.verkoper}`}
            className="handel-in flex w-full items-start gap-3 rounded-2xl bg-vlak p-3 text-left active:scale-[.98]">
            <Initiaal naam={p.verkoper} className="size-11 text-[16px]" />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="flex items-baseline justify-between gap-2">
                <span className="truncate text-[15px] font-semibold">{p.titel}</span>
                <span className="shrink-0 text-[13px] text-rustig">vanaf <b className="text-[15px] text-inkt dark:text-white">{euro(p.prijs)}</b></span>
              </span>
              <span className="truncate text-[13px] text-rustig">{[p.verkoper, p.plaats, ...p.levering.map((l) => LEVERING[l] ?? l)].filter(Boolean).join(" · ")}</span>
              {p.omschrijving && <span className="line-clamp-1 text-[13px] text-zacht">{p.omschrijving}</span>}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Winkels naast elkaar als kleine kaartjes. */
function Winkelrij({ winkels, open }: { winkels: WinkelKaartje[]; open: (a: string) => void }) {
  if (!winkels.length) return null;
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-[16px] font-semibold">Winkels</h3>
      <ul className="-mx-5 flex snap-x scroll-px-5 gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
        {winkels.slice(0, 20).map((w, i) => (
          <li key={w.adres} className="shrink-0 snap-start">
            <button onClick={() => open(w.adres)} style={inloop(i)}
              className="handel-in flex w-44 items-center gap-2.5 rounded-2xl bg-vlak p-2.5 text-left active:scale-[.97]">
              <span style={verloopStijl(w.naam)} className="flex size-10 shrink-0 items-center justify-center rounded-xl text-[16px] font-bold text-white">
                {(w.naam.trim()[0] ?? "?").toUpperCase()}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[14px] font-semibold">{w.naam}</span>
                <span className="block text-[12px] text-rustig">{w.producten ?? 0} producten</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Eten: zaken als grote kaarten met een kleurbanner, de naam groot in beeld. */
function Zaken({ winkels, open, zoekt, verkoop }: { winkels: WinkelKaartje[]; open: (a: string) => void; zoekt: boolean;
  verkoop: () => void }) {
  if (!winkels.length)
    return (
      <div className="handel-in relative flex flex-col items-center gap-3 overflow-hidden rounded-2xl bg-vlak px-6 py-8 text-center">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-accent/10 text-accent">
          <Bestek className="size-7" />
        </span>
        <p className="text-[17px] font-semibold">{zoekt ? "Geen zaak gevonden" : "Nog geen eetzaken in de app"}</p>
        <p className="max-w-xs text-sm text-rustig">Heb je een restaurant, bakkerij of foodtruck? Open je eigen winkel en zet je menu erin.</p>
        <button onClick={verkoop} className="h-10 rounded-full bg-accent px-5 text-sm font-semibold text-white">Menu online zetten</button>
      </div>
    );
  return (
    <ul aria-label="Eetzaken" className="flex flex-col gap-3">
      {winkels.map((w, i) => (
        <li key={w.adres}>
          <button onClick={() => open(w.adres)} style={inloop(i)}
            className="handel-in flex w-full flex-col overflow-hidden rounded-2xl bg-vlak text-left active:scale-[.98]">
            <span style={verloopStijl(w.naam)} className="handel-patroon relative flex h-28 items-end overflow-hidden p-4">
              <Bestek className="absolute -right-3 -top-3 size-24 rotate-12 text-white/15" />
              <span className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/25 to-transparent" />
              <span className="relative text-[20px] font-bold leading-tight text-white">{w.naam}</span>
              <span className="handel-glas absolute right-4 top-4 flex items-center gap-1 rounded-full px-3 py-1 text-[12px] font-semibold">
                <Tas className="size-3.5" />{w.producten ?? 0} op het menu
              </span>
            </span>
            <span className="flex items-center justify-between gap-2 px-4 py-2.5">
              <span className="min-w-0 flex-1 truncate text-[14px] text-rustig">{w.omschrijving || "Bekijk het menu"}</span>
              <span className="shrink-0 rounded-full bg-accent px-3.5 py-1.5 text-[13px] font-semibold text-white">Menu</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

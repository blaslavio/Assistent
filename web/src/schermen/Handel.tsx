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

type Info = { naam: string; icoon: Ic; vraag: string; kop: string; onder: string; vlekken: [string, string, string];
  verloop: string; woorden: string[] };
export const SOORTEN: Record<Soort, Info> = {
  alles: { naam: "Ontdek", icoon: Zoek, vraag: "Zoek in alles", kop: "Alles op één plek", onder: "Spullen, winkels, vakmensen en eten bij jou in de buurt.",
    vlekken: ["#818cf8", "#f472b6", "#fbbf24"], verloop: "from-indigo-500 via-fuchsia-500 to-amber-400", woorden: [] },
  marktplaats: { naam: "Tweedehands", icoon: Mensen, vraag: "Zoek tweedehands", kop: "Tweede leven", onder: "Van mensen uit de buurt. Betalen gaat veilig via de app.",
    vlekken: ["#2dd4bf", "#34d399", "#a3e635"], verloop: "from-teal-500 to-emerald-400",
    woorden: ["Kleding", "Fietsen", "Meubels", "Telefoons", "Boeken", "Speelgoed", "Sport", "Vintage"] },
  winkels: { naam: "Winkels", icoon: Winkelpand, vraag: "Zoek een product", kop: "Nieuw uit de winkel", onder: "Lokale zaken en webshops, met bezorgen of ophalen.",
    vlekken: ["#38bdf8", "#818cf8", "#22d3ee"], verloop: "from-sky-500 to-indigo-500",
    woorden: ["Cadeau", "Elektronica", "Huis", "Mode", "Beauty", "Kinderen"] },
  diensten: { naam: "Diensten", icoon: Gereedschap, vraag: "Wat moet er gebeuren?", kop: "Iemand die het kan", onder: "Klussers, bijles, kappers en meer. Jij kiest, zij komen.",
    vlekken: ["#fbbf24", "#fb923c", "#f87171"], verloop: "from-amber-500 to-orange-500",
    woorden: ["Klussen", "Schoonmaak", "Bijles", "Kapper", "Fotograaf", "Oppas", "Tuin", "Verhuizen"] },
  eten: { naam: "Eten", icoon: Bestek, vraag: "Waar heb je trek in?", kop: "Waar heb je trek in?", onder: "Restaurants, bakkers en foodtrucks uit de buurt.",
    vlekken: ["#fb7185", "#f472b6", "#fb923c"], verloop: "from-rose-500 to-orange-400",
    woorden: ["Pizza", "Sushi", "Burger", "Bakker", "Lunch", "Gezond", "Indiaas", "Dessert"] },
};
const VOLGORDE: Soort[] = ["alles", "marktplaats", "winkels", "diensten", "eten"];

// Zaken die eten verkopen herkennen we aan hun naam en omschrijving. Zo is er geen extra instelling nodig.
const ETEN = /restaurant|eetcaf|caf[eé]|pizz|sushi|burger|snack|friet|bakker|brood|lunch|catering|maaltijd|keuken|kebab|shoarma|wok|thai|indiaas|surinaams|poke|bistro|ijs|patisserie|taart|eten|food/i;
export const isEten = (w: { naam: string; omschrijving?: string }) => ETEN.test(`${w.naam} ${w.omschrijving ?? ""}`);

// Een vaste kleur per naam, zodat hetzelfde product of dezelfde zaak overal dezelfde kleur heeft.
const KLEUREN: [string, string][] = [["#f43f5e", "#fb923c"], ["#8b5cf6", "#ec4899"], ["#06b6d4", "#3b82f6"],
  ["#10b981", "#14b8a6"], ["#6366f1", "#a855f7"], ["#f97316", "#facc15"], ["#0ea5e9", "#22d3ee"], ["#e11d48", "#9333ea"]];
const hash = (s: string) => [...s].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7);
const kleur = (s: string) => KLEUREN[hash(s) % KLEUREN.length];
const verloopStijl = (s: string, hoek = 135): CSSProperties => {
  const [a, b] = kleur(s);
  return { backgroundImage: `linear-gradient(${hoek}deg, ${a}, ${b})` };
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
      <span className={`relative mt-auto line-clamp-3 p-3 font-extrabold leading-[1.05] tracking-tight text-white drop-shadow-sm ${tekstGroot ? "text-[26px]" : "text-[19px]"}`}>
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
    <div className="handel-in relative flex flex-col items-center gap-3 overflow-hidden rounded-[28px] bg-vlak px-6 py-10 text-center">
      <span className={`flex size-16 items-center justify-center rounded-3xl bg-gradient-to-br ${info.verloop} text-white shadow-lg`}>
        <info.icoon className="size-8" />
      </span>
      <p className="text-[17px] font-semibold">{zoekt ? "Niets gevonden" : tekst}</p>
      <p className="max-w-xs text-sm text-rustig">{bezorgen ? "Zet Bezorgen uit om ook ophalen te zien, of " : ""}zet zelf als eerste iets online.</p>
      <button onClick={verkoop} className="h-11 rounded-full bg-[#16161a] px-6 text-sm font-semibold text-white dark:bg-white dark:text-[#16161a]">Verkopen</button>
    </div>
  );
  const laden = (
    <div aria-label="Laden" className="grid grid-cols-2 gap-3">
      {[0, 1, 2, 3].map((i) => <span key={i} className="animate-pulse aspect-[3/4] rounded-3xl bg-vlak" />)}
    </div>
  );

  return (
    <div data-soort={soort} className="flex flex-col pb-10">
      {/* De kop: zwevende kleurvlekken, een grote titel en een glazen zoekbalk. */}
      <div className="relative overflow-hidden px-6 pb-6 pt-2">
        <span aria-hidden className="handel-vlek -left-10 -top-10 size-48" style={{ background: info.vlekken[0] }} />
        <span aria-hidden className="handel-vlek -right-12 top-4 size-44" style={{ background: info.vlekken[1], animationDelay: "-5s" }} />
        <span aria-hidden className="handel-vlek bottom-0 left-1/3 size-36" style={{ background: info.vlekken[2], animationDelay: "-9s" }} />
        <div key={soort} className="handel-in relative flex flex-col gap-1 pb-4 pt-3">
          <h2 className="text-[32px] font-extrabold leading-[1.05] tracking-tight">{info.kop}</h2>
          <p className="text-[15px] text-rustig">{info.onder}</p>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); setTerm(zoek); }}
          className="handel-glas relative flex items-center gap-2 rounded-2xl px-4 shadow-[0_8px_30px_rgb(0_0_0/0.08)] ring-1 ring-white/60 dark:ring-white/10">
          <Zoek className="size-5 shrink-0 text-rustig" />
          <input value={zoek} onChange={(e) => { setZoek(e.target.value); if (!e.target.value) setTerm(""); }}
            placeholder={info.vraag} aria-label="Zoeken" enterKeyHint="search"
            className="h-14 flex-1 bg-transparent text-[16px] outline-none placeholder:text-rustig" />
        </form>
      </div>

      {/* Soorten: een zwevende glazen balk die bovenaan blijft staan. */}
      <nav aria-label="Soort" className="handel-glas sticky top-0 z-10 -mt-1 flex gap-1.5 overflow-x-auto px-6 py-2.5 [scrollbar-width:none]">
        {VOLGORDE.map((s) => {
          const I = SOORTEN[s].icoon;
          const aan = soort === s;
          return (
            <button key={s} type="button" aria-pressed={aan} onClick={() => kies(s)}
              className={`flex h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-[14px] transition-all duration-300 ${aan
                ? `bg-gradient-to-r ${SOORTEN[s].verloop} font-semibold text-white shadow-md` : "text-rustig hover:bg-vlak"}`}>
              <I className="size-4" />{SOORTEN[s].naam}
            </button>
          );
        })}
      </nav>

      {info.woorden.length > 0 && (
        <div className="flex gap-2 overflow-x-auto px-6 pt-3 [scrollbar-width:none]">
          {(soort === "marktplaats" || soort === "winkels") && (
            <button type="button" aria-pressed={bezorgen} onClick={() => setBezorgen((b) => !b)}
              className={`flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium transition ${bezorgen ? "border-transparent bg-[#16161a] text-white dark:bg-white dark:text-[#16161a]" : "border-lijn text-rustig"}`}>
              <Truck className="size-3.5" />Bezorgen
            </button>
          )}
          {info.woorden.map((w) => (
            <button key={w} type="button" aria-pressed={term === w} onClick={() => (term === w ? zoekOp("") : zoekOp(w))}
              className={`h-9 shrink-0 rounded-full border px-3.5 text-[13px] font-medium transition ${term === w ? "border-transparent bg-[#16161a] text-white dark:bg-white dark:text-[#16161a]" : "border-lijn text-rustig"}`}>
              {w}
            </button>
          ))}
        </div>
      )}

      <div key={soort} className="flex flex-col gap-7 px-6 pt-5">
        {fout && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{fout}</p>}
        {soort === "alles" && <Ontdek producten={producten} winkels={winkels} kies={kies} open={open} openWinkel={openWinkel} zoekt={zoekt} term={term} laden={laden} />}
        {soort === "marktplaats" && (producten === null ? laden : producten.length ? <Fotomuur producten={producten} open={open} /> : leeg("Nog niets tweedehands"))}
        {soort === "winkels" && (
          <>
            {!zoekt && kaartOpen && (
              <button type="button" onClick={kaartOpen}
                className="handel-in relative flex items-center gap-4 overflow-hidden rounded-[28px] bg-gradient-to-br from-sky-500 to-indigo-600 p-5 text-left text-white shadow-lg active:scale-[.98]">
                <span className="handel-patroon absolute inset-0 opacity-60" />
                <span className="relative flex size-12 items-center justify-center rounded-2xl bg-white/20"><KaartVouw className="size-6" /></span>
                <span className="relative flex flex-col"><span className="text-[17px] font-bold">Winkels op de kaart</span>
                  <span className="text-[13px] text-white/80">In de buurt, met route erheen</span></span>
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

/** Ontdek: een bento met vier deuren, uitgelichte stukken in een carrousel, winkels als rondjes en wat net binnen is. */
function Ontdek({ producten, winkels, kies, open, openWinkel, zoekt, term, laden }: { producten: Product[] | null;
  winkels: WinkelKaartje[]; kies: (s: Soort) => void; open: (p: Product) => void; openWinkel: (a: string) => void;
  zoekt: boolean; term: string; laden: ReactNode }) {
  const deur = (s: Soort, groot: boolean, i: number) => {
    const I = SOORTEN[s].icoon;
    return (
      <button key={s} type="button" onClick={() => kies(s)} style={inloop(i)}
        className={`handel-in group relative flex flex-col justify-end overflow-hidden rounded-[28px] bg-gradient-to-br ${SOORTEN[s].verloop} w-full p-4 text-left text-white shadow-lg transition active:scale-[.97] ${groot ? "row-span-2 min-h-[15rem]" : "min-h-[7rem]"}`}>
        <span className="handel-patroon absolute inset-0 opacity-50" />
        <span className="absolute -right-5 -top-5 size-28 rounded-full bg-white/15 transition-transform duration-500 group-hover:scale-125" />
        <I className={`absolute right-4 top-4 text-white/90 ${groot ? "size-14" : "size-8"}`} />
        <span className={`relative font-extrabold tracking-tight ${groot ? "text-[21px] leading-none" : "text-[18px]"}`}>{SOORTEN[s].naam}</span>
        {groot && <span className="relative mt-1 text-[13px] text-white/85">{SOORTEN[s].onder}</span>}
      </button>
    );
  };
  const uitgelicht = (producten ?? []).slice(0, 6);
  return (
    <>
      {!zoekt && (
        <div className="grid grid-cols-2 gap-3">
          {deur("marktplaats", true, 0)}{deur("winkels", false, 1)}{deur("diensten", false, 2)}
          <div className="col-span-2 flex">{deur("eten", false, 3)}</div>
        </div>
      )}
      {!zoekt && uitgelicht.length > 0 && (
        <section className="flex flex-col gap-3">
          <h3 className="text-[20px] font-bold tracking-tight">Uitgelicht</h3>
          <ul aria-label="Uitgelicht" className="-mx-6 flex snap-x snap-mandatory gap-3 overflow-x-auto px-6 pb-2 [scrollbar-width:none]">
            {uitgelicht.map((p, i) => (
              <li key={p.sleutel} className="w-[78%] max-w-sm shrink-0 snap-center">
                <button onClick={() => open(p)} style={inloop(i)} aria-label={`${p.titel}, ${euro(p.prijs)}`}
                  className="handel-in relative block w-full overflow-hidden rounded-[28px] text-left shadow-lg active:scale-[.98]">
                  <Beeld p={p} tekstGroot className="aspect-[4/3] w-full" />
                  <span className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/55 to-transparent" />
                  <span className="handel-glas absolute left-3 top-3 rounded-full px-3 py-1 text-[15px] font-bold">{euro(p.prijs)}</span>
                  <span className="absolute bottom-3 left-4 right-4 flex items-center gap-2 text-white">
                    <Initiaal naam={p.verkoper} className="size-7 text-xs ring-2 ring-white/60" />
                    <span className="truncate text-[13px] font-medium">{p.verkoper}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {winkels.length > 0 && <Winkelrondjes winkels={winkels} open={openWinkel} />}
      <section className="flex flex-col gap-3">
        <h3 className="text-[20px] font-bold tracking-tight">{zoekt ? `Gevonden voor "${term}"` : "Net binnen"}</h3>
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
      <h3 className="text-[20px] font-bold tracking-tight">Winkels</h3>
      <ul className="-mx-6 flex gap-4 overflow-x-auto px-6 [scrollbar-width:none]">
        {winkels.slice(0, 20).map((w, i) => (
          <li key={w.adres} className="shrink-0">
            <button onClick={() => open(w.adres)} style={inloop(i)} className="handel-in flex w-[4.5rem] flex-col items-center gap-1.5 active:scale-95">
              <span style={verloopStijl(w.naam, 45)} className="rounded-full p-[3px]">
                <span className="flex rounded-full bg-white p-[3px] dark:bg-[#0b0b0e]">
                  <Initiaal naam={w.naam} className="size-14 text-[20px]" />
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
    <ul aria-label="Te koop" className="grid grid-cols-2 items-start gap-3">
      {kolommen.map((kolom, k) => (
        <li key={k} className="flex flex-col gap-4">
          {kolom.map((p, i) => (
            <button key={p.sleutel} onClick={() => open(p)} style={inloop(i * 2 + k)} aria-label={`${p.titel}, ${euro(p.prijs)}`}
              className="handel-in flex w-full flex-col gap-2 text-left active:scale-[.97]">
              <span className="relative block">
                <Beeld p={p} className={`w-full rounded-3xl shadow-sm ${(i + k) % 3 === 1 ? "aspect-square" : "aspect-[3/4]"}`} />
                <span className="handel-glas absolute left-2.5 top-2.5 rounded-full px-2.5 py-1 text-[14px] font-bold">{euro(p.prijs)}</span>
                {p.levering.includes("verzenden") && (
                  <span className="absolute right-2.5 top-2.5 flex size-7 items-center justify-center rounded-full bg-white/90 text-[#16161a]" title="Verzenden kan">
                    <Truck className="size-3.5" />
                  </span>
                )}
              </span>
              <span className="line-clamp-1 px-0.5 text-[14px] font-medium">{p.titel}</span>
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
    <ul aria-label="Producten" className="flex flex-col gap-3">
      {producten.map((p, i) => (
        <li key={p.sleutel}>
          <button onClick={() => open(p)} style={inloop(i)} aria-label={`${p.titel}, ${euro(p.prijs)}, ${p.verkoper}`}
            className="handel-in flex w-full gap-4 rounded-[24px] bg-white p-3 text-left shadow-[0_4px_24px_rgb(0_0_0/0.06)] ring-1 ring-lijn active:scale-[.98] dark:bg-white/5">
            <Beeld p={p} className="size-28 shrink-0 rounded-2xl" />
            <span className="flex min-w-0 flex-1 flex-col gap-1 py-1">
              <span className="truncate text-[12px] font-semibold uppercase tracking-wide text-sky-600 dark:text-sky-400">{p.verkoper}</span>
              <span className="line-clamp-2 text-[15px] font-medium leading-snug">{p.titel}</span>
              <span className="mt-auto flex items-end justify-between gap-2">
                <span className="text-[22px] font-extrabold tracking-tight">{euro(p.prijs)}</span>
                <span className={`flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold ${p.voorraad === 0 ? "bg-vlak text-rustig"
                  : p.levering.includes("verzenden") ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-vlak text-rustig"}`}>
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

/** Diensten: de vakman of -vrouw voorop, met een kleurband, wat ze doen, waar en vanaf welke prijs. */
function Vakmensen({ producten, open }: { producten: Product[]; open: (p: Product) => void }) {
  return (
    <ul aria-label="Diensten" className="flex flex-col gap-4">
      {producten.map((p, i) => (
        <li key={p.sleutel}>
          <button onClick={() => open(p)} style={inloop(i)} aria-label={`${p.titel}, vanaf ${euro(p.prijs)}, ${p.verkoper}`}
            className="handel-in relative flex w-full flex-col overflow-hidden rounded-[28px] bg-white text-left shadow-[0_4px_24px_rgb(0_0_0/0.06)] ring-1 ring-lijn active:scale-[.98] dark:bg-white/5">
            <span style={verloopStijl(p.verkoper, 120)} className="handel-patroon relative h-16" />
            <span className="relative -mt-9 px-4"><span className="inline-flex rounded-full bg-white p-1 dark:bg-[#16161a]"><Initiaal naam={p.verkoper} className="size-14 text-[22px]" /></span></span>
            <span className="flex items-end gap-3 px-4 pt-1">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-semibold">{p.verkoper}</span>
                {p.plaats && <span className="block truncate text-[12px] text-rustig">{p.plaats}</span>}
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-[11px] text-rustig">vanaf</span>
                <span className="block text-[20px] font-extrabold leading-none tracking-tight">{euro(p.prijs)}</span>
              </span>
            </span>
            <span className="flex flex-col gap-2 px-4 pb-4 pt-2">
              <span className="text-[17px] font-bold leading-snug tracking-tight">{p.titel}</span>
              {p.omschrijving && <span className="line-clamp-2 text-[14px] text-rustig">{p.omschrijving}</span>}
              <span className="flex flex-wrap gap-1.5">
                {p.levering.map((l) => (
                  <span key={l} className="rounded-full bg-amber-500/12 px-2.5 py-1 text-[12px] font-medium text-amber-700 dark:text-amber-300">{LEVERING[l] ?? l}</span>
                ))}
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Winkels naast elkaar, elk met een eigen kleurbanner. */
function Winkelrij({ winkels, open }: { winkels: WinkelKaartje[]; open: (a: string) => void }) {
  if (!winkels.length) return null;
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-[20px] font-bold tracking-tight">Winkels</h3>
      <ul className="-mx-6 flex snap-x scroll-px-6 gap-3 overflow-x-auto px-6 pb-2 [scrollbar-width:none]">
        {winkels.slice(0, 20).map((w, i) => (
          <li key={w.adres} className="shrink-0 snap-start">
            <button onClick={() => open(w.adres)} style={inloop(i)}
              className="handel-in flex w-44 flex-col overflow-hidden rounded-3xl bg-white text-left shadow-[0_4px_24px_rgb(0_0_0/0.06)] ring-1 ring-lijn active:scale-[.97] dark:bg-white/5">
              <span style={verloopStijl(w.naam)} className="handel-patroon relative h-20" />
              <span className="relative -mt-7 ml-3 flex size-12 items-center justify-center rounded-2xl bg-white text-[18px] font-extrabold shadow-md dark:bg-[#16161a]">
                {(w.naam.trim()[0] ?? "?").toUpperCase()}
              </span>
              <span className="truncate px-3 pt-2 text-[15px] font-semibold">{w.naam}</span>
              <span className="px-3 pb-3 text-[12px] text-rustig">{w.producten ?? 0} producten</span>
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
      <div className="handel-in relative flex flex-col items-center gap-3 overflow-hidden rounded-[28px] bg-vlak px-6 py-10 text-center">
        <span className="flex size-16 items-center justify-center rounded-3xl bg-gradient-to-br from-rose-500 to-orange-400 text-white shadow-lg">
          <Bestek className="size-8" />
        </span>
        <p className="text-[17px] font-semibold">{zoekt ? "Geen zaak gevonden" : "Nog geen eetzaken in de app"}</p>
        <p className="max-w-xs text-sm text-rustig">Heb je een restaurant, bakkerij of foodtruck? Open je eigen winkel en zet je menu erin.</p>
        <button onClick={verkoop} className="h-11 rounded-full bg-[#16161a] px-6 text-sm font-semibold text-white dark:bg-white dark:text-[#16161a]">Menu online zetten</button>
      </div>
    );
  return (
    <ul aria-label="Eetzaken" className="flex flex-col gap-5">
      {winkels.map((w, i) => (
        <li key={w.adres}>
          <button onClick={() => open(w.adres)} style={inloop(i)}
            className="handel-in group flex w-full flex-col overflow-hidden rounded-[28px] bg-white text-left shadow-[0_8px_30px_rgb(0_0_0/0.08)] ring-1 ring-lijn active:scale-[.98] dark:bg-white/5">
            <span style={verloopStijl(w.naam)} className="handel-patroon relative flex h-44 items-end overflow-hidden p-5">
              <Bestek className="absolute -right-4 -top-4 size-36 rotate-12 text-white/20 transition-transform duration-700 group-hover:rotate-0" />
              <span className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/40 to-transparent" />
              <span className="relative text-[28px] font-extrabold leading-[1.05] tracking-tight text-white">{w.naam}</span>
              <span className="handel-glas absolute right-4 top-4 flex items-center gap-1 rounded-full px-3 py-1 text-[12px] font-semibold">
                <Tas className="size-3.5" />{w.producten ?? 0} op het menu
              </span>
            </span>
            <span className="flex items-center justify-between gap-2 px-5 py-4">
              <span className="min-w-0 flex-1 truncate text-[14px] text-rustig">{w.omschrijving || "Bekijk het menu"}</span>
              <span className="shrink-0 rounded-full bg-gradient-to-r from-rose-500 to-orange-400 px-4 py-2 text-[13px] font-semibold text-white">Menu</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

// Handel: elke soort heeft een eigen scherm. Tweedehands is een fotomuur, winkels een overzichtelijke lijst met
// bezorging, diensten zijn aanbieders met wat ze doen en eten zijn zaken met een grote kaart. Wisselen verandert
// het hele scherm: kleur, zoekvraag en indeling.
import { useEffect, useState, type ReactNode } from "react";
import { Bestek, Gereedschap, KaartVouw, Mensen, Tas, Truck, Winkelpand, Zoek } from "../iconen";
import { Rondje } from "../rondje";
import { rpc } from "../api";
import { LEVERING, euro, zoeken, type Product } from "../lib/winkelen";
import { Bladen, Foto, type Blad } from "./Winkelen";

export type Soort = "alles" | "marktplaats" | "winkels" | "diensten" | "eten";
type Ic = (p: { className?: string }) => ReactNode;
export type WinkelKaartje = { adres: string; naam: string; omschrijving?: string; producten?: number;
  lat?: number | null; lon?: number | null; winkeladres?: string };

// Per soort: naam, icoon, zoekvraag, kleurverloop van de kop en snelle zoekwoorden.
export const SOORTEN: Record<Soort, { naam: string; icoon: Ic; vraag: string; kop: string; woorden: string[] }> = {
  alles: { naam: "Ontdek", icoon: Zoek, vraag: "Zoek in alles", kop: "from-accent/20 via-accent/5", woorden: [] },
  marktplaats: { naam: "Tweedehands", icoon: Mensen, vraag: "Zoek tweedehands", kop: "from-teal-400/25 via-teal-400/5",
    woorden: ["Kleding", "Fietsen", "Meubels", "Telefoons", "Boeken", "Speelgoed", "Sport", "Vintage"] },
  winkels: { naam: "Winkels", icoon: Winkelpand, vraag: "Zoek een product", kop: "from-sky-400/25 via-sky-400/5",
    woorden: ["Cadeau", "Elektronica", "Huis", "Mode", "Beauty", "Kinderen"] },
  diensten: { naam: "Diensten", icoon: Gereedschap, vraag: "Wat moet er gebeuren?", kop: "from-amber-400/25 via-amber-400/5",
    woorden: ["Klussen", "Schoonmaak", "Bijles", "Kapper", "Fotograaf", "Oppas", "Tuin", "Verhuizen"] },
  eten: { naam: "Eten", icoon: Bestek, vraag: "Waar heb je trek in?", kop: "from-rose-400/25 via-rose-400/5",
    woorden: ["Pizza", "Sushi", "Burger", "Bakker", "Lunch", "Gezond", "Indiaas", "Dessert"] },
};
const VOLGORDE: Soort[] = ["alles", "marktplaats", "winkels", "diensten", "eten"];

// Zaken die eten verkopen herkennen we aan hun naam en omschrijving. Zo is er geen extra instelling nodig.
const ETEN = /restaurant|eetcaf|caf[eé]|pizz|sushi|burger|snack|friet|bakker|brood|lunch|catering|maaltijd|keuken|kebab|shoarma|wok|thai|indiaas|surinaams|poke|bistro|ijs|patisserie|taart|eten|food/i;
export const isEten = (w: { naam: string; omschrijving?: string }) => ETEN.test(`${w.naam} ${w.omschrijving ?? ""}`);

// Een vaste kleur per zaak, zodat dezelfde winkel overal dezelfde banner heeft.
const BANNERS = ["from-rose-400 to-orange-300", "from-amber-400 to-lime-300", "from-emerald-400 to-teal-300",
  "from-sky-400 to-indigo-300", "from-violet-400 to-fuchsia-300", "from-pink-400 to-rose-300"];
const banner = (s: string) => BANNERS[[...s].reduce((n, c) => n + c.charCodeAt(0), 0) % BANNERS.length];

const foutVan = (e: unknown) => (e instanceof Error ? e.message : "Dat lukte niet.");
const bron = (s: Soort) => (s === "eten" ? null : s === "alles" ? "alles" : s);

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

  const kies = (s: Soort) => { setSoort(s); setZoek(""); setTerm(""); window.scrollTo?.({ top: 0 }); };
  const zoekOp = (w: string) => { setZoek(w); setTerm(w); };
  const open = (p: Product) => setStapel([{ soort: "product", p }]);
  const openWinkel = (adres: string) => setStapel([{ soort: "winkel", adres }]);
  const info = SOORTEN[soort];
  const zoekt = term.trim() !== "";
  const leeg = (tekst: string) => (
    <div className="flex flex-col items-center gap-3 rounded-3xl bg-vlak px-6 py-8 text-center">
      <info.icoon className="size-8 text-zacht" />
      <p className="font-medium">{zoekt ? "Niets gevonden" : tekst}</p>
      <p className="text-sm text-rustig">{bezorgen ? "Zet Bezorgen uit om ook ophalen te zien, of " : ""}zet zelf als eerste iets online.</p>
      <button onClick={verkoop} className="h-10 rounded-full bg-accent px-5 text-sm font-medium text-white">Verkopen</button>
    </div>
  );
  const laden = <p className="bezig-tekst py-6 text-[15px] text-rustig">Laden</p>;

  return (
    <div data-soort={soort} className="flex flex-col pb-8">
      <div className={`flex flex-col gap-4 bg-gradient-to-b ${info.kop} to-transparent px-6 pb-5 pt-1 transition-colors`}>
        <nav aria-label="Soort" className="-mx-6 flex gap-1.5 overflow-x-auto px-6 [scrollbar-width:none]">
          {VOLGORDE.map((s) => {
            const I = SOORTEN[s].icoon;
            return (
              <button key={s} type="button" aria-pressed={soort === s} onClick={() => kies(s)}
                className={`flex h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-[14px] transition ${soort === s
                  ? "bg-[#16161a] font-semibold text-white shadow-sm dark:bg-white dark:text-[#16161a]" : "bg-white/70 text-rustig dark:bg-white/10"}`}>
                <I className="size-4" />{SOORTEN[s].naam}
              </button>
            );
          })}
        </nav>
        <form onSubmit={(e) => { e.preventDefault(); setTerm(zoek); }}
          className="flex items-center gap-2 rounded-2xl bg-white px-4 shadow-sm ring-1 ring-lijn dark:bg-[#16161a]">
          <Zoek className="size-5 shrink-0 text-zacht" />
          <input value={zoek} onChange={(e) => { setZoek(e.target.value); if (!e.target.value) setTerm(""); }}
            placeholder={info.vraag} aria-label="Zoeken" enterKeyHint="search"
            className="h-12 flex-1 bg-transparent outline-none placeholder:text-zacht" />
        </form>
        {info.woorden.length > 0 && (
          <div className="-mx-6 flex gap-2 overflow-x-auto px-6 [scrollbar-width:none]">
            {(soort === "marktplaats" || soort === "winkels") && (
              <button type="button" aria-pressed={bezorgen} onClick={() => setBezorgen((b) => !b)}
                className={`flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] ${bezorgen ? "bg-accent text-white" : "bg-white/70 text-rustig dark:bg-white/10"}`}>
                <Truck className="size-3.5" />Bezorgen
              </button>
            )}
            {info.woorden.map((w) => (
              <button key={w} type="button" aria-pressed={term === w} onClick={() => (term === w ? zoekOp("") : zoekOp(w))}
                className={`h-8 shrink-0 rounded-full px-3 text-[13px] ${term === w ? "bg-accent text-white" : "bg-white/70 text-rustig dark:bg-white/10"}`}>
                {w}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-6 px-6">
        {fout && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{fout}</p>}
        {soort === "alles" && <Ontdek producten={producten} winkels={winkels} kies={kies} open={open} openWinkel={openWinkel} zoekt={zoekt} term={term} laden={laden} />}
        {soort === "marktplaats" && (producten === null ? laden : producten.length ? <Fotomuur producten={producten} open={open} /> : leeg("Nog niets tweedehands"))}
        {soort === "winkels" && (
          <>
            {!zoekt && kaartOpen && (
              <button type="button" onClick={kaartOpen} className="flex items-center gap-3 rounded-2xl bg-vlak p-4 text-left">
                <span className="flex size-11 items-center justify-center rounded-2xl bg-sky-500 text-white"><KaartVouw className="size-5" /></span>
                <span className="flex flex-col"><span className="font-medium">Winkels op de kaart</span>
                  <span className="text-[13px] text-rustig">In de buurt, met route</span></span>
              </button>
            )}
            {winkels.length > 0 && <Winkelrij winkels={winkels.filter((w) => !isEten(w))} open={openWinkel} />}
            {producten === null ? laden : producten.length ? <Schaplijst producten={producten} open={open} /> : leeg("Nog geen producten")}
          </>
        )}
        {soort === "diensten" && (producten === null ? laden : producten.length ? <Aanbieders producten={producten} open={open} /> : leeg("Nog geen diensten"))}
        {soort === "eten" && <Zaken winkels={winkels.filter((w) => zoekt || isEten(w))} open={openWinkel} zoekt={zoekt} verkoop={verkoop} />}
        <p className="text-[13px] text-zacht">Er gaat pas iets weg als jij zelf op Bestellen tikt.</p>
      </div>
      <Bladen stapel={stapel} zet={setStapel} bestel={(p) => { setStapel([]); bestel(p); }} />
    </div>
  );
}

/** Ontdek: vier grote deuren naar de soorten, daarna wat net binnen is. */
function Ontdek({ producten, winkels, kies, open, openWinkel, zoekt, term, laden }: { producten: Product[] | null;
  winkels: WinkelKaartje[]; kies: (s: Soort) => void; open: (p: Product) => void; openWinkel: (a: string) => void;
  zoekt: boolean; term: string; laden: ReactNode }) {
  const deuren: [Soort, string, string][] = [
    ["marktplaats", "Tweedehands", "from-teal-500 to-emerald-400"], ["winkels", "Winkels", "from-sky-500 to-indigo-400"],
    ["diensten", "Diensten", "from-amber-500 to-orange-400"], ["eten", "Eten", "from-rose-500 to-pink-400"]];
  return (
    <>
      {!zoekt && (
        <div className="grid grid-cols-2 gap-3">
          {deuren.map(([s, naam, kleur]) => {
            const I = SOORTEN[s].icoon;
            return (
              <button key={s} type="button" onClick={() => kies(s)}
                className={`relative flex h-28 flex-col justify-end overflow-hidden rounded-3xl bg-gradient-to-br ${kleur} p-4 text-left text-white shadow-sm active:scale-[.98]`}>
                <I className="absolute right-3 top-3 size-12 opacity-30" />
                <span className="text-[17px] font-semibold">{naam}</span>
              </button>
            );
          })}
        </div>
      )}
      {winkels.length > 0 && <Winkelrij winkels={winkels} open={openWinkel} />}
      <section className="flex flex-col gap-3">
        <h2 className="text-[17px] font-semibold">{zoekt ? `Gevonden voor "${term}"` : "Net binnen"}</h2>
        {producten === null ? laden : producten.length ? <Fotomuur producten={producten} open={open} />
          : <p className="text-sm text-rustig">Nog niets te koop.</p>}
      </section>
    </>
  );
}

/** Tweedehands: een fotomuur met staande foto's, verkoper en plaats, zoals je door kledingrekken bladert. */
function Fotomuur({ producten, open }: { producten: Product[]; open: (p: Product) => void }) {
  return (
    <ul aria-label="Te koop" className="grid grid-cols-2 gap-x-3 gap-y-5">
      {producten.map((p) => (
        <li key={p.sleutel}>
          <button onClick={() => open(p)} aria-label={`${p.titel}, ${euro(p.prijs)}`} className="flex w-full flex-col gap-1.5 text-left">
            <span className="flex items-center gap-1.5 text-[12px] text-rustig">
              <Rondje naam={p.verkoper} id={p.verkoperId ?? p.id} klein /><span className="truncate">{p.verkoper}</span>
            </span>
            <span className="relative">
              <Foto p={p} className="aspect-[3/4] w-full rounded-2xl" />
              {p.levering.includes("verzenden") && (
                <span className="absolute bottom-2 left-2 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-medium text-[#16161a]">Verzenden</span>
              )}
            </span>
            <span className="text-[16px] font-semibold">{euro(p.prijs)}</span>
            <span className="-mt-1 line-clamp-1 text-[14px] text-rustig">{p.titel}</span>
            {p.plaats && <span className="-mt-1 truncate text-[12px] text-zacht">{p.plaats}</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Winkels: een schap als lijst, met foto links, de winkel, een duidelijke prijs en hoe het bij je komt. */
function Schaplijst({ producten, open }: { producten: Product[]; open: (p: Product) => void }) {
  return (
    <ul aria-label="Producten" className="flex flex-col divide-y divide-lijn">
      {producten.map((p) => (
        <li key={p.sleutel}>
          <button onClick={() => open(p)} aria-label={`${p.titel}, ${euro(p.prijs)}, ${p.verkoper}`} className="flex w-full gap-4 py-4 text-left">
            <Foto p={p} className="size-24 shrink-0 rounded-xl bg-white ring-1 ring-lijn" />
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="line-clamp-2 text-[15px] font-medium leading-snug">{p.titel}</span>
              <span className="truncate text-[13px] text-sky-600 dark:text-sky-400">{p.verkoper}</span>
              <span className="mt-auto text-[19px] font-bold">{euro(p.prijs)}</span>
              <span className="text-[12px] text-rustig">
                {p.voorraad === 0 ? "Uitverkocht" : p.levering.includes("verzenden")
                  ? <span className="text-emerald-600 dark:text-emerald-400">Wordt bezorgd</span>
                  : p.levering.map((l) => LEVERING[l] ?? l).join(" · ") || "Ophalen"}
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Diensten: de aanbieder staat voorop, met wat hij doet, waar en vanaf welke prijs. */
function Aanbieders({ producten, open }: { producten: Product[]; open: (p: Product) => void }) {
  return (
    <ul aria-label="Diensten" className="flex flex-col gap-3">
      {producten.map((p) => (
        <li key={p.sleutel}>
          <button onClick={() => open(p)} aria-label={`${p.titel}, vanaf ${euro(p.prijs)}, ${p.verkoper}`}
            className="flex w-full items-start gap-3 rounded-3xl bg-vlak p-4 text-left">
            <Rondje naam={p.verkoper} id={p.verkoperId ?? p.id} groot />
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-[16px] font-semibold leading-snug">{p.titel}</span>
              <span className="truncate text-[13px] text-rustig">{[p.verkoper, p.plaats].filter(Boolean).join(" · ")}</span>
              {p.omschrijving && <span className="line-clamp-2 text-[13px] text-rustig">{p.omschrijving}</span>}
              <span className="mt-1 flex flex-wrap items-center gap-1.5">
                <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-[12px] font-semibold text-amber-700 dark:text-amber-300">vanaf {euro(p.prijs)}</span>
                {p.levering.map((l) => (
                  <span key={l} className="rounded-full bg-white px-2.5 py-1 text-[12px] text-rustig dark:bg-white/10">{LEVERING[l] ?? l}</span>
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
      <h2 className="text-[17px] font-semibold">Winkels</h2>
      <ul className="-mx-6 flex gap-3 overflow-x-auto px-6 [scrollbar-width:none]">
        {winkels.slice(0, 20).map((w) => (
          <li key={w.adres} className="shrink-0">
            <button onClick={() => open(w.adres)} className="flex w-40 flex-col overflow-hidden rounded-2xl bg-vlak text-left">
              <span className={`h-14 bg-gradient-to-br ${banner(w.naam)}`} />
              <span className="-mt-5 ml-3 flex size-10 items-center justify-center rounded-xl bg-white text-[15px] font-bold shadow-sm dark:bg-[#16161a]">
                {(w.naam.trim()[0] ?? "?").toUpperCase()}
              </span>
              <span className="truncate px-3 pt-1.5 text-[15px] font-medium">{w.naam}</span>
              <span className="px-3 pb-3 text-[12px] text-rustig">{w.producten ?? 0} producten</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Eten: zaken als grote kaarten met een banner, zoals je door restaurants bladert. */
function Zaken({ winkels, open, zoekt, verkoop }: { winkels: WinkelKaartje[]; open: (a: string) => void; zoekt: boolean;
  verkoop: () => void }) {
  if (!winkels.length)
    return (
      <div className="flex flex-col items-center gap-3 rounded-3xl bg-vlak px-6 py-8 text-center">
        <Bestek className="size-8 text-zacht" />
        <p className="font-medium">{zoekt ? "Geen zaak gevonden" : "Nog geen eetzaken in de app"}</p>
        <p className="text-sm text-rustig">Heb je een restaurant, bakkerij of foodtruck? Open je eigen winkel en zet je menu erin.</p>
        <button onClick={verkoop} className="h-10 rounded-full bg-accent px-5 text-sm font-medium text-white">Menu online zetten</button>
      </div>
    );
  return (
    <ul aria-label="Eetzaken" className="flex flex-col gap-4">
      {winkels.map((w) => (
        <li key={w.adres}>
          <button onClick={() => open(w.adres)} className="flex w-full flex-col overflow-hidden rounded-3xl bg-vlak text-left active:scale-[.99]">
            <span className={`relative flex h-32 items-end bg-gradient-to-br ${banner(w.naam)} p-4`}>
              <Bestek className="absolute right-4 top-4 size-10 text-white/40" />
              <span className="text-[22px] font-bold leading-tight text-white drop-shadow-sm">{w.naam}</span>
            </span>
            <span className="flex items-center gap-2 px-4 py-3">
              <span className="min-w-0 flex-1 truncate text-[13px] text-rustig">{w.omschrijving || "Bekijk het menu"}</span>
              <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[12px] font-medium dark:bg-white/10">
                <Tas className="mr-1 inline size-3.5" />{w.producten ?? 0} op het menu
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

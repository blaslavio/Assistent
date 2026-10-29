// Beleggen: wat je beleggingen waard zijn, de markten en je volglijst. Alleen meekijken; de app koopt of verkoopt nooit.
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { Staat } from "../App";
import { Kruis, Plus, Schuiven, Vonk, Zoek } from "../iconen";
import {
  MARKTEN, SOORTEN, WAARSCHUWING, bewaardeKoers, euro, instellingen, koersen, markt, marktenKiezen, nietVolgen,
  portefeuilleOphalen, positieBijwerken, positieToevoegen, positieWeg, prijsTekst, procent, volgen, zoeken,
  type Gevonden, type Koers, type Portefeuille, type Regel,
} from "../lib/beleggen";
import { kop } from "./instellingen-ui";
import { Onderblad } from "./Onderblad";

const veld = "h-12 w-full min-w-0 rounded-2xl bg-vlak px-4 outline-none placeholder:text-zacht";
const knop = "flex h-12 items-center justify-center gap-2 rounded-2xl bg-accent px-4 font-medium text-white disabled:opacity-30";
const getal = (s: string) => Number(s.replace(/\s/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
const kleur = (x: number | null | undefined) => (x === null || x === undefined ? "text-rustig" : x >= 0
  ? "text-green-700 dark:text-green-400" : "text-red-600 dark:text-red-400");
const foutVan = (e: unknown) => (e instanceof Error && e.message ? e.message : "Dat lukte niet. Probeer het opnieuw.");

/** Het verloop van de afgelopen maand als klein lijntje. */
function Lijntje({ waarden }: { waarden: number[] }) {
  if (waarden.length < 2) return <span className="w-14" />;
  const min = Math.min(...waarden), max = Math.max(...waarden), b = max - min || 1;
  const punten = waarden.map((w, i) => `${(i / (waarden.length - 1)) * 56},${18 - ((w - min) / b) * 16}`).join(" ");
  const op = waarden[waarden.length - 1] >= waarden[0];
  return (
    <svg width="56" height="20" aria-hidden className={op ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"}>
      <polyline points={punten} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function tijdstip(epoch: number | null | undefined) {
  if (!epoch) return "";
  const t = new Date(epoch * 1000);
  return t.toDateString() === new Date().toDateString()
    ? t.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })
    : t.toLocaleDateString("nl-NL", { day: "numeric", month: "short" });
}

function Tegels({ regels, weg }: { regels: (Partial<Koers> & { naam: string; symbool: string })[]; weg?: (s: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {regels.map((r) => {
        const index = r.symbool.startsWith("^") || r.symbool.includes("=");
        return (
          <div key={r.symbool} className="relative flex flex-col gap-1 rounded-2xl bg-vlak px-4 py-3">
            <span className="truncate pr-5 text-sm text-rustig">{r.naam}</span>
            <span className="text-lg font-semibold tabular-nums">
              {r.prijs === undefined ? "–" : index ? r.prijs.toLocaleString("nl-NL", { maximumFractionDigits: r.prijs < 10 ? 4 : 2 })
                : prijsTekst(r.prijs, r.valuta)}
            </span>
            <span className="flex justify-between text-xs">
              <span className={`font-semibold tabular-nums ${kleur(r.vandaag_pct)}`}>{procent(r.vandaag_pct)}</span>
              <span className="text-zacht">{tijdstip(r.tijd)}</span>
            </span>
            {weg && <button onClick={() => weg(r.symbool)} aria-label={`${r.naam} niet meer volgen`}
              className="absolute top-2 right-2 flex size-7 items-center justify-center rounded-full text-zacht"><Kruis className="size-4" /></button>}
          </div>
        );
      })}
    </div>
  );
}

export function Beleggen({ staat, vernieuw, vraag }: { staat: Staat; vernieuw: () => Promise<void>; vraag: (tekst: string) => void }) {
  const inst = instellingen(staat.data);
  const [p, setP] = useState<Portefeuille | null>(null);
  const [markten, setMarkten] = useState<Awaited<ReturnType<typeof markt>>>([]);
  const [volg, setVolg] = useState<(Partial<Koers> & { naam: string; symbool: string })[]>([]);
  const [fout, setFout] = useState("");
  const [blad, setBlad] = useState<null | "toevoegen" | "volgen" | "markten" | Regel>(null);
  const [bijgewerkt, setBijgewerkt] = useState("");
  const sleutel = JSON.stringify([inst.posities, inst.volglijst, inst.markten]);

  const laden = useCallback(async () => {
    const [posities, volglijst, namen] = JSON.parse(sleutel) as [typeof inst.posities, typeof inst.volglijst, string[]];
    try {
      const [pf, mk, vk] = await Promise.all([
        posities.length ? portefeuilleOphalen(posities) : Promise.resolve(null),
        markt(namen),
        koersen(volglijst.map((v) => v.symbool)),
      ]);
      setP(pf);
      setMarkten(mk);
      setVolg(volglijst.map((v) => ({ ...(vk[v.symbool] ?? {}), naam: v.naam, symbool: v.symbool })));
      setBijgewerkt(new Date().toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" }));
      setFout("");
    } catch (e) {
      setFout(foutVan(e));
    }
  }, [sleutel]);

  // Elke halve minuut opnieuw, zolang je hier kijkt.
  useEffect(() => {
    laden();
    const t = setInterval(() => { if (document.visibilityState === "visible") laden(); }, 30_000);
    return () => clearInterval(t);
  }, [laden]);

  async function doe(actie: () => Promise<unknown>) {
    try { await actie(); await vernieuw(); setBlad(null); } catch (e) { setFout(foutVan(e)); }
  }

  const spreiding = p && p.waarde ? Object.entries(p.spreiding).sort((a, b) => b[1] - a[1])
    .map(([s, w]) => `${s.toLowerCase()} ${Math.round((w / p.waarde) * 100)}%`).join(", ") : "";

  return (
    <>
      {fout && <p role="alert" className="rounded-2xl bg-vlak px-4 py-3 text-sm text-rustig">{fout}</p>}

      {inst.posities.length > 0 ? (
        <section className="flex flex-col gap-3">
          <div>
            <p className="text-sm text-rustig">Waarde</p>
            <p className="text-[34px] font-bold tracking-tight tabular-nums">{p ? euro(p.waarde) : "…"}</p>
            {p && <p className={`font-medium tabular-nums ${kleur(p.resultaat)}`}>
              {p.resultaat >= 0 ? "+" : "−"}{euro(Math.abs(p.resultaat))} ({procent(p.resultaat_pct)})
</p>}
            {p && <p className="text-sm text-rustig">Ingelegd {euro(p.inleg)}</p>}
            {p && p.vandaag !== 0 && <p className="text-sm text-rustig">Sinds de vorige slotkoers {p.vandaag >= 0 ? "+" : "−"}{euro(Math.abs(p.vandaag))}</p>}
          </div>
          <ul className="flex flex-col overflow-hidden rounded-[20px] bg-vlak">
            {(p?.posities ?? inst.posities.map((x) => ({ ...x, koers: null, verloop: [] }) as unknown as Regel)).map((r) => (
              <li key={r.id} className="[&+li]:border-t [&+li]:border-lijn">
                <button onClick={() => setBlad(r)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium">{r.naam}</span>
                    <span className="text-sm text-rustig">{r.aantal.toLocaleString("nl-NL", { maximumFractionDigits: 4 })} stuks
                      {r.eigen ? " · eigen koers" : r.koers === null && p ? " · geen koers" : ""}</span>
                  </span>
                  <Lijntje waarden={r.verloop} />
                  <span className="flex w-24 flex-col items-end tabular-nums">
                    <span className="font-medium">{r.waarde !== undefined ? euro(r.waarde) : "–"}</span>
                    <span className={`text-sm ${kleur(r.resultaat_pct)}`}>{procent(r.resultaat_pct)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {spreiding && <p className="text-sm text-rustig">Spreiding: {spreiding}</p>}
          {p?.let_op.map((t) => <p key={t} className="rounded-2xl bg-vlak px-4 py-3 text-sm">{t}</p>)}
          {p && p.zonder_koers.length > 0 && <p className="text-sm text-rustig">
            Geen koers voor {p.zonder_koers.join(", ")}. Tik erop om zelf een koers in te vullen.</p>}
          <div className="flex gap-2">
            <button onClick={() => setBlad("toevoegen")} className={`${knop} flex-1`}><Plus className="size-5" /> Toevoegen</button>
            <button onClick={() => vraag("Bekijk mijn beleggingen. Leg in gewone taal uit hoe ze ervoor staan, hoe mijn spreiding "
              + "is en waar ik op kan letten. Geen koop- of verkoopadvies.")}
              className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-vlak font-medium"><Vonk className="size-5" /> Uitleg</button>
          </div>
        </section>
      ) : (
        <section className="flex flex-col gap-3">
          <p className="text-rustig">Voeg je beleggingen toe om te zien wat ze waard zijn en hoe je spreiding is. Of volg alleen koersen.</p>
          <button onClick={() => setBlad("toevoegen")} className={knop}><Plus className="size-5" /> Belegging toevoegen</button>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className={kop}>Markten</h2>
          <button onClick={() => setBlad("markten")} className="flex items-center gap-1 text-sm text-accent"><Schuiven className="size-4" /> Kiezen</button>
        </div>
        <Tegels regels={markten} />
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className={kop}>Volglijst</h2>
          <button onClick={() => setBlad("volgen")} className="flex items-center gap-1 text-sm text-accent"><Plus className="size-4" /> Volgen</button>
        </div>
        {volg.length ? <Tegels regels={volg} weg={(s) => doe(() => nietVolgen(s))} />
          : <p className="text-sm text-rustig">Volg een koers zonder dat je hem hebt.</p>}
      </section>

      <p className="text-xs text-zacht">{bijgewerkt && `Bijgewerkt om ${bijgewerkt}, elke halve minuut opnieuw. `}
        Bron: Yahoo Finance; sommige beurzen met 15 minuten vertraging. {WAARSCHUWING}</p>

      {(blad === "toevoegen" || blad === "volgen") && (
        <Toevoegen alleenVolgen={blad === "volgen"} sluit={() => setBlad(null)}
          klaar={(g, aantal, prijs) => doe(() => (aantal === null ? volgen(g)
            : positieToevoegen({ symbool: g.symbool, naam: g.naam, aantal, aankoopprijs: prijs ?? 0, soort: g.soort })))} />
      )}
      {blad === "markten" && <MarktenKiezen huidig={inst.markten} sluit={() => setBlad(null)} klaar={(n) => doe(() => marktenKiezen(n))} />}
      {blad && typeof blad === "object" && (
        <Bewerken r={blad} sluit={() => setBlad(null)} bewaar={(v) => doe(() => positieBijwerken(blad.id, v))}
          weg={() => doe(() => positieWeg(blad.id))} />
      )}
    </>
  );
}

function Toevoegen({ alleenVolgen, sluit, klaar }: { alleenVolgen: boolean; sluit: () => void;
  klaar: (g: Gevonden, aantal: number | null, prijs: number | null) => void }) {
  const [term, setTerm] = useState("");
  const [gevonden, setGevonden] = useState<Gevonden[] | null>(null);
  const [keuze, setKeuze] = useState<Gevonden | null>(null);
  const [koers, setKoers] = useState<Koers | null>(null);
  const [aantal, setAantal] = useState("");
  const [prijs, setPrijs] = useState("");
  const [melding, setMelding] = useState("");

  // Zoeken terwijl je typt, met een korte pauze zodat niet elke letter een vraag wordt.
  useEffect(() => {
    if (!term.trim() || keuze) { setGevonden(null); return; }
    const t = setTimeout(() => {
      zoeken(term).then((g) => { setGevonden(g); setMelding(""); }).catch((e) => { setGevonden([]); setMelding(foutVan(e)); });
    }, 350);
    return () => clearTimeout(t);
  }, [term, keuze]);

  async function kies(g: Gevonden) {
    setKeuze(g);
    if (alleenVolgen) return;
    const k = bewaardeKoers(g.symbool) ?? (await koersen([g.symbool]).catch(() => ({} as Record<string, Koers | null>)))[g.symbool] ?? null;
    setKoers(k);
    if (k && k.valuta === "EUR") setPrijs(String(k.prijs.toFixed(2)).replace(".", ","));
  }

  function bewaar(e: FormEvent) {
    e.preventDefault();
    if (!keuze) return;
    if (alleenVolgen) return klaar(keuze, null, null);
    const a = getal(aantal), pr = getal(prijs || "0");
    if (!(a > 0) || !(pr >= 0)) return setMelding("Vul een aantal in (en de aankoopprijs per stuk in euro's).");
    klaar(keuze, a, pr);
  }

  const zelf: Gevonden | null = term.trim() && /^[A-Za-z0-9^=.\-]{1,24}$/.test(term.trim())
    ? { symbool: term.trim().toUpperCase(), naam: term.trim().toUpperCase(), beurs: "zelf ingevuld", soort: "" } : null;

  return (
    <Onderblad titel={alleenVolgen ? "Koers volgen" : "Belegging toevoegen"} sluit={sluit}>
      <form onSubmit={bewaar} className="flex flex-col gap-3">
        {!keuze ? (
          <>
            <label className="relative">
              <Zoek className="pointer-events-none absolute top-3.5 left-4 size-5 text-zacht" />
              <input autoFocus value={term} onChange={(e) => setTerm(e.target.value)} aria-label="Zoek op naam of ticker"
                placeholder="Naam of ticker, bijvoorbeeld Vanguard All-World" className={`${veld} pl-11`} />
            </label>
            {melding && <p className="text-sm text-rustig">{melding}</p>}
            <ul className="flex flex-col">
              {(gevonden ?? []).map((g) => (
                <li key={g.symbool}><button type="button" onClick={() => kies(g)} className="flex w-full flex-col py-2.5 text-left">
                  <span className="font-medium">{g.naam}</span>
                  <span className="text-sm text-rustig">{g.symbool} · {g.beurs} · {SOORTEN[g.soort] ?? g.soort}</span>
                </button></li>
              ))}
              {gevonden && !gevonden.length && zelf && (
                <li><button type="button" onClick={() => kies(zelf)} className="flex w-full flex-col py-2.5 text-left">
                  <span className="font-medium">{zelf.symbool} gebruiken</span>
                  <span className="text-sm text-rustig">Niets gevonden; gebruik dit als ticker.</span>
                </button></li>
              )}
            </ul>
          </>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3 rounded-2xl bg-vlak px-4 py-3">
              <span className="flex min-w-0 flex-col">
                <span className="font-medium">{keuze.naam}</span>
                <span className="text-sm text-rustig">{keuze.symbool}{koers ? ` · nu ${prijsTekst(koers.prijs, koers.valuta)}` : ""}</span>
              </span>
              <button type="button" onClick={() => { setKeuze(null); setKoers(null); }} className="text-sm text-accent">Ander</button>
            </div>
            {!alleenVolgen && (
              <div className="flex gap-2">
                <label className="flex flex-1 flex-col gap-1 text-sm text-rustig">Aantal stuks
                  <input inputMode="decimal" value={aantal} onChange={(e) => setAantal(e.target.value)} className={veld} placeholder="10" />
                </label>
                <label className="flex flex-1 flex-col gap-1 text-sm text-rustig">Aankoopprijs per stuk (€)
                  <input inputMode="decimal" value={prijs} onChange={(e) => setPrijs(e.target.value)} className={veld} placeholder="0,00" />
                </label>
              </div>
            )}
            {!alleenVolgen && <p className="text-xs text-zacht">Gemiddeld, in euro's. Weet je het niet? Vul de koers van nu in.</p>}
            {melding && <p className="text-sm text-rustig">{melding}</p>}
            <button className={knop}>{alleenVolgen ? "Volgen" : "Toevoegen"}</button>
          </>
        )}
      </form>
    </Onderblad>
  );
}

function MarktenKiezen({ huidig, sluit, klaar }: { huidig: string[]; sluit: () => void; klaar: (namen: string[]) => void }) {
  const [gekozen, setGekozen] = useState(new Set(huidig));
  const wissel = (n: string) => setGekozen((s) => { const t = new Set(s); if (t.has(n)) t.delete(n); else t.add(n); return t; });
  return (
    <Onderblad titel="Markten kiezen" sluit={sluit}>
      {Object.entries(MARKTEN).map(([groep, m]) => (
        <section key={groep} className="flex flex-col gap-2">
          <h3 className="text-sm text-rustig">{groep}</h3>
          <div className="flex flex-wrap gap-2">
            {Object.keys(m).map((n) => (
              <button key={n} onClick={() => wissel(n)} aria-pressed={gekozen.has(n)}
                className={`rounded-full px-3.5 py-2 text-sm ${gekozen.has(n) ? "bg-accent text-white" : "bg-vlak"}`}>{n}</button>
            ))}
          </div>
        </section>
      ))}
      <button onClick={() => klaar([...gekozen])} className={knop}>Bewaren</button>
    </Onderblad>
  );
}

function Bewerken({ r, sluit, bewaar, weg }: { r: Regel; sluit: () => void;
  bewaar: (v: { aantal: number; aankoopprijs: number; eigen_koers: number | null }) => void; weg: () => void }) {
  const t = (x: number | null | undefined) => (x === null || x === undefined ? "" : String(x).replace(".", ","));
  const [aantal, setAantal] = useState(t(r.aantal));
  const [prijs, setPrijs] = useState(t(r.aankoopprijs));
  const [eigen, setEigen] = useState(t(r.eigen_koers));
  const [zeker, setZeker] = useState(false);
  return (
    <Onderblad titel={r.naam} sluit={sluit}>
      <form className="flex flex-col gap-3" onSubmit={(e) => {
        e.preventDefault();
        const a = getal(aantal), p = getal(prijs || "0"), k = eigen.trim() ? getal(eigen) : null;
        if (!(a > 0) || !(p >= 0) || (k !== null && !(k >= 0))) return;
        bewaar({ aantal: a, aankoopprijs: p, eigen_koers: k });
      }}>
        <div className="flex gap-2">
          <label className="flex flex-1 flex-col gap-1 text-sm text-rustig">Aantal stuks
            <input inputMode="decimal" value={aantal} onChange={(e) => setAantal(e.target.value)} className={veld} />
          </label>
          <label className="flex flex-1 flex-col gap-1 text-sm text-rustig">Aankoopprijs (€)
            <input inputMode="decimal" value={prijs} onChange={(e) => setPrijs(e.target.value)} className={veld} />
          </label>
        </div>
        <label className="flex flex-col gap-1 text-sm text-rustig">Eigen koers (€), alleen als er geen koers te krijgen is
          <input inputMode="decimal" value={eigen} onChange={(e) => setEigen(e.target.value)} className={veld} placeholder="Leeg laten" />
        </label>
        <button className={knop}>Bewaren</button>
        <button type="button" onClick={() => (zeker ? weg() : setZeker(true))}
          className="h-12 rounded-2xl bg-vlak font-medium text-red-600 dark:text-red-400">{zeker ? "Zeker weghalen?" : "Weghalen"}</button>
      </form>
    </Onderblad>
  );
}

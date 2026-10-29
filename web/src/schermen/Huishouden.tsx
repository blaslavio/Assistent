// Huishouden: samen plannen met je gezin, huisgenoten of vrienden. Eén scherm per huishouden met alleen de
// hulpmiddelen die jullie kozen: agenda (wie haalt, wie brengt), boodschappen, kosten delen en klussen om de beurt.
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Onderblad } from "./Onderblad";
import { Kruis, Plus, Terug } from "../iconen";
import { mascotteZeg } from "../mascotte";
import { HULPMIDDELEN, SOORTEN, STANDAARD, VORMEN, agenda, antwoorden, instellen, itemOpslaan, itemWeg, klusBijwerken, klussen,
  kosten, kostenToevoegen, kostenWeg, lijst, lijstBijwerken, maken, mijnHuishoudens, omschrijving, oppakken, uitnodigen,
  verrekenen, type Huishouden as H, type Hulpmiddel, type Item, type Klus, type Kosten as K, type LijstItem, type Saldo,
  type Soort, type Vorm } from "../lib/huishouden";

const foutVan = (e: unknown) => (e instanceof Error && e.message ? e.message : "Dat lukte niet. Probeer het opnieuw.");
const veld = "h-12 min-w-0 flex-1 rounded-2xl bg-vlak px-4 outline-none placeholder:text-zacht focus:ring-2 focus:ring-accent";
const knop = "flex h-12 shrink-0 items-center justify-center rounded-2xl bg-accent px-4 font-medium text-white disabled:opacity-30";
const pil = (aan: boolean) => `h-9 shrink-0 rounded-full px-3.5 text-sm ${aan ? "bg-accent font-medium text-white" : "bg-vlak text-rustig"}`;
const euro = (n: number) => n.toLocaleString("nl-NL", { style: "currency", currency: "EUR" });
const lijn = "flex flex-col divide-y divide-lijn rounded-2xl bg-vlak";

export function Huishoudens() {
  const [lijstH, setLijstH] = useState<H[] | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [nieuw, setNieuw] = useState(false);
  const [fout, setFout] = useState("");
  const laden = useCallback(() => mijnHuishoudens().then(setLijstH).catch((e) => setFout(foutVan(e))), []);
  useEffect(() => { laden(); }, [laden]);

  const g = lijstH?.find((x) => x.id === open && x.status === "lid");
  if (g) return <Een g={g} terug={() => { setOpen(null); laden(); }} vernieuw={laden} />;

  async function antwoord(h: H, a: "ja" | "nee") {
    try { await antwoorden(h.id, a); await laden(); if (a === "ja") setOpen(h.id); } catch (e) { setFout(foutVan(e)); }
  }

  return <>
    {lijstH === null && !fout && <p className="bezig-tekst text-rustig">Laden</p>}
    {lijstH?.filter((h) => h.status === "uitgenodigd").map((h) => (
      <div key={h.id} className="flex flex-col gap-3 rounded-2xl bg-accent/10 p-4">
        <span><span className="font-medium">{h.door}</span> nodigt je uit voor <span className="font-medium">{h.naam}</span>.</span>
        <div className="flex gap-2">
          <button onClick={() => antwoord(h, "ja")} className="h-10 rounded-full bg-accent px-4 text-sm font-medium text-white">Doe mee</button>
          <button onClick={() => antwoord(h, "nee")} className="h-10 rounded-full bg-vlak px-4 text-sm font-medium">Nee, dank je</button>
        </div>
      </div>
    ))}
    {lijstH && lijstH.some((h) => h.status === "lid") && (
      <ul className={lijn}>
        {lijstH.filter((h) => h.status === "lid").map((h) => (
          <li key={h.id}>
            <button onClick={() => setOpen(h.id)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-medium">{h.naam}</span>
                <span className="truncate text-[13px] text-rustig">{[VORMEN.find(([v]) => v === h.vorm)?.[1],
                  `${h.leden.filter((l) => l.status === "lid").length} met account`].join(" · ")}</span>
              </span>
              <Terug className="size-4 shrink-0 rotate-180 text-zacht" />
            </button>
          </li>
        ))}
      </ul>
    )}
    {lijstH && lijstH.length === 0 && (
      <p className="text-rustig">Plan samen met je gezin, huisgenoten of vrienden: wie haalt en brengt, wat er gehaald moet worden,
        wie nog geld krijgt en wie deze week de klus heeft.</p>
    )}
    <button onClick={() => setNieuw(true)} className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-vlak font-medium">
      <Plus className="size-5" /> Nieuw huishouden
    </button>
    {fout && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{fout}</p>}
    {nieuw && <Instellen sluit={() => setNieuw(false)} klaar={(id) => { setNieuw(false); laden().then(() => setOpen(id)); }} />}
  </>;
}

/** Een huishouden maken of aanpassen: naam, wat voor huishouden, wie erbij horen (ook zonder account) en hulpmiddelen. */
function Instellen({ g, sluit, klaar }: { g?: H; sluit: () => void; klaar: (id: number) => void }) {
  const [naam, setNaam] = useState(g?.naam ?? "");
  const [vorm, setVorm] = useState<Vorm>(g?.vorm ?? "gezin");
  const [tools, setTools] = useState<Hulpmiddel[]>(g ? g.tools.filter((t) => HULPMIDDELEN.some(([h]) => h === t)) : STANDAARD.gezin);
  const [deelnemers, setDeelnemers] = useState((g?.kinderen ?? []).join(", "));
  const [fout, setFout] = useState("");
  const [bezig, setBezig] = useState(false);

  async function bewaar() {
    setBezig(true);
    setFout("");
    const namen = deelnemers.split(",").map((d) => d.trim()).filter(Boolean);
    try {
      if (g) { await instellen(g, naam, vorm, namen, tools); klaar(g.id); }
      else klaar((await maken(naam, vorm, namen, tools)).id);
    } catch (e) {
      setFout(foutVan(e));
    } finally {
      setBezig(false);
    }
  }

  return (
    <Onderblad titel={g ? "Aanpassen" : "Nieuw huishouden"} sluit={sluit}>
      <input value={naam} onChange={(e) => setNaam(e.target.value)} maxLength={60} placeholder="Naam, bijvoorbeeld Thuis" aria-label="Naam" className={veld} />
      <div className="-mx-6 flex gap-2 overflow-x-auto px-6 [scrollbar-width:none]">
        {VORMEN.map(([v, label]) => (
          <button key={v} aria-pressed={vorm === v} onClick={() => { setVorm(v); if (!g) setTools(STANDAARD[v]); }} className={pil(vorm === v)}>{label}</button>
        ))}
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="px-1 text-sm font-medium">Wat gebruiken jullie?</span>
        <div className="flex flex-wrap gap-2">
          {HULPMIDDELEN.map(([t, label]) => (
            <button key={t} aria-pressed={tools.includes(t)} className={pil(tools.includes(t))}
              onClick={() => setTools((x) => x.includes(t) ? x.filter((y) => y !== t) : [...x, t])}>{label}</button>
          ))}
        </div>
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="px-1 text-sm font-medium">Wie zonder account?</span>
        <input value={deelnemers} onChange={(e) => setDeelnemers(e.target.value)} placeholder="Bijvoorbeeld de kinderen: Noor, Sem"
          className={veld} />
      </label>
      {fout && <p role="alert" className="px-1 text-sm text-red-600">{fout}</p>}
      <button onClick={bewaar} disabled={bezig || !naam.trim() || !tools.length} className={knop}>{bezig ? "Bezig..." : g ? "Bewaren" : "Maken"}</button>
    </Onderblad>
  );
}

function Een({ g, terug, vernieuw }: { g: H; terug: () => void; vernieuw: () => Promise<unknown> }) {
  const delen = g.tools.filter((t) => HULPMIDDELEN.some(([h]) => h === t));
  const [deel, setDeel] = useState<Hulpmiddel | "leden">(delen[0] ?? "leden");
  const [aanpassen, setAanpassen] = useState(false);
  return (
    <div className="flex flex-col gap-5">
      <div className="-mt-2 flex items-center gap-2">
        <button onClick={terug} aria-label="Terug naar je huishoudens" className="-ml-2 flex size-10 items-center justify-center text-rustig"><Terug className="size-5" /></button>
        <h2 className="min-w-0 flex-1 truncate text-xl font-semibold">{g.naam}</h2>
        <button onClick={() => setAanpassen(true)} className="text-sm font-medium text-accent">Aanpassen</button>
      </div>
      <div className="-mx-6 flex gap-2 overflow-x-auto px-6 [scrollbar-width:none]" role="tablist">
        {[...delen, "leden" as const].map((d) => (
          <button key={d} role="tab" aria-selected={deel === d} onClick={() => setDeel(d)} className={pil(deel === d)}>
            {d === "leden" ? "Leden" : HULPMIDDELEN.find(([h]) => h === d)![1]}
          </button>
        ))}
      </div>
      {deel === "agenda" && <Agenda g={g} />}
      {deel === "boodschappen" && <Boodschappen g={g} />}
      {deel === "kosten" && <Kostendelen g={g} />}
      {deel === "klussen" && <Klussen g={g} />}
      {deel === "leden" && <Leden g={g} vernieuw={vernieuw} weg={terug} />}
      {aanpassen && <Instellen g={g} sluit={() => setAanpassen(false)} klaar={() => { setAanpassen(false); vernieuw(); }} />}
    </div>
  );
}

// --- Agenda ---------------------------------------------------------------------------------------------------

const dagTekst = (iso: string) => new Date(iso).toLocaleDateString("nl-NL", { weekday: "short", day: "numeric", month: "short" });
const tijdTekst = (iso: string) => new Date(iso).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });

function Agenda({ g }: { g: H }) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [nieuw, setNieuw] = useState(false);
  const [fout, setFout] = useState("");
  const ik = g.leden.find((l) => l.ik)?.id;
  const laden = useCallback(() => agenda(g.id).then(setItems).catch((e) => setFout(foutVan(e))), [g.id]);
  useEffect(() => { laden(); }, [laden]);
  const doe = (f: () => Promise<unknown>) => f().then(laden).catch((e) => setFout(foutVan(e)));

  return <>
    {items === null ? <p className="bezig-tekst text-rustig">Laden</p> : items.length === 0
      ? <p className="text-rustig">De komende twee weken staat er niets. Zet erin wie wat haalt of brengt.</p> : (
        <ul className={lijn}>
          {items.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
              <span className="flex min-w-[60%] flex-1 flex-col">
                <span className="font-medium">{omschrijving(i)}</span>
                <span className="text-[13px] text-rustig">{dagTekst(i.start)} {tijdTekst(i.start)}
                  {i.locatie ? ` · ${i.locatie}` : ""} · {i.wie === null ? "nog niemand" : i.wie === ik ? "jij" : i.wie_naam}</span>
              </span>
              <span className="flex shrink-0 items-center gap-1">
              {i.wie === null
                ? <button onClick={() => doe(() => oppakken(i.id, true))} className="h-9 shrink-0 rounded-full bg-accent px-3.5 text-sm font-medium text-white">Ik doe het</button>
                : i.wie === ik && <button onClick={() => doe(() => oppakken(i.id, false))} className="h-9 shrink-0 rounded-full bg-white px-3.5 text-sm dark:bg-black/30">Kan toch niet</button>}
              {(i.door === ik) && <button aria-label="Weghalen" onClick={() => doe(() => itemWeg(i.id))} className="flex size-8 shrink-0 items-center justify-center text-zacht"><Kruis className="size-4" /></button>}
              </span>
            </li>
          ))}
        </ul>
      )}
    <button onClick={() => setNieuw(true)} className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-vlak font-medium"><Plus className="size-5" /> Erin zetten</button>
    {fout && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{fout}</p>}
    {nieuw && <NieuwItem g={g} sluit={() => setNieuw(false)} klaar={() => { setNieuw(false); laden(); }} />}
  </>;
}

function NieuwItem({ g, sluit, klaar }: { g: H; sluit: () => void; klaar: () => void }) {
  const morgen = new Date(Date.now() + 86400_000);
  const [soort, setSoort] = useState<Soort>("halen");
  const [voor, setVoor] = useState(g.kinderen[0] ?? "");
  const [titel, setTitel] = useState("");
  const [datum, setDatum] = useState(morgen.toISOString().slice(0, 10));
  const [tijd, setTijd] = useState("15:00");
  const [wie, setWie] = useState<number | null>(null);
  const [fout, setFout] = useState("");
  const leden = g.leden.filter((l) => l.status === "lid");

  async function bewaar(e: FormEvent) {
    e.preventDefault();
    setFout("");
    try {
      await itemOpslaan(g.id, { soort, voor, titel, start: new Date(`${datum}T${tijd}`), minuten: 30, locatie: "", wie });
      klaar();
    } catch (er) {
      setFout(foutVan(er));
    }
  }

  return (
    <Onderblad titel="Erin zetten" sluit={sluit}>
      <form onSubmit={bewaar} className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          {SOORTEN.map(([s, label]) => <button type="button" key={s} aria-pressed={soort === s} onClick={() => setSoort(s)} className={pil(soort === s)}>{label}</button>)}
        </div>
        {g.kinderen.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {g.kinderen.map((k) => <button type="button" key={k} aria-pressed={voor === k} onClick={() => setVoor(voor === k ? "" : k)} className={pil(voor === k)}>{k}</button>)}
          </div>
        )}
        <input value={titel} onChange={(e) => setTitel(e.target.value)} maxLength={100} aria-label="Waar of wat"
          placeholder={soort === "halen" || soort === "brengen" ? "Waar, bijvoorbeeld school of zwemles" : "Wat, bijvoorbeeld tandarts"} className={veld} />
        <div className="flex gap-2">
          <input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} aria-label="Datum" className={veld} />
          <input type="time" value={tijd} onChange={(e) => setTijd(e.target.value)} aria-label="Tijd" className={`${veld} max-w-32`} />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="px-1 text-sm font-medium">Wie doet het?</span>
          <div className="flex flex-wrap gap-2">
            <button type="button" aria-pressed={wie === null} onClick={() => setWie(null)} className={pil(wie === null)}>Wie kan er?</button>
            {leden.map((l) => <button type="button" key={l.id} aria-pressed={wie === l.id} onClick={() => setWie(l.id)} className={pil(wie === l.id)}>{l.ik ? "Ik" : l.naam}</button>)}
          </div>
        </div>
        {fout && <p role="alert" className="px-1 text-sm text-red-600">{fout}</p>}
        <button className={knop} disabled={!titel.trim() && !voor}>Erin zetten</button>
      </form>
    </Onderblad>
  );
}

// --- Boodschappen -----------------------------------------------------------------------------------------------

function Boodschappen({ g }: { g: H }) {
  const [items, setItems] = useState<LijstItem[] | null>(null);
  const [tekst, setTekst] = useState("");
  const [fout, setFout] = useState("");
  const laden = useCallback(() => lijst(g.id).then(setItems).catch((e) => setFout(foutVan(e))), [g.id]);
  useEffect(() => { laden(); }, [laden]);
  const doe = (f: () => Promise<unknown>) => f().then(laden).catch((e) => setFout(foutVan(e)));

  async function erbij(e: FormEvent) {
    e.preventDefault();
    if (!tekst.trim()) return;
    const t = tekst;
    setTekst("");
    await doe(() => lijstBijwerken(g.id, "erbij", null, t));
  }

  async function vink(i: LijstItem) {
    await doe(() => lijstBijwerken(g.id, i.klaar ? "open" : "klaar", i.id));
    if (!i.klaar && items && items.filter((x) => !x.klaar).length === 1) mascotteZeg("Alles is gehaald. Lekker bezig!");
  }

  return <>
    <form onSubmit={erbij} className="flex gap-2">
      <input value={tekst} onChange={(e) => setTekst(e.target.value)} maxLength={100} placeholder="Wat moet er gehaald worden?" aria-label="Boodschap" className={veld} />
      <button disabled={!tekst.trim()} aria-label="Toevoegen" className={knop}><Plus className="size-5" /></button>
    </form>
    {items && items.length > 0 && (
      <ul className={lijn}>
        {items.map((i) => (
          <li key={i.id}>
            <label className="flex items-center gap-3 px-4 py-3">
              <input type="checkbox" checked={i.klaar} onChange={() => vink(i)} className="size-5 accent-[var(--color-accent)]" />
              <span className={`min-w-0 flex-1 truncate ${i.klaar ? "text-zacht line-through" : ""}`}>{i.tekst}</span>
              <span className="shrink-0 text-[13px] text-zacht">{i.door}</span>
            </label>
          </li>
        ))}
      </ul>
    )}
    {items?.some((i) => i.klaar) && (
      <button onClick={() => doe(() => lijstBijwerken(g.id, "klaar_weg"))} className="self-start text-sm font-medium text-accent">Gekochte weghalen</button>
    )}
    {items?.length === 0 && <p className="text-rustig">De lijst is leeg. Iedereen in het huishouden ziet wat je hier zet.</p>}
    {fout && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{fout}</p>}
  </>;
}

// --- Kosten delen -----------------------------------------------------------------------------------------------

function Kostendelen({ g }: { g: H }) {
  const [k, setK] = useState<{ kosten: K[]; saldo: Saldo[] } | null>(null);
  const [bedrag, setBedrag] = useState("");
  const [wat, setWat] = useState("");
  const [fout, setFout] = useState("");
  const ik = g.leden.find((l) => l.ik)?.id;
  const laden = useCallback(() => kosten(g.id).then(setK).catch((e) => setFout(foutVan(e))), [g.id]);
  useEffect(() => { laden(); }, [laden]);
  const doe = (f: () => Promise<unknown>) => f().then(laden).catch((e) => setFout(foutVan(e)));

  async function toevoegen(e: FormEvent) {
    e.preventDefault();
    const b = Number(bedrag.replace(/[€\s]/g, "").replace(",", "."));
    if (!b || !wat.trim()) return;
    await doe(() => kostenToevoegen(g.id, b, wat));
    setBedrag("");
    setWat("");
  }

  const stappen = k ? verrekenen(k.saldo) : [];
  return <>
    <form onSubmit={toevoegen} className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input value={bedrag} onChange={(e) => setBedrag(e.target.value)} inputMode="decimal" placeholder="€ 0,00" aria-label="Bedrag" className={`${veld} max-w-28 flex-none`} />
        <input value={wat} onChange={(e) => setWat(e.target.value)} maxLength={100} placeholder="Wat heb je betaald?" aria-label="Omschrijving" className={veld} />
      </div>
      <button disabled={!bedrag.trim() || !wat.trim()} className={knop}>Ik heb betaald</button>
      <p className="px-1 text-[13px] text-rustig">Wordt eerlijk verdeeld over iedereen met een account.</p>
    </form>
    {k && (stappen.length > 0 ? (
      <section className="flex flex-col gap-2">
        <h3 className="px-1 text-sm font-medium text-rustig">Om quitte te spelen</h3>
        <ul className={lijn}>
          {stappen.map((s, n) => (
            <li key={n} className="flex items-center gap-3 px-4 py-3">
              <span className="flex-1">{s.van.id === ik ? "Jij betaalt" : `${s.van.naam} betaalt`} {s.naar.id === ik ? "jou" : s.naar.naam}</span>
              <span className="font-medium">{euro(s.bedrag)}</span>
            </li>
          ))}
        </ul>
      </section>
    ) : k.kosten.length > 0 && <p className="text-rustig">Iedereen staat quitte.</p>)}
    {k && k.kosten.length > 0 && (
      <ul className={lijn}>
        {k.kosten.slice(0, 30).map((x) => (
          <li key={x.id} className="flex items-center gap-3 px-4 py-3">
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate">{x.omschrijving}</span>
              <span className="text-[13px] text-rustig">{x.betaald_door === ik ? "Jij" : x.betaald_naam} · {new Date(`${x.datum}T12:00:00`).toLocaleDateString("nl-NL", { day: "numeric", month: "short" })}</span>
            </span>
            <span className="shrink-0">{euro(x.bedrag)}</span>
            {(x.van_mij || x.betaald_door === ik) && <button aria-label="Weghalen" onClick={() => doe(() => kostenWeg(x.id))} className="flex size-8 shrink-0 items-center justify-center text-zacht"><Kruis className="size-4" /></button>}
          </li>
        ))}
      </ul>
    )}
    {fout && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{fout}</p>}
  </>;
}

// --- Klussen om de beurt --------------------------------------------------------------------------------------

function Klussen({ g }: { g: H }) {
  const [lijstK, setLijstK] = useState<Klus[] | null>(null);
  const [titel, setTitel] = useState("");
  const [elke, setElke] = useState<"dag" | "week">("week");
  const [fout, setFout] = useState("");
  const ik = g.leden.find((l) => l.ik)?.id;
  const leden = g.leden.filter((l) => l.status === "lid").map((l) => l.id);
  const laden = useCallback(() => klussen(g.id).then(setLijstK).catch((e) => setFout(foutVan(e))), [g.id]);
  useEffect(() => { laden(); }, [laden]);
  const doe = (f: () => Promise<unknown>) => f().then(laden).catch((e) => setFout(foutVan(e)));

  async function maak(e: FormEvent) {
    e.preventDefault();
    if (!titel.trim()) return;
    await doe(() => klusBijwerken(g.id, "maken", null, titel, elke, leden));
    setTitel("");
  }

  async function vink(k: Klus) {
    await doe(() => klusBijwerken(g.id, k.klaar ? "open" : "klaar", k.id));
    if (!k.klaar && k.wie === ik) mascotteZeg("Klus gedaan. Top!");
  }

  return <>
    {lijstK && lijstK.length > 0 && (
      <ul className={lijn}>
        {lijstK.map((k) => (
          <li key={k.id} className="flex items-center gap-3 px-4 py-3">
            <input type="checkbox" checked={k.klaar} onChange={() => vink(k)} aria-label={`${k.titel} klaar`} className="size-5 accent-[var(--color-accent)]" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className={`truncate ${k.klaar ? "text-zacht line-through" : "font-medium"}`}>{k.titel}</span>
              <span className="truncate text-[13px] text-rustig">{k.elke === "dag" ? "Vandaag" : "Deze week"}: {k.wie === ik ? "jij" : k.wie_naam} · daarna {k.daarna}</span>
            </span>
            <button aria-label="Weghalen" onClick={() => doe(() => klusBijwerken(g.id, "weg", k.id))} className="flex size-8 shrink-0 items-center justify-center text-zacht"><Kruis className="size-4" /></button>
          </li>
        ))}
      </ul>
    )}
    {lijstK?.length === 0 && <p className="text-rustig">Nog geen klussen. Iedereen met een account komt om de beurt aan de beurt.</p>}
    <form onSubmit={maak} className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input value={titel} onChange={(e) => setTitel(e.target.value)} maxLength={60} placeholder="Nieuwe klus, bijvoorbeeld afwassen" aria-label="Klus" className={veld} />
        <button disabled={!titel.trim()} aria-label="Toevoegen" className={knop}><Plus className="size-5" /></button>
      </div>
      <div className="flex gap-2">
        <button type="button" aria-pressed={elke === "week"} onClick={() => setElke("week")} className={pil(elke === "week")}>Elke week</button>
        <button type="button" aria-pressed={elke === "dag"} onClick={() => setElke("dag")} className={pil(elke === "dag")}>Elke dag</button>
      </div>
    </form>
    {fout && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{fout}</p>}
  </>;
}

// --- Leden ----------------------------------------------------------------------------------------------------

function Leden({ g, vernieuw, weg }: { g: H; vernieuw: () => Promise<unknown>; weg: () => void }) {
  const [naam, setNaam] = useState("");
  const [melding, setMelding] = useState("");
  async function nodig(e: FormEvent) {
    e.preventDefault();
    setMelding("");
    try {
      await uitnodigen(g.id, naam);
      setMelding(`${naam.trim()} is uitgenodigd.`);
      setNaam("");
      vernieuw();
    } catch (er) {
      setMelding(foutVan(er));
    }
  }
  return <>
    <ul className={lijn}>
      {g.leden.map((l) => (
        <li key={l.id} className="flex items-center justify-between px-4 py-3">
          <span>{l.ik ? "Jij" : l.naam}</span>
          {l.status === "uitgenodigd" && <span className="text-[13px] text-rustig">Uitgenodigd</span>}
        </li>
      ))}
      {g.kinderen.map((k) => (
        <li key={k} className="flex items-center justify-between px-4 py-3"><span>{k}</span><span className="text-[13px] text-rustig">Zonder account</span></li>
      ))}
    </ul>
    <form onSubmit={nodig} className="flex gap-2">
      <input value={naam} onChange={(e) => setNaam(e.target.value)} placeholder="Gebruikersnaam" aria-label="Gebruikersnaam" autoCapitalize="none" className={veld} />
      <button disabled={!naam.trim()} className={knop}>Uitnodigen</button>
    </form>
    {melding && <p role="status" className="px-1 text-sm text-rustig">{melding}</p>}
    <button onClick={async () => {
      if (!window.confirm(`Uit ${g.naam} stappen? Je ziet de agenda, lijst en kosten dan niet meer.`)) return;
      await antwoorden(g.id, "verlaten").catch(() => {});
      weg();
    }} className="self-start text-sm text-red-600 dark:text-red-400">
      Uit dit huishouden stappen
    </button>
  </>;
}

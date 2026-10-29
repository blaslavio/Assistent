// Afspraken met gasten zonder account: de boekingspagina, de pagina van de gast, de gesprekken in je chat en het
// instellen van je boekingspagina.
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Terug, Vinkje } from "../iconen";
import { STANDAARD, afhandelen, antwoorden, boekLink, boeken, gastAnnuleren, gastBekijken, gastSturen, gesprek,
  linkNaam, mailIngesteld, mailInstellen, mijnPagina, naarBoeking, paginaBekijken, paginaBewaren, tijden,
  type AfspraakVoorGast, type Boeking, type Boekpagina, type GastBericht, type GastGesprek,
  type PaginaVoorGast } from "../lib/gasten";
import { tijdje } from "../lib/tijd";
import { Rondje } from "../rondje";

const foutVan = (e: unknown) => (e instanceof Error ? e.message : "Dat lukte niet.");
const veld = "h-12 w-full rounded-2xl bg-vlak px-4 outline-none placeholder:text-zacht";
const dag = (iso: string, lang = false) => {
  const t = new Date(iso.length === 10 ? iso + "T12:00" : iso)
    .toLocaleDateString("nl-NL", lang ? { weekday: "long", day: "numeric", month: "long" } : { weekday: "short", day: "numeric", month: "short" });
  return t.charAt(0).toUpperCase() + t.slice(1);
};
const uur = (iso: string) => new Date(iso).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
const STATUS: Record<string, string> = { aangevraagd: "Aangevraagd, wacht op bevestiging", bevestigd: "Bevestigd",
  afgewezen: "Kan niet doorgaan", geannuleerd: "Geannuleerd" };

// --- Voor de gast ------------------------------------------------------------------------------------------------

/** De boekingspagina (?boek=linknaam): kies wat, wanneer, en laat je gegevens en eventueel een bericht achter. */
export function BoekScherm({ adres }: { adres: string }) {
  const [p, setP] = useState<PaginaVoorGast | null | undefined>(undefined);
  const [soort, setSoort] = useState(0);
  const [datum, setDatum] = useState("");
  const [momenten, setMomenten] = useState<string[] | null>(null);
  const [start, setStart] = useState("");
  const [naam, setNaam] = useState("");
  const [email, setEmail] = useState("");
  const [telefoon, setTelefoon] = useState("");
  const [bericht, setBericht] = useState("");
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState("");
  const [code, setCode] = useState<string | null>(null);

  useEffect(() => {
    paginaBekijken(adres, soort).then((x) => {
      setP(x);
      setDatum((d) => (x.dagen.includes(d) ? d : x.dagen[0] ?? ""));
    }).catch(() => setP(null));
  }, [adres, soort]);
  useEffect(() => {
    setStart("");
    setMomenten(null);
    if (datum) tijden(adres, soort, datum).then(setMomenten).catch(() => setMomenten([]));
  }, [adres, soort, datum]);

  async function verstuur(e: FormEvent) {
    e.preventDefault();
    setBezig(true);
    setFout("");
    try {
      const b = await boeken(adres, soort, start, naam.trim(), email.trim(), telefoon.trim(), bericht.trim());
      naarBoeking(b.code);
      setCode(b.code);
    } catch (er) {
      setFout(foutVan(er));
    } finally {
      setBezig(false);
    }
  }

  if (code) return <GastScherm code={code} net />;
  return (
    <main className="mx-auto flex min-h-full max-w-xl flex-col gap-6 px-6 pt-14 pb-10">
      {p === undefined ? <p className="bezig-tekst text-[15px]">Laden</p> : p === null ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Deze pagina bestaat niet (meer)</h1>
          <p className="text-rustig">Vraag om een nieuwe link.</p>
        </div>
      ) : (
        <>
          <header className="flex flex-col gap-1">
            <p className="text-sm text-rustig">Afspraak maken bij {p.naam}</p>
            <h1 className="text-[28px] font-bold leading-tight tracking-tight">{p.titel || p.naam}</h1>
            {p.intro && <p className="whitespace-pre-wrap text-[15px] text-rustig">{p.intro}</p>}
            {p.locatie && <p className="text-[15px]">{p.locatie}</p>}
          </header>
          {p.soorten.length > 1 && (
            <section className="flex flex-col gap-2">
              <h2 className="text-sm font-medium text-rustig">Wat voor afspraak</h2>
              <div className="flex flex-wrap gap-2">
                {p.soorten.map((s, i) => (
                  <button key={i} onClick={() => setSoort(i)} aria-pressed={soort === i}
                    className={`h-10 rounded-full px-4 text-sm ${soort === i ? "bg-inkt font-medium text-white dark:text-[#0b0b0e]" : "bg-vlak"}`}>
                    {s.naam} · {s.minuten} min</button>
                ))}
              </div>
            </section>
          )}
          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-medium text-rustig">Dag</h2>
            {p.dagen.length === 0 ? <p className="text-rustig">Er is nu geen moment vrij. Kijk later nog eens.</p> : (
              <div className="-mx-6 flex gap-2 overflow-x-auto px-6 pb-1">
                {p.dagen.map((d) => (
                  <button key={d} onClick={() => setDatum(d)} aria-pressed={datum === d}
                    className={`h-10 shrink-0 rounded-full px-4 text-sm ${datum === d ? "bg-inkt font-medium text-white dark:text-[#0b0b0e]" : "bg-vlak"}`}>
                    {dag(d)}</button>
                ))}
              </div>
            )}
          </section>
          {datum && (
            <section className="flex flex-col gap-2">
              <h2 className="text-sm font-medium text-rustig">Tijd</h2>
              {momenten === null ? <p className="bezig-tekst text-[15px]">Laden</p> : momenten.length === 0
                ? <p className="text-rustig">Deze dag is vol. Kies een andere dag.</p> : (
                <div className="grid grid-cols-4 gap-2">
                  {momenten.map((m) => (
                    <button key={m} onClick={() => setStart(m)} aria-pressed={start === m}
                      className={`h-11 rounded-2xl text-[15px] tabular-nums ${start === m ? "bg-accent font-medium text-white" : "bg-vlak"}`}>{uur(m)}</button>
                  ))}
                </div>
              )}
            </section>
          )}
          {start && (
            <form onSubmit={verstuur} className="opkomen flex flex-col gap-3">
              <h2 className="text-sm font-medium text-rustig">Jouw gegevens</h2>
              <input value={naam} onChange={(e) => setNaam(e.target.value)} placeholder="Naam" aria-label="Naam" maxLength={60}
                autoComplete="name" className={veld} />
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Mailadres" aria-label="Mailadres"
                type="email" autoComplete="email" className={veld} />
              <input value={telefoon} onChange={(e) => setTelefoon(e.target.value)} placeholder="Telefoon (mag leeg)" aria-label="Telefoon"
                type="tel" autoComplete="tel" maxLength={30} className={veld} />
              <textarea value={bericht} onChange={(e) => setBericht(e.target.value)} rows={3} maxLength={500}
                placeholder={`Bericht voor ${p.naam} (mag leeg)`} aria-label="Bericht"
                className="w-full resize-none rounded-2xl bg-vlak px-4 py-3 outline-none placeholder:text-zacht" />
              <p className="text-[13px] text-rustig">Je krijgt een mail met een link naar je afspraak. Daar zie je ook de antwoorden van {p.naam}. Een account is niet nodig.</p>
              {fout && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{fout}</p>}
              <button disabled={bezig || !naam.trim() || !email.trim()}
                className="h-12 rounded-2xl bg-accent font-medium text-white disabled:opacity-30">
                {p.bevestigen ? "Afspraak aanvragen" : "Afspraak maken"} · {dag(start)} {uur(start)}
              </button>
            </form>
          )}
        </>
      )}
    </main>
  );
}

/** De pagina van de gast (?boeking=code): de afspraak, annuleren, en het gesprek met de eigenaar. */
export function GastScherm({ code, net = false }: { code: string; net?: boolean }) {
  const [a, setA] = useState<AfspraakVoorGast | null | undefined>(undefined);
  const [tekst, setTekst] = useState("");
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState("");
  const [annuleer, setAnnuleer] = useState(false);

  const laden = useCallback(() => gastBekijken(code).then(setA).catch(() => setA(null)), [code]);
  useEffect(() => {
    laden();
    const t = setInterval(() => document.visibilityState === "visible" && laden(), 20000);
    return () => clearInterval(t);
  }, [laden]);

  async function doe(werk: () => Promise<unknown>) {
    setBezig(true);
    setFout("");
    try { await werk(); await laden(); } catch (e) { setFout(foutVan(e)); } finally { setBezig(false); }
  }

  return (
    <main className="mx-auto flex min-h-full max-w-xl flex-col gap-5 px-6 pt-14 pb-10">
      {a === undefined ? <p className="bezig-tekst text-[15px]">Laden</p> : a === null ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Deze link werkt niet (meer)</h1>
          <p className="text-rustig">Kijk in je mail voor de nieuwste link.</p>
        </div>
      ) : (
        <>
          {net && (
            <p role="status" className="flex items-center gap-2 rounded-2xl bg-vlak px-4 py-3 text-[15px]">
              <Vinkje className="size-5 shrink-0 text-accent" />
              {a.status === "aangevraagd" ? `Aangevraagd. ${a.naam} bevestigt het nog.` : "Je afspraak staat."} Je krijgt een mail met deze pagina.
            </p>
          )}
          <header className="flex flex-col gap-1">
            <p className="text-sm text-rustig">Afspraak bij {a.naam}</p>
            <h1 className="text-[28px] font-bold leading-tight tracking-tight">{a.soort}</h1>
            <p className="text-lg">{dag(a.start, true)}, {uur(a.start)}</p>
            {a.locatie && <p className="text-rustig">{a.locatie}</p>}
            <p className="text-[15px] text-rustig">{STATUS[a.status] ?? a.status}</p>
          </header>
          {a.mag_annuleren && (annuleer ? (
            <div className="flex gap-2">
              <button onClick={() => setAnnuleer(false)} className="h-11 flex-1 rounded-2xl bg-vlak font-medium">Toch niet</button>
              <button disabled={bezig} onClick={() => doe(async () => { await gastAnnuleren(code); setAnnuleer(false); })}
                className="h-11 flex-1 rounded-2xl bg-red-600 font-medium text-white disabled:opacity-50">Annuleren</button>
            </div>
          ) : (
            <button onClick={() => setAnnuleer(true)} className="h-11 w-fit rounded-full px-1 text-[15px] text-red-600 dark:text-red-400">Afspraak annuleren</button>
          ))}
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-medium text-rustig">Berichten met {a.naam}</h2>
            <Berichtenlijst berichten={a.berichten} ik="gast" ander={a.naam} />
            <form onSubmit={(e) => { e.preventDefault(); doe(async () => { await gastSturen(code, tekst.trim()); setTekst(""); }); }}
              className="flex flex-col gap-2">
              <textarea value={tekst} onChange={(e) => setTekst(e.target.value)} rows={2} maxLength={2000}
                placeholder={`Bericht aan ${a.naam}`} aria-label="Bericht"
                className="w-full resize-none rounded-2xl bg-vlak px-4 py-3 outline-none placeholder:text-zacht" />
              <button disabled={bezig || !tekst.trim()} className="h-11 self-end rounded-full bg-accent px-5 font-medium text-white disabled:opacity-30">Sturen</button>
            </form>
            {fout && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{fout}</p>}
            <p className="text-[13px] text-zacht">Antwoorden krijg je per mail. Bewaar die mail of deze pagina om terug te kijken.</p>
          </section>
        </>
      )}
    </main>
  );
}

function Berichtenlijst({ berichten, ik, ander }: { berichten: GastBericht[]; ik: "gast" | "eigenaar"; ander: string }) {
  if (!berichten.length) return <p className="text-[15px] text-rustig">Nog geen berichten.</p>;
  return (
    <ul className="flex flex-col gap-2">
      {berichten.map((m) => {
        const mijn = m.van === ik;
        return (
          <li key={m.id} className={`flex max-w-[85%] flex-col gap-0.5 ${mijn ? "self-end items-end" : "self-start"}`}>
            <p className={`whitespace-pre-wrap break-words rounded-3xl px-4 py-2.5 text-[15px] ${mijn ? "bg-accent text-white" : "bg-vlak"}`}>{m.tekst}</p>
            <span className="px-2 text-[12px] text-zacht">{mijn ? "" : `${ander} · `}{tijdje(m.aangemaakt)}</span>
          </li>
        );
      })}
    </ul>
  );
}

// --- Voor jou: gesprekken met gasten in de chat -------------------------------------------------------------------

export function GastenLijst({ lijst, open }: { lijst: GastGesprek[]; open: (boeking: number) => void }) {
  if (!lijst.length) return null;
  return (
    <section className="flex flex-col pb-2">
      <h2 className="px-6 pb-1 text-sm font-medium text-rustig">Gasten</h2>
      <ul className="flex flex-col px-3">
        {lijst.map((g) => (
          <li key={g.boeking}>
            <button onClick={() => open(g.boeking)} className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left hover:bg-vlak">
              <Rondje naam={g.naam} id={-5000 - g.boeking} groot />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex items-baseline gap-2">
                  <span className={`truncate ${g.ongelezen ? "font-semibold" : "font-medium"}`}>{g.naam}</span>
                  <span className="ml-auto shrink-0 text-[13px] text-zacht">{tijdje(g.laatst)}</span>
                </span>
                <span className="truncate text-sm text-rustig">{g.van === "eigenaar" ? "Jij: " : ""}{g.tekst}</span>
              </span>
              {g.ongelezen > 0 && (
                <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-semibold text-white">{g.ongelezen}</span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function GastGesprekScherm({ boeking, terug }: { boeking: number; terug: () => void }) {
  const [g, setG] = useState<Awaited<ReturnType<typeof gesprek>> | null>(null);
  const [tekst, setTekst] = useState("");
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState("");
  const [melding, setMelding] = useState("");

  const laden = useCallback(() => gesprek(boeking).then(setG).catch((e) => setFout(foutVan(e))), [boeking]);
  useEffect(() => {
    laden();
    const t = setInterval(() => document.visibilityState === "visible" && laden(), 10000);
    return () => clearInterval(t);
  }, [laden]);

  async function doe(werk: () => Promise<unknown>) {
    setBezig(true);
    setFout("");
    setMelding("");
    try { await werk(); await laden(); } catch (e) { setFout(foutVan(e)); } finally { setBezig(false); }
  }

  const b = g?.boeking;
  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-10 flex items-center gap-2 bg-white/90 px-3 pt-12 pb-2 backdrop-blur dark:bg-[#0b0b0e]/90">
        <button onClick={terug} aria-label="Terug" className="flex size-10 items-center justify-center rounded-full text-rustig hover:bg-vlak"><Terug /></button>
        {b && <span className="flex min-w-0 flex-col">
          <span className="truncate font-semibold">{b.naam}</span>
          <span className="truncate text-[13px] text-rustig">{b.soort} · {dag(b.start)} {uur(b.start)}</span>
        </span>}
      </header>
      {!g ? <p className="bezig-tekst px-6 py-4 text-[15px]">{fout || "Laden"}</p> : (
        <div className="flex flex-1 flex-col gap-4 px-6 pb-8">
          <div className="flex flex-col gap-2 rounded-2xl bg-vlak px-4 py-3">
            <p className="text-[15px]">{STATUS[g.boeking.status] ?? g.boeking.status}</p>
            <p className="text-[13px] text-rustig">{[g.boeking.email, g.boeking.telefoon].filter(Boolean).join(" · ")}</p>
            {g.boeking.status === "aangevraagd" && (
              <div className="flex gap-2">
                <button disabled={bezig} onClick={() => doe(() => afhandelen(boeking, "bevestigen"))}
                  className="h-10 rounded-full bg-accent px-4 text-sm font-medium text-white disabled:opacity-50">Bevestigen</button>
                <button disabled={bezig} onClick={() => doe(() => afhandelen(boeking, "afwijzen"))}
                  className="h-10 rounded-full bg-white px-4 text-sm dark:bg-[#2a2a30] disabled:opacity-50">Afwijzen</button>
              </div>
            )}
          </div>
          <Berichtenlijst berichten={g.berichten} ik="eigenaar" ander={g.boeking.naam} />
          <form onSubmit={(e) => {
            e.preventDefault();
            doe(async () => {
              const r = await antwoorden(boeking, tekst.trim());
              setTekst("");
              setMelding(r.gemaild ? `Verstuurd naar ${g.boeking.email}.` : "Bewaard. De gast ziet het via de link uit de bevestiging.");
            });
          }} className="mt-auto flex flex-col gap-2">
            <textarea value={tekst} onChange={(e) => setTekst(e.target.value)} rows={2} maxLength={2000}
              placeholder={`Antwoord aan ${g.boeking.naam}`} aria-label="Antwoord"
              className="w-full resize-none rounded-2xl bg-vlak px-4 py-3 outline-none placeholder:text-zacht" />
            <div className="flex items-center gap-3">
              <p className="flex-1 text-[12px] text-zacht">{g.mail ? "Je antwoord gaat per mail naar de gast. Niet versleuteld." : "Mail versturen staat nog uit, dus de gast ziet je antwoord alleen op de eigen pagina."}</p>
              <button disabled={bezig || !tekst.trim()} className="h-10 shrink-0 rounded-full bg-accent px-5 text-sm font-medium text-white disabled:opacity-30">Sturen</button>
            </div>
          </form>
          {melding && <p role="status" className="text-sm text-rustig">{melding}</p>}
          {fout && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{fout}</p>}
        </div>
      )}
    </div>
  );
}

// --- Voor jou: je boekingspagina instellen -----------------------------------------------------------------------

const DAGEN = [["1", "Ma"], ["2", "Di"], ["3", "Wo"], ["4", "Do"], ["5", "Vr"], ["6", "Za"], ["7", "Zo"]] as const;

export function BoekpaginaInstellen({ naam }: { naam: string }) {
  const [p, setP] = useState<Boekpagina | null>(null);
  const [opgeslagen, setOpgeslagen] = useState(false);
  const [boekingen, setBoekingen] = useState<Boeking[]>([]);
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState("");
  const [fout, setFout] = useState("");

  const laden = useCallback(() => mijnPagina().then((m) => {
    setOpgeslagen(!!m.pagina);
    setP((oud) => oud ?? m.pagina ?? { ...STANDAARD, adres: linkNaam(naam) || "mijn-afspraken" });
    setBoekingen(m.boekingen.filter((b) => !b.via_chat && b.status !== "geannuleerd" && b.status !== "afgewezen"));
  }).catch((e) => setFout(foutVan(e))), [naam]);
  useEffect(() => { laden(); }, [laden]);

  if (!p) return <p className="bezig-tekst px-1">{fout || "Laden"}</p>;
  const zet = (n: Partial<Boekpagina>) => setP({ ...p, ...n });
  const eersteDag = DAGEN.find(([d]) => p.uren[d]?.length)?.[0];
  const [van, tot] = (eersteDag && p.uren[eersteDag][0]) || ["09:00", "17:00"];
  const zetUren = (dagen: string[], v: string, t: string) =>
    zet({ uren: Object.fromEntries(dagen.map((d) => [d, [[v, t]]])) as Boekpagina["uren"] });
  const actieveDagen = DAGEN.map(([d]) => d).filter((d) => p.uren[d]?.length);

  async function bewaar() {
    setBezig(true);
    setFout("");
    setMelding("");
    try {
      setP(await paginaBewaren(p!));
      setOpgeslagen(true);
      setMelding("Bewaard");
    } catch (e) {
      setFout(foutVan(e));
    } finally {
      setBezig(false);
    }
  }

  async function deel() {
    const url = boekLink(p!.adres);
    try {
      if (navigator.share) return await navigator.share({ title: p!.titel || "Afspraak maken", url });
      await navigator.clipboard.writeText(url);
      setMelding("Link gekopieerd.");
    } catch (e) {
      if ((e as Error).name !== "AbortError") setMelding(url);
    }
  }

  return <>
    <p className="px-1 text-rustig">Mensen zonder account plannen zelf een afspraak in op momenten dat je vrij bent. Hun bericht komt in je chat onder Gasten; jouw antwoord krijgen ze per mail.</p>
    <label className="flex items-center gap-4 rounded-2xl bg-vlak px-4 py-3.5">
      <span className="flex-1 font-medium">Pagina staat aan</span>
      <input type="checkbox" checked={p.aan} onChange={(e) => zet({ aan: e.target.checked })} className="size-5 accent-[var(--color-accent)]" />
    </label>
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-medium text-rustig">Pagina</h2>
      <input value={p.titel} onChange={(e) => zet({ titel: e.target.value })} maxLength={80} placeholder={`Titel, bijvoorbeeld Afspraak met ${naam}`}
        aria-label="Titel" className={veld} />
      <textarea value={p.intro} onChange={(e) => zet({ intro: e.target.value })} maxLength={400} rows={2} placeholder="Korte uitleg (mag leeg)"
        aria-label="Uitleg" className="w-full resize-none rounded-2xl bg-vlak px-4 py-3 outline-none placeholder:text-zacht" />
      <input value={p.locatie} onChange={(e) => zet({ locatie: e.target.value })} maxLength={200} placeholder="Plaats of adres (mag leeg)"
        aria-label="Plaats" className={veld} />
      <div className="flex items-center gap-2 rounded-2xl bg-vlak px-4">
        <span className="shrink-0 text-[15px] text-rustig">?boek=</span>
        <input value={p.adres} onChange={(e) => zet({ adres: linkNaam(e.target.value) })} aria-label="Linknaam"
          className="h-12 min-w-0 flex-1 bg-transparent outline-none" />
      </div>
    </section>
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-medium text-rustig">Soorten afspraken</h2>
      {p.soorten.map((s, i) => (
        <div key={i} className="flex gap-2">
          <input value={s.naam} onChange={(e) => zet({ soorten: p.soorten.map((x, j) => (j === i ? { ...x, naam: e.target.value } : x)) })}
            maxLength={60} aria-label="Naam van de afspraak" className={`${veld} flex-1`} />
          <select value={s.minuten} onChange={(e) => zet({ soorten: p.soorten.map((x, j) => (j === i ? { ...x, minuten: Number(e.target.value) } : x)) })}
            aria-label="Duur" className="h-12 rounded-2xl bg-vlak px-3 outline-none">
            {[15, 30, 45, 60, 90, 120].map((m) => <option key={m} value={m}>{m} min</option>)}
          </select>
          {p.soorten.length > 1 && (
            <button onClick={() => zet({ soorten: p.soorten.filter((_, j) => j !== i) })} aria-label="Weghalen"
              className="h-12 rounded-2xl px-3 text-rustig">×</button>
          )}
        </div>
      ))}
      {p.soorten.length < 6 && (
        <button onClick={() => zet({ soorten: [...p.soorten, { naam: "", minuten: 30 }] })}
          className="h-10 w-fit rounded-full px-1 text-[15px] font-medium text-accent">Soort toevoegen</button>
      )}
    </section>
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-medium text-rustig">Wanneer</h2>
      <div className="grid grid-cols-7 gap-1">
        {DAGEN.map(([d, n]) => {
          const aan = actieveDagen.includes(d);
          return (
            <button key={d} aria-pressed={aan} onClick={() => zetUren(aan ? actieveDagen.filter((x) => x !== d) : [...actieveDagen, d], van, tot)}
              className={`h-10 rounded-xl text-sm ${aan ? "bg-accent font-medium text-white" : "bg-vlak text-rustig"}`}>{n}</button>
          );
        })}
      </div>
      <div className="flex items-center gap-2">
        <input type="time" value={van} onChange={(e) => zetUren(actieveDagen, e.target.value, tot)} aria-label="Vanaf" className={`${veld} min-w-0 flex-1`} />
        <span className="text-rustig">tot</span>
        <input type="time" value={tot} onChange={(e) => zetUren(actieveDagen, van, e.target.value)} aria-label="Tot" className={`${veld} min-w-0 flex-1`} />
      </div>
      <p className="px-1 text-[13px] text-zacht">Momenten waarop al iets in je agenda staat, worden niet aangeboden.</p>
    </section>
    <label className="flex items-center gap-4 rounded-2xl bg-vlak px-4 py-3.5">
      <span className="flex flex-1 flex-col">
        <span className="font-medium">Eerst zelf bevestigen</span>
        <span className="text-sm text-rustig">Anders staat een afspraak meteen vast.</span>
      </span>
      <input type="checkbox" checked={p.bevestigen} onChange={(e) => zet({ bevestigen: e.target.checked })} className="size-5 accent-[var(--color-accent)]" />
    </label>
    <div className="flex gap-2">
      <button disabled={bezig} onClick={bewaar} className="h-12 flex-1 rounded-2xl bg-accent font-medium text-white disabled:opacity-50">Bewaar</button>
      {opgeslagen && p.aan && <button onClick={deel} className="h-12 flex-1 rounded-2xl bg-vlak font-medium">Link delen</button>}
    </div>
    {melding && <p role="status" className={`px-1 text-sm text-rustig ${melding.startsWith("http") ? "break-all" : ""}`}>{melding}</p>}
    {fout && <p role="alert" className="px-1 text-sm text-red-600 dark:text-red-400">{fout}</p>}
    {boekingen.length > 0 && (
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-rustig">Komende afspraken</h2>
        <ul className="flex flex-col divide-y divide-lijn rounded-2xl bg-vlak">
          {boekingen.map((b) => (
            <li key={b.id} className="flex items-center gap-3 px-4 py-3">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-medium">{b.naam} · {b.soort}</span>
                <span className="text-[13px] text-rustig">{dag(b.start)} {uur(b.start)} · {b.status}</span>
              </span>
              {b.status === "aangevraagd" && (
                <button onClick={() => afhandelen(b.id, "bevestigen").then(laden).catch((e) => setFout(foutVan(e)))}
                  className="h-9 shrink-0 rounded-full bg-accent px-3.5 text-sm font-medium text-white">Bevestigen</button>
              )}
            </li>
          ))}
        </ul>
      </section>
    )}
  </>;
}

/** Alleen de eigenaar van de app: mails versturen aan gasten (en herstelcodes) via Brevo. */
export function MailVersturen() {
  const [aan, setAan] = useState<boolean | null>(null);
  const [sleutel, setSleutel] = useState("");
  const [afzender, setAfzender] = useState("");
  const [melding, setMelding] = useState("");
  useEffect(() => { mailIngesteld().then(setAan).catch(() => setAan(false)); }, []);
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-medium text-rustig">Mails van de app (alleen jij)</h2>
      <p className="px-1 text-[15px] text-rustig">{aan ? "Staat aan. Gasten krijgen je antwoorden per mail." : "Staat nog uit. Maak een gratis account bij Brevo en vul hier de API-sleutel en je afzenderadres in."}</p>
      <form className="flex flex-col gap-2" onSubmit={(e) => {
        e.preventDefault();
        mailInstellen(sleutel, afzender).then(() => { setSleutel(""); setAan(true); setMelding("Bewaard"); })
          .catch((er) => setMelding(foutVan(er)));
      }}>
        <input type="password" value={sleutel} onChange={(e) => setSleutel(e.target.value)} placeholder="API-sleutel (xkeysib-…)"
          autoComplete="off" aria-label="API-sleutel van Brevo" className={veld} />
        <input type="email" value={afzender} onChange={(e) => setAfzender(e.target.value)} placeholder="Afzender, bijvoorbeeld noreply@jouwdomein.nl"
          aria-label="Afzenderadres" className={veld} />
        <button disabled={!afzender.trim() || (!aan && !sleutel.trim())} className="h-12 rounded-2xl bg-accent font-medium text-white disabled:opacity-30">Bewaar</button>
      </form>
      {melding && <p role="status" className="px-1 text-sm text-rustig">{melding}</p>}
    </section>
  );
}

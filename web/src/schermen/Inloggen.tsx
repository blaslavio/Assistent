import { AANBIEDERS, beschikbareAanbieders, externBeginnen, externAfronden, isExterneTerugkomst, type Aanbieder } from "../lib/externAanmelden";
// Het eerste scherm: inloggen, een account maken, of je wachtwoord terugkrijgen met een code per mail.
import { lazy, Suspense, useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { apparaatNaam, inloggen } from "../api";
import { accountMaken, codeSturen, herstelAanvragen, herstelAfronden, mailIngesteld, voorbereiden } from "../lib/aanmelden";
import AanmeldLogo from "./AanmeldLogo";
import { Onderblad } from "./Onderblad";

const Opmaak = lazy(() => import("./Beveiliging").then((m) => ({ default: m.Opmaak })));
const Teksten = lazy(() => import("../lib/teksten").then((m) => ({
  default: ({ welke }: { welke: "voorwaarden" | "privacy" }) => <Opmaak tekst={welke === "voorwaarden" ? m.VOORWAARDEN : m.PRIVACY} />,
})));

const veld = "h-13 w-full rounded-full border border-lijn bg-transparent px-4 text-base outline-none focus:ring-2 focus:ring-accent";
const hoofdknop = "mt-2 h-13 rounded-full bg-inkt font-semibold text-white disabled:opacity-40 dark:text-black";
const linkje = "self-center py-2 text-[15px] font-medium text-accent";
const geenVerbinding = "Even geen verbinding. Probeer het zo opnieuw.";
const tekstVan = (e: unknown) => (e instanceof Error && e.message && !/fetch|network|load failed/i.test(e.message) ? e.message : geenVerbinding);

type Stand = "inloggen" | "nieuw" | "vergeten";

export default function Inloggen({ opIngelogd }: { opIngelogd: () => Promise<void> }) {
  const [externTerug] = useState(isExterneTerugkomst);
  const [externBezig, setExternBezig] = useState(externTerug);
  const [externFout, setExternFout] = useState("");
  useEffect(() => {
    if (!externTerug) return;
    let actief = true;
    externAfronden().then(() => { if (actief) return opIngelogd(); })
      .catch(() => { if (actief) setExternFout("Aanmelden lukte niet of is afgebroken. Probeer opnieuw of gebruik je mailadres en wachtwoord."); })
      .finally(() => { if (actief) setExternBezig(false); });
    return () => { actief = false; };
  }, [externTerug, opIngelogd]);
  const [lezen, setLezen] = useState<"voorwaarden" | "privacy" | null>(null);
  const [stand, setStand] = useState<Stand>("inloggen");
  const [mail, setMail] = useState<boolean | null>(null);
  useEffect(() => { let actief = true; mailIngesteld().then(v => { if (actief) setMail(v); }).catch(() => { if (actief) setMail(false); }); return () => { actief = false; }; }, []);
  return (
    <main className="h-full overflow-y-auto"><div className="mx-auto flex min-h-full max-w-md flex-col justify-center gap-6 px-6 py-10">
      <p className="text-lg font-semibold tracking-tight">Assistent</p>
      {externFout && <p role="alert" className="text-sm text-red-600">{externFout}</p>}
      {externBezig ? <p role="status">Je aanmelding wordt gecontroleerd…</p> : stand === "inloggen" && <Inlog opIngelogd={opIngelogd} naar={setStand} mail={!!mail} />}
      {stand === "nieuw" && <Nieuw opIngelogd={opIngelogd} naar={setStand} mail={!!mail} />}
      {stand === "vergeten" && <Vergeten opIngelogd={opIngelogd} naar={setStand} />}
      <footer className="flex flex-wrap justify-center gap-x-5 text-sm text-rustig">
        <button type="button" className="min-h-11 underline underline-offset-4" onClick={() => setLezen("voorwaarden")}>Voorwaarden</button>
        <button type="button" className="min-h-11 underline underline-offset-4" onClick={() => setLezen("privacy")}>Privacy</button>
      </footer>
      {lezen && <Onderblad titel={lezen === "voorwaarden" ? "Voorwaarden" : "Privacyverklaring"} sluit={() => setLezen(null)}>
        <Suspense fallback={<p>Even laden…</p>}><Teksten welke={lezen} /></Suspense>
        <button type="button" className="min-h-11 rounded-full bg-vlak" onClick={() => setLezen(null)}>Sluiten</button>
      </Onderblad>}
    </div></main>
  );
}

type Deel = { opIngelogd: () => Promise<void>; naar: (s: Stand) => void };

function Formulier({ titel, uitleg, fout, onSubmit, children, vooraf }: { titel: string; uitleg?: string; fout: string; vooraf?: ReactNode;
  onSubmit: (e: FormEvent) => void; children: ReactNode }) {
  return <>
    <div className="flex flex-col gap-1">
      <h1 className="text-[32px] font-bold tracking-tight">{titel}</h1>
      {uitleg && <p className="text-[15px] text-rustig">{uitleg}</p>}
    </div>
    {vooraf}
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      {children}
      {fout && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{fout}</p>}
    </form>
  </>;
}

function Inlog({ opIngelogd, naar, mail }: Deel & { mail: boolean }) {
  const [naam, setNaam] = useState("");
  const [wachtwoord, setWachtwoord] = useState("");
  const [code, setCode] = useState("");
  const [codeNodig, setCodeNodig] = useState(false);
  const [fout, setFout] = useState("");
  const [bezig, setBezig] = useState(false);

  async function versturen(e: FormEvent) {
    e.preventDefault();
    if (!naam.trim() || !wachtwoord || bezig) return;
    setBezig(true);
    setFout("");
    try {
      const a = await inloggen(naam, wachtwoord, code);
      if (a.token) await opIngelogd();
      else if (a.code_nodig) setCodeNodig(true);
      if (a.fout) setFout(a.fout);
      else if (!a.token && !a.code_nodig) setFout("Naam of wachtwoord klopt niet.");
    } catch {
      setFout(geenVerbinding);
    } finally {
      setBezig(false);
    }
  }

  return <>
    <Formulier titel={codeNodig ? "Bevestig je aanmelding" : "Aanmelden of registreren"} fout={fout} onSubmit={versturen}>
      {!codeNodig ? (
        <>
          <label className="sr-only" htmlFor="naam">Gebruikersnaam of mailadres</label>
          <input id="naam" disabled={bezig} className={veld} placeholder="Gebruikersnaam of mailadres" autoComplete="username"
            autoCapitalize="none" value={naam} onChange={(e) => setNaam(e.target.value)} />
          <label className="sr-only" htmlFor="wachtwoord">Wachtwoord</label>
          <input disabled={bezig} id="wachtwoord" className={veld} type="password" placeholder="Wachtwoord"
            autoComplete="current-password" value={wachtwoord} onChange={(e) => setWachtwoord(e.target.value)} />
        </>
      ) : (
        <>
          <label htmlFor="code" className="text-sm text-rustig">Code uit je app</label>
          <input id="code" disabled={bezig} className={veld} inputMode="numeric" autoComplete="one-time-code" placeholder="6 cijfers"
            autoFocus value={code} onChange={(e) => setCode(e.target.value)} />
        </>
      )}
      <button disabled={bezig || !naam.trim() || !wachtwoord} className={hoofdknop}>{bezig ? "Even geduld" : "Inloggen"}</button>
    </Formulier>
    <div className="-mt-4 flex flex-col">
      {mail && <button disabled={bezig} className={linkje} onClick={() => naar("vergeten")}>Wachtwoord vergeten?</button>}
      <button disabled={bezig} className={linkje} onClick={() => naar("nieuw")}>Nieuw hier? Maak een account</button>
    </div>
    {!codeNodig && <ExternAanmelden />}
  </>;
}

function Nieuw({ opIngelogd, naar, mail }: Deel & { mail: boolean }) {
  const [v, setV] = useState({ weergavenaam: "", naam: "", email: "", wachtwoord: "", akkoord: false });
  const [fout, setFout] = useState("");
  const [bezig, setBezig] = useState(false);
  const [lezen, setLezen] = useState<null | "voorwaarden" | "privacy">(null);
  // De rekenpuzzel (alleen voor mensen) lost de browser alvast op terwijl je het formulier invult.
  const puzzel = useRef<ReturnType<typeof voorbereiden> | null>(null);
  useEffect(() => {
    puzzel.current = voorbereiden();
    puzzel.current.catch(() => {});
  }, []);
  const zet = (k: keyof typeof v) => (e: { target: { value: string; checked?: boolean } }) =>
    setV((o) => ({ ...o, [k]: k === "akkoord" ? !!e.target.checked : e.target.value }));
  const naamOk = /^[a-z0-9_.-]{3,30}$/.test(v.naam.trim().toLowerCase().replace(/^@/, ""));

  async function versturen(e: FormEvent) {
    e.preventDefault();
    setFout("");
    if (!naamOk) return setFout("Kies een gebruikersnaam van 3 tot 30 tekens: kleine letters, cijfers, punt of streepje.");
    if (v.wachtwoord.length < 10) return setFout("Kies een wachtwoord van minstens 10 tekens.");
    if (!v.akkoord) return setFout("Ga akkoord met de voorwaarden en de privacyverklaring.");
    setBezig(true);
    try {
      const p = await (puzzel.current ?? voorbereiden()).catch(() => voorbereiden());
      try {
        await accountMaken(v, p);
      } catch (f) {
        puzzel.current = voorbereiden();
        puzzel.current.catch(() => {});
        throw f;
      }
      const a = await inloggen(v.naam.trim().toLowerCase().replace(/^@/, ""), v.wachtwoord);
      if (!a.token) throw new Error("Je account is gemaakt. Log nu in.");
      if (mail) await codeSturen().catch(() => {});
      await opIngelogd();
    } catch (f) {
      setFout(tekstVan(f));
    } finally {
      setBezig(false);
    }
  }

  return <>
    <Formulier titel="Account maken" uitleg="Gratis. Je gegevens zijn alleen van jou." fout={fout} onSubmit={versturen}>
      <input className={veld} placeholder="Je naam, bijvoorbeeld Sanne" autoComplete="name" aria-label="Je naam"
        value={v.weergavenaam} onChange={zet("weergavenaam")} />
      <input className={veld} placeholder="Gebruikersnaam, bijvoorbeeld sanne.k" autoComplete="username" autoCapitalize="none"
        aria-label="Gebruikersnaam" value={v.naam} onChange={zet("naam")} />
      <input className={veld} type="email" placeholder="Mailadres" autoComplete="email" aria-label="Mailadres"
        value={v.email} onChange={zet("email")} />
      <input className={veld} type="password" placeholder="Wachtwoord, minstens 10 tekens" autoComplete="new-password"
        aria-label="Wachtwoord" value={v.wachtwoord} onChange={zet("wachtwoord")} />
      <label className="flex items-start gap-3 px-1 py-1 text-[15px]">
        <input type="checkbox" className="mt-1 size-5 shrink-0 accent-accent" checked={v.akkoord} onChange={zet("akkoord")} />
        <span>Ik ben 16 jaar of ouder en ga akkoord met de{" "}
          <button type="button" className="font-medium text-accent" onClick={() => setLezen("voorwaarden")}>voorwaarden</button> en de{" "}
          <button type="button" className="font-medium text-accent" onClick={() => setLezen("privacy")}>privacyverklaring</button>.</span>
      </label>
      <button disabled={bezig || !v.naam || !v.email || !v.wachtwoord} className={hoofdknop}>
        {bezig ? "Even geduld" : "Account maken"}</button>
    </Formulier>
    <button className={`${linkje} -mt-4`} onClick={() => naar("inloggen")}>Ik heb al een account</button>
    {lezen && (
      <Onderblad titel={lezen === "voorwaarden" ? "Voorwaarden" : "Privacyverklaring"} sluit={() => setLezen(null)}>
        <Suspense fallback={<p className="text-rustig">Even laden</p>}><Teksten welke={lezen} /></Suspense>
        <button className="h-12 rounded-2xl bg-vlak font-medium" onClick={() => setLezen(null)}>Sluiten</button>
      </Onderblad>
    )}
  </>;
}

function Vergeten({ opIngelogd, naar }: Deel) {
  const [stap, setStap] = useState<"mail" | "code">("mail");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [nieuw, setNieuw] = useState("");
  const [tweeStap, setTweeStap] = useState("");
  const [tweeStapNodig, setTweeStapNodig] = useState(false);
  const [fout, setFout] = useState("");
  const [bezig, setBezig] = useState(false);

  async function doe(e: FormEvent, werk: () => Promise<void>) {
    e.preventDefault();
    setFout("");
    setBezig(true);
    try { await werk(); } catch (f) { setFout(tekstVan(f)); } finally { setBezig(false); }
  }

  if (stap === "mail") return <>
    <Formulier titel="Wachtwoord vergeten" uitleg="Vul je mailadres in. Je krijgt een code om een nieuw wachtwoord te kiezen."
      fout={fout} onSubmit={(e) => doe(e, async () => { await herstelAanvragen(email, apparaatNaam()); setStap("code"); })}>
      <input className={veld} type="email" placeholder="Mailadres" autoComplete="email" aria-label="Mailadres" autoFocus
        value={email} onChange={(e) => setEmail(e.target.value)} />
      <button disabled={bezig || !email.includes("@")} className={hoofdknop}>{bezig ? "Even geduld" : "Stuur code"}</button>
    </Formulier>
    <button className={`${linkje} -mt-4`} onClick={() => naar("inloggen")}>Terug naar inloggen</button>
  </>;

  return <>
    <Formulier titel="Kijk in je mail" fout={fout}
      uitleg={`Als er een account bij ${email.trim()} hoort, staat er nu een code van 6 cijfers in je mail. Hij is 15 minuten geldig.`}
      onSubmit={(e) => doe(e, async () => {
        const r = await herstelAfronden(email, code, nieuw, tweeStap, apparaatNaam());
        if (r.token) return opIngelogd();
        if (r.code_nodig) setTweeStapNodig(true);
        if (r.fout) throw new Error(r.fout);
      })}>
      <input className={veld} inputMode="numeric" autoComplete="one-time-code" placeholder="Code uit de mail" aria-label="Code uit de mail"
        value={code} onChange={(e) => setCode(e.target.value)} />
      <input className={veld} type="password" placeholder="Nieuw wachtwoord, minstens 10 tekens" autoComplete="new-password"
        aria-label="Nieuw wachtwoord" value={nieuw} onChange={(e) => setNieuw(e.target.value)} />
      {tweeStapNodig && (
        <input className={veld} inputMode="numeric" placeholder="Code uit je app of een herstelcode" aria-label="Code uit je app" autoFocus
          value={tweeStap} onChange={(e) => setTweeStap(e.target.value)} />
      )}
      <button disabled={bezig || code.replace(/\D/g, "").length < 6 || nieuw.length < 10} className={hoofdknop}>
        {bezig ? "Even geduld" : "Nieuw wachtwoord opslaan"}</button>
    </Formulier>
    <div className="-mt-4 flex flex-col">
      <button className={linkje} onClick={() => { setStap("mail"); setCode(""); setFout(""); }}>Geen code gekregen? Opnieuw sturen</button>
      <button className={linkje} onClick={() => naar("inloggen")}>Terug naar inloggen</button>
    </div>
  </>;
}

function ExternAanmelden() {
  const statusId = useId();
  const [beschikbaar, setBeschikbaar] = useState<Record<Aanbieder, boolean> | null>(null);
  const [ladenFout, setLadenFout] = useState("");
  const [poging, setPoging] = useState(0);
  const [keuze, setKeuze] = useState<Aanbieder | null>(null);
  const [akkoord, setAkkoord] = useState(false);
  const [meer, setMeer] = useState(false);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState("");
  const [lezen, setLezen] = useState<"voorwaarden" | "privacy" | null>(null);
  useEffect(() => {
    let actief = true;
    setLadenFout("");
    beschikbareAanbieders().then(v => { if (actief) setBeschikbaar(v); })
      .catch(() => { if (actief) setLadenFout("Externe aanmelding is nu niet beschikbaar. Gebruik je mailadres of probeer opnieuw."); });
    return () => { actief = false; };
  }, [poging]);
  const naam = AANBIEDERS.find(a => a.id === keuze)?.naam;
  const inactief = AANBIEDERS.filter(a => (meer || a.id !== "azure") && beschikbaar && !beschikbaar[a.id]);
  return <section aria-label="Andere aanmeldmogelijkheden" className="flex flex-col gap-3">
    <div className="mb-1 flex items-center gap-4 text-center text-sm text-rustig"><span className="h-px flex-1 bg-lijn" /><span>Of ga verder met</span><span className="h-px flex-1 bg-lijn" /></div>
    <div className="flex flex-col gap-2">{AANBIEDERS.filter(a => meer || a.id !== "azure").map(a =>
      <button key={a.id} type="button" aria-describedby={!beschikbaar?.[a.id] ? statusId : undefined} disabled={!beschikbaar?.[a.id] || bezig} onClick={() => { setKeuze(a.id); setAkkoord(false); setFout(""); }}
        className="flex min-h-13 items-center justify-center gap-3 rounded-full border border-lijn px-4 py-3 font-medium text-inkt disabled:opacity-50">
        <AanmeldLogo aanbieder={a.id} /> Doorgaan met {a.naam}
      </button>)}</div>
    <button type="button" aria-expanded={meer} onClick={() => setMeer(!meer)} className="min-h-11 text-sm text-rustig">{meer ? "Minder aanmeldmethoden" : "Andere aanmeldmethoden"}</button>
    {ladenFout ? <p id={statusId} role="status" className="text-sm text-rustig">{ladenFout} <button type="button" className="min-h-11 text-accent" onClick={() => setPoging(n => n + 1)}>Opnieuw ophalen</button></p>
      : !beschikbaar ? <p id={statusId} role="status" className="text-sm text-rustig">Aanmeldmogelijkheden controleren…</p>
      : !!inactief.length && <p id={statusId} className="text-sm text-rustig">Nog niet actief: {inactief.map(a => a.naam).join(", ")}. Je kunt hierboven met je mailadres of gebruikersnaam inloggen.</p>}
    {keuze && <div className="flex flex-col gap-3 rounded-2xl bg-vlak p-4">
      <p className="text-sm text-rustig">Je gaat naar {naam} om je identiteit te bevestigen. Assistent krijgt je naam en mailadres, geen wachtwoord van {naam}.</p>
      <label className="flex gap-3 text-sm"><input type="checkbox" checked={akkoord} onChange={e => setAkkoord(e.target.checked)} className="mt-1 size-5 shrink-0" />
        <span>Ik ben 16 jaar of ouder en ga akkoord met de voorwaarden en privacyverklaring.</span></label>
      <div className="flex gap-4"><button type="button" className="min-h-11 text-sm text-accent" onClick={() => setLezen("voorwaarden")}>Voorwaarden lezen</button>
        <button type="button" className="min-h-11 text-sm text-accent" onClick={() => setLezen("privacy")}>Privacyverklaring lezen</button></div>
      {fout && <p role="alert" className="text-sm text-red-600">{fout}</p>}
      <button type="button" disabled={!akkoord || bezig} className={hoofdknop} onClick={async () => {
        setBezig(true); setFout("");
        try { await externBeginnen(keuze, akkoord); }
        catch (e) { setFout(tekstVan(e)); setBezig(false); }
      }}>{bezig ? "Even geduld…" : `Doorgaan naar ${naam}`}</button>
      <button type="button" disabled={bezig} className="min-h-11 text-sm text-rustig" onClick={() => setKeuze(null)}>Annuleren</button>
    </div>}
    {lezen && <Onderblad titel={lezen === "voorwaarden" ? "Voorwaarden" : "Privacyverklaring"} sluit={() => setLezen(null)}>
      <Suspense fallback={<p>Even laden…</p>}><Teksten welke={lezen} /></Suspense>
    </Onderblad>}
  </section>;
}

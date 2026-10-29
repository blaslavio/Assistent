// Het eerste scherm: inloggen, een account maken, of je wachtwoord terugkrijgen met een code per mail.
import { lazy, Suspense, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { apparaatNaam, inloggen } from "../api";
import { accountMaken, codeSturen, herstelAanvragen, herstelAfronden, mailIngesteld, voorbereiden } from "../lib/aanmelden";
import { MascotteMetTip } from "../mascotte";
import { Onderblad } from "./Onderblad";

const Opmaak = lazy(() => import("./Beveiliging").then((m) => ({ default: m.Opmaak })));
const Teksten = lazy(() => import("../lib/teksten").then((m) => ({
  default: ({ welke }: { welke: "voorwaarden" | "privacy" }) => <Opmaak tekst={welke === "voorwaarden" ? m.VOORWAARDEN : m.PRIVACY} />,
})));

const veld = "h-13 w-full rounded-2xl bg-vlak px-4 text-base outline-none focus:ring-2 focus:ring-accent";
const hoofdknop = "mt-2 h-13 rounded-2xl bg-inkt font-semibold text-white disabled:opacity-40 dark:text-black";
const linkje = "self-center py-2 text-[15px] font-medium text-accent";
const geenVerbinding = "Even geen verbinding. Probeer het zo opnieuw.";
const tekstVan = (e: unknown) => (e instanceof Error && e.message && !/fetch|network|load failed/i.test(e.message) ? e.message : geenVerbinding);

type Stand = "inloggen" | "nieuw" | "vergeten";

export default function Inloggen({ opIngelogd }: { opIngelogd: () => Promise<void> }) {
  const [stand, setStand] = useState<Stand>("inloggen");
  const [mail, setMail] = useState<boolean | null>(null);
  useEffect(() => { mailIngesteld().then(setMail); }, []);
  return (
    <main className="mx-auto flex min-h-full max-w-sm flex-col justify-center gap-8 px-6 py-10">
      <MascotteMetTip />
      {stand === "inloggen" && <Inlog opIngelogd={opIngelogd} naar={setStand} mail={!!mail} />}
      {stand === "nieuw" && <Nieuw opIngelogd={opIngelogd} naar={setStand} mail={!!mail} />}
      {stand === "vergeten" && <Vergeten opIngelogd={opIngelogd} naar={setStand} />}
    </main>
  );
}

type Deel = { opIngelogd: () => Promise<void>; naar: (s: Stand) => void };

function Formulier({ titel, uitleg, fout, onSubmit, children }: { titel: string; uitleg?: string; fout: string;
  onSubmit: (e: FormEvent) => void; children: ReactNode }) {
  return <>
    <div className="flex flex-col gap-1">
      <h1 className="text-[32px] font-bold tracking-tight">{titel}</h1>
      {uitleg && <p className="text-[15px] text-rustig">{uitleg}</p>}
    </div>
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
    <Formulier titel="Welkom" fout={fout} onSubmit={versturen}>
      {!codeNodig ? (
        <>
          <label className="sr-only" htmlFor="naam">Gebruikersnaam of mailadres</label>
          <input id="naam" className={veld} placeholder="Gebruikersnaam of mailadres" autoComplete="username"
            autoCapitalize="none" value={naam} onChange={(e) => setNaam(e.target.value)} />
          <label className="sr-only" htmlFor="wachtwoord">Wachtwoord</label>
          <input id="wachtwoord" className={veld} type="password" placeholder="Wachtwoord"
            autoComplete="current-password" value={wachtwoord} onChange={(e) => setWachtwoord(e.target.value)} />
        </>
      ) : (
        <>
          <label htmlFor="code" className="text-sm text-rustig">Code uit je app</label>
          <input id="code" className={veld} inputMode="numeric" autoComplete="one-time-code" placeholder="6 cijfers"
            autoFocus value={code} onChange={(e) => setCode(e.target.value)} />
        </>
      )}
      <button disabled={bezig || !wachtwoord} className={hoofdknop}>{bezig ? "Even geduld" : "Inloggen"}</button>
    </Formulier>
    <div className="-mt-4 flex flex-col">
      {mail && <button className={linkje} onClick={() => naar("vergeten")}>Wachtwoord vergeten?</button>}
      <button className={linkje} onClick={() => naar("nieuw")}>Nieuw hier? Maak een account</button>
    </div>
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

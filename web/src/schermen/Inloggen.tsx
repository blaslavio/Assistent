import { useState, type FormEvent } from "react";
import { inloggen } from "../api";

const veld = "h-13 w-full rounded-2xl bg-vlak px-4 text-base outline-none focus:ring-2 focus:ring-accent";

export default function Inloggen({ opIngelogd }: { opIngelogd: () => Promise<void> }) {
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
      setFout("Even geen verbinding. Probeer het zo opnieuw.");
    } finally {
      setBezig(false);
    }
  }

  return (
    <main className="mx-auto flex h-full max-w-sm flex-col justify-center gap-8 px-6">
      <h1 className="text-[32px] font-bold tracking-tight">Welkom</h1>
      <form onSubmit={versturen} className="flex flex-col gap-3">
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
        {fout && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{fout}</p>}
        <button disabled={bezig || !wachtwoord}
          className="mt-2 h-13 rounded-2xl bg-inkt font-semibold text-white disabled:opacity-40 dark:text-black">
          {bezig ? "Even geduld" : "Inloggen"}
        </button>
      </form>
    </main>
  );
}

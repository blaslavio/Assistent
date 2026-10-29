// Bestellingen: wat jij kocht en verkocht, waar je geld staat, en de stap die nu aan jou is.
import { useCallback, useEffect, useState } from "react";
import { Terug } from "../iconen";
import { klaar, lijst, stand, stappen, uitvoeren, wachtOpMij, type Bestelling, type Stap } from "../lib/bestellingen";
import { euro } from "../lib/winkelen";

export default function Bestellingen({ terug, melding: begin }: { terug?: () => void; melding?: string }) {
  const [alle, setAlle] = useState<Bestelling[] | null>(null);
  const [fout, setFout] = useState("");
  const [melding, setMelding] = useState(begin ?? "");

  const laden = useCallback(() => {
    lijst().then((l) => { setAlle(l); setFout(""); }).catch(() => setFout("Bestellingen laden lukte niet. Probeer het zo opnieuw."));
  }, []);
  useEffect(laden, [laden]);

  const groepen: [string, Bestelling[]][] = alle ? [
    ["Wacht op jou", alle.filter(wachtOpMij)],
    ["Lopend", alle.filter((b) => !wachtOpMij(b) && !klaar(b))],
    ["Klaar", alle.filter(klaar)],
  ] : [];

  return (
    <div className="opkomen flex flex-col gap-5 px-6 pb-8">
      {terug && <>
        <button onClick={terug} className="-ml-2 flex h-10 w-fit items-center gap-1 pr-3 text-rustig">
          <Terug className="size-5" /> Winkel
        </button>
        <h2 className="-mt-2 text-2xl font-semibold tracking-tight">Bestellingen</h2>
      </>}
      {melding && <p role="status" className="rounded-2xl bg-vlak px-4 py-3 text-[15px]">{melding}</p>}
      {fout && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{fout}</p>}
      {alle === null && !fout && <p className="bezig-tekst py-6 text-[15px]">Laden</p>}
      {alle?.length === 0 && <p className="py-6 text-rustig">Nog geen bestellingen. Zoek iets in de winkel of vraag het de assistent.</p>}
      {groepen.map(([naam, l]) => l.length > 0 && (
        <section key={naam} className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-rustig">{naam}</h3>
          <ul className="flex flex-col divide-y divide-lijn rounded-2xl border border-lijn">
            {l.map((b) => <Regel key={b.id} b={b} klaar={(m) => { setMelding(m); laden(); }} />)}
          </ul>
        </section>
      ))}
      <p className="text-[13px] text-zacht">Bij betalen via de app staat je geld veilig bij Stripe en gaat het pas naar de verkoper als jij bevestigt dat alles goed is.</p>
    </div>
  );
}

function Regel({ b, klaar: gedaan }: { b: Bestelling; klaar: (melding: string) => void }) {
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState("");
  const [probleem, setProbleem] = useState<string | null>(null);
  // Wat de koper betaalt: het bedrag plus eventueel kopersbescherming. De verkoper ziet het bedrag.
  const totaal = b.bedrag + (b.rol === "koper" ? Number(b.kosten ?? 0) : 0);

  async function doe(s: Stap, toelichting = "") {
    if (s.toelichting && probleem === null) return setProbleem("");
    setBezig(true);
    setFout("");
    try {
      const url = await uitvoeren(b, s.actie, toelichting);
      if (url) {
        // De betaalpagina van Stripe opent in het hele venster; daarna kom je hier terug.
        (window.top ?? window).location.href = url;
        return;
      }
      gedaan(s.actie === "probleem" ? "Je melding is verstuurd. Het geld blijft vast tot het is opgelost."
        : s.actie === "ontvangen" ? "Bevestigd. Fijn dat alles goed is." : "Bijgewerkt.");
    } catch (e) {
      setFout(e instanceof Error ? e.message : "Dat lukte niet.");
    } finally {
      setBezig(false);
    }
  }

  const acties = stappen(b);
  return (
    <li className="flex flex-col gap-2.5 px-4 py-3">
      <div className="flex items-start gap-3">
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-medium">{(b.aantal ?? 1) > 1 ? `${b.aantal}× ` : ""}{b.titel}</span>
          <span className="text-[13px] text-rustig">{b.rol === "koper" ? "Van" : "Aan"} {b.ander}</span>
        </span>
        <span className="shrink-0 font-semibold tabular-nums">{euro(totaal)}</span>
      </div>
      <p className="text-[14px] text-rustig">{stand(b)}{b.track_code ? ` · ${b.vervoerder ?? ""} ${b.track_code}` : ""}</p>
      {probleem !== null ? (
        <div className="flex flex-col gap-2">
          <textarea value={probleem} onChange={(e) => setProbleem(e.target.value)} rows={3} autoFocus
            placeholder="Wat is er mis? Bijvoorbeeld: niet ontvangen of kapot."
            className="w-full resize-none rounded-2xl bg-vlak px-4 py-3 outline-none placeholder:text-zacht" />
          <div className="flex gap-2">
            <button disabled={bezig || !probleem.trim()} onClick={() => doe({ actie: "probleem", naam: "" }, probleem.trim())}
              className="h-10 rounded-full bg-accent px-4 text-sm font-medium text-white disabled:opacity-40">Melding versturen</button>
            <button onClick={() => setProbleem(null)} className="h-10 rounded-full px-4 text-sm text-rustig">Annuleer</button>
          </div>
        </div>
      ) : acties.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {acties.map((s) => (
            <button key={s.actie} disabled={bezig} onClick={() => doe(s)}
              className={`h-10 rounded-full px-4 text-sm font-medium disabled:opacity-50 ${s.hoofd ? "bg-accent text-white" : "bg-vlak"}`}>
              {s.actie === "betalen" ? `Betalen · ${euro(totaal)}` : s.naam}
            </button>
          ))}
        </div>
      )}
      {fout && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{fout}</p>}
    </li>
  );
}

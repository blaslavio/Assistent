// Een mail schrijven of beantwoorden. De assistent kan een eerste versie schrijven, maar versturen doe je altijd zelf:
// eerst lees je precies wat er weggaat en naar wie, dan tik je op Versturen.
import { useState } from "react";
import type { Gegevens } from "../api";
import { Kruis, Pijl, Slot, Vinkje, Vonk } from "../iconen";
import { antwoordOnderwerp, concept, versturen, type Mail, type Uitgaand } from "../lib/mail";

const veld = "h-12 min-w-0 rounded-2xl bg-vlak px-4 outline-none placeholder:text-zacht";
const foutVan = (e: unknown) => (e instanceof Error && e.message ? e.message : "Dat lukte niet. Probeer het opnieuw.");

type Props = { data: Gegevens; op?: Mail; begin?: Partial<Uitgaand>; sluit: (verstuurd: boolean) => void };

export function Opstellen({ data, op, begin, sluit }: Props) {
  const [aan, setAan] = useState(begin?.aan?.join(", ") ?? op?.adres ?? "");
  const [onderwerp, setOnderwerp] = useState(begin?.onderwerp ?? (op ? antwoordOnderwerp(op.onderwerp) : ""));
  const [tekst, setTekst] = useState(begin?.tekst ?? "");
  const [wens, setWens] = useState("");
  const [stap, setStap] = useState<"schrijven" | "controleren" | "bezig" | "klaar">("schrijven");
  const [schrijft, setSchrijft] = useState(false);
  const [fout, setFout] = useState("");
  const adressen = aan.split(/[,;\s]+/).map((a) => a.trim()).filter(Boolean);
  const klopt = adressen.length > 0 && adressen.every((a) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a)) && tekst.trim().length > 0;

  async function laatSchrijven() {
    if (!op) return;
    setSchrijft(true);
    setFout("");
    try {
      const t = await concept(op, data, wens.trim());
      if (t === null) setFout("Zet de assistent aan in Instellingen om een antwoord te laten schrijven.");
      else setTekst(t);
    } catch (e) {
      setFout(foutVan(e));
    } finally {
      setSchrijft(false);
    }
  }

  async function verstuur() {
    setStap("bezig");
    setFout("");
    try {
      await versturen({ aan: adressen, onderwerp: onderwerp.trim(), tekst, antwoord_op: begin?.antwoord_op ?? op?.id });
      setStap("klaar");
      setTimeout(() => sluit(true), 1200);
    } catch (e) {
      setFout(foutVan(e));
      setStap("controleren");
    }
  }

  return (
    <div role="dialog" aria-modal aria-label={op ? "Beantwoorden" : "Nieuwe mail"}
      className="fixed inset-0 z-40 overflow-y-auto bg-white dark:bg-[#0b0b0e]">
      <div className="mx-auto flex max-w-xl flex-col gap-4 px-6 pt-12 pb-10">
        <div className="flex items-center justify-between">
          <h1 className="text-[28px] font-bold tracking-tight">{stap === "schrijven" ? (op ? "Beantwoorden" : "Nieuwe mail") : "Klopt dit?"}</h1>
          <button onClick={() => sluit(false)} aria-label="Sluiten" className="flex size-10 items-center justify-center rounded-full bg-vlak">
            <Kruis className="size-5" />
          </button>
        </div>

        {stap === "schrijven" ? <>
          <input value={aan} onChange={(e) => setAan(e.target.value)} placeholder="Aan" aria-label="Aan" inputMode="email"
            autoCapitalize="off" className={veld} />
          <input value={onderwerp} onChange={(e) => setOnderwerp(e.target.value)} placeholder="Onderwerp" aria-label="Onderwerp"
            className={veld} maxLength={300} />
          {op && (
            <details className="rounded-2xl border border-lijn px-4 py-3 text-[14px]">
              <summary className="cursor-pointer text-rustig">{op.van} schreef</summary>
              <p className="mt-2 max-h-48 overflow-y-auto whitespace-pre-line text-rustig">{op.tekst}</p>
            </details>
          )}
          {op && (
            <div className="flex flex-col gap-2 rounded-2xl bg-vlak p-3">
              <input value={wens} onChange={(e) => setWens(e.target.value)} aria-label="Wat wil je antwoorden"
                placeholder="Wat wil je zeggen? Bijvoorbeeld: vrijdag kan ik" className="h-11 rounded-xl bg-white px-3 outline-none dark:bg-black/30" />
              <button onClick={laatSchrijven} disabled={schrijft}
                className="flex h-11 items-center justify-center gap-2 rounded-xl font-medium text-accent disabled:opacity-50">
                <Vonk className="size-[18px]" /> {schrijft ? "Aan het schrijven" : tekst ? "Opnieuw laten schrijven" : "Laat de assistent schrijven"}
              </button>
            </div>
          )}
          <textarea value={tekst} onChange={(e) => setTekst(e.target.value)} rows={10} aria-label="Bericht" placeholder="Bericht"
            className="rounded-2xl bg-vlak p-4 text-base leading-relaxed outline-none placeholder:text-zacht" />
          <button onClick={() => setStap("controleren")} disabled={!klopt}
            className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-accent font-medium text-white disabled:opacity-30">
            Verder
          </button>
        </> : (
          <>
            <div className="flex flex-col gap-1 rounded-2xl border border-lijn p-4">
              <span className="text-sm text-rustig">Naar</span>
              <span className="font-medium break-all">{adressen.join(", ")}</span>
              <span className="mt-2 text-sm text-rustig">Onderwerp</span>
              <span className="font-medium">{onderwerp || "(geen onderwerp)"}</span>
              <p className="mt-3 whitespace-pre-line border-t border-lijn pt-3 leading-relaxed">{tekst}</p>
            </div>
            {/\[invullen\]/i.test(tekst) && stap === "controleren" && (
              <p className="text-sm text-amber-600 dark:text-amber-400">Er staat nog [invullen] in je bericht.</p>
            )}
            {stap === "klaar" ? (
              <p className="flex h-12 items-center justify-center gap-2 font-medium text-emerald-600 dark:text-emerald-400">
                <Vinkje className="size-5" /> Verstuurd
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setStap("schrijven")} disabled={stap === "bezig"} className="h-12 rounded-2xl bg-vlak font-medium">Aanpassen</button>
                <button onClick={verstuur} disabled={stap === "bezig"}
                  className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-accent font-medium text-white disabled:opacity-50">
                  <Pijl className="size-[18px] rotate-90" /> {stap === "bezig" ? "Bezig" : "Versturen"}
                </button>
              </div>
            )}
            <p className="flex items-center gap-1.5 text-[13px] text-zacht"><Slot className="size-3.5" /> Gaat via je eigen mailbox. De app bewaart niets van dit bericht.</p>
          </>
        )}
        {fout && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{fout}</p>}
      </div>
    </div>
  );
}

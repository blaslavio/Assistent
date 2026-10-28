// Je eerdere gesprekken met de assistent: terugzoeken, verder praten of weghalen. Bewaren kun je hier ook uitzetten.
import { useEffect, useState } from "react";
import { gegevensLaden } from "../api";
import { Kruis, Prullenbak, Zoek } from "../iconen";
import { bewarenAan, bewarenZetten, gesprekken, wis, type Opgeslagen } from "../lib/geschiedenis";
import { Schakelaar } from "./instellingen-ui";

function wanneer(iso: string) {
  const d = new Date(iso);
  const dagen = Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(iso).setHours(0, 0, 0, 0)) / 864e5);
  if (dagen <= 0) return "Vandaag";
  if (dagen === 1) return "Gisteren";
  if (dagen < 7) return "Deze week";
  return d.toLocaleDateString("nl-NL", { month: "long", year: "numeric" }).replace(/^./, (c) => c.toUpperCase());
}

export function Gesprekken({ sluit, open, huidig }: { sluit: () => void; open: (g: Opgeslagen) => void; huidig?: string }) {
  const [lijst, setLijst] = useState<Opgeslagen[] | null>(null);
  const [aan, setAan] = useState(true);
  const [zoek, setZoek] = useState("");
  const [fout, setFout] = useState("");

  useEffect(() => {
    gegevensLaden().then(({ data }) => { setLijst(gesprekken(data)); setAan(bewarenAan(data)); })
      .catch(() => { setLijst([]); setFout("Laden lukte niet. Probeer het zo opnieuw."); });
  }, []);

  async function doe(werk: () => Promise<unknown>) {
    setFout("");
    try { await werk(); } catch (e) { setFout(e instanceof Error ? e.message : "Dat lukte niet."); }
  }

  const z = zoek.trim().toLowerCase();
  const zichtbaar = (lijst ?? []).filter((g) => !z || g.titel.toLowerCase().includes(z)
    || g.beurten.some((b) => b.tekst.toLowerCase().includes(z)));
  const groepen: [string, Opgeslagen[]][] = [];
  for (const g of zichtbaar) {
    const naam = wanneer(g.datum);
    const groep = groepen.find(([n]) => n === naam);
    if (groep) groep[1].push(g); else groepen.push([naam, [g]]);
  }

  return (
    <div role="dialog" aria-modal aria-label="Eerdere gesprekken" className="fixed inset-0 z-40 overflow-y-auto bg-white dark:bg-[#0b0b0e]">
      <div className="mx-auto flex max-w-xl flex-col gap-5 px-6 pt-12 pb-10">
        <div className="flex items-center justify-between">
          <h1 className="text-[28px] font-bold tracking-tight">Gesprekken</h1>
          <button onClick={sluit} aria-label="Sluiten" className="flex size-10 items-center justify-center rounded-full bg-vlak">
            <Kruis className="size-5" />
          </button>
        </div>

        {aan && (lijst?.length ?? 0) > 0 && (
          <label className="flex h-12 items-center gap-2 rounded-2xl bg-vlak px-4">
            <Zoek className="size-5 text-rustig" />
            <span className="sr-only">Zoeken in gesprekken</span>
            <input value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder="Zoek op een woord dat je ooit zei"
              className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-zacht" />
          </label>
        )}

        {lijst === null ? <p className="bezig-tekst text-rustig">Laden</p>
          : !aan ? <p className="text-rustig">Bewaren staat uit. Gesprekken verdwijnen zodra je een nieuw gesprek begint.</p>
          : !lijst.length ? <p className="text-rustig">Nog niets bewaard. Na je eerste antwoord staat het gesprek hier, zodat je later verder kunt waar je was.</p>
          : !zichtbaar.length ? <p className="text-rustig">Niets gevonden met “{zoek}”.</p>
          : groepen.map(([naam, items]) => (
            <section key={naam}>
              <h2 className="mb-2 px-1 text-[13px] font-semibold uppercase tracking-[0.06em] text-rustig">{naam}</h2>
              <ul className="overflow-hidden rounded-2xl bg-vlak">
                {items.map((g) => (
                  <li key={g.id} className="flex items-center border-b border-lijn last:border-0">
                    <button onClick={() => open(g)} className="flex min-w-0 flex-1 flex-col items-start gap-0.5 px-4 py-3 text-left">
                      <span className="w-full truncate font-medium">{g.titel}</span>
                      <span className="w-full truncate text-sm text-rustig">
                        {g.id === huidig ? "Nu open · " : ""}{g.beurten.length} berichten · {new Date(g.datum)
                          .toLocaleString("nl-NL", { weekday: "short", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </button>
                    <button aria-label={`${g.titel} weghalen`} onClick={() => doe(async () => {
                      await wis(g.id);
                      setLijst((l) => (l ?? []).filter((x) => x.id !== g.id));
                    })} className="flex size-12 shrink-0 items-center justify-center text-rustig">
                      <Prullenbak className="size-5" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}

        {fout && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{fout}</p>}

        <Schakelaar label="Gesprekken bewaren" aan={aan}
          uitleg="Alleen de tekst, achter je eigen inlog. Uitzetten wist meteen alles wat bewaard is."
          zet={(v) => doe(async () => { await bewarenZetten(v); setAan(v); if (!v) setLijst([]); })} />
      </div>
    </div>
  );
}

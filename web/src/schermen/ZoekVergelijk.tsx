// Eén zoekbalk die ook vergelijkt: wat je typt, zoekt in je eigen lijst (bestellingen) en laat daaronder zien wat
// hetzelfde nu kost in de app (winkels en marktplaats), en als je wilt ook bij de supermarkten.
import { useEffect, useState } from "react";
import { Kruis, Zoek } from "../iconen";
import { euro, zoeken, type Product } from "../lib/winkelen";
import { prijzen, productVergelijken } from "../lib/prijzen";

type Super = ReturnType<typeof productVergelijken>;

export function ZoekBalk({ waarde, zet, plek = "Zoek en vergelijk" }: { waarde: string; zet: (t: string) => void; plek?: string }) {
  return (
    <div className="flex items-center gap-2 rounded-2xl bg-vlak px-4">
      <Zoek className="size-4 shrink-0 text-zacht" />
      <input value={waarde} onChange={(e) => zet(e.target.value)} placeholder={plek} aria-label={plek} enterKeyHint="search"
        className="h-11 min-w-0 flex-1 bg-transparent outline-none placeholder:text-zacht" />
      {waarde && <button onClick={() => zet("")} aria-label="Wissen" className="text-zacht"><Kruis className="size-4" /></button>}
    </div>
  );
}

/** Wat hetzelfde nu kost: in de app, en op verzoek bij de supermarkten. `betaald` is wat jij ervoor gaf. */
export function Vergelijken({ term, betaald }: { term: string; betaald?: number }) {
  const [app, setApp] = useState<Product[] | null>(null);
  const [superm, setSuperm] = useState<Super | null>(null);
  const [bezig, setBezig] = useState(false);
  const t = term.trim();

  useEffect(() => {
    setApp(null); setSuperm(null);
    if (t.length < 2) return;
    const klok = setTimeout(() => {
      // Met de hele naam vind je vaak alleen precies dat; met het langste woord ook vergelijkbare spullen.
      const woord = t.split(/\s+/).sort((a, b) => b.length - a.length)[0];
      Promise.all([zoeken(t), woord !== t && woord.length > 3 ? zoeken(woord) : Promise.resolve([])])
        .then(([a, b]) => setApp([...new Map([...a, ...b].map((p) => [p.sleutel, p])).values()]
          .sort((x, y) => x.prijs - y.prijs).slice(0, 5)))
        .catch(() => setApp([]));
    }, 400);
    return () => clearTimeout(klok);
  }, [t]);

  async function supermarkten() {
    setBezig(true);
    try {
      setSuperm(productVergelijken(await prijzen(), t).slice(0, 5));
    } catch {
      setSuperm([]);
    } finally {
      setBezig(false);
    }
  }

  if (t.length < 2) return null;
  const laagste = app?.[0]?.prijs;
  return (
    <section className="flex flex-col gap-2" aria-label="Vergelijken">
      <h3 className="text-sm font-medium text-rustig">Vergelijk "{t}"</h3>
      {app === null ? <p className="bezig-tekst text-sm text-rustig">Zoeken</p> : app.length === 0 ? (
        <p className="text-sm text-rustig">Niet te koop in de app op dit moment.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-lijn rounded-2xl bg-vlak">
          {app.map((p, i) => (
            <li key={p.sleutel} className="flex items-center gap-3 px-4 py-2.5">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[15px]">{p.titel}</span>
                <span className="truncate text-[13px] text-rustig">{p.winkel ?? p.verkoper}{p.plaats ? ` · ${p.plaats}` : ""}
                  {i === 0 && app.length > 1 ? " · goedkoopst" : ""}</span>
              </span>
              <span className="font-semibold tabular-nums">{euro(p.prijs)}</span>
            </li>
          ))}
        </ul>
      )}
      {betaald != null && laagste != null && (
        <p className="text-sm text-rustig">
          {laagste < betaald ? `Nu te koop vanaf ${euro(laagste)}, ${euro(betaald - laagste)} minder dan jij betaalde.`
            : `Jij betaalde ${euro(betaald)}; goedkoper is het nu niet te koop in de app.`}
        </p>
      )}
      {superm === null ? (
        <button onClick={supermarkten} disabled={bezig} className="w-fit text-sm font-medium text-accent disabled:opacity-50">
          {bezig ? "Prijzen ophalen…" : "Ook bij supermarkten vergelijken"}
        </button>
      ) : superm.length === 0 ? <p className="text-sm text-rustig">Niet gevonden bij de supermarkten.</p> : (
        <ul className="flex flex-col divide-y divide-lijn rounded-2xl bg-vlak">
          {superm.map((r) => (
            <li key={r.code} className="flex items-center gap-3 px-4 py-2.5">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-[13px] font-medium">{r.winkel}</span>
                <span className="truncate text-[13px] text-rustig">{r.naam}</span>
              </span>
              <span className="flex flex-col items-end tabular-nums">
                <span className="font-semibold">{euro(r.prijs)}</span>
                {r.per && <span className="text-[12px] text-rustig">{euro(r.per.prijs)} per {r.per.eenheid}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

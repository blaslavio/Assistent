// Prijzen vergelijken bij de boodschappen: je hele lijst per supermarkt, of één product overal naast elkaar.
// De prijzen komen uit open gegevens en worden pas opgehaald als je erom vraagt.
import { useState, type FormEvent } from "react";
import { euro, prijzen, productVergelijken, vergelijken, type Vergelijking } from "../lib/prijzen";
import { Zoek } from "../iconen";

const foutVan = (e: unknown) => (e instanceof Error && e.message ? e.message : "De prijzen zijn nu niet op te halen.");
const BRON = "Prijzen van Checkjebon, dagelijks bijgewerkt, zonder aanbiedingen.";

/** Je hele lijst: waar ben je in totaal het goedkoopst uit? */
export function LijstVergelijken({ lijst }: { lijst: string[] }) {
  const [uitkomst, setUitkomst] = useState<Vergelijking[] | null>(null);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [alles, setAlles] = useState(false);

  async function vergelijk() {
    setBezig(true); setFout("");
    try {
      setUitkomst(vergelijken(await prijzen(), lijst));
    } catch (e) {
      setFout(foutVan(e));
    } finally {
      setBezig(false);
    }
  }

  if (!uitkomst) return (
    <div className="flex flex-col gap-1">
      <button onClick={vergelijk} disabled={bezig || !lijst.length}
        className="h-11 rounded-2xl bg-vlak font-medium text-accent disabled:opacity-50">
        {bezig ? "Prijzen ophalen…" : "Vergelijk prijzen bij supermarkten"}
      </button>
      {fout && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{fout}</p>}
    </div>
  );

  const goedkoopst = uitkomst[0]?.totaal ?? 0;
  const getoond = alles ? uitkomst : uitkomst.slice(0, 3);
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className={kop}>Waar het goedkoopst</h2>
        <button onClick={() => setUitkomst(null)} className="text-sm text-rustig">Sluiten</button>
      </div>
      <ul className="flex flex-col divide-y divide-lijn rounded-2xl bg-vlak">
        {getoond.map((w, i) => (
          <li key={w.code}>
            <button onClick={() => setOpen(open === w.code ? null : w.code)} aria-expanded={open === w.code}
              className="flex w-full items-center gap-3 px-4 py-3 text-left">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-medium">{w.naam}{i === 0 && <span className="ml-2 rounded-full bg-accent px-2 py-0.5 text-[11px] text-white">Goedkoopst</span>}</span>
                <span className="text-[13px] text-rustig">
                  {w.gevonden === lijst.length ? "Alles gevonden" : `${w.gevonden} van ${lijst.length} gevonden, rest geschat`}
                </span>
              </span>
              <span className="flex flex-col items-end">
                <span className="font-semibold tabular-nums">{euro(w.totaal)}</span>
                {i > 0 && <span className="text-[12px] text-rustig tabular-nums">+{euro(w.totaal - goedkoopst)}</span>}
              </span>
            </button>
            {open === w.code && (
              <ul className="opkomen flex flex-col gap-1 px-4 pb-3 text-[13px]">
                {w.regels.map((r) => (
                  <li key={r.zoekterm} className="flex gap-2">
                    <span className="min-w-0 flex-1 truncate text-rustig">
                      {r.product ? (r.product.link
                        ? <a href={r.product.link} target="_blank" rel="noreferrer" className="underline decoration-lijn">{r.product.naam}</a>
                        : r.product.naam) : <>{r.zoekterm}: niet gevonden</>}
                    </span>
                    <span className="tabular-nums">{r.product ? euro(r.product.prijs) : `± ${euro(r.schatting ?? 0)}`}</span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
      {uitkomst.length > 3 && !alles && (
        <button onClick={() => setAlles(true)} className="text-sm text-rustig">Toon alle {uitkomst.length} winkels</button>
      )}
      <p className="text-[12px] text-zacht">{BRON} Verkeerd product? Typ het preciezer, zoals "halfvolle melk".</p>
    </section>
  );
}

/** Eén product zoeken en overal naast elkaar zien, met de prijs per kilo of liter. */
export function ProductZoeken({ toevoegen }: { toevoegen?: (t: string) => void }) {
  const [term, setTerm] = useState("");
  const [gezocht, setGezocht] = useState("");
  const [uit, setUit] = useState<ReturnType<typeof productVergelijken> | null>(null);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState("");

  async function zoek(e: FormEvent) {
    e.preventDefault();
    const t = term.trim();
    if (!t) return;
    setBezig(true); setFout("");
    try {
      setUit(productVergelijken(await prijzen(), t));
      setGezocht(t);
    } catch (er) {
      setFout(foutVan(er));
    } finally {
      setBezig(false);
    }
  }

  return (
    <section className="flex flex-col gap-2">
      <form onSubmit={zoek} className="flex items-center gap-2 rounded-2xl bg-vlak px-4">
        <Zoek className="size-4 shrink-0 text-zacht" />
        <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Zoek een product en vergelijk"
          aria-label="Product zoeken en vergelijken" enterKeyHint="search" className="h-11 min-w-0 flex-1 bg-transparent outline-none placeholder:text-zacht" />
        {bezig && <span className="text-sm text-rustig">Zoeken…</span>}
      </form>
      {fout && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{fout}</p>}
      {uit && (
        <div className="opkomen flex flex-col gap-1">
          {uit.length === 0 ? <p className="text-sm text-rustig">Niets gevonden voor "{gezocht}".</p> : (
            <ul className="flex flex-col divide-y divide-lijn rounded-2xl bg-vlak">
              {uit.slice(0, 6).map((r, i) => (
                <li key={r.code} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-[13px] font-medium">{r.winkel}{i === 0 && <span className="ml-2 text-accent">goedkoopst</span>}</span>
                    {r.link ? <a href={r.link} target="_blank" rel="noreferrer" className="truncate text-[13px] text-rustig underline decoration-lijn">{r.naam}</a>
                      : <span className="truncate text-[13px] text-rustig">{r.naam}</span>}
                  </span>
                  <span className="flex flex-col items-end tabular-nums">
                    <span className="font-semibold">{euro(r.prijs)}</span>
                    {r.per && <span className="text-[12px] text-rustig">{euro(r.per.prijs)} per {r.per.eenheid}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-3 text-sm">
            {toevoegen && uit.length > 0 && <button onClick={() => { toevoegen(gezocht); setUit(null); setTerm(""); }}
              className="font-medium text-accent">Op mijn lijst</button>}
            <button onClick={() => { setUit(null); setTerm(""); }} className="text-rustig">Sluiten</button>
          </div>
        </div>
      )}
    </section>
  );
}

const kop = "text-[13px] font-semibold uppercase tracking-[0.06em] text-rustig";

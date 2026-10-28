// Delen met een link die vanzelf verloopt: de pagina die de ontvanger ziet, en de lijst van je eigen aanbod om te delen.
import { useCallback, useEffect, useState } from "react";
import { Kruis, Vinkje } from "../iconen";
import { DUUR, bekijken, deelAdres, intrekken, linkMaken, mijnAanbod, mijnLinks, naarApp, totDatum, type Deellink,
  type Gedeeld, type MijnAanbod } from "../lib/delen";
import { euro, productFoto } from "../lib/winkelen";

const prijsTekst = (prijs: number | null, per: string) => (prijs === null ? "Prijs in overleg" : euro(Number(prijs)) + (per ? ` ${per}` : ""));

/** Wat iemand ziet die jouw link opent. Zonder inloggen, en zonder contactgegevens. */
export function GedeeldScherm({ code }: { code: string }) {
  const [a, setA] = useState<Gedeeld | null | undefined>(undefined);
  const [foto, setFoto] = useState<string | null>(null);
  useEffect(() => {
    bekijken(code).then((x) => {
      setA(x);
      if (x?.heeft_foto) productFoto(x.id).then(setFoto);
    }).catch(() => setA(null));
  }, [code]);

  return (
    <main className="mx-auto flex min-h-full max-w-xl flex-col gap-5 px-6 pt-14 pb-10">
      {a === undefined ? <p className="bezig-tekst text-[15px]">Laden</p> : a === null ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Deze link is verlopen</h1>
          <p className="text-rustig">Vraag de afzender om een nieuwe link.</p>
        </div>
      ) : (
        <>
          {foto && <img src={foto} alt="" className="aspect-square w-full rounded-3xl bg-vlak object-cover" />}
          <div className="flex flex-col gap-1">
            <p className="text-sm text-rustig">{a.soort === "product" ? "Product" : "Dienst"} van {a.aanbieder}</p>
            <h1 className="text-[28px] font-bold leading-tight tracking-tight">{a.titel}</h1>
            <p className="text-xl font-semibold">{prijsTekst(a.prijs, a.prijs_per)}</p>
            {a.plaats && <p className="text-rustig">{a.plaats}</p>}
          </div>
          {a.omschrijving && <p className="whitespace-pre-wrap leading-relaxed">{a.omschrijving}</p>}
          <p className="text-[13px] text-zacht">Deze link werkt tot {totDatum(a.verloopt)}.</p>
        </>
      )}
      <button onClick={naarApp} className="mt-auto h-12 rounded-full bg-accent font-medium text-white">Open de app</button>
    </main>
  );
}

/** Je eigen aanbod, met per product of dienst een deellink. Alleen zichtbaar als je iets aanbiedt. */
export function JouwAanbod() {
  const [aanbod, setAanbod] = useState<MijnAanbod[]>([]);
  const [links, setLinks] = useState<Deellink[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState<{ id: number; tekst: string; fout?: boolean; url?: string } | null>(null);

  const laden = useCallback(() => {
    mijnAanbod().then(setAanbod).catch(() => {});
    mijnLinks().then(setLinks).catch(() => {});
  }, []);
  useEffect(laden, [laden]);
  if (!aanbod.length) return null;

  async function deel(a: MijnAanbod, dagen: number) {
    setBezig(true);
    setMelding(null);
    try {
      const { code, verloopt } = await linkMaken(a.id, dagen);
      setMelding({ id: a.id, tekst: `Link klaar tot ${totDatum(verloopt)}.`, url: deelAdres(code) });
      setOpen(null);
      laden();
    } catch (e) {
      setMelding({ id: a.id, tekst: e instanceof Error ? e.message : "Delen lukte niet.", fout: true });
    } finally {
      setBezig(false);
    }
  }

  /** Pas na een eigen tik: Safari deelt en kopieert alleen direct na een tik. */
  async function verstuur(a: MijnAanbod, url: string) {
    if (navigator.share) {
      try {
        await navigator.share({ title: a.titel, url });
        setMelding({ id: a.id, tekst: "Gedeeld." });
        return;
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setMelding({ id: a.id, tekst: "Link gekopieerd." });
    } catch {
      setMelding({ id: a.id, tekst: url });
    }
  }

  async function trekIn(code: string) {
    setLinks((l) => l.filter((x) => x.code !== code));
    await intrekken(code).catch(laden);
  }

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-medium text-rustig">Jouw aanbod</h2>
      <ul className="flex flex-col divide-y divide-lijn rounded-2xl border border-lijn">
        {aanbod.map((a) => {
          const actief = links.filter((l) => l.aanbod === a.id);
          return (
            <li key={a.id} className="flex flex-col gap-2 px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium">{a.titel}</span>
                  <span className="text-[13px] text-rustig">{prijsTekst(a.prijs, a.prijs_per)}</span>
                </span>
                <button onClick={() => { setOpen(open === a.id ? null : a.id); setMelding(null); }}
                  className="h-9 shrink-0 rounded-full bg-vlak px-4 text-sm font-medium">{open === a.id ? "Annuleer" : "Delen"}</button>
              </div>
              {open === a.id && (
                <div className="opkomen flex flex-wrap items-center gap-2">
                  <span className="text-[13px] text-rustig">Link geldig voor</span>
                  {DUUR.map((d) => (
                    <button key={d.dagen} disabled={bezig} onClick={() => deel(a, d.dagen)}
                      className="h-9 rounded-full border border-lijn px-3.5 text-sm disabled:opacity-50">{d.naam}</button>
                  ))}
                </div>
              )}
              {melding?.id === a.id && (
                <p role={melding.fout ? "alert" : "status"} className={`flex items-center gap-1.5 text-[13px] ${melding.fout ? "text-red-600 dark:text-red-400" : "text-rustig"}`}>
                  {!melding.fout && <Vinkje className="size-4 shrink-0 text-accent" />}
                  <span className={`min-w-0 flex-1 ${melding.tekst.startsWith("http") ? "break-all" : ""}`}>{melding.tekst}</span>
                  {melding.url && (
                    <button onClick={() => verstuur(a, melding.url!)}
                      className="h-9 shrink-0 rounded-full bg-accent px-4 text-sm font-medium text-white">Versturen</button>
                  )}
                </p>
              )}
              {actief.map((l) => (
                <p key={l.code} className="flex items-center gap-2 text-[13px] text-rustig">
                  <span className="flex-1">Link tot {totDatum(l.verloopt)} · {l.bekeken}× bekeken</span>
                  <button onClick={() => trekIn(l.code)} aria-label="Link intrekken"
                    className="flex h-8 items-center gap-1 rounded-full px-2.5 hover:bg-vlak">
                    <Kruis className="size-3.5" /> Intrekken
                  </button>
                </p>
              ))}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

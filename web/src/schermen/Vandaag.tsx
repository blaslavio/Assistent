import { useEffect, useMemo, useState, type FormEvent } from "react";
import { bijwerken, type Afspraak } from "../api";
import type { Staat } from "../App";
import { Plus } from "../iconen";
import { dagTitel, datumTekst, groet, heleDag, hoeLang, moment, nuTekst, uur } from "../lib/tijd";
import { weerNu, type Weer } from "../lib/weer";

const kop = "mb-2 text-[13px] font-semibold uppercase tracking-[0.06em] text-rustig";

type Props = { staat: Staat; setStaat: (s: Staat) => void; naarInstellingen: () => void };

export default function Vandaag({ staat, setStaat, naarInstellingen }: Props) {
  const [nu, setNu] = useState(() => new Date());
  const [weer, setWeer] = useState<Weer | null>(null);
  const [invoer, setInvoer] = useState("");
  const { data, gebruiker } = staat;

  useEffect(() => {
    const t = setInterval(() => setNu(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    weerNu(data.instellingen?.thuisadres ?? "").then(setWeer);
  }, [data.instellingen?.thuisadres]);

  const vandaag = datumTekst(nu);
  const afspraken = useMemo(
    () => data.afspraken.filter((a) => a.start.slice(0, 10) === vandaag).sort((a, b) => a.start.localeCompare(b.start)),
    [data.afspraken, vandaag],
  );
  const eind = (a: Afspraak) => (a.einde ? moment(a.einde) : null);
  const straks = afspraken.find((a) => !heleDag(a.start) && (eind(a) ?? moment(a.start)) > nu);
  const rest = afspraken.filter((a) => a !== straks && !(eind(a) && eind(a)! < nu));
  const taken = data.taken
    .filter((t) => !t.klaar)
    .sort((a, b) => (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999"))
    .slice(0, 5);

  async function afvinken(id: number) {
    setStaat({ ...staat, data: { ...data, taken: data.taken.map((t) => (t.id === id ? { ...t, klaar: true } : t)) } });
    const nieuw = await bijwerken((g) => {
      const taak = g.taken.find((t) => t.id === id);
      if (taak) taak.klaar = true;
      // Ingeplande focusblokken voor deze taak die nog moeten komen, zijn niet meer nodig.
      const nu = nuTekst();
      g.afspraken = g.afspraken.filter((a) => (a as { taak_id?: number }).taak_id !== id || a.start < nu);
    });
    setStaat({ ...staat, data: nieuw });
  }

  async function toevoegen(e: FormEvent) {
    e.preventDefault();
    const titel = invoer.trim();
    if (!titel) return;
    setInvoer("");
    const nieuw = await bijwerken((g) => {
      g.taken.push({ id: g.volgend_id, titel, deadline: null, klaar: false });
      g.volgend_id += 1;
    });
    setStaat({ ...staat, data: nieuw });
  }

  const naam = gebruiker.weergavenaam || gebruiker.naam || "";
  return (
    <div className="flex min-h-full flex-col">
      <header className="flex items-start justify-between px-6 pt-14 pb-2">
        <div className="flex flex-col gap-1">
          <p className="text-sm text-rustig">
            {dagTitel(nu)}{weer ? ` · ${weer.graden}° ${weer.tekst.toLowerCase()}` : ""}
          </p>
          <h1 className="text-[32px] font-bold tracking-tight">{groet(nu)}</h1>
        </div>
        <button onClick={naarInstellingen} aria-label="Instellingen"
          className="flex size-10 items-center justify-center overflow-hidden rounded-full bg-vlak font-semibold">
          {gebruiker.foto ? <img src={gebruiker.foto} alt="" className="size-full object-cover" /> : (naam[0] ?? "?").toUpperCase()}
        </button>
      </header>

      <main className="flex flex-1 flex-col gap-7 px-6 py-4">
        {straks && (
          <section>
            <h2 className={kop}>Straks</h2>
            <div className="flex flex-col gap-1.5 rounded-[20px] bg-accent p-5 text-white">
              <p className="text-[13px] opacity-85">{hoeLang(moment(straks.start), eind(straks), nu) || uur(straks.start)}</p>
              <p className="text-xl font-semibold">{straks.titel}</p>
              <p className="text-sm opacity-85">
                {uur(straks.start)}{straks.einde ? ` – ${uur(straks.einde)}` : ""}{straks.locatie ? ` · ${straks.locatie}` : ""}
              </p>
            </div>
          </section>
        )}

        {rest.length > 0 && (
          <section>
            <h2 className={kop}>Vandaag</h2>
            <ul>
              {rest.map((a) => (
                <li key={a.id} className="flex items-baseline gap-4 py-2.5">
                  <span className="w-12 shrink-0 text-sm text-rustig">{heleDag(a.start) ? "Hele dag" : uur(a.start)}</span>
                  <span>{a.titel}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {!straks && rest.length === 0 && <p className="text-rustig">Niets meer in je agenda vandaag.</p>}

        <section>
          <h2 className={kop}>Taken</h2>
          {taken.length === 0 ? (
            <p className="text-rustig">Geen open taken.</p>
          ) : (
            <ul>
              {taken.map((t) => (
                <li key={t.id}>
                  <label className="flex items-center gap-3.5 py-2.5">
                    <input type="checkbox" className="size-[22px] accent-accent" onChange={() => afvinken(t.id)} />
                    <span>{t.titel}</span>
                    {t.deadline && t.deadline.slice(0, 10) < vandaag && <span className="text-sm text-red-600 dark:text-red-400">te laat</span>}
                  </label>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      <form onSubmit={toevoegen} className="sticky bottom-0 bg-white px-4 pb-3 pt-2 dark:bg-[#0b0b0e]">
        <label className="flex h-13 items-center gap-2.5 rounded-full bg-vlak pr-2 pl-5">
          <span className="sr-only">Nieuwe taak</span>
          <input value={invoer} onChange={(e) => setInvoer(e.target.value)} placeholder="Nieuwe taak"
            className="flex-1 bg-transparent outline-none placeholder:text-zacht" />
          <button aria-label="Toevoegen" disabled={!invoer.trim()}
            className="flex size-10 items-center justify-center rounded-full bg-inkt text-white disabled:opacity-30 dark:text-black">
            <Plus className="size-5" />
          </button>
        </label>
      </form>
    </div>
  );
}

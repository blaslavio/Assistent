import { useMemo, useState } from "react";
import type { Staat } from "../App";
import { Terug } from "../iconen";
import { DAGEN_KORT, MAANDEN, dagTitel, datumTekst, heleDag, plusDagen, uur, weekBegin } from "../lib/tijd";

// Dezelfde kleuren per soort als in de oude app.
const KLEUREN: Record<string, string> = {
  afspraak: "#2563eb", sport: "#16a34a", uitgaan: "#9333ea", etentje: "#ea580c", werk: "#475569",
  "familie en vrienden": "#db2777", gezondheid: "#0891b2", reizen: "#ca8a04", verjaardag: "#f59e0b",
  herinnering: "#dc2626", focus: "#0d9488", vrij: "#059669", bezorging: "#7c3aed", overig: "#64748b",
};

export default function Agenda({ staat }: { staat: Staat }) {
  const vandaag = new Date();
  const [gekozen, setGekozen] = useState(() => datumTekst(vandaag));
  const [week, setWeek] = useState(() => weekBegin(vandaag));
  const dagen = Array.from({ length: 7 }, (_, i) => plusDagen(week, i));

  const perDag = useMemo(() => {
    const m = new Map<string, typeof staat.data.afspraken>();
    for (const a of staat.data.afspraken) {
      const d = a.start.slice(0, 10);
      m.set(d, [...(m.get(d) ?? []), a]);
    }
    for (const lijst of m.values()) lijst.sort((a, b) => a.start.localeCompare(b.start));
    return m;
  }, [staat.data.afspraken]);

  const items = perDag.get(gekozen) ?? [];
  const maand = MAANDEN[plusDagen(week, 3).getMonth()];

  function verschuif(n: number) {
    const nieuw = plusDagen(week, 7 * n);
    setWeek(nieuw);
    setGekozen(datumTekst(n === 0 ? vandaag : nieuw));
  }

  return (
    <div className="flex min-h-full flex-col">
      <header className="flex items-center justify-between px-6 pt-14 pb-3">
        <h1 className="text-[32px] font-bold tracking-tight">{maand[0].toUpperCase() + maand.slice(1)}</h1>
        <div className="flex gap-1">
          <button onClick={() => verschuif(-1)} aria-label="Vorige week"
            className="flex size-10 items-center justify-center rounded-full text-rustig hover:bg-vlak"><Terug /></button>
          <button onClick={() => verschuif(0)} className="h-10 rounded-full px-3 text-sm font-medium hover:bg-vlak">Vandaag</button>
          <button onClick={() => verschuif(1)} aria-label="Volgende week"
            className="flex size-10 rotate-180 items-center justify-center rounded-full text-rustig hover:bg-vlak"><Terug /></button>
        </div>
      </header>

      <div className="grid grid-cols-7 gap-1 px-4 pb-4">
        {dagen.map((d) => {
          const t = datumTekst(d);
          const actief = t === gekozen;
          const druk = perDag.has(t);
          return (
            <button key={t} onClick={() => setGekozen(t)} aria-pressed={actief} aria-label={dagTitel(d)}
              className={`flex h-16 flex-col items-center justify-center gap-0.5 rounded-2xl ${actief ? "bg-accent text-white" : ""}`}>
              <span className="text-[11px] opacity-70">{DAGEN_KORT[d.getDay()]}</span>
              <span className={`text-[17px] font-semibold ${t === datumTekst(vandaag) && !actief ? "text-accent" : ""}`}>{d.getDate()}</span>
              <span className={`size-1 rounded-full ${druk ? (actief ? "bg-white" : "bg-accent") : ""}`} />
            </button>
          );
        })}
      </div>

      <main className="flex flex-col gap-2.5 px-6 pb-6">
        <h2 className="mb-1 text-[13px] font-semibold uppercase tracking-[0.06em] text-rustig">{dagTitel(new Date(`${gekozen}T12:00`))}</h2>
        {items.length === 0 && <p className="text-rustig">Niets gepland.</p>}
        {items.map((a) => (
          <div key={a.id} className="flex gap-3.5 rounded-2xl bg-vlak px-4 py-3.5">
            <span className="w-1 shrink-0 rounded-full" style={{ background: KLEUREN[a.soort ?? ""] ?? KLEUREN.afspraak }} />
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="font-medium">{a.titel}</span>
              <span className="text-[13px] text-rustig">
                {heleDag(a.start) ? "Hele dag" : `${uur(a.start)}${a.einde ? ` – ${uur(a.einde)}` : ""}`}
                {a.locatie ? ` · ${a.locatie}` : ""}
              </span>
            </div>
          </div>
        ))}
      </main>
    </div>
  );
}

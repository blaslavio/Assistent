// Een eigen, rustige grafiek voor in het gesprek: staven of lijnen, hooguit drie reeksen, één as.
// Tik of beweeg over de grafiek voor de precieze waarde; "Tabel" toont dezelfde cijfers als tabel.
import { useLayoutEffect, useRef, useState } from "react";

export type Grafiek = {
  titel: string; soort: "staaf" | "lijn"; labels: string[]; eenheid?: "euro" | "aantal" | "procent";
  reeksen: { naam: string; waarden: number[] }[];
};

const HOOGTE = 190;
const LINKS = 44;
const ONDER = 24;
const BOVEN = 8;

export function waarde(n: number, eenheid: Grafiek["eenheid"], kort = false) {
  if (eenheid === "procent") return `${n.toLocaleString("nl-NL", { maximumFractionDigits: 1 })}%`;
  if (eenheid === "euro") {
    if (kort && Math.abs(n) >= 1000)
      return `€${(n / 1000).toLocaleString("nl-NL", { maximumFractionDigits: 1 })}k`;
    return n.toLocaleString("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: kort ? 0 : 2 });
  }
  return n.toLocaleString("nl-NL", { maximumFractionDigits: kort ? 0 : 2 });
}

/** Ronde streepjes voor de as: 0, en 3 tot 5 mooie stappen tot net boven het hoogste getal. */
export function stappen(laag: number, hoog: number) {
  if (hoog <= laag) hoog = laag + 1;
  const bereik = hoog - laag;
  const ruw = bereik / 4;
  const macht = 10 ** Math.floor(Math.log10(ruw));
  const stap = [1, 2, 2.5, 5, 10].map((f) => f * macht).find((s) => s >= ruw) ?? 10 * macht;
  const van = Math.floor(laag / stap) * stap;
  const tot = Math.ceil(hoog / stap) * stap;
  const uit: number[] = [];
  for (let s = van; s <= tot + stap / 2; s += stap) uit.push(Math.round(s * 1e6) / 1e6);
  return uit;
}

export function GrafiekKaart({ g }: { g: Grafiek }) {
  const vak = useRef<HTMLDivElement>(null);
  const [breedte, setBreedte] = useState(320);
  const [actief, setActief] = useState<number | null>(null);
  const [tabel, setTabel] = useState(false);

  useLayoutEffect(() => {
    const el = vak.current;
    if (!el) return;
    const meet = () => setBreedte(Math.max(200, el.clientWidth));
    meet();
    const r = new ResizeObserver(meet);
    r.observe(el);
    return () => r.disconnect();
  }, [tabel]);

  const alle = g.reeksen.flatMap((r) => r.waarden);
  const as = stappen(Math.min(0, ...alle), Math.max(0, ...alle));
  const laag = as[0];
  const hoog = as[as.length - 1];
  const plot = { x: LINKS, b: breedte - LINKS - 4, h: HOOGTE - BOVEN - ONDER };
  const y = (v: number) => BOVEN + plot.h - ((v - laag) / (hoog - laag || 1)) * plot.h;
  const n = g.labels.length;
  const kolom = plot.b / n;
  const midden = (i: number) => plot.x + kolom * i + kolom / 2;
  const elkeZoveel = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(plot.b / 46))));
  const kleur = (i: number) => (g.reeksen.length === 1 ? "var(--color-accent)" : `var(--reeks-${i + 1})`);

  function kies(clientX: number) {
    const el = vak.current;
    if (!el) return;
    const x = clientX - el.getBoundingClientRect().left - plot.x;
    setActief(Math.min(n - 1, Math.max(0, Math.floor(x / kolom))));
  }

  return (
    <figure className="flex flex-col gap-3 rounded-3xl border border-lijn p-4">
      <figcaption className="flex items-start justify-between gap-3">
        <span className="font-medium">{g.titel}</span>
        <button onClick={() => setTabel((t) => !t)} className="shrink-0 rounded-full bg-vlak px-3 py-1 text-[13px] text-rustig">
          {tabel ? "Grafiek" : "Tabel"}
        </button>
      </figcaption>
      {/* Legenda, en na een tik de waarden op die plek. Hier en niet over de grafiek heen, zodat niets verspringt. */}
      {!tabel && (
        <ul className="flex min-h-5 flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-rustig" aria-live="polite">
          {actief !== null && <li className="font-medium text-inkt">{g.labels[actief]}</li>}
          {(g.reeksen.length > 1 || actief !== null) && g.reeksen.map((r, i) => (
            <li key={r.naam} className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full" style={{ background: kleur(i) }} />
              {g.reeksen.length > 1 && r.naam}
              {actief !== null && <span className="tabular-nums text-inkt">{waarde(r.waarden[actief], g.eenheid)}</span>}
            </li>
          ))}
        </ul>
      )}
      {tabel ? (
        <div className="max-h-72 overflow-auto">
          <table className="w-full text-[14px]">
            <thead className="text-left text-[13px] text-rustig">
              <tr><th className="py-1 font-medium" />{g.reeksen.map((r) => <th key={r.naam} className="py-1 text-right font-medium">{r.naam}</th>)}</tr>
            </thead>
            <tbody>
              {g.labels.map((l, i) => (
                <tr key={i} className="border-t border-lijn">
                  <td className="py-1.5">{l}</td>
                  {g.reeksen.map((r) => <td key={r.naam} className="py-1.5 text-right tabular-nums">{waarde(r.waarden[i], g.eenheid)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={vak} className="relative touch-pan-y select-none"
          onPointerMove={(e) => kies(e.clientX)} onPointerDown={(e) => kies(e.clientX)}
          onPointerLeave={(e) => e.pointerType === "mouse" && setActief(null)}>
          <svg width={breedte} height={HOOGTE} role="img" aria-label={g.titel} className="block overflow-visible">
            {as.map((s) => (
              <g key={s}>
                <line x1={plot.x} x2={plot.x + plot.b} y1={y(s)} y2={y(s)}
                  className={s === 0 ? "stroke-zacht" : "stroke-lijn"} strokeWidth={1} />
                <text x={plot.x - 8} y={y(s)} dy="0.32em" textAnchor="end" className="fill-zacht text-[11px] tabular-nums">
                  {waarde(s, g.eenheid, true)}
                </text>
              </g>
            ))}
            {g.labels.map((l, i) => i % elkeZoveel === 0 && (
              <text key={i} x={midden(i)} y={HOOGTE - 6} textAnchor="middle" className="fill-zacht text-[11px]">
                {l.length > 8 ? `${l.slice(0, 7)}…` : l}
              </text>
            ))}
            {g.soort === "staaf" ? g.reeksen.map((r, j) => {
              const ruimte = Math.min(kolom * 0.7, 28 * g.reeksen.length);
              const dik = ruimte / g.reeksen.length;
              return r.waarden.map((v, i) => {
                const x = midden(i) - ruimte / 2 + dik * j + 1;
                const top = y(Math.max(v, 0));
                if (v === 0) return null;
                const h = Math.max(1, Math.abs(y(v) - y(0)));
                const w = Math.max(2, dik - 2);
                const rnd = Math.min(4, w / 2, h);
                // Afgerond aan de kant van de waarde, recht op de nullijn.
                const d = v >= 0
                  ? `M${x},${top + h}V${top + rnd}Q${x},${top} ${x + rnd},${top}H${x + w - rnd}Q${x + w},${top} ${x + w},${top + rnd}V${top + h}Z`
                  : `M${x},${top}H${x + w}V${top + h - rnd}Q${x + w},${top + h} ${x + w - rnd},${top + h}H${x + rnd}Q${x},${top + h} ${x},${top + h - rnd}Z`;
                return <path key={`${j}-${i}`} d={d} fill={kleur(j)} opacity={actief === null || actief === i ? 1 : 0.45} />;
              });
            }) : (
              <>
                {actief !== null && <line x1={midden(actief)} x2={midden(actief)} y1={BOVEN} y2={BOVEN + plot.h}
                  className="stroke-zacht" strokeWidth={1} />}
                {g.reeksen.map((r, j) => (
                  <g key={j}>
                    <polyline fill="none" stroke={kleur(j)} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round"
                      points={r.waarden.map((v, i) => `${midden(i)},${y(v)}`).join(" ")} />
                    {r.waarden.map((v, i) => (n <= 12 || i === actief) && (
                      <circle key={i} cx={midden(i)} cy={y(v)} r={i === actief ? 5 : 4} fill={kleur(j)}
                        className="stroke-white dark:stroke-[#0b0b0e]" strokeWidth={2} />
                    ))}
                  </g>
                ))}
              </>
            )}
          </svg>
        </div>
      )}
    </figure>
  );
}

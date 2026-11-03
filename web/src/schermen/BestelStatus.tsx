// Status en regels voor bestellingen (eten, producten, marktplaats).
// Zelfde taal als BetaalBevestiging: alleen echte data, jij geeft akkoord.
import type { ReactNode } from "react";
import type { Bestelling } from "../lib/bestellingen";
import { bedragTekst } from "./BetaalBevestiging";

/** Visuele status voor de koper/verkoper — aansluitend op bestellingen.stand. */
export function statusToon(b: Bestelling): { label: string; toon: "wacht" | "actie" | "ok" | "fout" | "klaar" } {
  const koper = b.rol === "koper";
  switch (b.status) {
    case "aangevraagd":
      return { label: koper ? "Wachten op bevestiging" : "Nieuwe aanvraag", toon: koper ? "wacht" : "actie" };
    case "geaccepteerd":
      return {
        label: koper ? (b.betaalwijze === "app" ? "Klaar om te betalen" : "Geaccepteerd") : "Wachten op betaling",
        toon: koper && b.betaalwijze === "app" ? "actie" : "wacht",
      };
    case "betaald":
      return { label: koper ? "Betaald — onderweg of klaar voor afhaal" : "Betaald — leveren", toon: "ok" };
    case "geleverd":
      return { label: koper ? "Geleverd — bevestig ontvangst" : "Geleverd — wacht op bevestiging", toon: koper ? "actie" : "wacht" };
    case "afgerond":
      return { label: "Afgerond", toon: "klaar" };
    case "geschil":
      return { label: "Probleem gemeld", toon: "fout" };
    case "terugbetaald":
      return { label: "Terugbetaald", toon: "klaar" };
    case "geannuleerd":
      return { label: "Geannuleerd", toon: "klaar" };
    default:
      return { label: b.status, toon: "wacht" };
  }
}

const STIJL: Record<string, string> = {
  wacht: "bg-amber-500/10 text-amber-800 dark:text-amber-200",
  actie: "bg-accent/10 text-accent",
  ok: "bg-sky-500/10 text-sky-800 dark:text-sky-200",
  fout: "bg-red-500/10 text-red-700 dark:text-red-300",
  klaar: "bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
};

/** Statusbalk zoals bij afhaal/eten: één duidelijke zin, geen jargon. */
export function StatusBanner({ b }: { b: Bestelling }) {
  const s = statusToon(b);
  return (
    <div className={`flex items-center gap-2 rounded-2xl px-3 py-2.5 text-sm font-medium ${STIJL[s.toon]}`}>
      <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-full bg-white/50 dark:bg-black/20">
        {s.toon === "wacht" ? "…" : s.toon === "actie" ? "!" : s.toon === "fout" ? "!" : "\u2713"}
      </span>
      <span>{s.label}</span>
    </div>
  );
}

/** Één productregel met aantal-badge (winkelwagen / bestelbevestiging). */
export function ProductLijn({
  titel,
  aantal = 1,
  bedrag,
  extra,
}: {
  titel: string;
  aantal?: number;
  bedrag?: number;
  extra?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-vlak text-[13px] font-semibold tabular-nums">
        {aantal}
      </span>
      <span className="min-w-0 flex-1 truncate text-[15px]">{titel}</span>
      {bedrag != null && (
        <span className="shrink-0 tabular-nums text-[15px] text-rustig">{bedragTekst(bedrag)}</span>
      )}
      {extra}
    </div>
  );
}

/** Samenvatting onderaan: subtotaal / kosten / totaal. */
export function BestelTotalen({
  regels,
}: {
  regels: { label: string; bedrag: number; nadruk?: boolean }[];
}) {
  return (
    <dl className="flex flex-col gap-1 border-t border-lijn pt-2">
      {regels.map((r) => (
        <div key={r.label} className="flex items-baseline justify-between gap-3">
          <dt className={r.nadruk ? "font-semibold" : "text-rustig"}>{r.label}</dt>
          <dd className={`tabular-nums ${r.nadruk ? "text-lg font-bold" : ""}`}>{bedragTekst(r.bedrag)}</dd>
        </div>
      ))}
    </dl>
  );
}

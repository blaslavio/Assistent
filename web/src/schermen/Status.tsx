// Gedeelde feedback: laden, leeg, fout — overal dezelfde toon en structuur.
import type { ReactNode } from "react";

export function Laden({ tekst = "Even laden…" }: { tekst?: string }) {
  return (
    <p role="status" className="px-6 py-8 text-sm text-rustig">
      {tekst}
    </p>
  );
}

export function Leeg({
  titel,
  uitleg,
  actie,
}: {
  titel: string;
  uitleg?: string;
  actie?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-[20px] border border-dashed border-lijn px-5 py-6">
      <p className="font-semibold">{titel}</p>
      {uitleg && <p className="text-sm text-rustig">{uitleg}</p>}
      {actie}
    </div>
  );
}

export function FoutBalk({
  tekst,
  opnieuw,
  bezig = false,
}: {
  tekst: string;
  opnieuw?: () => void;
  bezig?: boolean;
}) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-3 rounded-2xl border border-lijn bg-vlak px-4 py-3 text-sm"
    >
      <p className="min-w-0 flex-1 text-inkt">{tekst}</p>
      {opnieuw && (
        <button
          type="button"
          disabled={bezig}
          onClick={opnieuw}
          className="shrink-0 rounded-full bg-accent px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
        >
          {bezig ? "Bezig…" : "Opnieuw"}
        </button>
      )}
    </div>
  );
}

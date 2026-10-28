// Kleine bouwstenen die de instellingenschermen delen.

export const kop = "mb-2 px-1 text-[13px] font-semibold uppercase tracking-[0.06em] text-rustig";

export function Schakelaar({ label, uitleg, aan, zet }: { label: string; uitleg: string; aan: boolean; zet: (aan: boolean) => void }) {
  return (
    <label className="flex items-center gap-4 rounded-2xl bg-vlak px-4 py-3.5">
      <span className="flex flex-1 flex-col">
        <span className="font-medium">{label}</span>
        <span className="text-sm text-rustig">{uitleg}</span>
      </span>
      <input type="checkbox" role="switch" checked={aan} onChange={(e) => zet(e.target.checked)} className="peer sr-only" />
      <span aria-hidden className={`relative h-7 w-12 shrink-0 rounded-full transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-accent ${aan ? "bg-accent" : "bg-zacht/40"}`}>
        <span className={`absolute top-0.5 size-6 rounded-full bg-white shadow transition-all ${aan ? "left-[22px]" : "left-0.5"}`} />
      </span>
    </label>
  );
}

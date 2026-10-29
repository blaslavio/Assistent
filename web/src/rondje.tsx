// Zachte, vaste kleur per persoon: altijd dezelfde, zonder dat er een foto nodig is.
const TINTEN = ["#6366f1", "#0ea5e9", "#14b8a6", "#f59e0b", "#ec4899", "#8b5cf6", "#22c55e", "#ef4444"];

export function Rondje({ naam, id, groot = false, klein = false }: { naam: string; id: number; groot?: boolean; klein?: boolean }) {
  const kleur = TINTEN[Math.abs(id) % TINTEN.length];
  return (
    <span aria-hidden style={{ background: `${kleur}1f`, color: kleur }}
      className={`flex shrink-0 items-center justify-center rounded-full font-semibold ${groot ? "size-12 text-lg" : klein ? "size-7 text-xs" : "size-9 text-sm"}`}>
      {(naam.trim()[0] ?? "?").toUpperCase()}
    </span>
  );
}

// Eigen lijn-iconen, één stijl: 24px, lijn 2, afgeronde uiteinden.
type P = { className?: string };
const basis = { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2,
  strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };

export const Zon = (p: P) => (
  <svg {...basis} {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
);
export const Kalender = (p: P) => (
  <svg {...basis} {...p}><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>
);
export const Ballon = (p: P) => (
  <svg {...basis} {...p}><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" /></svg>
);
export const Vonk = (p: P) => (
  <svg {...basis} {...p}><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" /><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" /></svg>
);
export const Plus = (p: P) => <svg {...basis} {...p}><path d="M12 5v14M5 12h14" /></svg>;
export const Microfoon = (p: P) => (
  <svg {...basis} {...p}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
);
export const Pijl = (p: P) => <svg {...basis} {...p}><path d="M12 19V5M5 12l7-7 7 7" /></svg>;
export const Terug = (p: P) => <svg {...basis} {...p}><path d="M15 18l-6-6 6-6" /></svg>;
export const Vinkje = (p: P) => <svg {...basis} {...p}><path d="M5 12l5 5L20 7" /></svg>;
export const Herstel = (p: P) => <svg {...basis} {...p}><path d="M9 14L4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></svg>;
export const Slot = (p: P) => <svg {...basis} {...p}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>;
export const Bewerk = (p: P) => <svg {...basis} {...p}><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M13.5 6.5l4 4" /></svg>;
export const Dubbelvink = (p: P) => <svg {...basis} {...p}><path d="M2 12.5l4.5 4.5L15 8" /><path d="M10 15.5l1.5 1.5L20 8" /></svg>;

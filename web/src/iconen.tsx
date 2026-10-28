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
export const Kruis = (p: P) => <svg {...basis} {...p}><path d="M6 6l12 12M18 6L6 18" /></svg>;
export const Oog = (p: P) => (
  <svg {...basis} {...p}><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>
);
export const Prullenbak = (p: P) => (
  <svg {...basis} {...p}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" /></svg>
);
export const Camera = (p: P) => (
  <svg {...basis} {...p}><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" /><circle cx="12" cy="13.5" r="3.5" /></svg>
);
export const Tas = (p: P) => (
  <svg {...basis} {...p}><path d="M5 8h14l-1 12H6z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></svg>
);
export const Beeld = (p: P) => (
  <svg {...basis} {...p}><rect x="3" y="4" width="18" height="16" rx="3" /><circle cx="9" cy="10" r="1.5" /><path d="M21 16l-5-5-9 9" /></svg>
);
export const Telefoon = (p: P) => (
  <svg {...basis} {...p}><path d="M5 4h3.5l1.5 4.5-2 1.5a12 12 0 0 0 6 6l1.5-2 4.5 1.5V19a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1z" /></svg>
);
export const Video = (p: P) => (
  <svg {...basis} {...p}><rect x="3" y="6" width="13" height="12" rx="2.5" /><path d="M16 10.5l5-3v9l-5-3" /></svg>
);
export const MicUit = (p: P) => (
  <svg {...basis} {...p}><path d="M15 10V6a3 3 0 0 0-5.7-1.3M9 9v2a3 3 0 0 0 4.6 2.5M5 11a7 7 0 0 0 11.2 5.6M19 11a7 7 0 0 1-.4 2.3M12 18v3M3 3l18 18" /></svg>
);
export const Mensen = (p: P) => (
  <svg {...basis} {...p}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.3a6.5 6.5 0 0 1 3.5 5.7" /></svg>
);
export const Persoon = (p: P) => (
  <svg {...basis} {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>
);
export const Zoek = (p: P) => <svg {...basis} {...p}><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>;
export const Tandwiel = (p: P) => (
  <svg {...basis} {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>
);

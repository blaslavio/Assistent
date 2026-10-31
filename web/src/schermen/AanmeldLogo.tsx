import type { Aanbieder } from "../lib/externAanmelden";
/** Lokale merktekens: geen externe afbeeldingen, scripts of volgverzoeken bij het aanmelden. */
export default function AanmeldLogo({ aanbieder }: { aanbieder: Aanbieder }) {
  const basis = {width:24,height:24,viewBox:"0 0 24 24",className:"size-6 shrink-0","aria-hidden":true as const,focusable:false};
  if (aanbieder === "google") return <svg {...basis} data-aanmeldlogo="google">
    <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.33 2.98-7.36Z"/>
    <path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.62-2.41l-3.24-2.51c-.9.6-2.05.96-3.38.96-2.6 0-4.81-1.76-5.6-4.12H3.05v2.59A10 10 0 0 0 12 22Z"/>
    <path fill="#FBBC05" d="M6.4 13.92a6 6 0 0 1 0-3.84V7.49H3.05a10 10 0 0 0 0 9.02l3.35-2.59Z"/>
    <path fill="#EA4335" d="M12 5.96c1.47 0 2.79.51 3.82 1.52l2.87-2.87A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.95 5.49l3.35 2.59A6 6 0 0 1 12 5.96Z"/>
  </svg>;
  if (aanbieder === "apple") return <svg {...basis} data-aanmeldlogo="apple" fill="currentColor"><path d="M17.05 12.54c.03 3.03 2.66 4.04 2.69 4.05-.02.07-.42 1.44-1.39 2.86-.84 1.23-1.72 2.46-3.09 2.49-1.34.03-1.77-.8-3.3-.8-1.52 0-2 .77-3.27.83-1.32.05-2.33-1.33-3.18-2.55-1.73-2.5-3.05-7.07-1.27-10.16a4.93 4.93 0 0 1 4.19-2.53c1.3-.03 2.53.88 3.32.88.8 0 2.29-1.09 3.86-.93.66.03 2.5.27 3.68 2.01-.1.06-2.2 1.28-2.17 3.85ZM14.54 5c.7-.85 1.17-2.03 1.04-3.2-1 .04-2.23.67-2.95 1.51-.65.75-1.22 1.95-1.07 3.1 1.12.09 2.27-.57 2.98-1.41Z"/></svg>;
  return <svg {...basis} data-aanmeldlogo="azure"><path fill="#F25022" d="M2 2h9v9H2z"/><path fill="#7FBA00" d="M13 2h9v9h-9z"/><path fill="#00A4EF" d="M2 13h9v9H2z"/><path fill="#FFB900" d="M13 13h9v9h-9z"/></svg>;
}

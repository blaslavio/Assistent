// Gedeelde betaal-UI: zelfde bevestiging in chat, webshop, boeking, events.
// Geen vooraf ingevulde bedragen — alleen wat de bestelling/boeking zelf aanlevert.
import type { ReactNode } from "react";

export function bedragTekst(bedrag: number, valuta = "EUR"): string {
  if (!Number.isFinite(bedrag)) return "—";
  try {
    return new Intl.NumberFormat("nl-NL", {
      style: "currency",
      currency: valuta,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(bedrag);
  } catch {
    return `${bedrag.toFixed(2)} ${valuta}`;
  }
}

type Props = {
  /** Echte titel uit bestelling/boeking/ticket — niet verzonnen. */
  titel: string;
  /** Echt bedrag uit de administratie. */
  bedrag: number;
  valuta?: string;
  /** Tegenpartij of organisator, indien bekend. */
  tegenpartij?: string;
  /** Korte statusregel (bijv. uit bestellingen.stand). */
  status?: string;
  /** Extra regels (levering, tickets, …). */
  details?: ReactNode;
  /** Primaire actie (Betalen, Bevestigen ontvangen, …). */
  primaireActie?: ReactNode;
  /** Secundaire acties. */
  secundair?: ReactNode;
  /** Waarschuwing vóór Stripe/extern. */
  waarschuwing?: string;
};

/**
 * Eén strakke kaart voor elke plek waar geld omgaat:
 * chat-betaalverzoek, webshop-afrekenen, boekingspagina, eventtickets.
 * Toont alleen aangeleverde feiten; gebruiker bevestigt expliciet.
 */
export function BetaalBevestiging({
  titel,
  bedrag,
  valuta = "EUR",
  tegenpartij,
  status,
  details,
  primaireActie,
  secundair,
  waarschuwing = "Je gaat naar de beveiligde betaalpagina. Assistent ziet je kaartgegevens niet.",
}: Props) {
  return (
    <section
      aria-label="Betaling controleren"
      className="flex flex-col gap-3 rounded-2xl border border-lijn p-4"
    >
      <header className="flex flex-col gap-1">
        <p className="text-[13px] font-semibold uppercase tracking-[0.06em] text-rustig">
          Controleren vóór betalen
        </p>
        <h2 className="text-lg font-semibold leading-snug">{titel}</h2>
        {tegenpartij && (
          <p className="text-sm text-rustig">Aan {tegenpartij}</p>
        )}
      </header>

      <p className="text-2xl font-bold tracking-tight tabular-nums">
        {bedragTekst(bedrag, valuta)}
      </p>

      {status && <p className="text-sm text-rustig">{status}</p>}
      {details && <div className="text-sm text-rustig">{details}</div>}

      <p className="text-xs leading-snug text-rustig">{waarschuwing}</p>

      {(primaireActie || secundair) && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {primaireActie}
          {secundair}
        </div>
      )}
    </section>
  );
}

/** Primaire knopstijl voor betalen — overal gelijk. */
export const betaalKnopKlasse =
  "min-h-11 rounded-full bg-accent px-5 text-sm font-medium text-white disabled:opacity-50";

export const secundaireKnopKlasse =
  "min-h-11 rounded-full px-3 text-sm text-rustig";

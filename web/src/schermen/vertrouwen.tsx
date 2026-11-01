// Korte vertrouwensregels — herbruikbaar op inloggen en instellingen.
export const VERTROUWEN_PUNTEN = [
  "Gegevens versleuteld op jouw toestel",
  "Geen stille acties met geld of mail",
  "Jij bevestigt elke belangrijke stap",
] as const;

export function VertrouwenRegels({ klasse = "" }: { klasse?: string }) {
  return (
    <ul className={`flex flex-col gap-1.5 text-sm text-rustig ${klasse}`}>
      {VERTROUWEN_PUNTEN.map((p) => (
        <li key={p} className="flex gap-2">
          <span className="mt-0.5 size-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
          <span>{p}</span>
        </li>
      ))}
    </ul>
  );
}

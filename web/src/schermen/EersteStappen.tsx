// Eerste stappen: vertrouwen + één duidelijke aha (typen → agenda/taak).
import { useEffect, useState } from "react";
import { Mascotte } from "../mascotte";

const SLEUTEL = "assistent-eerste-stappen-v1";

export function eersteStappenKlaar(): boolean {
  try {
    return localStorage.getItem(SLEUTEL) === "1";
  } catch {
    return true;
  }
}

function markeerKlaar() {
  try {
    localStorage.setItem(SLEUTEL, "1");
  } catch {
    /* private mode */
  }
}

type Props = {
  /** Stuurt een voorbeeldzin naar de assistent (kernflow). */
  vraag?: (tekst: string) => void;
  /** Opent de assistent zonder vooraf-tekst. */
  naarAssistent?: () => void;
};

const VOORBEELDEN = [
  "Morgen 9 uur tandarts",
  "€12,50 lunch",
  "Plan mijn dag",
] as const;

/** Compacte kaart op Vandaag: privacy + één aha, wegklikbaar. */
export default function EersteStappen({ vraag, naarAssistent }: Props) {
  const [zichtbaar, setZichtbaar] = useState(false);

  useEffect(() => {
    setZichtbaar(!eersteStappenKlaar());
  }, []);

  if (!zichtbaar) return null;

  function klaar() {
    markeerKlaar();
    setZichtbaar(false);
  }

  return (
    <section
      aria-label="Welkom bij Assistent"
      className="relative overflow-hidden rounded-[24px] border border-lijn bg-gradient-to-br from-vlak to-white p-5 shadow-sm dark:to-[#16161a]"
    >
      <div className="flex items-start gap-3">
        <Mascotte stemming="wijts" className="h-14 w-[46px] shrink-0" />
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold tracking-tight">Welkom. Dit blijft van jou.</h2>
          <p className="mt-1.5 text-[15px] leading-snug text-rustig">
            Gesprekken en gegevens staan versleuteld op dit toestel. Ik plan niets in je agenda en
            raak geen geld of mail aan zonder dat jij eerst ja zegt.
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-2xl bg-white/80 p-4 dark:bg-black/20">
        <p className="text-[13px] font-semibold uppercase tracking-[0.06em] text-rustig">
          Probeer dit meteen
        </p>
        <p className="mt-1 text-sm text-inkt">
          Typ iets gewoons — de assistent zet het om in een taak of afspraak.
        </p>
        <ul className="mt-3 flex flex-col gap-2">
          {VOORBEELDEN.map((tekst) => (
            <li key={tekst}>
              <button
                type="button"
                className="flex min-h-11 w-full items-center rounded-xl border border-lijn bg-vlak px-3 text-left text-[15px] font-medium transition active:scale-[0.99]"
                onClick={() => {
                  markeerKlaar();
                  setZichtbaar(false);
                  if (vraag) vraag(tekst);
                  else naarAssistent?.();
                }}
              >
                <span className="text-rustig">“</span>
                {tekst}
                <span className="text-rustig">”</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => {
            markeerKlaar();
            setZichtbaar(false);
            naarAssistent?.();
          }}
          className="min-h-11 rounded-full bg-accent px-5 text-sm font-medium text-white"
        >
          Open de assistent
        </button>
        <button
          type="button"
          onClick={klaar}
          className="min-h-11 px-3 text-sm text-rustig"
        >
          Ik snap het
        </button>
      </div>
    </section>
  );
}

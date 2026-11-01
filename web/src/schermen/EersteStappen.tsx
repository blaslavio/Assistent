// Eerste stappen: vertrouwen + Clippy-begeleiding. Geen voorbeeldzinnen of fictieve bedragen.
import { useEffect, useState } from "react";
import { Mascotte, type Stemming } from "../mascotte";

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

const GIDS = [
  "Alles wat je typt blijft op dit toestel, versleuteld.",
  "Ik plan niets en raak geen geld of mail aan zonder jouw ja.",
  "Bij betalen zie je altijd eerst bedrag en ontvanger — jij bevestigt.",
  "Tik op mij als je een tip wilt. Klaar? Open de assistent of ga verder.",
] as const;

type Props = {
  naarAssistent?: () => void;
};

/** Strakke welkomstkaart: Clippy leidt, geen vooraf ingevulde teksten. */
export default function EersteStappen({ naarAssistent }: Props) {
  const [zichtbaar, setZichtbaar] = useState(false);
  const [i, setI] = useState(0);
  const [stemming, setStemming] = useState<Stemming>("wijst");
  const [hup, setHup] = useState(0);

  useEffect(() => {
    setZichtbaar(!eersteStappenKlaar());
  }, []);

  if (!zichtbaar) return null;

  function klaar() {
    markeerKlaar();
    setZichtbaar(false);
  }

  function volgendeTip() {
    setHup((h) => h + 1);
    setI((x) => (x + 1) % GIDS.length);
    setStemming("wijst");
    window.setTimeout(() => setStemming("wacht"), 1400);
  }

  return (
    <section
      aria-label="Welkom bij Assistent"
      className="rounded-2xl border border-lijn bg-vlak p-4"
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={volgendeTip}
          aria-label="Volgende tip van de paperclip"
          className="shrink-0 rounded-xl active:scale-95"
        >
          <Mascotte hup={hup} stemming={stemming} className="h-12 w-10" />
        </button>
        <div className="min-w-0 flex-1 pt-0.5">
          <h2 className="text-base font-semibold tracking-tight">Welkom</h2>
          <p
            key={i}
            aria-live="polite"
            className="mt-1 text-[15px] leading-snug text-rustig"
          >
            {GIDS[i]}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            klaar();
            naarAssistent?.();
          }}
          className="min-h-10 rounded-full bg-accent px-4 text-sm font-medium text-white"
        >
          Naar de assistent
        </button>
        <button
          type="button"
          onClick={klaar}
          className="min-h-10 px-3 text-sm text-rustig"
        >
          Verder
        </button>
      </div>
    </section>
  );
}

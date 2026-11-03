// Eerste minuut: één pad, geen overload. Privacy-first, akkoord-first.
import { useState } from "react";
import { V1_FOCUS, markeerEersteMinuutKlaar, track } from "../lib/platform-kern";
import { studioOpenen } from "../lib/naar";

type Pad = "assistent" | "community" | "studio" | "agents";

export default function EersteMinuut({
  openAssistent,
  openChat,
  sluit,
}: {
  openAssistent: () => void;
  openChat: () => void;
  sluit: () => void;
}) {
  const [stap, setStap] = useState(0);

  function kies(pad: Pad) {
    markeerEersteMinuutKlaar();
    track("app_open", pad);
    if (pad === "assistent") openAssistent();
    else if (pad === "community") openChat();
    else if (pad === "studio") studioOpenen({ tool: "winkel" });
    else studioOpenen({ tool: "social_bots" });
    sluit();
  }

  function later() {
    markeerEersteMinuutKlaar();
    sluit();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="eerste-minuut-titel"
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-4 sm:items-center"
    >
      <div className="flex max-h-[90vh] w-full max-w-md flex-col overflow-y-auto rounded-3xl bg-white p-5 shadow-xl dark:bg-[#121216]">
        {stap === 0 && (
          <>
            <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-accent">
              Welkom
            </p>
            <h2 id="eerste-minuut-titel" className="mt-1 text-2xl font-bold tracking-tight">
              Wat wil je nu regelen?
            </h2>
            <p className="mt-2 text-[14px] text-rustig">
              De app is AI-beheerd en privacy-first. Jij geeft akkoord; wij automatiseren niet
              stiekem. Kies één pad — de rest blijft beschikbaar.
            </p>
            <ul className="mt-4 flex flex-col gap-2">
              {(
                [
                  ["assistent", "Iets vragen of regelen", "Assistent doet het voorwerk"],
                  ["community", "Netwerken of handelen", "Chat en community"],
                  ["studio", "Winkel of evenement", "Studio zakelijk"],
                  ["agents", "Social kanalen", "Agents + akkoord-wachtrij"],
                ] as const
              ).map(([id, titel, sub]) => (
                <li key={id}>
                  <button
                    type="button"
                    onClick={() => kies(id)}
                    className="flex min-h-14 w-full flex-col items-start rounded-2xl bg-vlak px-4 py-3 text-left"
                  >
                    <span className="font-medium">{titel}</span>
                    <span className="text-[13px] text-rustig">{sub}</span>
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => setStap(1)}
              className="mt-3 text-[13px] text-accent"
            >
              Wat zit er in v1?
            </button>
            <button type="button" onClick={later} className="mt-2 text-[13px] text-rustig">
              Later verkennen
            </button>
          </>
        )}
        {stap === 1 && (
          <>
            <h2 className="text-xl font-bold">Focus v1</h2>
            <p className="mt-1 text-[13px] text-rustig">
              Breedte is er; diepte eerst op deze diamant.
            </p>
            <ul className="mt-3 list-inside list-disc text-[14px]">
              {V1_FOCUS.diamant.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
            <p className="mt-3 text-[12px] text-zacht">Later: {V1_FOCUS.later.join(" · ")}</p>
            <button
              type="button"
              onClick={() => setStap(0)}
              className="mt-4 h-11 rounded-full bg-accent px-4 text-sm font-medium text-white"
            >
              Terug naar kiezen
            </button>
          </>
        )}
      </div>
    </div>
  );
}

import { useState } from "react";
import {
  blokkeerGebruiker,
  rapporteer,
  type RapportReden,
} from "../lib/platform-kern";
import { wachtrijPush } from "../lib/platform-uitbouw";

const REDENEN: { id: RapportReden; label: string }[] = [
  { id: "spam", label: "Spam" },
  { id: "misleiding", label: "Misleiding" },
  { id: "haat", label: "Haat of pesten" },
  { id: "privacy", label: "Privacy" },
  { id: "anders", label: "Anders" },
];

type Props = {
  doelId: string;
  soort?: "bericht" | "profiel" | "winkel";
  auteurId?: string;
  compact?: boolean;
};

export default function ModeratieMenu({ doelId, soort = "bericht", auteurId, compact }: Props) {
  const [open, setOpen] = useState(false);
  const [reden, setReden] = useState<RapportReden>("spam");
  const [bevestigd, setBevestigd] = useState("");

  function stuurRapport() {
    rapporteer({ doelId, soort, reden });
    // Offline-first: ook in wachtrij voor latere server-sync
    wachtrijPush("rapport", { doelId, soort, reden });
    setBevestigd("Gemeld. Bedankt.");
    setOpen(false);
    setTimeout(() => setBevestigd(""), 2500);
  }

  function blokkeer() {
    if (auteurId) blokkeerGebruiker(auteurId);
    else blokkeerGebruiker(doelId);
    setBevestigd("Geblokkeerd op dit apparaat.");
    setOpen(false);
    setTimeout(() => setBevestigd(""), 2500);
  }

  return (
    <div className="relative inline-flex flex-col items-end">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((o) => !o)}
        className={
          compact
            ? "min-h-9 rounded-full px-2 text-[12px] text-rustig hover:bg-vlak"
            : "min-h-10 rounded-full bg-vlak px-3 text-[12px] font-medium"
        }
      >
        Melden
      </button>
      {open && (
        <div
          role="menu"
          className="absolute top-full right-0 z-20 mt-1 w-56 rounded-2xl border border-lijn bg-white p-2 shadow-lg dark:bg-[#121216]"
        >
          <p className="px-2 py-1 text-[11px] text-rustig">Waarom melden?</p>
          {REDENEN.map((r) => (
            <button
              key={r.id}
              type="button"
              role="menuitem"
              onClick={() => setReden(r.id)}
              className={`flex min-h-10 w-full items-center rounded-xl px-2 text-left text-[13px] ${
                reden === r.id ? "bg-accent/10 font-medium" : "hover:bg-vlak"
              }`}
            >
              {r.label}
            </button>
          ))}
          <button
            type="button"
            role="menuitem"
            onClick={stuurRapport}
            className="mt-1 flex min-h-10 w-full items-center justify-center rounded-xl bg-accent text-[13px] font-semibold text-white"
          >
            Rapport versturen
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={blokkeer}
            className="mt-1 flex min-h-10 w-full items-center justify-center rounded-xl text-[13px] text-red-600 dark:text-red-400"
          >
            Blokkeer gebruiker
          </button>
        </div>
      )}
      {bevestigd && (
        <p role="status" className="mt-1 text-[11px] text-accent">
          {bevestigd}
        </p>
      )}
    </div>
  );
}

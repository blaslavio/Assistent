// Lichte globale zoek — vindt kernpaden zonder de app te overladen.
import { useMemo, useState } from "react";
import { globaalZoeken } from "../lib/platform-kern";
import { naar, studioOpenen } from "../lib/naar";

export default function GlobaalZoek({ sluit }: { sluit: () => void }) {
  const [q, setQ] = useState("");
  const hits = useMemo(() => globaalZoeken(q), [q]);

  function open(doel: ReturnType<typeof globaalZoeken>[0]["doel"]) {
    if (doel.soort === "tab") naar({ tab: doel.tab });
    else if (doel.soort === "studio") {
      studioOpenen();
      window.dispatchEvent(
        new CustomEvent("studio-openen", { detail: { tool: doel.tool } }),
      );
    }
    sluit();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Zoeken in de app"
      className="fixed inset-0 z-[70] flex items-start justify-center bg-black/40 p-4 pt-[max(env(safe-area-inset-top),2rem)]"
    >
      <div className="w-full max-w-md rounded-3xl bg-white p-4 shadow-xl dark:bg-[#121216]">
        <label className="block">
          <span className="sr-only">Zoek</span>
          <input
            autoFocus
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Assistent, community, agents…"
            className="h-12 w-full rounded-2xl bg-vlak px-4 text-[15px] outline-none"
          />
        </label>
        <ul className="mt-3 flex flex-col gap-1">
          {hits.map((h) => (
            <li key={h.label}>
              <button
                type="button"
                onClick={() => open(h.doel)}
                className="flex min-h-11 w-full flex-col items-start rounded-xl px-3 py-2 text-left hover:bg-vlak"
              >
                <span className="font-medium">{h.label}</span>
                {h.doel.soort === "tekst" && (
                  <span className="text-[12px] text-rustig">{h.doel.uitleg}</span>
                )}
              </button>
            </li>
          ))}
          {q.trim() && !hits.length && (
            <li className="px-3 py-2 text-sm text-rustig">Niets gevonden</li>
          )}
        </ul>
        <button type="button" onClick={sluit} className="mt-2 w-full py-2 text-sm text-accent">
          Sluiten
        </button>
      </div>
    </div>
  );
}

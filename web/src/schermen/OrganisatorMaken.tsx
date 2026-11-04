// Zelf een evenement organiseren, zonder dat je eerst een groep in Chat nodig hebt.
// Je maakt een organisatorpagina (net als bij Eventbrite): daar horen je evenementen, tickets en bezoekers bij.
import { useState } from "react";
import { communityMaken } from "../lib/chat";

export function OrganisatorMaken({ klaar, compact = false }: { klaar: (id: number) => void; compact?: boolean }) {
  const [naam, setNaam] = useState("");
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState("");
  async function maak(e: React.FormEvent) {
    e.preventDefault();
    if (!naam.trim() || bezig) return;
    setBezig(true);
    setFout("");
    try {
      const { id } = await communityMaken(naam.trim(), "Organisator van evenementen");
      klaar(id);
    } catch (err) {
      setFout(err instanceof Error ? err.message : "Maken lukte niet. Probeer het opnieuw.");
    } finally {
      setBezig(false);
    }
  }
  return (
    <form onSubmit={maak} className={`flex flex-col gap-3 ${compact ? "" : "rounded-3xl bg-vlak p-5"}`}>
      {!compact && <div>
        <h3 className="text-[17px] font-semibold">Zelf organiseren</h3>
        <p className="mt-1 text-[14px] leading-snug text-rustig">Geef je organisatie een naam, bijvoorbeeld je eigen naam of die van je bedrijf. Daarna maak je je evenement en verkoop je tickets.</p>
      </div>}
      <label className="flex flex-col gap-1.5 text-sm">Naam van de organisator
        <input value={naam} onChange={(e) => setNaam(e.target.value)} maxLength={80} placeholder="Bijvoorbeeld Boksclub Ede"
          className="h-12 rounded-2xl bg-white px-4 text-[16px] ring-1 ring-lijn outline-none focus:ring-2 focus:ring-accent dark:bg-[#121216]" />
      </label>
      {fout && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{fout}</p>}
      <button disabled={!naam.trim() || bezig} className="h-12 rounded-full bg-accent text-[15px] font-semibold text-white disabled:opacity-40">
        {bezig ? "Even…" : "Organisator maken"}
      </button>
    </form>
  );
}

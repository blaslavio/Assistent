import { useRef, useState } from "react";
import { projectArchiefBestanden, projectArchiefGegevens, projectArchiefLijst } from "../lib/chat";
import { bestandMaken } from "../lib/project";
import { huidigeSessie } from "../api";

export default function ProjectArchiefCatalogus({ gesprek, schrijven, geopend }: {
  gesprek: number; schrijven: boolean; geopend: (id: string) => void;
}) {
  const [lijst, setLijst] = useState<{ bestand: string; laatst: string; aantal: number }[]>([]);
  const [herstel, setHerstel] = useState<{ tekst: string; titel: string; bestand: string; versie: number; auteurs: number[]; herkomstOnbekend: boolean } | null>(null);
  const [fout, setFout] = useState("");
  const [bezig, setBezig] = useState(false);
  const slot = useRef(false);
  return <details className="rounded-xl border border-lijn p-3">
    <summary className="min-h-11 cursor-pointer font-medium">Bestanden terugvinden in het aparte archief</summary>
    <p className="text-sm text-rustig">Werkt ook zonder de oorspronkelijke bestandsberichten, zolang je nog toegang hebt tot het project en de benodigde apparaatsleutels.</p>
    {fout && <p role="alert">{fout}</p>}
    <button className="min-h-11 text-accent" disabled={bezig} onClick={async () => {
      if (slot.current) return; slot.current = true; setBezig(true); setFout("");
      const sessie = huidigeSessie();
      try { const r = await projectArchiefBestanden(gesprek); if (huidigeSessie() === sessie) setLijst(r.bestanden); }
      catch { setFout("Het aparte archief is niet bereikbaar of je account heeft geen toegang."); }
      finally { slot.current = false; setBezig(false); }
    }}>Gearchiveerde bestanden ophalen</button>
    <ul>{lijst.map(b => <li key={b.bestand} className="border-t border-lijn py-2">
      <p className="break-all text-sm">Bestand {b.bestand} · {b.aantal} versies</p>
      <button disabled={bezig} className="min-h-11 text-accent" onClick={async () => {
        if (slot.current) return; slot.current = true; setBezig(true); setFout(""); const sessie = huidigeSessie();
        try { const versies = await projectArchiefLijst(gesprek, b.bestand); const laatste = versies.versies[0];
          if (!laatste) throw new Error();
          const inhoud = await projectArchiefGegevens(gesprek, b.bestand, laatste.id);
          if (huidigeSessie() === sessie) setHerstel({ ...inhoud, bestand: b.bestand, versie: laatste.id });
        } catch { setFout("Deze archiefversie kon niet worden ontsleuteld. Je huidige bestanden zijn niet gewijzigd."); }
        finally { slot.current = false; setBezig(false); }
      }}>Laatste versie bekijken</button>
    </li>)}</ul>
    {herstel && <div className="rounded-xl bg-vlak p-3">
      <p className="font-medium">{herstel.titel} · archiefversie {herstel.versie}</p>
      <pre className="max-h-48 overflow-auto whitespace-pre-wrap text-xs">{herstel.tekst}</pre>
      <p className="text-sm">Herstellen maakt een nieuw gedeeld bestand met een nieuw ID. Bestaande bestanden en verwijzingen blijven behouden.</p>
      {schrijven && <button className="min-h-11 text-accent" onClick={() => {
        try { const b = bestandMaken(gesprek, herstel.titel, herstel.tekst); b.markeerArchiefHerkomst(herstel.auteurs, herstel.herkomstOnbekend); geopend(b.id); setHerstel(null); }
        catch { setFout("Herstellen als nieuw bestand lukte niet. Controleer de tekst en het maximumaantal bestanden."); }
      }}>Bevestig herstel als nieuw projectbestand</button>}
      <button className="min-h-11 px-3" onClick={() => setHerstel(null)}>Sluiten</button>
    </div>}
  </details>;
}

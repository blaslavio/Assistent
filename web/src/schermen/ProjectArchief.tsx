import { useRef, useState } from "react";
import { projectArchiefLezen, projectArchiefLijst, projectArchiefVoorstel } from "../lib/chat";
import type { Werkbestand } from "../lib/project";
import type { Lid } from "../lib/chat";

export default function ProjectArchief({ gesprek, bestand: b, schrijven, leden = [], auteurs = [] }: { gesprek: number; bestand: Werkbestand; schrijven: boolean; leden?: Lid[]; auteurs?: number[] }) {
  const [versies, setVersies] = useState<{ id: number; afzender: number; aangemaakt: string }[]>([]);
  const [fout, setFout] = useState("");
  const [melding, setMelding] = useState("");
  const [bezig, setBezig] = useState(false);
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const [herstel, setHerstel] = useState<{ tekst: string; basis: string; id: number } | null>(null);
  const poging = useRef<(() => Promise<{ id: number; aangemaakt: string }>) | null>(null);
  const slot = useRef(false);
  async function lijst(meer = false) {
    setFout("");
    try { const r = await projectArchiefLijst(gesprek, b.id, meer ? versies.at(-1)?.id ?? null : null);
      setVersies(oud => meer ? [...oud, ...r.versies.filter(v => !oud.some(x => x.id === v.id))] : r.versies);
    } catch { setFout("Het versiearchief is nog niet beschikbaar of je apparaat heeft geen toegang. Laat de beheerder dit controleren; je tekst is niet gewijzigd."); }
  }
  async function bewaren() {
    if (snapshot === null || slot.current) return;
    slot.current = true; setBezig(true); setFout("");
    try {
      poging.current ??= await projectArchiefVoorstel(gesprek, b.id, snapshot, b.titel, [...new Set([...auteurs, ...b.bronAuteurs])], b.onbekendeHerkomst);
      await poging.current();
      poging.current = null; setSnapshot(null); setMelding("Versie afzonderlijk versleuteld gearchiveerd."); await lijst();
    } catch { setFout("Archiveren is nog niet bevestigd. Opnieuw proberen gebruikt dezelfde voorbereide archiefopdracht."); }
    finally { slot.current = false; setBezig(false); }
  }
  return <details className="rounded-xl border border-lijn p-3">
    <summary className="min-h-11 cursor-pointer font-medium">Versiearchief en veilig herstel</summary>
    <p className="mt-2 text-sm text-rustig">Dit bewaart een aparte versleutelde versie buiten de chatgeschiedenis. Maximaal 200 per bestand. Oude apparaatsleutels blijven nodig om oude versies te lezen.</p>
    {fout && <p role="alert" className="mt-2">{fout}</p>}{melding && <p role="status">{melding}</p>}
    <div className="mt-3 flex flex-wrap gap-3">
      <button className="min-h-11 text-accent" disabled={bezig} onClick={() => lijst()}>Versies ophalen</button>
      {schrijven && <button className="min-h-11 text-accent" disabled={bezig || snapshot !== null}
        onClick={() => { setSnapshot(b.inhoud); setMelding(""); }}>Huidige versie voorbereiden</button>}
    </div>
    {snapshot !== null && <div className="mt-2 rounded-xl bg-vlak p-3">
      <p>Je archiveert deze inhoud ({snapshot.length} tekens). Er wordt niets uit de chat verwijderd.</p>
      <pre className="max-h-40 overflow-auto whitespace-pre-wrap text-xs">{snapshot}</pre>
      <button disabled={bezig} onClick={bewaren} className="min-h-11 text-accent">{bezig ? "Archiveren…" : poging.current ? "Dezelfde archiefopdracht opnieuw proberen" : "Bevestig archiveren"}</button>
      <button disabled={bezig} className="min-h-11 px-3" onClick={() => { setSnapshot(null); poging.current = null; }}>Sluiten zonder terugdraaien</button>
    </div>}
    <ul>{versies.map(v => <li key={v.id} className="flex flex-wrap items-center gap-3 border-t border-lijn py-2">
      <span>Versie {v.id} · {leden.find(l => l.id === v.afzender)?.naam ?? `Deelnemer ${v.afzender}`} · {new Date(v.aangemaakt).toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam" })}</span>
      <button className="min-h-11 text-accent" onClick={async () => {
        setFout(""); try { const tekst = await projectArchiefLezen(gesprek, b.id, v.id); setHerstel({ tekst, basis: b.inhoud, id: v.id }); }
        catch { setFout("Deze versie kon niet worden ontsleuteld of is niet toegankelijk voor dit apparaat."); }
      }}>Bekijken</button>
    </li>)}</ul>
    {versies.length > 0 && <button className="min-h-11 text-accent" onClick={() => lijst(true)}>Oudere versies ophalen</button>}
    {herstel && <div className="rounded-xl bg-vlak p-3">
      <p>Voorbeeld versie {herstel.id}. Herstellen vervangt de huidige tekst en deelt die als een nieuwe bewerking.</p>
      <pre className="max-h-48 overflow-auto whitespace-pre-wrap text-xs">{herstel.tekst}</pre>
      {schrijven && <button className="min-h-11 text-accent" onClick={() => {
        if (b.inhoud !== herstel.basis) { setFout("Het bestand is intussen gewijzigd. Bekijk de versie opnieuw voordat je herstelt."); return; }
        try { b.bewerk(herstel.tekst); setHerstel(null); setMelding("Herstel staat als nieuwe bewerking klaar om te delen. Het archief is behouden."); }
        catch { setFout("De versie kon niet veilig worden teruggezet."); }
      }}>Bevestig herstel als nieuwe bewerking</button>}
      <button className="min-h-11 px-3" onClick={() => setHerstel(null)}>Sluiten</button>
    </div>}
  </details>;
}

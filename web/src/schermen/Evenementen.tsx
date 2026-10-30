import { useEffect, useState } from "react";
import type { Staat } from "../App";
import { huidigeSessie } from "../api";
import { overzicht, type Community } from "../lib/chat";
import { evenementVerwijzing } from "../lib/evenementen";
import { naar } from "../lib/naar";
import { ClubAgenda } from "./ClubAgenda";

export default function Evenementen({ staat, setStaat }: { staat: Staat; setStaat: (s: Staat) => void }) {
  const [verwijzing] = useState(evenementVerwijzing);
  const [groepen, setGroepen] = useState<Community[]>([]);
  const [gekozen, setGekozen] = useState<number | null>(verwijzing?.groep ?? null);
  const [bezig, setBezig] = useState(true), [fout, setFout] = useState("");
  const [poging, setPoging] = useState(0);
  useEffect(() => {
    let actief = true; const sessie = huidigeSessie();
    setBezig(true); setFout("");
    overzicht(false).then(r => {
      if (!actief || huidigeSessie() !== sessie) return;
      const leden = r.communities.filter(c => c.status === "lid" && !c.herinnering);
      setGroepen(leden);
      if (!verwijzing && leden.length === 1) setGekozen(leden[0].id);
    }).catch(() => { if (actief) setFout("Groepen ophalen lukt nu niet. Probeer opnieuw."); })
      .finally(() => { if (actief) setBezig(false); });
    const wissen = () => { setGroepen([]); setGekozen(null); setFout("Je sessie is gewijzigd. Open Evenementen opnieuw."); };
    window.addEventListener("assistent-sessie", wissen);
    return () => { actief = false; window.removeEventListener("assistent-sessie", wissen); };
  }, [poging, verwijzing]);
  const groep = groepen.find(c => c.id === gekozen);
  return <section aria-label="Evenementen" className="flex flex-col gap-4 pb-6">
    <div className="flex flex-col gap-3 px-6">
      <p className="text-sm text-rustig">Organiseer met je groep. Kies tijden en locatie, verzamel reacties en deel de evenementpagina met leden.</p>
      {bezig && <p role="status">Groepen ophalen…</p>}
      {fout && <p role="alert">{fout} <button className="min-h-11 text-accent" onClick={() => setPoging(n => n + 1)}>Opnieuw</button></p>}
      {!bezig && !fout && !groepen.length && <div><p>Een evenement hoort bij een groep. Maak of open een groep in Chat.</p>
        <button onClick={() => naar({ tab: "chat" })} className="mt-2 min-h-11 text-accent">Open groepen in Chat</button></div>}
      {!!groepen.length && <label className="flex flex-col gap-2 text-sm">Groep voor dit evenement
        <select value={gekozen ?? ""} onChange={e => setGekozen(Number(e.target.value) || null)} className="h-12 rounded-2xl bg-vlak px-3">
          <option value="">Kies een groep</option>{groepen.map(c => <option key={c.id} value={c.id}>{c.naam}</option>)}
        </select></label>}
      {!bezig && !fout && verwijzing && !groep && <p role="status">Deze evenementpagina is niet beschikbaar voor je huidige groepen.</p>}
    </div>
    {groep && <ClubAgenda key={groep.id} c={groep} beginSoort="evenement" evenement={verwijzing?.groep === groep.id ? verwijzing.id : undefined}
      bijgewerkt={data => setStaat({ ...staat, data })} />}
  </section>;
}

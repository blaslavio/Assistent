import { useEffect, useState } from "react";
import type { Staat } from "../App";
import { huidigeSessie } from "../api";
import { overzicht, type Community } from "../lib/chat";
import { evenementVerwijzing } from "../lib/evenementen";
import { OrganisatorMaken } from "./OrganisatorMaken";
import { ClubAgenda } from "./ClubAgenda";
import { EventsOntdekken, MijnTickets } from "./EventsOntdekken";

const DELEN = [["ontdekken", "Ontdekken"], ["tickets", "Mijn tickets"], ["organiseren", "Organiseren"]] as const;
type EventDeel = (typeof DELEN)[number][0];

export default function Evenementen({ staat, setStaat }: { staat: Staat; setStaat: (s: Staat) => void }) {
  const [verwijzing] = useState(evenementVerwijzing);
  const [deel, setDeel] = useState<EventDeel>(verwijzing ? "organiseren" : "ontdekken");
  const kiezer = <nav aria-label="Evenementen" className="flex gap-2 px-6">
    {DELEN.map(([k, naam]) => <button key={k} aria-pressed={deel === k} onClick={() => setDeel(k)}
      className={`h-9 rounded-full px-3.5 text-sm ${deel === k ? "bg-accent font-medium text-white" : "bg-vlak text-rustig"}`}>{naam}</button>)}
  </nav>;
  if (deel !== "organiseren") return <section className="flex flex-col gap-4 pb-6">{kiezer}{deel === "ontdekken" ? <EventsOntdekken /> : <MijnTickets />}</section>;
  return <Organiseren staat={staat} setStaat={setStaat} verwijzing={verwijzing} kiezer={kiezer} />;
}

function Organiseren({ staat, setStaat, verwijzing, kiezer }: { staat: Staat; setStaat: (s: Staat) => void;
  verwijzing: ReturnType<typeof evenementVerwijzing>; kiezer: React.ReactNode }) {
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
  return <section aria-label="Evenementen organiseren" className="flex flex-col gap-4 pb-6">
    {kiezer}
    <div className="flex flex-col gap-3 px-6">
      <p className="text-sm text-rustig">Organiseer alleen of met je club. Tickets verkopen doe je daarna in Studio, onder Tickets en inschrijvingen.</p>
      {bezig && <p role="status">Laden…</p>}
      {fout && <p role="alert">{fout} <button className="min-h-11 text-accent" onClick={() => setPoging(n => n + 1)}>Opnieuw</button></p>}
      {!bezig && !fout && !groepen.length && <OrganisatorMaken klaar={(id) => { setGekozen(id); setPoging(n => n + 1); }} />}
      {!!groepen.length && <label className="flex flex-col gap-2 text-sm">Organisator
        <select value={gekozen ?? ""} onChange={e => setGekozen(Number(e.target.value) || null)} className="h-12 rounded-2xl bg-vlak px-3">
          <option value="">Kies wie organiseert</option>{groepen.map(c => <option key={c.id} value={c.id}>{c.naam}</option>)}
        </select></label>}
      {!bezig && !fout && verwijzing && !groep && <p role="status">Deze evenementpagina hoort niet bij jou als organisator.</p>}
    </div>
    {groep && <ClubAgenda key={groep.id} c={groep} beginSoort="evenement" evenement={verwijzing?.groep === groep.id ? verwijzing.id : undefined}
      bijgewerkt={data => setStaat({ ...staat, data })} />}
  </section>;
}

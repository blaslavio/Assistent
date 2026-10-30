import { useState } from "react";
import type { Feit } from "../lib/projectregie";
import { projectWerkdruk } from "../lib/projectwerk";
export default function ProjectWerkdruk({feiten,namen}:{feiten:Feit[];namen:Map<number,string>}){
  const [capaciteit,setCapaciteit]=useState(120);const {personen,onverdeeld,conflicten}=projectWerkdruk(feiten);
  return <section aria-label="Werkbelasting van het project" className="flex flex-col gap-3"><p>Geschatte inspanning van geladen open stappen in dit project, geen meting van prestaties of aanwezigheid. Andere projecten en privéagenda’s worden niet gelezen.</p>
    <label>Vergelijk met minuten per werkdag<input type="number" min={5} max={480} step={5} value={capaciteit} onChange={e=>setCapaciteit(Number(e.target.value))} className="ml-2 min-h-11 w-24 bg-vlak p-2"/></label>
    <p className="text-sm">Een eigen aanname voor deze vergelijking; geen bevestigde beschikbaarheid. Plan de echte tijd onder Wanneer.</p>
    {!!conflicten&&<p role="status">{conflicten} doelen met meerdere actuele aanpakken zijn niet meegeteld om dubbeltelling te voorkomen. Kies eerst samen een route.</p>}
    <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th>Verantwoordelijke</th><th>Stappen</th><th>Open minuten</th><th>Geblokkeerd</th><th>Werkdagen bij aanname</th></tr></thead><tbody>{[...personen].map(([id,p])=><tr key={id} className="border-t border-lijn"><td>{namen.get(id)??"Voormalige deelnemer"}</td><td>{p.stappen}</td><td>{p.minuten}</td><td>{p.geblokkeerd}</td><td>{Number.isSafeInteger(capaciteit)&&capaciteit>=5&&capaciteit<=480?Math.ceil(p.minuten/capaciteit):"Kies 5–480 minuten"}</td></tr>)}</tbody></table></div>
    <p>Nog te verdelen: {onverdeeld} minuten.</p>{!personen.size&&!onverdeeld&&<p>Geen eenduidige open stappen. Maak eerst een aanpak of controleer afgeronde stappen.</p>}
  </section>;
}

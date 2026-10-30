import { useRef, useState } from "react";
import type { Staat } from "../App";
import { bijwerken, huidigeSessie } from "../api";
import { eigenSjablonen, sjabloonBewaren, sjabloonInvullen, sjabloonMaken, sjabloonVerwijderen, STARTSJABLONEN, type ProjectSjabloon } from "../lib/projectwerk";
import type { Stap } from "../lib/projectplan";
export default function ProjectSjablonen({stappen,staat,setData,toepassen,schrijven}:{stappen:Stap[];staat?:Staat;setData?:(g:Staat["data"])=>void;toepassen:(s:Stap[])=>void;schrijven:boolean}){
  const [naam,setNaam]=useState("");const [pending,setPending]=useState<{actie:"bewaren"|"laden"|"verwijderen";s:ProjectSjabloon}|null>(null);
  const [fout,setFout]=useState("");const [melding,setMelding]=useState("");const [bezig,setBezig]=useState(false);const slot=useRef(false);
  let eigen:ProjectSjabloon[]=[];let leesfout="";try{if(staat)eigen=eigenSjablonen(staat.data);}catch(e){leesfout=(e as Error).message;}
  return <details className="rounded-xl border border-lijn p-3"><summary className="min-h-11 cursor-pointer font-medium">Herbruikbare aanpakken</summary>
    <p className="text-sm">Eerst een bewerkbaar concept. Verantwoordelijken, deadlines, broncodes en oude voortgang worden niet overgenomen. Controleer of de stapteksten privégegevens bevatten.</p>
    {(fout||leesfout)&&<p role="alert">{fout||leesfout}</p>}{melding&&<p role="status">{melding}</p>}
    {[...STARTSJABLONEN,...eigen].map(s=><div key={s.id} className="border-t border-lijn py-2"><p>{s.naam} · {s.stappen.length} stappen</p>
      <button type="button" disabled={!schrijven||!!pending} className="min-h-11 text-accent" onClick={()=>setPending({actie:"laden",s:structuredClone(s)})}>Bekijk {s.naam}</button>
      {eigen.some(e=>e.id===s.id)&&<button type="button" disabled={!setData||!!pending} className="min-h-11 px-3 text-accent" onClick={()=>setPending({actie:"verwijderen",s})}>Verwijder eigen sjabloon</button>}
    </div>)}
    <label>Naam eigen sjabloon<input maxLength={80} value={naam} onChange={e=>setNaam(e.target.value)} className="min-h-11 w-full bg-vlak p-2"/></label>
    <button type="button" disabled={!setData||!naam.trim()||!!pending||!!leesfout} className="min-h-11 text-accent" onClick={()=>{try{setPending({actie:"bewaren",s:sjabloonMaken(naam,stappen)});setFout("");}catch(e){setFout((e as Error).message);}}}>Huidige stappen als eigen sjabloon controleren</button>
    {pending&&<div className="rounded-xl bg-vlak p-3"><p className="font-medium">{pending.s.naam} · {pending.actie}</p>
      <ol>{pending.s.stappen.map((s,i)=><li key={i}>{i+1}. {s.titel} · {s.minuten} minuten. Klaar als: {s.klaarAls}. Alternatief: {s.alternatief||"nog invullen"}. Na stap: {s.na.map(i=>i+1).join(", ")||"geen"}.</li>)}</ol>
      <p className="text-sm">{pending.actie==="laden"?"Vervangt alleen de onopgeslagen stappen in dit formulier. Delen vraagt daarna een aparte bevestiging.":pending.actie==="bewaren"?"Bewaren in je eigen account. Stapteksten worden niet automatisch geanonimiseerd en niet met andere deelnemers gedeeld.":"Verwijdert alleen dit eigen sjabloon; bestaande projectaanpakken blijven behouden."}</p>
      <button type="button" disabled={bezig||pending.actie==="laden"&&!schrijven} className="min-h-11 text-accent" onClick={async()=>{
        if(slot.current)return;setFout("");
        if(pending.actie==="laden"){try{toepassen(sjabloonInvullen(pending.s));setPending(null);setMelding("Conceptstappen geladen. Wijs verantwoordelijken toe en controleer vóór delen.");}catch(e){setFout((e as Error).message);}return;}
        if(!setData)return;slot.current=true;setBezig(true);const sessie=huidigeSessie();
        try{const g=await bijwerken(g=>{if(pending.actie==="bewaren")sjabloonBewaren(g,pending.s);else sjabloonVerwijderen(g,pending.s);});if(huidigeSessie()===sessie){setData(g);setPending(null);setMelding("Eigen sjabloonwijziging bevestigd opgeslagen.");}}
        catch(e){if(huidigeSessie()===sessie)setFout((e as Error).message);}finally{slot.current=false;setBezig(false);}
      }}>{pending.actie==="laden"?"Gebruik als bewerkbaar concept":pending.actie==="bewaren"?"Bevestig privé bewaren":"Bevestig sjabloon verwijderen"}</button><button type="button" disabled={bezig} className="min-h-11 px-3" onClick={()=>setPending(null)}>Sluiten</button>
    </div>}
  </details>;
}

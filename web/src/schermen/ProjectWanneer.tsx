import { useRef, useState } from "react";
import { bijwerken, huidigeSessie } from "../api";
import type { Staat } from "../App";
import { projectRegelsVers } from "../lib/chat";
import { actueleAanpakken } from "../lib/projectplan";
import { nieuwFeit, projectFeiten, type Feit, type ProjectActie } from "../lib/projectregie";
import { lokaleTijd, nederlandseInstant } from "../lib/projecttijd";
import { tijdVoorstellen, tijdVastleggen, type TijdPoging, type TijdRij } from "../lib/projectwanneer";

const toon = (s: string) => new Date(s).toLocaleString("nl-NL",{timeZone:"Europe/Amsterdam"});
export default function ProjectWanneer({ gesprek, feiten, ik, personen, staat, setData, schrijven, voorstel }: {
  gesprek:number;feiten:Feit[];ik:number;personen:Map<number,string>;staat?:Staat;setData?:(g:Staat["data"])=>void;
  schrijven:boolean;voorstel:(a:ProjectActie)=>void;
}) {
  const plannen=feiten.filter(f=>f.actie.soort==="aanpak"&&actueleAanpakken(f.actie.doel!,feiten).some(p=>p.actie.sleutel===f.actie.sleutel));
  const [planId,setPlanId]=useState(""); const plan=plannen.find(p=>p.actie.sleutel===planId);
  const [van,setVan]=useState("");const [tot,setTot]=useState("");const [deadline,setDeadline]=useState("");
  const [rijen,setRijen]=useState<TijdRij[]|null>(null);const [fout,setFout]=useState("");const [melding,setMelding]=useState("");
  const slot=useRef(false);
  const [pending,setPending]=useState<TijdPoging|null>(null);const [bezig,setBezig]=useState(false);
  return <section aria-label="Wanneer voeren we het uit" className="flex flex-col gap-3">
    <p className="text-sm text-rustig">Alle tijden zijn Nederlandse tijd. De motor combineert stapvolgorde, opgegeven beschikbaarheid, deadline en je eigen appagenda. Andere agenda’s worden niet ingezien. Er worden geen tijden stilzwijgend vastgelegd.</p>
    {fout&&<p role="alert">{fout}</p>}{melding&&<p role="status">{melding}</p>}
    <label>Uitvoerbare aanpak<select disabled={!!pending} value={planId} className="mt-1 min-h-11 w-full bg-vlak p-2" onChange={e=>{setPlanId(e.target.value);setRijen(null);setPending(null);}}>
      <option value="">Kies een bevestigde aanpak uit Hoe</option>{plannen.map(p=><option key={p.actie.sleutel} value={p.actie.sleutel}>{p.actie.tekst.slice(0,100)} · #{p.bericht}</option>)}
    </select></label>
    <details className="rounded-xl border border-lijn p-3"><summary className="min-h-11 cursor-pointer font-medium">Mijn beschikbaarheid opgeven</summary>
      <p className="text-sm text-rustig">Een nieuw bevestigd tijdvak vervangt je eerdere projectbeschikbaarheid. Dit deelt alleen dit tijdvak, niet je agenda.</p>
      <label className="block">Beschikbaar vanaf<input type="datetime-local" value={van} onChange={e=>setVan(e.target.value)} className="mt-1 min-h-11 max-w-full bg-vlak p-2"/></label>
      <label className="block">Beschikbaar tot<input type="datetime-local" value={tot} onChange={e=>setTot(e.target.value)} className="mt-1 min-h-11 max-w-full bg-vlak p-2"/></label>
      <button disabled={!schrijven} className="min-h-11 text-accent" onClick={()=>{try{const v=nederlandseInstant(van),t=nederlandseInstant(tot);voorstel(nieuwFeit("werkvenster",`Mijn beschikbaarheid: ${toon(v)} tot ${toon(t)}.`,{soort:"eigen"},{vensters:[{van:v,tot:t}]}));setFout("");}catch(e){setFout((e as Error).message);}}}>Beschikbaarheid voorbereiden</button>
    </details>
    {plan&&<>
      <p className="text-sm">Deadline: {plan.actie.uiterlijk?toon(plan.actie.uiterlijk):"nog niet vastgelegd"}</p>
      <label>Nieuwe deadline<input type="datetime-local" value={deadline} onChange={e=>setDeadline(e.target.value)} className="ml-2 min-h-11 max-w-full bg-vlak p-2"/></label>
      <button disabled={!schrijven} className="min-h-11 text-accent" onClick={()=>{try{voorstel(nieuwFeit("aanpak","Deadlinevoorstel voor: "+plan.actie.tekst.slice(0,1300),plan.actie.bron,{doel:plan.actie.doel,vervangt:plan.actie.sleutel,stappen:plan.actie.stappen,uiterlijk:nederlandseInstant(deadline)}));}catch(e){setFout((e as Error).message);}}}>Deadline als nieuwe aanpakversie voorbereiden</button>
      <button className="min-h-11 text-accent" onClick={()=>{try{setRijen(tijdVoorstellen(gesprek,plan,feiten,ik,staat?.data.afspraken??[]));setFout("");}catch(e){setFout((e as Error).message);}}}>Wanneer past deze aanpak?</button>
    </>}
    {rijen?.map(r=><article key={r.stap.id} className="rounded-xl bg-vlak p-3">
      <p className="font-medium">{r.stap.titel} · {r.persoon?personen.get(r.persoon)??"andere deelnemer":"nog toewijzen"}</p>
      {r.van&&r.tot&&<p>{toon(r.van)} – {toon(r.tot)}</p>}<p className="text-sm">{r.reden}</p>
      {r.voorwaardelijk&&<p className="text-sm">Voorwaardelijk: een voorganger is nog niet bevestigd ingepland.</p>}
      {plan&&r.persoon===ik&&r.van&&r.tot&&!r.afspraak&&!r.voorwaardelijk&&r.reden.startsWith("Voorstel")&&staat&&setData&&<button className="min-h-11 text-accent" disabled={!!pending||bezig}
        onClick={()=>setPending({opdracht:crypto.randomUUID(),gesprek,aanpak:plan.actie.sleutel,stap:r.stap.id,van:r.van!,tot:r.tot!})}>Eigen agendavoorstel controleren</button>}
      {plan&&r.afspraak&&r.van&&r.tot&&schrijven&&<button className="min-h-11 text-accent" onClick={()=>voorstel(nieuwFeit("staptijd",`Mijn eigen tijdvak voor ${r.stap.titel}: ${toon(r.van!)} – ${toon(r.tot!)}.`,{soort:"eigen"},{doel:plan.actie.sleutel,stap:r.stap.id,van:r.van,tot:r.tot,afspraak:Number(r.afspraak!.id)}))}>Bevestigde eigen tijd apart delen met project</button>}
    </article>)}
    {pending&&<div className="rounded-xl border border-lijn p-3"><p>Vastleggen in je eigen agenda: {toon(pending.van)} – {toon(pending.tot)}. Projectregels en appagenda worden opnieuw gecontroleerd. Er worden geen uitnodigingen verstuurd.</p>
      <button disabled={bezig} className="min-h-11 text-accent" onClick={async()=>{
        if(slot.current||!setData)return;slot.current=true;setBezig(true);setFout("");const sessie=huidigeSessie();
        try{const vers=await projectRegelsVers(gesprek,false);if(huidigeSessie()!==sessie)throw new Error("Account gewijzigd.");
          const g=await bijwerken(g=>{tijdVastleggen(g,pending,projectFeiten(vers.regels),ik);});
          if(huidigeSessie()===sessie){setData(g);setPending(null);setRijen(null);setMelding("Eigen afspraak bevestigd opgeslagen. Deel de tijd desgewenst apart met het project.");}
        }catch(e){setFout((e as Error).message+" Opslag is niet bevestigd; dezelfde opdracht blijft behouden.");}finally{slot.current=false;setBezig(false);}
      }}>Bevestig eigen agenda</button><button disabled={bezig} className="min-h-11 px-3" onClick={()=>setPending(null)}>Sluiten zonder terugdraaien</button>
    </div>}
  </section>;
}

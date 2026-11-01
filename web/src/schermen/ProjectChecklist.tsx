import { useState } from "react";
import { actueleAanpakken } from "../lib/projectplan";
import { checklistOverzicht, checklistStem, checklistStap } from "../lib/projectchecklist";
import type { Feit, ProjectActie } from "../lib/projectregie";

type Props={feiten:Feit[];ik:number;leden:number[];namen:Map<number,string>;schrijven:boolean;
  voorstel:(a:ProjectActie)=>void; naarAanpak:(doel:string)=>void};
export default function ProjectChecklist({feiten,ik,leden,namen,schrijven,voorstel,naarAanpak}:Props) {
  const [fout,setFout]=useState("");
  const [uitleg,setUitleg]=useState("");
  const doelen=feiten.filter(f=>["actie","besluit","vraag"].includes(f.actie.soort) && !f.actie.doel);
  const plannen=doelen.flatMap(d=>actueleAanpakken(d.actie.sleutel,feiten).map(plan=>({doel:d,plan})));
  function bereid(maak:()=>ProjectActie) {try{voorstel(maak());setFout("");}catch(e){setFout((e as Error).message);}}
  return <section aria-label="Projectchecklists" className="space-y-3">
    <p className="text-sm text-rustig">Checklists gebruiken bestaande projectaanpakken en projectberichten. Elke wijziging wordt eerst bevestigd, daarna veilig gedeeld en blijft zichtbaar in de projectgeschiedenis.</p>
    {fout&&<p role="alert" className="text-sm">{fout}</p>}
    {!doelen.length&&<p>Maak eerst een doel of voorstel bij Toevoegen.</p>}
    {doelen.map(doel=><div key={doel.actie.sleutel} className="rounded-xl border border-lijn p-3">
      <div className="font-medium">{doel.actie.tekst}</div>
      {schrijven&&<button className="min-h-11 text-accent" onClick={()=>naarAanpak(doel.actie.sleutel)}>Checklist maken of wijzigen</button>}
    </div>)}
    {!plannen.length&&doelen.length>0&&<p className="text-sm text-rustig">Maak een aanpak met stappen bij een van de doelen. Dit is automatisch de bijbehorende checklist.</p>}
    {plannen.map(({doel,plan})=>{const r=checklistOverzicht(plan,feiten,leden);
      return <article key={plan.actie.sleutel} className="rounded-2xl border border-lijn p-3 space-y-3">
        <h4 className="font-semibold">Checklist: {doel.actie.tekst}</h4>
        <p className="text-sm">{r.klaar} van {r.stappen.length} klaar · {r.voortgang}%</p>
        <progress aria-label="Checklistvoortgang" value={r.klaar} max={r.stappen.length||1} className="w-full"/>
        <p className="text-sm">{r.afgewezen?"Afgewezen — wijzig het voorstel of vraag opnieuw akkoord.":r.goedgekeurd?"Goedgekeurd door alle actieve deelnemers.":`Wacht op akkoord: ${r.wachtOp.map(id=>namen.get(id)??`deelnemer ${id}`).join(", ")||"geen, maar niet iedereen heeft ingestemd"}`}</p>
        {schrijven&&leden.includes(ik)&&<div className="flex flex-wrap gap-2">
          <button className="min-h-11 rounded-xl bg-vlak px-3" onClick={()=>bereid(()=>checklistStem(plan,feiten,ik,leden,true))}>Akkoord</button>
          <button className="min-h-11 rounded-xl bg-vlak px-3" onClick={()=>bereid(()=>checklistStem(plan,feiten,ik,leden,false))}>Afwijzen of intrekken</button>
        </div>}
        <label className="block text-sm">Toelichting bij blokkade
          <input value={uitleg} maxLength={500} onChange={e=>setUitleg(e.target.value)} className="mt-1 w-full rounded-xl bg-vlak p-2" placeholder="Waarom is deze stap geblokkeerd?"/>
        </label>
        {r.stappen.map(({stap,status,wachtOp})=><div key={stap.id} className="border-t border-lijn pt-3">
          <label className="flex items-start gap-2">
            <input type="checkbox" aria-label={`Stap afronden: ${stap.titel}`} checked={status==="klaar"}
              disabled={!schrijven||!r.goedgekeurd||(plan.afzender!==ik&&stap.eigenaar!==ik)||wachtOp.length>0}
              onChange={e=>bereid(()=>checklistStap(plan,stap.id,feiten,ik,leden,e.target.checked?"klaar":"te_doen"))}/>
            <span className="font-medium">{stap.titel}</span>
          </label>
          <p className="text-sm text-rustig">Klaar als: {stap.klaarAls}</p>
          <p className="text-xs text-rustig">Verantwoordelijke: {stap.eigenaar?namen.get(stap.eigenaar)??"Voormalige deelnemer":"Nog niet toegewezen"} · {status.replace("_"," ")}</p>
          {wachtOp.length>0&&<p className="text-xs">Wacht op {wachtOp.length} voorafgaande stap(pen).</p>}
          {schrijven&&r.goedgekeurd&&(plan.afzender===ik||stap.eigenaar===ik)&&<div className="flex flex-wrap gap-2">
            <button className="min-h-11 text-accent" disabled={!!wachtOp.length} onClick={()=>bereid(()=>checklistStap(plan,stap.id,feiten,ik,leden,"bezig"))}>Bezig</button>
            <button className="min-h-11 text-accent" disabled={!uitleg.trim()} onClick={()=>bereid(()=>checklistStap(plan,stap.id,feiten,ik,leden,"vast",uitleg))}>Blokkade</button>
          </div>}
        </div>)}
      </article>;
    })}
  </section>;
}

import { useState } from "react";
import { actueleAanpakken, volgendeStappen } from "../lib/projectplan";
import { stapStatusVoorstel } from "../lib/projectwerk";
import type { Feit, ProjectActie } from "../lib/projectregie";
const KOLOMMEN=[["te_doen","Te doen"],["bezig","Bezig"],["vast","Geblokkeerd"],["klaar","Klaar"]] as const;
export default function ProjectBord({feiten,ik,namen,doelVoorstel,schrijven,voorstel}:{feiten:Feit[];ik:number;namen:Map<number,string>;doelVoorstel?:string;schrijven:boolean;voorstel:(a:ProjectActie)=>void}){
  const plannen=feiten.filter(f=>f.actie.soort==="aanpak"&&actueleAanpakken(f.actie.doel!,feiten).some(p=>p.actie.sleutel===f.actie.sleutel));
  const [id,setId]=useState(()=>{const opties=plannen.filter(p=>p.actie.doel===doelVoorstel);return opties.length===1?opties[0].actie.sleutel:"";});
  const [mijn,setMijn]=useState(false),[zoek,setZoek]=useState(""),[obstakel,setObstakel]=useState(""),[fout,setFout]=useState("");
  const plan=plannen.find(p=>p.actie.sleutel===id),rijen=plan?volgendeStappen(plan,feiten).filter(r=>(!mijn||r.stap.eigenaar===ik)&&`${r.stap.titel} ${r.stap.klaarAls}`.toLocaleLowerCase("nl").includes(zoek.trim().toLocaleLowerCase("nl"))):[];
  return <section aria-label="Projecttakenbord" className="flex flex-col gap-3"><p>Dezelfde bevestigde stappen als Hoe. Statuswijzigingen zijn eerst voorstellen; rechten en voorgangers worden vóór delen opnieuw gecontroleerd.</p>
    <label>Aanpak op het bord<select value={id} onChange={e=>{setId(e.target.value);setFout("");}} className="min-h-11 w-full bg-vlak p-2"><option value="">Kies een actuele aanpak</option>{plannen.map(p=><option key={p.actie.sleutel} value={p.actie.sleutel}>#{p.bericht} · {feiten.find(f=>f.actie.sleutel===p.actie.doel)?.actie.tekst.slice(0,100)}</option>)}</select></label>
    {plan&&<p className="text-sm">Bron: aanpakbericht #{plan.bericht} · {namen.get(plan.afzender)??"deelnemer"}. Waarom: {feiten.find(f=>f.actie.sleutel===plan.actie.doel)?.actie.tekst}</p>}
    <label>Zoek in stappen<input type="search" value={zoek} onChange={e=>setZoek(e.target.value)} className="min-h-11 w-full bg-vlak p-2"/></label>
    <label><input type="checkbox" checked={mijn} onChange={e=>setMijn(e.target.checked)}/> Alleen mijn stappen</label>
    <label>Obstakel bij een statusvoorstel<textarea maxLength={1000} value={obstakel} onChange={e=>setObstakel(e.target.value)} className="w-full rounded-xl bg-vlak p-2"/></label>
    {fout&&<p role="alert">{fout}</p>}
    <div className="grid gap-3 sm:grid-cols-2">{KOLOMMEN.map(([status,label])=><section key={status} aria-label={label} className="rounded-xl bg-vlak p-3"><h4 className="font-semibold">{label} ({rijen.filter(r=>r.status===status).length})</h4>
      {rijen.filter(r=>r.status===status).map(r=><article key={r.stap.id} className="mt-2 rounded-xl border border-lijn p-2"><p className="font-medium">{r.stap.titel}</p><p className="text-sm">{r.stap.eigenaar?namen.get(r.stap.eigenaar)??"voormalige deelnemer":"Nog toewijzen"} · {r.stap.minuten} minuten</p><p className="text-sm">Klaar als: {r.stap.klaarAls}</p>
        {!!r.wachtOp.length&&<p className="text-sm">Wacht op: {r.wachtOp.map(id=>plan?.actie.stappen?.find(s=>s.id===id)?.titel??"ontbrekende stap").join(", ")}</p>}
        {schrijven&&plan&&(plan.afzender===ik||r.stap.eigenaar===ik)&&<div className="flex flex-wrap gap-2">{KOLOMMEN.filter(([keuze])=>keuze!==status).map(([keuze,naam])=><button key={keuze} disabled={["bezig","klaar"].includes(keuze)&&!!r.wachtOp.length} className="min-h-11 text-accent" onClick={()=>{try{voorstel(stapStatusVoorstel(plan,r.stap.id,feiten,ik,keuze,obstakel));setFout("");}catch(e){setFout((e as Error).message);}}}>{keuze==="klaar"?"Resultaat bevestigen":`Naar ${naam.toLocaleLowerCase("nl")} voorbereiden`}</button>)}</div>}
      </article>)}
    </section>)}</div>
  </section>;
}

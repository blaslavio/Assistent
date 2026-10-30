import { useState } from "react";
import { actueleAanpakken, stapStand, volgendeStappen } from "../lib/projectplan";
import { isAfgerond, type Feit } from "../lib/projectregie";
/** Eén leesbaar overzicht, zonder nieuwe opgeslagen of afgeleide projectfeiten. */
export default function ProjectKompas({feiten,namen,ik,vandaag,open}:{feiten:Feit[];namen:Map<number,string>;ik:number;vandaag:boolean;open:(deel:string,doel:string)=>void}) {
  const [alle,setAlle]=useState(false);
  const doelen=feiten.filter(f=>["actie","besluit","vraag"].includes(f.actie.soort)&&!isAfgerond(f,feiten))
    .filter(f=>!vandaag || (f.actie.soort==="actie"&&(!f.actie.verantwoordelijke||f.actie.verantwoordelijke===ik)) || actueleAanpakken(f.actie.sleutel,feiten).some(p=>volgendeStappen(p,feiten).some(r=>r.stap.eigenaar===ik&&r.status!=="klaar")));
  return <section className="mb-4 rounded-xl border border-lijn p-3 break-words" aria-label="Projectkompas">
    <h4 className="font-semibold">Wat is de volgende stap?</h4>
    <p className="text-sm text-rustig">Alleen bevestigde projectinformatie. Tijd en voorwaarden controleer je apart voordat je iets uitvoert.</p>
    {!doelen.length&&<p>Begin met een bevestigd projectdoel.</p>}
    {(alle?doelen:doelen.slice(0,3)).map(doel=>{
      const plannen=actueleAanpakken(doel.actie.sleutel,feiten);
      const openRijen=plannen.length===1?volgendeStappen(plannen[0],feiten):[];
      const compleet=openRijen.length>0&&openRijen.every(r=>r.status==="klaar");
      const verder=openRijen.some(r=>r.uitvoerbaar&&r.stap.eigenaar&&(!vandaag||r.stap.eigenaar===ik));
      const bestemming=plannen.length===1&&verder?"Bord":"Hoe";
      const knop=plannen.length>1?"Bespreek de aanpakken":!plannen.length?"Maak een aanpak":compleet?"Resultaat bekijken":verder?"Volgende stap bekijken":"Aanpak bijstellen";
      return <div key={doel.actie.sleutel} className="mt-3 border-t border-lijn pt-2">
        <p className="font-medium">Doel: {doel.actie.tekst}</p>
        {!plannen.length&&<p className="text-sm">Nog geen bevestigde aanpak. Werk de route uit bij Hoe.</p>}
        {plannen.length>1&&<p className="text-sm">{plannen.length} actuele aanpakken: bespreek eerst welke route je volgt. Er is geen route automatisch gekozen.</p>}
        {plannen.length===1&&(()=>{
          const plan=plannen[0],rijen=volgendeStappen(plan,feiten),klaar=rijen.filter(r=>r.status==="klaar").length;
          const relevant=rijen.filter(r=>r.status!=="klaar"&&(!vandaag||r.stap.eigenaar===ik));
          const vrij=relevant.filter(r=>r.uitvoerbaar),vast=relevant.filter(r=>r.status==="vast");
          const volgende=vrij.find(r=>r.status==="bezig")??vrij[0];
          return <div className="text-sm"><p>{klaar} van {rijen.length} stappen afgerond.</p>
            {plan.actie.uiterlijk&&<p>Deadline: {new Date(plan.actie.uiterlijk).toLocaleString("nl-NL",{timeZone:"Europe/Amsterdam"})}</p>}
            {klaar===rijen.length?<p>Alle stapresultaten bevestigd. Controleer of het projectdoel ook is bereikt.</p>
              :volgende?<><p>Volgende: <strong>{volgende.stap.titel}</strong> · {volgende.stap.minuten} minuten · {volgende.stap.eigenaar?namen.get(volgende.stap.eigenaar)??"deelnemer":"nog toewijzen"}.</p><p>Klaar als: {volgende.stap.klaarAls}</p></>
              :<p>{vandaag&&!relevant.length?"Geen open stappen aan jou toegewezen.":"Eerst een blokkade of afhankelijkheid oplossen."}</p>}
            {vast.map(r=><p key={r.stap.id}>Blokkade bij {r.stap.titel}: {stapStand(plan,r.stap,feiten)?.actie.tekst}. {r.stap.alternatief&&`Mogelijke andere route: ${r.stap.alternatief}`}</p>)}
            {!volgende&&relevant.filter(r=>r.wachtOp.length>0).slice(0,3).map(r=><p key={r.stap.id}>{r.stap.titel} wacht op: {r.wachtOp.map(id=>plan.actie.stappen?.find(s=>s.id===id)?.titel??"ontbrekende stap").join(", ")}.</p>)}
          </div>;
        })()}
        <button className="mt-2 min-h-11 rounded-xl bg-accent px-3 text-white" onClick={()=>open(bestemming,doel.actie.sleutel)}>{knop}</button>
        <details className="mt-1"><summary className="min-h-11 cursor-pointer text-sm text-rustig">Meer bij dit doel</summary><div className="flex flex-wrap gap-2"><button className="min-h-11 text-accent" onClick={()=>open("Hoe",doel.actie.sleutel)}>Aanpak bekijken</button><button className="min-h-11 text-accent" onClick={()=>open("Wanneer",doel.actie.sleutel)}>Tijd controleren</button><button className="min-h-11 text-accent" onClick={()=>open("Als",doel.actie.sleutel)}>Voorwaarden controleren</button></div></details>
      </div>;
    })}
    {doelen.length>3&&<button className="min-h-11 text-accent" aria-expanded={alle} onClick={()=>setAlle(!alle)}>{alle?"Toon drie doelen":`Bekijk alle ${doelen.length} doelen`}</button>}
  </section>;
}

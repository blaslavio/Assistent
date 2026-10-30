import { useEffect, useMemo, useRef, useState } from "react";
import { bijwerken, huidigeSessie, type Gegevens } from "../api";
import { afstandTekst, zoekPlek, type Reiswijze, type KaartWinkel, type Punt } from "../lib/kaart";
import { bewaarPlek, controleerTijden, leesPlekken, schatReistijd, planAfstand, routeBriefje, tijdscontrole, vergelijkVolgordes, verwijderPlek, voegStopToe,
  type Plek, type Stop, type Tijden } from "../lib/kaartkompas";
import type { Staat } from "../App";

export const plekOpKaart = (p: Plek): KaartWinkel => ({ ...p, naam:p.naam, soort:"Eigen privéplek", app:false, prive:true, plekId:p.id });
function alsStop(w:KaartWinkel):Stop {
  return {id:w.plekId??`${w.winkelAdres??"kaart"}:${w.lat.toFixed(6)}:${w.lon.toFixed(6)}:${w.naam.slice(0,80)}`,
    naam:w.naam.trim().slice(0,120), lat:w.lat, lon:w.lon, prive:!!w.prive};
}
const knop="min-h-11 rounded-full bg-vlak px-4 text-sm font-medium disabled:opacity-40";
const foutTekst=(e:unknown)=>e instanceof Error?e.message:"Bewaren is nog niet bevestigd. Probeer opnieuw.";
export default function KaartKompas({staat,setData,gekozen,vanaf,kies,reiswijze}:{reiswijze:Reiswijze;staat:Staat;setData:(g:Gegevens)=>void;gekozen:KaartWinkel|null;vanaf:Punt|null;kies:(p:KaartWinkel)=>void}) {
  const [stops,setStops]=useState<Stop[]>([]),[start,setStart]=useState<Punt|null>(null),[rond,setRond]=useState(false);
  const [voorstel,setVoorstel]=useState<ReturnType<typeof vergelijkVolgordes>|null>(null);
  const [nu,setNu]=useState(Date.now),[bezoek,setBezoek]=useState(15);
  const [adresPoging,setAdresPoging]=useState(0);
  const [toegestaanAdres,setToegestaanAdres]=useState<string|null>(null),[volgendePlek,setVolgendePlek]=useState<Punt|null>(null),[adresFout,setAdresFout]=useState("");
  const [naam,setNaam]=useState(""),[bewaar,setBewaar]=useState(false),[fout,setFout]=useState(""),[melding,setMelding]=useState("");
  const [bezig,setBezig]=useState(false),slot=useRef(false);
  const [opdracht,setOpdracht]=useState<{plek:Plek;basis:Plek[]}|null>(null),[weg,setWeg]=useState<Plek|null>(null);
  const [deelPrive,setDeelPrive]=useState(false),[briefOpen,setBriefOpen]=useState(false);
  const vertrek=start??vanaf;
  useEffect(()=>{const t=setInterval(()=>setNu(Date.now()),30_000);return()=>clearInterval(t);},[]);
  useEffect(()=>{setVoorstel(null);},[stops,vertrek?.lat,vertrek?.lon,rond]);
  const plekken=useMemo(()=>{try{return{lijst:leesPlekken(staat.data),fout:""};}catch(e){return{lijst:[],fout:foutTekst(e)};}},[staat.data]);
  const agendaControle=useMemo(()=>tijdscontrole(staat.data.afspraken,nu,{heen:0,bezoek,verder:0,buffer:10}),[staat.data.afspraken,nu,bezoek]);
  const volgende=agendaControle.volgende;
  useEffect(()=>{
    let actief=true;setVolgendePlek(null);setAdresFout("");
    if(!volgende?.locatie||toegestaanAdres!==volgende.locatie)return;
    zoekPlek(volgende.locatie).then(p=>{if(actief){setVolgendePlek(p);if(!p)setAdresFout("De afspraaklocatie is niet gevonden. Er wordt geen reistijd voor verzonnen.");}})
      .catch(()=>{if(actief)setAdresFout("De afspraaklocatie kon niet worden opgezocht. Probeer opnieuw.");});
    return()=>{actief=false;};
  },[volgende?.id,volgende?.locatie,toegestaanAdres,adresPoging]);
  const heen=vertrek&&gekozen?schatReistijd(vertrek,gekozen,reiswijze):null;
  const verder=gekozen&&volgendePlek&&toegestaanAdres===volgende?.locatie?schatReistijd(gekozen,volgendePlek,reiswijze):null;
  const tijdenVoorstel:Tijden|undefined=heen&&verder?{heen:heen.hoog,bezoek,verder:verder.hoog,buffer:Math.max(10,Math.ceil((heen.hoog+verder.hoog)*.1))}:undefined;
  let tijden:Tijden|undefined;try{if(tijdenVoorstel){controleerTijden(tijdenVoorstel);tijden=tijdenVoorstel;}}catch{/* Te grote of ongeldige indicaties geven geen passende afspraak. */}
  let tijd=agendaControle;
  if(volgende){tijd=tijden?tijdscontrole(staat.data.afspraken,nu,tijden):{status:"onbekend",uitleg:!vertrek?"Kies een vertrekpunt of gebruik Bij mij; reistijden worden daarna automatisch geschat.":!gekozen?"Kies een bestemming op de kaart.":"Voor de tijdscontrole is ook de locatie van je volgende afspraak nodig."};}
  const brief=routeBriefje(stops,tijden,deelPrive);
  async function schrijven(wijzig:(g:Gegevens)=>void,klaar:()=>void){
    if(slot.current)return;slot.current=true;setBezig(true);setFout("");setMelding("");const account=huidigeSessie();
    try {const g=await bijwerken(wijzig);if(huidigeSessie()!==account)return;setData(g);klaar();}
    catch(e){if(huidigeSessie()===account)setFout(foutTekst(e));}
    finally{slot.current=false;setBezig(false);}
  }
  return <section aria-label="Mijn kaartkompas" className="flex flex-col gap-3 rounded-3xl border border-lijn p-4">
    <div><h3 className="text-lg font-semibold">Mijn kaartkompas</h3><p className="mt-1 text-sm text-rustig">Verbind je stops met de tijd die je hebt. Je agenda blijft in de app.</p></div>
    {fout&&<p role="alert" className="text-sm text-red-600">{fout}</p>}{melding&&<p role="status" className="text-sm text-rustig">{melding}</p>}
    {gekozen&&<div className="flex flex-wrap gap-2">
      <button className={knop} onClick={()=>{try{setStops(voegStopToe(stops,alsStop(gekozen)));setFout("");}catch(e){setFout(foutTekst(e));}}}>Deze plek als stop</button>
      <button className={knop} onClick={()=>setStart({lat:gekozen.lat,lon:gekozen.lon})}>Vertrek vanaf deze plek</button>
      <button className={knop} onClick={()=>{setNaam(gekozen.naam.slice(0,120));setBewaar(true);setOpdracht(null);}}>Bewaar privéplek</button>
    </div>}
    <details><summary className="min-h-11 cursor-pointer py-3 font-medium">Past één extra bezoek vóór mijn volgende afspraak?</summary>
      {heen?<div className="rounded-xl bg-vlak p-3 text-sm"><strong>Heenreis: ongeveer {heen.laag}–{heen.hoog} minuten</strong><p className="mt-1 text-xs text-rustig">{heen.toelichting}</p></div>
        :<p className="text-sm text-rustig">Kies je bestemming en vertrekpunt. De app schat de reistijd; je hoeft geen reistijd in te vullen.</p>}
      <p className="mt-3 text-sm">Hoe lang wil je hier blijven?</p><div className="my-2 flex flex-wrap gap-2">{[15,30,60,120].map(n=><button key={n} className={knop} aria-pressed={bezoek===n} onClick={()=>setBezoek(n)}>{n} min bezoek</button>)}</div>
      {volgende?.locatie&&toegestaanAdres!==volgende.locatie&&<div className="rounded-xl border border-lijn p-3"><p className="text-xs text-rustig">Om de tweede reis te schatten zoeken we alleen het locatieadres van je volgende afspraak op via OpenStreetMap. De titel, notities en rest van je agenda gaan niet mee.</p>
        <button className="mt-2 min-h-11 text-sm text-accent" onClick={()=>setToegestaanAdres(volgende.locatie!)}>Bereken met de afspraaklocatie</button></div>}
      {adresFout&&<p role="status" className="text-sm text-rustig">{adresFout} <button className="min-h-11 text-accent" onClick={()=>setAdresPoging(n=>n+1)}>Opnieuw schatten</button></p>}
      {verder&&<p className="mt-2 text-sm">Verder naar de afspraak: ongeveer {verder.laag}–{verder.hoog} minuten. De tijdscontrole gebruikt de ruime kant van beide schattingen plus extra buffer.</p>}
      <p className="mt-3 rounded-xl bg-vlak p-3 text-sm" role="status"><strong>{({past:"Lijkt passend volgens de schatting",krap:"Krap volgens de schatting",niet:"Past nu waarschijnlijk niet",onbekend:"Nog niet te bepalen"} as Record<string,string>)[tijd.status]}</strong><br/>{tijd.uitleg}</p>
      <p className="mt-2 text-xs text-rustig">Geen garantie: controleer je echte route en actuele reistijd in je navigatie-app voordat je vertrekt. Agenda en bezoek worden niet aangepast.</p>
    </details>
    <details><summary className="min-h-11 cursor-pointer py-3 font-medium">Stops combineren ({stops.length}/5)</summary>
      <p className="text-xs text-rustig">Vergelijking op hemelsbrede afstand. Wegen, verkeer, openingstijden en bereikbaarheid kunnen een andere volgorde beter maken.</p>
      {!vertrek&&<p className="mt-2 text-sm">Kies een vertrekpunt op de kaart of gebruik Bij mij. Utrecht is alleen het beginbeeld van de kaart.</p>}
      {start&&<button className={knop} onClick={()=>setStart(null)}>Eigen vertrekpunt loslaten</button>}
      <ol className="my-3 flex flex-col gap-2">{stops.map((s,i)=><li key={s.id} className="flex flex-wrap items-center gap-2 rounded-2xl bg-vlak p-3"><span className="min-w-0 flex-1 text-sm">{i+1}. {s.naam}{s.prive?" · privé":""}</span>
        <button aria-label={`Stop ${i+1} omhoog`} disabled={i===0} className="min-h-11 px-3 disabled:opacity-30" onClick={()=>setStops(a=>{const b=[...a];[b[i-1],b[i]]=[b[i],b[i-1]];return b;})}>↑</button>
        <button aria-label={`Verwijder stop ${i+1}`} className="min-h-11 px-2 text-sm text-rustig" onClick={()=>setStops(a=>a.filter(p=>p.id!==s.id))}>Weg</button></li>)}</ol>
      <label className="flex gap-2 text-sm"><input type="checkbox" checked={rond} onChange={e=>setRond(e.target.checked)}/>Terug naar mijn vertrekpunt meenemen</label>
      {vertrek&&!!stops.length&&<p className="my-2 text-sm">Huidige volgorde: {afstandTekst(planAfstand(vertrek,stops,rond))} hemelsbreed.</p>}
      <button className={knop} disabled={!vertrek||stops.length<2} onClick={()=>{try{setVoorstel(vergelijkVolgordes(vertrek!,stops,rond));}catch(e){setFout(foutTekst(e));}}}>Vergelijk volgordes</button>
      {voorstel&&<div className="mt-3 rounded-xl bg-vlak p-3 text-sm"><p>{voorstel.bekeken} volgordes vergeleken. Hoogstens {afstandTekst(voorstel.besparing)} hemelsbreed korter.</p><p className="mt-2">{voorstel.stops.map(s=>s.naam).join(" → ")}</p>
        <button className="mt-2 min-h-11 text-accent" onClick={()=>setStops(voorstel.stops)}>Deze volgorde overnemen</button></div>}
      <button className={knop+" mt-3"} disabled={!stops.length} onClick={()=>setBriefOpen(v=>!v)}>Routebriefje voor chat of project</button>
      {briefOpen&&<div className="mt-3 flex flex-col gap-2"><label className="flex gap-2 text-sm"><input type="checkbox" checked={deelPrive} onChange={e=>setDeelPrive(e.target.checked)}/>Ook mijn privélabels opnemen</label>
        <textarea readOnly aria-label="Voorbeeld routebriefje" value={brief} rows={7} className="rounded-xl bg-vlak p-3 text-sm"/>
        <button className={knop} onClick={async()=>{try{await navigator.clipboard.writeText(brief);setMelding("Routebriefje gekopieerd. Kies zelf waar je het plakt.");}catch{setFout("Kopiëren lukte niet. Je kunt de tekst zelf selecteren.");}}}>Kopieer dit routebriefje</button></div>}
    </details>
    <details><summary className="min-h-11 cursor-pointer py-3 font-medium">Mijn privéplekken ({plekken.lijst.length}/30)</summary>
      <p className="text-xs text-rustig">Bewaard bij je eigen account, geen openbare winkel. Privélabels gaan niet mee naar de navigatie-app; de bestemmingcoördinaten wel.</p>
      {plekken.fout&&<p role="alert">{plekken.fout}</p>}
      <ul>{plekken.lijst.map(p=><li key={p.id} className="flex items-center gap-2 border-b border-lijn py-2"><button className="min-h-11 min-w-0 flex-1 text-left text-sm" onClick={()=>kies(plekOpKaart(p))}>{p.naam}</button><button className="min-h-11 px-2 text-sm text-rustig" onClick={()=>setWeg(p)}>Verwijder</button></li>)}</ul>
      {weg&&<div className="mt-2 rounded-xl bg-vlak p-3 text-sm"><p>Privéplek “{weg.naam}” verwijderen?</p><button disabled={bezig} className="min-h-11 pr-4 text-red-600" onClick={()=>schrijven(g=>verwijderPlek(g,weg),()=>{setWeg(null);setMelding("Privéplek verwijderd.");})}>Bevestig verwijderen</button><button disabled={bezig} className={knop} onClick={()=>setWeg(null)}>Annuleren</button></div>}
    </details>
    {bewaar&&gekozen&&<form className="flex flex-col gap-2 rounded-xl bg-vlak p-3" onSubmit={e=>{
      e.preventDefault();if(slot.current)return;
      try {const actie=opdracht??{plek:{id:crypto.randomUUID(),naam:naam.trim(),lat:gekozen.lat,lon:gekozen.lon,prive:true},basis:leesPlekken(staat.data)};bewaarPlek({...staat.data},actie.plek,actie.basis);setOpdracht(actie);schrijven(g=>bewaarPlek(g,actie.plek,actie.basis),()=>{setBewaar(false);setOpdracht(null);setMelding("Privéplek bewaard.");});}catch(err){setFout(foutTekst(err));}
    }}><label className="text-sm">Naam van je privéplek<input maxLength={120} disabled={!!opdracht} value={naam} onChange={e=>setNaam(e.target.value)} className="mt-1 h-11 w-full rounded-xl bg-white px-3 text-inkt dark:bg-black/20"/></label>
      <button disabled={bezig||!naam.trim()} className={knop}>{opdracht?"Dezelfde plek opnieuw proberen":"Plek bewaren"}</button><button type="button" disabled={bezig} className={knop} onClick={()=>{setBewaar(false);setOpdracht(null);}}>Sluiten</button></form>}
  </section>;
}

import { useRef, useState } from "react";
import type { Staat } from "../App";
import { bijwerken, gereedschapAdres, huidigeSessie } from "../api";
import { projectRegelsVers } from "../lib/chat";
import { alsRegel, bewaarAlsRegel, beoordeelAls, leesAlsRegels, type AlsRegel, type Conditie, type DienstBewijs, type Vervolg } from "../lib/projectals";
import { eigenDienstBewijzen } from "../lib/projectdiensten";
import { projectFeiten, type Feit } from "../lib/projectregie";
import { actueleAanpakken } from "../lib/projectplan";
import { nederlandseInstant } from "../lib/projecttijd";

export default function ProjectAls({gesprek,feiten,staat,setData,planning}:{gesprek:number;feiten:Feit[];staat?:Staat;setData?:(g:Staat["data"])=>void;planning:()=>void}) {
  const [waarom,setWaarom]=useState("");const [aanpak,setAanpak]=useState("");const [modus,setModus]=useState<"alle"|"een">("alle");
  const [voorwaarden,setVoorwaarden]=useState<Conditie[]>([{soort:"betaling_bevestigd",bron:""}]);const [vervolg,setVervolg]=useState<Vervolg>("planning");
  const [pending,setPending]=useState<AlsRegel|null>(null);const [fout,setFout]=useState("");const [bezig,setBezig]=useState(false);const slot=useRef(false);
  const [bewijzen,setBewijzen]=useState<DienstBewijs[]>([]);const [vers,setVers]=useState<Feit[]>([]);const [gecontroleerd,setGecontroleerd]=useState(false);
  const [concept,setConcept]=useState("");const [melding,setMelding]=useState("");
  let regels:AlsRegel[]=[];let leesfout="";try{if(staat)regels=leesAlsRegels(staat.data,gesprek);}catch(e){leesfout=(e as Error).message;}
  const doelen=feiten.filter(f=>["actie","besluit","vraag"].includes(f.actie.soort));
  async function controleer(){
    if(slot.current)return;slot.current=true;setBezig(true);setFout("");setGecontroleerd(false);setBewijzen([]);const sessie=huidigeSessie();
    try{const [p,d]=await Promise.all([projectRegelsVers(gesprek,false),eigenDienstBewijzen()]);if(huidigeSessie()!==sessie)return;
      setVers(projectFeiten(p.regels));setBewijzen(d.bewijzen);setGecontroleerd(true);setMelding(d.fouten.join(" ")||"Actuele eigen dienststatus opgehaald. Niet gedeeld met het project.");
    }catch(e){if(huidigeSessie()===sessie)setFout((e as Error).message);}finally{slot.current=false;setBezig(false);}
  }
  const wijzig=(i:number,c:Partial<Conditie>)=>setVoorwaarden(v=>v.map((x,j)=>i===j?{...x,...c}:x));
  return <section aria-label="Voorwaardelijke projectacties" className="flex flex-col gap-3">
    <p>Persoonlijke als-regels worden alleen op jouw verzoek gecontroleerd. Ontbrekende of verouderde informatie blijft onbekend. Een voldane regel bereidt uitsluitend een vervolg voor.</p>
    {(fout||leesfout)&&<p role="alert">{fout||leesfout}</p>}{melding&&<p role="status">{melding}</p>}
    <form className="flex flex-col gap-3" onSubmit={e=>{e.preventDefault();try{setPending(alsRegel({id:crypto.randomUUID(),gesprek,waarom,...(aanpak?{aanpak}:{}),modus,voorwaarden,vervolg}));setFout("");}catch(e){setFout((e as Error).message);}}}>
      <label>Waarom<select required disabled={!!pending} value={waarom} onChange={e=>{setWaarom(e.target.value);setAanpak("");}} className="min-h-11 w-full bg-vlak p-2"><option value="">Kies bevestigd projectdoel</option>{doelen.map(f=><option key={f.actie.sleutel} value={f.actie.sleutel}>{f.actie.tekst.slice(0,100)}</option>)}</select></label>
      <label>Aanpak<select disabled={!!pending} value={aanpak} onChange={e=>setAanpak(e.target.value)} className="min-h-11 w-full bg-vlak p-2"><option value="">Niet gekoppeld aan een stap</option>{actueleAanpakken(waarom,feiten).map(f=><option key={f.actie.sleutel} value={f.actie.sleutel}>Aanpak #{f.bericht}</option>)}</select></label>
      <label>Combinatie<select disabled={!!pending} value={modus} onChange={e=>setModus(e.target.value as "alle"|"een")} className="min-h-11 bg-vlak p-2"><option value="alle">Alle voorwaarden</option><option value="een">Minstens één voorwaarde</option></select></label>
      {voorwaarden.map((c,i)=><fieldset disabled={!!pending} key={i} className="rounded-xl border border-lijn p-2"><legend>Voorwaarde {i+1}</legend>
        <select aria-label={`Soort voorwaarde ${i+1}`} value={c.soort} onChange={e=>wijzig(i,{soort:e.target.value as Conditie["soort"],bron:""})} className="min-h-11 w-full bg-vlak p-2"><option value="betaling_bevestigd">Appbetaling bevestigd</option><option value="boeking_bevestigd">Boeking bevestigd</option><option value="reservering_bevestigd">Reservering bevestigd</option><option value="stap_klaar">Stapresultaat bevestigd</option><option value="tijd_bereikt">Tijdstip bereikt</option></select>
        {c.soort==="stap_klaar"?<select aria-label={`Bron voorwaarde ${i+1}`} value={c.bron} onChange={e=>wijzig(i,{bron:e.target.value})} className="min-h-11 w-full bg-vlak p-2"><option value="">Kies stap uit aanpak</option>{feiten.find(f=>f.actie.sleutel===aanpak)?.actie.stappen?.map(s=><option key={s.id} value={s.id}>{s.titel}</option>)}</select>
          :c.soort==="tijd_bereikt"?<input aria-label={`Tijd voorwaarde ${i+1}`} type="datetime-local" className="min-h-11 max-w-full bg-vlak p-2" onChange={e=>{try{wijzig(i,{bron:nederlandseInstant(e.target.value)});setFout("");}catch(e){wijzig(i,{bron:""});setFout((e as Error).message);}}}/>
          :<label>Eigen registratie-ID<input required inputMode="numeric" value={c.bron} onChange={e=>wijzig(i,{bron:e.target.value})} className="min-h-11 w-full bg-vlak p-2"/></label>}
        {voorwaarden.length>1&&<button type="button" className="min-h-11 text-accent" onClick={()=>setVoorwaarden(v=>v.filter((_,j)=>i!==j))}>Voorwaarde verwijderen</button>}
      </fieldset>)}
      <button type="button" disabled={!!pending||voorwaarden.length>=5} className="min-h-11 text-accent" onClick={()=>setVoorwaarden(v=>[...v,{soort:"betaling_bevestigd",bron:""}])}>Voorwaarde toevoegen</button>
      <label>Vervolg<select disabled={!!pending} value={vervolg} onChange={e=>setVervolg(e.target.value as Vervolg)} className="min-h-11 w-full bg-vlak p-2"><option value="planning">Planning controleren</option><option value="betaling">Bestellingen en betalingen openen</option><option value="boeking">Boekingsformulier openen</option><option value="reservering">Reserveringsformulier openen</option><option value="chatconcept">Chatconcept voorbereiden</option><option value="handmatig">Handmatige vervolgcheck</option></select></label>
      <button disabled={!staat||!setData||!!pending||!!leesfout} className="min-h-11 text-accent">Persoonlijke regel controleren</button>
    </form>
    {pending&&<div className="rounded-xl border border-lijn p-3"><p>Bewaar voor jezelf: {doelen.find(f=>f.actie.sleutel===pending.waarom)?.actie.tekst}</p><p>{pending.modus==="alle"?"Alle":"Minstens één"} voorwaarden:</p><ul>{pending.voorwaarden.map((c,i)=><li key={i}>{c.soort} · {c.bron}</li>)}</ul><p>Vervolg: {pending.vervolg}. Niets wordt betaald, geboekt of verstuurd.</p>
      <button disabled={bezig} className="min-h-11 text-accent" onClick={async()=>{if(slot.current||!setData)return;slot.current=true;setBezig(true);const sessie=huidigeSessie();try{const g=await bijwerken(g=>bewaarAlsRegel(g,pending));if(huidigeSessie()===sessie){setData(g);setPending(null);setMelding("Persoonlijke regel bevestigd opgeslagen.");}}catch(e){if(huidigeSessie()===sessie)setFout((e as Error).message);}finally{slot.current=false;setBezig(false);}}}>Bevestig persoonlijke regel</button><button disabled={bezig} className="min-h-11 px-3" onClick={()=>setPending(null)}>Sluiten</button>
    </div>}
    <button disabled={bezig||!regels.length} className="min-h-11 text-accent" onClick={controleer}>Controleer voorwaarden met eigen actuele diensten</button>
    {regels.map(r=>{const b=beoordeelAls(r,gecontroleerd?vers:feiten,gecontroleerd?bewijzen:[]);return <article key={r.id} className="rounded-xl bg-vlak p-3"><p className="font-medium">{doelen.find(f=>f.actie.sleutel===r.waarom)?.actie.tekst??"Projectdoel ontbreekt"}</p><p>{gecontroleerd?b.status:"Nog niet gecontroleerd"} · {r.vervolg}</p><ul className="text-sm">{b.uitleg.map((x,i)=><li key={i}>{x}</li>)}</ul>
      <button disabled={!gecontroleerd||b.status!=="voldaan"||bezig} className="min-h-11 text-accent" onClick={()=>{
        if(beoordeelAls(r,vers,bewijzen).status!=="voldaan"){setFout("Controleer de voorwaarden opnieuw; dienstinformatie kan zijn verlopen.");return;}
        if(r.vervolg==="planning")planning();
        else if(r.vervolg==="betaling")window.dispatchEvent(new CustomEvent("assistent-projectdienst",{detail:{gesprek,dienst:"betaling"}}));
        else if(r.vervolg==="boeking"||r.vervolg==="reservering")window.location.assign(gereedschapAdres(r.vervolg==="boeking"?"boekingen":"buurt"));
        else if(r.vervolg==="chatconcept")setConcept(`Vervolg voor: ${doelen.find(f=>f.actie.sleutel===r.waarom)?.actie.tekst??"projectdoel"}`);
        else setMelding("Voorwaarden voldaan. Controleer verantwoordelijke, toestemming, kosten en beschikbaarheid voordat je zelf het vervolg uitvoert.");
      }}>Vervolg voorbereiden</button>
    </article>;})}
    {concept&&<div><label>Chatconcept<textarea maxLength={1500} value={concept} onChange={e=>setConcept(e.target.value)} className="w-full bg-vlak p-3"/></label><button className="min-h-11 text-accent" onClick={()=>{window.dispatchEvent(new CustomEvent("assistent-chatconcept",{detail:{gesprek,tekst:concept}}));setMelding("Concept aangeboden aan de chatinvoer. Controleer en verstuur zelf; bestaande invoer wordt niet overschreven.");setConcept("");}}>Zet concept in chatinvoer</button></div>}
  </section>;
}

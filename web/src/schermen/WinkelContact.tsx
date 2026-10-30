import { useEffect, useState } from "react";
import { contactBewaren, mijnContact, standaardContact, CONTACT_BETALINGEN, type WinkelContact } from "../lib/winkelcontact";
import { instellingenOpenen } from "../lib/naar";
import { Onderblad } from "./Onderblad";
export default function WinkelContactInstellen({ sluit }: { sluit: () => void }) {
  const [v,setV] = useState<WinkelContact | null>(null),[fout,setFout] = useState(""),[bezig,setBezig] = useState(false);
  const [poging,setPoging] = useState(0);
  useEffect(() => { let actief=true; mijnContact().then(c => {if(actief)setV(c);}).catch(() => {if(actief)setFout("Deze winkelopties zijn nu niet beschikbaar. Je bestaande winkel blijft beschikbaar. Probeer het later opnieuw.");});return()=>{actief=false;}; },[poging]);
  const zet = (c: Partial<WinkelContact>) => setV(o => ({ ...standaardContact(),...o,...c }));
  return <Onderblad titel="Betalen en contact" sluit={sluit}>
    <section className="flex flex-col gap-2"><h3 className="font-semibold">Online betalen</h3><p className="text-sm text-rustig">De webshopcheckout loopt via de app en Stripe. Beschikbare betaalmethoden worden door de betaaldienst bepaald.</p>
      <button onClick={() => { sluit(); instellingenOpenen("betalingen"); }} className="min-h-11 rounded-2xl bg-accent px-4 text-white">Betalingen instellen</button></section>
    {fout && <p role="alert">{fout}</p>}
    {!v ? <button onClick={()=>{setFout("");setPoging(n=>n+1);}} className="min-h-11 text-accent">Contactopties opnieuw ophalen</button> : <>
      <p className="text-sm text-rustig">Alleen de contactgegevens die je hier invult, worden zichtbaar voor bezoekers van je open winkel.</p>
      <label className="flex gap-3"><input type="checkbox" checked={v.chat} onChange={e=>zet({chat:e.target.checked})}/>Contact via app-chat</label>
      {([['email','E-mail'],['telefoon','Telefoon'],['whatsapp','WhatsApp met landcode'],['website','Website (https)']] as const).map(([key,label])=><label key={key} className="flex flex-col gap-1 text-sm">{label}<input value={v[key]} onChange={e=>zet({[key]:e.target.value})} placeholder="Leeg laten om te verbergen" className="h-12 rounded-2xl bg-vlak px-3"/></label>)}
      <fieldset className="flex flex-col gap-3"><legend className="mb-2 font-semibold">Andere betaalafspraken via contact</legend>
        {Object.entries(CONTACT_BETALINGEN).map(([key,label])=><label key={key} className="flex gap-3"><input type="checkbox" checked={v.betaalwijzen.includes(key)} onChange={e=>zet({betaalwijzen:e.target.checked?[...v.betaalwijzen,key]:v.betaalwijzen.filter(x=>x!==key)})}/>{label}</label>)}
        <p className="text-sm text-rustig">Deze opties zijn afspraken met de verkoper, buiten de webshopcheckout. Betalen buiten de app heeft geen kopersbescherming van de app.</p>
      </fieldset>
      <button disabled={bezig} onClick={async()=>{setBezig(true);setFout("");try{await contactBewaren(v);sluit();}catch(e){setFout(e instanceof Error?e.message:"Bewaren lukte niet.");}finally{setBezig(false);}}} className="min-h-12 rounded-2xl bg-accent px-4 text-white disabled:opacity-50">{bezig?"Bewaren…":"Contact en betaalafspraken bewaren"}</button>
    </>}
  </Onderblad>;
}

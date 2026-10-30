import { useEffect, useState } from "react";
import { contactBekijken, CONTACT_BETALINGEN, type WinkelContact } from "../lib/winkelcontact";
import { nieuwGesprek, starten } from "../lib/chat";
import { chatOpenen } from "../lib/naar";
export default function WinkelContactPubliek({ adres }: { adres: string }) {
  const [data,setData]=useState<{contact?:WinkelContact;gebruiker?:string}|null>(null),[fout,setFout]=useState("");
  useEffect(()=>{let actief=true;setData(null);contactBekijken(adres).then(r=>{if(actief)setData(r);}).catch(()=>{});return()=>{actief=false;};},[adres]);
  const c=data?.contact;if(!c)return null;
  const link="flex min-h-11 items-center rounded-full bg-vlak px-4 text-sm font-medium";
  return <section aria-label="Contact en betaalafspraken" className="flex flex-col gap-3 rounded-3xl border border-lijn p-4">
    <h3 className="font-semibold">Neem contact op</h3><div className="flex flex-wrap gap-2">
      {c.chat && data.gebruiker && <button className={link} onClick={async()=>{try{await starten();const r=await nieuwGesprek(data.gebruiker!);chatOpenen(r.id);}catch{setFout("Chat openen lukte niet. Probeer opnieuw.");}}}>Chat via de app</button>}
      {c.email && <a href={`mailto:${encodeURIComponent(c.email)}`} className={link}>E-mail</a>}
      {c.telefoon && <a href={`tel:${c.telefoon.replace(/[^+\d]/g,"")}`} className={link}>Bellen</a>}
      {c.whatsapp && <a href={`https://wa.me/${c.whatsapp.replace(/\D/g,"")}`} target="_blank" rel="noreferrer" className={link}>WhatsApp</a>}
      {c.website && /^https:\/\//.test(c.website) && <a href={c.website} target="_blank" rel="noreferrer" className={link}>Website</a>}
    </div>{fout&&<p role="alert">{fout}</p>}
    {!!c.betaalwijzen?.length&&<><p className="text-sm">Na overleg: {c.betaalwijzen.map(b=>CONTACT_BETALINGEN[b as keyof typeof CONTACT_BETALINGEN]).filter(Boolean).join(" · ")}.</p>
      <p className="text-sm text-rustig">Spreek dit eerst met de verkoper af. Dit loopt buiten de webshopcheckout en heeft geen kopersbescherming van de app.</p></>}
  </section>;
}

import { useEffect, useRef, useState, type FormEvent } from "react";
import { huidigeSessie } from "../api";
import { nieuwGesprek, starten } from "../lib/chat";
import { chatOpenen, kaartBestemmingOpenen } from "../lib/naar";
import { centen, euro, nachten, reisDatum, type Vakantie } from "../lib/vakantie";
import { prijsVoorReis, selecteerVerblijf, sorteerVerblijven, ruimteVoorVerblijf } from "../lib/verblijfkeuze";
import * as verhuur from "../lib/verhuur";
const veld = "min-h-12 w-full rounded-xl bg-vlak px-3 py-2";
const knop = "min-h-11 rounded-full bg-vlak px-4 py-2 text-accent disabled:opacity-50";
const nieuw = (): verhuur.Verblijf => ({ id: crypto.randomUUID(), versie: 0, titel: "", plaats: "", land: "", beschrijving: "", adres: "", regels: "", prijs: 10000, schoonmaak: 0, personen: 2, van: "", tot: "", voorzieningen: [], open: false });
type Opdracht = { soort: "aanvraag"; aanvraag: verhuur.Aanvraag } | { soort: "actie"; r: verhuur.Reservering; actie: "bevestigen" | "afwijzen" | "annuleren" } | { soort: "blokkade"; b: verhuur.Blokkade; verwijderen: boolean } | { soort: "verwijderen"; v: verhuur.Verblijf };
export default function Verblijven({ start }: { start?: Vakantie | null }) {
  const [deel, setDeel] = useState<"zoeken" | "aanbod" | "reserveringen">("zoeken");
  const [mijn, setMijn] = useState<verhuur.MijnVerhuur | null>(null), [gevonden, setGevonden] = useState<verhuur.Verblijf[]>([]);
  const [vergelijk,setVergelijk] = useState<verhuur.Verblijf[]>([]);
  const [zoekvraag, setZoekvraag] = useState<{ van: string; tot: string; personen: number } | null>(null);
  const [bewerk, setBewerk] = useState<verhuur.Verblijf | null>(null), [opdracht, setOpdracht] = useState<Opdracht | null>(null);
  const [onzeker,setOnzeker] = useState(false);
  function kiesOpdracht(o: Opdracht) { setOnzeker(false); setFout(""); setBericht(""); setOpdracht(o); }
  const [fout, setFout] = useState(""), [bericht, setBericht] = useState(""), [bezig, setBezig] = useState(false), [geladen, setGeladen] = useState(false);
  const slot = useRef(false), actief = useRef(true);
  const sessie = useRef(huidigeSessie());
  const geldig = () => actief.current && huidigeSessie() === sessie.current;
  async function ververs() { const r = await verhuur.mijnVerhuur(); if (geldig()) setMijn(r); }
  useEffect(() => {
    actief.current = true; sessie.current = huidigeSessie(); let weg = false;
    verhuur.mijnVerhuur().then(r => { if (!weg && geldig()) setMijn(r); }).catch(() => { if (!weg && geldig()) setFout("Verhuur is nog niet beschikbaar of ophalen lukt niet. Je privévakantieplannen blijven bruikbaar."); });
    const wis = () => {
      if (huidigeSessie() === sessie.current) return;
      weg = true; setMijn(null); setGevonden([]); setVergelijk([]); setZoekvraag(null); setBewerk(null); setOpdracht(null); setGeladen(false); setBericht(""); setBezig(false);
      setFout("Je sessie is gewijzigd. Open Vakantie en verblijf opnieuw.");
    };
    window.addEventListener("assistent-sessie",wis);
    return () => { weg = true; actief.current = false; window.removeEventListener("assistent-sessie",wis); };
  }, []);
  async function doe(werk: () => Promise<void>) {
    if (slot.current || !geldig()) return;
    slot.current = true; setBezig(true); setFout(""); setBericht("");
    try { await werk(); } catch (e) { if (geldig()) setFout((e instanceof Error ? e.message : "Dit lukt nu niet.") + " Controleer de stand; een eerdere poging kan al verwerkt zijn."); }
    finally { slot.current = false; if (geldig()) setBezig(false); }
  }
  function zoek(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const f = new FormData(e.currentTarget), van = String(f.get("van")), tot = String(f.get("tot")), personen = Number(f.get("personen")), plek = String(f.get("plek"));
    try { nachten(van, tot); } catch (e) { setFout((e as Error).message); return; }
    doe(async () => { setGevonden([]); setVergelijk([]); setZoekvraag(null); setGeladen(false); const r = await verhuur.zoeken(van,tot,personen,plek); if (geldig()) { setGevonden(sorteerVerblijven(r.verblijven,van,tot,personen)); setZoekvraag({van,tot,personen}); setGeladen(true); } });
  }
  async function uitvoeren() {
    if (!opdracht) return;
    await doe(async () => {
      setOnzeker(true);
      if (opdracht.soort === "aanvraag") {
        const r = await verhuur.aanvragen(opdracht.aanvraag);
        if (!geldig()) return;
        setBericht(`Aanvraag opgeslagen: ${r.status}. Prijsafspraak ${euro(r.totaal)}. Er is geen betaling uitgevoerd.`);
      } else if (opdracht.soort === "actie") {
        const r = await verhuur.actie(opdracht.r.id, opdracht.actie);
        if (!geldig()) return;
        setBericht(`Reservering: ${r.status}. Een terugbetaling is hiermee niet uitgevoerd.`);
      } else if (opdracht.soort === "blokkade") { await verhuur.blokkeren(opdracht.b, opdracht.verwijderen); if (!geldig()) return; setBericht(opdracht.verwijderen ? "Blokkade verwijderd." : "Nachten geblokkeerd voor eigen gebruik of een andere boeking.");
      } else { await verhuur.verwijderen(opdracht.v); if (!geldig()) return; setBericht("Aanbod verwijderd. Open aanvragen zijn afgewezen."); }
      setOpdracht(null); setOnzeker(false); setGevonden([]); setVergelijk([]); setGeladen(false); await ververs();
    });
  }
  const reisruimte = start && zoekvraag ? ruimteVoorVerblijf({...start,...zoekvraag}) : null;
  return <div className="flex flex-col gap-4">
    <nav aria-label="Verblijven" className="flex flex-wrap gap-2">{([["zoeken","Verblijf zoeken"],["aanbod","Mijn aanbod"],["reserveringen","Reserveringen"]] as const).map(([k,t]) => <button key={k} className={`${knop} ${deel===k ? "ring-2 ring-accent" : ""}`} aria-current={deel===k?"page":undefined} disabled={bezig || !!opdracht} onClick={() => { setDeel(k); setBewerk(null); }}>{t}</button>)}</nav>
    <details><summary className="min-h-11 cursor-pointer py-2 text-sm text-rustig">Hoe aanvragen, betalingen en privacy werken</summary><p className="text-sm text-rustig">Particulier aanbod. Gegevens en voorzieningen zijn door de verhuurder opgegeven en niet onafhankelijk geverifieerd. Alleen een bevestigde aanvraag reserveert nachten. Deze functie verwerkt geen betalingen en biedt geen boekingsverzekering.</p></details>
    {fout && <p role="alert">{fout}</p>}{bericht && <p role="status">{bericht}</p>}
    <button className="min-h-11 self-end px-2 text-sm text-accent disabled:opacity-50" disabled={bezig} onClick={() => doe(ververs)}>Stand opnieuw ophalen</button>
    {opdracht && <section aria-label="Controleer reserveringsopdracht" className="rounded-2xl border border-lijn p-4">
      {opdracht.soort === "aanvraag" ? <><h2 className="font-semibold">Aanvraag controleren</h2><p>{opdracht.aanvraag.verblijf.titel} · {opdracht.aanvraag.van} tot {opdracht.aanvraag.tot} (vertrek)</p>
        <p>{opdracht.aanvraag.personen} gasten · {euro(nachten(opdracht.aanvraag.van,opdracht.aanvraag.tot)*opdracht.aanvraag.verblijf.prijs+opdracht.aanvraag.verblijf.schoonmaak)} inclusief opgegeven schoonmaak</p>
        <p className="whitespace-pre-wrap">{opdracht.aanvraag.verblijf.regels}</p><p className="text-sm text-rustig">Met bevestigen ga je akkoord met deze voorwaarden en deel je je app-gebruikersnaam met de verhuurder. Dit is nog geen bevestigde reservering. Betaal pas volgens aantoonbare afspraken.</p></>
        : opdracht.soort === "actie" ? <><h2 className="font-semibold">Reservering {opdracht.actie}?</h2><p>{opdracht.r.titel} · {opdracht.r.van} tot {opdracht.r.tot} · {euro(opdracht.r.totaal)}</p><p className="whitespace-pre-wrap">{opdracht.r.voorwaarden}</p><p className="text-sm text-rustig">Bevestigen geeft het exacte adres vrij aan de gast. Annuleren geeft nachten vrij; eventuele kosten of terugbetalingen moeten apart worden afgehandeld volgens de voorwaarden.</p></>
        : opdracht.soort === "blokkade" ? <><h2 className="font-semibold">{opdracht.verwijderen ? "Blokkade verwijderen?" : "Nachten blokkeren?"}</h2><p>{opdracht.b.van} tot {opdracht.b.tot} (vertrek)</p><p>Dit annuleert geen reservering. Een bestaande bevestigde reservering kan niet worden geblokkeerd.</p></>
        : <><h2 className="font-semibold">{opdracht.v.titel} verwijderen?</h2><p>Open aanvragen worden afgewezen. Een toekomstige bevestigde reservering moet eerst worden afgehandeld.</p></>}
      <button className={knop} disabled={bezig} onClick={uitvoeren}>{bezig ? "Bezig…" : onzeker ? "Dezelfde opdracht opnieuw controleren" : "Bevestigen"}</button>
      <button className={knop} disabled={bezig} onClick={() => { setOpdracht(null); setOnzeker(false); }}>{onzeker ? "Sluiten zonder terugdraaien" : "Annuleren"}</button>
    </section>}
    {deel === "zoeken" && <>
      <form onSubmit={zoek} className="grid gap-3 sm:grid-cols-2"><label>Plaats of land<input name="plek" defaultValue={start?.plaats ?? ""} maxLength={160} className={veld}/></label>
        <label>Gasten<input name="personen" type="number" min="1" max="30" defaultValue={start?.personen ?? 2} required className={veld}/></label>
        <label>Aankomst<input name="van" type="date" defaultValue={start?.van ?? ""} required className={veld}/></label><label>Vertrek<input name="tot" type="date" defaultValue={start?.tot ?? ""} required className={veld}/></label>
        <button className={knop} disabled={bezig || !!opdracht}>Zoek beschikbare nachten</button></form>
      {geladen && zoekvraag && <p className="text-sm text-rustig">Resultaten voor {reisDatum(zoekvraag.van)} tot {reisDatum(zoekvraag.tot)} · {zoekvraag.personen} gasten. Opgegeven totaalprijs inclusief schoonmaak, laagste eerst binnen deze resultaten.</p>}
      {gevonden.length > 1 && <p className="text-sm text-rustig">Vink maximaal drie verblijven aan om ze naast elkaar te vergelijken.</p>}
      {vergelijk.length >= 2 && zoekvraag && <section aria-label="Verblijven vergelijken" className="rounded-2xl border border-lijn p-4">
        <h2 className="font-semibold">Vergelijk je selectie</h2><p className="mt-1 text-sm text-rustig">Dezelfde nachten en gasten voor ieder verblijf. Voorzieningen zijn door de aanbieder opgegeven.</p>
        {vergelijk.map(v => { const prijs = prijsVoorReis(v,zoekvraag.van,zoekvraag.tot,zoekvraag.personen); return <article key={v.id} className="border-b border-lijn py-3 last:border-0">
          <h3 className="font-medium break-words">{v.titel}</h3><dl className="mt-2 grid grid-cols-2 gap-2 text-sm"><dt>Totaal verblijf</dt><dd>{euro(prijs.totaal)}</dd><dt>Waarvan schoonmaak</dt><dd>{euro(prijs.schoonmaak)}</dd><dt>Per persoon per nacht</dt><dd>Circa {euro(prijs.perPersoonPerNacht)}</dd></dl>
          <p className="mt-2 text-sm break-words">{v.voorzieningen.join(" · ") || "Geen voorzieningen opgegeven"}</p>
          <button className={knop} disabled={bezig || !!opdracht} onClick={() => kiesOpdracht({soort:"aanvraag",aanvraag:{id:crypto.randomUUID(),verblijf:v,...zoekvraag}})}>Aanvraag voor {v.titel} voorbereiden</button>
        </article>; })}
        <button className={knop} onClick={() => setVergelijk([])}>Vergelijking wissen</button>
      </section>}
      {geladen && !gevonden.length && <p>Geen passend aanbod gevonden. Probeer een andere plaats of andere datums.</p>}
      {gevonden.map(v => <article key={v.id} className="flex flex-col gap-2 rounded-2xl border border-lijn p-4"><h2 className="text-lg font-semibold">{v.titel}</h2><p>{v.plaats}, {v.land} · maximaal {v.personen} gasten</p>
        <p className="whitespace-pre-wrap">{v.beschrijving}</p><p>{v.voorzieningen.join(" · ") || "Geen voorzieningen opgegeven"}</p><p>{euro(v.prijs)} per nacht + {euro(v.schoonmaak)} schoonmaak</p>
        {zoekvraag && <><p>Totaal {euro(prijsVoorReis(v,zoekvraag.van,zoekvraag.tot,zoekvraag.personen).totaal)} voor {nachten(zoekvraag.van,zoekvraag.tot)} nachten</p>
          {reisruimte !== null && <p className="text-sm text-rustig">{reisruimte! - prijsVoorReis(v,zoekvraag.van,zoekvraag.tot,zoekvraag.personen).totaal >= 0
            ? `${euro(reisruimte! - prijsVoorReis(v,zoekvraag.van,zoekvraag.tot,zoekvraag.personen).totaal)} ruimte in je reisbudget na dit verblijf`
            : `${euro(prijsVoorReis(v,zoekvraag.van,zoekvraag.tot,zoekvraag.personen).totaal - reisruimte!)} boven je reisbudget met je overige begroting`}. Vervoer en dagbudget blijven je eigen schatting.</p>}
        </>}
        <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={vergelijk.some(p => p.id===v.id)} disabled={bezig || !!opdracht || (vergelijk.length>=3 && !vergelijk.some(p=>p.id===v.id))}
          onChange={() => { try { setVergelijk(selecteerVerblijf(vergelijk,v)); } catch(e) { setFout((e as Error).message); } }}/>Vergelijk {v.titel}</label>
        <details><summary className="min-h-11 cursor-pointer py-2">Huisregels, bijkomende afspraken en annulering</summary><p className="whitespace-pre-wrap">{v.regels}</p></details>
        <button className={knop} disabled={bezig || !!opdracht} onClick={() => zoekvraag && kiesOpdracht({ soort:"aanvraag",aanvraag:{ id:crypto.randomUUID(),verblijf:v,...zoekvraag } })}>Aanvraag voorbereiden</button>
      </article>)}
    </>}
    {deel === "aanbod" && <>
      <details><summary className="min-h-11 cursor-pointer py-2">Wat moet ik regelen vóór ik verhuur?</summary><p className="text-sm text-rustig">Je mag ook als particulier je eigen woning aanbieden. Controleer toestemming van eigenaar/VvE, lokale verhuurregels, registraties en verzekering. Neem verplichte toeslagen op in je prijs; beschrijf borg, aankomst, vertrek en annulering vooraf. Er vindt geen automatische controle van deze voorwaarden plaats.</p></details>
      <button className={knop} disabled={bezig || !mijn || !!opdracht} onClick={() => setBewerk(nieuw())}>Woning of vakantieverblijf toevoegen</button>
      {mijn?.verblijven.map(v => <article key={v.id} className="rounded-2xl border border-lijn p-4"><h2 className="font-semibold">{v.titel}</h2><p>{v.open ? "Aangeboden" : "Concept / gepauzeerd"} · {v.plaats} · {euro(v.prijs)} per nacht</p>
        <button className={knop} disabled={bezig || !!opdracht} onClick={() => setBewerk(v)}>Aanbod, beschikbaarheid en privacy</button>
        <button className={knop} disabled={bezig || !!opdracht} onClick={() => kiesOpdracht({soort:"verwijderen",v})}>Verwijderen</button>
        <details><summary className="min-h-11 cursor-pointer py-2">Datums blokkeren voor jezelf of een andere boeking</summary>
          <form className="flex flex-col gap-3" onSubmit={e => { e.preventDefault(); const f=new FormData(e.currentTarget); kiesOpdracht({soort:"blokkade",verwijderen:false,b:{id:crypto.randomUUID(),verblijf:v.id,van:String(f.get("van")),tot:String(f.get("tot"))}}); }}>
            <label>Blokkeren vanaf<input type="date" name="van" required className={veld}/></label><label>Weer beschikbaar vanaf<input type="date" name="tot" required className={veld}/></label>
            <button className={knop} disabled={bezig || !!opdracht}>Blokkade controleren</button>
          </form>
          {(mijn.blokkades ?? []).filter(b=>b.verblijf===v.id).map(b=><div key={b.id} className="py-2"><p>{b.van} tot {b.tot}</p><button className={knop} disabled={bezig || !!opdracht} onClick={()=>kiesOpdracht({soort:"blokkade",b,verwijderen:true})}>Blokkade verwijderen</button></div>)}
        </details></article>)}
      {bewerk && <AanbodFormulier key={`${bewerk.id}:${bewerk.versie}`} v={bewerk} bezig={bezig} sluit={() => setBewerk(null)} bewaren={(v,gerechtigd) => doe(async () => {
        const r = await verhuur.bewaren(v,gerechtigd); if (!geldig()) return; setBewerk(r.verblijf); setBericht("Aanbod opgeslagen. Bij aanvragen tegen een oudere versie: eerst afwijzen of annuleren, daarna opnieuw aanvragen. Bevestigde prijsafspraken blijven staan."); await ververs();
      })}/>}
    </>}
    {deel === "reserveringen" && <>{mijn && !mijn.reserveringen.length && <p>Je hebt nog geen aanvragen of reserveringen.</p>}{mijn?.reserveringen.map(r => <article key={r.id} className="flex flex-col gap-2 rounded-2xl border border-lijn p-4">
      <h2 className="font-semibold">{r.titel}</h2><p>{r.verhuurder ? "Als verhuurder" : "Als gast"} · {r.status}</p><p>{reisDatum(r.van)} tot {reisDatum(r.tot)} (vertrek) · {r.personen} gasten · {euro(r.totaal)}</p>
      <p>Betaling niet door deze functie verwerkt.</p><details><summary className="min-h-11 cursor-pointer py-2">Afgesproken voorwaarden</summary><p className="whitespace-pre-wrap">{r.voorwaarden}</p></details>
      {r.adres && <><p>Adres: {r.adres}</p><button className={knop} onClick={() => kaartBestemmingOpenen(r.adres!)}>Adres klaarzetten op kaart</button></>}
      <button className={knop} disabled={bezig} onClick={() => doe(async () => { await starten(); const g = await nieuwGesprek(r.contact); if (geldig()) chatOpenen(g.id); })}>Contact via app-chat</button>
      {r.status === "aangevraagd" && r.verhuurder && <div className="flex flex-wrap gap-2">{(["bevestigen","afwijzen"] as const).map(actie => <button className={knop} key={actie} disabled={bezig || !!opdracht} onClick={() => kiesOpdracht({soort:"actie",r,actie})}>{actie === "bevestigen" ? "Bevestiging voorbereiden" : "Afwijzing voorbereiden"}</button>)}</div>}
      {(r.status === "aangevraagd" || r.status === "bevestigd") && <button className={knop} disabled={bezig || !!opdracht} onClick={() => kiesOpdracht({soort:"actie",r,actie:"annuleren"})}>Annulering voorbereiden</button>}
    </article>)}</>}
  </div>;
}
function AanbodFormulier({v,bezig,bewaren,sluit}:{v:verhuur.Verblijf;bezig:boolean;bewaren:(v:verhuur.Verblijf,gerechtigd:boolean)=>void;sluit:()=>void}) {
  const [fout,setFout]=useState("");
  function indienen(e:FormEvent<HTMLFormElement>) {
    e.preventDefault(); const f=new FormData(e.currentTarget);
    try { bewaren({...v,titel:String(f.get("titel")),plaats:String(f.get("plaats")),land:String(f.get("land")),adres:String(f.get("adres")),beschrijving:String(f.get("beschrijving")),regels:String(f.get("regels")),
      van:String(f.get("van")),tot:String(f.get("tot")),personen:Number(f.get("personen")),prijs:centen(String(f.get("prijs"))),schoonmaak:centen(String(f.get("schoonmaak"))),
      voorzieningen:f.getAll("voorziening").map(String),open:f.get("open")==="on"},f.get("gerechtigd")==="on"); setFout(""); } catch(e){setFout((e as Error).message);}
  }
  return <form onSubmit={indienen} aria-label="Verblijf aanbieden" className="grid gap-3 rounded-2xl border border-lijn p-4 sm:grid-cols-2">
    <h2 className="font-semibold sm:col-span-2">Verblijf inrichten</h2>{fout&&<p role="alert">{fout}</p>}
    {([["titel","Naam",100],["plaats","Plaats (zichtbaar voor zoekers)",160],["land","Land",80],["adres","Exact adres (pas zichtbaar na bevestiging)",300]] as const).map(([name,label,max])=><label key={name}>{label}<input name={name} required maxLength={max} defaultValue={v[name]} className={veld}/></label>)}
    <label>Beschrijving<textarea name="beschrijving" required minLength={20} maxLength={3000} defaultValue={v.beschrijving} className={veld}/></label>
    <label>Huisregels, borg en annuleringsvoorwaarden<textarea name="regels" required minLength={20} maxLength={2000} defaultValue={v.regels} className={veld}/></label>
    <label>Prijs per nacht (€; verplichte toeslagen inbegrepen)<input name="prijs" required inputMode="decimal" defaultValue={(v.prijs/100).toFixed(2)} className={veld}/></label>
    <label>Eenmalige schoonmaak (€)<input name="schoonmaak" required inputMode="decimal" defaultValue={(v.schoonmaak/100).toFixed(2)} className={veld}/></label>
    <label>Maximaal aantal gasten<input type="number" name="personen" min={1} max={30} required defaultValue={v.personen} className={veld}/></label>
    <label>Beschikbaar vanaf<input type="date" name="van" required defaultValue={v.van} className={veld}/></label>
    <label>Laatste vertrekdatum<input type="date" name="tot" required defaultValue={v.tot} className={veld}/></label>
    <fieldset className="sm:col-span-2"><legend>Voorzieningen die je zelf kunt waarmaken</legend><div className="grid sm:grid-cols-2">{verhuur.VOORZIENINGEN.map(t=><label className="flex min-h-11 items-center gap-2" key={t}><input name="voorziening" type="checkbox" value={t} defaultChecked={v.voorzieningen.includes(t)}/>{t}</label>)}</div></fieldset>
    <label className="flex min-h-11 items-center gap-2"><input type="checkbox" name="gerechtigd" required/>Ik mag dit verblijf verhuren en heb lokale regels en voorwaarden gecontroleerd.</label>
    <label className="flex min-h-11 items-center gap-2"><input type="checkbox" name="open" defaultChecked={v.open}/>Aanbieden aan ingelogde gebruikers (uit = concept/pauze)</label>
    <button className={knop} disabled={bezig}>Aanbod opslaan</button><button type="button" className={knop} disabled={bezig} onClick={sluit}>Sluiten</button>
  </form>;
}

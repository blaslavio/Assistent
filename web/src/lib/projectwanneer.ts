import type { Afspraak, Gegevens } from "../api";
import type { Feit } from "./projectregie";
import { actueleAanpakken, stapFamilie, stapStand, type Stap } from "./projectplan";
import { lokaleTijd, nederlandseInstant, tijdInstant } from "./projecttijd";

export type TijdRij = { stap: Stap; persoon?: number; van?: string; tot?: string; reden: string; voorwaardelijk: boolean; teControleren?: boolean; afspraak?: Afspraak };
type AgendaBron = { projectplanning?: { gesprek: number; aanpak: string; stap: string; opdracht: string } };
const iso = (n: number) => new Date(n).toISOString();
const tijd = (s: string) => /(?:Z|[+-]\d{2}:\d{2})$/.test(s) ? tijdInstant(s) : tijdInstant(nederlandseInstant(s));
function interval(a: Afspraak): [number, number] {
  if (/^\d{4}-\d{2}-\d{2}$/.test(a.start)) {
    const van = tijd(a.start+"T00:00");
    const d = new Date(a.start+"T12:00:00Z"); d.setUTCDate(d.getUTCDate()+1);
    const eind = a.einde && /^\d{4}-\d{2}-\d{2}$/.test(a.einde) && a.einde > a.start ? a.einde : d.toISOString().slice(0,10);
    return [van,tijd(eind+"T00:00")];
  }
  const van=tijd(a.start), tot=a.einde ? tijd(a.einde) : van+3600_000;
  if (tot <= van) throw new Error("Een afspraak heeft een ongeldige duur."); return [van,tot];
}
function eersteGat(van: number, tot: number, duur: number, bezet: [number,number][]) {
  van=Math.ceil(van/60_000)*60_000;
  for (const [s,e] of [...bezet].sort((a,b)=>a[0]-b[0])) {
    if (e <= van || s >= tot) continue;
    if (s-van >= duur) return van;
    van=Math.max(van,Math.ceil(e/60_000)*60_000);
  }
  return van+duur <= tot ? van : null;
}
// De app bewaart Nederlandse minuten zonder offset. Dubbele kloktijden mogen daar niet in terechtkomen.
function bewaarbareMinuut(ms:number) {
  try { return tijdInstant(nederlandseInstant(lokaleTijd(ms)))===ms; } catch { return false; }
}
function passendGat(van:number,tot:number,duur:number,bezet:[number,number][]) {
  let plek=eersteGat(van,tot,duur,bezet);
  while(plek!==null&&(!bewaarbareMinuut(plek)||!bewaarbareMinuut(plek+duur))) plek=eersteGat(plek+60_000,tot,duur,bezet);
  return plek;
}
export function tijdVoorstellen(gesprek: number, plan: Feit, feiten: Feit[], ik: number, agenda: Afspraak[], nu=Date.now()): TijdRij[] {
  if (plan.actie.soort !== "aanpak" || !actueleAanpakken(plan.actie.doel!,feiten).some(p=>p.actie.sleutel===plan.actie.sleutel)) throw new Error("Deze aanpak is vervangen. Controleer de actuele aanpak.");
  const vensters=new Map<number,{van:number;tot:number}[]>();
  for (const f of feiten) if (f.actie.soort==="werkvenster") vensters.set(f.afzender,(f.actie.vensters??[]).map(v=>({van:tijdInstant(v.van),tot:tijdInstant(v.tot)})));
  const resultaat=new Map<string,TijdRij>();
  const einde=new Map<string,number>();
  const bezet=new Map<number,[number,number][]>();
  // Een onleesbare agenda levert nooit stilzwijgend een bewezen vrij tijdvak op.
  bezet.set(ik,agenda.map(interval));
  const gedeeldeTijden:{stap:string;eigenaar:number;van:number;tot:number}[]=[];
  // Alle gedeelde tijdvakken reserveren vóór nieuwe voorstellen, onafhankelijk van stapvolgorde.
  for (const stap of plan.actie.stappen ?? []) {
    if (!stap.eigenaar || stap.eigenaar === ik) continue;
    const familie = stapFamilie(plan, stap, feiten);
    const f = [...feiten].reverse().find(f => f.actie.soort === "staptijd" && f.actie.stap === stap.id && f.afzender === stap.eigenaar && familie.some(p => p.actie.sleutel === f.actie.doel));
    if (f) { gedeeldeTijden.push({stap:stap.id,eigenaar:stap.eigenaar,van:tijdInstant(f.actie.van!),tot:tijdInstant(f.actie.tot!)}); const blokken = bezet.get(stap.eigenaar) ?? []; blokken.push([tijdInstant(f.actie.van!), tijdInstant(f.actie.tot!)]); bezet.set(stap.eigenaar, blokken); }
  }
  const over=[...plan.actie.stappen??[]];
  while(over.length) {
    const i=over.findIndex(s=>s.afhankelijkVan.every(id=>resultaat.has(id)));
    if(i<0) throw new Error("De stapvolgorde is onleesbaar.");
    const s=over.splice(i,1)[0], status=stapStand(plan,s,feiten);
    const rij:TijdRij={stap:s,persoon:s.eigenaar,reden:"",voorwaardelijk:false}; resultaat.set(s.id,rij);
    if(status?.actie.keuze==="klaar") { rij.reden="Al afgerond"; einde.set(s.id,Date.parse(status.tijd)); continue; }
    if(status?.actie.keuze==="vast") { rij.reden="Eerst het obstakel oplossen of een andere aanpak kiezen"; continue; }
    if(!s.eigenaar) { rij.reden="Nog geen verantwoordelijke gekozen"; continue; }
    const familie=stapFamilie(plan,s,feiten);
    const eigen= s.eigenaar===ik ? agenda.find(a=>{
      const b=(a as Afspraak&AgendaBron).projectplanning;
      return b?.gesprek===gesprek && b.stap===s.id && familie.some(p=>p.actie.sleutel===b.aanpak);
    }) : undefined;
    const gedeeld=[...feiten].reverse().find(f=>f.actie.soort==="staptijd" && f.actie.stap===s.id && f.afzender===s.eigenaar
      && familie.some(p=>p.actie.sleutel===f.actie.doel));
    if(eigen || (gedeeld && s.eigenaar!==ik)) {
      const [v,t]=eigen?interval(eigen):[tijdInstant(gedeeld!.actie.van!),tijdInstant(gedeeld!.actie.tot!)];
      rij.van=iso(v);rij.tot=iso(t);rij.afspraak=eigen;
      const problemen: string[] = [];
      if(t-v < s.minuten*60_000) problemen.push(`te kort voor ${s.minuten} minuten werk`);
      if(plan.actie.uiterlijk&&t>tijdInstant(plan.actie.uiterlijk)) problemen.push("buiten de actuele deadline");
      if(t<=nu) problemen.push("tijdvak verstreken, resultaat nog niet bevestigd");
      if(s.afhankelijkVan.some(id=>!einde.has(id))) problemen.push("een voorganger is nog niet uitvoerbaar");
      else if(s.afhankelijkVan.some(id=>v<einde.get(id)!)) problemen.push("begint voordat een voorganger eindigt");
      rij.voorwaardelijk=s.afhankelijkVan.some(id=>resultaat.get(id)?.voorwaardelijk || resultaat.get(id)?.reden.startsWith("Voorstel"));
      if(!eigen&&gedeeldeTijden.some(b=>b.eigenaar===s.eigenaar&&b.stap!==s.id&&b.van<t&&b.tot>v)) problemen.push("overlap met een ander gedeeld projecttijdvak");
      if(eigen && agenda.some(a=>a!==eigen && (()=>{const [av,at]=interval(a);return av<t&&at>v;})())) problemen.push("overlap met een andere eigen afspraak");
      if(problemen.length) {
        rij.teControleren=true;rij.reden="Controleer bestaande tijd opnieuw: "+problemen.join("; ")+". Pas de afspraak of aanpak bewust aan.";
        continue;
      }
      rij.reden=eigen?"Al in je eigen agenda":"Tijd door verantwoordelijke in het project bevestigd; diens agenda niet ingezien";
      einde.set(s.id,t);continue;
    }
    if(s.afhankelijkVan.some(id=>!einde.has(id))) { rij.reden="Een voorganger is nog niet uitvoerbaar"; continue; }
    rij.voorwaardelijk=s.afhankelijkVan.some(id=>resultaat.get(id)?.voorwaardelijk || resultaat.get(id)?.reden.startsWith("Voorstel"));
    const vanaf=Math.max(Math.ceil((nu+60_000)/300_000)*300_000,...s.afhankelijkVan.map(id=>einde.get(id)!));
    const deadline=plan.actie.uiterlijk?tijdInstant(plan.actie.uiterlijk):Infinity;
    let plaats:number|null=null;
    const gereserveerd=bezet.get(s.eigenaar)??[];
    for(const v of vensters.get(s.eigenaar)??[]) {
      const eind=Math.min(v.tot,deadline,nu+14*86400_000);
      plaats=passendGat(Math.max(v.van,vanaf),eind,s.minuten*60_000,gereserveerd);
      if(plaats!==null) break;
    }
    if(plaats===null) { rij.reden="Geen passend opgegeven tijdvak vóór de deadline; geef beschikbaarheid op of pas de aanpak aan"; continue; }
    const tot=plaats+s.minuten*60_000;rij.van=iso(plaats);rij.tot=iso(tot);einde.set(s.id,tot);
    rij.reden=s.eigenaar===ik?"Voorstel: eigen appagenda gecontroleerd":"Voorstel: alleen opgegeven beschikbaarheid, andere agenda niet gecontroleerd";
    gereserveerd.push([plaats,tot]);bezet.set(s.eigenaar,gereserveerd);
  }
  return [...resultaat.values()];
}
export type TijdPoging = { opdracht:string; gesprek:number; aanpak:string; stap:string; van:string; tot:string };
export function tijdVastleggen(g:Gegevens,p:TijdPoging,feiten:Feit[],ik:number,nu=Date.now()) {
  if(!/^[a-f0-9-]{36}$/.test(p.opdracht)) throw new Error("Ongeldige planningsopdracht.");
  const eerder=g.afspraken.find(a=>(a as Afspraak&AgendaBron).projectplanning?.opdracht===p.opdracht);
  if(eerder) {
    const b=(eerder as Afspraak&AgendaBron).projectplanning!;
    if(b.gesprek!==p.gesprek||b.aanpak!==p.aanpak||b.stap!==p.stap||interval(eerder)[0]!==tijdInstant(p.van)||interval(eerder)[1]!==tijdInstant(p.tot))throw new Error("Deze opdracht hoort bij een ander tijdvak.");
    return eerder;
  }
  const plan=feiten.find(f=>f.actie.soort==="aanpak"&&f.actie.sleutel===p.aanpak);
  if(!plan) throw new Error("De aanpak ontbreekt.");
  const rij=tijdVoorstellen(p.gesprek,plan,feiten,ik,g.afspraken,nu).find(r=>r.stap.id===p.stap);
  if(!rij || rij.persoon!==ik || rij.voorwaardelijk || rij.afspraak || rij.van!==p.van || rij.tot!==p.tot || !rij.reden.startsWith("Voorstel")) throw new Error("Dit tijdvoorstel is gewijzigd, afhankelijk of niet voor jou. Controleer opnieuw.");
  const hoogste=[...g.taken,...g.afspraken].reduce((max,a)=>typeof a.id==="number"?Math.max(max,a.id):max,0);
  if(!Number.isSafeInteger(g.volgend_id)||g.volgend_id<1) throw new Error("De ID-teller is ongeldig.");
  const id=Math.max(g.volgend_id,hoogste+1);
  if(!Number.isSafeInteger(id+1)||id<1) throw new Error("De ID-teller is onveilig.");
  const a:Afspraak&AgendaBron={id,titel:rij.stap.titel,start:lokaleTijd(tijdInstant(p.van)).slice(0,16),einde:lokaleTijd(tijdInstant(p.tot)).slice(0,16),soort:"focus",notitie:"Bevestigd tijdvak uit projectaanpak.",projectplanning:{gesprek:p.gesprek,aanpak:p.aanpak,stap:p.stap,opdracht:p.opdracht}};
  g.afspraken.push(a);g.volgend_id=id+1;return a;
}

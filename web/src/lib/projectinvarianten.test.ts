// @vitest-environment node
import { expect, it } from "vitest";
import type { Afspraak, Gegevens } from "../api";
import { nieuwFeit, projectActie, projectFeiten, toestemmingen, PROJECT_SCOPE, type Feit } from "./projectregie";
import { tijdVoorstellen, tijdVastleggen } from "./projectwanneer";
import { beoordeelAls, type AlsRegel, type DienstBewijs } from "./projectals";
import type { Regel } from "./chat";
import { lokaleTijd, nederlandseInstant } from "./projecttijd";
/** Reproduceerbare eigenschapstests: geen tweede implementatie van de planner. */
it("5000 gevarieerde scenario's behouden tijdvakken, volgorde, opslagprecisie en herhaalbaarheid",()=>{
 let seed=0x261029;const getal=(max:number)=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%max;};
 const f=(actie:Feit["actie"],bericht:number):Feit=>({actie,bericht,afzender:1,tijd:"2026-10-29T08:00:00Z"});
 const root=f(nieuwFeit("actie","Synthetische audit"),1),a={id:crypto.randomUUID(),titel:"Werk A",klaarAls:"Gecontroleerd",minuten:30,eigenaar:1,alternatief:"Bespreken",afhankelijkVan:[]},b={...a,id:crypto.randomUUID(),titel:"Werk B"};
 const route=nieuwFeit("aanpak","Route",{soort:"eigen"},{doel:root.actie.sleutel,stappen:[a,b]}),beschikbaar=nieuwFeit("werkvenster","Beschikbaar",{soort:"eigen"},{vensters:[{van:"2026-10-29T09:00:00Z",tot:"2026-10-29T12:00:00Z"}]});
 const dagen=["2026-10-29T07:00:00Z","2026-10-25T00:00:00Z","2026-03-29T00:00:00Z"];let voorstellen=0,opgeslagen=0,volledigBezet=0;
 for(let i=0;i<5000;i++){
  const nu=Date.parse(dagen[i%3])+getal(90)*60_000,van=nu+(10+getal(80))*60_000+getal(60)*1000,tot=van+(120+getal(360))*60_000,afhankelijk=!!getal(2);
  const plan=f(projectActie({...route,stappen:[{...a,minuten:5+getal(56)},{...b,minuten:5+getal(56),afhankelijkVan:afhankelijk?[a.id]:[]}],uiterlijk:new Date(tot-getal(20)*60_000).toISOString()}),2);
  const ven=f(projectActie({...beschikbaar,vensters:[{van:new Date(van).toISOString(),tot:new Date(tot).toISOString()}]}),3),feiten=[root,plan,ven];
  const bezetVan=i%20===0?van:van+getal(80)*60_000,bezetTot=i%20===0?tot:Math.min(tot,bezetVan+(5+getal(60))*60_000+getal(60)*1000);
  const agenda:Afspraak[]=[{id:100,titel:"Bezet",start:new Date(bezetVan).toISOString(),einde:new Date(bezetTot).toISOString()}],vooraf=JSON.stringify({feiten,agenda});
  const r=tijdVoorstellen(8,plan,feiten,1,agenda,nu),momenten:[number,number][]=[];
  for(const rij of r){if(!rij.van||!rij.tot)continue;voorstellen++;const v=Date.parse(rij.van),t=Date.parse(rij.tot);const code=`scenario ${i}`;
   expect(v,code).toBeGreaterThanOrEqual(van);expect(t,code).toBeLessThanOrEqual(Date.parse(plan.actie.uiterlijk!));expect(t-v,code).toBe(rij.stap.minuten*60_000);expect(v>=bezetTot||t<=bezetVan,code).toBe(true);
   expect(Date.parse(nederlandseInstant(lokaleTijd(v))),code).toBe(v);expect(Date.parse(nederlandseInstant(lokaleTijd(t))),code).toBe(t);momenten.push([v,t]);
  }
  if(momenten.length===2){expect(momenten[0][1]<=momenten[1][0]||momenten[1][1]<=momenten[0][0],`scenario ${i}`).toBe(true);if(afhankelijk)expect(momenten[1][0]).toBeGreaterThanOrEqual(momenten[0][1]);}
  if(i%20===0){volledigBezet++;expect(r.every(rij=>!rij.van),`scenario ${i}`).toBe(true);}
  expect(JSON.stringify({feiten,agenda}),`scenario ${i}: simulatie is zuiver`).toBe(vooraf);
  const eerste=r[0];if(eerste.van&&eerste.tot){const g={taken:[],afspraken:structuredClone(agenda),volgend_id:1} as Gegevens,p={opdracht:crypto.randomUUID(),gesprek:8,aanpak:plan.actie.sleutel,stap:a.id,van:eerste.van,tot:eerste.tot};
   const opgeslagenAfspraak=tijdVastleggen(g,p,feiten,1,nu);tijdVastleggen(g,p,feiten,1,nu);opgeslagen++;
   expect(g.afspraken).toHaveLength(2);expect(Date.parse(nederlandseInstant(opgeslagenAfspraak.start))).toBe(Date.parse(p.van));expect(Date.parse(nederlandseInstant(opgeslagenAfspraak.einde!))).toBe(Date.parse(p.tot));
  }
 }
 expect(voorstellen).toBeGreaterThan(7000);expect(opgeslagen).toBeGreaterThan(4000);expect(volledigBezet).toBe(250);
 console.info("PLANNING_SCENARIOS "+JSON.stringify({seed:"0x261029",scenario_s:5000,voorstellen,opgeslagen,volledigBezet}));
},60000);


it("5000 scenario's verlenen geen toestemming of vervolg zonder het vereiste bewijs",()=>{
 const basis=Date.parse("2026-10-29T08:00:00Z"),betalingsstatussen=["betaald","geleverd","afgerond","geschil","terugbetaald","aangevraagd"],leeftijden=[0,59000,61000,-1000];
 for(let i=0;i<5000;i++){
  const nu=basis+i*60000,leden=Array.from({length:2+i%5},(_,n)=>i*20+n+1),modus=i%8;
  const regels:Regel[]=leden.map((id,n)=>({id:n+1,afzender:id,tijd:new Date(nu-(modus===3?16*60000:0)).toISOString(),weg:false,bericht:nieuwFeit("toestemming","Mijn keuze",{soort:"eigen"},{doel:PROJECT_SCOPE,keuze:modus===6&&n===0?"titel":"tekst",leden:modus===4?leden.slice(0,-1):leden,geldigMinuten:15})}));
  if(modus===1)regels.pop();
  if([2,5,7].includes(modus)){
   const nee=nieuwFeit("toestemming","Geen toestemming",{soort:"eigen"},{doel:PROJECT_SCOPE,keuze:"geen",leden});regels.push({id:100,afzender:leden[0],tijd:new Date(nu).toISOString(),weg:false,bericht:nee});
   const ja=nieuwFeit("toestemming","Een andere afzender",{soort:"eigen"},{doel:PROJECT_SCOPE,keuze:"tekst",leden});
   if(modus===5)regels.push({id:101,afzender:leden[1],tijd:new Date(nu).toISOString(),weg:false,bericht:{...ja,afzender:leden[0]}});
   if(modus===7)regels.push({id:101,afzender:leden[1],tijd:new Date(nu).toISOString(),weg:false,bericht:ja});
  }
  const toestemming=toestemmingen(projectFeiten(regels),PROJECT_SCOPE,leden,nu);expect(toestemming.tekst,`toestemming ${i}`).toBe(modus===0);expect(toestemming.titel,`toestemming ${i}`).toBe(modus===0||modus===6);
  const root:Feit={actie:nieuwFeit("actie","Synthetisch doel"),bericht:1,afzender:leden[0],tijd:new Date(nu).toISOString()},betaalwijze=i%3===0?"contant":"app",status=betalingsstatussen[(i*7)%6],leeftijd=leeftijden[Math.floor(i/3)%4],bereikt=!!(i%2),aanwezig=i%7!==0;
  const regel:AlsRegel={id:crypto.randomUUID(),gesprek:1,waarom:root.actie.sleutel,modus:i%4<2?"alle":"een",voorwaarden:[{soort:"betaling_bevestigd",bron:String(i+1)},{soort:"tijd_bereikt",bron:new Date(nu+(bereikt?-60000:60000)).toISOString()}],vervolg:"planning"};
  const dienst:DienstBewijs={dienst:"betaling",id:i+1,status,betaalwijze,gecontroleerd:nu-leeftijd};
  const betaald=!aanwezig||betaalwijze!=="app"||leeftijd>60000||leeftijd<0?"onbekend":["betaald","geleverd","afgerond"].includes(status)?"voldaan":"niet_voldaan";
  const verwacht=regel.modus==="alle"?(!bereikt?"niet_voldaan":betaald):(bereikt||betaald==="voldaan"?"voldaan":betaald);
  expect(beoordeelAls(regel,[root],aanwezig?[dienst]:[],nu).status,`voorwaarde ${i}`).toBe(verwacht);
 }
},60000);

import type { Gegevens } from "../api";
import { ONDERDELEN,type OnderdeelNaam } from "./onderdeel-lijst";
export type Werkplek={soort:"app";app:OnderdeelNaam}|{soort:"project";gesprek:number};
function geldig(v:unknown):v is Werkplek {if(!v||typeof v!=="object")return false;const p=v as Werkplek;return p.soort==="app"?ONDERDELEN.some(([id])=>id===p.app):p.soort==="project"&&Number.isSafeInteger(p.gesprek)&&p.gesprek>0;}
export const plekSleutel=(p:Werkplek)=>p.soort==="app"?`app:${p.app}`:`project:${p.gesprek}`;
const projectie=(p:Werkplek):Werkplek=>p.soort==="app"?{soort:"app",app:p.app}:{soort:"project",gesprek:p.gesprek};
export function recenteWerkplekken(g:Gegevens):Werkplek[]{const lijst=Array.isArray(g.werkruimte_recent)?g.werkruimte_recent:[];const gezien=new Set<string>();return lijst.filter(geldig).filter(p=>{const id=plekSleutel(p);if(gezien.has(id))return false;gezien.add(id);return true;}).slice(0,6).map(projectie);}
export function onthoudWerkplek(g:Gegevens,p:Werkplek){if(!geldig(p))throw new Error("Ongeldige werkplek.");g.werkruimte_recent=[projectie(p),...recenteWerkplekken(g).filter(o=>plekSleutel(o)!==plekSleutel(p))].slice(0,6);}

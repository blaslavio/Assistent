// Ergens anders in de app heen gaan, ook vanuit een app in de app (chat, winkel) die het hoofdmenu niet ziet.
import { kaartContext, agendaKaartplek, type KaartContext, type AgendaKaartplek } from "./kaartverbinding";
import type { Punt } from "./kaart";
import type { OnderdeelNaam } from "./onderdeel-lijst";

export type Hoofdtab = "projecten" | "vandaag" | "agenda" | "chat" | "assistent" | "instellingen";
export type Bestemming = { tab: Hoofdtab; onderdeel?: OnderdeelNaam };

export function naar(b: Bestemming) {
  window.dispatchEvent(new CustomEvent<Bestemming>("app-naar", { detail: b }));
}

// Een pagina binnen Instellingen openen (bijvoorbeeld Account), ook als Instellingen al open staat.
export type InstellingenPagina = "algemeen" | "idee" | "profiel" | "account" | "assistent" | "privacy" | "thuis" | "mail" | "betalingen" | "afspraken";
let gevraagd: InstellingenPagina | null = null;
export function instellingenOpenen(pagina: InstellingenPagina) {
  gevraagd = pagina;
  window.dispatchEvent(new CustomEvent<string>("instellingen-pagina", { detail: pagina }));
  naar({ tab: "instellingen" });
}
export function gevraagdePagina() {
  const p = gevraagd;
  gevraagd = null;
  return p;
}

export function vakantiesOpenen() {
  try { sessionStorage.setItem("assistent.agendapaneel", "vakanties"); } catch { /* alleen deze weergave */ }
  window.dispatchEvent(new Event("agenda-vakanties"));
  naar({ tab: "agenda" });
}

export function evenementenOpenen() {
  try { sessionStorage.setItem("assistent.agendapaneel", "evenementen"); } catch { /* alleen deze weergave */ }
  window.dispatchEvent(new Event("agenda-evenementen"));
  naar({ tab: "agenda" });
}
let gesprekGevraagd: number | null = null;
export function chatOpenen(id: number) {
  if (!Number.isSafeInteger(id) || id < 1) return;
  gesprekGevraagd = id;
  window.dispatchEvent(new Event("chat-open"));
  naar({ tab: "chat" });
}
export function gevraagdGesprek() { const id = gesprekGevraagd; gesprekGevraagd = null; return id; }
let winkelAppVerzoek = false;
export function winkelAppOpenen(){winkelAppVerzoek=true;window.dispatchEvent(new Event("winkel-app-openen"));naar({tab:"chat"});}
export function winkelAppGevraagd(){const v=winkelAppVerzoek;winkelAppVerzoek=false;return v;}
let kaartVerzoek = false;
export function kaartOpenen() { kaartVerzoek = true; window.dispatchEvent(new Event("kaart-openen")); naar({ tab: "chat" }); }
export function kaartGevraagd() { const v = kaartVerzoek; kaartVerzoek = false; return v; }
// Een afspraakadres blijft alleen in geheugen totdat het kaartscherm het overneemt.
let kaartBestemming: KaartContext | null = null;
export function kaartBestemmingOpenen(adres: string,extra:Partial<Omit<KaartContext,"adres">>={}) {
  const context=kaartContext(adres,extra);if(!context)return;
  kaartBestemming=context;kaartOpenen();
}
export function kaartContextLezen(){const p=kaartBestemming;kaartBestemming=null;return p;}
export function kaartBestemmingLezen(){return kaartContextLezen()?.adres??null;}
let agendaPlek:AgendaKaartplek|null=null;
export function agendaPlekOpenen(naam:string,punt:Punt){
  const p=agendaKaartplek(naam,punt);if(!p)return;agendaPlek=p;
  try{sessionStorage.setItem("assistent.agendapaneel","");}catch{/* alleen in geheugen */}
  window.dispatchEvent(new Event("agenda-kaartplek"));naar({tab:"agenda"});
}
export function agendaPlekLezen(){const p=agendaPlek;agendaPlek=null;return p;}
if(typeof window!=="undefined")window.addEventListener("assistent-sessie",()=>{kaartBestemming=null;agendaPlek=null;gesprekGevraagd=null;kaartVerzoek=false;winkelAppVerzoek=false;});

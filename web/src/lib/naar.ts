// Ergens anders in de app heen gaan, ook vanuit een app in de app (chat, winkel) die het hoofdmenu niet ziet.
import type { OnderdeelNaam } from "./onderdeel-lijst";

export type Hoofdtab = "vandaag" | "agenda" | "chat" | "assistent" | "instellingen";
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
let kaartVerzoek = false;
export function kaartOpenen() { kaartVerzoek = true; window.dispatchEvent(new Event("kaart-openen")); naar({ tab: "chat" }); }
export function kaartGevraagd() { const v = kaartVerzoek; kaartVerzoek = false; return v; }
// Een afspraakadres blijft alleen in geheugen totdat het kaartscherm het overneemt.
let kaartBestemming: string | null = null;
export function kaartBestemmingOpenen(adres: string) {
  const tekst=adres.trim();
  if(!tekst||tekst.length>300||/[\p{Cc}\p{Cs}]/u.test(tekst))return;
  kaartBestemming=tekst;kaartOpenen();
}
export function kaartBestemmingLezen(){const p=kaartBestemming;kaartBestemming=null;return p;}
if(typeof window!=="undefined")window.addEventListener("assistent-sessie",()=>{kaartBestemming=null;gesprekGevraagd=null;kaartVerzoek=false;});

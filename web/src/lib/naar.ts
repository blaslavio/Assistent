// Ergens anders in de app heen gaan, ook vanuit een app in de app (chat, winkel) die het hoofdmenu niet ziet.
import type { OnderdeelNaam } from "./onderdeel-lijst";

export type Hoofdtab = "vandaag" | "agenda" | "chat" | "assistent" | "instellingen";
export type Bestemming = { tab: Hoofdtab; onderdeel?: OnderdeelNaam };

export function naar(b: Bestemming) {
  window.dispatchEvent(new CustomEvent<Bestemming>("app-naar", { detail: b }));
}

// Een pagina binnen Instellingen openen (bijvoorbeeld Account), ook als Instellingen al open staat.
let gevraagd: string | null = null;
export function instellingenOpenen(pagina: string) {
  gevraagd = pagina;
  window.dispatchEvent(new CustomEvent<string>("instellingen-pagina", { detail: pagina }));
}
export function gevraagdePagina() {
  const p = gevraagd;
  gevraagd = null;
  return p;
}

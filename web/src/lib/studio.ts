import {adresWaarde,adresOpruimen} from "../api";
export const EVENT_TYPES=[{id:"bijeenkomst",naam:"Bijeenkomst",uren:2},{id:"workshop",naam:"Workshop of training",uren:3},{id:"festival",naam:"Festival",uren:8},{id:"concert",naam:"Concert",uren:3},{id:"sport",naam:"Sportevenement",uren:3},{id:"markt",naam:"Markt of beurs",uren:6},{id:"feest",naam:"Feest",uren:5},{id:"online",naam:"Online evenement",uren:2},{id:"open_dag",naam:"Open dag",uren:6},{id:"anders",naam:"Anders",uren:2}] as const;
export type EventType=(typeof EVENT_TYPES)[number]["id"];
export const STUDIO_TOOLS=[
 {id:"winkel",groep:"Winkel bouwen",naam:"Mijn winkel opzetten",uitleg:"Naam, uitstraling en je eigen winkeladres",zoek:"shopify webshop shop bouwen starten basis"},
 {id:"ontwerp",groep:"Winkel bouwen",naam:"Winkel ontwerpen",uitleg:"Stijlen, banner, paginaonderdelen en volgorde",zoek:"website builder sjabloon template huisstijl"},
 {id:"voorbeeld",groep:"Winkel bouwen",naam:"Winkelvoorbeeld",uitleg:"Bekijk je winkel voordat je hem opent",zoek:"preview mobiel etalage"},
 {id:"product",groep:"Verkopen en beheren",naam:"Product of dienst toevoegen",uitleg:"Foto, prijs en levering instellen",zoek:"artikel catalogus aanbod verkopen"},
 {id:"voorraad",groep:"Verkopen en beheren",naam:"Producten en voorraad",uitleg:"Kies wat in je winkel staat en hoeveel beschikbaar is",zoek:"catalogus inventaris artikelen beheren"},
 {id:"bestellingen",groep:"Verkopen en beheren",naam:"Bestellingen behandelen",uitleg:"Controleer betalingen en leveringen",zoek:"orders verzenden orderbeheer checkout"},
 {id:"levering",groep:"Verkopen en beheren",naam:"Verzending en retour",uitleg:"Verzendkosten, gratis verzending en retourtekst",zoek:"bezorgen ophalen logistiek"},
 {id:"contact",groep:"Verkopen en beheren",naam:"Betalen en winkelcontact",uitleg:"Bereikbaarheid, verkoopsituatie en contactinstellingen",zoek:"voorwaarden verkoper adres"},
 {id:"betalingen",groep:"Verkopen en beheren",naam:"Betalingen instellen",uitleg:"Verbind de bestaande betaalvoorziening",zoek:"stripe afrekenen checkout rekening"},
 {id:"event_maken",groep:"Evenementen bouwen",naam:"Evenement bouwen",uitleg:"Van een sjabloon naar een gecontroleerd evenement",zoek:"events builder workshop festival bijeenkomst nieuw"},
 {id:"evenementen",groep:"Evenementen bouwen",naam:"Evenementen beheren",uitleg:"Agenda, locatie, reacties en organisatietaken",zoek:"planning draaiboek vrijwilligers aanpassen"},
 {id:"tickets",groep:"Tickets en toegang",naam:"Tickets en inschrijvingen",uitleg:"Gratis tickets, capaciteit en je eigen QR-ticket",zoek:"ticketsoort reserveren aanmelden toegangsbewijs event"},
 {id:"scannen",groep:"Tickets en toegang",naam:"Tickets scannen",uitleg:"Camera of code, controleren en toegang bevestigen",zoek:"qr scanner checkin check-in deur entree"},
 {id:"bezoekers",groep:"Tickets en toegang",naam:"Bezoekers en aanwezigheid",uitleg:"Zoek in uitgegeven tickets en zie wie binnen is",zoek:"gasten deelnemers bezoekerslijst gastenlijst"},
 {id:"team",groep:"Tickets en toegang",naam:"Scanteam beheren",uitleg:"Geef groepsleden toegang tot de ticketcontrole",zoek:"medewerkers crew rechten personeel"},
 {id:"deellinks",groep:"Delen en samenwerken",naam:"Deellinks voor winkel en evenementen",uitleg:"Winkelpagina, evenementpagina en ticketinschrijving",zoek:"delen share link url uitnodiging qr publiceren"},
] as const;
export type StudioTool=(typeof STUDIO_TOOLS)[number]["id"];
export type StudioVerzoek={tool:StudioTool;groep?:number;evenement?:number};
export function studioVerzoek(v:unknown):StudioVerzoek|null{if(!v||typeof v!=="object")return null;const p=v as StudioVerzoek;if(!STUDIO_TOOLS.some(t=>t.id===p.tool)||[p.groep,p.evenement].some(n=>n!==undefined&&(!Number.isSafeInteger(n)||n<1)))return null;return{tool:p.tool,...(p.groep?{groep:p.groep}:{}),...(p.evenement?{evenement:p.evenement}:{})};}
export function studioZoeken(zoek:string){const term=zoek.trim().toLocaleLowerCase("nl");return STUDIO_TOOLS.filter(t=>`${t.naam} ${t.uitleg} ${t.zoek} ${t.groep}`.toLocaleLowerCase("nl").includes(term));}
export function ticketAdres(){const v=adresWaarde("ticket_event");if(!v||!/^\d+$/.test(v)||!Number.isSafeInteger(Number(v))||Number(v)<1)return null;return Number(v);}
export function ticketAdresVerbruiken(){const id=ticketAdres();if(id)adresOpruimen("ticket_event");return id;}
export function ticketLink(id:number){if(!Number.isSafeInteger(id)||id<1)throw new Error("Ongeldig evenement.");let u:URL;try{u=new URL(window.parent.location.href);}catch{u=new URL(location.href);}u.search="";u.hash="";u.searchParams.set("ticket_event",String(id));return u.toString();}

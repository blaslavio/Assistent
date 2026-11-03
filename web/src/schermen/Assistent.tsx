import InstellingenKnop from "./InstellingenKnop";
import type Anthropic from "@anthropic-ai/sdk";
import { useSchermActief } from "./BewaarScherm";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Staat } from "../App";
import { Opstellen } from "./MailOpstellen";
import { Bestand, Hartslag, Bijlage, Boek, Envelop, Herstel, Kalender, Klok, Kruis, Microfoon, Pijl, Plus, Vinkje, Vonk } from "../iconen";
import { GrafiekKaart, type Grafiek } from "../grafiek";
import { ACCEPTEER, BijlageFout, MAX_SAMEN, lezen, type Bijlage as Bijlagebestand } from "../lib/bijlagen";
import { antwoord, gebruikerBeurt, gesprekLeeg, notitie, ongedaanMaken, verbinding, zonderLabels, type Actie,
  type Keuze } from "../lib/assistent";
import { KeuzeKaart } from "../keuzekaart";
import { Mascotte, type Stemming } from "../mascotte";
import { alsBerichten, bewaar, bewarenAan, nieuwId, schoon, type Opgeslagen } from "../lib/geschiedenis";
import { Gesprekken } from "./Gesprekken";
import { Opmaak } from "../lib/opmaak";
import { GEEN_INTERNET } from "../lib/net";
import { BETAALWIJZE, LEVERING, bestellen, euro, onthouden, type Bestelling, type Product } from "../lib/winkelen";
import { BestelKaart, type Bestelkaart } from "./BestelKaart";
import { Bladen, ProductRij, type Blad } from "./Winkelen";

type Beurt = { wie: "jij" | "assistent"; tekst: string; acties: Actie[]; fout?: boolean; opnieuw?: Herhaling; keuze?: Keuze;
  gekozen?: number;
  producten?: Product[]; bestellingen?: Bestelkaart[]; bijlagen?: { naam: string; soort: Bijlagebestand["soort"] }[];
  grafieken?: Grafiek[] };

// Een vraag die door de verbinding mislukte, met alles wat nodig is om hem met één tik opnieuw te stellen.
type Herhaling = { vraag: string; gekozen?: string; bijlagen: Bijlagebestand[]; vanJou: boolean };

// Wat je typt, blijft bewaard op dit apparaat tot je het verstuurt: ook als de app herlaadt of de verbinding wegvalt.
const CONCEPT = "assistent.concept";
const conceptLezen = () => { try { return sessionStorage.getItem(CONCEPT) ?? ""; } catch { return ""; } };
const conceptBewaren = (t: string) => { try { if (t) sessionStorage.setItem(CONCEPT, t); else sessionStorage.removeItem(CONCEPT); } catch { /* privévenster */ } };

// Het gesprek blijft staan zolang dit tabblad open is, ook als je even naar Vandaag gaat. Na elk antwoord gaat de
// tekst ook naar je eerdere gesprekken (lib/geschiedenis), tenzij je dat uitzette. Niet op het apparaat.
// `gebruikt` telt de meegestuurde bestanden op: het hele gesprek gaat bij elke vraag opnieuw mee.
const gesprek: { id: string; beurten: Beurt[]; berichten: Anthropic.MessageParam[]; gebruikt: number } =
  { id: nieuwId(), beurten: [], berichten: [], gebruikt: 0 };

// PLACEHOLDER_FULL_CONTENT_WILL_BE_REPLACED

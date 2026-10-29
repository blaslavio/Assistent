// Trainingen uit een bestand van elke sportapp of elk horloge: GPX, TCX, FIT of CSV. Alles wordt hier in je browser
// gelezen; het bestand zelf gaat nergens heen, alleen de training (dag, sport, minuten, afstand) komt in je agenda.
import type { Binnen } from "./sport";
import { nuTekst } from "./tijd";

export class BestandFout extends Error {}

async function vingerafdruk(inhoud: ArrayBuffer) {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", inhoud));
  return [...h.slice(0, 8)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Afstand over de aarde tussen opeenvolgende punten, in km. */
export function afstand(punten: [number, number][]) {
  let totaal = 0;
  const r = (x: number) => (x * Math.PI) / 180;
  for (let i = 1; i < punten.length; i += 1) {
    const [a1, o1] = punten[i - 1], [a2, o2] = punten[i];
    const d = Math.sin(r(a2 - a1) / 2) ** 2 + Math.cos(r(a1)) * Math.cos(r(a2)) * Math.sin(r(o2 - o1) / 2) ** 2;
    totaal += 2 * 6371 * Math.asin(Math.sqrt(d));
  }
  return totaal;
}

export function xmlLezen(tekst: string, id: string): Binnen[] {
  if (/<!DOCTYPE/i.test(tekst.slice(0, 2000))) throw new BestandFout("Dit bestand kan ik niet lezen.");
  const doc = new DOMParser().parseFromString(tekst, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new BestandFout("Dit bestand kan ik niet lezen.");
  const alle = [...doc.getElementsByTagName("*")];
  const tijden = alle.filter((e) => e.localName === "time" || e.localName === "Time")
    .map((e) => new Date((e.textContent ?? "").trim()).getTime()).filter((t) => !Number.isNaN(t));
  if (!tijden.length) throw new BestandFout("Er staat geen tijd in dit bestand.");
  const punten: [number, number][] = [];
  let sport = "", titel = "", tcxMeters = 0;
  for (const e of alle) {
    if (e.localName === "trkpt" || e.localName === "rtept") punten.push([Number(e.getAttribute("lat")), Number(e.getAttribute("lon"))]);
    else if (e.localName === "Position") {
      const kind = (n: string) => [...e.children].find((x) => x.localName === n)?.textContent;
      const lat = kind("LatitudeDegrees"), lon = kind("LongitudeDegrees");
      if (lat && lon) punten.push([Number(lat), Number(lon)]);
    } else if (e.localName === "Activity" && e.getAttribute("Sport")) sport = e.getAttribute("Sport")!;
    else if (e.localName === "type" && !sport) sport = e.textContent ?? "";
    else if (e.localName === "name" && !titel) titel = (e.textContent ?? "").trim();
    else if (e.localName === "Lap") tcxMeters += Number([...e.children].find((x) => x.localName === "DistanceMeters")?.textContent ?? 0);
  }
  const van = Math.min(...tijden), tot = Math.max(...tijden);
  const kmTotaal = tcxMeters ? tcxMeters / 1000 : afstand(punten);
  return [{ id: `bestand:${id}`, naam: titel, start: nuTekst(new Date(van)), sport: sport || titel,
    minuten: Math.round((tot - van) / 60000), afstand_km: Math.round(kmTotaal * 10) / 10 }];
}

// FIT (Garmin en anderen): we lezen alleen de "session"-berichten, met begin, sport, duur, afstand en calorieën.
const FIT_SPORT: Record<number, string> = { 1: "hardlopen", 2: "fietsen", 4: "fitness", 5: "zwemmen", 6: "basketbal",
  7: "voetbal", 8: "tennis", 10: "fitness", 11: "wandelen", 12: "langlaufen", 13: "skiën", 14: "snowboarden", 15: "roeien",
  17: "hiken", 19: "kanoën", 20: "schaatsen", 21: "klimmen", 23: "boksen", 25: "golf", 31: "klimmen", 37: "kanoën",
  38: "surfen", 43: "padel", 47: "boksen", 62: "yoga", 64: "tennis" };
const FIT_EPOCH = Date.UTC(1989, 11, 31);

export function fitLezen(buf: ArrayBuffer, id: string): Binnen[] {
  const v = new DataView(buf);
  if (buf.byteLength < 14 || String.fromCharCode(v.getUint8(8), v.getUint8(9), v.getUint8(10), v.getUint8(11)) !== ".FIT") {
    throw new BestandFout("Dit FIT-bestand kan ik niet lezen.");
  }
  const kop = v.getUint8(0);
  const einde = Math.min(buf.byteLength, kop + v.getUint32(4, true));
  type Veld = { nr: number; grootte: number };
  const defs = new Map<number, { klein: boolean; globaal: number; velden: Veld[]; ontwikkel: number }>();
  const uit: Binnen[] = [];
  let p = kop;
  const lees = (o: number, n: number, klein: boolean) =>
    n === 1 ? v.getUint8(o) : n === 2 ? v.getUint16(o, klein) : n === 4 ? v.getUint32(o, klein) : NaN;
  while (p < einde) {
    const h = v.getUint8(p);
    p += 1;
    if (h & 0x80) {
      // Gecomprimeerde tijd: een databericht met type in bit 5-6.
      const def = defs.get((h >> 5) & 0x3);
      if (!def) throw new BestandFout("Dit FIT-bestand kan ik niet lezen.");
      p += def.velden.reduce((s, f) => s + f.grootte, 0) + def.ontwikkel;
      continue;
    }
    const type = h & 0x0f;
    if (h & 0x40) {
      const klein = v.getUint8(p + 1) === 0;
      const globaal = v.getUint16(p + 2, klein);
      const aantal = v.getUint8(p + 4);
      p += 5;
      const velden: Veld[] = [];
      for (let i = 0; i < aantal; i += 1, p += 3) velden.push({ nr: v.getUint8(p), grootte: v.getUint8(p + 1) });
      let ontwikkel = 0;
      if (h & 0x20) {
        const n = v.getUint8(p);
        p += 1;
        for (let i = 0; i < n; i += 1, p += 3) ontwikkel += v.getUint8(p + 1);
      }
      defs.set(type, { klein, globaal, velden, ontwikkel });
      continue;
    }
    const def = defs.get(type);
    if (!def) throw new BestandFout("Dit FIT-bestand kan ik niet lezen.");
    if (def.globaal === 18) {
      const w: Record<number, number> = {};
      let o = p;
      for (const f of def.velden) { w[f.nr] = lees(o, f.grootte, def.klein); o += f.grootte; }
      const start = w[2];
      if (start && start !== 0xffffffff) {
        const tijd = (x?: number) => (x && x !== 0xffffffff ? x / 1000 : 0);
        uit.push({ id: `bestand:${id}:${uit.length}`, naam: "", start: nuTekst(new Date(FIT_EPOCH + start * 1000)),
          sport: FIT_SPORT[w[5]] ?? "", minuten: Math.round((tijd(w[8]) || tijd(w[7])) / 60),
          afstand_km: w[9] && w[9] !== 0xffffffff ? Math.round(w[9] / 10000) / 10 : 0,
          calorieen: w[11] && w[11] !== 0xffff ? w[11] : 0 });
      }
    }
    p += def.velden.reduce((s, f) => s + f.grootte, 0) + def.ontwikkel;
  }
  if (!uit.length) throw new BestandFout("Er staat geen training in dit bestand.");
  return uit;
}

// CSV: kolomnamen zoals datum, sport, minuten en afstand (ook de Engelse namen uit een Strava-export).
function splitsen(regel: string, scheiding: string) {
  const uit: string[] = [];
  let veld = "", binnen = false;
  for (let i = 0; i < regel.length; i += 1) {
    const c = regel[i];
    if (c === '"') { if (binnen && regel[i + 1] === '"') { veld += '"'; i += 1; } else binnen = !binnen; }
    else if (c === scheiding && !binnen) { uit.push(veld); veld = ""; }
    else veld += c;
  }
  uit.push(veld);
  return uit.map((x) => x.trim());
}

const getal = (t: string) => { const n = Number((t ?? "").replace(",", ".").split(/\s/)[0]); return Number.isFinite(n) ? Math.round(n * 10) / 10 : 0; };

export function duurMinuten(t: string) {
  const s = (t ?? "").trim();
  if (s.includes(":")) {
    const d = s.split(":").map(Number);
    while (d.length < 3) d.unshift(0);
    return Math.round(d[0] * 60 + d[1] + d[2] / 60);
  }
  const n = getal(s);
  return Math.round(n > 600 ? n / 60 : n);
}

export function csvMoment(t: string): string | null {
  const s = t.trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (m) {
    if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) { const d = new Date(s.replace(" ", "T")); return Number.isNaN(d.getTime()) ? null : nuTekst(d); }
    return `${m[1]}-${m[2]}-${m[3]}T${(m[4] ?? "00").padStart(2, "0")}:${m[5] ?? "00"}`;
  }
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:[ ,T]+(\d{1,2}):(\d{2}))?/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}T${(m[4] ?? "00").padStart(2, "0")}:${m[5] ?? "00"}`;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : nuTekst(d);
}

export function csvLezen(tekst: string, id: string): Binnen[] {
  const regels = tekst.replace(/^﻿/, "").split(/\r?\n/).filter((r) => r.trim());
  if (regels.length < 2) throw new BestandFout("Ik vond geen trainingen. De eerste regel moet kolomnamen hebben, zoals datum, sport, minuten en afstand.");
  const scheiding = [";", "\t", ","].sort((a, b) => regels[0].split(b).length - regels[0].split(a).length)[0];
  const namen = splitsen(regels[0], scheiding).map((n) => n.toLowerCase());
  const uit: Binnen[] = [];
  for (const [nr, regel] of regels.slice(1, 2001).entries()) {
    const cel = splitsen(regel, scheiding);
    const r = Object.fromEntries(namen.map((n, i) => [n, cel[i] ?? ""]));
    const kies = (...k: string[]) => k.map((x) => r[x]).find((x) => x) ?? "";
    const start = csvMoment(kies("start", "datum", "date", "start time", "activity date", "begintijd", "starttijd"));
    if (!start) continue;
    uit.push({ id: `bestand:${id}:${nr}`, naam: kies("naam", "activity name", "title"), start,
      sport: kies("sport", "activity type", "type"), minuten: duurMinuten(kies("minuten", "duur", "duration", "elapsed time", "moving time", "tijd") || "0"),
      afstand_km: getal(kies("afstand_km", "afstand", "distance", "km") || "0") });
  }
  if (!uit.length) throw new BestandFout("Ik vond geen trainingen. De eerste regel moet kolomnamen hebben, zoals datum, sport, minuten en afstand.");
  return uit;
}

export async function bestandLezen(bestand: File): Promise<Binnen[]> {
  if (bestand.size > 30_000_000) throw new BestandFout("Dit bestand is te groot.");
  const soort = bestand.name.toLowerCase().split(".").pop();
  const inhoud = await bestand.arrayBuffer();
  const id = await vingerafdruk(inhoud);
  if (soort === "gpx" || soort === "tcx") return xmlLezen(new TextDecoder().decode(inhoud), id);
  if (soort === "fit") return fitLezen(inhoud, id);
  if (soort === "csv") return csvLezen(new TextDecoder().decode(inhoud), id);
  throw new BestandFout("Kies een GPX-, TCX-, FIT- of CSV-bestand.");
}

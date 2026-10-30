/** Alleen gevraagde eigen status ophalen; geen betaal-, boekings- of reserveerhandeling. */
import { alsIk, huidigeSessie } from "../api";
import { lijst } from "./bestellingen";
import { mijnPagina } from "./gasten";
import type { DienstBewijs } from "./projectals";
type Dienst = DienstBewijs["dienst"];
export async function eigenDienstBewijzen(diensten: Dienst[] = []) {
  const sessie = huidigeSessie(); if (!sessie) throw new Error("Log opnieuw in.");
  const gevraagd = [...new Set(diensten)];
  if (gevraagd.some(d => !["betaling", "boeking", "reservering"].includes(d))) throw new Error("Onbekende dienstcontrole.");
  const opvragen: Record<Dienst, () => Promise<DienstBewijs[]>> = {
    betaling: async () => {
      const bs = await lijst(), gecontroleerd = Date.now();
      return bs.map(b => ({ dienst: "betaling", id: b.id, status: b.status, gecontroleerd, betaalwijze: b.betaalwijze, rol: b.rol, ander_id: b.ander_id }));
    },
    boeking: async () => {
      const p = await mijnPagina(), gecontroleerd = Date.now();
      return p.boekingen.map(b => ({ dienst: "boeking", id: b.id, status: b.status, gecontroleerd }));
    },
    reservering: async () => {
      const p = await alsIk<{ reserveringen: { id: number; status: string }[] }>("mijn_reserveringen"), gecontroleerd = Date.now();
      return (p.reserveringen ?? []).map(b => ({ dienst: "reservering", id: b.id, status: b.status, gecontroleerd }));
    },
  };
  const uit = await Promise.allSettled(gevraagd.map(d => opvragen[d]()));
  if (huidigeSessie() !== sessie) throw new Error("Account gewijzigd.");
  const bewijzen: DienstBewijs[] = [], fouten: string[] = [];
  uit.forEach((r, i) => {
    if (r.status === "fulfilled") bewijzen.push(...r.value);
    else fouten.push(`${gevraagd[i] === "betaling" ? "Betaalstatus" : gevraagd[i] === "boeking" ? "Boekingsstatus" : "Reserveringsstatus"} niet bereikbaar.`);
  });
  return { bewijzen, fouten };
}

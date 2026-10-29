// "Voor jou" op Vandaag: wat er in de rest van de app op jou wacht, op één plek. Uit je huishoudens (wat jij vandaag
// haalt of brengt, jouw klus van deze week, uitnodigingen) en je bestellingen. Alles los opgehaald: als
// één onderdeel niet lukt, komt de rest gewoon.
import type { Bestemming } from "./naar";

export type Melding = { sleutel: string; tekst: string; naar: Bestemming; eerst?: () => void };

const uur = (iso: string) => new Date(iso).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });

export async function voorJou(): Promise<Melding[]> {
  const [huis, bestel] = await Promise.all([
    import("./huishouden"), import("./bestellingen"),
  ]);
  const uit: Melding[] = [];
  const naarHuis: Bestemming = { tab: "instellingen", onderdeel: "huishouden" };

  const [taken, huishoudens, bestellingen] = await Promise.all([
    huis.mijnTaken(1).catch(() => []),
    huis.mijnHuishoudens().catch(() => []),
    bestel.lijst().catch(() => []),
  ]);

  for (const t of taken.filter((x) => new Date(x.start).getTime() > Date.now() - 3600_000).slice(0, 3))
    uit.push({ sleutel: `huis:${t.id}`, tekst: `${uur(t.start)} ${huis.omschrijving(t)}`, naar: naarHuis });

  const uitnodigingen = huishoudens.filter((h) => h.status === "uitgenodigd");
  if (uitnodigingen.length)
    uit.push({ sleutel: "huis:uitnodiging", naar: naarHuis,
      tekst: uitnodigingen.length === 1 ? `${uitnodigingen[0].door} nodigt je uit voor ${uitnodigingen[0].naam}` : `${uitnodigingen.length} uitnodigingen voor een huishouden` });

  // Jouw klus van deze week (of vandaag), uit huishoudens die klussen gebruiken.
  const metKlussen = huishoudens.filter((h) => h.status === "lid" && h.tools.includes("klussen")).slice(0, 5);
  const klussen = (await Promise.all(metKlussen.map((h) => huis.klussen(h.id).catch(() => [])))).flat();
  const ik = new Set(huishoudens.flatMap((h) => h.leden.filter((l) => l.ik).map((l) => l.id)));
  const mijnKlussen = klussen.filter((k) => ik.has(k.wie) && !k.klaar);
  if (mijnKlussen.length)
    uit.push({ sleutel: "huis:klus", naar: naarHuis,
      tekst: `${mijnKlussen[0].elke === "dag" ? "Vandaag" : "Deze week"} jouw beurt: ${mijnKlussen.map((k) => k.titel.toLowerCase()).join(", ")}` });

  const wacht = bestellingen.filter(bestel.wachtOpMij).length;
  if (wacht)
    uit.push({ sleutel: "bestellingen", naar: { tab: "chat" }, eerst: () => bestel.openVragen(),
      tekst: wacht === 1 ? "Een bestelling wacht op jou" : `${wacht} bestellingen wachten op jou` });
  return uit;
}

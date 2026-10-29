// "Voor jou" op Vandaag: wat er in de rest van de app op jou wacht, op één plek. Uit je huishoudens (wat jij vandaag
// haalt of brengt, jouw klus van deze week, uitnodigingen) en je bestellingen. Alles los opgehaald: als
// één onderdeel niet lukt, komt de rest gewoon.
import type { Gebruiker } from "../api";
import { instellingenOpenen, type Bestemming } from "./naar";

export type Melding = { sleutel: string; tekst: string; naar: Bestemming; eerst?: () => void };

const uur = (iso: string) => new Date(iso).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });

export async function voorJou(gebruiker?: Gebruiker): Promise<Melding[]> {
  const [huis, bestel, aanmelden] = await Promise.all([
    import("./huishouden"), import("./bestellingen"), import("./aanmelden"),
  ]);
  const uit: Melding[] = [];
  const naarHuis: Bestemming = { tab: "instellingen", onderdeel: "huishouden" };

  const [taken, huishoudens, bestellingen, mail] = await Promise.all([
    huis.mijnTaken(1).catch(() => []),
    huis.mijnHuishoudens().catch(() => []),
    bestel.lijst().catch(() => []),
    gebruiker?.email && !gebruiker.email_bevestigd ? aanmelden.mailIngesteld() : false,
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

  // Pas als de app mail kan versturen: anders kun je er niets mee.
  if (mail)
    uit.push({ sleutel: "mail:bevestigen", naar: { tab: "instellingen" }, eerst: () => instellingenOpenen("account"),
      tekst: "Bevestig je mailadres, dan kun je altijd bij je account" });
  return uit;
}

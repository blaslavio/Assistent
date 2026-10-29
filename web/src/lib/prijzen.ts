// Prijzen vergelijken tussen supermarkten, met de open prijsgegevens van Checkjebon (elke dag bijgewerkt, vrij te
// gebruiken). Het bestand is groot, dus het wordt pas geladen als je erom vraagt en daarna een halve dag bewaard.
// Alles gebeurt op je eigen telefoon: je boodschappenlijst gaat nergens heen.

export const PRIJZEN_URL = "https://raw.githubusercontent.com/supermarkt/checkjebon/main/data/supermarkets.json";
const BEWAAR = 12 * 60 * 60 * 1000;

type RuwProduct = { n: string; p?: number; s?: string; l?: string };
type RuweWinkel = { n: string; c: string; u?: string; d?: RuwProduct[] };
export type Winkel = { code: string; naam: string; url: string; producten: { naam: string; laag: string; prijs: number; maat: string; l: string }[] };
export type Gevonden = { naam: string; prijs: number; maat: string; link: string };
export type Regel = { zoekterm: string; product: Gevonden | null; schatting: number | null };
export type Vergelijking = { code: string; naam: string; regels: Regel[]; gevonden: number; totaal: number };

const NAMEN: Record<string, string> = { ah: "Albert Heijn", lidl: "Lidl", plus: "Plus", spar: "Spar", aldi: "Aldi" };

export function winkelsUit(ruw: RuweWinkel[]): Winkel[] {
  return ruw.filter((w) => w.d?.length).map((w) => ({
    code: w.n, naam: NAMEN[w.n] ?? w.c, url: w.u ?? "",
    producten: (w.d ?? []).filter((p) => p.p && p.n).map((p) => ({ naam: p.n, laag: p.n.toLowerCase(), prijs: p.p!, maat: p.s ?? "", l: p.l ?? "" })),
  }));
}

let geheugen: { tijd: number; winkels: Winkel[] } | null = null;
let bezig: Promise<Winkel[]> | null = null;

/** Alle supermarkten met hun producten. Uit het geheugen, de cache van de browser, of opnieuw opgehaald. */
export function prijzen(): Promise<Winkel[]> {
  if (geheugen && Date.now() - geheugen.tijd < BEWAAR) return Promise.resolve(geheugen.winkels);
  bezig ??= (async () => {
    let antwoord: Response | undefined;
    let cache: Cache | undefined;
    try {
      cache = await caches.open("prijzen");
      const oud = await cache.match(PRIJZEN_URL);
      if (oud && Date.now() - Number(oud.headers.get("x-opgehaald") ?? 0) < BEWAAR) antwoord = oud;
    } catch { /* geen cache in deze browser */ }
    if (!antwoord) {
      const vers = await fetch(PRIJZEN_URL);
      if (!vers.ok) throw new Error("De prijzen zijn nu niet op te halen. Probeer het later nog eens.");
      const tekst = await vers.text();
      try {
        await cache?.put(PRIJZEN_URL, new Response(tekst, { headers: { "x-opgehaald": String(Date.now()) } }));
      } catch { /* dan volgende keer opnieuw */ }
      antwoord = new Response(tekst);
    }
    const winkels = winkelsUit(await antwoord.json());
    geheugen = { tijd: Date.now(), winkels };
    return winkels;
  })().finally(() => { bezig = null; });
  return bezig;
}

const EENHEDEN = /^(\d+([,.]\d+)?(-|x)?|\d*(g|gr|gram|kg|kilo|ml|cl|l|liter|st|stuks?|pak|zak|blik|fles|stuk))$/;
const woorden = (t: string) => t.toLowerCase().split(/[^\p{L}\p{N}%,.-]+/u).filter(Boolean);

// Huismerkwoorden ("AH", "Jumbo", "G'woon") staan in heel veel namen van één winkel; die tellen niet als extra woord.
const huismerk = new WeakMap<Winkel, Set<string>>();
function merkwoorden(w: Winkel) {
  let set = huismerk.get(w);
  if (!set) {
    const tel = new Map<string, number>();
    for (const p of w.producten) for (const x of new Set(woorden(p.naam))) tel.set(x, (tel.get(x) ?? 0) + 1);
    set = new Set([...tel].filter(([, n]) => n > w.producten.length * 0.02).map(([x]) => x));
    huismerk.set(w, set);
  }
  return set;
}

/** Hoe gewoon een extra woord is bij deze zoekterm: "halfvolle" bij melk zit in bijna elke winkel, "toblerone" niet. */
export type Gewoon = Map<string, number>;
export function gewoonte(winkels: Winkel[], zoekterm: string): Gewoon {
  const zoek = woorden(zoekterm).filter((x) => !EENHEDEN.test(x));
  const tel = new Map<string, number>();
  for (const w of winkels) {
    const hier = new Set<string>();
    for (const p of w.producten)
      if (zoek.every((z) => p.laag.includes(z)) && pasvorm(p.naam, zoek, w)) for (const x of woorden(p.naam)) hier.add(x);
    for (const x of hier) tel.set(x, (tel.get(x) ?? 0) + 1);
  }
  return new Map([...tel].map(([x, n]) => [x, n / Math.max(winkels.length, 1)]));
}

/** De extra woorden in een naam die passen; null als de naam niet past. */
function pasvorm(naam: string, zoek: string[], w: Winkel): { samengesteld: number; kernMis: number; extra: string[] } | null {
  const merk = merkwoorden(w);
  const ws = woorden(naam).filter((x) => !EENHEDEN.test(x));
  if (!ws.length) return null;
  let samengesteld = 0;
  for (const z of zoek) {
    if (ws.includes(z)) continue;
    // "eieren" past ook bij "scharreleieren", maar niet bij "eierenkoek".
    if (!ws.some((x) => x.endsWith(z))) return null;
    samengesteld++;
  }
  // "met roomboter" of "op brood": het zoekwoord is dan een bijzaak.
  const bijzaak = zoek.some((z) => ws.some((x, i) => x === z && ["met", "op", "van", "in", "voor"].includes(ws[i - 1])));
  return { samengesteld, kernMis: ws[ws.length - 1].endsWith(zoek[zoek.length - 1]) && !bijzaak ? 0 : 1,
    extra: ws.filter((x) => !zoek.includes(x) && !merk.has(x)) };
}

// Woorden die er een ander product van maken: "chocolade eieren" zijn geen eieren, "krakelingen roomboter" geen boter.
const ANDERS = new Set(("chocolade choco snoep drop koek koeken koekjes krakelingen stroopwafels wafels taart appeltaart cake salade "
  + "grillworst worst chips popcorn saus reep repen ijs kwark yoghurt toetje pudding vla soep mix tapenade spread smeerkaas "
  + "bladerdeeg siroop sap limonade thee likeur wijn bier gesuikerde gedroogde snack snacks reepjes pasta sticks luiers shampoo "
  + "parfum kaarsen geur speelgoed mok eiwitreep kruidnootjes zeep croissant croissants spritsen olijven toast crackers "
  + "beschuit bonbons paaseieren kaasstengels").split(" "));
const DAN_ANDERS = /(koek|koekjes|cakejes|carrees|taart|taartje|wafels?|worst|chips|saus|soep|reep|repen|snoep|drank|spread|salade|stengels?|mix|slag|lettertjes|noten|pepsels|tortellini|ravioli)$/;

/** Of rij a voor rij b komt: eerste verschil telt. */
function kleiner(a: number[], b: number[]) {
  const i = a.findIndex((v, n) => v !== b[n]);
  return i >= 0 && a[i] < b[i];
}

/** Het product dat het best bij de zoekterm past; bij ongeveer gelijke pasvorm het goedkoopste. */
export function besteProduct(w: Winkel, zoekterm: string, gewoon?: Gewoon): Gevonden | null {
  const zoek = woorden(zoekterm).filter((x) => !EENHEDEN.test(x));
  if (!zoek.length) return null;
  let beste: Winkel["producten"][number] | null = null;
  let sleutel: number[] | null = null;
  for (const p of w.producten) {
    if (p.prijs < 0.1 || !zoek.every((z) => p.laag.includes(z))) continue;
    const v = pasvorm(p.naam, zoek, w);
    if (!v) continue;
    // Een samenstelling met het zoekwoord vooraan ("kaaskoekjes", "melkchocolade") is een ander product.
    const vreemd = v.extra.reduce((s, x) => s + (ANDERS.has(x) || DAN_ANDERS.test(x) || zoek.some((z) => x.startsWith(z))
      ? 3 : 0.5 + 0.5 * (1 - (gewoon?.get(x) ?? 0))), 0);
    const s = [v.samengesteld, v.kernMis, Math.round(vreemd * 2) / 2, p.prijs];
    if (!sleutel || kleiner(s, sleutel)) {
      beste = p;
      sleutel = s;
    }
  }
  if (!beste) return null;
  return { naam: beste.naam, prijs: beste.prijs, maat: beste.maat, link: beste.l && w.code !== "spar" ? w.url + beste.l : "" };
}

/** Totaal per supermarkt voor de hele lijst, goedkoopste eerst. Wat een winkel niet heeft, wordt geschat. */
export function vergelijken(winkels: Winkel[], lijst: string[]): Vergelijking[] {
  const gewoon = lijst.map((t) => gewoonte(winkels, t));
  const per = winkels.map((w) => ({ code: w.code, naam: w.naam,
    regels: lijst.map((zoekterm, i) => ({ zoekterm, product: besteProduct(w, zoekterm, gewoon[i]), schatting: null as number | null })) }));
  lijst.forEach((_, i) => {
    const prijzen_ = per.map((w) => w.regels[i].product?.prijs).filter((p): p is number => p != null);
    const gemiddeld = prijzen_.length ? prijzen_.reduce((a, b) => a + b, 0) / prijzen_.length : 0;
    for (const w of per) if (!w.regels[i].product) w.regels[i].schatting = Math.round(gemiddeld * 100) / 100;
  });
  return per.map((w) => ({ ...w, gevonden: w.regels.filter((r) => r.product).length,
    totaal: Math.round(w.regels.reduce((s, r) => s + (r.product?.prijs ?? r.schatting ?? 0), 0) * 100) / 100 }))
    .filter((w) => w.gevonden)
    // Een winkel die veel mist, zakt: zijn totaal is dan vooral geschat.
    .sort((a, b) => Number(a.gevonden < lijst.length * 0.7) - Number(b.gevonden < lijst.length * 0.7) || a.totaal - b.totaal);
}

const HOEVEEL = /(?:(\d+)\s*[x×]\s*)?(\d+(?:[.,]\d+)?)\s*([a-z]+)/;
const EENHEID: Record<string, [string, number]> = { g: ["kg", 0.001], gr: ["kg", 0.001], gram: ["kg", 0.001], kg: ["kg", 1],
  kilo: ["kg", 1], ml: ["l", 0.001], milliliter: ["l", 0.001], cl: ["l", 0.01], l: ["l", 1], liter: ["l", 1],
  st: ["stuk", 1], stuk: ["stuk", 1], stuks: ["stuk", 1] };

/** Prijs per kilo, liter of stuk uit "500 g", "0,75 l", "2 x 250 g" of "6 stuks". */
export function perEenheid(maat: string, prijs: number): { prijs: number; eenheid: string } | null {
  const m = maat.toLowerCase().match(HOEVEEL);
  if (!m || !EENHEID[m[3]]) return null;
  const [eenheid, factor] = EENHEID[m[3]];
  const totaal = Number(m[1] ?? 1) * Number(m[2].replace(",", ".")) * factor;
  return totaal > 0 ? { prijs: Math.round((prijs / totaal) * 100) / 100, eenheid } : null;
}

/** Eén product bij alle supermarkten, goedkoopste eerst (per kilo of liter als dat te vergelijken is). */
export function productVergelijken(winkels: Winkel[], zoekterm: string) {
  const gewoon = gewoonte(winkels, zoekterm);
  const uit = winkels.flatMap((w) => {
    const p = besteProduct(w, zoekterm, gewoon);
    return p ? [{ winkel: w.naam, code: w.code, ...p, per: perEenheid(p.maat, p.prijs) }] : [];
  });
  const eenheden = new Set(uit.map((r) => r.per?.eenheid).filter(Boolean));
  const per = eenheden.size === 1;
  return uit.sort((a, b) => (per ? (a.per?.prijs ?? Infinity) - (b.per?.prijs ?? Infinity) : 0) || a.prijs - b.prijs);
}

export const euro = (n: number) => `€ ${n.toFixed(2).replace(".", ",")}`;

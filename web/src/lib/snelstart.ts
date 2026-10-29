// Bliksemstart: de app toont bij het openen meteen wat je de vorige keer zag, en haalt intussen de nieuwste stand op.
// Die "momentopname" staat alleen op dit apparaat, alleen als je hier ingelogd blijft, en versleuteld (AES-GCM) met
// een sleutel die de browser zelf bewaart en die niet uit te lezen is. Uitloggen of een ingetrokken apparaat wist hem.
import type { Gebruiker, Gegevens } from "../api";

export type Momentopname = { gebruiker: Gebruiker; data: Gegevens };

const DB = "assistent-snelstart";
const BAK = "kluis";

function openen(): Promise<IDBDatabase> {
  return new Promise((ok, mis) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(BAK);
    r.onsuccess = () => ok(r.result);
    r.onerror = () => mis(r.error);
  });
}

async function bak<T>(modus: IDBTransactionMode, doe: (b: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openen();
  try {
    return await new Promise<T>((ok, mis) => {
      const t = db.transaction(BAK, modus);
      const r = doe(t.objectStore(BAK));
      t.oncomplete = () => ok(r.result);
      t.onerror = t.onabort = () => mis(t.error);
    });
  } finally {
    db.close();
  }
}

/** De sleutel van dit apparaat; wordt één keer gemaakt en kan daarna alleen gebruikt worden, nooit gelezen. */
async function sleutel(maken: boolean): Promise<CryptoKey | null> {
  const s = await bak<CryptoKey | undefined>("readonly", (b) => b.get("sleutel"));
  if (s || !maken) return s ?? null;
  const nieuw = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  await bak("readwrite", (b) => b.put(nieuw, "sleutel"));
  return nieuw;
}

const kan = () => typeof indexedDB !== "undefined" && !!globalThis.crypto?.subtle;

/** Bewaart de stand van nu voor de volgende keer, gekoppeld aan het account (zodat een ander account hem nooit ziet). */
export async function bewaren(m: Momentopname, account: string) {
  if (!kan()) return;
  try {
    const s = await sleutel(true);
    if (!s) return;
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const tekst = new TextEncoder().encode(JSON.stringify({ account, m }));
    const geheim = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, s, tekst);
    await bak("readwrite", (b) => b.put({ iv, geheim, bewaard: Date.now() }, "stand"));
  } catch {
    /* privévenster of vol: dan start de app gewoon zoals altijd */
  }
}

/** De vorige stand, als die er is en niet ouder dan 30 dagen. */
export async function lezen(account: string): Promise<Momentopname | null> {
  if (!kan()) return null;
  try {
    const s = await sleutel(false);
    const r = await bak<{ iv: Uint8Array; geheim: ArrayBuffer; bewaard: number } | undefined>("readonly", (b) => b.get("stand"));
    if (!s || !r || Date.now() - r.bewaard > 30 * 864e5) return null;
    const tekst = await crypto.subtle.decrypt({ name: "AES-GCM", iv: r.iv as Uint8Array<ArrayBuffer> }, s, r.geheim);
    const { account: van, m } = JSON.parse(new TextDecoder().decode(tekst)) as { account: string; m: Momentopname };
    return van === account && m?.data && m.gebruiker ? m : null;
  } catch {
    return null;
  }
}

/** Wist de stand én de sleutel, zodat er niets meer van je gegevens op dit apparaat staat. */
export async function wissen() {
  if (!kan()) return;
  try {
    await bak("readwrite", (b) => b.clear());
  } catch {
    /* niets te wissen */
  }
}

/** Een korte, niet terug te rekenen naam voor het account van deze apparaatsleutel. */
export async function accountVan(apparaatToken: string) {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`snelstart:${apparaatToken}`));
  return [...new Uint8Array(h).slice(0, 12)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

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

/** De vorige stand, als die er is en niet te oud is. */
export async function lezen(account: string): Promise<Momentopname | null> {
  if (!kan() || !account) return null;
  try {
    const s = await sleutel(false);
    const rij = await bak<{ iv: Uint8Array; geheim: ArrayBuffer; bewaard: number } | undefined>("readonly", (b) => b.get("stand"));
    if (!s || !rij || Date.now() - rij.bewaard > 7 * 864e5) return null;
    const tekst = await crypto.subtle.decrypt({ name: "AES-GCM", iv: rij.iv as Uint8Array<ArrayBuffer> }, s, rij.geheim);
    const p = JSON.parse(new TextDecoder().decode(tekst)) as { account?: string; m?: Momentopname };
    if (p.account !== account || !p.m?.gebruiker || !p.m?.data) return null;
    return p.m;
  } catch {
    return null;
  }
}

export async function wissen() {
  if (!kan()) return;
  try {
    await bak("readwrite", (b) => b.delete("stand"));
  } catch {
    /* */
  }
}

export async function accountVan(apparaatToken: string) {
  return apparaatToken.slice(0, 32);
}

/** Compat; echte cache via lezen(account). */
export async function laden(): Promise<null> {
  return null;
}

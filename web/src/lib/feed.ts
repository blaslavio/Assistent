// De feed bij Community's: korte berichten uit je eigen community's en uit openbare community's. Niet end-to-end
// versleuteld zoals de kanalen; dat staat er in de app ook bij. Wat je ziet stel je zelf in (instellingen.feed).
import { alsIk } from "../api";

export type Post = { id: number; community: number; community_naam: string; openbaar: boolean; lid: boolean;
  auteur: string; auteur_id: number; tekst: string; heeft_foto: boolean; aangemaakt: string; leuk: number;
  ik_leuk: boolean; van_mij: boolean; mag_weg: boolean; reacties?: number };
export type Reactie = { id: number; auteur: string; auteur_id: number; tekst: string; aangemaakt: string; mag_weg: boolean };
export type Openbaar = { id: number; naam: string; omschrijving: string; leden: number; lid: boolean };
export type Bron = "alles" | "mijn" | "openbaar";
export type FeedInstelling = { bron: Bron; verborgen: number[] };

export const BRONNEN: [Bron, string][] = [["alles", "Alles"], ["mijn", "Mijn"], ["openbaar", "Openbaar"]];

async function rpc<T>(functie: string, parameters: Record<string, unknown> = {}) {
  const a = await alsIk<T & { fout?: string }>(functie, parameters);
  if (a && typeof a === "object" && "fout" in a && a.fout) throw new Error(a.fout);
  return a as T;
}

/** Leest de bewaarde keuze; ontbreekt die, dan alles. */
export function feedInstelling(inst: Record<string, unknown> | undefined): FeedInstelling {
  const f = (inst?.feed ?? {}) as Partial<FeedInstelling>;
  const bron = BRONNEN.some(([b]) => b === f.bron) ? f.bron! : "alles";
  return { bron, verborgen: Array.isArray(f.verborgen) ? f.verborgen.filter((x) => Number.isInteger(x)) : [] };
}

export async function feed(f: FeedInstelling, voor?: string, community?: number): Promise<Post[]> {
  const a = await rpc<{ posts?: Post[] }>("community_feed", { p_bron: f.bron, p_verborgen: f.verborgen,
    p_voor: voor ?? null, p_community: community ?? null });
  return a.posts ?? [];
}

const fotos = new Map<number, Promise<string | null>>();
export function foto(post: number) {
  if (!fotos.has(post)) fotos.set(post, alsIk<string | null>("community_post_foto", { p_post: post }).catch(() => {
    fotos.delete(post);
    return null;
  }));
  return fotos.get(post)!;
}

export const plaatsen = (community: number, tekst: string, foto: string | null) =>
  rpc<{ id: number }>("community_post_plaatsen", { p_community: community, p_tekst: tekst, p_foto: foto });
export const leuk = (post: number, aan: boolean) => rpc("community_post_leuk", { p_post: post, p_aan: aan });
export const melden = (post: number, reden: string) => rpc("community_post_melden", { p_post: post, p_reden: reden });
export const weghalen = (post: number) => rpc("community_post_weg", { p_post: post });
export const reacties = (post: number) =>
  rpc<{ reacties?: Reactie[]; mag_reageren?: boolean }>("community_post_reacties", { p_post: post })
    .then((r) => ({ reacties: r.reacties ?? [], magReageren: !!r.mag_reageren }));
export const reageren = (post: number, tekst: string) =>
  rpc<{ id: number }>("community_post_reageren", { p_post: post, p_tekst: tekst.trim() });
export const reactieWeg = (reactie: number) => rpc("community_reactie_weg", { p_reactie: reactie });
export const postBekijken = async (post: number) => (await rpc<{ post: Post }>("community_post_bekijken", { p_post: post })).post;

/** De link om een bericht te delen. Op Streamlit is dat het adres van het venster eromheen. */
export function postLink(id: number) {
  let basis = location.origin + location.pathname;
  try {
    basis = window.top!.location.origin + "/";
  } catch {
    /* ander adres */
  }
  return `${basis}?post=${id}`;
}

// Een gedeelde link (?post=id) opent dat bericht, ook na het inloggen.
let gedeeld: number | null = null;
export function postVragen(waarde: string | null) {
  gedeeld = waarde && /^\d{1,12}$/.test(waarde) ? Number(waarde) : null;
  return gedeeld !== null;
}
export function postGevraagd() {
  const id = gedeeld;
  gedeeld = null;
  return id;
}

export const openbaarZetten = (community: number, aan: boolean) =>
  rpc("community_openbaar_zetten", { p_community: community, p_aan: aan });
export const ontdekken = async (zoek = "") =>
  (await rpc<{ communities?: Openbaar[] }>("openbare_communities", { p_zoek: zoek })).communities ?? [];
export const meedoen = (community: number) => rpc<{ id: number }>("community_openbaar_deelnemen", { p_community: community });

/** Een foto voor de feed: hooguit 1280 pixels, als jpg. Zo blijft hij klein genoeg. */
export async function fotoVerkleinen(bestand: Blob): Promise<string> {
  const beeld = await createImageBitmap(bestand).catch(() => {
    throw new Error("Deze foto kan ik niet openen. Probeer een jpg of png.");
  });
  const schaal = Math.min(1, 1280 / Math.max(beeld.width, beeld.height));
  const doek = document.createElement("canvas");
  doek.width = Math.round(beeld.width * schaal);
  doek.height = Math.round(beeld.height * schaal);
  doek.getContext("2d")!.drawImage(beeld, 0, 0, doek.width, doek.height);
  beeld.close();
  for (const kwaliteit of [0.82, 0.7, 0.55]) {
    const url = doek.toDataURL("image/jpeg", kwaliteit);
    if (url.length < 1_400_000) return url;
  }
  throw new Error("Deze foto is te groot.");
}

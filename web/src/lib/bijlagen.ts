// Bestanden die je aan de assistent geeft: pdf, foto's en tekst (csv, txt). Ze gaan alleen mee in dit gesprek naar
// Claude en worden nergens bewaard. Foto's maken we eerst kleiner, zodat het snel en zuinig blijft.
import type Anthropic from "@anthropic-ai/sdk";

export type Bijlage = { naam: string; soort: "pdf" | "foto" | "tekst"; grootte: number; blok: Anthropic.ContentBlockParam };

export const ACCEPTEER = ".pdf,.csv,.tsv,.txt,.md,.json,image/jpeg,image/png,image/webp,image/heic,image/heif";
const MAX_PDF = 10_000_000;
const MAX_TEKST = 400_000;
// Alles samen in één gesprek, want het hele gesprek gaat bij elke vraag opnieuw mee.
export const MAX_SAMEN = 14_000_000;

export class BijlageFout extends Error {}

function base64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

async function verkleind(bestand: Blob): Promise<string> {
  const beeld = await createImageBitmap(bestand).catch(() => {
    throw new BijlageFout("Deze foto kan ik niet openen. Probeer een jpg of png.");
  });
  const schaal = Math.min(1, 1568 / Math.max(beeld.width, beeld.height));
  const doek = document.createElement("canvas");
  doek.width = Math.round(beeld.width * schaal);
  doek.height = Math.round(beeld.height * schaal);
  doek.getContext("2d")!.drawImage(beeld, 0, 0, doek.width, doek.height);
  beeld.close();
  return doek.toDataURL("image/jpeg", 0.85).split(",")[1];
}

export async function lezen(bestand: File): Promise<Bijlage> {
  const naam = bestand.name || "bestand";
  const ext = naam.toLowerCase().split(".").pop() ?? "";
  if (bestand.type === "application/pdf" || ext === "pdf") {
    if (bestand.size > MAX_PDF) throw new BijlageFout(`${naam} is te groot (hooguit 10 MB).`);
    const data = base64(await bestand.arrayBuffer());
    return { naam, soort: "pdf", grootte: data.length,
      blok: { type: "document", title: naam, source: { type: "base64", media_type: "application/pdf", data } } };
  }
  if (bestand.type.startsWith("image/") || ["jpg", "jpeg", "png", "webp", "heic", "heif"].includes(ext)) {
    const data = await verkleind(bestand);
    return { naam, soort: "foto", grootte: data.length,
      blok: { type: "image", source: { type: "base64", media_type: "image/jpeg", data } } };
  }
  if (["csv", "tsv", "txt", "md", "json"].includes(ext) || bestand.type.startsWith("text/")) {
    const tekst = await bestand.text();
    if (tekst.length > MAX_TEKST) throw new BijlageFout(`${naam} is te lang. Kies een kortere periode of een kleiner bestand.`);
    return { naam, soort: "tekst", grootte: tekst.length,
      blok: { type: "document", title: naam, source: { type: "text", media_type: "text/plain", data: tekst } } };
  }
  if (["xlsx", "xls", "numbers"].includes(ext))
    throw new BijlageFout(`Sla ${naam} eerst op als CSV, dan kan ik het lezen.`);
  throw new BijlageFout(`${naam} kan ik niet lezen. Gebruik pdf, een foto, csv of txt.`);
}

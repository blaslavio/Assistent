// Een filmpje knippen en kleiner maken, helemaal op je eigen telefoon: niets gaat onversleuteld de deur uit.
// We spelen het gekozen stuk stil af op een onzichtbaar doek en nemen dat op (beeld en geluid). Dat duurt even lang
// als het stuk zelf, maar werkt in Safari en Chrome zonder extra bibliotheken.

export const MAX_SECONDEN = 15;
const MAX_BYTES = 1_400_000; // versleuteld en verpakt blijft dat onder de grens van de server
const SOORTEN = ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm"];

export async function duurVan(bestand: File) {
  const v = document.createElement("video");
  v.preload = "metadata";
  v.src = URL.createObjectURL(bestand);
  try {
    await new Promise<void>((klaar, mis) => {
      v.onloadedmetadata = () => klaar();
      v.onerror = () => mis(new Error("Deze video kan ik niet openen."));
    });
    return v.duration;
  } finally {
    URL.revokeObjectURL(v.src);
  }
}

const alsDataUrl = (b: Blob) => new Promise<string>((klaar, mis) => {
  const r = new FileReader();
  r.onload = () => klaar(r.result as string);
  r.onerror = () => mis(r.error);
  r.readAsDataURL(b);
});

/** Knipt `duur` seconden vanaf `start` uit het filmpje en geeft een kleine video als data-URL. */
export async function videoKlaarmaken(bestand: File, start: number, duur: number, voortgang: (deel: number) => void) {
  const soort = SOORTEN.find((s) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(s));
  if (!soort) throw new Error("Video opnemen kan niet in deze browser.");
  duur = Math.min(duur, MAX_SECONDEN);
  const v = document.createElement("video");
  v.src = URL.createObjectURL(bestand);
  v.playsInline = true;
  v.preload = "auto";
  const geluid = new AudioContext();
  try {
    await new Promise<void>((klaar, mis) => {
      v.onloadeddata = () => klaar();
      v.onerror = () => mis(new Error("Deze video kan ik niet openen."));
    });
    const schaal = Math.min(1, 720 / Math.max(v.videoWidth, v.videoHeight));
    const doek = document.createElement("canvas");
    doek.width = Math.round(v.videoWidth * schaal / 2) * 2;
    doek.height = Math.round(v.videoHeight * schaal / 2) * 2;
    const pen = doek.getContext("2d")!;
    const stroom = doek.captureStream(30);
    // Het geluid gaat alleen naar de opname, niet naar de luidspreker.
    const uitgang = geluid.createMediaStreamDestination();
    try {
      geluid.createMediaElementSource(v).connect(uitgang);
      uitgang.stream.getAudioTracks().forEach((t) => stroom.addTrack(t));
    } catch { /* zonder geluid */ }

    const opname = new MediaRecorder(stroom, { mimeType: soort, videoBitsPerSecond: 600_000, audioBitsPerSecond: 64_000 });
    const stukjes: Blob[] = [];
    opname.ondataavailable = (e) => e.data.size && stukjes.push(e.data);
    const klaar = new Promise<void>((k) => (opname.onstop = () => k()));

    v.currentTime = start;
    await new Promise((k) => (v.onseeked = k));
    await geluid.resume();
    opname.start(500);
    // Lukt afspelen met geluid niet (zoals soms op de iPhone), dan zonder geluid.
    await v.play().catch(async () => { v.muted = true; await v.play(); });
    const einde = start + duur;
    await new Promise<void>((k) => {
      const teken = () => {
        pen.drawImage(v, 0, 0, doek.width, doek.height);
        voortgang(Math.min(1, (v.currentTime - start) / duur));
        if (v.currentTime >= einde || v.ended) return k();
        requestAnimationFrame(teken);
      };
      teken();
    });
    v.pause();
    opname.stop();
    await klaar;
    const blob = new Blob(stukjes, { type: soort.split(";")[0] });
    if (blob.size > MAX_BYTES) throw new Error("Dit stuk is te groot. Kies een korter stuk.");
    return { video: await alsDataUrl(blob), duur: Math.min(duur, v.currentTime - start) };
  } finally {
    URL.revokeObjectURL(v.src);
    geluid.close().catch(() => {});
  }
}

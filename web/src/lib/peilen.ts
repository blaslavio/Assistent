// Steeds even kijken of er iets nieuws is, maar rustiger naarmate er niets gebeurt. Zolang er berichten binnenkomen of
// je iets doet, kijkt de app snel; is het stil, dan steeds wat minder vaak (tot `traag`). Komt de app weer in beeld,
// dan kijkt hij meteen. Zo blijft het vlot voor wie chat, en vraagt een stil scherm bijna niets van de server.
export type Peiler = { stop: () => void; nu: () => void };

export function peilen(kijk: () => Promise<boolean | void>, snel: number, traag: number): Peiler {
  let wacht = snel, klok = 0, uit = false, bezig = false;
  const plan = () => { clearTimeout(klok); if (!uit) klok = window.setTimeout(ronde, wacht); };
  async function ronde() {
    if (uit) return;
    if (bezig) return plan();
    if (document.visibilityState === "visible") {
      bezig = true;
      let nieuw = false;
      try { nieuw = (await kijk()) === true; } catch { /* volgende ronde */ }
      bezig = false;
      wacht = nieuw ? snel : Math.min(traag, Math.round(wacht * 1.5));
    }
    plan();
  }
  const nu = () => { wacht = snel; clearTimeout(klok); ronde(); };
  const zichtbaar = () => { if (document.visibilityState === "visible") nu(); };
  const actief = () => { if (wacht > snel) { wacht = snel; plan(); } };
  document.addEventListener("visibilitychange", zichtbaar);
  window.addEventListener("pointerdown", actief, { passive: true });
  window.addEventListener("keydown", actief, { passive: true });
  plan();
  return {
    nu,
    stop() {
      uit = true;
      clearTimeout(klok);
      document.removeEventListener("visibilitychange", zichtbaar);
      window.removeEventListener("pointerdown", actief);
      window.removeEventListener("keydown", actief);
    },
  };
}

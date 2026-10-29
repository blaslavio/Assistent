// Slechte of geen verbinding: gewone taal in plaats van "Failed to fetch", en de app weet of je online bent.
import { useEffect, useState } from "react";

export const GEEN_INTERNET = "Geen internet. Controleer je verbinding en probeer het opnieuw.";
export const WEGGEVALLEN = "De verbinding viel even weg. Probeer het zo opnieuw.";
export const TE_LANG = "Dat duurt te lang. Probeer het zo opnieuw.";

/** Een fout door de verbinding: `status` 0, met een melding die iedereen begrijpt. */
export class Verbindingsfout extends Error {
  status = 0;
  constructor(bericht = navigator.onLine === false ? GEEN_INTERNET : WEGGEVALLEN) {
    super(bericht);
    this.name = "Verbindingsfout";
  }
}

/** Wat de browser zegt als een verzoek niet aankomt: Safari "Load failed", Chrome "Failed to fetch", Firefox "NetworkError". */
export const isNetwerkfout = (e: unknown) =>
  e instanceof TypeError && /load failed|failed to fetch|networkerror|network connection|internet/i.test(e.message);

/** De melding voor een mislukt verzoek met een HTTP-status. */
export function statusTekst(status: number) {
  if (status === 429) return "Even te veel tegelijk. Wacht een paar tellen en probeer het opnieuw.";
  if (status === 408 || status === 504) return TE_LANG;
  if (status >= 500) return "De server heeft even een storing. Probeer het zo opnieuw.";
  return `Dat lukte niet (fout ${status}). Probeer het opnieuw.`;
}

/** Een foutmelding om te laten zien: technische meldingen van de browser worden gewone taal. */
export function foutTekst(e: unknown, anders = "Dat lukte niet. Probeer het opnieuw.") {
  if (isNetwerkfout(e)) return new Verbindingsfout().message;
  if (e instanceof DOMException && e.name === "TimeoutError") return TE_LANG;
  if (e instanceof Error && e.message) return e.message;
  return anders;
}

/**
 * Elk verzoek van de app, ook van onderdelen die zelf fetch gebruiken: een verzoek dat niet aankomt, geeft een
 * Verbindingsfout met een duidelijke melding. Afbreken (stoppen) blijft afbreken.
 */
export function netVolgen() {
  const origineel = globalThis.fetch.bind(globalThis);
  globalThis.fetch = async (...args: Parameters<typeof fetch>) => {
    try {
      return await origineel(...args);
    } catch (e) {
      if (isNetwerkfout(e)) throw new Verbindingsfout();
      throw e;
    }
  };
}

/** Of dit apparaat online is; werkt mee als de verbinding wegvalt of terugkomt. */
export function useOnline() {
  const [online, setOnline] = useState(() => navigator.onLine !== false);
  useEffect(() => {
    const aan = () => setOnline(true);
    const uit = () => setOnline(false);
    addEventListener("online", aan);
    addEventListener("offline", uit);
    return () => { removeEventListener("online", aan); removeEventListener("offline", uit); };
  }, []);
  return online;
}

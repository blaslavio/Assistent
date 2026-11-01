// Bestelkaart in de assistent: zelfde bevestigingspatroon als chat/bestellingen.
import { Vinkje } from "../iconen";
import { BETAALWIJZE, LEVERING, type Bestelling } from "../lib/winkelen";
import {
  BetaalBevestiging,
  bedragTekst,
  betaalKnopKlasse,
  secundaireKnopKlasse,
} from "./BetaalBevestiging";

export type Bestelkaart = {
  b: Bestelling;
  status: "klaar" | "bezig" | "besteld";
  fout?: string;
  bedrag?: number;
};

/** Klaargezette bestelling: gebruiker bevestigt zelf vóór er iets weggaat. */
export function BestelKaart({
  kaart,
  bestel,
  naarBestellingen,
}: {
  kaart: Bestelkaart;
  bestel: () => void;
  naarBestellingen?: () => void;
}) {
  const { b } = kaart;
  const totaal = kaart.bedrag ?? b.product.prijs * b.aantal;
  const winkel = b.product.bron === "winkel";
  const titel = `${b.aantal > 1 ? `${b.aantal}× ` : ""}${b.product.titel}`;
  const details = (
    <p>
      {b.product.verkoper}
      {" · "}
      {LEVERING[b.levering] ?? b.levering}
      {!winkel ? ` · ${BETAALWIJZE[b.betaalwijze] ?? b.betaalwijze}` : ""}
    </p>
  );

  if (kaart.status === "besteld") {
    return (
      <div className="flex flex-col gap-3 rounded-2xl border border-lijn p-4">
        <p className="flex items-start gap-2 text-[15px]">
          <Vinkje className="mt-0.5 size-5 shrink-0 text-accent" />
          <span>
            {winkel
              ? "Besteld. Afrekenen doe je bij Bestellingen."
              : "Verzoek verstuurd. De verkoper laat weten of het doorgaat."}{" "}
            <button type="button" onClick={naarBestellingen} className="font-medium text-accent">
              Naar Bestellingen
            </button>
          </span>
        </p>
        <p className="text-sm text-rustig">
          {titel} · {bedragTekst(totaal)}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {kaart.fout && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {kaart.fout}
        </p>
      )}
      <BetaalBevestiging
        titel={titel}
        bedrag={totaal}
        tegenpartij={b.product.verkoper}
        details={details}
        waarschuwing={
          winkel
            ? (b.levering === "verzenden" ? "Verzendkosten komen er eventueel bij. " : "") +
              "Er gaat pas iets weg als je bevestigt. Assistent bestelt of betaalt nooit zelf."
            : "De verkoper moet het eerst accepteren. Er gaat pas iets weg als je bevestigt."
        }
        primaireActie={
          <button
            type="button"
            onClick={bestel}
            disabled={kaart.status === "bezig"}
            className={betaalKnopKlasse}
          >
            {kaart.status === "bezig"
              ? "Bezig…"
              : winkel
                ? `Bestellen · ${bedragTekst(totaal)}`
                : "Koopverzoek sturen"}
          </button>
        }
        secundair={
          naarBestellingen ? (
            <button type="button" className={secundaireKnopKlasse} onClick={naarBestellingen}>
              Bestellingen
            </button>
          ) : undefined
        }
      />
    </div>
  );
}

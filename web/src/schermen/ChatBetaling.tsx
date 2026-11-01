import { useRef, useState } from "react";
import { huidigeSessie } from "../api";
import { lijst, stand, type Bestelling } from "../lib/bestellingen";
import { betaalbericht, chatCheckout, eigenBetaalverzoek } from "../lib/chatbetaling";
import { versturen } from "../lib/chat";
import {
  BetaalBevestiging,
  bedragTekst,
  betaalKnopKlasse,
  secundaireKnopKlasse,
} from "./BetaalBevestiging";

export function BetaalverzoekMaken({
  gesprek,
  ander,
  vernieuw,
}: {
  gesprek: number;
  ander: number;
  vernieuw: () => Promise<void>;
}) {
  const [orders, setOrders] = useState<Bestelling[]>([]);
  const [pending, setPending] = useState<Bestelling | null>(null);
  const [fout, setFout] = useState("");
  const [melding, setMelding] = useState("");
  const [bezig, setBezig] = useState(false);
  const slot = useRef(false);

  async function doe(taak: () => Promise<void>) {
    if (slot.current) return;
    slot.current = true;
    setBezig(true);
    setFout("");
    const sessie = huidigeSessie();
    try {
      await taak();
    } catch (e) {
      if (huidigeSessie() === sessie) setFout((e as Error).message);
    } finally {
      slot.current = false;
      setBezig(false);
    }
  }

  return (
    <details className="border-b border-lijn px-4 py-2">
      <summary className="min-h-11 cursor-pointer">Betaalverzoek in deze chat</summary>
      <p className="mt-2 text-sm text-rustig">
        Alleen een geaccepteerde eigen appbestelling met deze gesprekspartner. De chat deelt alleen
        het bestelnummer; bedrag en status komen uit je eigen administratie.
      </p>
      {fout && (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {fout}
        </p>
      )}
      {melding && (
        <p role="status" className="mt-2 text-sm text-rustig">
          {melding}
        </p>
      )}
      <button
        disabled={bezig || !!pending}
        className="mt-2 min-h-11 text-accent"
        onClick={() =>
          doe(async () => {
            const s = huidigeSessie();
            const bs = await lijst();
            if (huidigeSessie() !== s) return;
            const eigen = bs.filter(
              (b) =>
                b.rol === "verkoper" &&
                b.ander_id === ander &&
                b.betaalwijze === "app" &&
                b.status === "geaccepteerd",
            );
            setOrders(eigen);
            setMelding(
              eigen.length
                ? "Kies een bestelling."
                : "Geen passende bestelling. Maak of accepteer eerst de bestelling bij Bestellingen.",
            );
          })
        }
      >
        Eigen betaalverzoeken ophalen
      </button>
      {!pending &&
        orders.map((b) => (
          <button
            disabled={bezig}
            key={b.id}
            className="mt-1 block min-h-11 text-left text-accent"
            onClick={() => setPending(b)}
          >
            Controleer #{b.id} · {b.titel} · {bedragTekst(b.bedrag)}
          </button>
        ))}
      {pending && (
        <div className="mt-3">
          <BetaalBevestiging
            titel={pending.titel}
            bedrag={pending.bedrag}
            tegenpartij={pending.ander}
            status={stand(pending)}
            details={
              <p>
                Delen met deze gesprekspartner als betaalverzoek #{pending.id}. Er wordt geen geld
                afgeschreven.
              </p>
            }
            waarschuwing="Alleen het bestelnummer gaat naar de chat. Bedrag en status blijven in jouw administratie."
            primaireActie={
              <button
                disabled={bezig}
                className={betaalKnopKlasse}
                onClick={() =>
                  doe(async () => {
                    const s = huidigeSessie();
                    const vers = await eigenBetaalverzoek(pending.id, ander, "verkoper");
                    if (
                      vers.status !== "geaccepteerd" ||
                      vers.bedrag !== pending.bedrag ||
                      vers.titel !== pending.titel
                    ) {
                      throw new Error("Bestelling gewijzigd. Sluit en controleer opnieuw.");
                    }
                    await versturen(gesprek, {
                      t: "projectbetaling",
                      versie: 1,
                      bestelling: pending.id,
                    });
                    if (huidigeSessie() !== s) return;
                    setPending(null);
                    setOrders([]);
                    setMelding(
                      "Betaalverzoek gedeeld. Een herhaalde kaart blijft gekoppeld aan dezelfde bestelling.",
                    );
                    await vernieuw();
                  })
                }
              >
                Bevestig delen van betaalverzoek
              </button>
            }
            secundair={
              <button disabled={bezig} className={secundaireKnopKlasse} onClick={() => setPending(null)}>
                Sluiten
              </button>
            }
          />
        </div>
      )}
    </details>
  );
}

export function ChatBetaalkaart({
  bericht,
  ander,
  mijn,
}: {
  bericht: unknown;
  ander: number;
  mijn: boolean;
}) {
  const [b, setB] = useState<Bestelling | null>(null);
  const [fout, setFout] = useState("");
  const [bezig, setBezig] = useState(false);
  const slot = useRef(false);
  const v = betaalbericht(bericht);

  async function doe(checkout = false) {
    if (slot.current || !v) return;
    slot.current = true;
    setBezig(true);
    setFout("");
    const s = huidigeSessie();
    try {
      if (checkout) {
        if (!b) return;
        const url = await chatCheckout(v.bestelling, ander, b);
        if (huidigeSessie() === s) window.location.assign(url);
      } else {
        const vers = await eigenBetaalverzoek(v.bestelling, ander, mijn ? "verkoper" : "koper");
        if (huidigeSessie() === s) setB(vers);
      }
    } catch (e) {
      if (huidigeSessie() === s) {
        setB(null);
        setFout((e as Error).message);
      }
    } finally {
      slot.current = false;
      setBezig(false);
    }
  }

  if (!v) return <p>Ongeldig betaalverzoek.</p>;

  return (
    <section
      aria-label={`Betaalkaart voor bestelling ${v.bestelling}`}
      className="not-italic w-full min-w-[240px] max-w-sm space-y-3"
    >
      <p className="text-xs text-rustig">
        Bestelling #{v.bestelling}. Dit is geen betalingsbewijs — gegevens komen uit je eigen
        administratie.
      </p>
      {fout && (
        <p role="alert" className="text-sm text-red-600">
          {fout}
        </p>
      )}
      {b ? (
        <BetaalBevestiging
          titel={b.titel}
          bedrag={b.bedrag}
          tegenpartij={b.ander}
          status={stand(b)}
          details={
            <p>
              {b.aantal && b.aantal > 0 ? `${b.aantal} stuks · ` : ""}
              {b.levering || "Levering volgens afspraak"}
            </p>
          }
          waarschuwing="Controleer verzendkosten en de definitieve afrekening. Daarna ga je naar de beveiligde betaalpagina; Assistent ziet je kaartgegevens niet."
          primaireActie={
            !mijn && b.status === "geaccepteerd" ? (
              <button
                disabled={bezig}
                className={betaalKnopKlasse}
                onClick={() => doe(true)}
              >
                {bezig ? "Bezig…" : "Verder naar beveiligd betalen"}
              </button>
            ) : undefined
          }
          secundair={
            <button disabled={bezig} className={secundaireKnopKlasse} onClick={() => doe()}>
              Bedrag en status opnieuw controleren
            </button>
          }
        />
      ) : (
        <button
          disabled={bezig}
          className={`${betaalKnopKlasse} w-full`}
          onClick={() => doe()}
        >
          {bezig ? "Ophalen…" : "Actueel bedrag en status controleren"}
        </button>
      )}
    </section>
  );
}

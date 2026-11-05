// Bestellingen: wat jij kocht en verkocht, waar je geld staat, en de stap die nu aan jou is.
import { useCallback, useEffect, useState } from "react";
import { Terug } from "../iconen";
import { klaar, lijst, stand, stappen, uitvoeren, wachtOpMij, type Bestelling, type Stap } from "../lib/bestellingen";
import { Laden, FoutBalk } from "./Status";
import {
  BetaalBevestiging,
  bedragTekst,
  betaalKnopKlasse,
  secundaireKnopKlasse,
} from "./BetaalBevestiging";
import { Vergelijken, ZoekBalk } from "./ZoekVergelijk";
import { StatusBanner, ProductLijn, BestelTotalen } from "./BestelStatus";
import { BestelBon } from "./BestelBon";

export default function Bestellingen({ terug, melding: begin, bon }: { terug?: () => void; melding?: string; bon?: number }) {
  const [alle, setAlle] = useState<Bestelling[] | null>(null);
  const [fout, setFout] = useState("");
  const [melding, setMelding] = useState(begin ?? "");
  const [zoek, setZoek] = useState("");
  const [vergelijk, setVergelijk] = useState<Bestelling | null>(null);
  const [open, setOpen] = useState<number | null>(bon ?? null);

  const laden = useCallback(() => {
    lijst()
      .then((l) => {
        setAlle(l);
        setFout("");
      })
      .catch(() => setFout("Bestellingen laden lukte niet. Probeer het zo opnieuw."));
  }, []);
  useEffect(laden, [laden]);

  const q = zoek.trim().toLowerCase();
  const gevonden =
    alle?.filter((b) => !q || `${b.titel} ${b.ander}`.toLowerCase().includes(q)) ?? null;
  const groepen: [string, Bestelling[]][] = gevonden
    ? [
        ["Wacht op jou", gevonden.filter(wachtOpMij)],
        ["Lopend", gevonden.filter((b) => !wachtOpMij(b) && !klaar(b))],
        ["Klaar", gevonden.filter(klaar)],
      ]
    : [];
  const term = vergelijk?.titel ?? zoek;
  const openBon = open != null ? alle?.find((b) => b.id === open) : undefined;

  return (
    <div className="opkomen flex flex-col gap-5 px-6 pb-8">
      {terug && (
        <>
          <button onClick={terug} className="-ml-2 flex h-10 w-fit items-center gap-1 pr-3 text-rustig">
            <Terug className="size-5" /> Winkel
          </button>
          <h2 className="-mt-2 text-2xl font-semibold tracking-tight">Bestellingen</h2>
        </>
      )}
      {(alle?.length ?? 0) > 0 && (
        <ZoekBalk
          waarde={vergelijk ? vergelijk.titel : zoek}
          zet={(t) => {
            setVergelijk(null);
            setZoek(t);
          }}
          plek="Zoek in bestellingen en vergelijk"
        />
      )}
      {melding && (
        <p role="status" className="rounded-2xl bg-vlak px-4 py-3 text-[15px]">
          {melding}
        </p>
      )}
      {fout && <FoutBalk tekst={fout} opnieuw={laden} />}
      {alle === null && !fout && <Laden tekst="Bestellingen laden" />}
      {alle?.length === 0 && (
        <p className="text-rustig">Nog geen bestellingen. Zodra je iets koopt of verkoopt, staat het hier.</p>
      )}
      {groepen.map(
        ([naam, items]) =>
          items.length > 0 && (
            <section key={naam}>
              <h3 className="mb-2 px-1 text-[13px] font-semibold uppercase tracking-[0.06em] text-rustig">
                {naam}
              </h3>
              <ul className="flex flex-col gap-3">
                {items.map((b) => (
                  <Regel
                    key={b.id}
                    b={b}
                    klaar={(m) => {
                      setMelding(m);
                      laden();
                      window.scrollTo?.(0, 0);
                    }}
                    bekijk={() => setOpen(b.id)}
                    vergelijk={() => {
                      setVergelijk(b);
                      setZoek(b.titel);
                      window.scrollTo?.(0, 0);
                    }}
                  />
                ))}
              </ul>
            </section>
          ),
      )}
      {term && vergelijk && <Vergelijken term={term} />}
      {openBon && <BestelBon b={openBon} sluit={() => setOpen(null)} />}
      <p className="text-[13px] text-zacht">
        Bij betalen via de app staat je geld veilig bij Stripe en gaat het pas naar de verkoper als
        jij bevestigt dat alles goed is.
      </p>
    </div>
  );
}

function Regel({
  b,
  klaar: gedaan,
  vergelijk,
  bekijk,
}: {
  b: Bestelling;
  klaar: (melding: string) => void;
  vergelijk: () => void;
  bekijk: () => void;
}) {
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState("");
  const [probleem, setProbleem] = useState<string | null>(null);
  const [betaalBevestig, setBetaalBevestig] = useState(false);
  const totaal = b.bedrag + (b.rol === "koper" ? Number(b.kosten ?? 0) : 0);
  const acties = stappen(b);
  const betaalStap = acties.find((s) => s.actie === "betalen");

  async function doe(s: Stap, toelichting = "") {
    if (s.toelichting && probleem === null) return setProbleem("");
    setBezig(true);
    setFout("");
    try {
      const url = await uitvoeren(b, s.actie, toelichting);
      if (url) {
        (window.top ?? window).location.href = url;
        return;
      }
      gedaan(
        s.actie === "probleem"
          ? "Je melding is verstuurd. Het geld blijft vast tot het is opgelost."
          : s.actie === "ontvangen"
            ? "Bevestigd. Fijn dat alles goed is."
            : "Bijgewerkt.",
      );
      setBetaalBevestig(false);
    } catch (e) {
      setFout(e instanceof Error ? e.message : "Dat lukte niet.");
    } finally {
      setBezig(false);
    }
  }

  return (
    <li className="flex flex-col gap-3 rounded-2xl border border-lijn px-4 py-3">
      <StatusBanner b={b} />
      <div className="flex items-start gap-3">
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="font-semibold">{b.ander}</span>
          <span className="text-[13px] text-rustig">
            {b.rol === "koper" ? "Verkoper" : "Koper"}
            {b.levering ? ` · ${b.levering}` : ""}
          </span>
        </span>
        <span className="shrink-0 text-lg font-bold tabular-nums">{bedragTekst(totaal)}</span>
      </div>
      <ProductLijn titel={b.titel} aantal={b.aantal ?? 1} bedrag={b.bedrag} />
      {(Number(b.kosten) > 0 || Number(b.verzendkosten) > 0) && (
        <BestelTotalen
          regels={[
            { label: "Producten", bedrag: b.bedrag },
            ...(Number(b.verzendkosten) > 0 ? [{ label: "Verzending", bedrag: Number(b.verzendkosten) }] : []),
            ...(Number(b.kosten) > 0 ? [{ label: "Servicekosten", bedrag: Number(b.kosten) }] : []),
            { label: "Totaal", bedrag: totaal, nadruk: true },
          ]}
        />
      )}
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[13px] text-rustig">
          {stand(b)}
          {b.track_code ? ` · ${b.vervoerder ?? ""} ${b.track_code}` : ""}
        </p>
        <span className="flex shrink-0 gap-4">
          <button onClick={bekijk} className="text-sm font-medium text-accent">Bekijk bon</button>
          <button onClick={vergelijk} className="text-sm font-medium text-accent">Vergelijk</button>
        </span>
      </div>

      {betaalBevestig && betaalStap && (
        <BetaalBevestiging
          titel={b.titel}
          bedrag={totaal}
          tegenpartij={b.ander}
          status={stand(b)}
          details={
            b.track_code ? (
              <p>
                {b.vervoerder} {b.track_code}
              </p>
            ) : undefined
          }
          primaireActie={
            <button
              disabled={bezig}
              className={betaalKnopKlasse}
              onClick={() => doe(betaalStap)}
            >
              {bezig ? "Bezig\u2026" : `Betalen \u00b7 ${bedragTekst(totaal)}`}
            </button>
          }
          secundair={
            <button
              disabled={bezig}
              className={secundaireKnopKlasse}
              onClick={() => setBetaalBevestig(false)}
            >
              Annuleren
            </button>
          }
        />
      )}

      {probleem !== null ? (
        <div className="flex flex-col gap-2">
          <textarea
            value={probleem}
            onChange={(e) => setProbleem(e.target.value)}
            rows={3}
            autoFocus
            placeholder="Wat is er mis? Bijvoorbeeld: niet ontvangen of kapot."
            className="w-full resize-none rounded-2xl bg-vlak px-4 py-3 outline-none placeholder:text-zacht"
          />
          <div className="flex gap-2">
            <button
              disabled={bezig || !probleem.trim()}
              onClick={() => doe({ actie: "probleem", naam: "" }, probleem.trim())}
              className="h-10 rounded-full bg-accent px-4 text-sm font-medium text-white disabled:opacity-40"
            >
              Melding versturen
            </button>
            <button onClick={() => setProbleem(null)} className="h-10 rounded-full px-4 text-sm text-rustig">
              Annuleer
            </button>
          </div>
        </div>
      ) : (
        !betaalBevestig &&
        acties.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {acties.map((s) => (
              <button
                key={s.actie}
                disabled={bezig}
                onClick={() => {
                  if (s.actie === "betalen") setBetaalBevestig(true);
                  else doe(s);
                }}
                className={`h-10 rounded-full px-4 text-sm font-medium disabled:opacity-50 ${
                  s.hoofd ? "bg-accent text-white" : "bg-vlak"
                }`}
              >
                {s.actie === "betalen" ? `Betalen \u00b7 ${bedragTekst(totaal)}` : s.naam}
              </button>
            ))}
          </div>
        )
      )}
      {fout && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {fout}
        </p>
      )}
    </li>
  );
}

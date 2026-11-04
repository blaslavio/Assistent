// Betaalde tickets instellen voor een evenement: ticketsoorten in je eigen webshop en een korte omschrijving.
import { useCallback, useEffect, useRef, useState } from "react";
import { huidigeSessie } from "../api";
import { studioOpenen } from "../lib/naar";
import { euro } from "../lib/winkelen";
import { eigenSoorten, omschrijvingBewaren, soortBewaren, soortControle, type EigenSoort } from "../lib/eventpagina";

const veld = "mt-1 min-h-11 w-full rounded-xl bg-vlak px-3";
const knop = "min-h-11 rounded-full bg-accent px-4 text-sm font-medium text-white disabled:opacity-40";
const stil = "min-h-11 rounded-full bg-vlak px-4 text-sm font-medium disabled:opacity-40";

type Stand = Awaited<ReturnType<typeof eigenSoorten>>;

export default function TicketVerkoop({ evenement }: { evenement: number }) {
  const [stand, setStand] = useState<Stand | null>(null);
  const [fout, setFout] = useState("");
  const [melding, setMelding] = useState("");
  const [bewerk, setBewerk] = useState<EigenSoort | "nieuw" | null>(null);
  const [ronde, setRonde] = useState(0);
  const sessie = useRef(huidigeSessie());
  const zelfde = useCallback(() => huidigeSessie() === sessie.current, []);
  useEffect(() => {
    let oud = false;
    eigenSoorten(evenement).then((s) => { if (!oud && zelfde()) { setStand(s); setFout(""); } })
      .catch((e) => { if (!oud && zelfde()) setFout(e instanceof Error ? e.message : "Ophalen lukte niet."); });
    return () => { oud = true; };
  }, [evenement, ronde, zelfde]);
  const klaar = (tekst: string) => { setBewerk(null); setMelding(tekst); setRonde((n) => n + 1); };

  return (
    <section aria-label="Betaalde tickets" className="flex flex-col gap-3 rounded-2xl border border-lijn p-4">
      <h3 className="text-[15px] font-semibold">Betaalde tickets</h3>
      {!stand && !fout && <p role="status" className="text-sm text-rustig">Ophalen…</p>}
      {fout && <p role="alert" className="text-sm">{fout}</p>}
      {stand && !stand.winkel && (
        <div className="flex flex-col gap-2 text-sm">
          <p>Tickets worden verkocht via je eigen webshop. Open die eerst, dat kost een minuut.</p>
          <button className={stil + " self-start"} onClick={() => studioOpenen({ tool: "winkel" })}>Webshop openen</button>
        </div>
      )}
      {stand?.winkel && !stand.kan_betalen && (
        <p className="text-sm text-rustig">Je kunt al ticketsoorten klaarzetten. Kopers kunnen pas betalen als je betalingen hebt ingesteld in Studio, onder Betalingen instellen.</p>
      )}
      {stand?.winkel && (
        <>
          <ul className="flex flex-col divide-y divide-lijn">
            {stand.soorten.map((s) => (
              <li key={s.id} className="flex items-center gap-3 py-2 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{s.titel} · {euro(s.prijs)}</span>
                  <span className="text-[13px] text-rustig">{s.verkocht} verkocht · {s.vrij ?? 0} over{s.aan ? "" : " · verkoop gestopt"}</span>
                </span>
                <button className="min-h-11 text-accent" onClick={() => setBewerk(s)}>Wijzigen</button>
              </li>
            ))}
          </ul>
          {!stand.soorten.length && <p className="text-sm text-rustig">Nog geen ticketsoort. Bijvoorbeeld Staanplaats, Zitplaats of Ringside.</p>}
          {bewerk ? <SoortForm key={bewerk === "nieuw" ? "nieuw" : bewerk.id} evenement={evenement} soort={bewerk === "nieuw" ? null : bewerk}
            klaar={klaar} annuleer={() => setBewerk(null)} /> :
            <button className={stil + " self-start"} onClick={() => { setMelding(""); setBewerk("nieuw"); }}>Ticketsoort toevoegen</button>}
          <Omschrijving key={stand.omschrijving ?? ""} evenement={evenement} begin={stand.omschrijving ?? ""} klaar={klaar} />
          <p className="text-xs text-rustig">Na betalen krijgt de koper per ticket een eigen QR-code. Na afloop stopt de verkoop vanzelf en verdwijnt het evenement van de evenementenpagina. Bestellingen en tickets blijven bewaard.</p>
        </>
      )}
      {melding && <p role="status" className="text-sm">{melding}</p>}
    </section>
  );
}

function SoortForm({ evenement, soort, klaar, annuleer }: { evenement: number; soort: EigenSoort | null; klaar: (t: string) => void; annuleer: () => void }) {
  const [titel, setTitel] = useState(soort?.titel ?? "");
  const [prijs, setPrijs] = useState(soort ? String(soort.prijs).replace(".", ",") : "");
  const [aantal, setAantal] = useState(String(soort?.vrij ?? 100));
  const [aan, setAan] = useState(soort?.aan ?? true);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState("");
  const p = Number(prijs.replace(",", ".")), n = Number(aantal);
  async function bewaar(e: React.FormEvent) {
    e.preventDefault();
    const f = soortControle(titel, p, n);
    if (f) { setFout(f); return; }
    setBezig(true); setFout("");
    try { await soortBewaren(evenement, { id: soort?.id, titel, prijs: p, aantal: n, aan }); klaar("Ticketsoort opgeslagen."); }
    catch (er) { setFout(er instanceof Error ? er.message : "Opslaan lukte niet."); } finally { setBezig(false); }
  }
  return (
    <form onSubmit={bewaar} className="flex flex-col gap-2 rounded-xl bg-vlak/50 p-3">
      <label className="text-sm">Naam<input value={titel} maxLength={80} onChange={(e) => setTitel(e.target.value)} placeholder="Staanplaats" className={veld} /></label>
      <div className="flex gap-2">
        <label className="flex-1 text-sm">Prijs in euro<input inputMode="decimal" value={prijs} onChange={(e) => setPrijs(e.target.value)} placeholder="25" className={veld} /></label>
        <label className="flex-1 text-sm">{soort ? "Nog te koop" : "Aantal"}<input inputMode="numeric" value={aantal} onChange={(e) => setAantal(e.target.value)} className={veld} /></label>
      </div>
      {soort && <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={aan} onChange={(e) => setAan(e.target.checked)} />Te koop</label>}
      {fout && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{fout}</p>}
      <div className="flex gap-2">
        <button type="button" className={stil} onClick={annuleer}>Annuleren</button>
        <button disabled={bezig} className={knop}>Opslaan</button>
      </div>
    </form>
  );
}

function Omschrijving({ evenement, begin, klaar }: { evenement: number; begin: string; klaar: (t: string) => void }) {
  const [tekst, setTekst] = useState(begin);
  const [fout, setFout] = useState("");
  return (
    <details className="rounded-xl border border-lijn p-3">
      <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">Omschrijving op de evenementenpagina</summary>
      <textarea value={tekst} maxLength={2000} rows={4} onChange={(e) => setTekst(e.target.value)}
        placeholder="Programma, deuren open, wat je meeneemt" className="mt-2 w-full rounded-xl bg-vlak p-3 text-sm" />
      {fout && <p role="alert" className="text-sm">{fout}</p>}
      <button disabled={tekst === begin} className={stil + " mt-2"} onClick={() =>
        omschrijvingBewaren(evenement, tekst).then(() => klaar("Omschrijving opgeslagen.")).catch((e) => setFout(e instanceof Error ? e.message : "Opslaan lukte niet."))}>
        Omschrijving opslaan
      </button>
    </details>
  );
}

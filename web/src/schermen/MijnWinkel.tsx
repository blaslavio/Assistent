// Je eigen winkel in de app: in een paar stappen opzetten, producten erin zetten, openen en delen.
import { useCallback, useEffect, useState } from "react";
import { Onderblad } from "./Onderblad";
import { Schakelaar } from "./instellingen-ui";
import { WINKELKLEUREN, mijnWinkel, productInWinkel, verkoperWorden, vestigingBewaren, webadres, winkelBewaren, winkelLink,
  type EigenProduct, type EigenWinkel, type MijnWinkel as Gegevens } from "../lib/mijnwinkel";
import { euro } from "../lib/winkelen";
import { Winkelpand } from "../iconen";
import { WinkelOntwerpen } from "./WinkelOntwerpen";

const foutVan = (e: unknown) => (e instanceof Error ? e.message : "Dat lukte niet.");
const veld = "h-12 w-full rounded-2xl bg-vlak px-4 outline-none focus:ring-2 focus:ring-accent";
const knop = "h-11 rounded-full bg-accent px-5 text-sm font-medium text-white disabled:opacity-50";
const zachteKnop = "h-10 rounded-full bg-vlak px-4 text-sm font-medium";

/** Kan dit product in de webshop? Daar wordt altijd via de app betaald, en het wordt verzonden of opgehaald. */
export const kanInWinkel = (p: EigenProduct) =>
  p.betaalwijzen.includes("app") && p.levering.some((l) => l === "verzenden" || l === "ophalen");

export function MijnWinkel({ bekijk }: { bekijk: (adres: string) => void }) {
  const [g, setG] = useState<Gegevens | null>(null);
  const [fout, setFout] = useState("");
  const [bouwen, setBouwen] = useState(false);
  const [instellen, setInstellen] = useState(false);
  const [melding, setMelding] = useState("");
  const [ontwerpen, setOntwerpen] = useState<"bewerken" | "voorbeeld" | null>(null);

  const laden = useCallback(() => {
    mijnWinkel().then(setG).catch((e) => setFout(foutVan(e)));
  }, []);
  useEffect(laden, [laden]);
  if (!g) return fout ? <p className="px-1 text-sm text-rustig">{fout}</p> : null;

  const w = g.winkel;
  if (!w) {
    return (
      <>
        <button onClick={() => setBouwen(true)} className="flex items-center gap-3 rounded-2xl bg-vlak p-4 text-left">
          <Winkelpand className="size-6 text-accent" />
          <span className="flex flex-col">
            <span className="font-medium">Begin je eigen winkel</span>
            <span className="text-[13px] text-rustig">Met een eigen naam, kleur en link om te delen</span>
          </span>
        </button>
        {bouwen && <Bouwer g={g} sluit={() => setBouwen(false)} klaar={() => { setBouwen(false); laden(); }} />}
      </>
    );
  }

  async function openZetten(open: boolean) {
    setMelding("");
    if (open && !g!.kan_betalen) {
      setMelding("Zet eerst betalingen aan in Instellingen › Betalingen. Daarna kan je winkel open.");
      return;
    }
    try {
      await winkelBewaren({ ...w!, open });
      laden();
    } catch (e) {
      setMelding(foutVan(e));
    }
  }

  async function delen() {
    const url = winkelLink(w!.adres);
    if (navigator.share) {
      try {
        await navigator.share({ title: w!.naam, url });
        return;
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setMelding("Link gekopieerd.");
    } catch {
      setMelding(url);
    }
  }

  const inWinkel = g.producten.filter((p) => p.in_winkel).length;
  return (
    <section className="flex flex-col gap-3" aria-label="Je winkel">
      <div className="overflow-hidden rounded-2xl bg-vlak">
        <div className="h-2" style={{ background: w.kleur }} />
        <div className="flex flex-col gap-3 p-4">
          <div className="flex items-start gap-3">
            <span className="flex flex-1 flex-col">
              <span className="text-lg font-semibold">{w.naam}</span>
              <span className="text-[13px] text-rustig">
                {w.open ? "Open" : "Gesloten"} · {inWinkel} {inWinkel === 1 ? "product" : "producten"}
                {g.verkopen.aantal > 0 && ` · ${g.verkopen.aantal} verkocht, ${euro(g.verkopen.omzet)}`}
              </span>
            </span>
            <button onClick={() => setInstellen(true)} className="text-sm font-medium text-accent">Aanpassen</button>
          </div>
          <Schakelaar label="Winkel open" uitleg={w.open ? "Iedereen kan bij je kopen." : "Alleen jij ziet je winkel."}
            aan={w.open} zet={openZetten} />
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setOntwerpen("bewerken")} className={zachteKnop + " bg-white dark:bg-black/30"}>Ontwerpen</button>
            <button onClick={() => setOntwerpen("voorbeeld")} className={zachteKnop + " bg-white dark:bg-black/30"}>Voorbeeld</button>
            {w.open && <button onClick={delen} className={zachteKnop + " bg-white dark:bg-black/30"}>Delen</button>}
            {w.open && <button onClick={() => bekijk(w.adres)} className={zachteKnop + " bg-white dark:bg-black/30"}>Bekijken</button>}
          </div>
          {melding && <p role="status" className="break-all px-1 text-[13px] text-rustig">{melding}</p>}
        </div>
      </div>
      <Producten producten={g.producten} bijgewerkt={laden} />
      {g.verkopen.commissie > 0 && (
        <p className="px-1 text-[13px] text-rustig">Kosten tot nu toe: {euro(g.verkopen.commissie)} ({g.commissie_procent}% per bestelling).</p>
      )}
      {ontwerpen && <WinkelOntwerpen start={ontwerpen} sluit={(bewaard) => {
        setOntwerpen(null);
        if (bewaard) setMelding("Ontwerp bewaard.");
      }} />}
      {instellen && <Instellen w={w} sluit={() => setInstellen(false)} klaar={() => { setInstellen(false); laden(); }} />}
    </section>
  );
}

/** Een winkel beginnen in drie korte stappen: naam, kleur, een zin over wat je verkoopt. */
function Bouwer({ g, sluit, klaar }: { g: Gegevens; sluit: () => void; klaar: () => void }) {
  const [naam, setNaam] = useState("");
  const [adres, setAdres] = useState("");
  const [adresZelf, setAdresZelf] = useState(false);
  const [kleur, setKleur] = useState(WINKELKLEUREN[0][0]);
  const [omschrijving, setOmschrijving] = useState("");
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState("");
  const link = adresZelf ? adres : webadres(naam);

  async function maken() {
    setBezig(true);
    setFout("");
    try {
      if (g.niveau === "particulier") await verkoperWorden();
      await winkelBewaren({ adres: link, naam: naam.trim(), omschrijving: omschrijving.trim(), kleur, verzendkosten: 0,
        gratis_vanaf: null, retour: "", open: false });
      klaar();
    } catch (e) {
      setFout(foutVan(e));
    } finally {
      setBezig(false);
    }
  }

  return (
    <Onderblad titel="Je winkel" sluit={sluit}>
      <label className="flex flex-col gap-1.5">
        <span className="px-1 text-sm font-medium">Naam</span>
        <input value={naam} onChange={(e) => setNaam(e.target.value)} maxLength={60} placeholder="Bijvoorbeeld Sanne's Keramiek"
          className={veld} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="px-1 text-sm font-medium">Link</span>
        <span className="flex items-center gap-1 rounded-2xl bg-vlak px-4">
          <span className="text-sm text-rustig">?winkel=</span>
          <input value={link} onChange={(e) => { setAdresZelf(true); setAdres(e.target.value.toLowerCase()); }} maxLength={30}
            className="h-12 min-w-0 flex-1 bg-transparent outline-none" aria-label="Webadres" />
        </span>
      </label>
      <div className="flex flex-col gap-1.5">
        <span className="px-1 text-sm font-medium">Kleur</span>
        <div className="flex gap-3">
          {WINKELKLEUREN.map(([k, label]) => (
            <button key={k} onClick={() => setKleur(k)} aria-label={label} aria-pressed={kleur === k}
              className={`size-9 rounded-full ${kleur === k ? "ring-2 ring-offset-2 ring-offset-white dark:ring-offset-[#16161a]" : ""}`}
              style={{ background: k, ["--tw-ring-color" as string]: k }} />
          ))}
        </div>
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="px-1 text-sm font-medium">Wat verkoop je?</span>
        <textarea value={omschrijving} onChange={(e) => setOmschrijving(e.target.value)} maxLength={2000} rows={2}
          placeholder="Eén of twee zinnen" className="w-full rounded-2xl bg-vlak px-4 py-3 outline-none focus:ring-2 focus:ring-accent" />
      </label>
      {g.niveau === "particulier" && (
        <p className="px-1 text-[13px] text-rustig">Je account wordt Verkoper. Daarvoor is een e-mailadres nodig.</p>
      )}
      {fout && <p role="alert" className="px-1 text-sm text-red-600">{fout}</p>}
      <button onClick={maken} disabled={bezig || !naam.trim() || link.length < 3} className={knop}>
        {bezig ? "Bezig..." : "Maak mijn winkel"}
      </button>
      <p className="px-1 text-[13px] text-rustig">Je winkel blijft dicht tot je hem zelf opent.</p>
    </Onderblad>
  );
}

function Instellen({ w, sluit, klaar }: { w: EigenWinkel; sluit: () => void; klaar: () => void }) {
  const [v, setV] = useState({ ...w });
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState("");
  const zet = (x: Partial<EigenWinkel>) => setV((o) => ({ ...o, ...x }));
  const bedrag = (s: string) => Math.max(0, Number(s.replace(",", ".")) || 0);

  async function bewaren() {
    setBezig(true);
    setFout("");
    try {
      await winkelBewaren(v);
      if (v.winkeladres.trim() !== w.winkeladres.trim()) await vestigingBewaren(v.winkeladres);
      klaar();
    } catch (e) {
      setFout(foutVan(e));
    } finally {
      setBezig(false);
    }
  }

  return (
    <Onderblad titel="Winkel aanpassen" sluit={sluit}>
      <input value={v.naam} onChange={(e) => zet({ naam: e.target.value })} maxLength={60} aria-label="Naam" className={veld} />
      <div className="flex gap-3">
        {WINKELKLEUREN.map(([k, label]) => (
          <button key={k} onClick={() => zet({ kleur: k })} aria-label={label} aria-pressed={v.kleur === k}
            className={`size-9 rounded-full ${v.kleur === k ? "ring-2 ring-offset-2 ring-offset-white dark:ring-offset-[#16161a]" : ""}`}
            style={{ background: k, ["--tw-ring-color" as string]: k }} />
        ))}
      </div>
      <textarea value={v.omschrijving} onChange={(e) => zet({ omschrijving: e.target.value })} maxLength={2000} rows={2}
        aria-label="Omschrijving" placeholder="Wat verkoop je?" className="w-full rounded-2xl bg-vlak px-4 py-3 outline-none focus:ring-2 focus:ring-accent" />
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="px-1 text-sm font-medium">Verzendkosten</span>
          <input inputMode="decimal" defaultValue={v.verzendkosten || ""} placeholder="0"
            onChange={(e) => zet({ verzendkosten: bedrag(e.target.value) })} className={veld} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="px-1 text-sm font-medium">Gratis vanaf</span>
          <input inputMode="decimal" defaultValue={v.gratis_vanaf ?? ""} placeholder="Nooit"
            onChange={(e) => zet({ gratis_vanaf: e.target.value.trim() ? bedrag(e.target.value) : null })} className={veld} />
        </label>
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="px-1 text-sm font-medium">Winkeladres</span>
        <input value={v.winkeladres} onChange={(e) => zet({ winkeladres: e.target.value })} maxLength={200}
          placeholder="Leeg als je alleen online verkoopt" className={veld} />
        <span className="px-1 text-[13px] text-rustig">Met een adres sta je op de winkelkaart.</span>
      </label>
      <textarea value={v.retour} onChange={(e) => zet({ retour: e.target.value })} maxLength={1000} rows={2}
        aria-label="Retourbeleid" placeholder="Retour, bijvoorbeeld: binnen 14 dagen terugsturen"
        className="w-full rounded-2xl bg-vlak px-4 py-3 outline-none focus:ring-2 focus:ring-accent" />
      {fout && <p role="alert" className="px-1 text-sm text-red-600">{fout}</p>}
      <button onClick={bewaren} disabled={bezig || !v.naam.trim()} className={knop}>{bezig ? "Bezig..." : "Bewaren"}</button>
    </Onderblad>
  );
}

/** Welke van je producten in de winkel staan, en hoeveel je er nog hebt. */
function Producten({ producten, bijgewerkt }: { producten: EigenProduct[]; bijgewerkt: () => void }) {
  const [fout, setFout] = useState<{ id: number; tekst: string } | null>(null);
  if (!producten.length)
    return <p className="px-1 text-[13px] text-rustig">Zet iets te koop met betalen via de app, dan kun je het hier in je winkel zetten.</p>;

  async function zet(p: EigenProduct, inWinkel: boolean, voorraad: number | null) {
    setFout(null);
    try {
      await productInWinkel(p.id, inWinkel, voorraad);
      bijgewerkt();
    } catch (e) {
      setFout({ id: p.id, tekst: foutVan(e) });
    }
  }

  return (
    <ul className="flex flex-col divide-y divide-lijn rounded-2xl bg-vlak" aria-label="Producten in je winkel">
      {producten.filter((p) => !p.geblokkeerd).map((p) => {
        const kan = kanInWinkel(p);
        return (
          <li key={p.id} className="flex flex-col gap-1 px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-medium">{p.titel}</span>
                <span className="text-[13px] text-rustig">{kan ? euro(p.prijs) : "Alleen met betalen via de app"}</span>
              </span>
              {p.in_winkel && (
                <input inputMode="numeric" aria-label={`Voorraad ${p.titel}`} defaultValue={p.voorraad ?? ""} placeholder="Voorraad"
                  onBlur={(e) => {
                    const n = e.target.value.trim() === "" ? null : Math.max(0, Math.floor(Number(e.target.value) || 0));
                    if (n !== p.voorraad) zet(p, true, n);
                  }}
                  className="h-9 w-24 rounded-xl bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-accent dark:bg-black/30" />
              )}
              <input type="checkbox" role="switch" aria-label={`${p.titel} in winkel`} checked={p.in_winkel} disabled={!kan && !p.in_winkel}
                onChange={(e) => zet(p, e.target.checked, p.voorraad)} className="size-5 accent-[var(--color-accent)]" />
            </div>
            {fout?.id === p.id && <p role="alert" className="text-[13px] text-red-600">{fout.tekst}</p>}
          </li>
        );
      })}
    </ul>
  );
}

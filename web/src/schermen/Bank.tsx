// De bankkoppeling in Budget: koppelen, vanzelf bijwerken (elke zes uur zolang de app open is) en ontkoppelen.
import { useEffect, useRef, useState } from "react";
import { Onderblad } from "./Onderblad";
import { afmaken, bankInstellen, bankStatus, bankTerug, banken, koppelen, ontkoppelen, ophalen, ophalenNodig,
  type Bank as BankNaam, type BankStatus, type Koppeling } from "../lib/bank";
import { tijdje } from "../lib/tijd";

const foutVan = (e: unknown) => (e instanceof Error ? e.message : "Dat lukte niet.");
const knop = "h-10 rounded-full bg-white px-4 text-sm font-medium disabled:opacity-50 dark:bg-black/30";
const kort = (iban: string) => (iban.length > 8 ? `•••• ${iban.slice(-4)}` : iban);

export function BankKoppeling({ eigenaar, regels, bijgewerkt }: { eigenaar: boolean; regels: Record<string, string>;
  bijgewerkt: () => void }) {
  const [st, setSt] = useState<BankStatus | null>(null);
  const [melding, setMelding] = useState("");
  const [bezig, setBezig] = useState<number | "nieuw" | null>(null);
  const [kiezen, setKiezen] = useState(false);
  const eenKeer = useRef(false);

  async function laden() {
    const s = await bankStatus();
    setSt(s);
    return s;
  }

  useEffect(() => {
    if (eenKeer.current) return;
    eenKeer.current = true;
    (async () => {
      const terug = bankTerug();
      if (terug) {
        setBezig("nieuw");
        try {
          const k = await afmaken(terug.code, terug.staat, regels);
          setMelding(`Gekoppeld met ${k.bank}. ${k.nieuw === 1 ? "1 nieuwe regel" : `${k.nieuw} nieuwe regels`} in je budget.`);
          bijgewerkt();
        } catch (e) {
          setMelding(foutVan(e));
        } finally {
          setBezig(null);
        }
      }
      const s = await laden().catch(() => null);
      // Vanzelf bijwerken: stil, zonder melding als er niets nieuw is.
      let nieuw = 0;
      for (const k of s?.koppelingen.filter((x) => ophalenNodig(x)) ?? []) nieuw += await ophalen(k, regels).catch(() => 0);
      if (nieuw) { setMelding(`${nieuw} nieuwe regels van je bank.`); bijgewerkt(); laden().catch(() => {}); }
    })();
  }, [regels, bijgewerkt]);

  async function nu(k: Koppeling) {
    setBezig(k.id);
    setMelding("");
    try {
      const n = await ophalen(k, regels);
      setMelding(n ? `${n} nieuwe regels.` : "Alles is al bijgewerkt.");
      bijgewerkt();
      await laden();
    } catch (e) {
      setMelding(foutVan(e));
    } finally {
      setBezig(null);
    }
  }

  async function los(k: Koppeling) {
    setBezig(k.id);
    try {
      await ontkoppelen(k.id);
      setMelding(`${k.bank} is ontkoppeld. Je regels blijven staan.`);
      await laden();
    } catch (e) {
      setMelding(foutVan(e));
    } finally {
      setBezig(null);
    }
  }

  if (!st) return null;
  if (!st.aan) return eigenaar ? <Instellen klaar={() => laden()} /> : null;
  return (
    <div className="flex flex-col gap-2">
      {st.koppelingen.map((k) => (
        <div key={k.id} className="flex flex-col gap-2 rounded-2xl bg-vlak p-4">
          <span className="flex flex-col">
            <span className="font-medium">{k.bank}</span>
            <span className="text-[13px] text-rustig">
              {[k.rekeningen.map((r) => kort(r.iban)).join(", "),
                k.status === "verlopen" ? "Toestemming verlopen" : k.laatst_opgehaald ? `bijgewerkt ${tijdje(k.laatst_opgehaald)}` : "nog niet opgehaald"]
                .filter(Boolean).join(" · ")}
            </span>
            {k.fout && k.status !== "verlopen" && <span className="text-[13px] text-red-600 dark:text-red-400">{k.fout}</span>}
          </span>
          <div className="flex gap-2">
            {k.status === "verlopen"
              ? <button disabled={bezig !== null} onClick={() => koppelen(k.bank).catch((e) => setMelding(foutVan(e)))} className={knop}>Opnieuw koppelen</button>
              : <button disabled={bezig !== null} onClick={() => nu(k)} className={knop}>{bezig === k.id ? "Bezig..." : "Nu bijwerken"}</button>}
            <button disabled={bezig !== null} onClick={() => los(k)} className={knop}>Ontkoppelen</button>
          </div>
        </div>
      ))}
      <button disabled={bezig !== null} onClick={() => setKiezen(true)} className="h-12 rounded-2xl bg-vlak font-medium">
        {bezig === "nieuw" ? "Koppeling afmaken..." : st.koppelingen.length ? "Nog een bank koppelen" : "Bank koppelen"}
      </button>
      <p aria-live="polite" className="px-1 text-sm text-rustig">
        {melding || "Alleen meelezen: de app kan via deze koppeling nooit geld overmaken."}
      </p>
      {kiezen && <Kiezen sluit={() => setKiezen(false)} />}
    </div>
  );
}

function Kiezen({ sluit }: { sluit: () => void }) {
  const [lijst, setLijst] = useState<BankNaam[] | null>(null);
  const [zoek, setZoek] = useState("");
  const [fout, setFout] = useState("");
  useEffect(() => { banken().then(setLijst).catch((e) => setFout(foutVan(e))); }, []);
  const gevonden = (lijst ?? []).filter((b) => b.naam.toLowerCase().includes(zoek.trim().toLowerCase()));
  return (
    <Onderblad titel="Kies je bank" sluit={sluit}>
      <input value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder="Zoek je bank" aria-label="Zoek je bank"
        className="h-12 w-full rounded-2xl bg-vlak px-4 outline-none focus:ring-2 focus:ring-accent" />
      {fout && <p role="alert" className="px-1 text-sm text-red-600">{fout}</p>}
      {lijst === null && !fout && <p className="bezig-tekst text-rustig">Banken laden</p>}
      <ul className="flex flex-col divide-y divide-lijn rounded-2xl bg-vlak">
        {gevonden.slice(0, 40).map((b) => (
          <li key={b.naam}>
            <button onClick={() => koppelen(b.naam).catch((e) => setFout(foutVan(e)))} className="flex w-full items-center gap-3 px-4 py-3 text-left">
              {b.logo ? <img src={b.logo} alt="" className="size-7 rounded-md object-contain" /> : <span className="size-7" />}
              <span className="flex-1">{b.naam}</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="px-1 text-[13px] text-rustig">Je logt in bij je eigen bank. De app ziet je wachtwoord niet en kan alleen meelezen.</p>
    </Onderblad>
  );
}

/** Alleen de eigenaar: de gegevens van Enable Banking, één keer. Het .pem-bestand wordt hier gelezen, niet geplakt. */
function Instellen({ klaar }: { klaar: () => void }) {
  const [appId, setAppId] = useState("");
  const [pem, setPem] = useState("");
  const [fout, setFout] = useState("");
  const [bezig, setBezig] = useState(false);
  async function bewaren() {
    setBezig(true);
    setFout("");
    try {
      await bankInstellen(appId, pem);
      klaar();
    } catch (e) {
      setFout(foutVan(e));
    } finally {
      setBezig(false);
    }
  }
  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-vlak p-4">
      <span className="font-medium">Bankkoppeling aanzetten (alleen jij)</span>
      <span className="text-[13px] text-rustig">Maak een app bij Enable Banking met als terugkeeradres het adres van deze app. Vul hier het application ID in en kies het .pem-bestand.</span>
      <input value={appId} onChange={(e) => setAppId(e.target.value)} placeholder="Application ID" aria-label="Application ID"
        className="h-11 rounded-xl bg-white px-3 outline-none focus:ring-2 focus:ring-accent dark:bg-black/30" />
      <label className={knop + " flex items-center justify-center"}>
        {pem ? "Sleutelbestand gekozen" : "Kies het .pem-bestand"}
        <input type="file" accept=".pem,application/x-pem-file,text/plain" className="sr-only"
          onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) setPem(await f.text()); }} />
      </label>
      {fout && <p role="alert" className="text-sm text-red-600">{fout}</p>}
      <button disabled={bezig || !appId.trim() || !pem} onClick={bewaren}
        className="h-11 rounded-full bg-accent text-sm font-medium text-white disabled:opacity-50">{bezig ? "Bezig..." : "Aanzetten"}</button>
    </div>
  );
}

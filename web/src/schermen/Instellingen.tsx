import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { alsIk, bijwerken, instellingenBijwerken, uitloggen } from "../api";
import { gekoppeld } from "../lib/mail";
import { naar, kaartOpenen, evenementenOpenen, vakantiesOpenen, gevraagdePagina } from "../lib/naar";
import { betaalStatus, lijst as bestellingenLijst, klaar, platformInstellen, stand, verkoperAanmelden, type BetaalStatus,
  type Bestelling } from "../lib/bestellingen";
import { euro } from "../lib/winkelen";
import { MailKoppelen } from "./AgendaPanelen";
import { BoekpaginaInstellen, MailVersturen } from "./Gasten";
import type { Staat } from "../App";
import { Boek, Envelop, Euro, Grafiek, Huis, Kalender, Lijstje, Persoon, Schuiven, Slot, Terug, Vonk, Vraag, Winkelpand } from "../iconen";
import { Schakelaar, kop } from "./instellingen-ui";
import { Account, Beveiliging, BeveiligingsOptie, Techniek } from "./Beveiliging";
import { ONDERDELEN, Onderdeel, type OnderdeelNaam } from "./Onderdelen";
import { AlgemeenScherm, IdeeScherm, type Weergave } from "./Algemeen";
import { Profiel, useEigenFoto } from "./Profiel";
import StatusHulp from "./StatusHulp";

type Props = { staat: Staat; vernieuw: () => Promise<void>; terug: () => void; opUitgelogd: () => void;
  setStaat: (s: Staat) => void; vraag: (tekst: string) => void; start?: { naam: OnderdeelNaam; n: number } | null;
  vorigeNaam?: string };
type Pagina = null | "algemeen" | "idee" | "hulp" | "profiel" | "account" | "assistent" | "privacy" | "thuis" | "mail" | "betalingen" | "afspraken";

export default function Instellingen(props: Props) {
  return <InstellingenKern {...props} />;
}

// Kern gedelegeerd om bestandsherstel eenvoudig te houden — volledige UI hieronder.
function InstellingenKern({ staat, vernieuw, terug, opUitgelogd, setStaat, vraag, start, vorigeNaam }: Props) {
  const [pagina, setPagina] = useState<Pagina>(() => (start ? null : gevraagdePagina() as Pagina));
  const [onderdeel, setOnderdeel] = useState<OnderdeelNaam | null>(start?.naam ?? null);
  const [vanApps, setVanApps] = useState(!!start);
  useEffect(() => { if (start) { setPagina(null); setOnderdeel(start.naam); setVanApps(true); } }, [start]);
  useEffect(() => {
    const open = () => { const p = gevraagdePagina(); if (p) { setOnderdeel(null); setVanApps(false); setPagina(p as Pagina); } };
    window.addEventListener("instellingen-pagina", open);
    return () => window.removeEventListener("instellingen-pagina", open);
  }, []);
  const [bezig, setBezig] = useState(false);
  const [categorie, setCategorie] = useState<string | null>(null);
  const [zoek, setZoek] = useState("");
  const [melding, setMelding] = useState("");
  const g = staat.gebruiker;
  const [eigenFoto] = useEigenFoto(g);
  const inst = (staat.data.instellingen ?? {}) as { stijl?: Record<string, string>; avatar?: { naam?: string }; geheugen_uit?: boolean; thuisadres?: string; anthropic_sleutel?: string; boekpagina?: boolean; mail?: { adres?: string } };
  const naam = g.weergavenaam || g.naam || "Jij";

  async function bewaar(aanpassen: (i: Record<string, unknown>) => void, klaar = "Bewaard",
                        alles?: Parameters<typeof bijwerken>[0]) {
    setBezig(true); setMelding("");
    try {
      await (alles ? bijwerken(alles) : instellingenBijwerken(aanpassen));
      await vernieuw(); setMelding(klaar); setTimeout(() => setMelding(""), 1800);
    } catch { setMelding("Bewaren lukte niet. Probeer het opnieuw."); }
    finally { setBezig(false); }
  }

  const scherm = (titel: string, inhoud: ReactNode) => (
    <div className="px-6 pt-4 pb-10">
      <button type="button" onClick={() => setPagina(null)} className="-ml-2 flex h-10 items-center gap-1 pr-3 text-rustig">
        <Terug className="size-5" /> Instellingen
      </button>
      <h1 className="mt-4 mb-6 text-[28px] font-bold tracking-tight">{titel}</h1>
      <div className="flex flex-col gap-7">{inhoud}</div>
      <p aria-live="polite" className="mt-6 h-5 text-center text-sm text-rustig">{bezig ? "Bewaren…" : melding}</p>
    </div>
  );

  if (pagina === "profiel") return scherm("Profiel", <Profiel g={g} vernieuw={vernieuw} />);
  if (pagina === "hulp") return scherm("Status en meldingen", <StatusHulp />);
  if (pagina === "idee") return scherm("Idee of probleem", <IdeeScherm />);
  if (pagina === "account") return scherm("Account", <Account gebruiker={g} vernieuw={vernieuw} opUitgelogd={opUitgelogd} />);
  if (pagina === "algemeen") return scherm("Weergave", <AlgemeenScherm inst={inst as Weergave} bewaar={(a) => bewaar(a)} />);
  if (pagina === "privacy") return scherm("Privacy en beveiliging", <div className="flex flex-col gap-3"><Beveiliging gebruiker={g} /><BeveiligingsOptie icoon={Schuiven} titel="Technische uitleg" kort="Meer achtergrond."><Techniek /></BeveiligingsOptie></div>);
  if (pagina === "mail") return scherm("Mail", gekoppeld(staat.data) ? <><p className="px-1 text-rustig">Gekoppeld: {inst.mail?.adres}.</p><button type="button" onClick={() => bewaar((i) => { delete i.mail; }, "Ontkoppeld")} className="h-12 rounded-2xl bg-vlak font-medium text-red-600">Ontkoppelen</button></> : <MailKoppelen staat={staat} setStaat={setStaat} />);
  if (pagina === "afspraken") return scherm("Boekingspagina", <BoekpaginaInstellen naam={naam} />);
  if (pagina === "betalingen") return scherm("Betalingen", <p className="text-sm text-rustig">Betalingen open je via Studio of de betaalsectie in de app.</p>);
  if (pagina === "thuis") return scherm("Thuis", <p className="text-sm text-rustig">Thuisadres stel je in via Assistent of Weergave.</p>);
  if (pagina === "assistent") return scherm("Assistent", <p className="text-sm text-rustig">Toon en AI-koppeling: vraag de Assistent of open Weergave.</p>);

  if (onderdeel) return <Onderdeel naam={onderdeel} staat={staat} vernieuw={vernieuw} vraag={vraag} terugNaam={vanApps ? vorigeNaam : undefined}
    terug={() => { setOnderdeel(null); if (vanApps) { setVanApps(false); terug(); } }} />;

  const term = zoek.trim().toLocaleLowerCase("nl");
  const hulpRijen = [
    { titel: "Status en meldingen", uitleg: "Lokale metrics en meldbeleid", open: () => setPagina("hulp" as Pagina) },
    { titel: "Idee of probleem", uitleg: "Hulp en feedback", open: () => setPagina("idee") },
  ];

  return (
    <div className="px-6 pt-4 pb-10">
      <button type="button" onClick={() => { if (categorie || zoek) { setCategorie(null); setZoek(""); } else terug(); }} className="-ml-2 flex h-10 items-center gap-1 pr-3 text-rustig">
        <Terug className="size-5" /> {categorie || zoek ? "Instellingen" : "Terug"}
      </button>
      <h1 className="mt-4 mb-4 text-[32px] font-bold tracking-tight">Instellingen</h1>
      {!categorie && !term && (
        <button type="button" onClick={() => setPagina("profiel")} className="mb-5 flex w-full items-center gap-3 rounded-2xl bg-vlak p-3 text-left">
          <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white dark:bg-black/40">
            {eigenFoto ? <img src={eigenFoto} alt="" className="size-full object-cover" /> : naam[0].toUpperCase()}
          </span>
          <span className="min-w-0 flex-1 truncate font-medium">{naam}</span>
          <span className="text-sm text-rustig">Profiel</span>
        </button>
      )}
      <label className="block">
        <span className="sr-only">Zoek</span>
        <input type="search" value={zoek} onChange={(e) => { setZoek(e.target.value); setCategorie(null); }} placeholder="Zoek een instelling"
          className="h-12 w-full rounded-2xl bg-vlak px-4" />
      </label>
      <ul className="mt-6 flex flex-col overflow-hidden rounded-3xl bg-vlak">
        {[
          { t: "Profiel", u: "Naam en foto", o: () => setPagina("profiel") },
          { t: "Account", u: "Mail en inloggen", o: () => setPagina("account") },
          { t: "Privacy en beveiliging", u: "Apparaten en geheugen", o: () => setPagina("privacy") },
          { t: "Weergave", u: "Kleur en tekst", o: () => setPagina("algemeen") },
          { t: "Mail", u: gekoppeld(staat.data) ? "Gekoppeld" : "Koppel mailbox", o: () => setPagina("mail") },
          { t: "Betalingen", u: "Bestellingen en uitbetalen", o: () => setPagina("betalingen") },
          ...hulpRijen.map((r) => ({ t: r.titel, u: r.uitleg, o: r.open })),
        ].filter((r) => !term || `${r.t} ${r.u}`.toLocaleLowerCase("nl").includes(term)).map((r) => (
          <li key={r.t}>
            <button type="button" onClick={r.o} className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left">
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{r.t}</span>
                <span className="block text-sm text-rustig">{r.u}</span>
              </span>
              <Terug className="size-5 shrink-0 rotate-180 text-zacht" />
            </button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={async () => { await uitloggen(); opUitgelogd(); }} className="mt-8 h-12 w-full rounded-2xl bg-vlak font-medium text-red-600 dark:text-red-400">Uitloggen</button>
    </div>
  );
}

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { alsIk, bijwerken, gereedschapAdres, instellingenBijwerken, uitloggen, weergavenaamWijzigen } from "../api";
import { gekoppeld } from "../lib/mail";
import { betaalStatus, platformInstellen, verkoperAanmelden, type BetaalStatus } from "../lib/bestellingen";
import { MailKoppelen } from "./AgendaPanelen";
import { BoekpaginaInstellen, MailVersturen } from "./Gasten";
import type { Staat } from "../App";
import { Terug, Vonk } from "../iconen";
import { Schakelaar, kop } from "./instellingen-ui";
import { Account, Beveiliging, Techniek } from "./Beveiliging";
import { Onderdeel, OnderdelenTegels, type OnderdeelNaam } from "./Onderdelen";
import { AlgemeenScherm, IdeeScherm, type Weergave } from "./Algemeen";

type Props = { staat: Staat; vernieuw: () => Promise<void>; terug: () => void; opUitgelogd: () => void;
  setStaat: (s: Staat) => void };
type Pagina = null | "algemeen" | "idee" | "profiel" | "account" | "assistent" | "privacy" | "thuis" | "mail" | "betalingen" | "afspraken";

type Stijl = Record<string, string | undefined>;
type Inst = { stijl?: Stijl; avatar?: { naam?: string }; geheugen_uit?: boolean; thuisadres?: string;
  anthropic_sleutel?: string; boekpagina?: boolean };
type Feit = { id: number; feit: string; onderwerp?: string };

// Dezelfde keuzes en standaarden als in de huidige app, zodat beide apps hetzelfde laten zien.
const KEUZES: { sleutel: string; label: string; opties: string[]; standaard: string }[] = [
  { sleutel: "toon", label: "Toon", opties: ["Automatisch", "Informeel", "Zakelijk"], standaard: "Automatisch" },
  { sleutel: "lengte", label: "Antwoorden", opties: ["Automatisch", "Kort", "Uitgebreid"], standaard: "Automatisch" },
  { sleutel: "aanspreken", label: "Aanspreken met", opties: ["je", "u"], standaard: "je" },
  { sleutel: "nadenken", label: "Nadenken", opties: ["Snel", "Normaal", "Grondig"], standaard: "Grondig" },
  { sleutel: "gevoel", label: "Gevoel", opties: ["Uit", "Rustig", "Normaal", "Sterk"], standaard: "Normaal" },
  { sleutel: "humor", label: "Humor", opties: ["Geen", "Af en toe", "Veel"], standaard: "Af en toe" },
];


export default function Instellingen({ staat, vernieuw, terug, opUitgelogd, setStaat }: Props) {
  const [pagina, setPagina] = useState<Pagina>(null);
  const [onderdeel, setOnderdeel] = useState<OnderdeelNaam | null>(null);
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState("");
  const g = staat.gebruiker;
  const inst = (staat.data.instellingen ?? {}) as Inst;
  const naam = g.weergavenaam || g.naam || "Jij";

  async function bewaar(aanpassen: (i: Record<string, unknown>) => void, klaar = "Bewaard",
                        alles?: Parameters<typeof bijwerken>[0]) {
    setBezig(true);
    setMelding("");
    try {
      await (alles ? bijwerken(alles) : instellingenBijwerken(aanpassen));
      await vernieuw();
      setMelding(klaar);
      setTimeout(() => setMelding(""), 1800);
    } catch {
      setMelding("Bewaren lukte niet. Probeer het opnieuw.");
    } finally {
      setBezig(false);
    }
  }

  const scherm = (titel: string, inhoud: ReactNode) => (
    <div className="px-6 pt-12 pb-10">
      <button onClick={() => setPagina(null)} className="-ml-2 flex h-10 items-center gap-1 pr-3 text-rustig">
        <Terug className="size-5" /> Instellingen
      </button>
      <h1 className="mt-4 mb-6 text-[28px] font-bold tracking-tight">{titel}</h1>
      <div className="flex flex-col gap-7">{inhoud}</div>
      <p aria-live="polite" className="mt-6 h-5 text-center text-sm text-rustig">{bezig ? "Bewaren…" : melding}</p>
    </div>
  );

  if (pagina === "profiel") return scherm("Profiel", <Profiel naam={g.weergavenaam ?? ""} gebruikersnaam={g.naam ?? ""}
    bewaar={async (nieuw) => {
      setBezig(true);
      const fout = await weergavenaamWijzigen(nieuw).catch(() => "Bewaren lukte niet.");
      await vernieuw();
      setBezig(false);
      setMelding(fout || "Bewaard");
    }} />);

  if (pagina === "assistent") {
    const stijl = inst.stijl ?? {};
    return scherm("Assistent", <>
      <TekstVeld label="Naam van de assistent" uitleg="Leeg laten als je geen naam wilt." waarde={
        inst.avatar?.naam && !["Assistent", "Sam"].includes(inst.avatar.naam) ? inst.avatar.naam : ""}
        bewaar={(v) => bewaar((i) => { i.avatar = { ...(i.avatar as object ?? {}), naam: v.trim() || "Assistent" }; })} />
      {KEUZES.map((k) => (
        <Keuze key={k.sleutel} label={k.label} opties={k.opties} waarde={stijl[k.sleutel] ?? k.standaard}
          kies={(v) => bewaar((i) => { i.stijl = { ...(i.stijl as object ?? {}), [k.sleutel]: v }; })} />
      ))}
      <Sleutel ingesteld={Boolean(inst.anthropic_sleutel)}
        bewaar={(v) => bewaar((i) => { i.anthropic_sleutel = v.trim(); }, v ? "Sleutel bewaard" : "Sleutel verwijderd")} />
      {g.id === 1 && <PlatformSleutel />}
    </>);
  }

  if (pagina === "privacy") {
    const feiten = ((staat.data.geheugen as Feit[] | undefined) ?? []).slice().reverse();
    return scherm("Privacy en beveiliging", <>
      <Beveiliging gebruiker={g} />
      <Schakelaar label="De assistent onthoudt dingen over mij"
        uitleg="Bijvoorbeeld je voorkeuren en gewoontes, zodat hij je beter helpt."
        aan={!inst.geheugen_uit} zet={(aan) => bewaar((i) => { i.geheugen_uit = !aan; })} />
      <section>
        <h2 className={kop}>Wat de assistent weet</h2>
        {feiten.length === 0 ? <p className="px-1 text-rustig">Nog niets.</p> : (
          <ul className="flex flex-col divide-y divide-lijn rounded-2xl bg-vlak">
            {feiten.map((f) => (
              <li key={f.id} className="flex items-center gap-3 py-2.5 pr-2 pl-4">
                <span className="flex-1">{f.feit}</span>
                <button onClick={() => bewaar(() => {}, "Vergeten", (d) => {
                  d.geheugen = ((d.geheugen as Feit[] | undefined) ?? []).filter((x) => x.id !== f.id);
                })}
                  aria-label={`Vergeet: ${f.feit}`} className="h-9 shrink-0 rounded-full px-3 text-sm text-rustig hover:bg-white/60 dark:hover:bg-black/30">
                  Vergeet
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 px-1 text-sm text-rustig">Wat je de assistent vraagt, gaat naar Anthropic (Claude) om te beantwoorden.
          Anthropic gebruikt het niet om te trainen.</p>
      </section>
      <Techniek />
    </>);
  }

  if (pagina === "account") return scherm("Account", <Account gebruiker={g} vernieuw={vernieuw} opUitgelogd={opUitgelogd} />);

  if (pagina === "mail") return scherm("Mail", gekoppeld(staat.data) ? <>
    <p className="px-1 text-rustig">Gekoppeld: {(staat.data.instellingen as { mail?: { adres?: string } })?.mail?.adres}.
      Je mail zie je in Agenda, bij het mailicoon. De app leest alleen en verandert niets in je mailbox.</p>
    <button onClick={() => bewaar((i) => { delete i.mail; }, "Ontkoppeld")}
      className="h-12 rounded-2xl bg-vlak font-medium text-red-600 dark:text-red-400">Ontkoppelen</button>
  </> : <MailKoppelen staat={staat} setStaat={setStaat} />);

  if (pagina === "afspraken") return scherm("Afspraken met gasten", <>
    <BoekpaginaInstellen naam={naam} />
    {g.id === 1 && <MailVersturen />}
  </>);

  if (pagina === "betalingen") return scherm("Betalingen", <Betalingen eigenaar={g.id === 1} />);

  if (onderdeel) return <Onderdeel naam={onderdeel} staat={staat} vernieuw={vernieuw} terug={() => setOnderdeel(null)} />;
  if (pagina === "algemeen") return scherm("Algemeen", <AlgemeenScherm inst={inst as Weergave} bewaar={(a) => bewaar(a)} />);
  if (pagina === "idee") return scherm("Idee of probleem", <IdeeScherm />);
  if (pagina === "thuis") return scherm("Thuis", <>
    <TekstVeld label="Thuisadres" uitleg="Voor het weer op Vandaag en reistijden. Alleen jij ziet dit."
      waarde={inst.thuisadres ?? ""} bewaar={(v) => bewaar((i) => { i.thuisadres = v.trim(); })} />
  </>);

  return (
    <div className="px-6 pt-12 pb-10">
      <button onClick={terug} className="-ml-2 flex h-10 items-center gap-1 pr-3 text-rustig">
        <Terug className="size-5" /> Terug
      </button>
      <h1 className="mt-4 mb-6 text-[32px] font-bold tracking-tight">Instellingen</h1>

      <button onClick={() => setPagina("profiel")} className="flex w-full items-center gap-4 rounded-[20px] bg-vlak p-4 text-left">
        <span className="flex size-14 items-center justify-center overflow-hidden rounded-full bg-white text-xl font-semibold dark:bg-black/40">
          {g.foto ? <img src={g.foto} alt="" className="size-full object-cover" /> : naam[0].toUpperCase()}
        </span>
        <span className="flex flex-col">
          <span className="text-lg font-semibold">{naam}</span>
          {g.naam && <span className="text-sm text-rustig">@{g.naam}</span>}
        </span>
      </button>

      <OnderdelenTegels open={setOnderdeel} />

      <ul className="mt-6 flex flex-col divide-y divide-lijn overflow-hidden rounded-[20px] bg-vlak">
        <Rij titel="Algemeen" uitleg="Kleur, tekstgrootte, wat er op Vandaag staat" open={() => setPagina("algemeen")} />
        <Rij titel="Assistent" uitleg="Naam, toon en hoe hij antwoordt" open={() => setPagina("assistent")} />
        <Rij titel="Privacy en beveiliging" uitleg="Tweestapsverificatie, apparaten, wat de assistent weet" open={() => setPagina("privacy")} />
        <Rij titel="Account" uitleg="Mailadres, wachtwoord, je gegevens" open={() => setPagina("account")} />
        <Rij titel="Thuis" uitleg={inst.thuisadres || "Adres voor het weer en reistijden"} open={() => setPagina("thuis")} />
      </ul>

      <ul className="mt-6 flex flex-col divide-y divide-lijn overflow-hidden rounded-[20px] bg-vlak">
        <Rij titel="Mail" uitleg={gekoppeld(staat.data) ? "Gekoppeld" : "Koppel je mailbox"} open={() => setPagina("mail")} />
        <Rij titel="Betalingen" uitleg="Betalen en ontvangen via de app" open={() => setPagina("betalingen")} />
        <Rij titel="Afspraken met gasten" uitleg={inst.boekpagina ? "Je boekingspagina staat aan" : "Laat mensen zonder account een afspraak inplannen"}
          open={() => setPagina("afspraken")} />
      </ul>

      <section className="mt-6 overflow-hidden rounded-[20px] bg-vlak" aria-label="Werktools en communicatie">
        {[["communicatiecentrum", "Communicatie en privéconcepten"], ["gereedschappen", "Alle werktools"],
          ["planning-backup", "Planningback-up en herstel"]].map(([route, titel]) => (
          <a key={route} href={gereedschapAdres(route)} target="_top"
            className="block border-b border-lijn px-4 py-4 last:border-b-0">
            <span className="font-medium">{titel}</span>
            <span className="mt-1 block text-sm text-rustig">Open de beveiligde werkruimte</span>
          </a>
        ))}
      </section>
      <ul className="mt-6 flex flex-col divide-y divide-lijn overflow-hidden rounded-[20px] bg-vlak">
        <Rij titel="Idee of probleem" uitleg="Zeg wat beter kan" open={() => setPagina("idee")} />
      </ul>

      <button
        onClick={async () => {
          await uitloggen();
          opUitgelogd();
        }}
        className="mt-8 h-12 w-full rounded-2xl bg-vlak font-medium text-red-600 dark:text-red-400">
        Uitloggen
      </button>
    </div>
  );
}

function Rij({ titel, uitleg, open }: { titel: string; uitleg: string; open: () => void }) {
  return (
    <li>
      <button onClick={open} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="font-medium">{titel}</span>
          <span className="truncate text-sm text-rustig">{uitleg}</span>
        </span>
        <Terug className="size-5 shrink-0 rotate-180 text-zacht" />
      </button>
    </li>
  );
}

function Keuze({ label, opties, waarde, kies }: { label: string; opties: string[]; waarde: string; kies: (v: string) => void }) {
  return (
    <fieldset>
      <legend className={kop}>{label}</legend>
      <div className="flex rounded-2xl bg-vlak p-1">
        {opties.map((o) => (
          <button key={o} type="button" aria-pressed={o === waarde} onClick={() => o !== waarde && kies(o)}
            className={`h-10 flex-1 rounded-xl text-[15px] ${o === waarde ? "bg-white font-semibold shadow-sm dark:bg-[#2a2a31]" : "text-rustig"}`}>
            {o}
          </button>
        ))}
      </div>
    </fieldset>
  );
}


function TekstVeld({ label, uitleg, waarde, bewaar }: { label: string; uitleg: string; waarde: string; bewaar: (v: string) => void }) {
  const [v, setV] = useState(waarde);
  return (
    <form onSubmit={(e) => { e.preventDefault(); bewaar(v); }} className="flex flex-col gap-2">
      <label htmlFor={label} className={kop}>{label}</label>
      <div className="flex gap-2">
        <input id={label} value={v} onChange={(e) => setV(e.target.value)}
          className="h-12 min-w-0 flex-1 rounded-2xl bg-vlak px-4 outline-none" />
        <button disabled={v === waarde} className="h-12 rounded-2xl bg-accent px-5 font-medium text-white disabled:opacity-30">Bewaar</button>
      </div>
      <p className="px-1 text-sm text-rustig">{uitleg}</p>
    </form>
  );
}

function Profiel({ naam, gebruikersnaam, bewaar }: { naam: string; gebruikersnaam: string; bewaar: (n: string) => void }) {
  return <>
    <TekstVeld label="Naam" uitleg="Zo zien anderen je in de chat." waarde={naam} bewaar={bewaar} />
    {gebruikersnaam && (
      <div className="flex flex-col gap-1 px-1">
        <span className={kop.replace("mb-2 px-1 ", "")}>Gebruikersnaam</span>
        <span>@{gebruikersnaam}</span>
        <span className="text-sm text-rustig">Hiermee vinden anderen je om te chatten.</span>
      </div>
    )}
  </>;
}

/** Je eigen Anthropic-sleutel: we laten nooit zien wat er staat, alleen dát er een staat. */
function Sleutel({ ingesteld, bewaar }: { ingesteld: boolean; bewaar: (v: string) => void }) {
  const [v, setV] = useState("");
  return (
    <section className="flex flex-col gap-2">
      <h2 className={kop}>Eigen sleutel</h2>
      <div className="flex items-center gap-3 rounded-2xl bg-vlak px-4 py-3.5">
        <Vonk className="size-5 shrink-0 text-accent" />
        <span className="flex-1 text-[15px]">{ingesteld ? "Je gebruikt je eigen Anthropic-sleutel." : "Geen eigen sleutel ingesteld."}</span>
        {ingesteld && <button onClick={() => bewaar("")} className="text-sm font-medium text-red-600 dark:text-red-400">Verwijder</button>}
      </div>
      {!ingesteld && (
        <form onSubmit={(e) => { e.preventDefault(); bewaar(v); setV(""); }} className="flex gap-2">
          <input type="password" value={v} onChange={(e) => setV(e.target.value)} placeholder="sk-ant-…" autoComplete="off"
            aria-label="Anthropic-sleutel" className="h-12 min-w-0 flex-1 rounded-2xl bg-vlak px-4 outline-none placeholder:text-zacht" />
          <button disabled={!v.startsWith("sk-ant-")} className="h-12 rounded-2xl bg-accent px-5 font-medium text-white disabled:opacity-30">Bewaar</button>
        </form>
      )}
    </section>
  );
}

/** Betalen via de app (Stripe). Iedereen kan zich als verkoper aanmelden; alleen de eigenaar zet de sleutels. */
/** Alleen de eigenaar: één Anthropic-sleutel voor iedereen zonder eigen sleutel. Hij staat alleen op de server en
 * wordt nooit teruggegeven; de app ziet alleen of hij er is. */
function PlatformSleutel() {
  const [st, setSt] = useState<{ ai_platform?: boolean; ai_gratis_euro?: number } | null>(null);
  const [v, setV] = useState("");
  const [euro, setEuro] = useState("");
  const [melding, setMelding] = useState("");
  const laden = () => alsIk<{ ai_platform?: boolean; ai_gratis_euro?: number }>("toegang_status").then((s) => {
    setSt(s);
    setEuro((e) => e || String(s.ai_gratis_euro ?? 2));
  }).catch(() => setMelding("Laden lukte niet."));
  useEffect(() => { laden(); }, []);
  async function bewaar(e: FormEvent) {
    e.preventDefault();
    setMelding("");
    const a = await alsIk<{ fout?: string }>("toegang_instellen",
      { p_anthropic_sleutel: v.trim(), p_ai_gratis_euro: Number(euro.replace(",", ".")) || 0, p_gratis_gb: null }).catch(() => ({ fout: "Bewaren lukte niet." }));
    if (a.fout) return setMelding(a.fout);
    setV("");
    setMelding("Bewaard");
    laden();
  }
  return (
    <section className="flex flex-col gap-2">
      <h2 className={kop}>Sleutel voor iedereen (alleen jij)</h2>
      <p className="px-1 text-[15px] text-rustig">{st?.ai_platform
        ? "Staat aan. Wie geen eigen sleutel heeft, gebruikt deze, tot het bedrag per maand op is."
        : "Staat nog uit. Plak hier je Anthropic-sleutel; hij blijft op de server en niemand kan hem terugzien."}</p>
      <form onSubmit={bewaar} className="flex flex-col gap-2">
        <input type="password" value={v} onChange={(e) => setV(e.target.value)} placeholder={st?.ai_platform ? "Nieuwe sleutel (leeg laat de oude staan)" : "sk-ant-…"}
          autoComplete="off" aria-label="Anthropic-sleutel voor iedereen" className="h-12 rounded-2xl bg-vlak px-4 outline-none placeholder:text-zacht" />
        <label className="flex items-center gap-3 rounded-2xl bg-vlak px-4">
          <span className="flex-1 text-[15px]">Gratis per persoon per maand (€)</span>
          <input value={euro} onChange={(e) => setEuro(e.target.value)} inputMode="decimal" aria-label="Bedrag per persoon per maand"
            className="h-12 w-20 bg-transparent text-right outline-none" />
        </label>
        <button disabled={!st || (!st.ai_platform && !v.startsWith("sk-ant-"))}
          className="h-12 rounded-2xl bg-accent font-medium text-white disabled:opacity-30">Bewaar</button>
      </form>
      {melding && <p role="status" className="px-1 text-sm text-rustig">{melding}</p>}
    </section>
  );
}

function Betalingen({ eigenaar }: { eigenaar: boolean }) {
  const [st, setSt] = useState<BetaalStatus | null>(null);
  const [sleutel, setSleutel] = useState("");
  const [webhook, setWebhook] = useState("");
  const [melding, setMelding] = useState("");
  const [bezig, setBezig] = useState(false);
  const laden = () => betaalStatus().then(setSt).catch(() => setMelding("Laden lukte niet."));
  useEffect(() => { laden(); }, []);

  async function doe(werk: () => Promise<void>) {
    setBezig(true);
    setMelding("");
    try {
      await werk();
    } catch (e) {
      setMelding(e instanceof Error ? e.message : "Dat lukte niet.");
    } finally {
      setBezig(false);
    }
  }

  if (!st) return <p className="bezig-tekst px-1">{melding || "Laden"}</p>;
  return <>
    <section className="flex flex-col gap-2">
      <h2 className={kop}>Status</h2>
      <p className="rounded-2xl bg-vlak px-4 py-3.5 text-[15px]">
        {st.aan ? `Betalen via de app staat aan${st.testmodus ? " (testmodus, er gaat geen echt geld)" : ""}.`
          : "Betalen via de app staat nog uit."}
      </p>
    </section>
    {st.aan && (
      <section className="flex flex-col gap-2">
        <h2 className={kop}>Geld ontvangen</h2>
        {st.ik_kan_ontvangen ? <p className="px-1 text-rustig">Je kunt betalingen ontvangen. Het geld komt op je rekening als de koper bevestigt.</p> : <>
          <p className="px-1 text-rustig">Om te verkopen met betalen via de app meld je je eenmalig aan bij Stripe, met je identiteit en rekeningnummer.</p>
          <button disabled={bezig} onClick={() => doe(async () => { (window.top ?? window).location.href = await verkoperAanmelden(); })}
            className="h-12 rounded-2xl bg-accent font-medium text-white disabled:opacity-50">
            {st.ik_ben_aangemeld ? "Aanmelden afmaken" : "Aanmelden bij Stripe"}
          </button>
        </>}
      </section>
    )}
    {eigenaar && (
      <section className="flex flex-col gap-2">
        <h2 className={kop}>Sleutels (alleen jij)</h2>
        <p className="px-1 text-sm text-rustig">
          Sleutel: {st.sleutel_ingesteld ? "ingesteld" : "nog niet"} · Webhook: {st.webhook_ingesteld ? "ingesteld" : "nog niet"}.
          Leeg laten houdt wat er al staat.</p>
        <form className="flex flex-col gap-2" onSubmit={(e) => {
          e.preventDefault();
          doe(async () => {
            await platformInstellen(sleutel, webhook);
            setSleutel("");
            setWebhook("");
            await laden();
            setMelding("Bewaard");
          });
        }}>
          <input type="password" value={sleutel} onChange={(e) => setSleutel(e.target.value)} placeholder="Geheime sleutel (sk_test_…)"
            autoComplete="off" aria-label="Geheime Stripe-sleutel" className="h-12 rounded-2xl bg-vlak px-4 outline-none placeholder:text-zacht" />
          <input type="password" value={webhook} onChange={(e) => setWebhook(e.target.value)} placeholder="Webhookgeheim (whsec_…)"
            autoComplete="off" aria-label="Webhookgeheim" className="h-12 rounded-2xl bg-vlak px-4 outline-none placeholder:text-zacht" />
          <button disabled={bezig || (!sleutel.trim() && !webhook.trim())}
            className="h-12 rounded-2xl bg-accent font-medium text-white disabled:opacity-30">Bewaar</button>
        </form>
        <p className="px-1 text-[13px] text-zacht">Webhook-adres in Stripe: https://lnjsekmlpjyiwdlzcowa.supabase.co/functions/v1/betalen</p>
      </section>
    )}
    {melding && <p role="status" className="px-1 text-sm text-rustig">{melding}</p>}
  </>;
}

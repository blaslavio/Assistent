// Instellingen › Privacy en beveiliging, en Instellingen › Account. Dezelfde mogelijkheden als in de huidige app:
// een beveiligingscheck, tweestapsverificatie, waar je bent ingelogd, een lekcheck voor je wachtwoord, je mailadres,
// een nieuw wachtwoord, je gegevens downloaden, de voorwaarden en privacyverklaring, en je account verwijderen.
import { Fragment, useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { ditApparaatOnthouden, uitloggen, type Gebruiker } from "../api";
import {
  TECHNIEK, accountVerwijderen, apparaatVergeten, apparaten, beveiliging, gegevensDownloaden, mailadresInstellen,
  otpauth, base32, overalUitloggen, profielBijwerken, tweeStapBevestigen, tweeStapStarten, tweeStapUitzetten,
  wachtwoordGelekt, type Apparaat, type Beveiliging as Stand,
} from "../lib/beveiliging";
import { codeSturen, mailBevestigen, mailIngesteld } from "../lib/aanmelden";
import { PRIVACY, VOORWAARDEN } from "../lib/teksten";
import { kop } from "./instellingen-ui";

const veld = "h-12 min-w-0 rounded-2xl bg-vlak px-4 outline-none";
const knop = "h-12 shrink-0 rounded-2xl bg-accent px-5 font-medium text-white disabled:opacity-30";
const stil = "h-10 rounded-full bg-vlak px-4 text-sm font-medium";

const datum = (t: string) => new Date(t).toLocaleString("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const foutTekst = (e: unknown) => (e instanceof Error ? e.message : "Dat lukte niet. Probeer het opnieuw.");

function Blok({ titel, children }: { titel: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className={kop}>{titel}</h2>
      {children}
    </section>
  );
}

function Melding({ tekst, fout }: { tekst: string; fout?: boolean }) {
  if (!tekst) return null;
  return <p role={fout ? "alert" : "status"} className={`px-1 text-sm ${fout ? "text-red-600 dark:text-red-400" : "text-rustig"}`}>{tekst}</p>;
}

/** Bovenaan Privacy en beveiliging. Het geheugen van de assistent staat eronder, in Instellingen zelf. */
export function Beveiliging({ gebruiker }: { gebruiker: Gebruiker }) {
  const [stand, setStand] = useState<Stand | null>(null);
  const [lijst, setLijst] = useState<Apparaat[]>([]);
  const [fout, setFout] = useState("");

  const laden = useCallback(async () => {
    try {
      const [b, a] = await Promise.all([beveiliging(), apparaten().catch(() => [])]);
      setStand(b);
      setLijst(a);
      setFout("");
    } catch (e) {
      setFout(foutTekst(e));
    }
  }, []);
  useEffect(() => { laden(); }, [laden]);

  if (!stand) return fout ? <Melding tekst={fout} fout /> : <p className="px-1 text-rustig">Laden…</p>;
  return <>
    <Check stand={stand} gebruiker={gebruiker} />
    <TweeStap stand={stand} gebruiker={gebruiker} klaar={laden} />
    <Ingelogd stand={stand} lijst={lijst} klaar={laden} />
    <Lekcheck />
  </>;
}

function Check({ stand, gebruiker }: { stand: Stand; gebruiker: Gebruiker }) {
  const punten: [boolean, string, string][] = [
    [stand.twee_stap, "Tweestapsverificatie staat aan", "Zet tweestapsverificatie aan, hieronder."],
    [!stand.twee_stap || stand.herstelcodes_over >= 3, "Genoeg herstelcodes",
      "Je hebt bijna geen herstelcodes meer. Zet tweestapsverificatie uit en weer aan voor nieuwe."],
    [!!gebruiker.email, "Mailadres voor herstel", "Vul je mailadres in bij Account."],
    [stand.sessies.length <= 3, "Weinig open sessies", "Log uit op apparaten die je niet meer gebruikt."],
    [!stand.mislukt_recent, "Geen mislukte inlogpogingen deze week",
      `${stand.mislukt_recent} mislukte poging(en) deze week. Was jij dat niet? Kies een nieuw wachtwoord bij Account.`],
  ];
  const goed = punten.filter(([ok]) => ok).length;
  return (
    <Blok titel="Beveiligingscheck">
      <div className="flex flex-col gap-3 rounded-2xl bg-vlak p-4">
        <p className="font-semibold">{goed} van {punten.length} in orde</p>
        <div className="h-2 overflow-hidden rounded-full bg-zacht/25">
          <div className="h-full rounded-full bg-accent" style={{ width: `${(goed / punten.length) * 100}%` }} />
        </div>
        <ul className="flex flex-col gap-1.5 text-[15px]">
          {punten.map(([ok, naam, tip]) => (
            <li key={naam} className="flex gap-2">
              <span aria-hidden className={ok ? "text-green-600 dark:text-green-400" : "text-amber-600 dark:text-amber-400"}>{ok ? "✓" : "!"}</span>
              <span>{ok ? naam : tip}</span>
            </li>
          ))}
        </ul>
      </div>
    </Blok>
  );
}

function TweeStap({ stand, gebruiker, klaar }: { stand: Stand; gebruiker: Gebruiker; klaar: () => Promise<void> }) {
  const [geheim, setGeheim] = useState("");
  const [codes, setCodes] = useState<string[]>([]);
  const [code, setCode] = useState("");
  const [ww, setWw] = useState("");
  const [uit, setUit] = useState(false);
  const [fout, setFout] = useState("");
  const [bezig, setBezig] = useState(false);

  async function doe(actie: () => Promise<void>) {
    setBezig(true);
    setFout("");
    try { await actie(); } catch (e) { setFout(foutTekst(e)); } finally { setBezig(false); }
  }

  if (codes.length) return (
    <Blok titel="Tweestapsverificatie">
      <div className="flex flex-col gap-3 rounded-2xl bg-vlak p-4">
        <p className="font-semibold">Tweestapsverificatie staat aan.</p>
        <p className="text-[15px] text-rustig">Bewaar deze herstelcodes, bijvoorbeeld in Notities of op papier. Elke code werkt
          één keer, voor als je telefoon kwijt is. Je ziet ze maar één keer.</p>
        <ul className="grid grid-cols-2 gap-2 font-mono text-[15px]">{codes.map((c) => <li key={c}>{c}</li>)}</ul>
        <div className="flex gap-2">
          <button className={stil} onClick={() => navigator.clipboard?.writeText(codes.join("\n")).catch(() => {})}>Kopiëren</button>
          <button className={stil} onClick={() => setCodes([])}>Ik heb ze bewaard</button>
        </div>
      </div>
    </Blok>
  );

  if (stand.twee_stap) return (
    <Blok titel="Tweestapsverificatie">
      <div className="flex flex-col gap-3 rounded-2xl bg-vlak p-4">
        <p className="text-[15px]">Staat aan. Bij inloggen vraagt de app je wachtwoord én een code uit je app. Je hebt nog
          {" "}{stand.herstelcodes_over} herstelcodes.</p>
        {!uit ? <button className={`${stil} self-start`} onClick={() => setUit(true)}>Uitzetten</button> : (
          <form className="flex flex-col gap-2" onSubmit={(e: FormEvent) => {
            e.preventDefault();
            doe(async () => { await tweeStapUitzetten(ww, code.trim()); setUit(false); setWw(""); setCode(""); await klaar(); });
          }}>
            <input type="password" autoComplete="current-password" placeholder="Je wachtwoord" value={ww}
              onChange={(e) => setWw(e.target.value)} className={`${veld} bg-white dark:bg-black/30`} aria-label="Je wachtwoord" />
            <input inputMode="numeric" autoComplete="one-time-code" placeholder="Code uit je app of een herstelcode" value={code}
              onChange={(e) => setCode(e.target.value)} className={`${veld} bg-white dark:bg-black/30`} aria-label="Code" />
            <div className="flex gap-2">
              <button disabled={bezig || !ww || !code.trim()} className={knop}>Uitzetten</button>
              <button type="button" className="h-12 px-3 text-rustig" onClick={() => setUit(false)}>Annuleren</button>
            </div>
          </form>
        )}
        <Melding tekst={fout} fout />
      </div>
    </Blok>
  );

  const account = gebruiker.naam || gebruiker.email || "eigenaar";
  return (
    <Blok titel="Tweestapsverificatie">
      <div className="flex flex-col gap-3 rounded-2xl bg-vlak p-4">
        <p className="text-[15px] text-rustig">Een extra slot op je account: naast je wachtwoord is een code van 6 cijfers nodig,
          die elke 30 seconden verandert. Zelfs met je wachtwoord komt een ander er dan niet in.</p>
        {!geheim ? (
          <button disabled={bezig} className={`${knop} self-start`}
            onClick={() => doe(async () => setGeheim((await tweeStapStarten()).geheim))}>Aanzetten</button>
        ) : <>
          <p className="text-[15px]"><b>1.</b> Voeg de code toe aan je app voor verificatiecodes.</p>
          <a href={otpauth(geheim, account)} className="flex h-12 items-center justify-center rounded-2xl bg-white font-medium text-accent dark:bg-black/30">
            Toevoegen aan Wachtwoorden
          </a>
          <p className="text-sm text-rustig">Of typ deze sleutel over:</p>
          <p className="select-all break-all font-mono text-[15px]">{base32(geheim).match(/.{1,4}/g)?.join(" ")}</p>
          <form className="flex flex-col gap-2" onSubmit={(e: FormEvent) => {
            e.preventDefault();
            doe(async () => { setCodes((await tweeStapBevestigen(code.trim())).herstelcodes); setGeheim(""); setCode(""); await klaar(); });
          }}>
            <label htmlFor="totp" className="text-[15px]"><b>2.</b> Typ de code van 6 cijfers die je app nu laat zien.</label>
            <div className="flex gap-2">
              <input id="totp" inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={code}
                onChange={(e) => setCode(e.target.value)} className={`${veld} flex-1 bg-white dark:bg-black/30`} />
              <button disabled={bezig || !code.trim()} className={knop}>Aanzetten</button>
            </div>
          </form>
          <button className="self-start text-sm text-rustig" onClick={() => { setGeheim(""); setCode(""); }}>Annuleren</button>
        </>}
        <Melding tekst={fout} fout />
      </div>
    </Blok>
  );
}

// Lange lijsten tonen eerst kort: de nieuwste paar, de rest op verzoek.
const KORT = 3;

function Meer({ aantal, open, zet }: { aantal: number; open: boolean; zet: (open: boolean) => void }) {
  if (aantal <= KORT) return null;
  return (
    <button className="self-start px-1 text-sm font-medium text-accent" aria-expanded={open} onClick={() => zet(!open)}>
      {open ? "Minder tonen" : `Toon alle ${aantal}`}</button>
  );
}

function Ingelogd({ stand, lijst, klaar }: { stand: Stand; lijst: Apparaat[]; klaar: () => Promise<void> }) {
  const [melding, setMelding] = useState("");
  const [inlogs, setInlogs] = useState(false);
  const [alleSessies, setAlleSessies] = useState(false);
  const [alleApparaten, setAlleApparaten] = useState(false);
  const reden: Record<string, string> = { wachtwoord: "fout wachtwoord", code: "foute code", sleutel: "Face ID geweigerd" };
  return <>
    <Blok titel="Ingelogd op">
      <ul className="flex flex-col divide-y divide-lijn rounded-2xl bg-vlak">
        {(alleSessies ? stand.sessies : stand.sessies.slice(0, KORT)).map((s, i) => (
          <li key={i} className="flex items-center gap-2 px-4 py-3 text-[15px]">
            <span className="flex-1">{s.apparaat || "Onbekend"} <span className="text-rustig">· {datum(s.laatst)}</span></span>
            {s.deze && <span className="text-sm text-accent">dit apparaat</span>}
          </li>
        ))}
      </ul>
      <Meer aantal={stand.sessies.length} open={alleSessies} zet={setAlleSessies} />
      {(stand.sessies.length > 1 || lijst.length > 0) && (
        <button className={`${stil} self-start`} onClick={async () => {
          try {
            await overalUitloggen();
            await ditApparaatOnthouden().catch(() => {});
            setMelding("Andere apparaten zijn uitgelogd.");
            await klaar();
          } catch (e) { setMelding(foutTekst(e)); }
        }}>Op alle andere apparaten uitloggen</button>
      )}
      <Melding tekst={melding} />
    </Blok>
    {lijst.length > 0 && (
      <Blok titel="Ingelogd blijven op">
        <ul className="flex flex-col divide-y divide-lijn rounded-2xl bg-vlak">
          {(alleApparaten ? lijst : lijst.slice(0, KORT)).map((a) => (
            <li key={a.id} className="flex items-center gap-2 py-2 pr-2 pl-4 text-[15px]">
              <span className="flex-1">{a.naam || "Onbekend"} <span className="text-rustig">· {datum(a.laatst)}</span></span>
              <button className="h-9 rounded-full px-3 text-sm text-rustig" onClick={async () => {
                await apparaatVergeten(a.id).catch(() => {});
                await klaar();
              }}>Vergeten</button>
            </li>
          ))}
        </ul>
        <Meer aantal={lijst.length} open={alleApparaten} zet={setAlleApparaten} />
        <p className="px-1 text-sm text-rustig">Op deze apparaten hoef je niet in te loggen. Vergeet je er een, dan moet je daar weer inloggen.</p>
      </Blok>
    )}
    {stand.inlogs.length > 0 && (
      <section className="flex flex-col gap-2">
        <button className={`${kop} self-start`} aria-expanded={inlogs} onClick={() => setInlogs(!inlogs)}>
          Recente inlogpogingen {inlogs ? "▴" : "▾"}
        </button>
        {inlogs && <>
          <ul className="flex flex-col divide-y divide-lijn rounded-2xl bg-vlak">
            {stand.inlogs.map((i, n) => (
              <li key={n} className="flex gap-2 px-4 py-2.5 text-[15px]">
                <span aria-label={i.gelukt ? "Gelukt" : "Mislukt"} className={i.gelukt ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}>
                  {i.gelukt ? "✓" : "✕"}
                </span>
                <span className="flex-1">{datum(i.tijd)} · {i.apparaat || "onbekend"}
                  {i.reden && reden[i.reden] && <span className="text-red-600 dark:text-red-400"> · {reden[i.reden]}</span>}</span>
              </li>
            ))}
          </ul>
          <p className="px-1 text-sm text-rustig">Zie je iets wat jij niet was? Kies een nieuw wachtwoord bij Account; andere apparaten worden dan uitgelogd.</p>
        </>}
      </section>
    )}
  </>;
}

function Lekcheck() {
  const [ww, setWw] = useState("");
  const [uitkomst, setUitkomst] = useState<{ tekst: string; fout: boolean } | null>(null);
  return (
    <Blok titel="Is mijn wachtwoord gelekt?">
      <form className="flex gap-2" onSubmit={async (e) => {
        e.preventDefault();
        try {
          const n = await wachtwoordGelekt(ww);
          setUitkomst(n ? { tekst: `Dit wachtwoord komt ${n.toLocaleString("nl-NL")} keer voor in datalekken. Kies een nieuw wachtwoord bij Account.`, fout: true }
            : { tekst: "Niet gevonden in bekende datalekken.", fout: false });
        } catch (f) {
          setUitkomst({ tekst: foutTekst(f), fout: true });
        }
        setWw("");
      }}>
        <input type="password" autoComplete="current-password" value={ww} onChange={(e) => setWw(e.target.value)}
          aria-label="Wachtwoord om te controleren" placeholder="Wachtwoord" className={`${veld} flex-1`} />
        <button disabled={!ww} className={knop}>Controleren</button>
      </form>
      {uitkomst && <Melding tekst={uitkomst.tekst} fout={uitkomst.fout} />}
      <p className="px-1 text-sm text-rustig">Je wachtwoord verlaat de app niet: alleen de eerste 5 tekens van een versleutelde
        vingerafdruk gaan naar Have I Been Pwned.</p>
    </Blok>
  );
}

export function Techniek() {
  const [open, setOpen] = useState(false);
  return (
    <section className="flex flex-col gap-2">
      <button className={`${kop} self-start`} aria-expanded={open} onClick={() => setOpen(!open)}>
        Zo is het beveiligd {open ? "▴" : "▾"}
      </button>
      {open && (
        <dl className="flex flex-col gap-2 rounded-2xl bg-vlak p-4 text-[15px]">
          {TECHNIEK.map(([naam, hoe]) => (
            <div key={naam}><dt className="font-medium">{naam}</dt><dd className="text-rustig">{hoe}</dd></div>
          ))}
        </dl>
      )}
    </section>
  );
}

// --- Account ------------------------------------------------------------------------------------------------------

export function Account({ gebruiker, vernieuw, opUitgelogd }: { gebruiker: Gebruiker; vernieuw: () => Promise<void>;
  opUitgelogd: () => void }) {
  const [tekst, setTekst] = useState<"voorwaarden" | "privacy" | null>(null);
  if (tekst) return <>
    <button className={`${stil} self-start`} onClick={() => setTekst(null)}>Terug naar Account</button>
    <Opmaak tekst={tekst === "voorwaarden" ? VOORWAARDEN : PRIVACY} />
  </>;
  return <>
    {!gebruiker.naam && <Gebruikersnaam vernieuw={vernieuw} />}
    <Mailadres huidig={gebruiker.email ?? ""} vernieuw={vernieuw} />
    {gebruiker.email && <MailBevestigen email={gebruiker.email} bevestigd={!!gebruiker.email_bevestigd} vernieuw={vernieuw} />}
    <Wachtwoord />
    <Blok titel="Je gegevens">
      <ul className="flex flex-col divide-y divide-lijn overflow-hidden rounded-2xl bg-vlak">
        <li><button className="w-full px-4 py-3.5 text-left font-medium" onClick={() => gegevensDownloaden().catch(() => {})}>
          Mijn gegevens downloaden</button></li>
        <li><button className="w-full px-4 py-3.5 text-left font-medium" onClick={() => setTekst("voorwaarden")}>Voorwaarden</button></li>
        <li><button className="w-full px-4 py-3.5 text-left font-medium" onClick={() => setTekst("privacy")}>Privacyverklaring</button></li>
      </ul>
      <p className="px-1 text-sm text-rustig">De download bevat al je eigen gegevens, zonder wachtwoorden en sleutels.</p>
    </Blok>
    {gebruiker.id !== 1 && <Verwijderen opUitgelogd={opUitgelogd} />}
  </>;
}

function Formulier({ titel, label, type = "text", autoComplete, uitleg, opslaan }: { titel: string; label: string;
  type?: string; autoComplete?: string; uitleg: string; opslaan: (v: string) => Promise<string> }) {
  const [v, setV] = useState("");
  const [melding, setMelding] = useState<{ tekst: string; fout: boolean } | null>(null);
  return (
    <Blok titel={titel}>
      <form className="flex gap-2" onSubmit={async (e) => {
        e.preventDefault();
        try {
          setMelding({ tekst: await opslaan(v.trim() || v), fout: false });
          setV("");
        } catch (f) {
          setMelding({ tekst: foutTekst(f), fout: true });
        }
      }}>
        <input type={type} autoComplete={autoComplete} value={v} onChange={(e) => setV(e.target.value)} aria-label={label}
          placeholder={label} autoCapitalize="none" className={`${veld} flex-1`} />
        <button disabled={!v.trim()} className={knop}>Bewaar</button>
      </form>
      {melding && <Melding tekst={melding.tekst} fout={melding.fout} />}
      <p className="px-1 text-sm text-rustig">{uitleg}</p>
    </Blok>
  );
}

function Gebruikersnaam({ vernieuw }: { vernieuw: () => Promise<void> }) {
  return <Formulier titel="Gebruikersnaam" label="Bijvoorbeeld sanne.k" autoComplete="username"
    uitleg="Je hebt nog geen gebruikersnaam. Daarmee vinden anderen je om te chatten, en log je in."
    opslaan={async (v) => { await profielBijwerken({ gebruikersnaam: v }); await vernieuw(); return "Bewaard"; }} />;
}

function Mailadres({ huidig, vernieuw }: { huidig: string; vernieuw: () => Promise<void> }) {
  return <Formulier titel="Mailadres" label={huidig || "naam@voorbeeld.nl"} type="email" autoComplete="email"
    uitleg={huidig ? `Nu: ${huidig}. Hiermee kun je ook inloggen en je wachtwoord terugkrijgen.` :
      "Hiermee kun je ook inloggen en je wachtwoord terugkrijgen."}
    opslaan={async (v) => { await mailadresInstellen(v); await vernieuw(); return "Bewaard"; }} />;
}

/** Je mailadres bevestigen met een code. Alleen als de app mails kan versturen. */
function MailBevestigen({ email, bevestigd, vernieuw }: { email: string; bevestigd: boolean; vernieuw: () => Promise<void> }) {
  const [kan, setKan] = useState(false);
  const [gestuurd, setGestuurd] = useState(false);
  const [code, setCode] = useState("");
  const [melding, setMelding] = useState<{ tekst: string; fout: boolean } | null>(null);
  useEffect(() => { mailIngesteld().then(setKan); }, []);
  if (bevestigd) return melding && !melding.fout ? <Melding tekst={melding.tekst} /> : null;
  if (!kan) return null;
  async function doe(werk: () => Promise<string>) {
    setMelding(null);
    try { setMelding({ tekst: await werk(), fout: false }); } catch (f) { setMelding({ tekst: foutTekst(f), fout: true }); }
  }
  return (
    <Blok titel="Mailadres bevestigen">
      <p className="px-1 text-[15px] text-rustig">Nog niet bevestigd. Zo weet je zeker dat een herstelcode bij jou aankomt.</p>
      {!gestuurd ? (
        <button className={`${knop} self-start`} onClick={() => doe(async () => {
          const r = await codeSturen();
          if (r.bevestigd) { await vernieuw(); return "Je mailadres is al bevestigd."; }
          setGestuurd(true);
          return `Er staat een code in je mail (${email}).`;
        })}>Stuur code</button>
      ) : (
        <form className="flex gap-2" onSubmit={(e) => {
          e.preventDefault();
          doe(async () => { await mailBevestigen(code); await vernieuw(); return "Je mailadres is bevestigd."; });
        }}>
          <input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)}
            aria-label="Code uit de mail" placeholder="Code uit de mail" className={`${veld} flex-1`} />
          <button disabled={code.replace(/\D/g, "").length < 6} className={knop}>Bevestig</button>
        </form>
      )}
      {melding && <Melding tekst={melding.tekst} fout={melding.fout} />}
    </Blok>
  );
}

function Wachtwoord() {
  return <Formulier titel="Nieuw wachtwoord" label="Minstens 10 tekens" type="password" autoComplete="new-password"
    uitleg="Na een nieuw wachtwoord worden je andere apparaten uitgelogd."
    opslaan={async (v) => {
      await profielBijwerken({ wachtwoord: v });
      await ditApparaatOnthouden().catch(() => {});
      return "Je wachtwoord is gewijzigd.";
    }} />;
}

function Verwijderen({ opUitgelogd }: { opUitgelogd: () => void }) {
  const [open, setOpen] = useState(false);
  const [zeker, setZeker] = useState("");
  const [fout, setFout] = useState("");
  return (
    <Blok titel="Account verwijderen">
      {!open ? (
        <button className="h-12 rounded-2xl bg-vlak font-medium text-red-600 dark:text-red-400" onClick={() => setOpen(true)}>
          Account verwijderen</button>
      ) : (
        <form className="flex flex-col gap-2 rounded-2xl bg-vlak p-4" onSubmit={async (e) => {
          e.preventDefault();
          try {
            await accountVerwijderen();
            await uitloggen();
            opUitgelogd();
          } catch (f) { setFout(foutTekst(f)); }
        }}>
          <p className="text-[15px]">Al je gegevens worden gewist: agenda, taken, chats, aanbod en instellingen. Dit kan niet terug.
            Download eerst je gegevens als je ze wilt bewaren.</p>
          <label htmlFor="zeker" className="text-sm text-rustig">Typ <b>verwijder</b> om te bevestigen.</label>
          <input id="zeker" value={zeker} onChange={(e) => setZeker(e.target.value)} autoCapitalize="none"
            className={`${veld} bg-white dark:bg-black/30`} />
          <div className="flex gap-2">
            <button disabled={zeker.trim().toLowerCase() !== "verwijder"}
              className="h-12 rounded-2xl bg-red-600 px-5 font-medium text-white disabled:opacity-30">Definitief verwijderen</button>
            <button type="button" className="h-12 px-3 text-rustig" onClick={() => { setOpen(false); setZeker(""); }}>Annuleren</button>
          </div>
          <Melding tekst={fout} fout />
        </form>
      )}
    </Blok>
  );
}

/** De teksten gebruiken een klein beetje opmaak: **vet**, genummerde punten en alinea's. */
export function Opmaak({ tekst }: { tekst: string }) {
  const vet = (regel: string) => regel.split(/\*\*(.+?)\*\*/g).map((d, i) => (i % 2 ? <b key={i}>{d}</b> : <Fragment key={i}>{d}</Fragment>));
  const blokken = tekst.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  return (
    <article className="flex flex-col gap-3 text-[15px] leading-relaxed">
      {blokken.map((b, i) => {
        const punten = b.split(/\n(?=\d+\.\s)/);
        if (/^\d+\.\s/.test(b)) return (
          <ol key={i} className="flex list-decimal flex-col gap-2 pl-5">
            {punten.map((p, j) => <li key={j}>{vet(p.replace(/^\d+\.\s+/, "").replace(/\s*\n\s*/g, " "))}</li>)}
          </ol>
        );
        return <p key={i}>{vet(b.replace(/\s*\n\s*/g, " "))}</p>;
      })}
    </article>
  );
}

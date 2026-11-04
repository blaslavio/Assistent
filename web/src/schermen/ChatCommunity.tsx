// Community's in de chat: feed of groepen, maken of meedoen, en een community als eigen app met kanalen, agenda,
// cursussen, leden en beheer. Hersteld uit 27d0160 nadat deze delen bij het inkorten van Chat verloren gingen.
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Ballon, Boek, Kalender, Meer, Mensen, Plus, Terug } from "../iconen";
import { communityAntwoorden, communityDeelnemen, communityMaken, communityTijdelijk, communityUitnodigen, community,
  isHerinnering, type Community, type Deelnemer } from "../lib/chat";
import { feedInstelling } from "../lib/feed";
import { cursusLinkPakken } from "../lib/cursus";
import { tijdje } from "../lib/tijd";
import { Rondje } from "../rondje";
import { Berichten, Feed, Schrijven } from "./Feed";
import { Cursussen } from "./Cursussen";
import { CommunityBeheer } from "./CommunityBeheer";
import { EindeKiezen, OpruimBlad, opruimTekst } from "./CommunityOpruimen";
import { ClubAgenda } from "./ClubAgenda";
import { Onderblad } from "./Onderblad";
import { AppKop, AppMenu, type MenuItem } from "./AppMenu";
import ModeratieMenu from "./ModeratieMenu";
import { Leeg } from "./ChatPanelen";
import type { Gegevens } from "../api";
import type { Staat } from "../App";

const foutVan = (e: unknown) => (e instanceof Error ? e.message : "Dat lukte niet.");

function bewaardWeergave(): "feed" | "groepen" {
  try { return localStorage.getItem("assistent.communitydeel") === "groepen" ? "groepen" : "feed"; } catch { return "feed"; }
}

export function Communitys({ lijst, open, vernieuw, staat }: { lijst: Community[]; open: (id: number) => void;
  vernieuw: () => Promise<void>; staat: Staat }) {
  const [weergave, setWeergaveRuw] = useState(bewaardWeergave);
  const [begin] = useState(() => feedInstelling(staat.data.instellingen));
  const [startBlad, setStartBlad] = useState(false);
  function setWeergave(w: "feed" | "groepen") {
    setWeergaveRuw(w);
    try { localStorage.setItem("assistent.communitydeel", w); } catch { /* geen opslag */ }
  }
  const keuze = (<>
    <p className="mx-6 mb-3 text-[13px] leading-snug text-rustig">
      Groepen rond wat je samen doet: een club, klas, team of je klanten. Je praat in kanalen, plant samen, deelt cursussen en verkoopt tickets of lidmaatschappen.
    </p>
    <div className="mx-6 mb-3 grid grid-cols-2 gap-1 rounded-full bg-vlak p-1">
      {([["feed", "Feed"], ["groepen", "Groepen"]] as const).map(([k, t]) => (
        <button key={k} onClick={() => setWeergave(k)} aria-pressed={weergave === k}
          className={`h-9 rounded-full text-sm font-medium ${weergave === k ? "bg-white shadow-sm dark:bg-[#2a2a30]" : "text-rustig"}`}>{t}</button>
      ))}
    </div>
  </>);
  if (weergave === "feed") return (
    <>
      {keuze}
      <Feed mijn={lijst.filter((c) => c.status === "lid" && !c.herinnering)} begin={begin} open={open} vernieuw={vernieuw}
        maken={() => { setStartBlad(true); setWeergave("groepen"); }} />
    </>
  );
  return <>{keuze}<Groepen lijst={lijst} open={open} vernieuw={vernieuw} startBlad={startBlad} afspraken={staat.data.afspraken} /></>;
}

function Groepen({ lijst, open, vernieuw, startBlad = false, afspraken }: { lijst: Community[]; open: (id: number) => void;
  vernieuw: () => Promise<void>; startBlad?: boolean; afspraken: Staat["data"]["afspraken"] }) {
  const [blad, setBlad] = useState(startBlad);
  const [opties, setOpties] = useState<Community | null>(null);
  const [toonBewaard, setToonBewaard] = useState(false);
  const actief = lijst.filter((c) => !isHerinnering(c));
  const bewaard = lijst.filter(isHerinnering);
  const rij = (c: Community) => {
    const nieuw = c.kanalen.reduce((n, k) => n + k.ongelezen, 0);
    const extra = opruimTekst(c);
    return (
      <li key={c.id}>
        {c.status === "uitgenodigd" ? (
          <div className="flex items-center gap-3 rounded-2xl px-3 py-2.5">
            <Rondje naam={c.naam} id={-1000 - c.id} groot />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-medium">{c.naam}</span>
              <span className="truncate text-sm text-rustig">Uitnodiging{c.door ? ` van ${c.door}` : ""}{extra ? ` · ${extra}` : ""}</span>
            </span>
            <button onClick={() => antwoord(c.id, "nee")} className="h-9 rounded-full bg-vlak px-3 text-sm">Nee</button>
            <button onClick={() => antwoord(c.id, "ja")} className="h-9 rounded-full bg-accent px-3 text-sm font-medium text-white">Doe mee</button>
          </div>
        ) : (
          <div className="flex items-center rounded-2xl hover:bg-vlak">
            <button onClick={() => open(c.id)} className={`flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left ${isHerinnering(c) ? "opacity-70" : ""}`}>
              <Rondje naam={c.naam} id={-1000 - c.id} groot />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className={`truncate ${nieuw ? "font-semibold" : "font-medium"}`}>{c.naam}</span>
                <span className="truncate text-sm text-rustig">
                  {extra || `${c.leden} ${c.leden === 1 ? "lid" : "leden"} · ${c.kanalen.length} ${c.kanalen.length === 1 ? "kanaal" : "kanalen"}`}
                </span>
              </span>
              {nieuw > 0 && (
                <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-semibold text-white">{nieuw}</span>
              )}
            </button>
            <button onClick={() => setOpties(c)} aria-label={`Opties voor ${c.naam}`}
              className="flex size-10 shrink-0 items-center justify-center rounded-full text-rustig hover:bg-black/5 dark:hover:bg-white/10">
              <Meer className="size-5" />
            </button>
          </div>
        )}
      </li>
    );
  };
  const [fout, setFout] = useState("");
  async function antwoord(id: number, a: "ja" | "nee") {
    setFout("");
    try {
      await communityAntwoorden(id, a);
      await vernieuw();
      if (a === "ja") open(id);
    } catch (e) {
      setFout(foutVan(e));
    }
  }
  return (
    <>
      {lijst.length === 0 && (
        <Leeg icoon={<Mensen />} titel="Nog geen community's"
          uitleg="Een community is een groep met eigen kanalen, zoals een club, buurt of team. Alles blijft versleuteld.">
          <button onClick={() => setBlad(true)} className="mt-2 h-11 rounded-full bg-accent px-5 font-medium text-white">
            Maak of doe mee
          </button>
        </Leeg>
      )}
      {fout && <p role="alert" className="px-6 pb-2 text-sm text-red-600 dark:text-red-400">{fout}</p>}
      {lijst.length > 0 && (
        <ul className="flex flex-col px-3">
          {actief.map(rij)}
          <li>
            <button onClick={() => setBlad(true)} className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-accent hover:bg-vlak">
              <span className="flex size-12 items-center justify-center rounded-full bg-vlak"><Plus className="size-5" /></span>
              <span className="font-medium">Nieuwe community of code</span>
            </button>
          </li>
          {bewaard.length > 0 && (
            <li className="mt-3">
              <button onClick={() => setToonBewaard(!toonBewaard)} aria-expanded={toonBewaard}
                className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium text-rustig">
                <span>Herinneringen en bewaard · {bewaard.length}</span>
                <Terug className={`size-4 transition-transform ${toonBewaard ? "rotate-90" : "-rotate-90"}`} />
              </button>
            </li>
          )}
          {toonBewaard && bewaard.map(rij)}
        </ul>
      )}
      {opties && <OpruimBlad c={opties} afspraken={afspraken} sluit={() => setOpties(null)}
        klaar={async () => { setOpties(null); await vernieuw(); }} />}
      {blad && <CommunityBlad afspraken={afspraken} sluit={() => setBlad(false)} klaar={async (id) => { setBlad(false); await vernieuw(); open(id); }} />}
    </>
  );
}

const veld = "h-12 w-full rounded-2xl bg-vlak px-4 outline-none placeholder:text-zacht";

function CommunityBlad({ sluit, klaar, afspraken }: { sluit: () => void; klaar: (id: number) => void;
  afspraken: Staat["data"]["afspraken"] }) {
  const [soort, setSoort] = useState<"maken" | "code">("maken");
  const [tijdelijk, setTijdelijk] = useState(false);
  const [nieuw, setNieuw] = useState<number | null>(null);
  const [naam, setNaam] = useState("");
  const [over, setOver] = useState("");
  const [code, setCode] = useState("");
  const [fout, setFout] = useState("");
  const [bezig, setBezig] = useState(false);
  async function doe(e: FormEvent) {
    e.preventDefault();
    setFout("");
    setBezig(true);
    try {
      const id = (soort === "maken" ? await communityMaken(naam.trim(), over.trim()) : await communityDeelnemen(code)).id;
      if (soort === "maken" && tijdelijk) setNieuw(id);
      else klaar(id);
    } catch (er) {
      setFout(foutVan(er));
    } finally {
      setBezig(false);
    }
  }
  if (nieuw !== null) return (
    <Onderblad titel="Tijdelijke community" sluit={() => klaar(nieuw)}>
      <EindeKiezen afspraken={afspraken} eigenaar kies={async (e) => {
        try { if (e) await communityTijdelijk(nieuw, e.eindigt, e.naAfloop); } catch (er) { setFout(foutVan(er)); return; }
        klaar(nieuw);
      }} />
      {fout && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{fout}</p>}
    </Onderblad>
  );
  return (
    <Onderblad titel="Community" sluit={sluit}>
      <div className="grid grid-cols-2 gap-1 rounded-full bg-vlak p-1">
        {([["maken", "Nieuwe maken"], ["code", "Meedoen met code"]] as const).map(([k, t]) => (
          <button key={k} onClick={() => setSoort(k)} aria-pressed={soort === k}
            className={`h-9 rounded-full text-sm font-medium ${soort === k ? "bg-white shadow-sm dark:bg-[#2a2a30]" : "text-rustig"}`}>{t}</button>
        ))}
      </div>
      <form onSubmit={doe} className="flex flex-col gap-3">
        {soort === "maken" ? (
          <>
            <input autoFocus value={naam} onChange={(e) => setNaam(e.target.value)} maxLength={60} autoComplete="off" placeholder="Naam, bijvoorbeeld Buurt Sanne en Bram"
              aria-label="Naam" className={veld} />
            <input value={over} onChange={(e) => setOver(e.target.value)} maxLength={300} placeholder="Waar gaat het over? (mag leeg)"
              aria-label="Omschrijving" className={veld} />
            <label className="flex items-center justify-between gap-3 rounded-2xl bg-vlak px-4 py-3">
              <span className="flex flex-col">
                <span className="font-medium">Tijdelijk</span>
                <span className="text-[13px] text-rustig">Voor een uitje of feest. Eindigt vanzelf.</span>
              </span>
              <input type="checkbox" checked={tijdelijk} onChange={(e) => setTijdelijk(e.target.checked)} className="size-5 accent-[var(--color-accent)]" />
            </label>
            <p className="text-[13px] text-rustig">Je krijgt meteen de kanalen mededelingen en algemeen.</p>
          </>
        ) : (
          <input autoFocus value={code} onChange={(e) => setCode(e.target.value)} placeholder="Uitnodigingscode"
            autoCapitalize="characters" autoCorrect="off" aria-label="Uitnodigingscode" className={`${veld} font-mono tracking-wider`} />
        )}
        {fout && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{fout}</p>}
        <button disabled={bezig || (soort === "maken" ? !naam.trim() : !code.trim())}
          className="h-12 rounded-2xl bg-accent font-medium text-white disabled:opacity-30">
          {soort === "maken" ? "Maken" : "Meedoen"}
        </button>
      </form>
    </Onderblad>
  );
}

type CommunityDeel = "kanalen" | "agenda" | "cursussen" | "leden" | "meer";

/** Een community opent als eigen app: kanalen en feed, de leden, en meer (instellingen en verlaten). */
export function CommunityScherm({ c, openKanaal, vernieuw, terug, bijgewerkt }: { c: Community; openKanaal: (id: number) => void;
  vernieuw: () => Promise<void>; terug: () => void; bijgewerkt?: (g: Gegevens) => void }) {
  const [startCursus] = useState(() => cursusLinkPakken(c.id));
  const [deel, setDeel] = useState<CommunityDeel>(startCursus !== null ? "cursussen" : "kanalen");
  const [opnieuw, setOpnieuw] = useState(0);
  const beheer = c.rol === "eigenaar" || c.rol === "beheerder";
  const keuze = useMemo(() => ({ bron: "alles" as const, verborgen: [], _: opnieuw }), [opnieuw]);
  const weg = async () => { await vernieuw().catch(() => {}); terug(); };
  const items: MenuItem<CommunityDeel>[] = [["kanalen", "Kanalen", Ballon, c.kanalen.reduce((m, k) => m + k.ongelezen, 0)],
    ["agenda", "Agenda", Kalender], ["cursussen", "Cursussen", Boek], ["leden", "Leden", Mensen], ["meer", "Meer", Meer]];
  return (
    <div className="flex min-h-full flex-col">
      <AppKop terug={terug} terugNaam="Chat" titel={deel === "kanalen" ? c.naam : deel === "cursussen" ? "Cursussen en trainingen" : items.find(([k]) => k === deel)![1]} />
      {deel === "kanalen" && <>
        <div className="flex items-center gap-3 px-6 pb-4">
          <Rondje naam={c.naam} id={-1000 - c.id} />
          <div className="flex min-w-0 flex-col">
            {c.omschrijving && <p className="text-[15px] text-rustig">{c.omschrijving}</p>}
            <p className="text-sm text-zacht">{c.leden} {c.leden === 1 ? "lid" : "leden"}{c.openbaar ? " · openbaar" : ""}</p>
          </div>
          <span className="ml-auto shrink-0"><ModeratieMenu doelId={`community-${c.id}`} soort="bericht" /></span>
        </div>
        {(c.herinnering || c.eindigt) && (
          <p className="mx-6 mb-3 rounded-2xl bg-vlak px-4 py-2 text-[13px] text-rustig">
            {c.herinnering ? `${opruimTekst(c)}. Alles is terug te lezen.` : opruimTekst(c)}
          </p>
        )}
        <ul className="flex flex-col px-3">
          {c.kanalen.map((k) => (
            <li key={k.id}>
              <button onClick={() => openKanaal(k.id)} className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left hover:bg-vlak">
                <span className="flex size-10 items-center justify-center rounded-xl bg-vlak text-lg text-rustig">#</span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className={`truncate ${k.ongelezen ? "font-semibold" : "font-medium"}`}>{k.naam}</span>
                  <span className="text-[13px] text-rustig">{k.alleen_beheer ? "Alleen beheerders schrijven" : tijdje(k.laatst) || "Iedereen schrijft"}</span>
                </span>
                {k.ongelezen > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-semibold text-white">{k.ongelezen}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
        <h2 className="px-6 pt-5 pb-2 text-sm font-medium text-rustig">Feed</h2>
        <div className="flex flex-col gap-4 pb-8">
          {!c.herinnering && <Schrijven mijn={[c]} vast={c.id} geplaatst={() => setOpnieuw((n) => n + 1)} />}
          <Berichten keuze={keuze} community={c.id} leeg="Nog geen berichten. Schrijf als eerste iets." />
        </div>
      </>}
      {deel === "agenda" && <ClubAgenda c={c} bijgewerkt={bijgewerkt} />}
      {deel === "cursussen" && <Cursussen community={c.id} start={startCursus} />}
      {deel === "leden" && <Leden c={c} />}
      {deel === "meer" && <>
        {beheer ? <CommunityBeheer c={c} vernieuw={vernieuw} opgeheven={weg} />
          : <p className="px-6 pb-4 text-[15px] text-rustig">Alleen de beheerders passen de naam, kanalen en regels aan.</p>}
        {c.rol !== "eigenaar" && <Verlaten c={c} weg={weg} />}
      </>}
      <AppMenu naam="Community" items={items} actief={deel} kies={setDeel} />
    </div>
  );
}

function Leden({ c }: { c: Community }) {
  const [info, setInfo] = useState<{ code?: string | null; code_aan: boolean; deelnemers: Deelnemer[] } | null>(null);
  const [wie, setWie] = useState("");
  const [melding, setMelding] = useState("");
  const [fout, setFout] = useState("");
  const laden = useCallback(() => community(c.id).then(setInfo).catch((e) => setFout(foutVan(e))), [c.id]);
  useEffect(() => { laden(); }, [laden]);

  async function nodig(e: FormEvent) {
    e.preventDefault();
    setFout("");
    setMelding("");
    try {
      const r = await communityUitnodigen(c.id, wie);
      setMelding(r.status === "lid" ? "Doet nu mee." : "Uitnodiging verstuurd.");
      setWie("");
      laden();
    } catch (er) {
      setFout(foutVan(er));
    }
  }

  return (
    <div className="flex flex-col gap-4 px-6 pb-8">
      <form onSubmit={nodig} className="flex gap-2">
        <input value={wie} onChange={(e) => setWie(e.target.value)} placeholder="Gebruikersnaam" autoCapitalize="none"
          autoCorrect="off" aria-label="Gebruikersnaam om uit te nodigen" className={`${veld} flex-1`} />
        <button disabled={!wie.trim()} className="h-12 rounded-2xl bg-accent px-4 font-medium text-white disabled:opacity-30">Nodig uit</button>
      </form>
      {melding && <p className="text-sm text-rustig">{melding}</p>}
      {fout && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{fout}</p>}
      {info?.code && info.code_aan && (
        <p className="rounded-2xl bg-vlak px-4 py-3 text-sm text-rustig">
          Code om mee te doen: <span className="select-all font-mono font-semibold tracking-wider text-inkt">{info.code}</span>
        </p>
      )}
      {info === null && !fout && <p className="bezig-tekst py-4 text-[15px] text-rustig">Laden</p>}
      <ul className="-mx-3 flex flex-col">
        {(info?.deelnemers ?? []).map((d) => (
          <li key={d.id} className="flex items-center gap-3 rounded-2xl px-3 py-2">
            <Rondje naam={d.naam} id={d.id} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-medium">{d.naam}</span>
              <span className="text-[13px] text-rustig">@{d.gebruikersnaam}{d.status === "uitgenodigd" ? " · uitgenodigd" : ""}</span>
            </span>
            {d.rol !== "lid" && <span className="text-[13px] text-rustig">{d.rol === "eigenaar" ? "Eigenaar" : "Beheerder"}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Verlaten({ c, weg }: { c: Community; weg: () => void }) {
  const [zeker, setZeker] = useState(false);
  const [fout, setFout] = useState("");
  async function verlaten() {
    try {
      await communityAntwoorden(c.id, "verlaten");
      weg();
    } catch (er) {
      setFout(foutVan(er));
    }
  }
  return (
    <div className="flex flex-col gap-2 px-6 pb-10">
      {fout && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{fout}</p>}
      {zeker ? (
        <div className="flex gap-2">
          <button onClick={() => setZeker(false)} className="h-12 flex-1 rounded-2xl bg-vlak font-medium">Toch niet</button>
          <button onClick={verlaten} className="h-12 flex-1 rounded-2xl bg-red-600 font-medium text-white">Verlaten</button>
        </div>
      ) : (
        <button onClick={() => setZeker(true)} className="h-12 rounded-2xl bg-vlak text-red-600 dark:text-red-400">Community verlaten</button>
      )}
    </div>
  );
}

import { Fragment, useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Ballon, Bewerk, Dubbelvink, Tas, Mensen, Persoon, Pijl, Plus, Slot, Tandwiel, Telefoon, Terug, Video, Vinkje, Zoek } from "../iconen";
import { VERDWIJNEN, verdwijnenInstellen, antwoorden, belDuur, berichten, community, communityAntwoorden, communityDeelnemen,
  communityMaken, communityUitnodigen, contacten, gesprekNaam, kortTekst, nieuwGesprek, overzicht, starten, versturen,
  voorbeeld, type Community, type Contact, type Deelnemer, type Gesprek, type Regel } from "../lib/chat";
import { bellen, kan as kanBellen, luisteren, oproepen, type Oproep } from "../lib/bellen";
import { useBellen } from "./Bellen";
import { Rondje } from "../rondje";
import { StoryRij } from "./Stories";
import { Bladen, Raster, type Blad } from "./Winkelen";
import { rpc } from "../api";
import { zoeken, type Product } from "../lib/winkelen";
import { dagTitel, datumTekst, tijdje } from "../lib/tijd";
import type { Staat } from "../App";

type Deel = "chats" | "communitys" | "winkel" | "oproepen" | "jij";
const DELEN: [Deel, string, typeof Ballon][] = [["chats", "Chats", Ballon], ["communitys", "Community's", Mensen],
  ["winkel", "Winkel", Tas], ["oproepen", "Oproepen", Telefoon], ["jij", "Jij", Persoon]];

function bewaardDeel(): Deel {
  try {
    const d = localStorage.getItem("assistent.chatdeel");
    if (DELEN.some(([k]) => k === d)) return d as Deel;
  } catch { /* geen opslag */ }
  return "chats";
}

type Props = { staat: Staat; naarInstellingen: () => void; bestel: (p: Product) => void };

export default function Chat({ staat, naarInstellingen, bestel }: Props) {
  const [ik, setIk] = useState<number | null>(null);
  const [lijst, setLijst] = useState<Gesprek[]>([]);
  const [groepen, setGroepen] = useState<Community[]>([]);
  const [voorbeelden, setVoorbeelden] = useState<Record<number, string>>({});
  const [open, setOpen] = useState<number | null>(null);
  const [openCommunity, setOpenCommunity] = useState<number | null>(null);
  const [nieuw, setNieuw] = useState(false);
  const [fout, setFout] = useState("");
  const [deel, setDeelRuw] = useState<Deel>(bewaardDeel);

  function setDeel(d: Deel) {
    setDeelRuw(d);
    try { localStorage.setItem("assistent.chatdeel", d); } catch { /* geen opslag */ }
  }

  const laden = useCallback(async () => {
    const o = await overzicht();
    setLijst(o.gesprekken);
    setGroepen(o.communities);
    for (const x of o.gesprekken.slice(0, 30))
      voorbeeld(x).then((t) => setVoorbeelden((v) => (v[x.id] === t ? v : { ...v, [x.id]: t }))).catch(() => {});
  }, []);

  useEffect(() => {
    starten().then((id) => {
      setIk(id);
      luisteren(id);
      return laden();
    }).catch((e) => setFout(e instanceof Error ? e.message : "De chat kon niet starten."));
  }, [laden]);

  useEffect(() => {
    if (ik === null || open !== null) return;
    const t = setInterval(() => document.visibilityState === "visible" && laden().catch(() => {}), 4000);
    return () => clearInterval(t);
  }, [ik, open, laden]);

  if (open !== null && ik !== null) {
    const g = lijst.find((x) => x.id === open);
    return <Gesprekscherm id={open} ik={ik} begin={g} terug={() => { setOpen(null); laden().catch(() => {}); }} />;
  }
  if (openCommunity !== null && ik !== null) {
    const c = groepen.find((x) => x.id === openCommunity);
    if (c) return <CommunityScherm c={c} openKanaal={setOpen} vernieuw={laden}
      terug={() => { setOpenCommunity(null); laden().catch(() => {}); }} />;
  }

  const ongelezenChats = lijst.reduce((n, g) => n + (g.ongelezen ? 1 : 0), 0);
  const ongelezenGroepen = groepen.reduce((n, c) => n + (c.status === "uitgenodigd" ? 1
    : c.kanalen.reduce((m, k) => m + k.ongelezen, 0) > 0 ? 1 : 0), 0);
  const actie = deel === "chats" && !nieuw ? { label: "Nieuw gesprek", icoon: <Bewerk className="size-5" />, doe: () => setNieuw(true) }
    : null;

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-10 bg-white/90 pt-14 backdrop-blur dark:bg-[#0b0b0e]/90">
        <div className="flex items-center justify-between px-6 pb-3">
          <h1 className="text-[32px] font-bold tracking-tight">{DELEN.find(([k]) => k === deel)?.[1]}</h1>
          {actie && (
            <button onClick={actie.doe} aria-label={actie.label}
              className="flex size-10 items-center justify-center rounded-full bg-vlak">{actie.icoon}</button>
          )}
        </div>
        <nav aria-label="Chat" className="mx-4 mb-2 grid grid-cols-5 rounded-2xl bg-vlak p-1">
          {DELEN.map(([k, naam, Icoon]) => {
            const telt = k === "chats" ? ongelezenChats : k === "communitys" ? ongelezenGroepen : 0;
            return (
              <button key={k} onClick={() => setDeel(k)} aria-pressed={deel === k} aria-label={naam}
                className={`relative flex h-14 flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] ${deel === k
                  ? "bg-white font-semibold text-inkt shadow-sm dark:bg-[#2a2a30]" : "text-rustig"}`}>
                <Icoon className="size-5" />
                {naam}
                {telt > 0 && <span className="absolute top-1 right-[calc(50%-20px)] flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold text-white">{telt}</span>}
              </button>
            );
          })}
        </nav>
      </header>
      {fout && <p className="px-6 text-rustig">{fout}</p>}
      {deel === "chats" && nieuw && (
        <NieuwVeld sluit={() => setNieuw(false)} gestart={(id) => { setNieuw(false); laden().then(() => setOpen(id)); }} />
      )}
      {deel === "chats" && ik !== null && (
        <Chats ik={ik} lijst={lijst} voorbeelden={voorbeelden} open={setOpen} nieuw={() => setNieuw(true)} fout={fout} zoekt={nieuw} />
      )}
      {deel === "communitys" && ik !== null && (
        <Communitys lijst={groepen} open={setOpenCommunity} vernieuw={laden} />
      )}
      {deel === "winkel" && <WinkelDeel bestel={bestel} />}
      {deel === "oproepen" && ik !== null && <Oproepen ik={ik} lijst={lijst} />}
      {deel === "jij" && <Jij staat={staat} naarInstellingen={naarInstellingen} />}
    </div>
  );
}

function Leeg({ icoon, titel, uitleg, children }: { icoon: ReactNode; titel: string; uitleg: string; children?: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-10 pb-16 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-vlak text-rustig">{icoon}</span>
      <p className="font-medium">{titel}</p>
      <p className="text-sm text-rustig">{uitleg}</p>
      {children}
    </div>
  );
}

function Chats({ ik, lijst, voorbeelden, open, nieuw, fout, zoekt }: { ik: number; lijst: Gesprek[];
  voorbeelden: Record<number, string>; open: (id: number) => void; nieuw: () => void; fout: string; zoekt: boolean }) {
  return (
    <>
      <StoryRij ik={ik} />
      {lijst.length === 0 && !fout && !zoekt && (
        <Leeg icoon={<Slot />} titel="Nog geen gesprekken" uitleg="Alles wat je hier schrijft, kan alleen jij en wie je spreekt lezen.">
          <button onClick={nieuw} className="mt-2 h-11 rounded-full bg-accent px-5 font-medium text-white">Begin een gesprek</button>
        </Leeg>
      )}
      <ul className="flex flex-col px-3">
        {lijst.map((g) => {
          const naam = gesprekNaam(g, ik);
          return (
            <li key={g.id}>
              <button onClick={() => open(g.id)} className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left hover:bg-vlak">
                <Rondje naam={naam} id={g.soort === "groep" ? -g.id : g.leden.find((l) => l.id !== ik)?.id ?? g.id} groot />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className={`truncate ${g.ongelezen ? "font-semibold" : "font-medium"}`}>{naam}</span>
                    <span className={`shrink-0 text-xs ${g.ongelezen ? "font-semibold text-accent" : "text-zacht"}`}>{tijdje(g.laatst)}</span>
                  </span>
                  <span className="flex items-center justify-between gap-2">
                    <span className={`truncate text-sm ${g.ongelezen ? "text-inkt" : "text-rustig"}`}>
                      {g.status === "verzoek" ? "Wil met je chatten" : voorbeelden[g.id] ?? ""}
                    </span>
                    {g.ongelezen > 0 && (
                      <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-semibold text-white">
                        {g.ongelezen}
                      </span>
                    )}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

const foutVan = (e: unknown) => (e instanceof Error ? e.message : "Dat lukte niet.");

function Communitys({ lijst, open, vernieuw }: { lijst: Community[]; open: (id: number) => void; vernieuw: () => Promise<void> }) {
  const [blad, setBlad] = useState(false);
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
          {lijst.map((c) => {
            const nieuw = c.kanalen.reduce((n, k) => n + k.ongelezen, 0);
            return (
              <li key={c.id}>
                {c.status === "uitgenodigd" ? (
                  <div className="flex items-center gap-3 rounded-2xl px-3 py-2.5">
                    <Rondje naam={c.naam} id={-1000 - c.id} groot />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-medium">{c.naam}</span>
                      <span className="truncate text-sm text-rustig">Uitnodiging{c.door ? ` van ${c.door}` : ""}</span>
                    </span>
                    <button onClick={() => antwoord(c.id, "nee")} className="h-9 rounded-full bg-vlak px-3 text-sm">Nee</button>
                    <button onClick={() => antwoord(c.id, "ja")} className="h-9 rounded-full bg-accent px-3 text-sm font-medium text-white">Doe mee</button>
                  </div>
                ) : (
                  <button onClick={() => open(c.id)} className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left hover:bg-vlak">
                    <Rondje naam={c.naam} id={-1000 - c.id} groot />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className={`truncate ${nieuw ? "font-semibold" : "font-medium"}`}>{c.naam}</span>
                      <span className="truncate text-sm text-rustig">
                        {c.leden} {c.leden === 1 ? "lid" : "leden"} · {c.kanalen.length} {c.kanalen.length === 1 ? "kanaal" : "kanalen"}
                      </span>
                    </span>
                    {nieuw > 0 && (
                      <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-semibold text-white">{nieuw}</span>
                    )}
                  </button>
                )}
              </li>
            );
          })}
          <li>
            <button onClick={() => setBlad(true)} className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-accent hover:bg-vlak">
              <span className="flex size-12 items-center justify-center rounded-full bg-vlak"><Plus className="size-5" /></span>
              <span className="font-medium">Nieuwe community of code</span>
            </button>
          </li>
        </ul>
      )}
      {blad && <CommunityBlad sluit={() => setBlad(false)} klaar={async (id) => { setBlad(false); await vernieuw(); open(id); }} />}
    </>
  );
}

function Onderblad({ titel, sluit, children }: { titel: string; sluit: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/30" onClick={sluit}>
      <div role="dialog" aria-label={titel} onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85%] w-full max-w-xl flex-col gap-4 overflow-y-auto rounded-t-[28px] bg-white px-6 pt-3 pb-[max(env(safe-area-inset-bottom),24px)] dark:bg-[#16161a]">
        <span className="mx-auto h-1 w-10 shrink-0 rounded-full bg-lijn" />
        <h2 className="text-xl font-semibold">{titel}</h2>
        {children}
      </div>
    </div>
  );
}

const veld = "h-12 w-full rounded-2xl bg-vlak px-4 outline-none placeholder:text-zacht";

function CommunityBlad({ sluit, klaar }: { sluit: () => void; klaar: (id: number) => void }) {
  const [soort, setSoort] = useState<"maken" | "code">("maken");
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
      klaar((soort === "maken" ? await communityMaken(naam.trim(), over.trim()) : await communityDeelnemen(code)).id);
    } catch (er) {
      setFout(foutVan(er));
    } finally {
      setBezig(false);
    }
  }
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
            <input autoFocus value={naam} onChange={(e) => setNaam(e.target.value)} maxLength={60} placeholder="Naam, bijvoorbeeld Buurt Sanne en Bram"
              aria-label="Naam" className={veld} />
            <input value={over} onChange={(e) => setOver(e.target.value)} maxLength={300} placeholder="Waar gaat het over? (mag leeg)"
              aria-label="Omschrijving" className={veld} />
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

function CommunityScherm({ c, openKanaal, vernieuw, terug }: { c: Community; openKanaal: (id: number) => void;
  vernieuw: () => Promise<void>; terug: () => void }) {
  const [leden, setLeden] = useState(false);
  return (
    <div className="flex min-h-full flex-col">
      <header className="flex items-center gap-2 px-3 pt-12 pb-2">
        <button onClick={terug} aria-label="Terug" className="flex size-10 items-center justify-center rounded-full text-rustig hover:bg-vlak">
          <Terug />
        </button>
        <span className="flex-1" />
        <button onClick={() => setLeden(true)} className="h-9 rounded-full bg-vlak px-4 text-sm font-medium">Leden</button>
      </header>
      <div className="flex flex-col items-center gap-2 px-6 pb-5 text-center">
        <Rondje naam={c.naam} id={-1000 - c.id} groot />
        <h1 className="text-2xl font-bold tracking-tight">{c.naam}</h1>
        {c.omschrijving && <p className="text-[15px] text-rustig">{c.omschrijving}</p>}
        <p className="text-sm text-zacht">{c.leden} {c.leden === 1 ? "lid" : "leden"}</p>
      </div>
      <h2 className="px-6 pb-1 text-sm font-medium text-rustig">Kanalen</h2>
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
      {leden && <LedenBlad c={c} sluit={() => setLeden(false)} weg={async () => { setLeden(false); await vernieuw(); terug(); }} />}
    </div>
  );
}

function LedenBlad({ c, sluit, weg }: { c: Community; sluit: () => void; weg: () => void }) {
  const [info, setInfo] = useState<{ code?: string | null; code_aan: boolean; deelnemers: Deelnemer[] } | null>(null);
  const [wie, setWie] = useState("");
  const [melding, setMelding] = useState("");
  const [fout, setFout] = useState("");
  const [zeker, setZeker] = useState(false);
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
  async function verlaten() {
    try {
      await communityAntwoorden(c.id, "verlaten");
      weg();
    } catch (er) {
      setFout(foutVan(er));
    }
  }

  return (
    <Onderblad titel="Leden" sluit={sluit}>
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
      {c.rol !== "eigenaar" && (zeker ? (
        <div className="flex gap-2">
          <button onClick={() => setZeker(false)} className="h-12 flex-1 rounded-2xl bg-vlak font-medium">Toch niet</button>
          <button onClick={verlaten} className="h-12 flex-1 rounded-2xl bg-red-600 font-medium text-white">Verlaten</button>
        </div>
      ) : (
        <button onClick={() => setZeker(true)} className="h-12 rounded-2xl text-red-600 dark:text-red-400">Community verlaten</button>
      ))}
    </Onderblad>
  );
}

type WinkelKaart = { adres: string; naam: string; omschrijving?: string; producten?: number };

function WinkelDeel({ bestel }: { bestel: (p: Product) => void }) {
  const [zoek, setZoek] = useState("");
  const [producten, setProducten] = useState<Product[] | null>(null);
  const [winkels, setWinkels] = useState<WinkelKaart[]>([]);
  const [stapel, setStapel] = useState<Blad[]>([]);
  const [fout, setFout] = useState("");

  const halen = useCallback((term: string) => {
    setFout("");
    zoeken(term).then(setProducten).catch((e) => { setProducten([]); setFout(foutVan(e)); });
    rpc<WinkelKaart[]>("winkels_zoeken", { p_zoekterm: term }).then((w) => setWinkels(Array.isArray(w) ? w : [])).catch(() => {});
  }, []);
  useEffect(() => { halen(""); }, [halen]);

  return (
    <div className="flex flex-col gap-5 px-6 pb-8">
      <form onSubmit={(e) => { e.preventDefault(); halen(zoek); }} className="flex items-center gap-2 rounded-2xl bg-vlak px-4">
        <Zoek className="size-5 shrink-0 text-zacht" />
        <input value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder="Zoek in winkels en marktplaats" aria-label="Zoeken"
          enterKeyHint="search" className="h-12 flex-1 bg-transparent outline-none placeholder:text-zacht" />
      </form>
      {winkels.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-rustig">Winkels</h2>
          <ul className="-mx-6 flex gap-2.5 overflow-x-auto px-6 [scrollbar-width:none]">
            {winkels.slice(0, 20).map((w) => (
              <li key={w.adres} className="shrink-0">
                <button onClick={() => setStapel([{ soort: "winkel", adres: w.adres }])}
                  className="flex w-36 flex-col items-start gap-2 rounded-2xl bg-vlak p-3 text-left">
                  <Rondje naam={w.naam} id={w.naam.length * 7 + w.adres.length} />
                  <span className="w-full truncate text-[15px] font-medium">{w.naam}</span>
                  <span className="text-[13px] text-rustig">{w.producten ?? 0} producten</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-rustig">{zoek.trim() ? "Gevonden" : "Te koop"}</h2>
        {fout && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{fout}</p>}
        {producten === null ? <p className="bezig-tekst py-6 text-[15px] text-rustig">Laden</p>
          : <Raster producten={producten} open={(p) => setStapel([{ soort: "product", p }])} />}
      </section>
      <p className="text-[13px] text-zacht">Bestellen gaat via de assistent. Er gaat pas iets weg als jij zelf op Bestellen tikt.</p>
      <Bladen stapel={stapel} zet={setStapel} bestel={(p) => { setStapel([]); bestel(p); }} />
    </div>
  );
}

const OPROEP_STATUS: Record<Oproep["status"], string> = { klaar: "", gemist: "Gemist", geweigerd: "Geweigerd",
  geen: "Niet opgenomen", mislukt: "Mislukt" };

function Oproepen({ ik, lijst }: { ik: number; lijst: Gesprek[] }) {
  useBellen();
  const log = oproepen();
  const mensen = lijst.filter((g) => g.soort === "twee" && g.status === "lid");
  const bel = (g: Gesprek, video: boolean) =>
    bellen(g.id, gesprekNaam(g, ik), g.leden.find((l) => l.id !== ik)?.id ?? 0, video);
  if (!kanBellen()) return <Leeg icoon={<Telefoon />} titel="Bellen kan hier niet" uitleg="Deze browser ondersteunt geen bellen. Probeer Safari of Chrome." />;
  return (
    <div className="flex flex-col gap-5 pb-8">
      {log.length > 0 && (
        <section>
          <h2 className="px-6 pb-1 text-sm font-medium text-rustig">Recent</h2>
          <ul className="flex flex-col px-3">
            {log.slice(0, 30).map((o) => {
              const g = mensen.find((x) => x.id === o.gesprek);
              const rood = o.status === "gemist";
              return (
                <li key={o.id} className="flex items-center gap-3 rounded-2xl px-3 py-2">
                  <Rondje naam={o.naam} id={o.ander} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className={`truncate font-medium ${rood ? "text-red-600 dark:text-red-400" : ""}`}>{o.naam}</span>
                    <span className="truncate text-[13px] text-rustig">
                      {[o.uit ? "Uitgaand" : "Inkomend", o.video ? "video" : "", OPROEP_STATUS[o.status] || (o.duur ? belDuur(o.duur) : ""),
                        tijdje(o.tijd)].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  {g && (
                    <button onClick={() => bel(g, o.video)} aria-label={`${o.naam} bellen`}
                      className="flex size-10 items-center justify-center rounded-full text-accent hover:bg-vlak">
                      {o.video ? <Video className="size-5" /> : <Telefoon className="size-5" />}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
      <section>
        <h2 className="px-6 pb-1 text-sm font-medium text-rustig">Bellen met</h2>
        {mensen.length === 0 ? (
          <p className="px-6 text-sm text-rustig">Begin eerst een gesprek onder Chats. Daarna kun je die persoon hier bellen.</p>
        ) : (
          <ul className="flex flex-col px-3">
            {mensen.map((g) => {
              const naam = gesprekNaam(g, ik);
              return (
                <li key={g.id} className="flex items-center gap-3 rounded-2xl px-3 py-2">
                  <Rondje naam={naam} id={g.leden.find((l) => l.id !== ik)?.id ?? g.id} />
                  <span className="min-w-0 flex-1 truncate font-medium">{naam}</span>
                  <button onClick={() => bel(g, false)} aria-label={`${naam} bellen`}
                    className="flex size-10 items-center justify-center rounded-full text-accent hover:bg-vlak"><Telefoon className="size-5" /></button>
                  <button onClick={() => bel(g, true)} aria-label={`${naam} videobellen`}
                    className="flex size-10 items-center justify-center rounded-full text-accent hover:bg-vlak"><Video className="size-5" /></button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <p className="flex items-center gap-1.5 px-6 text-[13px] text-zacht"><Slot className="size-3.5" /> Gesprekken gaan versleuteld rechtstreeks tussen jullie toestellen.</p>
    </div>
  );
}

function Jij({ staat, naarInstellingen }: { staat: Staat; naarInstellingen: () => void }) {
  const g = staat.gebruiker;
  const naam = g.weergavenaam || g.naam || "Jij";
  const [gekopieerd, setGekopieerd] = useState(false);
  return (
    <div className="flex flex-col gap-5 px-6 pb-8">
      <div className="flex flex-col items-center gap-2 pt-2 text-center">
        <span className="flex size-20 items-center justify-center overflow-hidden rounded-full bg-vlak text-3xl font-semibold">
          {g.foto ? <img src={g.foto} alt="" className="size-full object-cover" /> : <Persoon className="size-9 text-rustig" />}
        </span>
        <p className="text-xl font-semibold">{naam}</p>
        {g.naam && (
          <button onClick={() => navigator.clipboard?.writeText(`@${g.naam}`).then(() => setGekopieerd(true), () => {})}
            className="text-sm text-rustig">
            @{g.naam} {gekopieerd ? "· gekopieerd" : "· tik om te kopiëren"}
          </button>
        )}
        <p className="max-w-xs text-[13px] text-zacht">Met je gebruikersnaam kunnen anderen een gesprek met je beginnen.</p>
      </div>
      <ul className="flex flex-col divide-y divide-lijn overflow-hidden rounded-[20px] bg-vlak">
        <li>
          <button onClick={naarInstellingen} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
            <Tandwiel className="size-5 text-rustig" />
            <span className="flex flex-1 flex-col">
              <span className="font-medium">Instellingen</span>
              <span className="text-[13px] text-rustig">Profiel, assistent, privacy en meer</span>
            </span>
            <Terug className="size-4 rotate-180 text-zacht" />
          </button>
        </li>
      </ul>
      <p className="flex items-center justify-center gap-1.5 text-[13px] text-zacht"><Slot className="size-3.5" /> Je chats en oproepen zijn end-to-end versleuteld.</p>
    </div>
  );
}

/** Een nieuw gesprek: alleen een naamveld bovenaan de lijst. Geen venster, dus het scherm blijft stil staan. */
function NieuwVeld({ sluit, gestart }: { sluit: () => void; gestart: (id: number) => void }) {
  const [naam, setNaam] = useState("");
  const [lijst, setLijst] = useState<Contact[]>([]);
  const [fout, setFout] = useState("");
  const veldRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    veldRef.current?.focus({ preventScroll: true });
    contacten().then(setLijst).catch(() => {});
  }, []);

  async function start(met: string) {
    setFout("");
    try {
      gestart((await nieuwGesprek(met)).id);
    } catch (e) {
      setFout(e instanceof Error ? e.message : "Dat lukte niet.");
    }
  }

  const term = naam.trim().replace(/^@/, "").toLowerCase();
  const passend = term ? lijst.filter((c) => c.chat && (c.naam.toLowerCase().includes(term)
    || c.gebruikersnaam.toLowerCase().includes(term))).slice(0, 4) : [];
  return (
    <div className="px-6 pb-3">
      <form onSubmit={(e) => { e.preventDefault(); if (naam.trim()) start(naam); }} className="flex items-center gap-2">
        <input ref={veldRef} value={naam} onChange={(e) => setNaam(e.target.value)} placeholder="Naam van wie je wilt spreken"
          autoCapitalize="none" autoCorrect="off" enterKeyHint="go" aria-label="Gebruikersnaam"
          onKeyDown={(e) => e.key === "Escape" && sluit()}
          className="h-12 min-w-0 flex-1 rounded-2xl bg-vlak px-4 outline-none placeholder:text-zacht" />
        <button type="button" onClick={sluit} className="h-12 shrink-0 px-2 text-rustig">Annuleer</button>
      </form>
      {fout && <p role="alert" className="pt-2 text-sm text-red-600 dark:text-red-400">{fout}</p>}
      {passend.length > 0 && (
        <ul className="-mx-3 flex flex-col pt-1">
          {passend.map((c) => (
            <li key={c.id}>
              <button onClick={() => start(c.gebruikersnaam)}
                className="flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left hover:bg-vlak">
                <Rondje naam={c.naam} id={c.id} />
                <span className="font-medium">{c.naam}</span>
                <span className="text-[13px] text-rustig">@{c.gebruikersnaam}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Gesprekscherm({ id, ik, begin, terug }: { id: number; ik: number; begin?: Gesprek; terug: () => void }) {
  const [g, setG] = useState<Gesprek | undefined>(begin);
  const [regels, setRegels] = useState<Regel[]>([]);
  const [invoer, setInvoer] = useState("");
  const [fout, setFout] = useState("");
  const [timer, setTimer] = useState(false);
  const tot = useRef(0);
  const onder = useRef<HTMLDivElement>(null);
  const bezig = useRef(false);

  const bijwerken = useCallback(async () => {
    if (bezig.current) return;
    bezig.current = true;
    try {
      const r = await berichten(id, tot.current);
      if (r.gesprek) setG(r.gesprek);
      if (r.hoogste) tot.current = r.hoogste;
      if (r.regels.length) setRegels((oud) => {
        const al = new Set(oud.map((x) => x.id));
        return [...oud, ...r.regels.filter((x) => !al.has(x.id))];
      });
    } finally {
      bezig.current = false;
    }
  }, [id]);

  useEffect(() => {
    bijwerken().catch((e) => setFout(e instanceof Error ? e.message : "Laden lukte niet."));
    const t = setInterval(() => document.visibilityState === "visible" && bijwerken().catch(() => {}), 2500);
    return () => clearInterval(t);
  }, [bijwerken]);
  useEffect(() => { onder.current?.scrollIntoView({ block: "end" }); }, [regels.length]);

  async function stuur(e: FormEvent) {
    e.preventDefault();
    const tekst = invoer.trim();
    if (!tekst) return;
    setInvoer("");
    setFout("");
    try {
      await versturen(id, { t: "tekst", tekst });
      await bijwerken();
    } catch (er) {
      setInvoer(tekst);
      setFout(er instanceof Error ? er.message : "Versturen lukte niet.");
    }
  }

  async function beslis(a: "ja" | "nee") {
    try {
      await antwoorden(id, a);
      if (a === "nee") terug();
      else await bijwerken();
    } catch (er) {
      setFout(er instanceof Error ? er.message : "Dat lukte niet.");
    }
  }

  const naam = g ? gesprekNaam(g, ik) : "";
  const anderen = (g?.leden ?? []).filter((l) => l.id !== ik);
  const gelezen = anderen.length ? Math.min(...anderen.map((l) => l.gelezen_tot)) : 0;
  const ontvangen = anderen.length ? Math.min(...anderen.map((l) => l.ontvangen_tot)) : 0;
  const groep = g?.soort === "groep";
  const kanaal = !!g?.community;
  const titel = kanaal ? `# ${naam}` : naam;
  const magSchrijven = !g?.alleen_beheer || !!g?.beheerder;
  const { bel } = useBellen();

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-lijn bg-white/85 px-3 pt-12 pb-2.5 backdrop-blur dark:bg-[#0b0b0e]/85">
        <button onClick={terug} aria-label="Terug" className="flex size-10 items-center justify-center rounded-full text-rustig hover:bg-vlak">
          <Terug />
        </button>
        {g && <Rondje naam={naam} id={groep ? -id : anderen[0]?.id ?? id} />}
        <button onClick={() => setTimer((t) => !t)} aria-expanded={timer} className="flex min-w-0 flex-1 flex-col text-left">
          <span className="truncate font-semibold">{titel}</span>
          <span className="flex items-center gap-1 text-xs text-zacht">
            <Slot className="size-3" /> {kanaal && g?.community_naam ? `${g.community_naam} · versleuteld` : "Versleuteld"}
            {g?.verdwijnen ? ` · verdwijnt na ${VERDWIJNEN.find(([s]) => s === g.verdwijnen)?.[1] ?? "een tijd"}` : ""}
          </span>
        </button>
        {g && !groep && g.status === "lid" && kanBellen() && (
          <span className="flex shrink-0">
            <button onClick={() => bellen(id, naam, anderen[0]?.id ?? 0, false)} disabled={!!bel} aria-label="Bellen"
              className="flex size-10 items-center justify-center rounded-full text-accent hover:bg-vlak disabled:opacity-40"><Telefoon className="size-5" /></button>
            <button onClick={() => bellen(id, naam, anderen[0]?.id ?? 0, true)} disabled={!!bel} aria-label="Videobellen"
              className="flex size-10 items-center justify-center rounded-full text-accent hover:bg-vlak disabled:opacity-40"><Video className="size-5" /></button>
          </span>
        )}
      </header>
      {timer && g && (
        <div className="border-b border-lijn px-4 py-3">
          <p className="mb-2 text-sm text-rustig">Berichten verdwijnen na</p>
          <div className="flex flex-wrap gap-2">
            {VERDWIJNEN.map(([s, tekst]) => (
              <button key={s} aria-pressed={(g.verdwijnen ?? 0) === s}
                onClick={async () => {
                  try {
                    await verdwijnenInstellen(id, s);
                    await bijwerken();
                    setTimer(false);
                  } catch (er) {
                    setFout(er instanceof Error ? er.message : "Dat lukte niet.");
                  }
                }}
                className={`h-9 rounded-full px-4 text-sm ${(g.verdwijnen ?? 0) === s ? "bg-accent text-white" : "bg-vlak"}`}>
                {tekst}
              </button>
            ))}
          </div>
        </div>
      )}

      <main className="flex flex-1 flex-col gap-1 px-4 py-4" aria-live="polite">
        {regels.map((r, i) => {
          const mijn = r.afzender === ik;
          const vorige = regels[i - 1];
          const nieuweDag = !vorige || datumTekst(new Date(vorige.tijd)) !== datumTekst(new Date(r.tijd));
          const zelfde = !nieuweDag && vorige?.afzender === r.afzender;
          const lid = g?.leden.find((l) => l.id === r.afzender);
          const tekst = r.weg ? "Bericht verwijderd" : r.fout || !r.bericht ? "Dit bericht kun je op dit apparaat niet lezen"
            : r.bericht.t === "tekst" ? String(r.bericht.tekst ?? "") : kortTekst(r.bericht) || "Bericht";
          const bijzonder = r.weg || r.fout || !r.bericht || r.bericht.t !== "tekst";
          return (
            <Fragment key={r.id}>
              {nieuweDag && (
                <p className="my-3 text-center text-xs font-medium text-zacht">
                  {datumTekst(new Date(r.tijd)) === datumTekst(new Date()) ? "Vandaag" : dagTitel(new Date(r.tijd))}
                </p>
              )}
              <div className={`flex flex-col ${mijn ? "items-end" : "items-start"} ${zelfde ? "" : "mt-2"}`}>
                {groep && !mijn && !zelfde && <span className="mb-0.5 ml-3 text-xs font-medium text-rustig">{lid?.naam}</span>}
                <div className={`max-w-[80%] rounded-[20px] px-3.5 py-2 ${mijn ? "rounded-br-md bg-accent text-white" : "rounded-bl-md bg-vlak"}
                  ${bijzonder ? "italic opacity-80" : ""}`}>
                  <span className="whitespace-pre-wrap break-words">{tekst}</span>
                  <span className={`ml-2 inline-flex translate-y-0.5 items-center gap-0.5 text-[11px] ${mijn ? "text-white/70" : "text-zacht"}`}>
                    {new Date(r.tijd).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })}
                    {mijn && (r.id <= gelezen ? <Dubbelvink className="size-4 text-white" />
                      : r.id <= ontvangen ? <Dubbelvink className="size-4" /> : <Vinkje className="size-3.5" />)}
                  </span>
                </div>
              </div>
            </Fragment>
          );
        })}
        <div ref={onder} />
      </main>

      {g?.status === "verzoek" ? (
        <div className="sticky bottom-0 flex flex-col gap-3 bg-white px-6 pt-3 pb-4 text-center dark:bg-[#0b0b0e]">
          <p className="text-rustig">{naam} wil met je chatten.</p>
          <div className="flex gap-2">
            <button onClick={() => beslis("nee")} className="h-12 flex-1 rounded-2xl bg-vlak font-medium">Weigeren</button>
            <button onClick={() => beslis("ja")} className="h-12 flex-1 rounded-2xl bg-accent font-medium text-white">Accepteren</button>
          </div>
        </div>
      ) : !magSchrijven ? (
        <p className="sticky bottom-0 bg-white px-6 pt-3 pb-4 text-center text-sm text-rustig dark:bg-[#0b0b0e]">
          Alleen beheerders kunnen hier schrijven.
        </p>
      ) : (
        <form onSubmit={stuur} className="sticky bottom-0 bg-white px-4 pb-3 pt-2 dark:bg-[#0b0b0e]">
          {fout && <p role="alert" className="px-2 pb-2 text-sm text-red-600 dark:text-red-400">{fout}</p>}
          <label className="flex items-center gap-2 rounded-[26px] bg-vlak py-1.5 pr-1.5 pl-5">
            <span className="sr-only">Bericht</span>
            <input value={invoer} onChange={(e) => setInvoer(e.target.value)} placeholder="Bericht"
              className="h-10 flex-1 bg-transparent outline-none placeholder:text-zacht" />
            <button aria-label="Versturen" disabled={!invoer.trim()}
              className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-white disabled:opacity-30">
              <Pijl className="size-5" />
            </button>
          </label>
        </form>
      )}
    </div>
  );
}

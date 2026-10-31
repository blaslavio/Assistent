import BerichtTaak from "./BerichtTaak";
import { useSchermActief } from "./BewaarScherm";
import { KaartVouw } from "../iconen";
import { kaartOpenen, kaartGevraagd, gevraagdGesprek, gevraagdBericht, winkelAppGevraagd } from "../lib/naar";
import InstellingenKnop from "./InstellingenKnop";
import { BetaalverzoekMaken, ChatBetaalkaart } from "./ChatBetaling";
import ProjectWerkruimte from "./ProjectWerkruimte";
import { Fragment, Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Kalender, Meer, Projectmap, Bal, Ballon, Bewerk, Boek, Dubbelvink, Fiets, Gereedschap, Huis, Kind, Penseel, Raster as RasterIcoon, Scherm, Shirt, Truck, Winkelpand, Tas, Mensen, Persoon, Pijl, Plus, Slot, Tandwiel, Telefoon, Terug, Video, Vinkje, Zoek } from "../iconen";
import { JouwAanbod } from "./Delen";
import { Berichten, Feed, Schrijven } from "./Feed";
import { GastGesprekScherm, GastenLijst } from "./Gasten";
import { gesprekken as gastGesprekken, type GastGesprek } from "../lib/gasten";
import { feedInstelling } from "../lib/feed";
import Bestellingen from "./Bestellingen";
import { isGevraagd, lijst as bestellingenLijst, openGevraagd, wachtOpMij } from "../lib/bestellingen";
import { VERDWIJNEN, communityTijdelijk, isHerinnering, verdwijnenInstellen, antwoorden, berichten, community, communityAntwoorden, communityDeelnemen,
  chatBronLezen, communityMaken, communityUitnodigen, contacten, gesprekNaam, kortTekst, nieuwGesprek, overzicht, starten, versturen,
  voorbeeld, type Community, type Contact, type Deelnemer, type Gesprek, type Regel } from "../lib/chat";
import { bellen, kan as kanBellen, luisteren } from "../lib/bellen";
import { Oproepen } from "./Oproepen";
import { useBellen } from "./Bellen";
import { Rondje } from "../rondje";
import { StoryRij } from "./Stories";
import { Verkopen } from "./Verkopen";
import { MijnWinkel } from "./MijnWinkel";
import { Cursussen } from "./Cursussen";
import { cursusLinkOpenen, cursusLinkPakken, cursusTerug, isCursusLinkGevraagd, terugControleren } from "../lib/cursus";
import { mascotteZeg } from "../mascotte";
import { isWinkelGevraagd, winkelGevraagd } from "../lib/mijnwinkel";
import { useEigenFoto } from "./Profiel";
import { CommunityBeheer } from "./CommunityBeheer";
import { EindeKiezen, OpruimBlad, opruimTekst } from "./CommunityOpruimen";
import { Onderblad } from "./Onderblad";
import { AppKop, AppMenu, type MenuItem } from "./AppMenu";
import { DELEN, chatDelenVan, type Deel } from "./chatdelen";
import { ClubAgenda } from "./ClubAgenda";
import type { Gegevens } from "../api";
import { Bladen, Raster, type Blad } from "./Winkelen";
import { rpc } from "../api";
import { peilen } from "../lib/peilen";
import { zoeken, type Filter, type Product } from "../lib/winkelen";
import { dagTitel, datumTekst, tijdje } from "../lib/tijd";
import type { Staat } from "../App";

const WinkelKaart = lazy(() => import("./WinkelKaart").then((m) => ({ default: m.WinkelKaart })));

const Projecten = lazy(() => import("./Projecten"));

function bewaardDeel(): Deel {
  if (isGevraagd() || isWinkelGevraagd()) return "chats";
  if (isCursusLinkGevraagd()) return "communitys";
  try {
    const d = localStorage.getItem("assistent.chatdeel");
    if (d === "chats" || d === "communitys" || d === "oproepen") return d;
  } catch { /* geen opslag */ }
  return "chats";
}

type Props = { verlaat?: () => void; terugNaam?: string; staat: Staat; setStaat?: React.Dispatch<React.SetStateAction<Staat | null>>; naarInstellingen: () => void;
  bestel: (p: Product) => void; projectGeopend?:(id:number)=>void; ongelezenGewijzigd?: (aantal:number)=>void; werkGesprek?: { id: number; ronde: number; gebruiker: number } | null };

export default function Chat({ staat, setStaat, bestel, werkGesprek, ongelezenGewijzigd,verlaat,terugNaam,projectGeopend }: Props) {
  const schermActief=useSchermActief();
  const markeerGelezen=useCallback((id:number)=>setLijst(oud=>oud.some(g=>g.id===id&&g.ongelezen>0)?oud.map(g=>g.id===id?{...g,ongelezen:0}:g):oud),[]);
  const concepten=useRef(new Map<number,string>());
  const bewaarConcept=useCallback((id:number,tekst:string)=>{if(tekst)concepten.current.set(id,tekst);else concepten.current.delete(id);},[]);
  const [vanBuiten,setVanBuiten]=useState(isGevraagd()||isWinkelGevraagd());
  const [zoekGesprek,setZoekGesprek]=useState("");
  const [projectVan, setProjectVan] = useState<number | null>(null);
  const [ik, setIk] = useState<number | null>(null);
  const [belInst, setBelInst] = useState(false);
  const [lijst, setLijst] = useState<Gesprek[]>([]);
  const [groepen, setGroepen] = useState<Community[]>([]);
  const [voorbeelden, setVoorbeelden] = useState<Record<number, string>>({});
  const [bronBericht,setBronBericht]=useState(gevraagdBericht);
  const [open, setOpen] = useState<number | null>(gevraagdGesprek);
  const [openCommunity, setOpenCommunity] = useState<number | null>(null);
  const [gasten, setGasten] = useState<GastGesprek[]>([]);
  const [openGast, setOpenGast] = useState<number | null>(null);
  const [nieuw, setNieuw] = useState(false);
  const [fout, setFout] = useState("");
  const [deel, setDeelRuw] = useState<Deel>(bewaardDeel);
  // Winkel opent als eigen app; terug van betalen (?betaald=) meteen bij Bestellingen.
  const [winkel, setWinkel] = useState<{ deel: WinkelDeelNaam; melding?: string; adres?: string; ronde?: number } | null>(() => {
    const v = openGevraagd();
    if (v) return { deel: "bestellingen", melding: v.melding };
    const adres = winkelGevraagd();
    return adres ? { deel: "ontdekken", adres } : null;
  });

  function verlaatGesprek(){setOpen(null);setOpenGast(null);setOpenCommunity(null);setNieuw(false);}
  function setDeel(d: Deel) {
    if (d === "winkel") { setVanBuiten(false);setWinkel(oud=>({deel:"ontdekken",ronde:(oud?.ronde??0)+1})); return; }
    setDeelRuw(d);
    try { localStorage.setItem("assistent.chatdeel", d); } catch { /* geen opslag */ }
  }

  useEffect(() => {
    const dienst=(e:Event)=>{const d=(e as CustomEvent).detail;if(d?.gesprek===open&&d?.dienst==="betaling"){setOpen(null);setWinkel({deel:"bestellingen",melding:"Controleer de bestelling en bevestig zelf de gewenste betaalhandeling."});}};
    window.addEventListener("assistent-projectdienst",dienst);return()=>window.removeEventListener("assistent-projectdienst",dienst);
  },[open]);

  useEffect(() => { if (werkGesprek?.gebruiker === staat.gebruiker.id) {setBronBericht(null);setOpen(werkGesprek.id);} }, [werkGesprek, staat.gebruiker.id]);

  useEffect(() => { const openGevraagd = () => { const id = gevraagdGesprek(); if (id !== null){setBronBericht(gevraagdBericht());setOpen(id);} }; window.addEventListener("chat-open", openGevraagd); return () => window.removeEventListener("chat-open", openGevraagd); }, []);
  useEffect(() => { const open = () => { if (kaartGevraagd()) { setVanBuiten(true);verlaatGesprek(); setWinkel(oud => ({ deel: "kaart", ronde: (oud?.ronde ?? 0) + 1 })); } }; open(); window.addEventListener("kaart-openen", open); return () => window.removeEventListener("kaart-openen", open); }, []);
  useEffect(()=>{const open=()=>{if(winkelAppGevraagd()){setVanBuiten(true);verlaatGesprek();setWinkel(oud=>({deel:"ontdekken",ronde:(oud?.ronde??0)+1}));}};open();window.addEventListener("winkel-app-openen",open);return()=>window.removeEventListener("winkel-app-openen",open);},[]);
  useEffect(()=>{
    const bestelling=()=>{const v=openGevraagd();if(v){setVanBuiten(true);verlaatGesprek();setWinkel(oud=>({deel:"bestellingen",melding:v.melding,ronde:(oud?.ronde??0)+1}));}};
    const adres=()=>{const a=winkelGevraagd();if(a){setVanBuiten(true);verlaatGesprek();setWinkel(oud=>({deel:"ontdekken",adres:a,ronde:(oud?.ronde??0)+1}));}};
    window.addEventListener("bestellingen-openen",bestelling);window.addEventListener("winkel-adres-openen",adres);
    return()=>{window.removeEventListener("bestellingen-openen",bestelling);window.removeEventListener("winkel-adres-openen",adres);};
  },[]);
  const totaalOngelezen=lijst.filter(g=>g.ongelezen>0).length+gasten.filter(g=>g.ongelezen).length+groepen.filter(c=>c.status==="uitgenodigd"||c.kanalen.some(k=>k.ongelezen>0)).length;
  useEffect(()=>{ongelezenGewijzigd?.(totaalOngelezen);},[totaalOngelezen,ongelezenGewijzigd]);
  const vorige = useRef("");
  const kijkNieuw = useCallback(async () => {
    const o = await overzicht();
    const stand = JSON.stringify(o);
    const nieuw = stand !== vorige.current;
    vorige.current = stand;
    setLijst(o.gesprekken);
    setGroepen(o.communities);
    gastGesprekken().then((g) => setGasten(g.gesprekken)).catch(() => {});
    for (const x of o.gesprekken.slice(0, 30))
      voorbeeld(x).then((t) => setVoorbeelden((v) => (v[x.id] === t ? v : { ...v, [x.id]: t }))).catch(() => {});
    return nieuw;
  }, []);
  const laden = useCallback(async () => { await kijkNieuw(); }, [kijkNieuw]);

  // Terug van betalen voor een cursus, pakket of abonnement: controleren of het gelukt is.
  useEffect(() => {
    const t = cursusTerug();
    if (t) terugControleren(t).then(mascotteZeg).catch((e) => setFout(e instanceof Error ? e.message : "Controleren lukte niet."));
  }, []);

  useEffect(() => {
    starten().then((id) => {
      setIk(id);
      luisteren(id);
      return laden();
    }).then(() => cursusLinkOpenen().then((c) => c !== null && setOpenCommunity(c))
      .catch(() => setFout("Deze cursus, training of dienst zie je als je lid bent van de community."))).catch((e) => setFout(e instanceof Error ? e.message : "De chat kon niet starten."));
  }, [laden]);

  useEffect(() => {
    if (ik === null || (open !== null && schermActief)) return;
    const p = peilen(kijkNieuw, 4000, 20_000);
    return p.stop;
  }, [ik, open, kijkNieuw,schermActief]);

  if (open !== null && ik !== null) {
    const g = lijst.find((x) => x.id === open);
    return <Gesprekscherm key={open} id={open} ik={ik} begin={g} bronBericht={bronBericht} projectGeopend={projectGeopend} beginConcept={concepten.current.get(open)??""} bewaarConcept={bewaarConcept} gelezen={markeerGelezen} projectOpen={werkGesprek?.id === open || projectVan === open} staat={staat} setStaat={setStaat} terug={() => { setOpen(null); laden().catch(() => {}); }} />;
  }
  if (openGast !== null) return <GastGesprekScherm boeking={openGast} terug={() => { setOpenGast(null); laden().catch(() => {}); }} />;
  if (winkel) return <WinkelApp staat={staat} setData={data=>setStaat?.(s=>s&&s.gebruiker.id===staat.gebruiker.id?{...s,data}:s)} key={winkel.ronde} start={winkel.deel} melding={winkel.melding} adres={winkel.adres}
    thuisadres={staat?.data.instellingen?.thuisadres} bestel={bestel} terugNaam={vanBuiten?terugNaam:"Chat"} losseKaart={vanBuiten&&winkel.deel==="kaart"} terug={() => {setWinkel(null);if(vanBuiten)verlaat?.();setVanBuiten(false);}} />;
  if (openCommunity !== null && ik !== null) {
    const c = groepen.find((x) => x.id === openCommunity);
    if (c) return <CommunityScherm c={c} openKanaal={setOpen} vernieuw={laden}
      bijgewerkt={(data) => setStaat?.((s) => (s ? { ...s, data } : s))}
      terug={() => { setOpenCommunity(null); laden().catch(() => {}); }} />;
  }

  const ongelezenChats = lijst.reduce((n, g) => n + (g.ongelezen ? 1 : 0), 0) + gasten.filter((g) => g.ongelezen).length;
  const ongelezenGroepen = groepen.reduce((n, c) => n + (c.status === "uitgenodigd" ? 1
    : c.kanalen.reduce((m, k) => m + k.ongelezen, 0) > 0 ? 1 : 0), 0);
  const acties = deel === "chats" && !nieuw ? [{ label: "Bellen", icoon: <Telefoon className="size-5" />, doe: () => setDeel("oproepen") },
      { label: "Nieuw gesprek", icoon: <Bewerk className="size-5" />, doe: () => setNieuw(true) }]
    : deel === "oproepen" ? [{ label: "Belinstellingen", icoon: <Tandwiel className="size-5" />, doe: () => setBelInst(true) }]
    : [];
  const zichtbaar = chatDelenVan(staat.data.instellingen?.chatdelen);
  // Een onderdeel dat niet in je rij staat (zoals Bellen via de knop), opent als losse pagina met één stap terug.
  const rij = zichtbaar.includes(deel) ? DELEN.filter(([k]) => zichtbaar.includes(k)) : [];

  return (
    <div className="flex min-h-full flex-col">
      <AppKop titel={DELEN.find(([k]) => k === deel)?.[1] ?? "Chat"}
        terug={!zichtbaar.includes(deel) ? () => setDeel("chats") : undefined} terugNaam="Chats"
        rechts={(
          <span className="flex shrink-0 gap-2">
            {deel !== "oproepen" && <InstellingenKnop pagina="privacy" label="Privacy en beveiliging instellen" />}
            {acties.map((a) => (
              <button key={a.label} onClick={a.doe} aria-label={a.label}
                className="flex size-11 items-center justify-center rounded-full bg-vlak">{a.icoon}</button>
            ))}
          </span>
        )} />
      {fout && <p className="px-6 text-rustig">{fout}</p>}
      {deel === "chats" && nieuw && (
        <NieuwVeld sluit={() => setNieuw(false)} gestart={(id) => { setNieuw(false); laden().then(() => setOpen(id)); }} />
      )}
      {deel === "chats" && !nieuw && <GastenLijst lijst={gasten} open={setOpenGast} />}
      {deel === "chats" && ik !== null && (
        <Chats zoek={zoekGesprek} setZoek={setZoekGesprek} ik={ik} lijst={lijst} voorbeelden={voorbeelden} open={id=>{setBronBericht(null);setOpen(id);}} nieuw={() => setNieuw(true)} fout={fout} zoekt={nieuw} />
      )}
      {deel === "communitys" && ik !== null && (
        <Communitys lijst={groepen} open={setOpenCommunity} vernieuw={laden} staat={staat} />
      )}
      {deel === "oproepen" && ik !== null && <Oproepen ik={ik} lijst={lijst} instellingen={belInst}
        sluitInstellingen={() => setBelInst(false)} zoekIemand={() => { setDeel("chats"); setNieuw(true); }} bewaard={(data) => setStaat?.((s) => (s ? { ...s, data } : s))} />}
      {deel === "projecten" && <Suspense fallback={null}>
        <Projecten ingebed staat={staat} open={(g) => {projectGeopend?.(g);setProjectVan(g);setBronBericht(null);setOpen(g); }} naarChat={() => setDeel("chats")} />
      </Suspense>}
      {rij.length > 1 && <AppMenu naam="Chat" actief={deel} kies={setDeel}
        items={rij.map(([k, naam, Icoon]) => [k, naam, Icoon,
          k === "chats" ? ongelezenChats : k === "communitys" ? ongelezenGroepen : 0] as MenuItem<Deel>)} />}
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

function Chats({ ik, lijst, voorbeelden, open, nieuw, fout, zoekt,zoek,setZoek }: { zoek:string;setZoek:(s:string)=>void; ik: number; lijst: Gesprek[];
  voorbeelden: Record<number, string>; open: (id: number) => void; nieuw: () => void; fout: string; zoekt: boolean }) {
  const [updates,setUpdates]=useState(false);
  const zichtbaar=lijst.filter(g=>`${gesprekNaam(g,ik)} ${voorbeelden[g.id]??""}`.toLocaleLowerCase("nl").includes(zoek.trim().toLocaleLowerCase("nl")));
  return (
    <>
      <label className="mx-6 mb-3 flex items-center gap-2 rounded-2xl bg-vlak px-3"><Zoek className="size-5 shrink-0 text-rustig"/><input type="search" aria-label="Zoek een gesprek" placeholder="Zoek een persoon of groep" value={zoek} onChange={e=>setZoek(e.target.value)} className="h-12 min-w-0 flex-1 bg-transparent outline-none"/></label>
      <details className="mx-6 mb-3" onToggle={e=>setUpdates(e.currentTarget.open)}><summary className="min-h-11 cursor-pointer py-2 text-[13px] text-rustig">Updates van je contacten</summary>{updates&&<StoryRij ik={ik}/>}</details>
      {zoek.trim()&&lijst.length>0&&!zichtbaar.length&&<p role="status" className="px-6 text-sm text-rustig">Geen gesprek gevonden. Probeer een andere naam.</p>}
      {lijst.length === 0 && !fout && !zoekt && (
        <Leeg icoon={<Slot />} titel="Nog geen gesprekken" uitleg="Alles wat je hier schrijft, kan alleen jij en wie je spreekt lezen.">
          <button onClick={nieuw} className="mt-2 h-11 rounded-full bg-accent px-5 font-medium text-white">Begin een gesprek</button>
        </Leeg>
      )}
      <ul className="flex flex-col px-3">
        {zichtbaar.map((g) => {
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

function bewaardWeergave(): "feed" | "groepen" {
  try { return localStorage.getItem("assistent.communitydeel") === "groepen" ? "groepen" : "feed"; } catch { return "feed"; }
}

function Communitys({ lijst, open, vernieuw, staat }: { lijst: Community[]; open: (id: number) => void;
  vernieuw: () => Promise<void>; staat: Staat }) {
  const [weergave, setWeergaveRuw] = useState(bewaardWeergave);
  const [begin] = useState(() => feedInstelling(staat.data.instellingen));
  const [startBlad, setStartBlad] = useState(false);
  function setWeergave(w: "feed" | "groepen") {
    setWeergaveRuw(w);
    try { localStorage.setItem("assistent.communitydeel", w); } catch { /* geen opslag */ }
  }
  const keuze = (
    <div className="mx-6 mb-3 grid grid-cols-2 gap-1 rounded-full bg-vlak p-1">
      {([["feed", "Feed"], ["groepen", "Groepen"]] as const).map(([k, t]) => (
        <button key={k} onClick={() => setWeergave(k)} aria-pressed={weergave === k}
          className={`h-9 rounded-full text-sm font-medium ${weergave === k ? "bg-white shadow-sm dark:bg-[#2a2a30]" : "text-rustig"}`}>{t}</button>
      ))}
    </div>
  );
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
function CommunityScherm({ c, openKanaal, vernieuw, terug, bijgewerkt }: { c: Community; openKanaal: (id: number) => void;
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

type WinkelKaartje = { adres: string; naam: string; omschrijving?: string; producten?: number; lat?: number | null;
  lon?: number | null; winkeladres?: string };

type Ic = (p: { className?: string }) => ReactNode;
const BRONNEN: [NonNullable<Filter["bron"]>, string, Ic][] = [["alles", "Alles", RasterIcoon], ["marktplaats", "Marktplaats", Mensen],
  ["winkels", "Winkels", Winkelpand], ["diensten", "Diensten", Gereedschap]];
const CATEGORIEEN: [string, Ic][] = [["Kleding", Shirt], ["Elektronica", Scherm], ["Huis en tuin", Huis], ["Fietsen", Fiets],
  ["Sport", Bal], ["Boeken", Boek], ["Kinderen", Kind], ["Hobby", Penseel]];
const chip = (aan: boolean) => `flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm ${aan ? "bg-accent font-medium text-white" : "bg-vlak text-rustig"}`;

type WinkelDeelNaam = "ontdekken" | "verkopen" | "bestellingen" | "kaart";

/** De winkel als eigen app: ontdekken, zelf verkopen en je bestellingen, met een eigen menu onderin. */
function WinkelApp({ start, melding, adres, thuisadres, bestel, terug, staat, setData,terugNaam,losseKaart }: { terugNaam?:string;losseKaart?:boolean; staat:Staat;setData:(g:Gegevens)=>void; start: WinkelDeelNaam; melding?: string;
  adres?: string; thuisadres?: string; bestel: (p: Product) => void; terug: () => void }) {
  const [deel, setDeel] = useState<WinkelDeelNaam>(start);
  const [openWinkel, setOpenWinkel] = useState(adres);
  const [wacht, setWacht] = useState(0);
  const [verkopen, setVerkopen] = useState(false);
  const [bijgewerkt, setBijgewerkt] = useState(0);
  useEffect(() => {
    bestellingenLijst().then((l) => setWacht(l.filter(wachtOpMij).length)).catch(() => {});
  }, [deel]);
  // Eén scherm: zoeken en kopen. Verkopen en Bestellingen zijn knoppen rechtsboven, met één stap terug naar de winkel.
  const knop = "relative flex size-10 items-center justify-center rounded-full bg-vlak";
  return (
    <div className="flex min-h-full flex-col">
      <AppKop terug={deel === "ontdekken"||(deel==="kaart"&&losseKaart) ? terug : () => setDeel("ontdekken")} terugNaam={deel === "ontdekken"||(deel==="kaart"&&losseKaart) ? terugNaam??"Chat" : "Winkel"}
        titel={deel === "ontdekken" ? "Winkel" : deel === "kaart" ? "Kaart en routes" : deel === "verkopen" ? "Verkopen" : "Bestellingen"}
        rechts={deel === "ontdekken" && (
          <span className="flex shrink-0 gap-2">
            <button onClick={() => setDeel("kaart")} aria-label="Kaart en routes" className={knop}><KaartVouw className="size-5" /></button>
            <button onClick={() => setDeel("verkopen")} aria-label="Verkopen" className={knop}><Plus className="size-5" /></button>
            <button onClick={() => setDeel("bestellingen")} aria-label={wacht ? `Bestellingen, ${wacht} wachten op jou` : "Bestellingen"} className={knop}>
              <Tas className="size-5" />
              {wacht > 0 && <span className="absolute -top-1 -right-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[11px] font-semibold text-white">{wacht}</span>}
            </button>
          </span>
        )} />
      {(deel === "ontdekken" || deel === "kaart") && <WinkelDeel staat={staat} setData={setData} key={deel} kaart={deel === "kaart"} bestel={bestel} verkoop={() => setVerkopen(true)}
        winkel={openWinkel} thuisadres={thuisadres} />}
      {deel === "verkopen" && (
        <div className="flex flex-col gap-5 px-6 pb-8">
          <button onClick={() => setVerkopen(true)} className="flex items-center gap-3 rounded-2xl bg-accent/10 p-4 text-left">
            <Plus className="size-6 text-accent" />
            <span className="flex flex-col">
              <span className="font-medium">Zet iets te koop</span>
              <span className="text-[13px] text-rustig">Een product of een dienst, met foto en prijs</span>
            </span>
          </button>
          <MijnWinkel key={bijgewerkt} bekijk={(a) => { setOpenWinkel(a); setDeel("ontdekken"); }} />
          <JouwAanbod key={bijgewerkt} />
        </div>
      )}
      {deel === "bestellingen" && <Bestellingen melding={deel === start ? melding : undefined} />}
      {verkopen && <Verkopen sluit={() => setVerkopen(false)}
        geplaatst={() => { setVerkopen(false); setBijgewerkt((n) => n + 1); }} />}
    </div>
  );
}

function WinkelDeel({ bestel, verkoop, winkel, thuisadres, kaart, staat, setData }: { staat:Staat;setData:(g:Gegevens)=>void; bestel: (p: Product) => void; verkoop: () => void;
  winkel?: string; thuisadres?: string; kaart?: boolean }) {
  const [zoek, setZoek] = useState("");
  const [term, setTerm] = useState("");
  const [bron, setBron] = useState<NonNullable<Filter["bron"]>>(kaart ? "winkels" : "alles");
  const [bezorgen, setBezorgen] = useState(false);
  const [producten, setProducten] = useState<Product[] | null>(null);
  const [winkels, setWinkels] = useState<WinkelKaartje[]>([]);
  const [stapel, setStapel] = useState<Blad[]>(() => (winkel ? [{ soort: "winkel", adres: winkel }] : []));
  const [fout, setFout] = useState("");

  useEffect(() => {
    setFout("");
    setProducten(null);
    zoeken(term, { bron, bezorgen, max: 40 }).then(setProducten).catch((e) => { setProducten([]); setFout(foutVan(e)); });
    if (bron === "alles" || bron === "winkels")
      rpc<WinkelKaartje[]>("winkels_zoeken", { p_zoekterm: term }).then((w) => setWinkels(Array.isArray(w) ? w : [])).catch(() => {});
  }, [term, bron, bezorgen]);
  const zoekt = term.trim() !== "";
  return (
    <div className="flex flex-col gap-5 px-6 pb-8">
      <form onSubmit={(e) => { e.preventDefault(); setTerm(zoek); }} className="flex items-center gap-2 rounded-2xl bg-vlak px-4">
        <Zoek className="size-5 shrink-0 text-zacht" />
        <input value={zoek} onChange={(e) => { setZoek(e.target.value); if (!e.target.value) setTerm(""); }}
          placeholder="Zoek in winkels en marktplaats" aria-label="Zoeken"
          enterKeyHint="search" className="h-12 flex-1 bg-transparent outline-none placeholder:text-zacht" />
      </form>
      <div className="-mx-6 flex gap-2 overflow-x-auto px-6 [scrollbar-width:none]">
        {BRONNEN.map(([k, naam, Icoon]) => (
          <button key={k} aria-pressed={bron === k} onClick={() => setBron(k)} className={chip(bron === k)}>
            <Icoon className="size-4" />{naam}
          </button>
        ))}
        <button aria-pressed={bezorgen} onClick={() => setBezorgen((b) => !b)} className={chip(bezorgen)}>
          <Truck className="size-4" />Bezorgen
        </button>
      </div>
      {bron === "winkels" && !zoekt && (
        <Suspense fallback={<p className="bezig-tekst py-6 text-[15px] text-rustig">Kaart laden</p>}>
          <WinkelKaart staat={staat} setData={setData} winkels={winkels} thuisadres={thuisadres} open={(a) => setStapel([{ soort: "winkel", adres: a }])} />
        </Suspense>
      )}
      {!zoekt && bron !== "winkels" && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-rustig">Categorieën</h2>
          <div className="grid grid-cols-4 gap-2">
            {CATEGORIEEN.map(([c, Icoon]) => (
              <button key={c} onClick={() => { setZoek(c); setTerm(c); }}
                className="flex flex-col items-center gap-1.5 rounded-2xl bg-vlak px-1 py-3 text-[12px] leading-tight">
                <Icoon className="size-6 text-accent dark:text-accent-donker" />{c}
              </button>
            ))}
          </div>
        </section>
      )}
      {(bron === "alles" || bron === "winkels") && winkels.length > 0 && (
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
        <h2 className="text-sm font-medium text-rustig">{zoekt ? `Gevonden voor "${term}"` : bron === "diensten" ? "Diensten" : "Te koop"}</h2>
        {fout && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{fout}</p>}
        {producten === null ? <p className="bezig-tekst py-6 text-[15px] text-rustig">Laden</p>
          : producten.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-2xl bg-vlak px-6 py-8 text-center">
              <Tas className="size-8 text-zacht" />
              <p className="font-medium">{zoekt ? "Niets gevonden" : "Hier staat nog niets"}</p>
              <p className="text-sm text-rustig">{bezorgen ? "Zet Bezorgen uit om ook ophalen te zien, of " : ""}zet zelf als eerste iets te koop.</p>
              <button onClick={verkoop} className="h-10 rounded-full bg-accent px-5 text-sm font-medium text-white">Verkopen</button>
            </div>
          ) : <Raster producten={producten} open={(p) => setStapel([{ soort: "product", p }])} />}
      </section>
      <p className="text-[13px] text-zacht">Je kunt ook de assistent vragen iets te zoeken. Er gaat pas iets weg als jij zelf op Bestellen tikt.</p>
      <Bladen stapel={stapel} zet={setStapel} bestel={(p) => { setStapel([]); bestel(p); }} />
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

function Gesprekscherm({ id, ik, begin, terug, projectOpen, staat, setStaat,gelezen:markeer,bronBericht,projectGeopend,beginConcept="",bewaarConcept }: { projectGeopend?:(id:number)=>void; bronBericht?:number|null;beginConcept?:string;bewaarConcept?:(id:number,tekst:string)=>void; gelezen?:(id:number)=>void; id: number; ik: number; begin?: Gesprek; terug: () => void; projectOpen?: boolean; staat?: Staat; setStaat?: React.Dispatch<React.SetStateAction<Staat | null>> }) {
  const [g, setG] = useState<Gesprek | undefined>(begin);
  const [taakBericht,setTaakBericht]=useState<Regel|null>(null);
  const [bronGeladen,setBronGeladen]=useState<number|null>(null);
  const geblokkeerdeBron=useRef<number|null>(null);
  const [regels, setRegels] = useState<Regel[]>([]);
  const [invoer, setInvoer] = useState(beginConcept);
  useEffect(()=>{bewaarConcept?.(id,invoer);},[id,invoer,bewaarConcept]);
  const actief=useSchermActief(),actiefRef=useRef(actief);actiefRef.current=actief;
  const [extraOpen,setExtraOpen]=useState(!!projectOpen);
  useEffect(()=>{if(projectOpen)setExtraOpen(true);},[projectOpen]);
  useEffect(()=>{const openen=(e:Event)=>{if((e as CustomEvent).detail?.gesprek===id)setExtraOpen(true);};window.addEventListener("assistent-projectbron",openen);return()=>window.removeEventListener("assistent-projectbron",openen);},[id]);

  useEffect(()=>{
    const concept=(e:Event)=>{const d=(e as CustomEvent).detail;if(d?.gesprek!==id||typeof d.tekst!=="string"||!d.tekst.trim()||d.tekst.length>1500||/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(d.tekst))return;setInvoer(oud=>oud.trim()?oud:d.tekst);};
    window.addEventListener("assistent-chatconcept",concept);return()=>window.removeEventListener("assistent-chatconcept",concept);
  },[id]);

  const [fout, setFout] = useState("");
  const [timer, setTimer] = useState(false);
  const tot = useRef(0);
  const onder = useRef<HTMLDivElement>(null);
  const bezig = useRef(false);

  const bijwerken = useCallback(async () => {
    if (bezig.current || !actiefRef.current || document.visibilityState!=="visible") return false;
    bezig.current = true;
    try {
      const r = await berichten(id, tot.current,()=>actiefRef.current&&document.visibilityState==="visible");
      if(!actiefRef.current||document.visibilityState!=="visible")return false;
      if (r.gesprek) setG(r.gesprek);
      if (r.hoogste) {tot.current = r.hoogste;markeer?.(id);}
      if (r.regels.length) setRegels((oud) => {
        const al = new Set(oud.map((x) => x.id));
        return [...oud, ...r.regels.filter((x) => !al.has(x.id)&&x.id!==geblokkeerdeBron.current)].sort((a,b)=>a.id-b.id);
      });
      return r.regels.length > 0;
    } finally {
      bezig.current = false;
    }
  }, [id,markeer]);

  useEffect(() => {
    if(!actief)return;
    bijwerken().catch((e) => setFout(e instanceof Error ? e.message : "Laden lukte niet."));
    const p = peilen(bijwerken, 2500, 15_000);
    return p.stop;
  }, [bijwerken,actief]);
  useEffect(() => { if(actief&&!bronBericht)onder.current?.scrollIntoView?.({ block: "end" }); }, [regels.length,actief,bronBericht]);

  useEffect(()=>{
    if(!bronBericht){geblokkeerdeBron.current=null;setBronGeladen(null);return;}if(!actief)return;let gestopt=false;
    geblokkeerdeBron.current=null;setBronGeladen(null);setRegels(oud=>oud.filter(r=>r.id!==bronBericht));
    chatBronLezen(id,bronBericht,false).then(r=>{if(gestopt)return;setG(r.gesprek);setRegels(oud=>[...oud.filter(x=>x.id!==r.regel.id),r.regel].sort((a,b)=>a.id-b.id));setBronGeladen(bronBericht);setFout("");}).catch(e=>{if(!gestopt){geblokkeerdeBron.current=bronBericht;setRegels(oud=>oud.filter(r=>r.id!==bronBericht));setFout(e instanceof Error?e.message:"Het bronbericht is niet meer beschikbaar.");}});
    return()=>{gestopt=true;};
  },[id,bronBericht,actief]);
  useEffect(()=>{if(!actief||!bronGeladen)return;const r=requestAnimationFrame(()=>{const e=document.getElementById(`chat-bericht-${bronGeladen}`);e?.scrollIntoView?.({block:"center",behavior:"auto"});e?.focus({preventScroll:true});});return()=>cancelAnimationFrame(r);},[bronGeladen,actief]);

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
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-lijn bg-white/85 px-3 pt-3 pb-2.5 backdrop-blur dark:bg-[#0b0b0e]/85">
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

      {g?.status === "lid" && <details open={extraOpen} className="border-b border-lijn" onToggle={e=>{if(e.target===e.currentTarget)setExtraOpen(e.currentTarget.open);}}><summary className="min-h-11 cursor-pointer px-4 py-3 text-sm font-medium">＋ Meer in dit gesprek</summary>
      {g?.soort === "twee" && g.status === "lid" && magSchrijven && !g.verdwijnen && g.leden.filter(l=>l.status==="lid"&&l.id!==ik).length===1 && <BetaalverzoekMaken gesprek={id} ander={g.leden.find(l=>l.status==="lid"&&l.id!==ik)!.id} vernieuw={async () => { await bijwerken(); }} />}
      {g?.status === "lid" && <ProjectWerkruimte geopend={()=>projectGeopend?.(id)} beginOpen={projectOpen} gesprek={id} regels={regels} schrijven={magSchrijven} verdwijnend={!!g.verdwijnen} ik={ik} leden={g.leden} vernieuw={async () => { await bijwerken(); }} aiMogelijk={!g.alleen_beheer} staat={staat} setData={data => setStaat?.(oud => oud ? { ...oud, data } : oud)} />}
      </details>}
      <main className="flex flex-1 flex-col gap-1 px-4 py-4" aria-live="polite">
        {regels.filter(r => !["project", "projectactie"].includes(r.bericht?.t ?? "")).map((r, i, zichtbaar) => {
          const mijn = r.afzender === ik;
          const vorige = zichtbaar[i - 1];
          const nieuweDag = !vorige || datumTekst(new Date(vorige.tijd)) !== datumTekst(new Date(r.tijd));
          const zelfde = !nieuweDag && vorige?.afzender === r.afzender;
          const lid = g?.leden.find((l) => l.id === r.afzender);
          const tekst = r.weg ? "Bericht verwijderd" : r.fout || !r.bericht ? "Dit bericht kun je op dit apparaat niet lezen"
            : r.bericht.t === "tekst" ? String(r.bericht.tekst ?? "") : kortTekst(r.bericht) || "Bericht";
          const bijzonder = r.weg || r.fout || !r.bericht || r.bericht.t !== "tekst";
          return (
            <Fragment key={r.id}>
              <span id={`chat-bericht-${r.id}`} tabIndex={-1} />
              {r.bericht?.t === "tekst" && !r.weg && !r.fout && g?.status === "lid" && <details className="self-start"><summary className="min-h-11 cursor-pointer px-2 py-3 text-xs text-accent">Acties bij bericht</summary><div className="flex flex-wrap gap-2">
                {staat&&setStaat&&!g.verdwijnen&&<button className="min-h-11 rounded-full bg-vlak px-3 text-xs text-accent" onClick={()=>setTaakBericht(r)}>Maak persoonlijke taak</button>}
                {magSchrijven&&<button className="min-h-11 rounded-full bg-vlak px-3 text-xs text-accent" onClick={() => window.dispatchEvent(new CustomEvent("assistent-projectbron", { detail: { gesprek: id, id: r.id } }))}>Maak projectvoorstel uit dit bericht</button>}
                {g.verdwijnen&&<p className="text-xs text-rustig">Een blijvende taak is niet beschikbaar bij verdwijnende berichten.</p>}
              </div></details>}
              {nieuweDag && (
                <p className="my-3 text-center text-xs font-medium text-zacht">
                  {datumTekst(new Date(r.tijd)) === datumTekst(new Date()) ? "Vandaag" : dagTitel(new Date(r.tijd))}
                </p>
              )}
              {bronGeladen===r.id&&<p className="text-xs font-semibold text-accent">Bronbericht bij je taak</p>}
              <div className={`flex flex-col ${mijn ? "items-end" : "items-start"} ${zelfde ? "" : "mt-2"}`}>
                {groep && !mijn && !zelfde && <span className="mb-0.5 ml-3 text-xs font-medium text-rustig">{lid?.naam}</span>}
                <div className={`max-w-[80%] rounded-3xl px-3.5 py-2 ${mijn ? "rounded-br-md bg-accent text-white" : "rounded-bl-md bg-vlak"}
                  ${bijzonder ? "italic opacity-80" : ""}`}>
                  {!r.weg&&!r.fout&&r.bericht?.t==="projectbetaling"&&g?.soort==="twee" ? <ChatBetaalkaart bericht={r.bericht} ander={mijn ? g.leden.find(l=>l.status==="lid"&&l.id!==ik)?.id ?? 0 : r.afzender} mijn={mijn} /> : <span className="whitespace-pre-wrap break-words">{tekst}</span>}
                  <span className={`ml-2 inline-flex translate-y-0.5 items-center gap-0.5 text-[11px] ${mijn ? "text-white/70" : "text-zacht"}`}>
                    {new Date(r.tijd).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })}
                    {mijn && (r.id <= gelezen ? <Dubbelvink className="size-4 text-white" />
                      : r.id <= ontvangen ? <Dubbelvink className="size-4" /> : <Vinkje className="size-3.5" />)}
                  </span>
                </div>
              </div>
              {taakBericht?.id===r.id&&staat&&setStaat&&<BerichtTaak key={r.id} gesprek={id} regel={taakBericht} staat={staat} setData={data=>setStaat(oud=>oud?.gebruiker.id===staat.gebruiker.id?{...oud,data}:oud)} sluit={()=>setTaakBericht(null)}/>}
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
          <label className="flex items-center gap-2 rounded-3xl bg-vlak py-1.5 pr-1.5 pl-5">
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

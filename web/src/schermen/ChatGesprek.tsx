import BerichtTaak from "./BerichtTaak";
import { useSchermActief } from "./BewaarScherm";
import { BetaalverzoekMaken, ChatBetaalkaart } from "./ChatBetaling";
import ProjectWerkruimte from "./ProjectWerkruimte";
import { Fragment, useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Meer, Dubbelvink, Pijl, Slot, Telefoon, Terug, Video, Vinkje } from "../iconen";
import { Berichten } from "./Feed";
import { VERDWIJNEN, verdwijnenInstellen, antwoorden, berichten, community, chatBronLezen, contacten, gesprekNaam, kortTekst, nieuwGesprek, versturen, type Contact, type Gesprek, type Regel } from "../lib/chat";
import { bellen, kan as kanBellen } from "../lib/bellen";
import { useBellen } from "./Bellen";
import { Rondje } from "../rondje";
import { peilen } from "../lib/peilen";
import { dagTitel, datumTekst } from "../lib/tijd";
import type { Staat } from "../App";

const foutVan = (e: unknown) => (e instanceof Error ? e.message : "Dat lukte niet.");
export function NieuwVeld({ sluit, gestart }: { sluit: () => void; gestart: (id: number) => void }) {
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

export function Gesprekscherm({ id, ik, begin, terug, projectOpen, staat, setStaat,gelezen:markeer,bronBericht,projectGeopend,beginConcept="",bewaarConcept }: { projectGeopend?:(id:number)=>void; bronBericht?:number|null;beginConcept?:string;bewaarConcept?:(id:number,tekst:string)=>void; gelezen?:(id:number)=>void; id: number; ik: number; begin?: Gesprek; terug: () => void; projectOpen?: boolean; staat?: Staat; setStaat?: React.Dispatch<React.SetStateAction<Staat | null>> }) {
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

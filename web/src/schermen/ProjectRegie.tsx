import ProjectNavigatie from "./ProjectNavigatie";
import ProjectBord from "./ProjectBord";
import ProjectWerkdruk from "./ProjectWerkdruk";
import { stapStatusVoorstel } from "../lib/projectwerk";
import ProjectKompas from "./ProjectKompas";
import { aiGepauzeerd, controleerProjectAi, pauzeerProjectAi, privacyVoorbeeld } from "../lib/projectprivacy";
import ProjectHoe from "./ProjectHoe";
import ProjectWanneer from "./ProjectWanneer";
import ProjectAls from "./ProjectAls";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { bijwerken, huidigeSessie } from "../api";
import type { Staat } from "../App";
import { projectRegelsVers, versturen, type Lid, type Regel } from "../lib/chat";
import { assistentContext, bronStatus, isAfgerond, nieuwFeit, oefenplanning, overdracht, PROJECT_SCOPE, PROJECTKENNIS,
  projectFeiten, type Bron, type Feit, type ProjectActie, type Soort } from "../lib/projectregie";
import { taakVoorstel, taakUitvoeren, taakResultaat, type DagActie } from "../lib/dagacties";
import { leesProjectbericht, projectLezen, type Werkbestand } from "../lib/project";

const SOORTLABEL:Record<string,string>={kennis:"Notitie",besluit:"Besluit",actie:"Actie",vraag:"Vraag",aandacht:"Samen bekijken",aanpak:"Stappenplan",stapstatus:"Voortgang",werkvenster:"Beschikbaarheid",staptijd:"Projecttijd",toestemming:"AI-toestemming",bereikbaar:"Bereikbaarheid",afgerond:"Afronding"};
const datum = (t: string) => new Date(t).toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam" });
const download = (tekst: string, naam: string) => {
  const url = URL.createObjectURL(new Blob([tekst], { type: "text/plain;charset=utf-8" }));
  const a = document.createElement("a"); a.href = url; a.download = naam; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export default function ProjectRegie({ gesprek, ik, leden, regels, bestanden, schrijven, aiMogelijk, vernieuw,
  bronVoorstel, bronOpenen, bestandOpenen, staat, setData }: {
  gesprek: number; ik: number; leden: Lid[]; regels: Regel[]; bestanden: Map<string, Werkbestand>;
  schrijven: boolean; aiMogelijk: boolean; vernieuw: () => Promise<void>; bronVoorstel?: Bron | null;
  bronOpenen: (b: Bron) => void; bestandOpenen?: (id: string) => void; staat?: Staat; setData?: (data: Staat["data"]) => void;
}) {
  const feiten = useMemo(() => projectFeiten(regels), [regels]);
  const namen = new Map(leden.map(l => [l.id, l.naam]));
  const actieveLeden = [...new Set(leden.filter(l => l.status === "lid").map(l => l.id))];
  const [toonFeiten,setToonFeiten]=useState(false);
  const voorstelElement=useRef<HTMLDivElement>(null);
  const [deel, setDeel] = useState("Overzicht");
  const [doelFocus, setDoelFocus] = useState<string>();
  const voorkeurSleutel = `assistent.projectwerkstand.${huidigeSessie()?.naam ?? ""}.${gesprek}`;
  const [werkstand, setWerkstand] = useState(() => { try { const v = localStorage.getItem(voorkeurSleutel); return v && ["Vandaag", "Samenwerken", "Ondernemen"].includes(v) ? v : "Samenwerken"; } catch { return "Samenwerken"; } });
  const [nu, setNu] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNu(Date.now()), 60_000); return () => clearInterval(t); }, []);
  const [soort, setSoort] = useState<Soort>("kennis");
  const [tekst, setTekst] = useState("");
  const [bron, setBron] = useState<Bron>({ soort: "eigen" });
  const [minuten, setMinuten] = useState(30);
  const [wie, setWie] = useState(0);
  const [pending, setPending] = useState<ProjectActie | null>(null);
  useEffect(()=>{if(pending)voorstelElement.current?.focus();},[pending?.sleutel]);
  const [onzeker, setOnzeker] = useState(false);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState("");
  const [melding, setMelding] = useState("");
  const slot = useRef(false);
  const toestemmingReset = useRef(new Map<string, ProjectActie>());
  const [capaciteit, setCapaciteit] = useState(120);
  const [oefening, setOefening] = useState<ReturnType<typeof oefenplanning> | null>(null);
  const bezoekSleutel = `assistent.projectbezoek.${huidigeSessie()?.naam ?? ""}.${gesprek}`;
  const [gezien, setGezien] = useState(() => { try { const n = Number(localStorage.getItem(bezoekSleutel)); return Number.isSafeInteger(n) && n >= 0 ? n : 0; } catch { return 0; } });
  const [toestemmingDoel, setToestemmingDoel] = useState(PROJECT_SCOPE);
  const [privacyPauze, setPrivacyPauze] = useState(() => aiGepauzeerd(gesprek));
  const [geldigMinuten, setGeldigMinuten] = useState(60);
  const aiVerzoek = useRef<AbortController | null>(null);
  useEffect(() => () => aiVerzoek.current?.abort(), []);
  const [kennisAan, setKennisAan] = useState(false);
  const [aiBestand, setAiBestand] = useState("");
  const [aiVoorbeeld, setAiVoorbeeld] = useState<string | null>(null);
  const [aiAkkoord, setAiAkkoord] = useState(false);
  const [aiResultaat, setAiResultaat] = useState("");
  const [taakPending, setTaakPending] = useState<{ feit: Feit; actie: DagActie } | null>(null);
  const tijdlijn = [
    ...feiten.map(f => ({ soort: "feit" as const, bericht: f.bericht, feit: f })),
    ...regels.flatMap(r => { const b = !r.weg && !r.fout ? leesProjectbericht(r.bericht) : null;
      return b ? [{ soort: "bestand" as const, bericht: r.id, bestand: b.bestand, titel: b.titel, afzender: r.afzender, tijd: r.tijd }] : []; })
  ].sort((a,b) => a.bericht - b.bericht);
  const veranderingen = tijdlijn.filter(f => f.bericht > gezien);
  const volgorde = werkstand === "Ondernemen" ? ["besluit", "kennis", "actie", "vraag"] : ["vraag", "actie", "besluit", "kennis"];
  const overzicht = feiten.filter(f => volgorde.includes(f.actie.soort))
    .filter(f => werkstand !== "Vandaag" || (f.actie.soort === "actie" && !isAfgerond(f, feiten) && (!f.actie.verantwoordelijke || f.actie.verantwoordelijke === ik)))
    .sort((a, b) => volgorde.indexOf(a.actie.soort) - volgorde.indexOf(b.actie.soort) || b.bericht - a.bericht);
  const auteurs = (id: string) => [...new Set([...regels.filter(r => !r.weg && !r.fout && r.bericht?.t === "project" && r.bericht.bestand === id).map(r => r.afzender), ...bestanden.get(id)?.bronAuteurs ?? []])];
  const nodig = (id: string) => [...new Set([...actieveLeden, ...(id === PROJECT_SCOPE
    ? feiten.filter(f => PROJECTKENNIS.includes(f.actie.soort)).map(f => f.afzender) : auteurs(id))])];

  useEffect(() => {
    if (!bronVoorstel || pending) return;
    setBron(bronVoorstel); setSoort(bronVoorstel.soort === "bestand" ? "aandacht" : "besluit");
    const r = bronVoorstel.soort === "bericht" ? regels.find(r => r.id === bronVoorstel.id) : null;
    setTekst(bronVoorstel.soort === "bestand" ? "Laten we deze tekst samen bekijken." : String(r?.bericht?.tekst ?? "").slice(0, 1500));
    setDeel("Voorstel");
  }, [bronVoorstel]);

  function bereid(e: FormEvent) {
    e.preventDefault(); setFout("");
    try {
      const extra = soort === "actie" ? { minuten, ...(wie ? { verantwoordelijke: wie } : {}) } : {};
      setPending(nieuwFeit(soort, tekst, bron, extra)); setOnzeker(false);
    } catch (e) { setFout(e instanceof Error ? e.message : "Controleer het projectvoorstel."); }
  }
  async function bevestig() {
    if (!pending || slot.current || !schrijven) return;
    if (pending.bron.soort !== "eigen" && /ontbreekt|gewijzigd/.test(bronStatus(pending.bron, regels, bestanden))) {
      setFout("De gekozen bron is gewijzigd of ontbreekt. Sluit het voorstel en kies de bron opnieuw."); return;
    }
    slot.current = true; setBezig(true); setOnzeker(true); setFout("");
    const sessie = huidigeSessie();
    try {
      // Oudere clients herkennen korte looptijden niet. Trek hun eerdere toestemming eerst herkenbaar in.
      if (pending.soort === "toestemming" && pending.keuze !== "geen" && pending.geldigMinuten !== undefined) {
        let reset = toestemmingReset.current.get(pending.sleutel);
        if (!reset) { reset = nieuwFeit("toestemming", "Vervangt mijn eerdere AI-toestemming.", { soort: "eigen" }, { doel: pending.doel, keuze: "geen", leden: pending.leden }); toestemmingReset.current.set(pending.sleutel, reset); }
        await versturen(gesprek, reset);
        if (huidigeSessie() !== sessie) return;
      }
      if (pending.soort === "stapstatus") {
        const vers = await projectRegelsVers(gesprek, false), huidig = projectFeiten(vers.regels);
        if (huidigeSessie() !== sessie) return;
        const plan = huidig.find(f => f.actie.sleutel === pending.doel);
        if (!plan) throw new Error("De aanpak ontbreekt.");
        stapStatusVoorstel(plan, pending.stap!, huidig, ik, pending.keuze!, pending.tekst);
      }
      await versturen(gesprek, pending);
      if (huidigeSessie() !== sessie) return;
      setPending(null); setOnzeker(false); setTekst(""); setMelding("Bevestigd gedeeld met dit project.");
      try { await vernieuw(); } catch { setFout("Delen is bevestigd; de actuele lijst kon nog niet worden opgehaald."); }
    } catch (e) { if (huidigeSessie() === sessie) setFout((e instanceof Error ? e.message + " " : "") + "Delen is niet bevestigd. Opnieuw proberen gebruikt hetzelfde voorstel en maakt in dit overzicht geen dubbel feit."); }
    finally { slot.current = false; setBezig(false); }
  }
  function voorbereiden(p: ProjectActie) { if (!pending && !slot.current) { setPending(p); setOnzeker(false); setFout(""); } }
  const bronRegel = (f: Feit) => <div className="mt-1 text-xs text-rustig">
    {namen.get(f.afzender) ?? `Deelnemer ${f.afzender}`} · {datum(f.tijd)}
    <button className="ml-2 min-h-11 text-accent" onClick={() => bronOpenen(f.actie.bron)}>Waarom / bron</button>
    <p>{bronStatus(f.actie.bron, regels, bestanden)}</p>
  </div>;

  return <section className="mt-3 border-t border-lijn pt-3" aria-label="Projectwerk">
    <h3 className="font-semibold">Samen aan het werk</h3>
    <p className="mt-1 text-sm text-rustig">Gedeeld met {actieveLeden.length} {actieveLeden.length===1?"deelnemer":"deelnemers"} in dit gesprek. Bekijk je volgende stap of voeg iets toe.</p>
    <div className="mt-3 rounded-xl bg-vlak p-3"><p className="font-medium">{privacyPauze ? "Project-AI gepauzeerd op dit apparaat" : "Project-AI vraagt altijd toestemming"}</p>
      <button className="min-h-11 text-accent" onClick={() => { const aan = !privacyPauze; pauzeerProjectAi(gesprek, aan); setPrivacyPauze(aan); aiVerzoek.current?.abort(); setAiVoorbeeld(null); setAiAkkoord(false); setAiResultaat(""); setMelding(aan ? "Nieuwe project-AI-aanvragen zijn geblokkeerd in deze sessie op dit apparaat. Eerder verstuurde gegevens kunnen niet worden teruggehaald; gedeelde toestemming trek je apart in via Privacy." : "Project-AI hervat. Toestemming en een nieuw gecontroleerd voorbeeld blijven nodig."); }}>{privacyPauze ? "Project-AI hervatten" : "Project-AI pauzeren"}</button>
      <button className="min-h-11 px-3 text-accent" onClick={() => setDeel("Privacy")}>Wie mag wat?</button>
    </div>
    <details className="mt-3"><summary className="min-h-11 cursor-pointer text-sm text-rustig">Mijn weergave</summary>
    <label className="mt-3 block">Mijn werkstand
      <select value={werkstand} onChange={e => { setWerkstand(e.target.value); try { localStorage.setItem(voorkeurSleutel, e.target.value); } catch { setFout("Deze werkstand geldt nu voor dit scherm; opslaan op dit apparaat lukte niet."); } }} className="ml-2 min-h-11 rounded-xl bg-vlak p-2">
        {["Vandaag", "Samenwerken", "Ondernemen"].map(x => <option key={x}>{x}</option>)}
      </select>
    </label></details>
    <ProjectNavigatie deel={deel} kies={setDeel} wijzigingen={veranderingen.length} />
    {fout && <p role="alert">{fout}</p>}{melding && <p role="status">{melding}</p>}
    {pending && <div ref={voorstelElement} tabIndex={-1} role="region" className="my-3 rounded-xl border border-lijn p-3" aria-label="Projectvoorstel controleren">
      <p className="font-semibold">Controleer {SOORTLABEL[pending.soort]??pending.soort}</p><p className="whitespace-pre-wrap break-words">{pending.tekst}</p>
      {pending.stappen?.map(s => <div key={s.id} className="my-2 rounded-xl bg-vlak p-2"><strong>{s.titel}</strong><p>Klaar als: {s.klaarAls}</p><p>{s.minuten} minuten · {s.eigenaar ? namen.get(s.eigenaar) ?? `Deelnemer ${s.eigenaar}` : "Nog niet toegewezen"}</p><p>Afhankelijk van: {s.afhankelijkVan.length ? s.afhankelijkVan.map(id => pending.stappen?.find(x => x.id === id)?.titel ?? id).join(", ") : "geen"}</p>{s.alternatief && <p>Alternatief: {s.alternatief}</p>}</div>)}
      {pending.geldigMinuten && <p>Toestemming: {pending.geldigMinuten} minuten. Eerdere toestemming wordt eerst ingetrokken; oudere appversies blijven daardoor geblokkeerd.</p>}
      {pending.uiterlijk && <p>Deadline: {datum(pending.uiterlijk)}</p>}
      <p className="text-sm text-rustig">{bronStatus(pending.bron, regels, bestanden)}. Dit wordt gedeeld met de deelnemers aan dit gesprek.</p>
      {onzeker && <p>Een eerdere poging kan al gedeeld zijn. Sluiten draait die niet terug.</p>}
      <button disabled={bezig || !schrijven} className="min-h-11 text-accent" onClick={bevestig}>{bezig ? "Delen…" : onzeker ? "Dezelfde projectopdracht opnieuw proberen" : "Bevestig en deel met project"}</button>
      <button disabled={bezig} className="min-h-11 px-3" onClick={() => { setPending(null); setOnzeker(false); }}>Sluiten</button>
    </div>}
    {deel === "Bord" && <ProjectBord feiten={feiten} ik={ik} namen={namen} doelVoorstel={doelFocus} schrijven={schrijven && !pending} voorstel={voorbereiden} />}
    {deel === "Werkdruk" && <ProjectWerkdruk feiten={feiten} namen={namen} />}
    {deel === "Hoe" && <ProjectHoe staat={staat} setData={setData} doelVoorstel={doelFocus} feiten={feiten} ik={ik} personen={namen} schrijven={schrijven && !pending} voorstel={voorbereiden} />}
    {deel === "Wanneer" && <ProjectWanneer doelVoorstel={doelFocus} gesprek={gesprek} feiten={feiten} ik={ik} personen={namen} staat={staat} setData={setData} schrijven={schrijven && !pending} voorstel={voorbereiden} />}
    {deel === "Als" && <ProjectAls doelVoorstel={doelFocus} gesprek={gesprek} feiten={feiten} staat={staat} setData={setData} planning={doel => { setDoelFocus(doel); setDeel("Wanneer"); }} />}
    {deel === "Overzicht" && <>
      {!feiten.some(f=>["actie","besluit","vraag"].includes(f.actie.soort))&&schrijven&&<button disabled={!!pending} className="mb-3 min-h-11 rounded-xl bg-accent px-4 text-white" onClick={()=>{setSoort("actie");setDeel("Voorstel");}}>Begin met een doel</button>}
      <ProjectKompas feiten={feiten} namen={namen} ik={ik} vandaag={werkstand === "Vandaag"} open={(deel, doel) => { setDoelFocus(doel); setDeel(deel); }} />
      <button className="min-h-11 text-accent" aria-expanded={toonFeiten} onClick={()=>setToonFeiten(!toonFeiten)}>Notities, besluiten en acties ({overzicht.length})</button>
      <div hidden={!toonFeiten}>
      <h4 className="font-medium">{werkstand === "Vandaag" ? "Mijn volgende acties" : werkstand === "Ondernemen" ? "Besluiten en projectkennis" : "Samen aan het werk"}</h4>
      {overzicht.map(f => <article key={f.bericht} className="mt-2 rounded-xl bg-vlak p-3">
          <p className="text-xs text-rustig">{f.actie.soort}{isAfgerond(f, feiten) ? " · afgerond" : ""}</p>
          <p className="whitespace-pre-wrap break-words">{f.actie.tekst}</p>
          {f.actie.verantwoordelijke && <p className="text-sm">Voor: {namen.get(f.actie.verantwoordelijke) ?? f.actie.verantwoordelijke}</p>}
          {bronRegel(f)}
          {schrijven && ["actie", "vraag"].includes(f.actie.soort) && !isAfgerond(f, feiten) && (f.afzender === ik || f.actie.verantwoordelijke === ik)
            && <button disabled={!!pending} className="min-h-11 text-accent" onClick={() => voorbereiden(nieuwFeit("afgerond", "Afgerond: " + f.actie.tekst.slice(0, 1400), { soort: "eigen" }, { doel: f.actie.sleutel }))}>Afronden voorbereiden</button>}
          {f.actie.soort === "actie" && !isAfgerond(f, feiten) && staat && setData && <button className="min-h-11 px-3 text-accent" onClick={() => {
            try { setTaakPending({ feit: f, actie: taakVoorstel(f.actie.tekst.slice(0, 160), staat.data.taken) }); } catch { setFout("Deze actie kon niet als taak worden voorbereid."); }
          }}>Als eigen taak voorbereiden</button>}
        </article>)}
      {!feiten.some(f => ["kennis", "besluit", "actie", "vraag"].includes(f.actie.soort)) && <p className="text-sm text-rustig">Nog geen bevestigde projectfeiten. Maak een voorstel of kies een chatbericht als bron.</p>}
      </div>
      {feiten.some(f=>f.actie.soort==="aandacht"&&nu>=Date.parse(f.tijd)&&nu-Date.parse(f.tijd)<5*60_000)&&<h4 className="mt-4 font-medium">Gezamenlijk aandachtspunt</h4>}
      {feiten.filter(f => f.actie.soort === "aandacht" && nu >= Date.parse(f.tijd) && nu - Date.parse(f.tijd) < 5 * 60_000).slice(-3).map(f => <div key={f.bericht}>{f.actie.tekst}{bronRegel(f)}</div>)}
      <details className="mt-3"><summary className="min-h-11 cursor-pointer text-sm text-rustig">Beschikbaarheid van het team</summary>
      <p className="text-xs text-rustig">Een gedeelde werkafspraak voor vier uur, geen online-detectie en geen wijziging van pushmeldingen.</p>
      {actieveLeden.map(id => { const f = [...feiten].reverse().find(f => f.afzender === id && f.actie.soort === "bereikbaar");
        return <p key={id}>{namen.get(id)}: {f && nu >= Date.parse(f.tijd) && nu - Date.parse(f.tijd) < 4 * 3600_000 ? f.actie.keuze : "niet opgegeven"}</p>; })}
      {schrijven && <div className="flex flex-wrap gap-2">{["beschikbaar", "focus", "urgent", "afwezig"].map(keuze => <button className="min-h-11 rounded-xl bg-vlak px-3" key={keuze} disabled={!!pending}
        onClick={() => voorbereiden(nieuwFeit("bereikbaar", `Mijn werkafspraak: ${keuze} (vier uur).`, { soort: "eigen" }, { keuze }))}>{keuze}</button>)}</div>}
      </details>
    </>}
    {deel === "Voorstel" && <form onSubmit={bereid} className="flex flex-col gap-3">
      <label>Soort voorstel<select value={soort} onChange={e => setSoort(e.target.value as Soort)} disabled={!!pending || !schrijven} className="ml-2 min-h-11 bg-vlak p-2">
        {["kennis", "besluit", "actie", "vraag", "aandacht"].map(s => <option key={s} value={s}>{SOORTLABEL[s]??s}</option>)}
      </select></label>
      <label>Projecttekst<textarea rows={4} maxLength={1500} value={tekst} disabled={!!pending || !schrijven} onChange={e => setTekst(e.target.value)} className="mt-1 w-full rounded-xl bg-vlak p-3" /></label>
      <p className="text-sm">Bron: {bronStatus(bron, regels, bestanden)}</p>
      <button type="button" className="min-h-11 text-left text-accent" onClick={() => setBron({ soort: "eigen" })}>Gebruik eigen inbreng als bron</button>
      {soort === "actie" && <><label>Duur in minuten<input type="number" min={5} max={480} step={5} value={minuten} onChange={e => setMinuten(Number(e.target.value))} className="ml-2 min-h-11 w-24 bg-vlak" /></label>
        <label>Verantwoordelijke<select value={wie} onChange={e => setWie(Number(e.target.value))} className="ml-2 min-h-11 bg-vlak"><option value={0}>Nog niet toewijzen</option>{actieveLeden.map(id => <option key={id} value={id}>{namen.get(id)}</option>)}</select></label></>}
      <button disabled={!schrijven || !!pending || !tekst.trim()} className="min-h-11 rounded-xl bg-accent px-3 text-white disabled:opacity-50">Maak controleerbaar projectvoorstel</button>
    </form>}
    {deel === "Wijzigingen" && <>
      <p>{veranderingen.length} bevestigde wijzigingen sinds je laatst gemarkeerde bezoek. Nog niet geladen geschiedenis is niet meegeteld.</p>
      {veranderingen.slice(-50).map(f => <article key={f.bericht} className="border-t border-lijn py-2">{f.soort === "feit"
        ? <><p>{f.feit.actie.soort}: {f.feit.actie.tekst}</p>{bronRegel(f.feit)}</>
        : <><p>Bestandsbericht: {f.titel}</p><p className="text-xs text-rustig">{namen.get(f.afzender) ?? `Deelnemer ${f.afzender}`} · {datum(f.tijd)}</p>
          <button disabled={!bestandOpenen || !bestanden.has(f.bestand)} className="min-h-11 text-accent" onClick={() => bestandOpenen?.(f.bestand)}>Open dit bestand</button></>}
      </article>)}
      <button className="min-h-11 text-accent" onClick={() => { const n = tijdlijn.reduce((max,f) => Math.max(max, f.bericht), gezien); setGezien(n); try { localStorage.setItem(bezoekSleutel, String(n)); } catch { setFout("De bezoekmarkering kon niet op dit apparaat worden bewaard."); } }}>Markeer bijgewerkt tot hier</button>
    </>}
    {deel === "Oefenen" && <>
      <p className="text-sm text-rustig">Alleen een simulatie. Agenda’s, pauzes en andere projecten zijn niet gecontroleerd; er worden geen taken, afspraken of meldingen gemaakt.</p>
      <label>Beschikbare minuten per deelnemer<input type="number" value={capaciteit} min={5} max={480} step={5} className="ml-2 min-h-11 w-24 bg-vlak" onChange={e => { setCapaciteit(Number(e.target.value)); setOefening(null); }} /></label>
      <button className="min-h-11 text-accent" onClick={() => { try { setOefening(oefenplanning(feiten, capaciteit, actieveLeden)); } catch (e) { setFout((e as Error).message); } }}>Verken taakverdeling</button>
      {oefening?.map(o => <p key={o.feit.bericht}>{o.feit.actie.tekst} · {o.minuten} min · {o.wie ? namen.get(o.wie) : "past nog niet / deelnemer ontbreekt"}</p>)}
    </>}
    {deel === "Overdracht" && <>
      <p className="text-sm text-rustig">Exporteert beschikbare bevestigde projectfeiten en bestandsnamen, met bronverwijzingen. Geen AI, geen bestandsteksten, geen automatische verzending.</p>
      <button className="min-h-11 text-accent" onClick={() => download(overdracht(feiten, namen, [...bestanden.values()]), "projectoverdracht.md")}>Download controleerbare overdracht</button>
    </>}
    {deel === "Privacy" && <>
      <p className="text-sm text-rustig">AI-toestemming is persoonlijk, standaard afwezig, maximaal 24 uur geldig en gebonden aan de huidige deelnemers én bekende bronbijdragers. Een gewijzigde samenstelling vereist nieuwe toestemming. In kanalen waarin alleen beheerders schrijven blijft project-AI uit.</p>
      <label>Toestemming voor<select value={toestemmingDoel} onChange={e => setToestemmingDoel(e.target.value)} className="mt-1 min-h-11 w-full bg-vlak">
        <option value={PROJECT_SCOPE}>Bevestigde projectkennis</option>{[...bestanden.values()].map(b => <option key={b.id} value={b.id}>{b.titel}</option>)}
      </select></label>
      <p>Benodigde toestemmingen: {nodig(toestemmingDoel).map(id => namen.get(id) ?? `Deelnemer ${id}`).join(", ") || "deelnemers nog niet bekend"}.</p>
      <label>Mijn nieuwe toestemming geldt<select className="ml-2 min-h-11 bg-vlak p-2" value={geldigMinuten} onChange={e => setGeldigMinuten(Number(e.target.value))}><option value={15}>15 minuten</option><option value={60}>1 uur</option><option value={1440}>24 uur</option></select></label>
      <ul className="rounded-xl bg-vlak p-3">{nodig(toestemmingDoel).map(id => {
        const laatste = [...feiten].reverse().find(f => f.afzender === id && f.actie.soort === "toestemming" && f.actie.doel === toestemmingDoel);
        const einde = laatste ? Date.parse(laatste.tijd) + (laatste.actie.geldigMinuten ?? 1440) * 60_000 : 0;
        const samenstelling = laatste && [...laatste.actie.leden ?? []].sort((a,b)=>a-b).join() === nodig(toestemmingDoel).sort((a,b)=>a-b).join();
        const geldig = samenstelling && Date.parse(laatste!.tijd) <= nu && einde > nu && laatste!.actie.keuze !== "geen";
        return <li key={id}>{namen.get(id) ?? `Deelnemer ${id}`}: {geldig ? `${laatste!.actie.keuze === "titel" ? "alleen titel" : "tekst"} toegestaan tot ${datum(new Date(einde).toISOString())}` : "geen actuele toestemming"}</li>;
      })}</ul>
      {schrijven && ["geen", "titel", "tekst"].map(keuze => <button key={keuze} className="min-h-11 px-3 text-accent" disabled={!!pending}
        onClick={() => voorbereiden(nieuwFeit("toestemming", `Mijn AI-toestemming: ${keuze}.`, { soort: "eigen" }, { doel: toestemmingDoel, keuze, leden: nodig(toestemmingDoel), ...(keuze !== "geen" ? { geldigMinuten } : {}) }))}>
        {keuze === "geen" ? "Toestemming intrekken" : keuze === "titel" ? "Alleen titel toestaan" : "Tekst toestaan"}</button>)}
      {feiten.filter(f => f.actie.soort === "toestemming").slice(-10).map(f => <p key={f.bericht}>{namen.get(f.afzender) ?? f.afzender}: {f.actie.keuze} · {datum(f.tijd)}</p>)}
    </>}
    {deel === "Assistent" && <>
      <p className="text-sm text-rustig">Afzonderlijke Claude-projecthulp zonder tools, geheugen of eerdere gesprekken. Alleen het getoonde voorbeeld wordt verstuurd. Iedere vereiste deelnemer moet daarvoor actueel toestemming geven.</p>
      <label className="block"><input type="checkbox" checked={kennisAan} onChange={e => { setKennisAan(e.target.checked); setAiVoorbeeld(null); }} /> Bevestigde projectkennis meenemen</label>
      <label>Bestand<select value={aiBestand} onChange={e => { setAiBestand(e.target.value); setAiVoorbeeld(null); }} className="ml-2 min-h-11 bg-vlak"><option value="">Geen bestand</option>{[...bestanden.values()].map(b => <option key={b.id} value={b.id}>{b.titel}</option>)}</select></label>
      <button disabled={!aiMogelijk || !staat || privacyPauze} className="min-h-11 text-accent" onClick={() => {
        try { controleerProjectAi(gesprek); const b = bestanden.get(aiBestand); setAiVoorbeeld(privacyVoorbeeld(assistentContext(feiten, b ? [{ id: b.id, titel: b.titel, inhoud: b.inhoud, auteurs: auteurs(b.id), onbekendeHerkomst: b.onbekendeHerkomst }] : [], actieveLeden, kennisAan)).inhoud); setAiAkkoord(false); setFout(""); }
        catch (e) { setFout((e as Error).message); }
      }}>Maak gecontroleerd AI-voorbeeld</button>
      <p className="text-sm text-rustig">Herkenbare e-mailadressen, rekeningnummers en Nederlandse mobiele nummers worden in het AI-voorbeeld afgeschermd. Geheime sleutels blokkeren de aanvraag. Namen, adressen en andere gevoelige tekst worden niet altijd herkend: controleer het voorbeeld zelf. Bronbestanden blijven ongewijzigd.</p>
      {aiVoorbeeld && <div className="rounded-xl bg-vlak p-3"><pre className="max-h-60 overflow-auto whitespace-pre-wrap text-xs">{aiVoorbeeld}</pre>
        <label className="block"><input type="checkbox" checked={aiAkkoord} onChange={e => setAiAkkoord(e.target.checked)} /> Dit voorbeeld mag één keer naar de AI-provider</label>
        <button disabled={!aiAkkoord || bezig || !aiMogelijk || privacyPauze} className="min-h-11 text-accent" onClick={async () => {
          if (!staat || slot.current) return;
          const sessie = huidigeSessie(); slot.current = true; setBezig(true); setFout("");
          try {
            controleerProjectAi(gesprek);
            const vers = await projectRegelsVers(gesprek);
            projectLezen(gesprek, vers.regels);
            // Vernieuwing mag niet stilzwijgend de eerder beoordeelde context vervangen.
            const b = bestanden.get(aiBestand);
            const controle = privacyVoorbeeld(assistentContext(projectFeiten(vers.regels), b ? [{ id: b.id, titel: b.titel, inhoud: b.inhoud,
              auteurs: [...vers.regels.filter(r => r.bericht?.t === "project" && r.bericht.bestand === b.id).map(r => r.afzender), ...b.bronAuteurs], onbekendeHerkomst: b.onbekendeHerkomst }] : [],
              vers.gesprek.leden.filter(l => l.status === "lid").map(l => l.id), kennisAan)).inhoud;
            if (controle !== aiVoorbeeld || huidigeSessie() !== sessie) throw new Error("De context is gewijzigd. Maak een nieuw voorbeeld.");
            const { projectHulp } = await import("../lib/assistent");
            if (huidigeSessie() !== sessie) throw new Error("Account gewijzigd.");
            controleerProjectAi(gesprek);
            const controller = new AbortController(); aiVerzoek.current = controller;
            const uit = await projectHulp(staat.data, controle, controller.signal);
            if (huidigeSessie() === sessie && !aiGepauzeerd(gesprek)) { setAiResultaat(uit); setAiVoorbeeld(null); }
          } catch (e) { if (huidigeSessie() === sessie) setFout(e instanceof Error ? e.message : "De projecthulp is niet bevestigd. Er is niets uitgevoerd."); }
          finally { slot.current = false; setBezig(false); }
        }}>Vraag alleen projectadvies</button>
      </div>}
      {aiResultaat && <div className="whitespace-pre-wrap rounded-xl border border-lijn p-3"><p className="font-medium">AI-voorstel — niet uitgevoerd of gedeeld</p>{aiResultaat}</div>}
    </>}
    {taakPending && <div className="my-3 rounded-xl border border-lijn p-3"><p>Maak een eigen taak van: {taakPending.feit.actie.tekst}. Dit wijzigt geen gedeelde actie.</p>
      <button disabled={bezig} className="min-h-11 text-accent" onClick={async () => {
        if (slot.current || !setData) return;
        slot.current = true; setBezig(true);
        try { const data = await bijwerken(g => { taakUitvoeren(g, taakPending.actie);
          Object.assign(taakResultaat(g, taakPending.actie), { projectbron: { gesprek, bericht: taakPending.feit.bericht } }); });
          setData(data); setTaakPending(null); setMelding("Eigen taak bevestigd opgeslagen, met projectbron.");
        } catch { setFout("Taakopslag niet bevestigd. Dezelfde taakopdracht blijft klaarstaan."); }
        finally { slot.current = false; setBezig(false); }
      }}>Bevestig eigen taak</button>
      <button disabled={bezig} className="min-h-11 px-3" onClick={() => setTaakPending(null)}>Sluiten zonder terugdraaien</button>
    </div>}
  </section>;
}

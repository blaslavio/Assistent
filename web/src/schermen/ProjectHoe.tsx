import { useEffect, useState, type FormEvent } from "react";
import { actueleAanpakken, stapStand, volgendeStappen, type Stap } from "../lib/projectplan";
import { nieuwFeit, type Feit, type ProjectActie } from "../lib/projectregie";

const nieuw = (ik: number, vorige?: string): Stap => ({ id: crypto.randomUUID(), titel: "", klaarAls: "", minuten: 25, eigenaar: ik, alternatief: "", afhankelijkVan: vorige ? [vorige] : [] });
export default function ProjectHoe({ feiten, ik, personen, doelVoorstel, schrijven, voorstel }: {
  feiten: Feit[]; ik: number; personen: Map<number,string>; doelVoorstel?: string; schrijven: boolean; voorstel: (p: ProjectActie) => void;
}) {
  const [doel, setDoel] = useState(doelVoorstel ?? "");
  useEffect(() => { if (doelVoorstel) setDoel(doelVoorstel); }, [doelVoorstel]);
  const [stappen, setStappen] = useState<Stap[]>([nieuw(ik)]);
  const [vervangt, setVervangt] = useState<string | undefined>();
  const [uiterlijk, setUiterlijk] = useState<string | undefined>();
  const [fout, setFout] = useState("");
  const [uitleg, setUitleg] = useState("");
  const wortels = feiten.filter(f => ["actie", "besluit", "vraag"].includes(f.actie.soort));
  const root = wortels.find(f => f.actie.sleutel === doel);
  const plannen = actueleAanpakken(doel, feiten);
  const wijzig = (i: number, p: Partial<Stap>) => setStappen(oud => oud.map((s,j) => i === j ? { ...s,...p } : s));
  function bereid(e: FormEvent) {
    e.preventDefault(); if (!root) return;
    try { voorstel(nieuwFeit("aanpak", "Aanpak voor: " + root.actie.tekst.slice(0, 1400), root.actie.bron,
      { doel, stappen, ...(vervangt ? { vervangt } : {}), ...(uiterlijk ? { uiterlijk } : {}) })); setFout(""); }
    catch (e) { setFout((e as Error).message); }
  }
  return <section aria-label="Hoe voeren we het uit" className="flex flex-col gap-3">
    <p className="text-sm text-rustig">Een aanpak blijft gekoppeld aan het oorspronkelijke waarom. Elke stap heeft een resultaatcriterium, duur en verantwoordelijke. Een vastgelopen stap kan een nieuwe aanpak krijgen; de eerdere versie blijft bewaard.</p>
    <label>Waarom / projectdoel<select className="mt-1 min-h-11 w-full bg-vlak p-2" value={doel} onChange={e => { setDoel(e.target.value); setVervangt(undefined); setUiterlijk(undefined); setStappen([nieuw(ik)]); }}>
      <option value="">Kies een bevestigd besluit, actie of vraag</option>{wortels.map(f => <option key={f.actie.sleutel} value={f.actie.sleutel}>{f.actie.soort}: {f.actie.tekst.slice(0,100)}</option>)}
    </select></label>
    {fout && <p role="alert">{fout}</p>}
    {plannen.length > 1 && <p role="alert">Er zijn meerdere gelijktijdige aanpakken. Ze worden naast elkaar getoond, niet stilzwijgend overschreven.</p>}
    {plannen.map(plan => <article key={plan.actie.sleutel} className="rounded-xl border border-lijn p-3">
      <h4 className="font-medium">Aanpak van {personen.get(plan.afzender) ?? `deelnemer ${plan.afzender}`} · bron #{plan.bericht}</h4>
      {volgendeStappen(plan, feiten).map(({ stap, status, wachtOp }) => <div key={stap.id} className="mt-3 border-t border-lijn pt-2">
        <p className="font-medium">{stap.titel} · {status.replace("_"," ")}</p><p className="text-sm">Klaar als: {stap.klaarAls}</p>
        <p className="text-sm text-rustig">{stap.minuten} minuten · {stap.eigenaar ? personen.get(stap.eigenaar) ?? "voormalige deelnemer" : "nog niet toegewezen"}</p>
        {wachtOp.length > 0 && <p className="text-sm">Wacht op: {wachtOp.map(id => plan.actie.stappen?.find(s => s.id === id)?.titel ?? "ontbrekende stap").join(", ")}</p>}
        {status === "vast" && <p className="text-sm">Obstakel: {stapStand(plan, stap, feiten)?.actie.tekst}. Alternatief: {stap.alternatief || "bespreek een nieuwe aanpak"}.</p>}
        {schrijven && (plan.afzender === ik || stap.eigenaar === ik) && <div className="flex flex-wrap gap-2">
          {["bezig", "klaar", "vast", "te_doen"].map(keuze => <button key={keuze} className="min-h-11 px-2 text-accent" disabled={keuze === "bezig" && wachtOp.length > 0}
            onClick={() => {
              if (keuze === "klaar" && wachtOp.length) { setFout("Bevestig eerst de voorgangers of maak een andere aanpak."); return; }
              if (keuze === "vast" && !uitleg.trim()) { setFout("Beschrijf eerst kort het obstakel."); return; }
              voorstel(nieuwFeit("stapstatus", keuze === "vast" ? uitleg : `${stap.titel}: ${keuze}. Resultaatcriterium: ${stap.klaarAls}`,
                { soort: "eigen" }, { doel: plan.actie.sleutel, stap: stap.id, keuze }));
            }}>{keuze === "klaar" ? "Resultaat zelf bevestigen" : keuze === "vast" ? "Obstakel melden" : keuze === "te_doen" ? "Opnieuw te doen" : "Start voorbereiden"}</button>)}
        </div>}
      </div>)}
      {schrijven && <button className="min-h-11 text-accent" onClick={() => { setVervangt(plan.actie.sleutel); setUiterlijk(plan.actie.uiterlijk); setStappen(structuredClone(plan.actie.stappen ?? [])); }}>Nieuwe / alternatieve aanpak voorbereiden</button>}
    </article>)}
    <label>Obstakel of hulpvraag<textarea value={uitleg} onChange={e => setUitleg(e.target.value)} maxLength={1000} className="mt-1 w-full rounded-xl bg-vlak p-2" /></label>
    {root && <form onSubmit={bereid} className="flex flex-col gap-3 rounded-xl bg-vlak p-3">
      <h4 className="font-medium">{vervangt ? "Nieuwe versie van de aanpak" : "Maak een uitvoerbare aanpak"}</h4>
      {uiterlijk && <p className="text-sm">Bestaande deadline blijft behouden: {new Date(uiterlijk).toLocaleString("nl-NL", { timeZone:"Europe/Amsterdam" })}. Pas die aan onder Wanneer.</p>}
      {stappen.map((s,i) => <fieldset key={s.id} className="rounded-xl border border-lijn p-3">
        <legend>Stap {i+1}</legend>
        <label className="block">Wat doe je?<input value={s.titel} maxLength={160} required onChange={e => wijzig(i,{ titel:e.target.value })} className="mt-1 min-h-11 w-full bg-white p-2 dark:bg-black" /></label>
        <label className="block">Hoe controleer je het resultaat?<input value={s.klaarAls} maxLength={300} required onChange={e => wijzig(i,{ klaarAls:e.target.value })} className="mt-1 min-h-11 w-full bg-white p-2 dark:bg-black" /></label>
        <label>Duur (minuten)<input type="number" min={5} max={480} step={5} value={s.minuten} onChange={e => wijzig(i,{ minuten:Number(e.target.value) })} className="ml-2 min-h-11 w-20 bg-white dark:bg-black" /></label>
        <label className="block">Wie?<select value={s.eigenaar ?? 0} onChange={e => wijzig(i,{ eigenaar:Number(e.target.value) || undefined })} className="ml-2 min-h-11 bg-white p-2 dark:bg-black"><option value={0}>Nog niet toewijzen</option>{[...personen].map(([id,naam]) => <option key={id} value={id}>{naam}</option>)}{s.eigenaar && !personen.has(s.eigenaar) && <option value={s.eigenaar}>Voormalige deelnemer {s.eigenaar}</option>}</select></label>
        <label className="block">Als dit niet lukt<input value={s.alternatief} maxLength={300} onChange={e => wijzig(i,{ alternatief:e.target.value })} placeholder="Een concrete alternatieve route" className="mt-1 min-h-11 w-full bg-white p-2 dark:bg-black" /></label>
        {i > 0 && <label><input type="checkbox" checked={s.afhankelijkVan.includes(stappen[i-1].id)} onChange={e => wijzig(i,{ afhankelijkVan:e.target.checked ? [stappen[i-1].id] : [] })} /> Volgt na de vorige stap</label>}
      </fieldset>)}
      <div className="flex flex-wrap gap-2"><button type="button" className="min-h-11 text-accent" disabled={stappen.length >= 12} onClick={() => setStappen(oud => [...oud, nieuw(ik,oud.at(-1)?.id)])}>Stap toevoegen</button>
        <button type="button" disabled={stappen.length <= 1} className="min-h-11 text-accent" onClick={() => setStappen(oud => oud.slice(0,-1))}>Laatste stap verwijderen</button></div>
      <button disabled={!schrijven} className="min-h-11 rounded-xl bg-accent px-3 text-white">Controleer de hele aanpak</button>
    </form>}
  </section>;
}

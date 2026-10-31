import { lazy, Suspense, useEffect, useRef, useState, type FormEvent } from "react";
import { bijwerken, huidigeSessie, type Gegevens } from "../api";
import type { Staat } from "../App";
import { kaartBestemmingOpenen } from "../lib/naar";
import { bewaren, botsingen, centen, controleer, euro, inAgenda, kosten, plannen, reisbrief, verwijderen, VOORBEREIDING, agendaStand, vertrekKompas, reisVandaag, reisDatum, type Vakantie } from "../lib/vakantie";
const Verblijven = lazy(() => import("./Verblijven"));
const veld = "min-h-12 w-full rounded-xl bg-vlak px-3 py-2";
const knop = "min-h-11 rounded-full bg-vlak px-4 py-2 text-accent disabled:opacity-50";
export default function Vakanties({ staat, setStaat, openAgenda }: { staat: Staat; setStaat: (s: Staat) => void; openAgenda?: (datum: string) => void }) {
  const [vandaag,setVandaag] = useState(reisVandaag);
  useEffect(() => {
    const ververs = () => { if (!document.hidden) setVandaag(reisVandaag()); };
    const klok = setInterval(ververs,60000); window.addEventListener("focus",ververs); document.addEventListener("visibilitychange",ververs);
    return () => { clearInterval(klok); window.removeEventListener("focus",ververs); document.removeEventListener("visibilitychange",ververs); };
  }, []);
  const [deel, setDeel] = useState<"plannen" | "verblijven">("plannen");
  const [bewerk, setBewerk] = useState<Vakantie | null>(null);
  const formulier = useRef<HTMLFormElement>(null);
  useEffect(() => { if (bewerk) formulier.current?.querySelector("input")?.focus(); }, [bewerk]);
  const [zoekstart, setZoekstart] = useState<Vakantie | null>(null);
  const [voorstel, setVoorstel] = useState<Vakantie | null>(null), [weg, setWeg] = useState<Vakantie | null>(null);
  const [fout, setFout] = useState(""), [bericht, setBericht] = useState("");
  const [bezig, setBezig] = useState(false), slot = useRef(false);
  let lijst: Vakantie[] = [], leesfout = "";
  try { lijst = plannen(staat.data); } catch { leesfout = "Je vakantieplannen zijn niet leesbaar. Vernieuw de app; je gegevens worden niet overschreven."; }
  async function wijzig(doe: (g: Gegevens) => void, tekst: string) {
    if (slot.current) return;
    slot.current = true; setBezig(true); setFout(""); setBericht(""); const sessie = huidigeSessie();
    try { const data = await bijwerken(doe); if (huidigeSessie() !== sessie) return; setStaat({ ...staat, data }); setBericht(tekst); setVoorstel(null); setWeg(null); setBewerk(null); }
    catch (e) { if (huidigeSessie() === sessie) setFout((e instanceof Error ? e.message : "Opslaan lukt niet.") + " De opdracht blijft klaarstaan; controleer de stand voordat je opnieuw probeert."); }
    finally { slot.current = false; setBezig(false); }
  }
  function voorbereiden(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const f = new FormData(e.currentTarget);
    try {
      setVoorstel(controleer({ id: bewerk?.id ?? crypto.randomUUID(), titel: String(f.get("titel")), plaats: String(f.get("plaats")),
        van: String(f.get("van")), tot: String(f.get("tot")), personen: Number(f.get("personen")),
        budget: centen(String(f.get("budget"))), verblijf: centen(String(f.get("verblijf"))), vervoer: centen(String(f.get("vervoer"))), perDag: centen(String(f.get("dag"))), checklist: bewerk?.checklist ?? [] }));
      setFout(""); setBericht("");
    } catch (e) { setFout(e instanceof Error ? e.message : "Controleer je invoer."); }
  }
  return <section aria-label="Vakantie en verblijf" className="flex flex-col gap-5 px-6 pb-8">
    <p className="text-rustig">Van reisidee tot voorbereiding. Je privéplan blijft los van reserveringen: alleen de verhuurder kan een aanvraag bevestigen.</p>
    <nav aria-label="Vakantieonderdelen" className="flex gap-2">
      <button className={knop} aria-current={deel === "plannen" ? "page" : undefined} onClick={() => setDeel("plannen")}>Mijn reisplannen</button>
      <button className={knop} aria-current={deel === "verblijven" ? "page" : undefined} onClick={() => setDeel("verblijven")}>Verblijven en verhuur</button>
    </nav>
    {deel === "verblijven" ? <Suspense fallback={<p role="status">Verblijven laden…</p>}><Verblijven key={staat.gebruiker.id} start={zoekstart} /></Suspense> : <>
      {(fout || leesfout) && <p role="alert">{fout || leesfout}</p>}{bericht && <p role="status">{bericht}</p>}
      {voorstel && <section aria-label="Controleer je vakantieplan" className="rounded-2xl border border-lijn p-4">
        <h2 className="font-semibold">Controleer je vakantieplan</h2><p>{voorstel.titel} · {voorstel.plaats}</p><p>{voorstel.van} t/m {voorstel.tot} · {kosten(voorstel).nachten} nachten</p>
        <p>Begroting {euro(kosten(voorstel).totaal)} · {voorstel.personen} reizigers</p>
        <p className="text-sm text-rustig">Dagbudget geldt per reiziger, ook op de heen- en terugreisdag. Dit maakt geen boeking. Bij opslaan schuift een eerder door dit plan gemaakte agenda-afspraak mee, als je die niet zelf hebt aangepast. Eigen aanpassingen blijven behouden.</p>
        <button className={knop} disabled={bezig} onClick={() => wijzig(g => bewaren(g, voorstel, bewerk ?? undefined), "Privévakantieplan opgeslagen.")}>Plan bewaren</button>
        <button className={knop} disabled={bezig} onClick={() => setVoorstel(null)}>Sluiten zonder terugdraaien</button>
      </section>}
      {!leesfout && <details key={bewerk?.id ?? "nieuw"} open={bewerk ? true : undefined} className="rounded-2xl bg-vlak/40 p-4"><summary className="min-h-11 cursor-pointer font-semibold">{bewerk ? "Vakantieplan bijstellen" : "Nieuwe vakantie plannen"}</summary>
        <form ref={formulier} onSubmit={voorbereiden} className="mt-3 grid gap-3 sm:grid-cols-2">
          {[["titel", "Naam van je vakantie", "text"], ["plaats", "Bestemming (plaats en land)", "text"], ["van", "Aankomst", "date"], ["tot", "Vertrek / terugreisdag", "date"]].map(([name, label, type]) => <label key={name}>{label}<input required name={name} type={type} defaultValue={bewerk?.[name as "titel" | "plaats" | "van" | "tot"] ?? ""} maxLength={name === "titel" ? 100 : 160} className={veld} /></label>)}
          <label>Reizigers<input required name="personen" type="number" min="1" max="30" defaultValue={bewerk?.personen ?? 2} className={veld}/></label>
          {[["budget", "Totaalbudget (€; 0 = nog niet bepaald)"], ["verblijf", "Verblijf totaal (€)"], ["vervoer", "Vervoer totaal (€)"], ["dag", "Dagbudget per persoon (€)"]].map(([name,label]) => <label key={name}>{label}<input name={name} required inputMode="decimal" defaultValue={bewerk ? (({budget:bewerk.budget,verblijf:bewerk.verblijf,vervoer:bewerk.vervoer,dag:bewerk.perDag}[name] ?? 0)/100).toFixed(2) : "0"} className={veld}/></label>)}
          <button className={knop} disabled={bezig || !!voorstel}>Plan controleren</button>
        </form></details>}
      {!leesfout && !lijst.length && <p>Je hebt nog geen vakantieplan. Begin met bestemming, datums en je eigen begroting.</p>}
      {lijst.map(v => { const k = kosten(v), bots = botsingen(staat.data.afspraken, v), kompas = vertrekKompas(v,staat.data.afspraken,vandaag), agenda = agendaStand(staat.data.afspraken,v); return <article key={v.id} className="flex flex-col gap-3 rounded-2xl border border-lijn p-4">
        <h2 className="text-lg font-semibold">{v.titel}</h2><p>{v.plaats} · {reisDatum(v.van)} t/m {reisDatum(v.tot)}</p>
        <section aria-label={`Volgende stap voor ${v.titel}`} className="rounded-xl bg-vlak p-3">
          <p className="text-sm font-semibold">{kompas.fase}</p><p className="mt-1 text-sm">{kompas.stap}</p>
          <p className="mt-2 text-xs text-rustig">{kompas.gedaan} van {VOORBEREIDING.length} voorbereidingen afgevinkt · geen boekingsbevestiging</p>
        </section>
        <p>{k.nachten} nachten · {v.personen} reizigers · begroting {euro(k.totaal)}</p>
        <p className="text-sm text-rustig">{v.budget ? k.verschil < 0 ? `${euro(-k.verschil)} boven je budget` : `${euro(k.verschil)} ruimte binnen je budget` : "Totaalbudget nog niet bepaald"}. Eigen schatting, geen actuele prijsopgave.</p>
        {!!bots.length && <details><summary className="min-h-11 cursor-pointer py-2">Controleer {bots.length} mogelijk overlappende agenda-items</summary><ul>{bots.map(a => <li key={a.id}>{a.titel} · {a.start.slice(0,10)}</li>)}</ul></details>}
        <details><summary className="min-h-11 cursor-pointer py-2">Voorbereidingen</summary>{VOORBEREIDING.map(t => <label key={t} className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={v.checklist.includes(t)} disabled={bezig} onChange={() => wijzig(g => {
          const actueel = plannen(g).find(p => p.id === v.id); if (!actueel) throw new Error("Plan bestaat niet meer.");
          const was = v.checklist.includes(t); if (actueel.checklist.includes(t) === !was) return;
          actueel.checklist = was ? actueel.checklist.filter(x => x !== t) : [...actueel.checklist, t];
          g.vakanties = plannen(g).map(p => p.id === v.id ? actueel : p);
        }, "Voorbereiding bijgewerkt.")}/>{t}</label>)}</details>
        <button className={knop} onClick={() => { setZoekstart(v); setDeel("verblijven"); }}>Verblijf voor deze reis zoeken</button>
        <details><summary className="min-h-11 cursor-pointer py-2">Plan bijstellen, kaart en agenda</summary><div className="flex flex-wrap gap-2">
          <button className={knop} disabled={bezig || !!voorstel} onClick={() => { setBewerk(v); setVoorstel(null); }}>Plan bijstellen</button>
          <button className={knop} onClick={() => kaartBestemmingOpenen(v.plaats,{bron:"vakantie",titel:v.titel})}>Bestemming op kaart</button>
          {agenda === "ontbreekt" && <button className={knop} disabled={bezig} onClick={() => wijzig(g => inAgenda(g,v), "Vakantie in de agenda gezet, inclusief terugreisdag. Er is niets gereserveerd.")}>Bevestig: in mijn agenda zetten</button>}
          {agenda !== "ontbreekt" && <p className="text-sm text-rustig">{agenda === "actueel" ? "Je agenda loopt gelijk met dit plan." : "Je agenda-afspraak is apart aangepast. Controleer die vóór vertrek."}</p>}
          {openAgenda && <button className={knop} onClick={() => openAgenda(v.van)}>Bekijk deze dagen in mijn agenda</button>}
          <button className={knop} disabled={bezig} onClick={() => setWeg(v)}>Plan verwijderen</button>
        </div></details>
        <details><summary className="min-h-11 cursor-pointer py-2">Reisbrief bekijken en kopiëren</summary><p className="text-sm text-rustig">Bevat bestemming, datums, reizigers en begroting. Controleer vóór je deelt; er wordt niets automatisch verzonden.</p>
          <textarea readOnly aria-label={`Reisbrief ${v.titel}`} value={reisbrief(v)} className={`${veld} min-h-40`}/>
          <button className={knop} onClick={async () => { try { await navigator.clipboard.writeText(reisbrief(v)); setBericht("Reisbrief gekopieerd."); } catch { setFout("Kopiëren lukt niet. Selecteer de tekst om zelf te kopiëren."); } }}>Kopieer gecontroleerde reisbrief</button>
        </details>
      </article>; })}
      {weg && <section aria-label="Vakantieplan verwijderen" className="rounded-2xl border border-lijn p-4"><h2>Plan {weg.titel} verwijderen?</h2><p>Een agenda-afspraak blijft behouden. Een reservering wordt hiermee niet geannuleerd.</p>
        <button className={knop} disabled={bezig} onClick={() => wijzig(g => verwijderen(g,weg), "Vakantieplan verwijderd. Agenda en reserveringen blijven behouden.")}>Verwijderen bevestigen</button>
        <button className={knop} disabled={bezig} onClick={() => setWeg(null)}>Annuleren</button></section>}
    </>}
  </section>;
}

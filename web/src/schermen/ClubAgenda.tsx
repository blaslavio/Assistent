import { studioOpenen } from "../lib/naar";
import { kaartBestemmingOpenen } from "../lib/naar";
import { evenementBekijken, evenementLink } from "../lib/evenementen";
// Agenda in een community: trainingen, wedstrijden en uitjes. Met één tik zeg je of je komt; afmelden (ziek,
// blessure, vakantie) zet je in één keer af voor alles in die periode en zet het ook in je eigen agenda.
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { bijwerken, type Gegevens } from "../api";
import type { Community } from "../lib/chat";
import { REDENEN, SOORTEN, afwezigMelden, agenda, antwoorden, beterMelden, bewaren, inMijnAgenda, lokaal, mijnAntwoord,
  mijnAfwezig, redenTekst, ritten, selectie, taak, telling, totAanpassen, vervoer, weg, type Activiteit, type Antwoord,
  type ClubAgenda as Agenda, type MijnAfwezig, type Nieuw, type Soort } from "../lib/club";
import { dagTitel, datumTekst, plusDagen, uur } from "../lib/tijd";
import { Kalender, Plus } from "../iconen";
import { Onderblad } from "./Onderblad";
import { Schakelaar } from "./instellingen-ui";

const veld = "h-12 rounded-2xl bg-vlak px-4 outline-none placeholder:text-zacht";
const knop = "h-12 rounded-2xl bg-accent px-5 font-medium text-white disabled:opacity-30";
const pil = (aan: boolean) => `flex h-9 shrink-0 items-center rounded-full px-3.5 text-sm ${aan ? "bg-accent font-medium text-white" : "bg-vlak text-rustig"}`;
const fout = (e: unknown) => (e instanceof Error ? e.message : "Dat lukte niet. Probeer het zo opnieuw.");
const dag = (iso: string) => new Date(iso);
const kort = (d: string) => new Date(`${d}T12:00`).toLocaleDateString("nl-NL", { weekday: "short", day: "numeric", month: "short" });
const TAKEN = ["Rijden", "Bardienst", "Shirts wassen", "Fluiten", "Ballen meenemen", "Fruit", "Opbouwen", "Opruimen"];

type Props = { c: Community; bijgewerkt?: (g: Gegevens) => void; beginSoort?: Soort; evenement?: number };

export function ClubAgenda({ c, bijgewerkt, beginSoort = "training", evenement }: Props) {
  const [data, setData] = useState<Agenda | null>(null);
  const [mijn, setMijn] = useState<MijnAfwezig[]>([]);
  const [melding, setMelding] = useState("");
  const [probleem, setProbleem] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  const [maken, setMaken] = useState<Activiteit | "nieuw" | null>(null);
  const [paginaEvent, setPaginaEvent] = useState<Activiteit | null>(null);
  useEffect(() => {
    let actief = true;
    if (evenement) evenementBekijken(c.id, evenement).then(a => { if (actief) { setPaginaEvent(a); setOpen(a.id); } })
      .catch(() => { if (actief) setProbleem("Deze evenementpagina is niet beschikbaar of is verwijderd."); });
    return () => { actief = false; };
  }, [c.id, evenement]);
  const [afmelden, setAfmelden] = useState(false);
  const beheer = c.rol === "eigenaar" || c.rol === "beheerder";

  const laden = useCallback(async () => {
    try {
      const [a, m] = await Promise.all([agenda(c.id), mijnAfwezig()]);
      setData(a);
      setMijn(m.filter((x) => x.communities.some((y) => y.id === c.id)));
      setProbleem("");
    } catch (e) {
      setProbleem(fout(e));
    }
  }, [c.id]);
  useEffect(() => { laden();const vernieuw=(e:Event)=>{if((e as CustomEvent).detail?.groep===c.id)void laden();};window.addEventListener("studio-evenement-gewijzigd",vernieuw);return()=>window.removeEventListener("studio-evenement-gewijzigd",vernieuw); }, [laden,c.id]);

  async function doe(actie: () => Promise<unknown>, gelukt = "") {
    setProbleem("");
    try {
      await actie();
      if (gelukt) setMelding(gelukt);
      if (evenement) { try { setPaginaEvent(await evenementBekijken(c.id, evenement)); } catch { setPaginaEvent(null); } }
      await laden();
    } catch (e) {
      setProbleem(fout(e));
    }
  }

  const gekozen = data?.activiteiten.find((a) => a.id === open) ?? (paginaEvent?.id === open ? paginaEvent : null);
  const anderen = (data?.afwezig ?? []).filter((x) => !x.van_mij);
  const perDag = new Map<string, Activiteit[]>();
  for (const a of data?.activiteiten ?? []) {
    if (dag(a.einde ?? a.start).getTime() < Date.now() - 3 * 3_600_000) continue;
    const d = datumTekst(dag(a.start));
    perDag.set(d, [...(perDag.get(d) ?? []), a]);
  }

  return (
    <div className="flex flex-col gap-4 px-6 pb-8">
      {mijn.map((m) => <MijnMelding key={m.id} m={m} doe={doe} bijgewerkt={bijgewerkt} />)}
      <div className="flex gap-2">
        {mijn.length === 0 && (
          <button onClick={() => setAfmelden(true)} className="h-11 flex-1 rounded-2xl bg-vlak text-[15px] font-medium">Afmelden</button>
        )}
        <button onClick={() => setMaken("nieuw")} className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-2xl bg-accent/10 text-[15px] font-medium text-accent dark:text-accent-donker">
          <Plus className="size-4" /> {beginSoort === "evenement" ? "Evenement organiseren" : "Nieuw"}
        </button>
      </div>
      {melding && <p role="status" className="rounded-2xl bg-vlak px-4 py-3 text-[15px]">{melding}</p>}
      {probleem && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{probleem}</p>}
      {anderen.length > 0 && (
        <p className="text-[14px] text-rustig">
          Afwezig: {anderen.map((x) => `${x.naam}${x.soort !== "afwezig" ? ` (${redenTekst(x.soort).toLowerCase()})` : ""}${x.tot ? ` t/m ${kort(x.tot)}` : ""}`).join(", ")}
        </p>
      )}
      {data === null && !probleem && <p className="bezig-tekst py-6 text-[15px] text-rustig">Laden</p>}
      {data && perDag.size === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-2xl bg-vlak px-6 py-8 text-center">
          <Kalender className="size-8 text-zacht" />
          <p className="font-medium">Nog niets gepland</p>
          <p className="text-sm text-rustig">Zet een training, wedstrijd of uitje erin. Iedereen ziet het en zegt met één tik of hij komt.</p>
        </div>
      )}
      {[...perDag].map(([d, lijst]) => (
        <section key={d} className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-rustig">{dagTitel(new Date(`${d}T12:00`))}</h2>
          {lijst.map((a) => <Kaart key={a.id} a={a} open={() => setOpen(a.id)} doe={doe} />)}
        </section>
      ))}
      {gekozen && <Details a={gekozen} c={c} beheer={beheer} sluit={() => setOpen(null)} doe={doe}
        bewerk={() => { setMaken(gekozen); setOpen(null); }} bijgewerkt={bijgewerkt} />}
      {maken && <Maken c={c} beginSoort={beginSoort} oud={maken === "nieuw" ? null : maken} sluit={() => setMaken(null)}
        klaar={(t) => { setMaken(null); setMelding(t); laden(); }} />}
      {afmelden && <Afmelden c={c} sluit={() => setAfmelden(false)}
        klaar={(t, g) => { setAfmelden(false); setMelding(t); bijgewerkt?.(g); laden(); }} />}
    </div>
  );
}

function tijden(a: Activiteit) {
  if (a.afgelast) return "Afgelast";
  const t = `${uur(lokaal(a.start))}${a.einde ? `–${uur(lokaal(a.einde))}` : ""}`;
  return a.verzamelen ? `Verzamelen ${uur(lokaal(a.verzamelen))}, begin ${t}` : t;
}
function onderTitel(a: Activiteit) {
  const soort = SOORTEN.find(([k]) => k === a.soort)?.[1] ?? "";
  const tegen = a.soort === "wedstrijd" && a.tegenstander ? `${a.thuis === false ? "Uit" : a.thuis ? "Thuis" : ""} tegen ${a.tegenstander}`.trim() : "";
  return [soort === a.titel ? "" : soort, tegen, a.plaats].filter(Boolean).join(" · ");
}

function Kaart({ a, open, doe }: { a: Activiteit; open: () => void; doe: (f: () => Promise<unknown>, t?: string) => void }) {
  const ik = mijnAntwoord(a);
  const t = telling(a);
  const [reden, setReden] = useState(false);
  return (
    <div className={`flex flex-col gap-3 rounded-2xl border border-lijn p-4 ${a.afgelast ? "opacity-60" : ""}`}>
      <button onClick={open} className="flex flex-col items-start gap-0.5 text-left">
        <span className="text-[13px] text-rustig">{tijden(a)}</span>
        <span className={`text-[17px] font-semibold ${a.afgelast ? "line-through" : ""}`}>{a.titel}</span>
        <span className="text-[13px] text-rustig">{onderTitel(a)}</span>
        {a.uitslag && <span className="text-[13px] font-medium">Uitslag {a.uitslag}</span>}
        <span className="mt-1 text-[13px] text-zacht">{t.ja} komen · {t.nee} niet · {t.open + t.misschien} nog niet zeker</span>
      </button>
      {!a.afgelast && (
        <div className="flex gap-2">
          {([["ja", "Ik kom"], ["misschien", "Misschien"], ["nee", "Kan niet"]] as [Antwoord, string][]).map(([k, label]) => (
            <button key={k} aria-pressed={ik?.antwoord === k}
              onClick={() => (k === "nee" ? setReden(true) : doe(() => antwoorden(a.id, ik?.antwoord === k ? null : k)))}
              className={`h-9 flex-1 rounded-full text-sm ${ik?.antwoord === k ? (k === "nee" ? "bg-inkt font-medium text-white dark:text-black" : "bg-accent font-medium text-white") : "bg-vlak text-rustig"}`}>
              {ik?.antwoord === "nee" && k === "nee" && ik.reden ? redenTekst(ik.reden) : label}
            </button>
          ))}
        </div>
      )}
      {reden && (
        <div className="flex flex-wrap gap-2">
          {REDENEN.map(([k, label]) => (
            <button key={k} onClick={() => { setReden(false); doe(() => antwoorden(a.id, "nee", k)); }} className={pil(false)}>{label}</button>
          ))}
          <button onClick={() => setReden(false)} className="h-9 px-2 text-sm text-zacht">Annuleer</button>
        </div>
      )}
    </div>
  );
}

function Details({ a, c, beheer, sluit, doe, bewerk, bijgewerkt }: { a: Activiteit; c: Community; beheer: boolean; sluit: () => void;
  doe: (f: () => Promise<unknown>, t?: string) => Promise<void>; bewerk: () => void; bijgewerkt?: (g: Gegevens) => void }) {
  const ik = mijnAntwoord(a);
  const r = ritten(a);
  const mijnRit = a.vervoer.find((v) => v.id === ik?.id);
  const [plaatsen, setPlaatsen] = useState(mijnRit?.plaatsen || 3);
  const [zeker, setZeker] = useState(false);
  const [tekst, setTekst] = useState("");
  const [verwijderBezig, setVerwijderBezig] = useState(false);
  const groepen: [string, typeof a.antwoorden][] = [["Komen", a.antwoorden.filter((l) => l.antwoord === "ja")],
    ["Misschien", a.antwoorden.filter((l) => l.antwoord === "misschien")], ["Kunnen niet", a.antwoorden.filter((l) => l.antwoord === "nee")],
    ["Nog geen antwoord", a.antwoorden.filter((l) => !l.antwoord)]];
  const geselecteerd = a.antwoorden.filter((l) => l.selectie).length;

  async function agenda() {
    const g = await bijwerken((x) => { inMijnAgenda(x, a, c.naam); });
    bijgewerkt?.(g);
    setTekst("Staat in je agenda.");
  }

  return (
    <Onderblad titel={a.titel} sluit={sluit}>
      <p className="-mt-3 text-[15px] text-rustig">{dagTitel(dag(a.start))}, {tijden(a)}{a.einde && datumTekst(dag(a.start)) !== datumTekst(dag(a.einde)) ? ` · tot ${dagTitel(dag(a.einde))}` : ""}<br />{onderTitel(a)}</p>
      {a.einde && Date.parse(a.einde) < Date.now() && <p className="text-sm text-rustig">Dit evenement is afgelopen.</p>}
      {a.notitie && <p className="whitespace-pre-wrap text-[15px]">{a.notitie}</p>}
      {a.uitslag && <p className="font-medium">Uitslag {a.uitslag}</p>}
      <div className="flex flex-wrap gap-2">
        <button onClick={agenda} className={pil(false)}>In mijn agenda</button>
        {a.plaats?.trim()&&<button className={pil(false)} onClick={()=>{kaartBestemmingOpenen(a.plaats!,{bron:"evenement",titel:a.titel});sluit();}}>Locatie op kaart</button>}
        <button onClick={()=>studioOpenen({tool:"tickets",groep:c.id,evenement:a.id})} className={pil(false)}>Tickets en toegang</button>
        <button onClick={async () => { try { const url = evenementLink(c.id, a.id); if (navigator.share) await navigator.share({ title: a.titel, url }); else { await navigator.clipboard.writeText(url); setTekst("Link naar evenementpagina gekopieerd. Alleen groepsleden kunnen deze openen."); } } catch { setTekst("Delen lukte niet. Probeer het opnieuw."); } }} className={pil(false)}>Deel evenementpagina</button>
        {a.mag_bewerken && <button onClick={bewerk} className={pil(false)}>Aanpassen</button>}
        {a.mag_bewerken && <button onClick={() => setZeker(true)} className={pil(false)}>Weghalen</button>}
      </div>
      {tekst && <p role="status" className="text-sm text-rustig">{tekst}</p>}
      {zeker && (
        <div className="flex flex-col gap-2 rounded-2xl bg-vlak p-3">
          <p className="text-sm">Weghalen voor iedereen?</p>
          <div className="flex flex-wrap gap-2">
            <button disabled={verwijderBezig} onClick={async () => { setVerwijderBezig(true); try { await weg(a.id); await doe(async () => {}, "Evenement verwijderd."); sluit(); } catch { setTekst("Verwijderen lukte niet. Het evenement is nog niet als verwijderd bevestigd."); } finally { setVerwijderBezig(false); } }} className="h-9 rounded-full bg-red-600 px-4 text-sm font-medium text-white">Alleen deze</button>
            {a.reeks && <button disabled={verwijderBezig} onClick={async () => { setVerwijderBezig(true); try { await weg(a.id, true); await doe(async () => {}, "Reeks verwijderd."); sluit(); } catch { setTekst("Verwijderen lukte niet. Probeer opnieuw."); } finally { setVerwijderBezig(false); } }} className="h-9 rounded-full bg-red-600 px-4 text-sm font-medium text-white">Deze en de volgende</button>}
            <button onClick={() => setZeker(false)} className="h-9 px-3 text-sm">Toch niet</button>
          </div>
        </div>
      )}

      {a.taken.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-rustig">Taken</h3>
          <ul className="flex flex-col divide-y divide-lijn rounded-2xl bg-vlak">
            {a.taken.map((t) => {
              const mijne = t.wie.some((w) => w.id === ik?.id);
              const vol = t.wie.length >= t.plekken;
              return (
                <li key={t.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="font-medium">{t.naam}</span>
                    <span className="truncate text-[13px] text-rustig">{t.wie.length ? t.wie.map((w) => w.naam).join(", ") : "Nog niemand"}</span>
                  </span>
                  {(mijne || !vol) && (
                    <button onClick={() => doe(() => taak(t.id, !mijne))}
                      className={`h-8 rounded-full px-3 text-sm ${mijne ? "text-rustig" : "bg-accent font-medium text-white"}`}>
                      {mijne ? "Geef terug" : "Ik doe het"}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {a.soort !== "vergadering" && (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-rustig">Samen rijden</h3>
          <p className="text-[14px] text-rustig">
            {a.vervoer.length === 0 ? "Nog niets geregeld."
              : `${r.plekken} plekken, ${r.mee} willen mee${r.over < 0 ? `, nog ${-r.over} plek${r.over === -1 ? "" : "ken"} nodig` : ""}.`}
            {a.vervoer.filter((v) => v.rol === "rijdt").map((v) => ` ${v.naam} rijdt (${v.plaatsen}).`).join("")}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {mijnRit?.rol === "rijdt" ? (
              <button onClick={() => doe(() => vervoer(a.id, null))} className={pil(true)}>Ik rijd, {mijnRit.plaatsen} plekken</button>
            ) : (
              <>
                <button onClick={() => doe(() => vervoer(a.id, "rijdt", plaatsen))} className={pil(false)}>Ik rijd</button>
                <select value={plaatsen} onChange={(e) => setPlaatsen(Number(e.target.value))} aria-label="Plekken in de auto"
                  className="h-9 rounded-full bg-vlak px-3 text-sm">
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n} plek{n === 1 ? "" : "ken"}</option>)}
                </select>
              </>
            )}
            <button onClick={() => doe(() => vervoer(a.id, mijnRit?.rol === "meerijden" ? null : "meerijden"))}
              className={pil(mijnRit?.rol === "meerijden")}>Ik wil meerijden</button>
          </div>
        </section>
      )}

      <section className="flex flex-col gap-3">
        {beheer && <p className="text-[13px] text-zacht">Tik op een naam om iemand in de selectie te zetten. Geselecteerd: {geselecteerd}.</p>}
        {groepen.map(([naam, l]) => l.length > 0 && (
          <div key={naam} className="flex flex-col gap-1">
            <h3 className="text-sm font-medium text-rustig">{naam} ({l.length})</h3>
            <ul className="flex flex-wrap gap-1.5">
              {l.map((x) => (
                <li key={x.id}>
                  <button disabled={!beheer} onClick={() => doe(() => selectie(a.id, x.id, !x.selectie))}
                    className={`rounded-full px-3 py-1 text-[14px] ${x.selectie ? "bg-accent/15 font-medium text-accent dark:text-accent-donker" : "bg-vlak"}`}>
                    {x.naam}{x.reden ? ` · ${redenTekst(x.reden).toLowerCase()}` : ""}{x.opmerking ? ` · ${x.opmerking}` : ""}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </Onderblad>
  );
}

function Maken({ c, oud, sluit, klaar, beginSoort }: { beginSoort?: Soort; c: Community; oud: Activiteit | null; sluit: () => void; klaar: (t: string) => void }) {
  const morgen = datumTekst(plusDagen(new Date(), 1));
  const [soort, setSoort] = useState<Soort>(oud?.soort ?? beginSoort ?? "training");
  const [titel, setTitel] = useState(oud?.titel ?? "");
  const [datum, setDatum] = useState(oud ? lokaal(oud.start).slice(0, 10) : morgen);
  const [eindDatum, setEindDatum] = useState(oud?.einde ? lokaal(oud.einde).slice(0, 10) : oud ? lokaal(oud.start).slice(0, 10) : morgen);
  const [van, setVan] = useState(oud ? lokaal(oud.start).slice(11) : "19:00");
  const [tot, setTot] = useState(oud?.einde ? lokaal(oud.einde).slice(11) : "20:30");
  const [verzamelen, setVerzamelen] = useState(oud?.verzamelen ? lokaal(oud.verzamelen).slice(11) : "");
  const [plaats, setPlaats] = useState(oud?.plaats ?? "");
  const [tegen, setTegen] = useState(oud?.tegenstander ?? "");
  const [thuis, setThuis] = useState<boolean | null>(oud?.thuis ?? true);
  const [notitie, setNotitie] = useState(oud?.notitie ?? "");
  const [taken, setTaken] = useState<string[]>(oud?.taken.map((t) => t.naam) ?? []);
  const [eigen, setEigen] = useState("");
  const [weken, setWeken] = useState(0);
  const [afgelast, setAfgelast] = useState(oud?.afgelast ?? false);
  const [uitslag, setUitslag] = useState(oud?.uitslag ?? "");
  const [bezig, setBezig] = useState(false);
  const [probleem, setProbleem] = useState("");
  const naam = titel.trim() || (soort === "wedstrijd" && tegen.trim() ? `${thuis === false ? `${tegen.trim()} - ${c.naam}` : `${c.naam} - ${tegen.trim()}`}`
    : SOORTEN.find(([k]) => k === soort)![1]);

  async function bewaar(e: FormEvent) {
    e.preventDefault();
    setBezig(true);
    setProbleem("");
    const a: Nieuw = { soort, titel: naam, start: `${datum}T${van}`, einde: tot ? `${eindDatum}T${tot}` : undefined,
      verzamelen: verzamelen && verzamelen < van ? `${datum}T${verzamelen}` : undefined, plaats: plaats.trim(), notitie: notitie.trim(),
      tegenstander: soort === "wedstrijd" ? tegen.trim() : "", thuis: soort === "wedstrijd" ? thuis : null, taken, afgelast, uitslag: uitslag.trim() };
    try {
      const r = await bewaren(c.id, a, oud?.id ?? null, oud ? 0 : weken);
      klaar(oud ? "Aangepast. Iedereen ziet het meteen." : r.ids.length > 1 ? `${r.ids.length} keer in de agenda gezet.` : "In de agenda gezet.");
    } catch (er) {
      setProbleem(fout(er));
      setBezig(false);
    }
  }

  return (
    <Onderblad titel={oud ? "Aanpassen" : "Nieuw in de agenda"} sluit={sluit}>
      <form onSubmit={bewaar} className="flex flex-col gap-4">
        <div className="-mx-6 flex gap-2 overflow-x-auto px-6 [scrollbar-width:none]">
          {SOORTEN.map(([k, label]) => <button type="button" key={k} onClick={() => setSoort(k)} aria-pressed={soort === k} className={pil(soort === k)}>{label}</button>)}
        </div>
        {soort === "wedstrijd" && (
          <div className="flex gap-2">
            <input value={tegen} onChange={(e) => setTegen(e.target.value)} placeholder="Tegen wie?" aria-label="Tegenstander" className={`${veld} min-w-0 flex-1`} />
            <button type="button" onClick={() => setThuis(thuis === false)} className={`${pil(true)} h-12 rounded-2xl`}>{thuis === false ? "Uit" : "Thuis"}</button>
          </div>
        )}
        <input value={titel} onChange={(e) => setTitel(e.target.value)} placeholder={naam} aria-label="Naam" maxLength={120} className={veld} />
        <div className="grid grid-cols-[1fr_auto_auto] gap-2">
          <input type="date" value={datum} onChange={(e) => { if (eindDatum === datum) setEindDatum(e.target.value); setDatum(e.target.value); }} aria-label="Datum" className={`${veld} min-w-0`} />
          <input type="time" value={van} onChange={(e) => setVan(e.target.value)} aria-label="Begin" className={`${veld} w-24 px-2`} />
          <input type="time" value={tot} onChange={(e) => setTot(e.target.value)} aria-label="Einde" className={`${veld} w-24 px-2`} />
        </div>
        <label className="flex flex-col gap-1 text-sm">Einddatum<input type="date" value={eindDatum} onChange={e => setEindDatum(e.target.value)} aria-label="Einddatum" className={veld} /></label>
        {soort === "wedstrijd" && (
          <label className="flex items-center justify-between gap-3 text-[15px]">Verzamelen om
            <input type="time" value={verzamelen} onChange={(e) => setVerzamelen(e.target.value)} aria-label="Verzamelen" className={`${veld} w-28 px-2`} />
          </label>
        )}
        <input value={plaats} onChange={(e) => setPlaats(e.target.value)} placeholder="Waar?" aria-label="Plaats" maxLength={200} className={veld} />
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-rustig">Taken om te verdelen</h3>
          <div className="flex flex-wrap gap-2">
            {[...new Set([...TAKEN, ...taken])].map((t) => (
              <button type="button" key={t} aria-pressed={taken.includes(t)} className={pil(taken.includes(t))}
                onClick={() => setTaken((l) => (l.includes(t) ? l.filter((x) => x !== t) : [...l, t].slice(0, 10)))}>{t}</button>
            ))}
          </div>
          <div className="flex gap-2">
            <input value={eigen} onChange={(e) => setEigen(e.target.value)} placeholder="Andere taak" aria-label="Andere taak" maxLength={60} className={`${veld} min-w-0 flex-1`} />
            <button type="button" disabled={!eigen.trim()} onClick={() => { setTaken((l) => [...new Set([...l, eigen.trim()])].slice(0, 10)); setEigen(""); }}
              className="h-12 rounded-2xl bg-vlak px-4 font-medium disabled:opacity-30">Voeg toe</button>
          </div>
        </section>
        <textarea value={notitie} onChange={(e) => setNotitie(e.target.value)} placeholder="Iets om te weten (kleding, meenemen)" rows={2}
          maxLength={1000} aria-label="Notitie" className="rounded-2xl bg-vlak px-4 py-3 outline-none placeholder:text-zacht" />
        {!oud && (
          <label className="flex items-center justify-between gap-3 text-[15px]">Elke week herhalen
            <select value={weken} onChange={(e) => setWeken(Number(e.target.value))} className="h-10 rounded-full bg-vlak px-3 text-sm">
              <option value={0}>Niet</option><option value={3}>4 weken</option><option value={7}>8 weken</option>
              <option value={11}>12 weken</option><option value={25}>Een half jaar</option>
            </select>
          </label>
        )}
        {oud && <Schakelaar label="Afgelast" uitleg="Blijft staan, doorgestreept, zodat iedereen het ziet." aan={afgelast} zet={setAfgelast} />}
        {oud?.soort === "wedstrijd" && (
          <input value={uitslag} onChange={(e) => setUitslag(e.target.value)} placeholder="Uitslag, bijvoorbeeld 3-2" aria-label="Uitslag" maxLength={60} className={veld} />
        )}
        {probleem && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{probleem}</p>}
        <button disabled={bezig || !datum || !van} className={knop}>{oud ? "Bewaar" : "Zet in de agenda"}</button>
      </form>
    </Onderblad>
  );
}

const AFWEZIG: [MijnAfwezig["soort"], string][] = [["ziek", "Ziek"], ["blessure", "Blessure"], ["vakantie", "Vakantie"], ["anders", "Iets anders"]];

function Afmelden({ c, sluit, klaar }: { c: Community; sluit: () => void; klaar: (t: string, g: Gegevens) => void }) {
  const vandaag = datumTekst(new Date());
  const [soort, setSoort] = useState<MijnAfwezig["soort"]>("ziek");
  const [van, setVan] = useState(vandaag);
  const [open, setOpen] = useState(true);
  const [tot, setTot] = useState(datumTekst(plusDagen(new Date(), 7)));
  const [overal, setOveral] = useState(true);
  const [iedereen, setIedereen] = useState(false);
  const [opmerking, setOpmerking] = useState("");
  const [bezig, setBezig] = useState(false);
  const [probleem, setProbleem] = useState("");
  const gezondheid = soort === "ziek" || soort === "blessure";

  async function meld(e: FormEvent) {
    e.preventDefault();
    setBezig(true);
    try {
      const r = await afwezigMelden(soort, van, open ? null : tot, overal ? [] : [c.id], iedereen, opmerking.trim());
      klaar(`Afgemeld${r.afgemeld ? ` voor ${r.afgemeld} ${r.afgemeld === 1 ? "activiteit" : "activiteiten"}` : ""}. Het staat ook in je eigen agenda.`, r.data);
    } catch (er) {
      setProbleem(fout(er));
      setBezig(false);
    }
  }

  return (
    <Onderblad titel="Afmelden" sluit={sluit}>
      <form onSubmit={meld} className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          {AFWEZIG.map(([k, label]) => (
            <button type="button" key={k} aria-pressed={soort === k} className={pil(soort === k)}
              onClick={() => { setSoort(k); setOpen(k === "ziek" || k === "blessure"); }}>{label}</button>
          ))}
        </div>
        <label className="flex items-center justify-between gap-3 text-[15px]">Vanaf
          <input type="date" value={van} min={vandaag} onChange={(e) => setVan(e.target.value)} className={`${veld} w-44`} />
        </label>
        <Schakelaar label={soort === "vakantie" ? "Weet nog niet tot wanneer" : "Tot ik beter ben"}
          uitleg="Je meldt je zelf weer terug met één tik." aan={open} zet={setOpen} />
        {!open && (
          <label className="flex items-center justify-between gap-3 text-[15px]">Tot en met
            <input type="date" value={tot} min={van} onChange={(e) => setTot(e.target.value)} className={`${veld} w-44`} />
          </label>
        )}
        <Schakelaar label="In al mijn groepen" uitleg={overal ? "Je club, je team en andere groepen weten het in één keer." : `Alleen in ${c.naam}.`}
          aan={overal} zet={setOveral} />
        {gezondheid && (
          <Schakelaar label="Iedereen mag de reden zien" uitleg="Standaard zien alleen de beheerders (zoals de trainer) waarom. Anderen zien alleen dat je er niet bent."
            aan={iedereen} zet={setIedereen} />
        )}
        <input value={opmerking} onChange={(e) => setOpmerking(e.target.value)} maxLength={200} aria-label="Opmerking"
          placeholder="Opmerking, bijvoorbeeld 'kom wel kijken'" className={veld} />
        {probleem && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{probleem}</p>}
        <button disabled={bezig || !van} className={knop}>Afmelden</button>
      </form>
    </Onderblad>
  );
}

function MijnMelding({ m, doe, bijgewerkt }: { m: MijnAfwezig; doe: (f: () => Promise<unknown>, t?: string) => Promise<void>;
  bijgewerkt?: (g: Gegevens) => void }) {
  const [tot, setTot] = useState(m.tot ?? "");
  const [aanpassen, setAanpassen] = useState(false);
  const titel = AFWEZIG.find(([k]) => k === m.soort)?.[1] ?? "Afwezig";
  const terug = m.soort === "ziek" ? "Ik ben beter" : m.soort === "blessure" ? "Ik kan weer" : "Ik ben terug";
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-accent/10 p-4">
      <div>
        <p className="font-semibold">Je bent afgemeld: {titel.toLowerCase()}</p>
        <p className="text-[14px] text-rustig">
          Vanaf {kort(m.van)}{m.tot ? ` t/m ${kort(m.tot)}` : ", tot je je terugmeldt"}. {m.communities.length > 1 ? `In ${m.communities.length} groepen.` : ""}
          {" "}{m.reden_zien === "beheer" && (m.soort === "ziek" || m.soort === "blessure") ? "Alleen beheerders zien de reden." : ""}
        </p>
      </div>
      <div className="flex gap-2">
        <button onClick={() => doe(async () => { const g = await beterMelden(m); bijgewerkt?.(g); },
          "Fijn dat het weer gaat. De komende activiteiten staan weer open.")} className="h-10 flex-1 rounded-full bg-accent text-sm font-medium text-white">{terug}</button>
        <button onClick={() => setAanpassen((x) => !x)} className="h-10 rounded-full bg-white px-4 text-sm font-medium dark:bg-white/10">Einddatum</button>
      </div>
      {aanpassen && (
        <div className="flex gap-2">
          <input type="date" value={tot} min={m.van} onChange={(e) => setTot(e.target.value)} aria-label="Tot en met" className={`${veld} min-w-0 flex-1 bg-white dark:bg-white/10`} />
          <button onClick={() => doe(async () => { const g = await totAanpassen(m, tot || null); bijgewerkt?.(g); setAanpassen(false); }, "Aangepast.")}
            className="h-12 rounded-2xl bg-accent px-4 text-sm font-medium text-white">Bewaar</button>
        </div>
      )}
    </div>
  );
}

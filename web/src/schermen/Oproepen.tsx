// Oproepen: snelkiezen, gemiste oproepen met terugbellen of een herinnering, een belafspraak in je agenda en hoe dit
// toestel overgaat. Het logboek en de belvoorkeuren blijven op dit apparaat.
import { useState } from "react";
import { instellingenOpenen } from "../lib/naar";
import { bijwerken, type Gegevens } from "../api";
import { Kalender, Klok, Kruis, Slot, Ster, Telefoon, Vinkje, Video, Zoek } from "../iconen";
import { belDuur, gesprekNaam, type Gesprek } from "../lib/chat";
import { belVoorkeur, belVoorkeurZetten, bellen, kan as kanBellen, oproepen, oproepenWissen, stilNu, type BelVoorkeur,
  type Oproep } from "../lib/bellen";
import { datumTekst, tijdje } from "../lib/tijd";
import { Rondje } from "../rondje";
import { useBellen } from "./Bellen";
import { Schakelaar, kop } from "./instellingen-ui";

const STATUS: Record<Oproep["status"], string> = { klaar: "", gemist: "Gemist", geweigerd: "Geweigerd",
  geen: "Niet opgenomen", mislukt: "Mislukt" };
const rond = "flex size-10 shrink-0 items-center justify-center rounded-full text-accent hover:bg-vlak";

type Props = { ik: number; lijst: Gesprek[]; instellingen: boolean; sluitInstellingen: () => void;
  bewaard: (g: Gegevens) => void; zoekIemand: () => void };

export function Oproepen({ ik, lijst, instellingen, sluitInstellingen, bewaard, zoekIemand }: Props) {
  useBellen();
  const v = belVoorkeur();
  const log = oproepen();
  const [zoek, setZoek] = useState("");
  const [filter, setFilter] = useState<"alles" | "gemist" | "video">("alles");
  const [plannen, setPlannen] = useState<Gesprek | null | "kies">(null);
  const [melding, setMelding] = useState("");

  const mensen = lijst.filter((g) => g.soort === "twee" && g.status === "lid");
  const ander = (g: Gesprek) => g.leden.find((l) => l.id !== ik)?.id ?? 0;
  const bel = (g: Gesprek, video: boolean) => bellen(g.id, gesprekNaam(g, ik), ander(g), video);
  const favoriet = (id: number) => v.favorieten.includes(id);
  const wisselFavoriet = (id: number) => belVoorkeurZetten({ favorieten: favoriet(id)
    ? v.favorieten.filter((x) => x !== id) : [...v.favorieten, id].slice(-8) });

  const week = Date.now() - 7 * 864e5;
  const minuten = Math.round(log.filter((o) => new Date(o.tijd).getTime() > week).reduce((n, o) => n + o.duur, 0) / 60);
  const gemist = log.filter((o) => o.status === "gemist" && new Date(o.tijd).getTime() > week);
  const z = zoek.trim().toLowerCase();
  const gevonden = mensen.filter((g) => !z || gesprekNaam(g, ik).toLowerCase().includes(z))
    .sort((a, b) => Number(favoriet(b.id)) - Number(favoriet(a.id)));
  const recent = log.filter((o) => filter === "alles" || (filter === "gemist" ? o.status === "gemist" : o.video));
  const snel = mensen.filter((g) => favoriet(g.id));

  async function herinner(o: Oproep) {
    try {
      bewaard(await bijwerken((g) => {
        g.taken.push({ id: g.volgend_id, titel: `${o.naam} terugbellen`, deadline: datumTekst(new Date()), klaar: false });
        g.volgend_id += 1;
      }));
      setMelding(`Staat op je takenlijst: ${o.naam} terugbellen.`);
    } catch (e) {
      setMelding(e instanceof Error ? e.message : "Dat lukte niet.");
    }
  }

  if (!kanBellen()) {
    return <><p className="px-6 text-rustig">Bellen kan niet in deze browser. Probeer Safari of Chrome.</p>{instellingen && <BelInstellingen v={v} sluit={sluitInstellingen} />}</>;
  }
  return (
    <div className="flex flex-col gap-6 pb-8">
      {mensen.length > 0 && <label className="mx-6 flex h-11 items-center gap-2 rounded-2xl bg-vlak px-4">
        <Zoek className="size-5 text-rustig" />
        <span className="sr-only">Zoek iemand om te bellen</span>
        <input value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder="Wie wil je spreken?"
          className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-zacht" />
      </label>}

      {snel.length > 0 && (
        <section>
          <h2 className={`${kop} px-7`}>Snelkiezen</h2>
          <ul className="flex gap-4 overflow-x-auto px-6">
            {snel.map((g) => (
              <li key={g.id}>
                <button onClick={() => bel(g, false)} aria-label={`${gesprekNaam(g, ik)} bellen`}
                  className="flex w-16 flex-col items-center gap-1.5 text-[13px]">
                  <span className="relative"><Rondje naam={gesprekNaam(g, ik)} id={ander(g)} groot />
                    <span className="absolute -right-1 -bottom-1 flex size-6 items-center justify-center rounded-full bg-accent text-white ring-2 ring-white dark:ring-[#0b0b0e]">
                      <Telefoon className="size-3.5" /></span></span>
                  <span className="w-full truncate">{gesprekNaam(g, ik)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {gemist.length > 0 && filter !== "gemist" && (
        <section className="mx-6 rounded-2xl bg-red-500/10 p-4">
          <p className="mb-2 font-medium text-red-600 dark:text-red-400">{gemist.length === 1 ? "1 gemiste oproep" : `${gemist.length} gemiste oproepen`}</p>
          <ul className="flex flex-col gap-2">
            {gemist.slice(0, 3).map((o) => {
              const g = mensen.find((x) => x.id === o.gesprek);
              return (
                <li key={o.id} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm">{o.naam} · {tijdje(o.tijd)}</span>
                  {g && <button onClick={() => bel(g, o.video)} className="flex h-9 items-center gap-1.5 rounded-full bg-accent px-3 text-sm font-medium text-white">
                    <Telefoon className="size-4" /> Terugbellen</button>}
                  <button onClick={() => herinner(o)} className="flex h-9 items-center gap-1.5 rounded-full bg-vlak px-3 text-sm">
                    <Vinkje className="size-4" /> Later</button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {melding && <p role="status" className="px-6 text-sm text-rustig">{melding}</p>}

      <section>
        <h2 className={`${kop} px-7`}>Contacten</h2>
        {mensen.length === 0 ? (
          <div className="flex flex-col items-start gap-3 px-7">
            <p className="text-sm text-rustig">Zoek een contact om te bellen, videobellen of samen een belafspraak te plannen.</p>
            <button onClick={zoekIemand} className="flex h-10 items-center gap-2 rounded-full bg-accent px-4 text-sm font-medium text-white">
              <Zoek className="size-4" /> Iemand zoeken</button>
          </div>
        ) : !gevonden.length ? <p className="px-7 text-sm text-rustig">Niemand gevonden met “{zoek}”.</p> : (
          <ul className="flex flex-col px-3">
            {gevonden.map((g) => {
              const naam = gesprekNaam(g, ik);
              return (
                <li key={g.id} className="flex items-center gap-1 rounded-2xl px-3 py-1.5">
                  <Rondje naam={naam} id={ander(g)} />
                  <span className="ml-2 min-w-0 flex-1 truncate font-medium">{naam}</span>
                  <button onClick={() => wisselFavoriet(g.id)} aria-pressed={favoriet(g.id)}
                    aria-label={favoriet(g.id) ? `${naam} uit snelkiezen` : `${naam} in snelkiezen`}
                    className={`flex size-10 items-center justify-center rounded-full hover:bg-vlak ${favoriet(g.id) ? "text-amber-500" : "text-zacht"}`}>
                    <Ster className={`size-5 ${favoriet(g.id) ? "fill-current" : ""}`} /></button>
                  <button onClick={() => setPlannen(g)} aria-label={`Belafspraak met ${naam}`} className={rond}><Kalender className="size-5" /></button>
                  <button onClick={() => bel(g, false)} aria-label={`${naam} bellen`} className={rond}><Telefoon className="size-5" /></button>
                  <button onClick={() => bel(g, true)} aria-label={`${naam} videobellen`} className={rond}><Video className="size-5" /></button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <details className="mx-6 rounded-2xl border border-lijn p-4"><summary className="min-h-11 cursor-pointer py-2 font-medium">Planning en beloverzicht</summary>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Tegel icoon={<Kalender className="size-5" />} titel="Plannen" uitleg="In je agenda"
          doe={() => mensen.length ? setPlannen("kies") : zoekIemand()} />
        <Tegel icoon={<Klok className="size-5" />} titel="Stille uren" aan={stilNu(v)}
          uitleg={v.stilAan ? `${v.stilVan}–${v.stilTot}` : "Uit"} doe={() => belVoorkeurZetten({ stilAan: !v.stilAan })} />
        <Tegel icoon={<Telefoon className="size-5" />} titel={`${minuten} min`} uitleg="deze week" />
      </div>
      </details>
      {log.length > 0 && (
        <section>
          <div className="flex items-center gap-2 px-6 pb-2">
            <h2 className={`${kop} mb-0 flex-1`}>Recent</h2>
            {(["alles", "gemist", "video"] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)} aria-pressed={filter === f}
                className={`h-8 rounded-full px-3 text-sm ${filter === f ? "bg-accent text-white" : "bg-vlak text-rustig"}`}>
                {f === "alles" ? "Alles" : f === "gemist" ? "Gemist" : "Video"}</button>
            ))}
          </div>
          {!recent.length ? <p className="px-7 text-sm text-rustig">Hier staat nog niets.</p> : (
            <ul className="flex flex-col px-3">
              {recent.slice(0, 30).map((o) => {
                const g = mensen.find((x) => x.id === o.gesprek);
                const rood = o.status === "gemist";
                return (
                  <li key={o.id} className="flex items-center gap-3 rounded-2xl px-3 py-2">
                    <Rondje naam={o.naam} id={o.ander} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className={`truncate font-medium ${rood ? "text-red-600 dark:text-red-400" : ""}`}>{o.naam}</span>
                      <span className="truncate text-[13px] text-rustig">
                        {[o.uit ? "Uitgaand" : "Inkomend", o.video ? "video" : "", STATUS[o.status] || (o.duur ? belDuur(o.duur) : ""),
                          tijdje(o.tijd)].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    {g && <button onClick={() => bel(g, o.video)} aria-label={`${o.naam} bellen`} className={rond}>
                      {o.video ? <Video className="size-5" /> : <Telefoon className="size-5" />}</button>}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      <p className="flex items-center gap-1.5 px-6 text-[13px] text-zacht"><Slot className="size-3.5 shrink-0" /> Gesprekken gaan versleuteld rechtstreeks tussen jullie toestellen. Wij horen en zien niets.</p>

      {plannen && <Plannen ik={ik} mensen={mensen} gekozen={plannen === "kies" ? null : plannen} sluit={() => setPlannen(null)}
        zoekIemand={() => { setPlannen(null); zoekIemand(); }}
        bewaard={(g, tekst) => { bewaard(g); setPlannen(null); setMelding(tekst); }} />}
      {instellingen && <BelInstellingen v={v} sluit={sluitInstellingen} />}
    </div>
  );
}

function Tegel({ icoon, titel, uitleg, doe, aan }: { icoon: React.ReactNode; titel: string; uitleg: string; doe?: () => void;
  aan?: boolean }) {
  const inhoud = <>
    <span className={`flex size-9 items-center justify-center rounded-full ${aan ? "bg-accent text-white" : "bg-white text-accent dark:bg-[#2a2a31]"}`}>{icoon}</span>
    <span className="w-full truncate text-sm font-semibold">{titel}</span>
    <span className="w-full truncate text-[12px] text-rustig">{uitleg}</span>
  </>;
  const klas = "flex flex-col items-start gap-1 rounded-2xl bg-vlak p-3 text-left";
  return doe ? <button onClick={doe} aria-pressed={aan} className={klas}>{inhoud}</button> : <div className={klas}>{inhoud}</div>;
}

function Blad({ titel, sluit, children }: { titel: string; sluit: () => void; children: React.ReactNode }) {
  return (
    <div role="dialog" aria-modal aria-label={titel} className="fixed inset-0 z-40 overflow-y-auto bg-white dark:bg-[#0b0b0e]">
      <div className="mx-auto flex max-w-xl flex-col gap-5 px-6 pt-12 pb-10">
        <div className="flex items-center justify-between">
          <h1 className="text-[28px] font-bold tracking-tight">{titel}</h1>
          <button onClick={sluit} aria-label="Sluiten" className="flex size-10 items-center justify-center rounded-full bg-vlak">
            <Kruis className="size-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Een belafspraak: komt in je agenda, zodat je er op tijd aan herinnerd wordt en niemand voor niets belt. */
function Plannen({ ik, mensen, gekozen, sluit, zoekIemand, bewaard }: { ik: number; mensen: Gesprek[]; gekozen: Gesprek | null;
  sluit: () => void; zoekIemand: () => void; bewaard: (g: Gegevens, tekst: string) => void }) {
  const morgen = new Date(Date.now() + 864e5);
  const [wie, setWie] = useState(gekozen?.id ?? mensen[0]?.id ?? 0);
  const [dag, setDag] = useState(datumTekst(morgen));
  const [tijd, setTijd] = useState("19:00");
  const [duur, setDuur] = useState(30);
  const [fout, setFout] = useState("");
  const g = mensen.find((x) => x.id === wie);
  const veld = "h-12 rounded-2xl bg-vlak px-4 outline-none";

  async function bewaar() {
    if (!g) return;
    const naam = gesprekNaam(g, ik);
    const [u, m] = tijd.split(":").map(Number);
    const eind = new Date(`${dag}T${tijd}`);
    eind.setMinutes(eind.getMinutes() + duur);
    const twee = (n: number) => String(n).padStart(2, "0");
    try {
      bewaard(await bijwerken((d) => {
        d.afspraken.push({ id: d.volgend_id, titel: `Bellen met ${naam}`, start: `${dag}T${twee(u)}:${twee(m)}`,
          einde: `${datumTekst(eind)}T${twee(eind.getHours())}:${twee(eind.getMinutes())}`, soort: "familie en vrienden",
          notitie: "Bel vanuit Chat, Oproepen." });
        d.volgend_id += 1;
      }), `Belafspraak met ${naam} staat in je agenda.`);
    } catch (e) {
      setFout(e instanceof Error ? e.message : "Opslaan lukte niet.");
    }
  }

  return (
    <Blad titel="Belafspraak" sluit={sluit}>
      <p className="text-rustig">Spreek een moment af, dan zie je het in je agenda en bel je niet midden in iemands avondeten.</p>
      {!mensen.length ? <>
        <p className="text-rustig">Je hebt nog niemand om mee af te spreken. Begin eerst een gesprek.</p>
        <button onClick={zoekIemand} className="h-12 self-start rounded-full bg-accent px-6 font-medium text-white">Zoek iemand</button>
      </> : <>
        <label className="flex flex-col gap-2"><span className={kop}>Met wie</span>
          <select value={wie} onChange={(e) => setWie(Number(e.target.value))} className={veld}>
            {mensen.map((x) => <option key={x.id} value={x.id}>{gesprekNaam(x, ik)}</option>)}
          </select></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-2"><span className={kop}>Dag</span>
            <input type="date" value={dag} min={datumTekst(new Date())} onChange={(e) => setDag(e.target.value)} className={veld} /></label>
          <label className="flex flex-col gap-2"><span className={kop}>Tijd</span>
            <input type="time" value={tijd} onChange={(e) => setTijd(e.target.value)} className={veld} /></label>
        </div>
        <fieldset><legend className={kop}>Hoe lang ongeveer</legend>
          <div className="flex gap-2">
            {[15, 30, 60].map((n) => (
              <button key={n} type="button" onClick={() => setDuur(n)} aria-pressed={duur === n}
                className={`h-10 flex-1 rounded-full text-sm ${duur === n ? "bg-accent font-medium text-white" : "bg-vlak text-rustig"}`}>
                {n === 60 ? "1 uur" : `${n} min`}</button>
            ))}
          </div></fieldset>
        {fout && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{fout}</p>}
        <button onClick={bewaar} disabled={!g || !dag || !tijd}
          className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-accent font-medium text-white disabled:opacity-30">
          <Kalender className="size-5" /> In mijn agenda</button>
      </>}
    </Blad>
  );
}

function BelInstellingen({ v, sluit }: { v: BelVoorkeur; sluit: () => void }) {
  const tijd = "h-11 w-full min-w-0 rounded-xl bg-white px-3 text-inkt dark:bg-[#2a2a31]";
  return (
    <Blad titel="Bellen" sluit={sluit}>
      <section>
        <h2 className={kop}>Als iemand belt</h2>
        <div className="flex rounded-2xl bg-vlak p-1">
          {([["aan", "Geluid"], ["trillen", "Trillen"], ["stil", "Stil"]] as const).map(([k, naam]) => (
            <button key={k} type="button" aria-pressed={v.geluid === k} onClick={() => belVoorkeurZetten({ geluid: k })}
              className={`h-10 flex-1 rounded-xl text-[15px] ${v.geluid === k ? "bg-white font-semibold shadow-sm dark:bg-[#2a2a31]" : "text-rustig"}`}>
              {naam}</button>
          ))}
        </div>
        <p className="mt-2 px-1 text-sm text-rustig">Bij Stil zie je de oproep wel, je hoort hem alleen niet.</p>
      </section>
      <section className="flex flex-col gap-2">
        <Schakelaar label="Stille uren" aan={v.stilAan} zet={(aan) => belVoorkeurZetten({ stilAan: aan })}
          uitleg="Op deze uren gaat dit toestel niet over. Je ziet achteraf wie belde." />
        {v.stilAan && (
          <div className="grid grid-cols-2 gap-3 rounded-2xl bg-vlak p-3">
            <label className="flex min-w-0 flex-col gap-1 text-sm text-rustig">Van
              <input type="time" value={v.stilVan} onChange={(e) => belVoorkeurZetten({ stilVan: e.target.value })} className={tijd} /></label>
            <label className="flex min-w-0 flex-col gap-1 text-sm text-rustig">Tot
              <input type="time" value={v.stilTot} onChange={(e) => belVoorkeurZetten({ stilTot: e.target.value })} className={tijd} /></label>
          </div>
        )}
      </section>
      <section className="flex flex-col gap-2">
        <h2 className={kop}>Opnemen</h2>
        <Schakelaar label="Microfoon eerst uit" aan={v.micUit} zet={(aan) => belVoorkeurZetten({ micUit: aan })}
          uitleg="Je neemt op, maar praat pas als jij de microfoon aanzet. Handig in de trein." />
        <Schakelaar label="Camera eerst uit" aan={v.cameraUit} zet={(aan) => belVoorkeurZetten({ cameraUit: aan })}
          uitleg="Bij videobellen zie jij de ander meteen, de ander jou pas als je de camera aanzet." />
      </section>
      <section className="flex flex-col gap-2">
        <h2 className={kop}>Privacy</h2>
        <p className="px-1 text-sm text-rustig">Alleen mensen met wie je een gesprek hebt, kunnen je bellen. Beeld en geluid gaan
          rechtstreeks en versleuteld tussen jullie toestellen. Je beloverzicht staat alleen op dit apparaat.</p>
        <button type="button" onClick={() => { sluit(); instellingenOpenen("privacy"); }} className="min-h-11 rounded-2xl bg-vlak px-4 text-accent">Privacy en beveiliging van mijn account</button>
        <button onClick={() => { if (confirm("Je beloverzicht op dit apparaat wissen?")) oproepenWissen(); }}
          className="h-12 rounded-2xl bg-vlak font-medium text-red-600 dark:text-red-400">Beloverzicht wissen</button>
      </section>
    </Blad>
  );
}

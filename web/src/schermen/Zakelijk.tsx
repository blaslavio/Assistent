// Zakelijk: vandaag afvinken, het lesrooster, klanten met hun saldo en een eenvoudige boekhouding met btw.
// Voor wie lessen geeft, klanten heeft of als zzp'er werkt. Dezelfde gegevens als in de vorige app.
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import type { Staat } from "../App";
import { Herstel, Kruis, Meer, Plus, Prullenbak, Schuiven, Terug, Vinkje, Vonk } from "../iconen";
import {
  BTW, KOSTEN, SOORTEN_ZAAK, SOORT_NAAM, afvinken, bedrag, betalingOntvangen, centen, cijfers, csv, datumIso, deelnemerErbij,
  instellen, instellingen, lesAfvinken, lesMaken, lesWeg, lessen, nogAfvinken, overzicht, periode, post, postWeg,
  type Afspraak, type Les, type Overzicht, type Periode, type Saldo, type Zaak,
} from "../lib/zaak";
import { kop } from "./instellingen-ui";
import { Onderblad } from "./Onderblad";

const veld = "h-12 w-full min-w-0 rounded-2xl bg-vlak px-4 outline-none placeholder:text-zacht";
const knop = "flex h-12 items-center justify-center gap-2 rounded-2xl bg-accent px-4 font-medium text-white disabled:opacity-30";
const knopZacht = "flex h-12 items-center justify-center gap-2 rounded-2xl bg-vlak px-4 font-medium disabled:opacity-30";
const rond = "flex size-10 shrink-0 items-center justify-center rounded-full bg-white text-rustig dark:bg-black/30";
const foutVan = (e: unknown) => (e instanceof Error && e.message ? e.message : "Dat lukte niet. Probeer het opnieuw.");

type Deel = "Vandaag" | "Rooster" | "Klanten" | "Boekhouding";

function wanneer(iso: string) {
  const d = new Date(iso);
  const dag = d.toDateString() === new Date().toDateString() ? "Vandaag"
    : d.toLocaleDateString("nl-NL", { weekday: "short", day: "numeric", month: "short" });
  return `${dag} ${d.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })}`;
}
const datumKort = (iso: string) => new Date(iso + "T12:00").toLocaleDateString("nl-NL", { day: "numeric", month: "short" });
const plusDagen = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

function Pillen<T extends string>({ opties, gekozen, kies }: { opties: readonly T[]; gekozen: T; kies: (t: T) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {opties.map((o) => (
        <button key={o} type="button" onClick={() => kies(o)} aria-pressed={gekozen === o}
          className={`h-9 rounded-full px-4 text-sm font-medium ${gekozen === o ? "bg-accent text-white" : "bg-vlak text-rustig"}`}>{o}</button>
      ))}
    </div>
  );
}

function Lijst({ children }: { children: ReactNode }) {
  return <ul className="flex flex-col overflow-hidden rounded-[20px] bg-vlak">{children}</ul>;
}
const rij = "flex items-center gap-3 px-4 py-3 [&+li]:border-t [&+li]:border-lijn";

export function Zakelijk({ staat, vernieuw, vraag }: { staat: Staat; vernieuw: () => Promise<void>; vraag: (tekst: string) => void }) {
  const z = instellingen(staat.data);
  const delen: Deel[] = ["Vandaag", ...(z.groepslessen ? ["Rooster" as const] : []), "Klanten", "Boekhouding"];
  const [deel, setDeel] = useState<Deel>("Vandaag");
  const [instellenOpen, setInstellenOpen] = useState(false);
  const [melding, setMelding] = useState("");
  const [teller, setTeller] = useState(0);
  const huidig = delen.includes(deel) ? deel : "Vandaag";

  // Na elke actie: een korte melding en alles opnieuw ophalen.
  const klaar = useCallback((tekst: string) => { setMelding(tekst); setTeller((t) => t + 1); }, []);
  useEffect(() => {
    if (!melding) return;
    const t = setTimeout(() => setMelding(""), 3500);
    return () => clearTimeout(t);
  }, [melding]);

  return (
    <>
      <div className="flex items-center gap-3">
        <p className="flex-1 truncate text-lg font-semibold">{z.naam || SOORTEN_ZAAK[z.soort] || "Mijn zaak"}</p>
        <button onClick={() => setInstellenOpen(true)} className="flex items-center gap-1 text-sm text-accent">
          <Schuiven className="size-4" /> Instellen</button>
      </div>
      <Pillen opties={delen} gekozen={huidig} kies={setDeel} />
      {melding && <p role="status" className="rounded-2xl bg-vlak px-4 py-3 text-sm">{melding}</p>}

      {huidig === "Vandaag" && <Vandaag key={teller} z={z} klaar={klaar} />}
      {huidig === "Rooster" && <Rooster key={teller} z={z} klaar={klaar} />}
      {huidig === "Klanten" && <Klanten key={teller} klaar={klaar} />}
      {huidig === "Boekhouding" && <Boekhouding key={teller} z={z} klaar={klaar} vraag={vraag} />}

      {instellenOpen && <Instellen z={z} sluit={() => setInstellenOpen(false)}
        bewaar={async (nieuw) => { await instellen(nieuw); await vernieuw(); setInstellenOpen(false); klaar("Opgeslagen."); }} />}
    </>
  );
}

function useLaden<T>(laden: () => Promise<T>) {
  const [waarde, setWaarde] = useState<T | null>(null);
  const [fout, setFout] = useState("");
  useEffect(() => {
    let weg = false;
    laden().then((w) => { if (!weg) setWaarde(w); }).catch((e) => { if (!weg) setFout(foutVan(e)); });
    return () => { weg = true; };
  }, [laden]);
  return { waarde, fout, setFout };
}

function Fout({ tekst }: { tekst: string }) {
  return tekst ? <p role="alert" className="rounded-2xl bg-vlak px-4 py-3 text-sm text-rustig">{tekst}</p> : null;
}

// --- Vandaag --------------------------------------------------------------------------------------------------------

function Vandaag({ z, klaar }: { z: Zaak; klaar: (t: string) => void }) {
  const laden = useCallback(async () => {
    const vandaag = datumIso(new Date());
    const [l, o] = await Promise.all([z.groepslessen ? lessen(vandaag, vandaag) : Promise.resolve([]), overzicht(vandaag, vandaag)]);
    return { lessen: l, afvinken: nogAfvinken(o) };
  }, [z.groepslessen]);
  const { waarde, fout, setFout } = useLaden(laden);
  if (!waarde) return <Fout tekst={fout} />;
  return (
    <>
      <Fout tekst={fout} />
      {waarde.lessen.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className={kop}>Lessen vandaag</h2>
          {waarde.lessen.map((l) => <LesKaart key={l.id} les={l} z={z} klaar={klaar} fout={setFout}
            open={new Date(l.start).getTime() < Date.now() + 3600_000} />)}
        </section>
      )}
      <AfvinkLijst lijst={waarde.afvinken} z={z} klaar={klaar} fout={setFout} />
      {z.afspraken && <p className="text-sm text-rustig">Klanten boeken een afspraak via je boekingspagina. Die stel je in bij
        Instellingen, Boekingspagina.</p>}
    </>
  );
}

function AfvinkLijst({ lijst, z, klaar, fout }: { lijst: Afspraak[]; z: Zaak; klaar: (t: string) => void; fout: (t: string) => void }) {
  const [meer, setMeer] = useState<Afspraak | null>(null);
  async function doe(b: Afspraak, afvink: "gekomen" | "niet_gekomen", rekenen = false) {
    try {
      await afvinken(b.id, afvink, rekenen, z.btw);
      setMeer(null);
      klaar(afvink === "gekomen" ? `Afgevinkt${b.prijs ? ` en ${bedrag(b.prijs)} op de rekening gezet` : ""}.`
        : rekenen ? "Genoteerd en op de rekening gezet." : "Genoteerd: niet gekomen.");
    } catch (e) { fout(foutVan(e)); }
  }
  if (!lijst.length) return <p className="text-sm text-rustig">Niets meer af te vinken.</p>;
  return (
    <section className="flex flex-col gap-2">
      <h2 className={kop}>Afvinken</h2>
      <Lijst>
        {lijst.slice(0, 30).map((b) => (
          <li key={b.id} className={rij}>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-medium">{b.soort} · {b.naam}</span>
              <span className="text-sm text-rustig">{wanneer(b.start)}{b.prijs ? ` · ${bedrag(b.prijs)}` : ""}</span>
            </span>
            <button onClick={() => doe(b, "gekomen")} className={rond} aria-label={`${b.naam} is gekomen`}><Vinkje className="size-5" /></button>
            <button onClick={() => setMeer(b)} className={rond} aria-label="Meer keuzes"><Meer className="size-5" /></button>
          </li>
        ))}
      </Lijst>
      {meer && (
        <Onderblad titel={`${meer.naam} niet gekomen`} sluit={() => setMeer(null)}>
          <button onClick={() => doe(meer, "niet_gekomen")} className={knopZacht}>Niet gekomen</button>
          {meer.prijs > 0 && <button onClick={() => doe(meer, "niet_gekomen", true)} className={knopZacht}>
            Niet gekomen, wel {bedrag(meer.prijs)} rekenen</button>}
        </Onderblad>
      )}
    </section>
  );
}

// --- Rooster (groepslessen) -----------------------------------------------------------------------------------------

function LesKaart({ les, z, klaar, fout, open = false }: { les: Les; z: Zaak; klaar: (t: string) => void;
  fout: (t: string) => void; open?: boolean }) {
  const [wie, setWie] = useState("");
  const [vervallen, setVervallen] = useState(false);
  const voorbij = new Date(les.start).getTime() < Date.now() + 3600_000;
  const vol = les.ingeschreven >= les.plekken;
  async function doe(actie: () => Promise<unknown>, tekst: string) {
    try { await actie(); klaar(tekst); } catch (e) { fout(foutVan(e)); }
  }
  return (
    <details open={open} className="group rounded-[20px] bg-vlak">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3">
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-medium">{les.naam}</span>
          <span className="text-sm text-rustig">{wanneer(les.start)} · {les.minuten} min{les.locatie ? ` · ${les.locatie}` : ""}</span>
        </span>
        <span className="flex flex-col items-end text-sm tabular-nums">
          <span className={vol ? "font-semibold" : ""}>{les.ingeschreven}/{les.plekken}</span>
          {les.wachtlijst > 0 && <span className="text-rustig">+{les.wachtlijst} wachtlijst</span>}
        </span>
      </summary>
      <div className="flex flex-col gap-3 border-t border-lijn px-4 py-3">
        {les.prijs > 0 && <p className="text-sm text-rustig">{bedrag(les.prijs)} per keer</p>}
        {les.deelnemers.length ? (
          <ul className="flex flex-col gap-1">
            {les.deelnemers.map((d) => (
              <li key={d.id} className="flex min-h-10 items-center gap-2">
                <span className="flex-1 truncate">
                  {d.afgevinkt === "gekomen" ? "✓ " : d.afgevinkt === "niet_gekomen" ? "✗ " : ""}{d.naam}
                  {d.status === "wachtlijst" && <span className="text-sm text-rustig"> · wachtlijst</span>}
                </span>
                {voorbij && d.status === "ingeschreven" && (d.afgevinkt ? (
                  <button onClick={() => doe(() => lesAfvinken(d.id, "", z.btw), "Teruggedraaid.")} className={rond}
                    aria-label="Terugdraaien"><Herstel className="size-5" /></button>
                ) : (
                  <>
                    <button onClick={() => doe(() => lesAfvinken(d.id, "gekomen", z.btw), `${d.naam} afgevinkt.`)} className={rond}
                      aria-label={`${d.naam} is gekomen`}><Vinkje className="size-5" /></button>
                    <button onClick={() => doe(() => lesAfvinken(d.id, "niet_gekomen", z.btw), "Genoteerd: niet gekomen.")} className={rond}
                      aria-label={`${d.naam} is niet gekomen`}><Kruis className="size-5" /></button>
                  </>
                ))}
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-rustig">Nog niemand ingeschreven.</p>}
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (wie.trim()) doe(() => deelnemerErbij(les.id, wie.trim()), `${wie.trim()} staat op de lijst.`); }}>
          <input value={wie} onChange={(e) => setWie(e.target.value)} placeholder="Iemand toevoegen" maxLength={80}
            className="h-11 min-w-0 flex-1 rounded-2xl bg-white px-4 outline-none placeholder:text-zacht dark:bg-black/30" />
          <button disabled={!wie.trim()} className="flex h-11 items-center rounded-2xl bg-accent px-4 text-sm font-medium text-white disabled:opacity-30">Toevoegen</button>
        </form>
        {!voorbij && <button onClick={() => setVervallen(true)} className="self-start text-sm text-red-600 dark:text-red-400">Les laten vervallen</button>}
      </div>
      {vervallen && (
        <Onderblad titel="Les laten vervallen" sluit={() => setVervallen(false)}>
          <p className="text-sm text-rustig">Wie ingeschreven staat, krijgt een melding.</p>
          <button onClick={() => doe(() => lesWeg(les.id, false), "De les vervalt.")} className={knopZacht}>Alleen deze les</button>
          {les.reeks && <button onClick={async () => {
            try { const n = await lesWeg(les.id, true); klaar(`${n} ${n === 1 ? "les vervalt" : "lessen vervallen"}.`); } catch (e) { fout(foutVan(e)); }
          }} className={knopZacht}>Deze en alle volgende</button>}
        </Onderblad>
      )}
    </details>
  );
}

function Rooster({ z, klaar }: { z: Zaak; klaar: (t: string) => void }) {
  const [week, setWeek] = useState(0);
  const [nieuw, setNieuw] = useState(false);
  const vandaag = new Date();
  const maandag = plusDagen(vandaag, -((vandaag.getDay() + 6) % 7) + week * 7);
  const van = datumIso(maandag), tot = datumIso(plusDagen(maandag, 6));
  const laden = useCallback(() => lessen(van, tot), [van, tot]);
  const { waarde, fout, setFout } = useLaden(laden);
  return (
    <>
      <div className="flex items-center gap-2">
        <button onClick={() => setWeek(week - 1)} disabled={week <= -8} className={rond} aria-label="Vorige week"><Terug className="size-5" /></button>
        <p className="flex-1 text-center font-medium">Week van {maandag.toLocaleDateString("nl-NL", { day: "numeric", month: "long" })}</p>
        <button onClick={() => setWeek(week + 1)} disabled={week >= 26} className={rond} aria-label="Volgende week"><Terug className="size-5 rotate-180" /></button>
      </div>
      <Fout tekst={fout} />
      {waarde && (waarde.length ? (
        <div className="flex flex-col gap-2">{waarde.map((l) => <LesKaart key={l.id} les={l} z={z} klaar={klaar} fout={setFout} />)}</div>
      ) : <p className="text-sm text-rustig">Geen lessen deze week.</p>)}
      <button onClick={() => setNieuw(true)} className={knop}><Plus className="size-5" /> Les toevoegen</button>
      <p className="text-sm text-rustig">Leden schrijven zich in via de chat met jou.</p>
      {nieuw && <LesFormulier zaaknaam={z.naam} sluit={() => setNieuw(false)} klaar={(t) => { setNieuw(false); klaar(t); }} />}
    </>
  );
}

function LesFormulier({ zaaknaam, sluit, klaar }: { zaaknaam: string; sluit: () => void; klaar: (t: string) => void }) {
  const morgen = datumIso(plusDagen(new Date(), 1));
  const [v, setV] = useState({ naam: "", dag: morgen, tijd: "19:00", minuten: 60, plekken: "12", prijs: "", locatie: "",
    elkeWeek: true, aantal: 12 });
  const [fout, setFout] = useState("");
  const [bezig, setBezig] = useState(false);
  const zet = (veldnaam: keyof typeof v) => (e: { target: { value: string } }) => setV({ ...v, [veldnaam]: e.target.value });
  async function maken(e: FormEvent) {
    e.preventDefault();
    if (!v.naam.trim()) return setFout("Geef de les een naam.");
    try {
      const prijs = v.prijs.trim() ? centen(v.prijs) : 0;
      if (prijs < 0) return setFout("De prijs kan niet negatief zijn.");
      setBezig(true);
      const n = await lesMaken({ naam: v.naam.trim(), start: `${v.dag}T${v.tijd}`, minuten: v.minuten,
        plekken: Math.max(1, Math.min(500, Number(v.plekken) || 12)), prijs, locatie: v.locatie.trim(), elkeWeek: v.elkeWeek,
        aantal: v.elkeWeek ? v.aantal : 1 }, zaaknaam);
      klaar(`${n} ${n === 1 ? "les" : "lessen"} in je rooster gezet.`);
    } catch (err) { setFout(foutVan(err)); setBezig(false); }
  }
  return (
    <Onderblad titel="Les toevoegen" sluit={sluit}>
      <form onSubmit={maken} className="flex flex-col gap-3">
        <input value={v.naam} onChange={zet("naam")} placeholder="Naam, bijvoorbeeld Spinning" maxLength={60} className={veld} autoFocus />
        <div className="flex gap-2">
          <input type="date" value={v.dag} min={datumIso(new Date())} onChange={zet("dag")} className={veld} aria-label="Dag" />
          <input type="time" value={v.tijd} step={900} onChange={zet("tijd")} className={`${veld} w-32 flex-none`} aria-label="Tijd" />
        </div>
        <div className="flex gap-2">
          <select value={v.minuten} onChange={(e) => setV({ ...v, minuten: Number(e.target.value) })} className={veld} aria-label="Duur">
            {[30, 45, 60, 75, 90, 120].map((m) => <option key={m} value={m}>{m} min</option>)}
          </select>
          <input inputMode="numeric" value={v.plekken} onChange={zet("plekken")} className={veld} aria-label="Plekken" placeholder="Plekken" />
        </div>
        <div className="flex gap-2">
          <input inputMode="decimal" value={v.prijs} onChange={zet("prijs")} placeholder="Prijs (leeg = gratis)" className={veld} />
          <input value={v.locatie} onChange={zet("locatie")} placeholder="Waar" maxLength={200} className={veld} />
        </div>
        <label className="flex items-center justify-between gap-3 rounded-2xl bg-vlak px-4 py-3">
          <span>Elke week</span>
          <input type="checkbox" checked={v.elkeWeek} onChange={(e) => setV({ ...v, elkeWeek: e.target.checked })} className="size-5 accent-[var(--color-accent)]" />
        </label>
        {v.elkeWeek && (
          <label className="flex flex-col gap-1 px-1 text-sm text-rustig">{v.aantal} weken
            <input type="range" min={2} max={26} value={v.aantal} onChange={(e) => setV({ ...v, aantal: Number(e.target.value) })} />
          </label>
        )}
        <Fout tekst={fout} />
        <button disabled={bezig} className={knop}>Maken</button>
      </form>
    </Onderblad>
  );
}

// --- Klanten ---------------------------------------------------------------------------------------------------------

function Klanten({ klaar }: { klaar: (t: string) => void }) {
  const laden = useCallback(() => overzicht(datumIso(plusDagen(new Date(), -60)), datumIso(new Date())), []);
  const { waarde: o, fout, setFout } = useLaden(laden);
  const [betaling, setBetaling] = useState(false);
  if (!o) return <Fout tekst={fout} />;
  // Meldingen "betaald" per reeks samen: een rittenkaart van tien lessen is één betaling.
  const groepen = new Map<string, Afspraak[]>();
  for (const b of o.betaald_gemeld) groepen.set(b.reeks || String(b.id), [...(groepen.get(b.reeks || String(b.id)) ?? []), b]);
  const open = o.saldi.reduce((t, s) => t + (s.saldo < 0 ? -s.saldo : 0), 0);
  return (
    <>
      <Fout tekst={fout} />
      {groepen.size > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className={kop}>Klant zegt: betaald</h2>
          <Lijst>
            {[...groepen.values()].map((g) => {
              const totaal = g.reduce((t, b) => t + b.prijs, 0);
              return (
                <li key={g[0].id} className={rij}>
                  <span className="min-w-0 flex-1 truncate"><b>{g[0].naam}</b> · {g[0].soort} · {bedrag(totaal)}</span>
                  <button onClick={async () => {
                    try { await betalingOntvangen(g.map((b) => b.id), totaal || null); klaar("Betaling geboekt."); } catch (e) { setFout(foutVan(e)); }
                  }} className="h-9 rounded-full bg-accent px-3 text-sm font-medium text-white">Ontvangen</button>
                </li>
              );
            })}
          </Lijst>
        </section>
      )}
      {open > 0 && (
        <div>
          <p className="text-sm text-rustig">Nog te ontvangen</p>
          <p className="text-[28px] font-bold tracking-tight tabular-nums">{bedrag(open)}</p>
        </div>
      )}
      {o.saldi.length ? (
        <Lijst>
          {o.saldi.map((s) => (
            <li key={s.sleutel} className={rij}>
              <span className="min-w-0 flex-1 truncate font-medium">{s.klant || "Zonder naam"}</span>
              <span className={`text-sm tabular-nums ${s.saldo < 0 ? "font-semibold" : "text-rustig"}`}>
                {s.saldo < 0 ? `Nog ${bedrag(-s.saldo)}` : s.saldo > 0 ? `Tegoed ${bedrag(s.saldo)}` : "Betaald"}</span>
            </li>
          ))}
        </Lijst>
      ) : <p className="text-sm text-rustig">Nog geen klanten.</p>}
      <button onClick={() => setBetaling(true)} className={knop}><Plus className="size-5" /> Betaling boeken</button>
      {betaling && <BetalingFormulier saldi={o.saldi} sluit={() => setBetaling(false)} klaar={(t) => { setBetaling(false); klaar(t); }} />}
    </>
  );
}

function BetalingFormulier({ saldi, sluit, klaar }: { saldi: Saldo[]; sluit: () => void; klaar: (t: string) => void }) {
  const [klant, setKlant] = useState("");
  const [nieuw, setNieuw] = useState("");
  const [geld, setGeld] = useState("");
  const [oms, setOms] = useState("");
  const [fout, setFout] = useState("");
  async function boeken(e: FormEvent) {
    e.preventDefault();
    const k = saldi.find((s) => s.sleutel === klant);
    if (!k && !nieuw.trim()) return setFout("Kies of vul een klant in.");
    try {
      const c = centen(geld);
      if (c <= 0) return setFout("Vul een bedrag in.");
      await post({ soort: "betaling", bedrag: c, omschrijving: oms.trim(), klant: k?.klant || nieuw.trim(), klant_id: k?.klant_id ?? null, btw: 0 });
      klaar("Betaling geboekt.");
    } catch (err) { setFout(foutVan(err)); }
  }
  return (
    <Onderblad titel="Betaling boeken" sluit={sluit}>
      <form onSubmit={boeken} className="flex flex-col gap-3">
        <select value={klant} onChange={(e) => setKlant(e.target.value)} className={veld} aria-label="Klant">
          <option value="">Nieuwe klant</option>
          {saldi.map((s) => <option key={s.sleutel} value={s.sleutel}>{s.klant || "Zonder naam"}</option>)}
        </select>
        {!klant && <input value={nieuw} onChange={(e) => setNieuw(e.target.value)} placeholder="Naam van de klant" maxLength={80} className={veld} />}
        <input inputMode="decimal" value={geld} onChange={(e) => setGeld(e.target.value)} placeholder="Bedrag, bijvoorbeeld 50,00" className={veld} />
        <input value={oms} onChange={(e) => setOms(e.target.value)} placeholder="Waarvoor, bijvoorbeeld rittenkaart" maxLength={200} className={veld} />
        <p className="px-1 text-sm text-rustig">Vooruit betaald? Dan staat het als tegoed bij de klant.</p>
        <Fout tekst={fout} />
        <button className={knop}>Boeken</button>
      </form>
    </Onderblad>
  );
}

// --- Boekhouding -----------------------------------------------------------------------------------------------------

function Boekhouding({ z, klaar, vraag }: { z: Zaak; klaar: (t: string) => void; vraag: (t: string) => void }) {
  const [soort, setSoort] = useState<Periode>("Maand");
  const [van, tot] = periode(soort);
  const laden = useCallback(() => overzicht(van, tot), [van, tot]);
  const { waarde: o, fout, setFout } = useLaden(laden);
  const [kosten, setKosten] = useState(false);
  const [zeker, setZeker] = useState<number | null>(null);
  const c = o ? cijfers(o.posten) : null;

  function exporteren(x: Overzicht) {
    const url = URL.createObjectURL(new Blob([csv(x.posten)], { type: "text/csv;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `boekhouding-${van}-${tot}.csv` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  return (
    <>
      <Pillen opties={["Maand", "Kwartaal", "Jaar"] as const} gekozen={soort} kies={setSoort} />
      <Fout tekst={fout} />
      {o && c && (
        <>
          <div className="grid grid-cols-3 gap-2">
            {([["Omzet", c.omzet], ["Kosten", c.kosten], ["Winst", c.winst]] as const).map(([label, w]) => (
              <div key={label} className="flex min-w-0 flex-col rounded-2xl bg-vlak px-3 py-3">
                <span className="text-sm text-rustig">{label}</span>
                <span className="truncate font-semibold tabular-nums">{bedrag(w)}</span>
              </div>
            ))}
          </div>
          <p className="text-sm text-rustig">Ontvangen {bedrag(c.ontvangen)}. Btw af te dragen {bedrag(c.btw_af)}, voorbelasting
            {" "}{bedrag(c.btw_voor)}, te betalen {bedrag(c.btw_saldo)}. Winst is zonder btw.</p>
          <div className="flex gap-2">
            <button onClick={() => setKosten(true)} className={`${knop} flex-1`}><Plus className="size-5" /> Kosten</button>
            {o.posten.length > 0 && <button onClick={() => exporteren(o)} className={`${knopZacht} flex-1`}>Exporteren</button>}
          </div>
          {o.posten.length > 0 && <button onClick={() => vraag(`Bekijk mijn zakelijke boekhouding van ${van} tot en met ${tot}. Leg in gewone taal `
            + "uit hoe het gaat (omzet, kosten, winst, btw) en waar ik op kan letten. Geen belastingadvies.")}
            className={knopZacht}><Vonk className="size-5" /> Uitleg van de assistent</button>}
          {o.posten.length ? (
            <Lijst>
              {o.posten.slice(0, 200).map((p) => (
                <li key={p.id} className={rij}>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate"><b className="tabular-nums">{p.soort === "kosten" ? "- " : ""}{bedrag(p.bedrag)}</b>
                      {" "}· {p.omschrijving || SOORT_NAAM[p.soort]}</span>
                    <span className="truncate text-sm text-rustig">{[datumKort(p.datum), SOORT_NAAM[p.soort], p.klant, p.categorie,
                      p.btw ? `${p.btw}% btw` : ""].filter(Boolean).join(" · ")}</span>
                  </span>
                  {zeker === p.id ? (
                    <button onClick={async () => {
                      try { await postWeg(p.id); setZeker(null); klaar("Weggehaald."); } catch (e) { setFout(foutVan(e)); }
                    }} className="h-9 rounded-full bg-red-600 px-3 text-sm font-medium text-white">Weghalen</button>
                  ) : (
                    <button onClick={() => setZeker(p.id)} className={rond} aria-label="Weghalen"><Prullenbak className="size-5" /></button>
                  )}
                </li>
              ))}
            </Lijst>
          ) : <p className="text-sm text-rustig">Nog niets in deze periode.</p>}
        </>
      )}
      {kosten && <KostenFormulier sluit={() => setKosten(false)} klaar={(t) => { setKosten(false); klaar(t); }} />}
    </>
  );
}

function KostenFormulier({ sluit, klaar }: { sluit: () => void; klaar: (t: string) => void }) {
  const [v, setV] = useState({ geld: "", oms: "", categorie: KOSTEN[0], btw: 21 as number, datum: datumIso(new Date()) });
  const [fout, setFout] = useState("");
  async function opslaan(e: FormEvent) {
    e.preventDefault();
    try {
      const c = centen(v.geld);
      if (c <= 0) return setFout("Vul een bedrag in.");
      await post({ soort: "kosten", bedrag: c, omschrijving: v.oms.trim(), btw: v.btw, categorie: v.categorie, datum: v.datum });
      klaar("Kosten opgeslagen.");
    } catch (err) { setFout(foutVan(err)); }
  }
  return (
    <Onderblad titel="Kosten" sluit={sluit}>
      <form onSubmit={opslaan} className="flex flex-col gap-3">
        <input inputMode="decimal" value={v.geld} onChange={(e) => setV({ ...v, geld: e.target.value })} placeholder="Bedrag incl. btw" className={veld} autoFocus />
        <input value={v.oms} onChange={(e) => setV({ ...v, oms: e.target.value })} placeholder="Waarvoor" maxLength={200} className={veld} />
        <div className="flex gap-2">
          <select value={v.categorie} onChange={(e) => setV({ ...v, categorie: e.target.value })} className={veld} aria-label="Soort">
            {KOSTEN.map((k) => <option key={k}>{k}</option>)}
          </select>
          <select value={v.btw} onChange={(e) => setV({ ...v, btw: Number(e.target.value) })} className={`${veld} w-28 flex-none`} aria-label="Btw">
            {BTW.map((b) => <option key={b} value={b}>{b}% btw</option>)}
          </select>
        </div>
        <input type="date" value={v.datum} onChange={(e) => setV({ ...v, datum: e.target.value })} className={veld} aria-label="Datum" />
        <Fout tekst={fout} />
        <button className={knop}>Opslaan</button>
      </form>
    </Onderblad>
  );
}

// --- Instellen -------------------------------------------------------------------------------------------------------

function Instellen({ z, sluit, bewaar }: { z: Zaak; sluit: () => void; bewaar: (z: Zaak) => Promise<void> }) {
  const [v, setV] = useState(z);
  const [fout, setFout] = useState("");
  const schakel = (label: string, sleutel: "groepslessen" | "afspraken") => (
    <label className="flex items-center justify-between gap-3 rounded-2xl bg-vlak px-4 py-3">
      <span>{label}</span>
      <input type="checkbox" checked={v[sleutel]} onChange={(e) => setV({ ...v, [sleutel]: e.target.checked })} className="size-5 accent-[var(--color-accent)]" />
    </label>
  );
  return (
    <Onderblad titel="Je zaak" sluit={sluit}>
      <input value={v.naam} onChange={(e) => setV({ ...v, naam: e.target.value })} placeholder="Naam van je zaak" maxLength={60} className={veld} />
      <Pillen opties={Object.values(SOORTEN_ZAAK)} gekozen={SOORTEN_ZAAK[v.soort] ?? ""}
        kies={(t) => setV({ ...v, soort: Object.keys(SOORTEN_ZAAK).find((k) => SOORTEN_ZAAK[k] === t) ?? v.soort })} />
      {schakel("Groepslessen", "groepslessen")}
      {schakel("Afspraken met klanten", "afspraken")}
      <label className="flex flex-col gap-1">
        <span className="px-1 text-sm text-rustig">Btw op je diensten (prijzen zijn inclusief btw)</span>
        <select value={v.btw} onChange={(e) => setV({ ...v, btw: Number(e.target.value) })} className={veld}>
          {BTW.map((b) => <option key={b} value={b}>{b}%</option>)}
        </select>
      </label>
      <p className="px-1 text-sm text-rustig">Sport- en beweegdiensten vallen vaak onder 9%. Twijfel je, vraag het je boekhouder.</p>
      <Fout tekst={fout} />
      <button onClick={async () => { try { await bewaar({ ...v, naam: v.naam.trim() }); } catch (e) { setFout(foutVan(e)); } }} className={knop}>Opslaan</button>
    </Onderblad>
  );
}

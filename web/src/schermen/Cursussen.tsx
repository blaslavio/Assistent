// Cursussen en trainingen in een community: leden volgen lessen en vinken ze af, de eigenaar maakt en ordent ze.
// Daarnaast abonnementen (per maand of per jaar) en pakketten (een paar cursussen samen voor één prijs).
import { useCallback, useEffect, useState } from "react";
import { Onderblad } from "./Onderblad";
import { Schakelaar } from "./instellingen-ui";
import { Boek, Klok, Kruis, Plus, Ster, Terug, Vinkje } from "../iconen";
import { mascotteZeg } from "../mascotte";
import { aanbod, abonneren, kopen, lesKlaar, lesOpslaan, lesWijzigen, lezen, opslaan, opzeggen, pakketKopen, pakketOpslaan,
  pakketWeg, perPeriode, planOpslaan, prijsTekst, videoSpeler, cursusLink, duurTekst, soortRegel, voorbij, wanneerTekst,
  SOORTEN, type Aanbod, type Cursus, type Details, type Les, type Pakket, type Periode, type Plan, type Soort } from "../lib/cursus";
import { linkNetjes } from "../lib/winkelopmaak";

const foutVan = (e: unknown) => (e instanceof Error && e.message ? e.message : "Dat lukte niet. Probeer het opnieuw.");
const veld = "h-12 w-full rounded-2xl bg-vlak px-4 outline-none placeholder:text-zacht focus:ring-2 focus:ring-accent";
const vlak = "w-full rounded-2xl bg-vlak px-4 py-3 outline-none placeholder:text-zacht focus:ring-2 focus:ring-accent";
const knop = "h-12 rounded-2xl bg-accent px-4 font-medium text-white disabled:opacity-40";
const stil = "flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-vlak font-medium";
const kop = "px-1 text-sm font-medium text-rustig";
const euro = (cent: number) => (cent ? String(cent / 100).replace(".", ",") : "");
const bedrag = (tekst: string) => Number(tekst.replace(/\./g, "").replace(",", ".")) || 0;
const datum = (t: string) => new Date(t).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });

/** Twee of drie keuzes naast elkaar, zoals Cursus of Training. */
function Keuze<T extends string>({ waarde, zet, opties, label }: { waarde: T; zet: (w: T) => void; opties: [T, string][]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-1 rounded-2xl bg-vlak p-1">
      {opties.map(([k, tekst]) => (
        <button key={k} type="button" role="radio" aria-checked={waarde === k} onClick={() => zet(k)}
          className={`h-10 flex-1 rounded-xl text-[15px] font-medium ${waarde === k ? "bg-white shadow-sm dark:bg-[#2a2a31]" : "text-rustig"}`}>{tekst}</button>
      ))}
    </div>
  );
}

function Akkoord({ aan, zet }: { aan: boolean; zet: (a: boolean) => void }) {
  return (
    <label className="flex items-start gap-3 text-sm">
      <input type="checkbox" checked={aan} onChange={(e) => zet(e.target.checked)} className="mt-0.5 size-5 accent-accent" />
      <span>Ik wil meteen beginnen. Ik weet dat er dan geen bedenktijd is.</span>
    </label>
  );
}

export function Cursussen({ community, start = null }: { community: number; start?: number | null }) {
  const [a, setA] = useState<Aanbod | null>(null);
  const [open, setOpen] = useState<number | null>(start);
  const [blad, setBlad] = useState<null | "cursus" | "plan" | "pakket" | Plan | Pakket>(null);
  const [bekijk, setBekijk] = useState<Pakket | null>(null);
  const [fout, setFout] = useState("");
  const laden = useCallback(() => aanbod(community).then(setA).catch((e) => setFout(foutVan(e))), [community]);
  useEffect(() => { laden(); }, [laden]);

  if (open !== null) return <CursusScherm id={open} terug={() => { setOpen(null); laden(); }} />;
  const plannen = a?.plannen.filter((p) => p.actief || a.beheer) ?? [];
  const sluit = () => setBlad(null);
  const klaar = () => { setBlad(null); laden(); };
  return (
    <div className="flex flex-col gap-4 px-6 pb-8">
      {a === null && !fout && <p className="bezig-tekst text-rustig">Laden</p>}
      {a?.abonnement && <JouwAbonnement ab={a.abonnement} klaar={laden} fout={setFout} />}

      {a && !a.abonnement && plannen.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className={kop}>Abonnementen</h3>
          {plannen.map((p) => (
            <div key={p.id} className="flex flex-col gap-2 rounded-2xl bg-vlak p-4">
              <div className="flex items-baseline gap-2">
                <span className="flex-1 font-semibold">{p.naam}{!p.actief ? " · uit" : ""}</span>
                <span className="text-sm font-medium">{perPeriode(p.prijs_cent, p.periode)}</span>
              </div>
              {p.voordelen && <p className="whitespace-pre-line text-[15px] text-rustig">{p.voordelen}</p>}
              {a.beheer ? (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-rustig">{p.abonnees ?? 0} {p.abonnees === 1 ? "abonnee" : "abonnees"}</span>
                  <button onClick={() => setBlad(p)} className="font-medium text-accent">Aanpassen</button>
                </div>
              ) : (
                <button onClick={() => abonneren(p.id).catch((e) => setFout(foutVan(e)))} className={knop}>Abonneren</button>
              )}
            </div>
          ))}
          {!a.beheer && <p className="px-1 text-[13px] text-rustig">Per {plannen.every((p) => p.periode === "jaar") ? "jaar" : "maand of jaar"} opzegbaar. Je houdt toegang tot het eind van de betaalde periode.</p>}
        </section>
      )}

      {a && a.pakketten.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className={kop}>Pakketten</h3>
          {a.pakketten.map((k) => (
            <button key={k.id} onClick={() => (a.beheer ? setBlad(k) : setBekijk(k))} className="flex w-full items-center gap-3 rounded-2xl bg-vlak p-4 text-left">
              <Ster className="size-6 shrink-0 text-accent" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-medium">{k.titel}</span>
                <span className="text-[13px] text-rustig">{k.cursussen.length} samen{k.gekocht ? " · gekocht" : ""}{!k.gepubliceerd ? " · concept" : ""}{a.beheer && k.kopers ? ` · ${k.kopers} keer verkocht` : ""}</span>
              </span>
              {!k.gekocht && <span className="shrink-0 text-sm font-medium">{prijsTekst(k.prijs_cent)}</span>}
            </button>
          ))}
        </section>
      )}

      {a && a.cursussen.length === 0 && (
        <p className="text-rustig">{a.beheer ? "Maak een cursus of training met lessen voor je leden: gratis, te koop, in een pakket of bij een abonnement." : "Deze community heeft nog geen cursussen of trainingen."}</p>
      )}
      {a && a.cursussen.length > 0 && (
        <section className="flex flex-col gap-2">
          {(plannen.length > 0 || a.pakketten.length > 0) && <h3 className={kop}>Cursussen en trainingen</h3>}
          <ul className="flex flex-col gap-2">
            {a.cursussen.map((c) => (
              <li key={c.id}>
                <button onClick={() => setOpen(c.id)}
                  className={`flex w-full items-center gap-3 rounded-2xl bg-vlak px-4 py-3 text-left ${voorbij(c) ? "opacity-60" : ""}`}>
                  <SoortTeken c={c} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium">{c.titel}</span>
                    <span className="truncate text-[13px] text-rustig">
                      {soortRegel(c)}{c.soort === "cursus" ? ` · ${voortgang(c)}` : ""}{voorbij(c) ? " · geweest" : ""}{!c.gepubliceerd ? " · concept" : ""}
                    </span>
                  </span>
                  {!c.toegang && <span className="shrink-0 text-sm font-medium">{c.voor_abonnees ? "Abonnement" : prijsTekst(c.prijs_cent)}</span>}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {a?.beheer && (
        <div className="flex gap-2">
          <button onClick={() => setBlad("cursus")} className={stil}><Plus className="size-5" /> Aanbod</button>
          <button onClick={() => setBlad("plan")} className={stil}><Plus className="size-5" /> Abonnement</button>
          <button onClick={() => setBlad("pakket")} disabled={a.cursussen.length < 2} className={`${stil} disabled:opacity-40`}><Plus className="size-5" /> Pakket</button>
        </div>
      )}
      {fout && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{fout}</p>}
      {a && blad === "cursus" && <CursusInstellen community={community} kanVerkopen={a.kan_ontvangen} sluit={sluit}
        klaar={(id) => { setBlad(null); laden(); setOpen(id); }} />}
      {a && (blad === "plan" || (blad && typeof blad === "object" && "periode" in blad)) &&
        <PlanInstellen community={community} plan={blad === "plan" ? undefined : blad as Plan} kanVerkopen={a.kan_ontvangen} sluit={sluit} klaar={klaar} />}
      {a && (blad === "pakket" || (blad && typeof blad === "object" && "cursussen" in blad)) &&
        <PakketInstellen community={community} pakket={blad === "pakket" ? undefined : blad as Pakket} cursussen={a.cursussen}
          kanVerkopen={a.kan_ontvangen} sluit={sluit} klaar={klaar} />}
      {bekijk && <PakketBekijken pakket={bekijk} sluit={() => setBekijk(null)} />}
    </div>
  );
}

function JouwAbonnement({ ab, klaar, fout }: { ab: NonNullable<Aanbod["abonnement"]>; klaar: () => void; fout: (t: string) => void }) {
  const [bezig, setBezig] = useState(false);
  const doe = (terug: boolean) => {
    setBezig(true);
    opzeggen(ab.plan, terug).then(klaar).catch((e) => fout(foutVan(e))).finally(() => setBezig(false));
  };
  return (
    <section className="flex flex-col gap-2 rounded-2xl bg-vlak p-4">
      <span className="font-semibold">Je abonnement: {ab.naam}</span>
      <span className="text-[15px] text-rustig">
        {ab.opzeggen ? `Opgezegd. Je houdt toegang tot ${ab.tot ? datum(ab.tot) : "het eind van de periode"}.`
          : `Loopt per ${ab.periode}${ab.tot ? `, volgende betaling op ${datum(ab.tot)}` : ""}.`}
        {ab.status === "past_due" ? " De laatste betaling is nog niet gelukt." : ""}
      </span>
      <button disabled={bezig} onClick={() => doe(ab.opzeggen)} className="self-start text-sm font-medium text-accent disabled:opacity-40">
        {ab.opzeggen ? "Toch doorgaan" : "Opzeggen"}</button>
    </section>
  );
}

function PakketBekijken({ pakket, sluit }: { pakket: Pakket; sluit: () => void }) {
  const [akkoord, setAkkoord] = useState(false);
  const [fout, setFout] = useState("");
  const los = pakket.cursussen.reduce((s, c) => s + c.prijs_cent, 0);
  return (
    <Onderblad titel={pakket.titel} sluit={sluit}>
      {pakket.omschrijving && <p className="whitespace-pre-line text-[15px] text-rustig">{pakket.omschrijving}</p>}
      <ul className="flex flex-col divide-y divide-lijn rounded-2xl bg-vlak">
        {pakket.cursussen.map((c) => (
          <li key={c.id} className="flex items-center gap-3 px-4 py-3">
            <Boek className="size-5 shrink-0 text-accent" />
            <span className="flex-1">{c.titel}{c.soort === "training" ? " (training)" : ""}</span>
            {c.toegang && <span className="text-[13px] text-rustig">Heb je al</span>}
          </li>
        ))}
      </ul>
      {pakket.gekocht ? <p className="font-medium">Gekocht. Alles staat bij Cursussen en trainingen.</p> : <>
        <p className="text-lg font-semibold">{prijsTekst(pakket.prijs_cent)}{los > pakket.prijs_cent ? <span className="ml-2 text-sm font-normal text-rustig">los {prijsTekst(los)}</span> : null}</p>
        <Akkoord aan={akkoord} zet={setAkkoord} />
        {fout && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{fout}</p>}
        <button disabled={!akkoord} onClick={() => pakketKopen(pakket.id).catch((e) => setFout(foutVan(e)))} className={knop}>Pakket kopen</button>
      </>}
    </Onderblad>
  );
}

function PlanInstellen({ community, plan, kanVerkopen, sluit, klaar }: { community: number; plan?: Plan; kanVerkopen: boolean;
  sluit: () => void; klaar: () => void }) {
  const [naam, setNaam] = useState(plan?.naam ?? "");
  const [periode, setPeriode] = useState<Periode>(plan?.periode ?? "maand");
  const [prijs, setPrijs] = useState(euro(plan?.prijs_cent ?? 0));
  const [voordelen, setVoordelen] = useState(plan?.voordelen ?? "");
  const [actief, setActief] = useState(plan?.actief ?? true);
  const [fout, setFout] = useState("");
  const bewaar = () => planOpslaan(community, plan?.id ?? null, { naam, periode, prijs: bedrag(prijs), voordelen, actief })
    .then(klaar).catch((e) => setFout(foutVan(e)));
  return (
    <Onderblad titel={plan ? "Abonnement aanpassen" : "Nieuw abonnement"} sluit={sluit}>
      <input value={naam} onChange={(e) => setNaam(e.target.value)} maxLength={60} placeholder="Naam, bijvoorbeeld Alles onbeperkt" aria-label="Naam" className={veld} />
      <Keuze label="Hoe vaak betalen" waarde={periode} zet={setPeriode} opties={[["maand", "Per maand"], ["jaar", "Per jaar"]]} />
      <input value={prijs} onChange={(e) => setPrijs(e.target.value)} inputMode="decimal" placeholder={`Prijs per ${periode} in euro`} aria-label="Prijs" className={veld} />
      <textarea value={voordelen} onChange={(e) => setVoordelen(e.target.value)} rows={3} maxLength={1000}
        placeholder="Wat krijg je erbij? Bijvoorbeeld alle trainingen en elke maand een live les." aria-label="Wat je krijgt" className={vlak} />
      <p className="px-1 text-[13px] text-rustig">Cursussen en trainingen met "Bij abonnement" zijn inbegrepen. Een nieuwe prijs geldt voor nieuwe abonnees.</p>
      {plan && <Schakelaar label="Te koop" uitleg="Uit: niemand kan nog nieuw abonneren. Wie al abonnee is, blijft dat." aan={actief} zet={setActief} />}
      {!kanVerkopen && <p className="px-1 text-[13px] text-rustig">Verkopen kan zodra je betalingen ontvangt (Instellingen › Betalingen).</p>}
      {fout && <p role="alert" className="px-1 text-sm text-red-600">{fout}</p>}
      <button onClick={bewaar} disabled={!naam.trim() || !bedrag(prijs)} className={knop}>Bewaren</button>
    </Onderblad>
  );
}

function PakketInstellen({ community, pakket, cursussen, kanVerkopen, sluit, klaar }: { community: number; pakket?: Pakket;
  cursussen: Cursus[]; kanVerkopen: boolean; sluit: () => void; klaar: () => void }) {
  const [titel, setTitel] = useState(pakket?.titel ?? "");
  const [omschrijving, setOmschrijving] = useState(pakket?.omschrijving ?? "");
  const [prijs, setPrijs] = useState(euro(pakket?.prijs_cent ?? 0));
  const [gekozen, setGekozen] = useState<number[]>(pakket?.cursussen.map((c) => c.id) ?? []);
  const [gepubliceerd, setGepubliceerd] = useState(pakket?.gepubliceerd ?? false);
  const [fout, setFout] = useState("");
  const los = cursussen.filter((c) => gekozen.includes(c.id)).reduce((s, c) => s + c.prijs_cent, 0);
  const wissel = (id: number) => setGekozen((g) => (g.includes(id) ? g.filter((x) => x !== id) : [...g, id]));
  const bewaar = () => pakketOpslaan(community, pakket?.id ?? null, { titel, omschrijving, prijs: bedrag(prijs), cursussen: gekozen, gepubliceerd })
    .then(klaar).catch((e) => setFout(foutVan(e)));
  return (
    <Onderblad titel={pakket ? "Pakket aanpassen" : "Nieuw pakket"} sluit={sluit}>
      <input value={titel} onChange={(e) => setTitel(e.target.value)} maxLength={100} placeholder="Naam, bijvoorbeeld Startpakket" aria-label="Naam" className={veld} />
      <textarea value={omschrijving} onChange={(e) => setOmschrijving(e.target.value)} rows={2} maxLength={2000} placeholder="Voor wie is dit pakket?" aria-label="Omschrijving" className={vlak} />
      <span className={kop}>Wat zit erin</span>
      <ul className="flex flex-col divide-y divide-lijn rounded-2xl bg-vlak">
        {cursussen.map((c) => (
          <li key={c.id}>
            <label className="flex items-center gap-3 px-4 py-3">
              <input type="checkbox" checked={gekozen.includes(c.id)} onChange={() => wissel(c.id)} className="size-5 accent-accent" />
              <span className="flex-1">{c.titel}{c.soort === "training" ? " (training)" : ""}</span>
              {c.prijs_cent > 0 && <span className="text-[13px] text-rustig">{prijsTekst(c.prijs_cent)}</span>}
            </label>
          </li>
        ))}
      </ul>
      <input value={prijs} onChange={(e) => setPrijs(e.target.value)} inputMode="decimal" placeholder={los ? `Prijs (los samen ${prijsTekst(los)})` : "Prijs in euro"} aria-label="Prijs" className={veld} />
      <Schakelaar label="Te koop" uitleg="Leden zien het pakket en kunnen het kopen." aan={gepubliceerd} zet={setGepubliceerd} />
      {!kanVerkopen && <p className="px-1 text-[13px] text-rustig">Verkopen kan zodra je betalingen ontvangt (Instellingen › Betalingen).</p>}
      {fout && <p role="alert" className="px-1 text-sm text-red-600">{fout}</p>}
      <div className="flex gap-2">
        {pakket && <button onClick={() => pakketWeg(pakket.id).then(klaar).catch((e) => setFout(foutVan(e)))} className="h-12 rounded-2xl bg-vlak px-4 font-medium text-red-600 dark:text-red-400">Weghalen</button>}
        <button onClick={bewaar} disabled={!titel.trim() || gekozen.length < 2 || !bedrag(prijs)} className={`${knop} flex-1`}>Bewaren</button>
      </div>
    </Onderblad>
  );
}

/** Links in de lijst: een training toont de datum, een dienst een klok, een cursus een boek. */
function SoortTeken({ c }: { c: Pick<Cursus, "soort" | "details"> }) {
  const w = c.soort === "training" && c.details.wanneer ? new Date(c.details.wanneer) : null;
  if (w && !Number.isNaN(w.getTime())) return (
    <span className="flex size-11 shrink-0 flex-col items-center justify-center rounded-xl bg-white leading-none dark:bg-black/30">
      <span className="text-[17px] font-semibold">{w.getDate()}</span>
      <span className="text-[11px] uppercase text-accent">{w.toLocaleDateString("nl-NL", { month: "short" }).replace(".", "")}</span>
    </span>
  );
  const Icoon = c.soort === "dienst" ? Klok : Boek;
  return <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white dark:bg-black/30"><Icoon className="size-5 text-accent" /></span>;
}

const vol = (c: Pick<Cursus, "soort" | "details" | "deelnemers">) =>
  c.soort === "training" && !!c.details.plaatsen && c.deelnemers >= c.details.plaatsen;

/** Wanneer en waar een training is, of hoe een dienst gaat; met meedoen of een moment kiezen. */
function Afspraak({ c }: { c: Cursus & { beheer?: boolean } }) {
  const d = c.details;
  const regels = [
    c.soort === "training" ? wanneerTekst(d.wanneer) : "",
    duurTekst(d.duur),
    d.waar === "locatie" ? d.plek || "Op locatie" : "Online",
    c.soort === "training" && d.plaatsen ? (vol(c) ? "Vol" : `Nog ${d.plaatsen - c.deelnemers} van ${d.plaatsen} plaatsen`) : "",
  ].filter(Boolean);
  const meedoen = c.toegang && d.waar !== "locatie" && d.link && !voorbij(c);
  const boeken = c.soort === "dienst" && d.boeklink && (c.toegang || (!c.prijs_cent && !c.voor_abonnees));
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-vlak p-4">
      <div className="flex items-center gap-3">
        <SoortTeken c={c} />
        <span className="flex min-w-0 flex-col">
          <span className="font-medium">{regels[0]}</span>
          <span className="text-[13px] text-rustig">{regels.slice(1).join(" · ")}{voorbij(c) ? " · geweest" : ""}</span>
        </span>
      </div>
      {meedoen && <a href={d.link} target="_blank" rel="noopener noreferrer"
        className={boeken ? "flex h-12 items-center justify-center rounded-2xl bg-white font-medium dark:bg-black/30" : `${knop} flex items-center justify-center`}>
        {c.soort === "dienst" ? "Online meedoen" : "Meedoen"}</a>}
      {boeken && <a href={d.boeklink} target="_blank" rel="noopener noreferrer" className={`${knop} flex items-center justify-center`}>Kies een moment</a>}
      {c.toegang && !c.beheer && d.waar !== "locatie" && !d.link && c.soort === "training" && (
        <p className="text-[13px] text-rustig">De link om mee te doen komt hier te staan.</p>
      )}
    </div>
  );
}

async function delen(titel: string, url: string, melding: (t: string) => void) {
  if (navigator.share) {
    try { await navigator.share({ title: titel, url }); return; } catch (e) { if ((e as Error).name === "AbortError") return; }
  }
  try { await navigator.clipboard.writeText(url); melding("Link gekopieerd."); } catch { melding(url); }
}

function voortgang(c: Pick<Cursus, "lessen" | "klaar" | "minuten" | "toegang">) {
  const lessen = `${c.lessen} ${c.lessen === 1 ? "les" : "lessen"}`;
  if (c.toegang && c.klaar > 0) return `${c.klaar} van ${lessen} klaar`;
  return c.minuten ? `${lessen} · ${c.minuten} min` : lessen;
}

function CursusInstellen({ community, cursus, kanVerkopen, sluit, klaar }: { community: number; cursus?: Cursus;
  kanVerkopen: boolean; sluit: () => void; klaar: (id: number) => void }) {
  const [titel, setTitel] = useState(cursus?.titel ?? "");
  const [omschrijving, setOmschrijving] = useState(cursus?.omschrijving ?? "");
  const [soort, setSoort] = useState<Soort>(cursus?.soort ?? "cursus");
  const [d, setD] = useState<Details>(cursus?.details ?? {});
  const zet = (x: Partial<Details>) => setD((o) => ({ ...o, ...x }));
  const [toegang, setToegang] = useState<"gratis" | "koop" | "abonnement">(
    cursus?.voor_abonnees ? "abonnement" : cursus?.prijs_cent ? "koop" : "gratis");
  const [prijs, setPrijs] = useState(euro(cursus?.prijs_cent ?? 0));
  const [gepubliceerd, setGepubliceerd] = useState(cursus?.gepubliceerd ?? false);
  const [fout, setFout] = useState("");
  const getal = (t: string) => Math.max(0, Math.floor(Number(t) || 0));
  const linkFout = (u?: string) => !!u && !linkNetjes(u);
  async function bewaar() {
    setFout("");
    try {
      const details: Details = { ...d, link: linkNetjes(d.link ?? ""), boeklink: linkNetjes(d.boeklink ?? "") };
      const r = await opslaan(community, cursus?.id ?? null, { titel, omschrijving, gepubliceerd, soort, details,
        voorAbonnees: toegang === "abonnement", prijs: toegang === "koop" ? bedrag(prijs) : 0 });
      klaar(r.id ?? cursus!.id);
    } catch (e) {
      setFout(foutVan(e));
    }
  }
  const naam = SOORTEN.find(([k]) => k === soort)![1];
  const vraag = { cursus: "Wat leer je in deze cursus?", training: "Wat doen jullie in deze training?",
    dienst: "Wat bied je aan, bijvoorbeeld coaching of advies?" }[soort];
  return (
    <Onderblad titel={cursus ? `${naam} aanpassen` : "Nieuw aanbod"} sluit={sluit}>
      <Keuze label="Soort" waarde={soort} zet={setSoort} opties={SOORTEN} />
      <input value={titel} onChange={(e) => setTitel(e.target.value)} maxLength={100} placeholder="Titel" aria-label="Titel" className={veld} />
      <textarea value={omschrijving} onChange={(e) => setOmschrijving(e.target.value)} rows={2} maxLength={2000}
        placeholder={vraag} aria-label="Omschrijving" className={vlak} />
      {soort === "cursus" && (
        <Keuze label="Niveau" waarde={d.niveau || "iedereen"} zet={(niveau) => zet({ niveau })}
          opties={[["iedereen", "Iedereen"], ["beginner", "Beginner"], ["gevorderd", "Gevorderd"]]} />
      )}
      {soort === "training" && (
        <label className="flex flex-col gap-1.5">
          <span className={kop}>Wanneer</span>
          <input type="datetime-local" value={d.wanneer ?? ""} onChange={(e) => zet({ wanneer: e.target.value.slice(0, 16) })}
            aria-label="Wanneer" className={veld} />
        </label>
      )}
      {soort !== "cursus" && <>
        <div className="flex gap-2">
          <input value={d.duur || ""} onChange={(e) => zet({ duur: getal(e.target.value) })} inputMode="numeric"
            placeholder="Duur in minuten" aria-label="Duur in minuten" className={veld} />
          {soort === "training" && (
            <input value={d.plaatsen || ""} onChange={(e) => zet({ plaatsen: getal(e.target.value) })} inputMode="numeric"
              placeholder="Plaatsen" aria-label="Aantal plaatsen" className={veld} />
          )}
        </div>
        <Keuze label="Waar" waarde={d.waar ?? "online"} zet={(waar) => zet({ waar })} opties={[["online", "Online"], ["locatie", "Op locatie"]]} />
        {(d.waar ?? "online") === "online"
          ? <input value={d.link ?? ""} onChange={(e) => zet({ link: e.target.value })} inputMode="url" maxLength={300}
            placeholder="Link om mee te doen (Zoom, Meet, Teams)" aria-label="Link om mee te doen"
            className={`${veld} ${linkFout(d.link) ? "ring-2 ring-red-500" : ""}`} />
          : <input value={d.plek ?? ""} onChange={(e) => zet({ plek: e.target.value })} maxLength={200}
            placeholder="Adres of plaats" aria-label="Adres of plaats" className={veld} />}
        {(d.waar ?? "online") === "online" && <p className="-mt-2 px-1 text-[13px] text-rustig">Alleen deelnemers zien deze link.</p>}
      </>}
      {soort === "dienst" && (
        <input value={d.boeklink ?? ""} onChange={(e) => zet({ boeklink: e.target.value })} inputMode="url" maxLength={300}
          placeholder="Link om een moment te kiezen (je boekpagina)" aria-label="Link om een moment te kiezen"
          className={`${veld} ${linkFout(d.boeklink) ? "ring-2 ring-red-500" : ""}`} />
      )}
      <Keuze label="Wie mag meedoen" waarde={toegang} zet={setToegang}
        opties={[["gratis", "Gratis"], ["koop", "Te koop"], ["abonnement", "Abonnement"]]} />
      {toegang === "koop" && <input value={prijs} onChange={(e) => setPrijs(e.target.value)} inputMode="decimal"
        placeholder={soort === "dienst" ? "Prijs per keer in euro" : "Prijs in euro"} aria-label="Prijs" className={veld} />}
      {toegang !== "gratis" && !kanVerkopen && <p className="px-1 text-[13px] text-rustig">Verkopen kan zodra je betalingen ontvangt (Instellingen › Betalingen).</p>}
      <Schakelaar label="Zichtbaar voor leden" uitleg={soort === "cursus" ? "Zet dit aan als de lessen klaar zijn." : "Zet dit aan als alles klopt."}
        aan={gepubliceerd} zet={setGepubliceerd} />
      {fout && <p role="alert" className="px-1 text-sm text-red-600">{fout}</p>}
      <button onClick={bewaar} disabled={!titel.trim() || (toegang === "koop" && !bedrag(prijs)) || linkFout(d.link) || linkFout(d.boeklink)
        || (soort === "training" && !d.wanneer)} className={knop}>Bewaren</button>
    </Onderblad>
  );
}

function CursusScherm({ id, terug }: { id: number; terug: () => void }) {
  const [c, setC] = useState<Awaited<ReturnType<typeof lezen>> | null>(null);
  const [les, setLes] = useState<Les | null>(null);
  const [bewerk, setBewerk] = useState<Les | "nieuw" | "cursus" | null>(null);
  const [fout, setFout] = useState("");
  const [akkoord, setAkkoord] = useState(false);
  const [melding, setMelding] = useState("");
  const laden = useCallback(() => lezen(id).then(setC).catch((e) => setFout(foutVan(e))), [id]);
  useEffect(() => { laden(); }, [laden]);
  const doe = (f: () => Promise<unknown>) => f().then(laden).catch((e) => setFout(foutVan(e)));

  async function afvinken(l: Les) {
    await doe(() => lesKlaar(l.id, !l.klaar));
    if (!l.klaar && c && c.klaar + 1 === c.lessen) mascotteZeg(`Cursus ${c.titel} helemaal klaar. Knap gedaan!`);
  }

  if (les && c) {
    const v = videoSpeler(les.video ?? "");
    const volgende = c.les_lijst[c.les_lijst.findIndex((x) => x.id === les.id) + 1];
    return (
      <div className="flex flex-col gap-4 px-6 pb-8">
        <button onClick={() => { setLes(null); laden(); }} className="-ml-2 flex h-10 items-center gap-1 self-start pr-3 text-rustig"><Terug className="size-5" /> {c.titel}</button>
        <h2 className="text-xl font-semibold">{les.titel}</h2>
        {v?.soort === "embed" && <iframe src={v.src} title={les.titel} allow="fullscreen; picture-in-picture" className="aspect-video w-full rounded-2xl" />}
        {v?.soort === "bestand" && <video src={v.src} controls playsInline className="w-full rounded-2xl" />}
        {v?.soort === "link" && <a href={v.src} target="_blank" rel="noreferrer" className="font-medium text-accent">Video openen</a>}
        {les.inhoud && <p className="whitespace-pre-line text-[15px] leading-relaxed">{les.inhoud}</p>}
        <button onClick={async () => { await afvinken(les); if (volgende && !les.klaar) setLes(volgende); else setLes(null); }} className={knop}>
          {les.klaar ? "Toch nog niet klaar" : volgende ? "Klaar, volgende les" : "Klaar"}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 px-6 pb-8">
      <div className="flex items-center gap-2">
        <button onClick={terug} aria-label="Terug naar cursussen en trainingen" className="-ml-2 flex size-10 items-center justify-center text-rustig"><Terug className="size-5" /></button>
        <h2 className="min-w-0 flex-1 truncate text-xl font-semibold">{c?.titel ?? ""}</h2>
        {c && <button onClick={() => delen(c.titel, cursusLink(c.id), setMelding)} className="text-sm font-medium text-accent">Delen</button>}
        {c?.beheer && <button onClick={() => setBewerk("cursus")} className="ml-2 text-sm font-medium text-accent">Aanpassen</button>}
      </div>
      {melding && <p role="status" className="-mt-2 break-all text-[13px] text-rustig">{melding}</p>}
      {c && <>
        {c.omschrijving && <p className="whitespace-pre-line text-[15px] text-rustig">{c.omschrijving}</p>}
        {c.soort !== "cursus" && <Afspraak c={c} />}
        <p className="text-[13px] text-rustig">{c.soort === "cursus" ? `${soortRegel(c)} · ${voortgang(c)}` : `${c.deelnemers} ${c.deelnemers === 1 ? "deelnemer" : "deelnemers"}`}
          {c.beheer && c.kopers ? ` · ${c.kopers} keer verkocht` : ""}</p>
        {c.toegang && c.lessen > 0 && (
          <div className="h-1.5 overflow-hidden rounded-full bg-lijn"><div className="h-full rounded-full bg-accent" style={{ width: `${(c.klaar / c.lessen) * 100}%` }} /></div>
        )}
        {!c.toegang && c.voor_abonnees && (
          <p className="rounded-2xl bg-vlak p-4 text-[15px]">Hoort bij een abonnement op deze community. Ga terug om er een te kiezen.</p>
        )}
        {!c.toegang && !c.voor_abonnees && (
          <div className="flex flex-col gap-3 rounded-2xl bg-vlak p-4">
            <span className="text-lg font-semibold">{prijsTekst(c.prijs_cent)}</span>
            <Akkoord aan={akkoord} zet={setAkkoord} />
            <button disabled={!akkoord || vol(c)} onClick={() => kopen(c.id).catch((e) => setFout(foutVan(e)))} className={knop}>
              {vol(c) ? "Vol" : c.soort === "training" ? "Inschrijven" : "Kopen"}</button>
          </div>
        )}
        {(c.soort === "cursus" || c.les_lijst.length > 0) && c.soort !== "cursus" && <h3 className={kop}>Materiaal</h3>}
        {(c.soort === "cursus" || c.les_lijst.length > 0) && <ul className="flex flex-col divide-y divide-lijn rounded-2xl bg-vlak">
          {c.les_lijst.map((l, n) => (
            <li key={l.id} className="flex items-center gap-3 px-4 py-3">
              {c.toegang ? (
                <button onClick={() => afvinken(l)} aria-label={l.klaar ? `${l.titel} niet klaar` : `${l.titel} klaar`}
                  className={`flex size-6 shrink-0 items-center justify-center rounded-full border-2 ${l.klaar ? "border-accent bg-accent text-white" : "border-lijn"}`}>
                  {l.klaar && <Vinkje className="size-3.5" />}
                </button>
              ) : <span className="w-6 shrink-0 text-center text-sm text-zacht">{n + 1}</span>}
              <button disabled={!c.toegang} onClick={() => setLes(l)} className="flex min-w-0 flex-1 flex-col text-left">
                <span className="truncate">{l.titel}</span>
                {l.minuten > 0 && <span className="text-[13px] text-rustig">{l.minuten} min</span>}
              </button>
              {c.beheer && <>
                <button aria-label="Eerder" disabled={n === 0} onClick={() => doe(() => lesWijzigen(l.id, "op"))} className="flex size-8 items-center justify-center text-zacht disabled:opacity-30"><Terug className="size-4 rotate-90" /></button>
                <button aria-label="Bewerken" onClick={() => setBewerk(l)} className="text-sm text-accent">Wijzig</button>
                <button aria-label="Weghalen" onClick={() => doe(() => lesWijzigen(l.id, "weg"))} className="flex size-8 items-center justify-center text-zacht"><Kruis className="size-4" /></button>
              </>}
            </li>
          ))}
          {c.les_lijst.length === 0 && <li className="px-4 py-3 text-rustig">Nog geen lessen.</li>}
        </ul>}
        {c.beheer && (
          <button onClick={() => setBewerk("nieuw")} className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-vlak font-medium">
            <Plus className="size-5" /> {c.soort === "cursus" ? "Les toevoegen" : "Materiaal toevoegen"}</button>
        )}
      </>}
      {fout && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{fout}</p>}
      {c && bewerk === "cursus" && <CursusInstellen community={c.community} cursus={c} kanVerkopen sluit={() => setBewerk(null)}
        klaar={() => { setBewerk(null); laden(); }} />}
      {c && bewerk && bewerk !== "cursus" && <LesInstellen cursus={c.id} les={bewerk === "nieuw" ? undefined : bewerk}
        sluit={() => setBewerk(null)} klaar={() => { setBewerk(null); laden(); }} />}
    </div>
  );
}

function LesInstellen({ cursus, les, sluit, klaar }: { cursus: number; les?: Les; sluit: () => void; klaar: () => void }) {
  const [titel, setTitel] = useState(les?.titel ?? "");
  const [inhoud, setInhoud] = useState(les?.inhoud ?? "");
  const [video, setVideo] = useState(les?.video ?? "");
  const [minuten, setMinuten] = useState(les?.minuten ? String(les.minuten) : "");
  const [fout, setFout] = useState("");
  async function bewaar() {
    setFout("");
    try {
      await lesOpslaan(cursus, les?.id ?? null, { titel, inhoud, video, minuten: Number(minuten) || 0 });
      klaar();
    } catch (e) {
      setFout(foutVan(e));
    }
  }
  return (
    <Onderblad titel={les ? "Les aanpassen" : "Nieuwe les"} sluit={sluit}>
      <input value={titel} onChange={(e) => setTitel(e.target.value)} maxLength={100} placeholder="Titel van de les" aria-label="Titel van de les" className={veld} />
      <input value={video} onChange={(e) => setVideo(e.target.value)} inputMode="url" placeholder="Video (link van YouTube of Vimeo, mag leeg)" aria-label="Video" className={veld} />
      <textarea value={inhoud} onChange={(e) => setInhoud(e.target.value)} rows={6} placeholder="Uitleg, opdrachten of tekst" aria-label="Inhoud" className={vlak} />
      <input value={minuten} onChange={(e) => setMinuten(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="Hoeveel minuten ongeveer?" aria-label="Minuten" className={veld} />
      {fout && <p role="alert" className="px-1 text-sm text-red-600">{fout}</p>}
      <button onClick={bewaar} disabled={!titel.trim()} className={knop}>Bewaren</button>
    </Onderblad>
  );
}

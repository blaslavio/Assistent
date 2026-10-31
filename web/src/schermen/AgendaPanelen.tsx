import TaakBron from "./TaakBron";
// Drie panelen in de agenda: je mail (met een korte samenvatting), je taken en je herinneringen.
// Toevoegen gebeurt in een veld bovenaan, zonder venster, zodat het scherm stil blijft staan.
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { bijwerken, instellingenBijwerken, type Afspraak, type Herhaal, type Taak } from "../api";
import type { Staat } from "../App";
import { afgevinktTekst, mascotteZeg } from "../mascotte";
import { Bel, Bewerk, Envelop, Euro, Herstel, Kalender, Kruis, Plus, Prullenbak, Slot, Ster, Vinkje, Vonk } from "../iconen";
import { HERHALEN, afvinkenIn, sorteer } from "../lib/taken";
import { begrijp } from "../lib/snelinvoer";
import { AANBIEDERS, gekoppeld, mails, mailsBewaard, samenvatting, testen, voorstellen, type Mail, type Voorstel } from "../lib/mail";
import { gegevensLaden } from "../api";
import { Opstellen } from "./MailOpstellen";
import { DAGEN, datumTekst, plusDagen, tijdje, uur } from "../lib/tijd";

type Props = { staat: Staat; setStaat: (s: Staat) => void };
const veld = "h-12 min-w-0 flex-1 rounded-2xl bg-vlak px-4 outline-none placeholder:text-zacht";
const foutVan = (e: unknown) => (e instanceof Error ? e.message : "Dat lukte niet.");

function Kop({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-5 mb-1 text-[13px] font-semibold uppercase tracking-[0.06em] text-rustig first:mt-0">{children}</h2>;
}

// --- Taken ---------------------------------------------------------------------------------------------------------

function groepVan(t: Taak, vandaag: string, week: string) {
  if (!t.deadline) return "Zonder datum";
  const d = t.deadline.slice(0, 10);
  return d < vandaag ? "Te laat" : d === vandaag ? "Vandaag" : d <= week ? "Deze week" : "Later";
}
const GROEPEN = ["Te laat", "Vandaag", "Deze week", "Later", "Zonder datum"];

function datumKort(d: string) {
  const v = datumTekst(new Date());
  if (d === v) return "vandaag";
  if (d === datumTekst(plusDagen(new Date(), 1))) return "morgen";
  const x = new Date(`${d}T12:00`);
  return `${DAGEN[x.getDay()].slice(0, 2)} ${x.getDate()}/${x.getMonth() + 1}`;
}

type TakenProps = Props & { naarMail?: () => void };
const IDEEEN: [string, Herhaal | null][] = [["Boodschappen doen", null], ["Vuilnis buiten zetten", "week"],
  ["Rekeningen nakijken", "maand"], ["Iemand terugbellen", null]];
const chip = (aan = false) => `h-8 shrink-0 rounded-full px-3 text-sm ${aan ? "bg-inkt text-white dark:bg-white dark:text-black" : "bg-vlak"}`;

/** Een datumknop die op iPhone gewoon de datumkiezer opent. */
function DatumKiezen({ waarde, kies, tekst = "Datum" }: { waarde: string; kies: (d: string) => void; tekst?: string }) {
  return (
    <label className={`relative flex items-center gap-1 ${chip(false)}`}>
      <Kalender className="size-4" /> {tekst}
      <input type="date" value={waarde} onChange={(e) => e.target.value && kies(e.target.value)} aria-label="Kies een datum"
        className="absolute inset-0 opacity-0" />
    </label>
  );
}

export function TakenPaneel({ staat, setStaat, naarMail }: TakenProps) {
  const [titel, setTitel] = useState("");
  const [datum, setDatum] = useState<string | null>(null);
  const [belangrijk, setBelangrijk] = useState(false);
  const [herhaal, setHerhaal] = useState<Herhaal | null>(null);
  const [weg, setWeg] = useState<Set<number>>(new Set());
  const [open, setOpen] = useState<number | null>(null);
  const [fout, setFout] = useState("");
  const vandaag = datumTekst(new Date());
  const morgen = datumTekst(plusDagen(new Date(), 1));
  const week = datumTekst(plusDagen(new Date(), 6));
  const open_ = staat.data.taken.filter((t) => !t.klaar);
  const klaar = staat.data.taken.filter((t) => t.klaar).slice(-5).reverse();
  const begrip = useMemo(() => (titel.trim() ? begrijp(titel) : null), [titel]);
  // Wat je typt ("vrijdag boodschappen") geeft al een datum; een knop gaat voor.
  const herkend = begrip?.soort === "taak" ? begrip.deadline : begrip?.soort === "afspraak" ? begrip.datum : null;
  const wanneer = datum ?? herkend;
  const telVandaag = open_.filter((t) => t.deadline?.slice(0, 10) === vandaag).length;
  const telLaat = open_.filter((t) => t.deadline && t.deadline.slice(0, 10) < vandaag).length;

  async function wijzig(f: (g: Staat["data"]) => void) {
    setFout("");
    try {
      setStaat({ ...staat, data: await bijwerken(f) });
    } catch (e) {
      setFout(foutVan(e));
    }
  }
  const pas = (id: number, f: (t: Taak) => Taak) => wijzig((g) => { g.taken = g.taken.map((x) => (x.id === id ? f(x) : x)); });
  async function voegToe(e?: FormEvent) {
    e?.preventDefault();
    if (!begrip) return;
    const t = (begrip.soort === "vraag" || datum ? titel.trim() : begrip.titel).slice(0, 160);
    const extra = { ...(belangrijk ? { prioriteit: "hoog" } : {}), ...(herhaal ? { herhaal } : {}) };
    const d = herhaal && !wanneer ? vandaag : wanneer;
    setTitel(""); setDatum(null); setBelangrijk(false); setHerhaal(null);
    await wijzig((g) => {
      g.taken.push({ id: g.volgend_id, titel: t, deadline: d || null, klaar: false, ...extra });
      g.volgend_id += 1;
    });
  }
  function afvinken(t: Taak) {
    setWeg((w) => new Set(w).add(t.id));
    mascotteZeg(afgevinktTekst(open_.filter((x) => x.id !== t.id).length));
    setTimeout(() => {
      wijzig((g) => { afvinkenIn(g, t.id); })
        .finally(() => setWeg((w) => { const n = new Set(w); n.delete(t.id); return n; }));
    }, 320);
  }

  return (
    <div className="opkomen flex flex-col px-6 pb-10">
      {open_.length > 0 && (
        <p className="-mt-1 pb-2 text-sm text-rustig">
          {open_.length} open{telVandaag ? ` · ${telVandaag} vandaag` : ""}
          {telLaat ? <span className="text-red-600 dark:text-red-400"> · {telLaat} te laat</span> : ""}
        </p>
      )}
      <form onSubmit={voegToe} className="flex flex-col gap-2 pb-3">
        <div className="flex gap-2">
          <input value={titel} onChange={(e) => setTitel(e.target.value)} placeholder="Nieuwe taak, bv. vrijdag boodschappen"
            aria-label="Nieuwe taak" enterKeyHint="done" className={veld} />
          <button type="submit" disabled={!titel.trim()} aria-label="Toevoegen"
            className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-accent text-white disabled:opacity-40">
            <Plus className="size-5" />
          </button>
        </div>
        {begrip && (
          <div className="opkomen -mx-6 flex gap-1.5 overflow-x-auto px-6 [scrollbar-width:none]">
            <button type="button" onClick={() => setDatum(datum === vandaag ? "" : vandaag)} className={chip(wanneer === vandaag)}>Vandaag</button>
            <button type="button" onClick={() => setDatum(datum === morgen ? "" : morgen)} className={chip(wanneer === morgen)}>Morgen</button>
            {wanneer && wanneer !== vandaag && wanneer !== morgen
              ? <button type="button" onClick={() => setDatum("")} className={`flex items-center gap-1 ${chip(true)}`}>
                  {datumKort(wanneer)} <Kruis className="size-3.5" /></button>
              : <DatumKiezen waarde={datum ?? ""} kies={setDatum} />}
            <button type="button" onClick={() => setBelangrijk(!belangrijk)} aria-pressed={belangrijk}
              className={`flex items-center gap-1 ${chip(belangrijk)}`}><Ster className="size-4" /> Belangrijk</button>
            <button type="button" onClick={() => setHerhaal(herhaal === null ? "week" : herhaal === "week" ? "dag" : herhaal === "dag" ? "maand" : null)}
              className={`flex items-center gap-1 ${chip(!!herhaal)}`}><Herstel className="size-4" />
              {herhaal ? HERHALEN.find(([h]) => h === herhaal)?.[1] : "Herhalen"}</button>
          </div>
        )}
      </form>
      {fout && <p role="alert" className="pb-2 text-sm text-red-600 dark:text-red-400">{fout}</p>}
      {open_.length === 0 && !titel && (
        <div className="flex flex-col items-start gap-3 py-4">
          <p className="text-rustig">Niets te doen. Typ hierboven wat je niet wilt vergeten, of begin met:</p>
          <div className="flex flex-wrap gap-1.5">
            {IDEEEN.map(([t, h]) => (
              <button key={t} onClick={() => { setTitel(t); setHerhaal(h); }} className={chip()}>
                {t}{h ? ` · ${HERHALEN.find(([x]) => x === h)?.[1].toLowerCase()}` : ""}
              </button>
            ))}
          </div>
          {naarMail && gekoppeld(staat.data) && (
            <button onClick={naarMail} className="flex items-center gap-2 text-sm font-medium text-accent">
              <Envelop className="size-4" /> Taken uit je mail halen
            </button>
          )}
        </div>
      )}
      {GROEPEN.map((groep) => {
        const lijst = open_.filter((t) => groepVan(t, vandaag, week) === groep).sort(sorteer);
        if (!lijst.length) return null;
        return (
          <section key={groep}>
            <Kop>{groep}</Kop>
            <ul className="flex flex-col">
              {lijst.map((t) => (
                <li key={t.id} className={weg.has(t.id) ? "wegstrepen" : ""}>
                  <div className="flex items-center gap-3 py-2">
                    <button onClick={() => afvinken(t)} aria-label={`${t.titel} afvinken`}
                      className={`flex size-6 shrink-0 items-center justify-center rounded-full border-2 ${weg.has(t.id)
                        ? "border-accent bg-accent text-white" : groep === "Te laat" ? "border-red-400" : "border-lijn"}`}>
                      {weg.has(t.id) && <Vinkje className="size-3.5" />}
                    </button>
                    <button onClick={() => setOpen(open === t.id ? null : t.id)} aria-expanded={open === t.id}
                      className="flex min-w-0 flex-1 flex-col text-left">
                      <span className={`flex items-center gap-1.5 text-[16px] ${weg.has(t.id) ? "text-rustig line-through" : ""}`}>
                        <span className="truncate">{t.titel}</span>
                        {t.prioriteit === "hoog" && <Ster className="size-3.5 shrink-0 fill-amber-400 text-amber-400" aria-label="Belangrijk" />}
                      </span>
                      {(t.deadline && groep !== "Vandaag") || t.herhaal || t.notitie ? (
                        <span className={`truncate text-[13px] ${groep === "Te laat" ? "text-red-600 dark:text-red-400" : "text-rustig"}`}>
                          {[t.deadline && groep !== "Vandaag" ? datumKort(t.deadline.slice(0, 10)) : "",
                            t.herhaal ? HERHALEN.find(([h]) => h === t.herhaal)?.[1].toLowerCase() : "", t.notitie ?? ""]
                            .filter(Boolean).join(" · ")}
                        </span>
                      ) : null}
                    </button>
                  </div>
                  <div className="ml-9"><TaakBron taak={t}/></div>
                  {open === t.id && <TaakBewerken t={t} pas={(f) => pas(t.id, f)}
                    weg={() => wijzig((g) => { g.taken = g.taken.filter((x) => x.id !== t.id); })} />}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {klaar.length > 0 && (
        <section>
          <Kop>Net afgerond</Kop>
          <ul className="flex flex-col">
            {klaar.map((t) => (
              <li key={t.id} className="flex items-center gap-3 py-1.5 text-rustig">
                <span className="flex size-6 items-center justify-center rounded-full bg-vlak"><Vinkje className="size-3.5" /></span>
                <span className="min-w-0 flex-1"><span className="block truncate line-through">{t.titel}</span><TaakBron taak={t}/></span>
                <button onClick={() => pas(t.id, (x) => ({ ...x, klaar: false }))}
                  aria-label={`${t.titel} terugzetten`} className="flex size-8 items-center justify-center rounded-full hover:bg-vlak">
                  <Herstel className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** Alles van één taak aanpassen, zonder venster: naam, notitie, wanneer, belangrijk en herhalen. */
function TaakBewerken({ t, pas, weg }: { t: Taak; pas: (f: (t: Taak) => Taak) => void; weg: () => void }) {
  const [naam, setNaam] = useState(t.titel);
  const [notitie, setNotitie] = useState(t.notitie ?? "");
  const d = t.deadline?.slice(0, 10) ?? "";
  const vandaag = datumTekst(new Date());
  const DAGEN_: [string, string][] = [["Vandaag", vandaag], ["Morgen", datumTekst(plusDagen(new Date(), 1))],
    ["Volgende week", datumTekst(plusDagen(new Date(), 7))]];
  return (
    <div className="opkomen mb-3 ml-9 flex flex-col gap-2">
      <input value={naam} onChange={(e) => setNaam(e.target.value)} aria-label="Naam van de taak"
        onBlur={() => naam.trim() && naam.trim() !== t.titel && pas((x) => ({ ...x, titel: naam.trim().slice(0, 160) }))}
        className="h-10 rounded-xl bg-vlak px-3 outline-none" />
      <textarea value={notitie} onChange={(e) => setNotitie(e.target.value)} placeholder="Notitie" aria-label="Notitie" rows={2}
        onBlur={() => notitie.trim() !== (t.notitie ?? "") && pas((x) => ({ ...x, notitie: notitie.trim().slice(0, 500) || undefined }))}
        className="resize-none rounded-xl bg-vlak px-3 py-2 text-sm outline-none placeholder:text-zacht" />
      <div className="flex flex-wrap gap-1.5">
        {DAGEN_.map(([naam_, dag]) => (
          <button key={naam_} onClick={() => pas((x) => ({ ...x, deadline: dag }))} className={chip(d === dag)}>{naam_}</button>
        ))}
        <DatumKiezen waarde={d} kies={(dag) => pas((x) => ({ ...x, deadline: dag }))}
          tekst={d && !DAGEN_.some(([, x]) => x === d) ? datumKort(d) : "Datum"} />
        {d && <button onClick={() => pas((x) => ({ ...x, deadline: null }))} className={chip()}>Geen datum</button>}
      </div>
      <div className="flex flex-wrap gap-1.5">
        <button onClick={() => pas((x) => ({ ...x, prioriteit: x.prioriteit === "hoog" ? undefined : "hoog" }))}
          aria-pressed={t.prioriteit === "hoog"} className={`flex items-center gap-1 ${chip(t.prioriteit === "hoog")}`}>
          <Ster className="size-4" /> Belangrijk
        </button>
        {HERHALEN.map(([h, tekst]) => (
          <button key={h} onClick={() => pas((x) => ({ ...x, herhaal: x.herhaal === h ? null : h, deadline: x.deadline ?? vandaag }))}
            aria-pressed={t.herhaal === h} className={chip(t.herhaal === h)}>{tekst}</button>
        ))}
        <button onClick={weg} aria-label="Verwijderen"
          className="flex h-8 items-center gap-1 rounded-full bg-vlak px-3 text-sm text-red-600 dark:text-red-400">
          <Prullenbak className="size-4" /> Weg
        </button>
      </div>
    </div>
  );
}

// --- Herinneringen -------------------------------------------------------------------------------------------------

const MOMENTEN: [string, () => Date][] = [
  ["Over een uur", () => new Date(Date.now() + 3_600_000)],
  ["Vanavond", () => { const d = new Date(); d.setHours(19, 0, 0, 0); return d; }],
  ["Morgen 9:00", () => { const d = plusDagen(new Date(), 1); d.setHours(9, 0, 0, 0); return d; }],
];
const lokaal = (d: Date) => `${datumTekst(d)}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

export function HerinneringenPaneel({ staat, setStaat }: Props) {
  const [titel, setTitel] = useState("");
  const [wanneer, setWanneer] = useState(() => lokaal(MOMENTEN[2][1]()));
  const [weg, setWeg] = useState<Set<Afspraak["id"]>>(new Set());
  const [fout, setFout] = useState("");
  const nu = lokaal(new Date());
  const alle = staat.data.afspraken.filter((a) => a.soort === "herinnering").sort((a, b) => a.start.localeCompare(b.start));
  const komend = alle.filter((a) => a.start >= nu.slice(0, a.start.length > 10 ? 16 : 10));
  const geweest = alle.filter((a) => !komend.includes(a)).slice(-5).reverse();

  async function wijzig(f: (g: Staat["data"]) => void) {
    setFout("");
    try {
      setStaat({ ...staat, data: await bijwerken(f) });
    } catch (e) {
      setFout(foutVan(e));
    }
  }
  async function voegToe(e: FormEvent) {
    e.preventDefault();
    const t = titel.trim();
    if (!t || !wanneer) return;
    setTitel("");
    await wijzig((g) => {
      g.afspraken.push({ id: g.volgend_id, titel: t.slice(0, 160), start: wanneer, einde: null, soort: "herinnering" });
      g.volgend_id += 1;
    });
  }
  function klaar(a: Afspraak) {
    setWeg((w) => new Set(w).add(a.id));
    setTimeout(() => wijzig((g) => { g.afspraken = g.afspraken.filter((x) => x.id !== a.id); }), 320);
  }

  const wanneerTekst = (a: Afspraak) => {
    const d = a.start.slice(0, 10);
    return `${datumKort(d)}${a.start.length > 10 ? ` om ${uur(a.start)}` : ""}`;
  };

  return (
    <div className="opkomen flex flex-col px-6 pb-10">
      <form onSubmit={voegToe} className="flex flex-col gap-2 pb-3">
        <input value={titel} onChange={(e) => setTitel(e.target.value)} placeholder="Waaraan wil je herinnerd worden?"
          aria-label="Nieuwe herinnering" enterKeyHint="done" className={`${veld} w-full flex-none`} />
        <div className="flex flex-wrap items-center gap-2">
          {MOMENTEN.map(([naam, maak]) => {
            const w = lokaal(maak());
            return (
              <button key={naam} type="button" onClick={() => setWanneer(w)} aria-pressed={wanneer === w}
                className={`h-8 rounded-full px-3 text-sm ${wanneer === w ? "bg-inkt text-white dark:bg-white dark:text-black" : "bg-vlak"}`}>{naam}</button>
            );
          })}
          <input type="datetime-local" value={wanneer} onChange={(e) => setWanneer(e.target.value)} aria-label="Wanneer"
            className="h-8 rounded-full bg-vlak px-3 text-sm outline-none" />
          {titel.trim() && <button className="h-8 rounded-full bg-accent px-4 text-sm font-medium text-white">Zet</button>}
        </div>
      </form>
      {fout && <p role="alert" className="pb-2 text-sm text-red-600 dark:text-red-400">{fout}</p>}
      {komend.length === 0 && <p className="py-6 text-center text-rustig">Geen herinneringen gepland.</p>}
      {komend.length > 0 && <Kop>Komt eraan</Kop>}
      <ul className="flex flex-col">
        {komend.map((a) => (
          <li key={a.id} className={`flex items-center gap-3 py-2 ${weg.has(a.id) ? "wegstrepen" : ""}`}>
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-red-500/10 text-red-600 dark:text-red-400">
              <Bel className="size-4" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[16px]">{a.titel}</span>
              <span className="text-[13px] text-rustig">{wanneerTekst(a)}</span>
            </span>
            <button onClick={() => klaar(a)} aria-label={`${a.titel} klaar`}
              className="h-8 shrink-0 rounded-full bg-vlak px-3 text-sm">Klaar</button>
          </li>
        ))}
      </ul>
      {geweest.length > 0 && (
        <>
          <Kop>Geweest</Kop>
          <ul className="flex flex-col">
            {geweest.map((a) => (
              <li key={a.id} className={`flex items-center gap-3 py-1.5 text-rustig ${weg.has(a.id) ? "wegstrepen" : ""}`}>
                <span className="min-w-0 flex-1 truncate">{a.titel}</span>
                <span className="text-[13px]">{wanneerTekst(a)}</span>
                <button onClick={() => klaar(a)} aria-label={`${a.titel} weghalen`}
                  className="flex size-8 items-center justify-center rounded-full hover:bg-vlak"><Prullenbak className="size-4" /></button>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="mt-6 text-[13px] text-zacht">Herinneringen staan ook in je agenda, in het rood.</p>
    </div>
  );
}

// --- Mail ----------------------------------------------------------------------------------------------------------

export function MailPaneel({ staat, setStaat }: Props) {
  const heeft = gekoppeld(staat.data);
  const [lijst, setLijst] = useState<Mail[] | null>(mailsBewaard);
  const [samen, setSamen] = useState<string | null | undefined>(undefined);
  const [fout, setFout] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  const [bezig, setBezig] = useState(false);
  const [schrijf, setSchrijf] = useState<Mail | "nieuw" | null>(null);

  async function laden(vers = false) {
    setFout("");
    setBezig(true);
    try {
      const l = await mails(vers);
      setLijst(l ?? []);
      if (l?.length) samenvatting(l, staat.data).then(setSamen, () => setSamen(null));
      else setSamen("");
    } catch (e) {
      setFout(foutVan(e));
    } finally {
      setBezig(false);
    }
  }
  useEffect(() => {
    if (heeft) laden();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heeft]);

  if (!heeft) return <MailKoppelen staat={staat} setStaat={setStaat} />;

  const ongelezen = (lijst ?? []).filter((m) => !m.gelezen).length;
  return (
    <div className="opkomen flex flex-col px-6 pb-10">
      <div className="mb-4 rounded-3xl bg-vlak p-4">
        <div className="mb-2 flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.06em] text-rustig">
          <Vonk className="size-4 text-accent" /> Samenvatting
          <span className="ml-auto font-normal normal-case tracking-normal">{ongelezen ? `${ongelezen} ongelezen` : ""}</span>
        </div>
        {samen === undefined ? <p className="bezig-tekst text-[15px]">Je inbox doorlezen</p>
          : samen === null ? <p className="text-[15px] text-rustig">Zet de assistent aan in Instellingen voor een samenvatting.</p>
          : samen === "" ? <p className="text-[15px] text-rustig">Niets nieuws in je inbox.</p>
          : <ul className="flex flex-col gap-1.5">{samen.split("\n").filter((r) => r.trim()).map((r, i) => (
              <li key={i} className="flex gap-2 text-[15px] leading-snug"><span className="text-accent">•</span>
                <span>{r.replace(/^[-•*]\s*/, "")}</span></li>))}</ul>}
      </div>
      {lijst && lijst.some((m) => !m.gelezen) && <UitJeMail lijst={lijst} staat={staat} setStaat={setStaat} />}
      {fout && <p role="alert" className="pb-3 text-sm text-red-600 dark:text-red-400">{fout}</p>}
      <div className="flex items-center justify-between">
        <Kop>Inbox</Kop>
        <span className="flex items-center">
          <button onClick={() => { setSamen(undefined); laden(true); }} disabled={bezig}
            className="h-8 rounded-full px-3 text-sm text-rustig disabled:opacity-40">{bezig ? "Ophalen" : "Vernieuwen"}</button>
          <button onClick={() => setSchrijf("nieuw")} className="flex h-8 items-center gap-1 rounded-full px-3 text-sm text-accent">
            <Bewerk className="size-4" /> Nieuw
          </button>
        </span>
      </div>
      {lijst === null && bezig && <p className="bezig-tekst py-4 text-[15px]">Ophalen</p>}
      <ul className="flex flex-col">
        {(lijst ?? []).map((m) => (
          <li key={m.uid}>
            <button onClick={() => setOpen(open === m.uid ? null : m.uid)} className="flex w-full flex-col gap-0.5 py-2.5 text-left">
              <span className="flex items-baseline gap-2">
                {!m.gelezen && <span className="size-2 shrink-0 translate-y-[-1px] rounded-full bg-accent" />}
                <span className={`min-w-0 flex-1 truncate ${m.gelezen ? "" : "font-semibold"}`}>{m.van}</span>
                <span className="shrink-0 text-xs text-zacht">{tijdje(m.datum)}</span>
              </span>
              <span className={`truncate text-[15px] ${m.gelezen ? "text-rustig" : ""}`}>{m.onderwerp}</span>
              {open !== m.uid && <span className="truncate text-[13px] text-zacht">{m.tekst.slice(0, 120)}</span>}
            </button>
            {open === m.uid && (
              <div className="opkomen mb-3 flex flex-col gap-2 rounded-2xl bg-vlak p-3">
                <p className="whitespace-pre-line text-[14px] leading-relaxed text-rustig">{m.tekst || "Geen tekst in dit bericht."}</p>
                {m.adres && (
                  <button onClick={() => setSchrijf(m)}
                    className="flex h-10 w-fit items-center gap-2 rounded-full bg-accent px-4 text-sm font-medium text-white">
                    <Herstel className="size-4" /> Beantwoorden
                  </button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-6 flex items-center gap-1.5 text-[13px] text-zacht"><Slot className="size-3.5" /> Lezen verandert niets in je mailbox. Versturen doe je altijd zelf.</p>
      {schrijf && <Opstellen data={staat.data} op={schrijf === "nieuw" ? undefined : schrijf} sluit={() => setSchrijf(null)} />}
    </div>
  );
}

/** Wat er uit je ongelezen mail te doen valt. Pas als jij erom vraagt, en alleen wat jij aanvinkt komt erin. */
function UitJeMail({ lijst, staat, setStaat }: { lijst: Mail[]; staat: Staat; setStaat: (s: Staat) => void }) {
  const [voorstel, setVoorstel] = useState<Voorstel[] | null | undefined>(undefined);
  const [gekozen, setGekozen] = useState<Set<number>>(new Set());
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState("");

  async function kijken() {
    setBezig(true);
    setMelding("");
    try {
      const v = await voorstellen(lijst, staat.data, datumTekst(new Date()));
      setVoorstel(v);
      setGekozen(new Set((v ?? []).map((_, i) => i)));
    } catch (e) {
      setMelding(foutVan(e));
    } finally {
      setBezig(false);
    }
  }

  async function toevoegen() {
    const kies = (voorstel ?? []).filter((_, i) => gekozen.has(i));
    setBezig(true);
    try {
      await bijwerken((g) => {
        for (const v of kies) {
          const id = g.volgend_id++;
          if (v.soort === "afspraak" && v.datum) {
            const start = v.tijd ? `${v.datum}T${v.tijd}` : v.datum;
            g.afspraken.push({ id, titel: v.titel, start, einde: null, locatie: "", soort: "afspraak", notitie: `Uit mail van ${v.van}` });
          } else {
            g.taken.push({ id, titel: v.soort === "betalen" && v.bedrag ? `${v.titel} (${v.bedrag})` : v.titel,
              deadline: v.datum || null, klaar: false, ...(v.soort === "betalen" ? { prioriteit: "hoog" } : {}) });
          }
        }
      });
      setStaat(await gegevensLaden());
      setVoorstel(undefined);
      setMelding(`${kies.length} toegevoegd aan je agenda en taken`);
    } catch (e) {
      setMelding(foutVan(e));
    } finally {
      setBezig(false);
    }
  }

  const icoon = { taak: Vinkje, afspraak: Kalender, betalen: Euro };
  return (
    <div className="mb-4 flex flex-col gap-3 rounded-3xl border border-lijn p-4">
      {voorstel === undefined ? (
        <button onClick={kijken} disabled={bezig} className="flex items-center gap-3 text-left disabled:opacity-60">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent"><Vonk className="size-[18px]" /></span>
          <span className="flex flex-col">
            <span className="font-medium">{bezig ? "Je mail doorlezen" : "Wat moet ik met mijn mail?"}</span>
            <span className="text-[13px] text-rustig">{melding || "Taken, afspraken en rekeningen uit je ongelezen mail"}</span>
          </span>
        </button>
      ) : voorstel === null ? (
        <p className="text-[15px] text-rustig">Zet de assistent aan in Instellingen om je mail te laten nakijken.</p>
      ) : voorstel.length === 0 ? (
        <p className="text-[15px] text-rustig">Niets te doen in je ongelezen mail.</p>
      ) : <>
        <span className="text-[13px] font-semibold uppercase tracking-[0.06em] text-rustig">Uit je mail</span>
        <ul className="flex flex-col gap-1">
          {voorstel.map((v, i) => {
            const Icoon = icoon[v.soort];
            const aan = gekozen.has(i);
            return (
              <li key={i}>
                <button onClick={() => setGekozen((s) => { const n = new Set(s); if (aan) n.delete(i); else n.add(i); return n; })}
                  aria-pressed={aan} className="flex w-full items-center gap-3 py-1.5 text-left">
                  <span className={`flex size-6 shrink-0 items-center justify-center rounded-md border ${aan ? "border-accent bg-accent text-white" : "border-lijn"}`}>
                    {aan && <Vinkje className="size-3.5" />}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate">{v.titel}{v.soort === "betalen" && v.bedrag ? ` · ${v.bedrag}` : ""}</span>
                    <span className="truncate text-[13px] text-rustig">
                      {[v.soort === "afspraak" ? "Afspraak" : v.soort === "betalen" ? "Betalen" : "Taak",
                        v.datum ? `${v.datum.slice(8, 10)}/${Number(v.datum.slice(5, 7))}${v.tijd ? ` ${v.tijd}` : ""}` : "", v.van]
                        .filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <Icoon className="size-4 shrink-0 text-zacht" />
                </button>
              </li>
            );
          })}
        </ul>
        <button onClick={toevoegen} disabled={bezig || gekozen.size === 0}
          className="flex h-11 items-center justify-center gap-2 rounded-2xl bg-accent font-medium text-white disabled:opacity-30">
          <Plus className="size-[18px]" /> {gekozen.size === 1 ? "1 toevoegen" : `${gekozen.size} toevoegen`}
        </button>
      </>}
      {melding && voorstel !== undefined && <p role="status" className="text-sm text-rustig">{melding}</p>}
    </div>
  );
}

export function MailKoppelen({ staat, setStaat }: Props) {
  const [aanbieder, setAanbieder] = useState("iCloud");
  const [adres, setAdres] = useState("");
  const [wachtwoord, setWachtwoord] = useState("");
  const [imap, setImap] = useState("");
  const [fout, setFout] = useState("");
  const [bezig, setBezig] = useState(false);
  const preset = AANBIEDERS[aanbieder];
  const server = useMemo(() => preset?.imap ?? imap.trim(), [preset, imap]);

  async function koppel(e: FormEvent) {
    e.preventDefault();
    setFout("");
    setBezig(true);
    const mail = { aanbieder, adres: adres.trim(), gebruiker: adres.trim(), wachtwoord: wachtwoord.replace(/\s/g, ""),
      imap: server, imap_poort: 993, smtp: preset?.smtp ?? "", smtp_poort: preset?.smtp_poort ?? 587 };
    try {
      await testen(mail);
      setStaat({ ...staat, data: await instellingenBijwerken((i) => { i.mail = mail; }) });
    } catch (er) {
      setFout(foutVan(er));
    } finally {
      setBezig(false);
    }
  }

  return (
    <form onSubmit={koppel} className="opkomen flex flex-col gap-3 px-6 pb-10">
      <div className="flex flex-col items-center gap-2 py-4 text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-vlak text-rustig"><Envelop /></span>
        <p className="font-medium">Koppel je mail</p>
        <p className="text-sm text-rustig">Dan zie je hier je inbox met een korte samenvatting. Alleen lezen.</p>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Aanbieder">
        {[...Object.keys(AANBIEDERS), "Anders"].map((a) => (
          <button key={a} type="button" onClick={() => setAanbieder(a)} aria-pressed={aanbieder === a}
            className={`h-9 rounded-full px-3.5 text-sm ${aanbieder === a ? "bg-inkt text-white dark:bg-white dark:text-black" : "bg-vlak"}`}>{a}</button>
        ))}
      </div>
      <p className="text-[13px] text-rustig">{preset?.uitleg ?? "Vul de IMAP-server van je aanbieder in."}</p>
      <input value={adres} onChange={(e) => setAdres(e.target.value)} type="email" placeholder="Mailadres" aria-label="Mailadres"
        autoCapitalize="none" autoComplete="email" className={`${veld} w-full flex-none`} />
      <input value={wachtwoord} onChange={(e) => setWachtwoord(e.target.value)} type="password" placeholder="App-wachtwoord"
        aria-label="App-wachtwoord" autoComplete="off" className={`${veld} w-full flex-none`} />
      {!preset && <input value={imap} onChange={(e) => setImap(e.target.value)} placeholder="IMAP-server, bijvoorbeeld imap.voorbeeld.nl"
        aria-label="IMAP-server" autoCapitalize="none" className={`${veld} w-full flex-none`} />}
      {fout && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{fout}</p>}
      <button disabled={bezig || !adres.includes("@") || !wachtwoord || !server}
        className="h-12 rounded-2xl bg-accent font-medium text-white disabled:opacity-40">{bezig ? "Controleren" : "Koppelen"}</button>
      <p className="flex items-center gap-1.5 text-[13px] text-zacht"><Slot className="size-3.5" /> Je wachtwoord staat alleen in je eigen beveiligde gegevens.</p>
    </form>
  );
}

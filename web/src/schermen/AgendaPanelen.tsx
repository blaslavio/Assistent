// Drie panelen in de agenda: je mail (met een korte samenvatting), je taken en je herinneringen.
// Toevoegen gebeurt in een veld bovenaan, zonder venster, zodat het scherm stil blijft staan.
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { bijwerken, instellingenBijwerken, type Afspraak, type Taak } from "../api";
import type { Staat } from "../App";
import { Bel, Envelop, Herstel, Prullenbak, Slot, Vinkje, Vonk } from "../iconen";
import { AANBIEDERS, gekoppeld, mails, mailsBewaard, samenvatting, testen, type Mail } from "../lib/mail";
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

export function TakenPaneel({ staat, setStaat }: Props) {
  const [titel, setTitel] = useState("");
  const [datum, setDatum] = useState("");
  const [weg, setWeg] = useState<Set<number>>(new Set());
  const [open, setOpen] = useState<number | null>(null);
  const [fout, setFout] = useState("");
  const vandaag = datumTekst(new Date());
  const week = datumTekst(plusDagen(new Date(), 6));
  const open_ = staat.data.taken.filter((t) => !t.klaar);
  const klaar = staat.data.taken.filter((t) => t.klaar).slice(-5).reverse();

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
    if (!t) return;
    setTitel("");
    setDatum("");
    await wijzig((g) => {
      g.taken.push({ id: g.volgend_id, titel: t.slice(0, 160), deadline: datum || null, klaar: false });
      g.volgend_id += 1;
    });
  }
  function afvinken(t: Taak) {
    setWeg((w) => new Set(w).add(t.id));
    setTimeout(() => {
      wijzig((g) => { g.taken = g.taken.map((x) => (x.id === t.id ? { ...x, klaar: true } : x)); })
        .finally(() => setWeg((w) => { const n = new Set(w); n.delete(t.id); return n; }));
    }, 320);
  }

  return (
    <div className="opkomen flex flex-col px-6 pb-10">
      <form onSubmit={voegToe} className="flex flex-col gap-2 pb-3">
        <div className="flex gap-2">
          <input value={titel} onChange={(e) => setTitel(e.target.value)} placeholder="Nieuwe taak" aria-label="Nieuwe taak"
            enterKeyHint="done" className={veld} />
          <input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} aria-label="Wanneer klaar"
            className={`h-12 w-[8.5rem] shrink-0 rounded-2xl bg-vlak px-3 text-sm outline-none ${datum ? "" : "text-zacht"}`} />
        </div>
      </form>
      {fout && <p role="alert" className="pb-2 text-sm text-red-600 dark:text-red-400">{fout}</p>}
      {open_.length === 0 && <p className="py-6 text-center text-rustig">Niets te doen. Lekker.</p>}
      {GROEPEN.map((groep) => {
        const lijst = open_.filter((t) => groepVan(t, vandaag, week) === groep)
          .sort((a, b) => (a.deadline ?? "9").localeCompare(b.deadline ?? "9"));
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
                    <button onClick={() => setOpen(open === t.id ? null : t.id)} className="flex min-w-0 flex-1 flex-col text-left">
                      <span className={`truncate text-[16px] ${weg.has(t.id) ? "text-rustig line-through" : ""}`}>{t.titel}</span>
                      {t.deadline && groep !== "Vandaag" && (
                        <span className={`text-[13px] ${groep === "Te laat" ? "text-red-600 dark:text-red-400" : "text-rustig"}`}>
                          {datumKort(t.deadline.slice(0, 10))}
                        </span>
                      )}
                    </button>
                  </div>
                  {open === t.id && (
                    <div className="opkomen mb-2 ml-9 flex flex-wrap gap-2">
                      {[["Vandaag", vandaag], ["Morgen", datumTekst(plusDagen(new Date(), 1))],
                        ["Volgende week", datumTekst(plusDagen(new Date(), 7))]].map(([naam, d]) => (
                        <button key={naam} onClick={() => wijzig((g) => {
                          g.taken = g.taken.map((x) => (x.id === t.id ? { ...x, deadline: d } : x));
                        })} className="h-8 rounded-full bg-vlak px-3 text-sm">{naam}</button>
                      ))}
                      <button onClick={() => wijzig((g) => { g.taken = g.taken.filter((x) => x.id !== t.id); })}
                        aria-label="Verwijderen" className="flex h-8 items-center gap-1 rounded-full bg-vlak px-3 text-sm text-red-600 dark:text-red-400">
                        <Prullenbak className="size-4" /> Weg
                      </button>
                    </div>
                  )}
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
                <span className="min-w-0 flex-1 truncate line-through">{t.titel}</span>
                <button onClick={() => wijzig((g) => { g.taken = g.taken.map((x) => (x.id === t.id ? { ...x, klaar: false } : x)); })}
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
      <div className="mb-4 rounded-[22px] bg-vlak p-4">
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
      {fout && <p role="alert" className="pb-3 text-sm text-red-600 dark:text-red-400">{fout}</p>}
      <div className="flex items-center justify-between">
        <Kop>Inbox</Kop>
        <button onClick={() => { setSamen(undefined); laden(true); }} disabled={bezig}
          className="h-8 rounded-full px-3 text-sm text-accent disabled:opacity-40">{bezig ? "Ophalen" : "Vernieuwen"}</button>
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
              <p className="opkomen mb-3 whitespace-pre-line rounded-2xl bg-vlak p-3 text-[14px] leading-relaxed text-rustig">
                {m.tekst || "Geen tekst in dit bericht."}
              </p>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-6 flex items-center gap-1.5 text-[13px] text-zacht"><Slot className="size-3.5" /> Alleen lezen. Er wordt niets verplaatst of als gelezen gemarkeerd.</p>
    </div>
  );
}

function MailKoppelen({ staat, setStaat }: Props) {
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

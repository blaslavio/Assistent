import { Fragment, useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Bewerk, Dubbelvink, Pijl, Slot, Terug, Vinkje } from "../iconen";
import { VERDWIJNEN, verdwijnenInstellen, antwoorden, berichten, contacten, gesprekken, gesprekNaam, kortTekst, nieuwGesprek, starten, versturen,
  voorbeeld, type Contact, type Gesprek, type Regel } from "../lib/chat";
import { Rondje } from "../rondje";
import { StoryRij } from "./Stories";
import { dagTitel, datumTekst, plusDagen, tijdje } from "../lib/tijd";

export default function Chat() {
  const [ik, setIk] = useState<number | null>(null);
  const [lijst, setLijst] = useState<Gesprek[]>([]);
  const [voorbeelden, setVoorbeelden] = useState<Record<number, string>>({});
  const [open, setOpen] = useState<number | null>(null);
  const [nieuw, setNieuw] = useState(false);
  const [fout, setFout] = useState("");

  const laden = useCallback(async () => {
    const g = await gesprekken();
    setLijst(g);
    for (const x of g.slice(0, 30))
      voorbeeld(x).then((t) => setVoorbeelden((v) => (v[x.id] === t ? v : { ...v, [x.id]: t }))).catch(() => {});
  }, []);

  useEffect(() => {
    starten().then((id) => {
      setIk(id);
      return laden();
    }).catch((e) => setFout(e instanceof Error ? e.message : "De chat kon niet starten."));
  }, [laden]);

  useEffect(() => {
    if (ik === null || open !== null) return;
    const t = setInterval(() => document.visibilityState === "visible" && laden().catch(() => {}), 4000);
    return () => clearInterval(t);
  }, [ik, open, laden]);

  if (open !== null && ik !== null) {
    const g = lijst.find((x) => x.id === open);
    return <Gesprekscherm id={open} ik={ik} begin={g} terug={() => { setOpen(null); laden().catch(() => {}); }} />;
  }

  return (
    <div className="flex min-h-full flex-col">
      <header className="flex items-center justify-between px-6 pt-14 pb-3">
        <h1 className="text-[32px] font-bold tracking-tight">Chat</h1>
        <button onClick={() => setNieuw(true)} aria-label="Nieuw gesprek"
          className="flex size-10 items-center justify-center rounded-full bg-vlak"><Bewerk className="size-5" /></button>
      </header>
      {ik !== null && <StoryRij ik={ik} />}
      {fout && <p className="px-6 text-rustig">{fout}</p>}
      {ik !== null && lijst.length === 0 && !fout && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-10 pb-16 text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-vlak text-rustig"><Slot /></span>
          <p className="font-medium">Nog geen gesprekken</p>
          <p className="text-sm text-rustig">Alles wat je hier schrijft, kan alleen jij en wie je spreekt lezen.</p>
          <button onClick={() => setNieuw(true)} className="mt-2 h-11 rounded-full bg-accent px-5 font-medium text-white">
            Begin een gesprek
          </button>
        </div>
      )}
      <ul className="flex flex-col px-3">
        {ik !== null && lijst.map((g) => {
          const naam = gesprekNaam(g, ik);
          return (
            <li key={g.id}>
              <button onClick={() => setOpen(g.id)} className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left hover:bg-vlak">
                <Rondje naam={naam} id={g.soort === "groep" ? -g.id : g.leden.find((l) => l.id !== ik)?.id ?? g.id} groot />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className={`truncate ${g.ongelezen ? "font-semibold" : "font-medium"}`}>{naam}</span>
                    <span className={`shrink-0 text-xs ${g.ongelezen ? "font-semibold text-accent" : "text-zacht"}`}>{tijdje(g.laatst)}</span>
                  </span>
                  <span className="flex items-center justify-between gap-2">
                    <span className={`truncate text-sm ${g.ongelezen ? "text-inkt" : "text-rustig"}`}>
                      {g.status === "verzoek" ? "Wil met je chatten" : voorbeelden[g.id] ?? ""}
                    </span>
                    {g.ongelezen > 0 && (
                      <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-semibold text-white">
                        {g.ongelezen}
                      </span>
                    )}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {nieuw && <NieuwBlad sluit={() => setNieuw(false)} gestart={(id) => { setNieuw(false); laden().then(() => setOpen(id)); }} />}
    </div>
  );
}

function NieuwBlad({ sluit, gestart }: { sluit: () => void; gestart: (id: number) => void }) {
  const [naam, setNaam] = useState("");
  const [lijst, setLijst] = useState<Contact[]>([]);
  const [fout, setFout] = useState("");
  useEffect(() => { contacten().then(setLijst).catch(() => {}); }, []);

  async function start(met: string) {
    setFout("");
    try {
      gestart((await nieuwGesprek(met)).id);
    } catch (e) {
      setFout(e instanceof Error ? e.message : "Dat lukte niet.");
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/30" onClick={sluit}>
      <div role="dialog" aria-label="Nieuw gesprek" onClick={(e) => e.stopPropagation()}
        className="flex max-h-[80%] w-full max-w-xl flex-col gap-4 rounded-t-[28px] bg-white px-6 pt-3 pb-[max(env(safe-area-inset-bottom),24px)] dark:bg-[#16161a]">
        <span className="mx-auto h-1 w-10 rounded-full bg-lijn" />
        <h2 className="text-xl font-semibold">Nieuw gesprek</h2>
        <form onSubmit={(e) => { e.preventDefault(); start(naam); }} className="flex gap-2">
          <input autoFocus value={naam} onChange={(e) => setNaam(e.target.value)} placeholder="Gebruikersnaam"
            autoCapitalize="none" autoCorrect="off" aria-label="Gebruikersnaam"
            className="h-12 flex-1 rounded-2xl bg-vlak px-4 outline-none placeholder:text-zacht" />
          <button disabled={!naam.trim()} className="h-12 rounded-2xl bg-accent px-5 font-medium text-white disabled:opacity-30">Start</button>
        </form>
        {fout && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{fout}</p>}
        {lijst.length > 0 && (
          <ul className="-mx-3 flex flex-col overflow-y-auto">
            {lijst.map((c) => (
              <li key={c.id}>
                <button onClick={() => start(c.gebruikersnaam)} disabled={!c.chat}
                  className="flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left hover:bg-vlak disabled:opacity-40">
                  <Rondje naam={c.naam} id={c.id} />
                  <span className="flex flex-col">
                    <span className="font-medium">{c.naam}</span>
                    <span className="text-[13px] text-rustig">{c.chat ? `@${c.gebruikersnaam}` : "Gebruikt de chat nog niet"}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Gesprekscherm({ id, ik, begin, terug }: { id: number; ik: number; begin?: Gesprek; terug: () => void }) {
  const [g, setG] = useState<Gesprek | undefined>(begin);
  const [regels, setRegels] = useState<Regel[]>([]);
  const [invoer, setInvoer] = useState("");
  const [fout, setFout] = useState("");
  const [timer, setTimer] = useState(false);
  const tot = useRef(0);
  const onder = useRef<HTMLDivElement>(null);
  const bezig = useRef(false);

  const bijwerken = useCallback(async () => {
    if (bezig.current) return;
    bezig.current = true;
    try {
      const r = await berichten(id, tot.current);
      if (r.gesprek) setG(r.gesprek);
      if (r.hoogste) tot.current = r.hoogste;
      if (r.regels.length) setRegels((oud) => {
        const al = new Set(oud.map((x) => x.id));
        return [...oud, ...r.regels.filter((x) => !al.has(x.id))];
      });
    } finally {
      bezig.current = false;
    }
  }, [id]);

  useEffect(() => {
    bijwerken().catch((e) => setFout(e instanceof Error ? e.message : "Laden lukte niet."));
    const t = setInterval(() => document.visibilityState === "visible" && bijwerken().catch(() => {}), 2500);
    return () => clearInterval(t);
  }, [bijwerken]);
  useEffect(() => { onder.current?.scrollIntoView({ block: "end" }); }, [regels.length]);

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

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-lijn bg-white/85 px-3 pt-12 pb-2.5 backdrop-blur dark:bg-[#0b0b0e]/85">
        <button onClick={terug} aria-label="Terug" className="flex size-10 items-center justify-center rounded-full text-rustig hover:bg-vlak">
          <Terug />
        </button>
        {g && <Rondje naam={naam} id={groep ? -id : anderen[0]?.id ?? id} />}
        <button onClick={() => setTimer((t) => !t)} aria-expanded={timer} className="flex min-w-0 flex-col text-left">
          <span className="truncate font-semibold">{naam}</span>
          <span className="flex items-center gap-1 text-xs text-zacht">
            <Slot className="size-3" /> Versleuteld
            {g?.verdwijnen ? ` · verdwijnt na ${VERDWIJNEN.find(([s]) => s === g.verdwijnen)?.[1] ?? "een tijd"}` : ""}
          </span>
        </button>
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

      <main className="flex flex-1 flex-col gap-1 px-4 py-4" aria-live="polite">
        {regels.map((r, i) => {
          const mijn = r.afzender === ik;
          const vorige = regels[i - 1];
          const nieuweDag = !vorige || datumTekst(new Date(vorige.tijd)) !== datumTekst(new Date(r.tijd));
          const zelfde = !nieuweDag && vorige?.afzender === r.afzender;
          const lid = g?.leden.find((l) => l.id === r.afzender);
          const tekst = r.weg ? "Bericht verwijderd" : r.fout || !r.bericht ? "Dit bericht kun je op dit apparaat niet lezen"
            : r.bericht.t === "tekst" ? String(r.bericht.tekst ?? "") : kortTekst(r.bericht) || "Bericht";
          const bijzonder = r.weg || r.fout || !r.bericht || r.bericht.t !== "tekst";
          return (
            <Fragment key={r.id}>
              {nieuweDag && (
                <p className="my-3 text-center text-xs font-medium text-zacht">
                  {datumTekst(new Date(r.tijd)) === datumTekst(new Date()) ? "Vandaag" : dagTitel(new Date(r.tijd))}
                </p>
              )}
              <div className={`flex flex-col ${mijn ? "items-end" : "items-start"} ${zelfde ? "" : "mt-2"}`}>
                {groep && !mijn && !zelfde && <span className="mb-0.5 ml-3 text-xs font-medium text-rustig">{lid?.naam}</span>}
                <div className={`max-w-[80%] rounded-[20px] px-3.5 py-2 ${mijn ? "rounded-br-md bg-accent text-white" : "rounded-bl-md bg-vlak"}
                  ${bijzonder ? "italic opacity-80" : ""}`}>
                  <span className="whitespace-pre-wrap break-words">{tekst}</span>
                  <span className={`ml-2 inline-flex translate-y-0.5 items-center gap-0.5 text-[11px] ${mijn ? "text-white/70" : "text-zacht"}`}>
                    {new Date(r.tijd).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })}
                    {mijn && (r.id <= gelezen ? <Dubbelvink className="size-4 text-white" />
                      : r.id <= ontvangen ? <Dubbelvink className="size-4" /> : <Vinkje className="size-3.5" />)}
                  </span>
                </div>
              </div>
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
      ) : (
        <form onSubmit={stuur} className="sticky bottom-0 bg-white px-4 pb-3 pt-2 dark:bg-[#0b0b0e]">
          {fout && <p role="alert" className="px-2 pb-2 text-sm text-red-600 dark:text-red-400">{fout}</p>}
          <label className="flex items-center gap-2 rounded-[26px] bg-vlak py-1.5 pr-1.5 pl-5">
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

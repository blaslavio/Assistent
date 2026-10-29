// Je winkel ontwerpen: een stijl kiezen, een bannerfoto, teksten, welke delen in welke volgorde, en meteen zien
// hoe kopers het zien. Niets is zichtbaar voor anderen tot je bewaart (en je winkel open is).
import { useEffect, useRef, useState, type ReactNode } from "react";
import { WinkelPagina } from "./WinkelPagina";
import { Camera, Kruis, Plus, Prullenbak, Terug } from "../iconen";
import { winkelVoorbeeld, type Winkel } from "../lib/winkelen";
import { DELEN, STIJLEN, bannerFoto, linkNetjes, opmaakBewaren, type Deel, type Opmaak } from "../lib/winkelopmaak";
import { foutTekst } from "../lib/net";

const veld = "h-12 w-full rounded-2xl bg-vlak px-4 outline-none focus:ring-2 focus:ring-accent";
const vak = "w-full rounded-2xl bg-vlak px-4 py-3 outline-none focus:ring-2 focus:ring-accent";
const rondje = "flex size-8 items-center justify-center rounded-full bg-vlak disabled:opacity-30";

export function WinkelOntwerpen({ sluit, start = "bewerken" }: { sluit: (bewaard: boolean) => void;
  start?: "bewerken" | "voorbeeld" }) {
  const [w, setW] = useState<Winkel | null>(null);
  const [o, setO] = useState<Opmaak | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [bannerNieuw, setBannerNieuw] = useState(false);
  const [deel, setDeel] = useState(start);
  const [gewijzigd, setGewijzigd] = useState(false);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState("");
  const kiezer = useRef<HTMLInputElement>(null);

  useEffect(() => {
    winkelVoorbeeld().then((x) => { setW(x); setO(x.opmaak); setBanner(x.banner ?? null); })
      .catch((e) => setFout(foutTekst(e)));
  }, []);

  const zet = (x: Partial<Opmaak>) => { setO((v) => ({ ...v!, ...x })); setGewijzigd(true); };

  function dicht() {
    if (gewijzigd && !confirm("Je wijzigingen zijn nog niet bewaard. Toch sluiten?")) return;
    sluit(false);
  }

  async function bewaren() {
    if (!o) return;
    setBezig(true);
    setFout("");
    try {
      const schoon = { ...o, links: o.links.map((l) => ({ ...l, url: linkNetjes(l.url) })).filter((l) => l.url) };
      setO(await opmaakBewaren(schoon, bannerNieuw ? banner ?? "" : undefined));
      setGewijzigd(false);
      setBannerNieuw(false);
      sluit(true);
    } catch (e) {
      setFout(foutTekst(e));
    } finally {
      setBezig(false);
    }
  }

  async function fotoGekozen(f: File | undefined) {
    if (!f) return;
    try {
      setBanner(await bannerFoto(f));
      setBannerNieuw(true);
      setGewijzigd(true);
    } catch (e) {
      setFout(foutTekst(e));
    }
    if (kiezer.current) kiezer.current.value = "";
  }

  function schuif(d: Deel, stap: number) {
    const v = [...o!.volgorde];
    const i = v.indexOf(d);
    const j = i + stap;
    if (i < 0 || j < 0 || j >= v.length) return;
    [v[i], v[j]] = [v[j], v[i]];
    zet({ volgorde: v });
  }

  const aan = (d: Deel) => !!o?.volgorde.includes(d);
  const schakel = (d: Deel) => zet({ volgorde: aan(d) ? o!.volgorde.filter((x) => x !== d) : [...o!.volgorde, d] });
  const uit = DELEN.filter(([d]) => !aan(d));

  return (
    <div role="dialog" aria-label="Winkel ontwerpen" className="fixed inset-0 z-40 flex justify-center bg-white dark:bg-[#16161a]">
      <div className="flex h-full w-full max-w-xl flex-col">
        <div className="flex shrink-0 items-center gap-2 px-3 pt-[max(env(safe-area-inset-top),12px)] pb-2">
          <button onClick={dicht} aria-label="Sluiten" className="flex size-10 items-center justify-center rounded-full hover:bg-vlak">
            <Kruis className="size-5" /></button>
          <h2 className="flex-1 text-lg font-semibold">Winkel ontwerpen</h2>
          <button onClick={bewaren} disabled={bezig || !o || !gewijzigd}
            className="h-10 rounded-full bg-accent px-5 text-sm font-medium text-white disabled:opacity-40">
            {bezig ? "Bezig..." : "Bewaren"}</button>
        </div>
        <div role="radiogroup" aria-label="Weergave" className="mx-6 mb-3 flex shrink-0 rounded-full bg-vlak p-1">
          {(["bewerken", "voorbeeld"] as const).map((x) => (
            <button key={x} role="radio" aria-checked={deel === x} onClick={() => setDeel(x)}
              className={`h-9 flex-1 rounded-full text-sm font-medium ${deel === x ? "bg-white shadow-sm dark:bg-black/40" : "text-rustig"}`}>
              {x === "bewerken" ? "Bewerken" : "Voorbeeld"}</button>
          ))}
        </div>
        {fout && <p role="alert" className="mx-6 mb-2 text-sm text-red-600 dark:text-red-400">{fout}</p>}
        <div key={deel} className="flex-1 overflow-y-auto px-6 pb-[max(env(safe-area-inset-bottom),24px)]">
          {!w || !o ? (!fout && <p className="bezig-tekst py-6 text-rustig">Laden</p>)
            : deel === "voorbeeld" ? (
              <>
                <p className="mb-4 rounded-2xl bg-vlak px-4 py-2.5 text-[13px] text-rustig">
                  Zo zien kopers je winkel{gewijzigd ? ", met je wijzigingen die nog niet bewaard zijn" : ""}.
                  {!w.producten.length && " Zet producten in je winkel om ze hier te zien."}
                </p>
                <WinkelPagina w={w} opmaak={o} banner={banner} open={() => {}} />
              </>
            ) : (
              <div className="flex flex-col gap-2">
                <Blok titel="Stijl" waarde={STIJLEN.find(([s]) => s === o.stijl)?.[1]}>
                  <div className="grid grid-cols-3 gap-2">
                    {STIJLEN.map(([s, naam, uitleg]) => (
                      <button key={s} onClick={() => zet({ stijl: s })} aria-pressed={o.stijl === s} title={uitleg}
                        className={`flex flex-col items-center gap-1.5 rounded-2xl p-2 ${o.stijl === s ? "ring-2 ring-accent" : "bg-vlak"}`}>
                        <Schets stijl={s} kleur={w.kleur} />
                        <span className="text-sm font-medium">{naam}</span>
                      </button>
                    ))}
                  </div>
                </Blok>
                <Blok titel="Bannerfoto" waarde={banner ? "Gekozen" : "Geen"}>
                  {banner && <img src={banner} alt="" className="aspect-[16/7] w-full rounded-2xl object-cover" />}
                  <div className="flex gap-2">
                    <button onClick={() => kiezer.current?.click()} className="flex h-10 items-center gap-2 rounded-full bg-vlak px-4 text-sm font-medium">
                      <Camera className="size-4" />{banner ? "Andere foto" : "Kies een foto"}</button>
                    {banner && <button onClick={() => { setBanner(null); setBannerNieuw(true); setGewijzigd(true); }}
                      className="h-10 rounded-full bg-vlak px-4 text-sm font-medium">Weghalen</button>}
                  </div>
                  <input ref={kiezer} type="file" accept="image/*" hidden onChange={(e) => fotoGekozen(e.target.files?.[0])} />
                  <p className="text-[13px] text-rustig">Een brede foto werkt het best, bijvoorbeeld je winkel of je werk.</p>
                </Blok>
                <Blok titel="Welkom" waarde={o.kop || "Je winkelnaam"}>
                  <input value={o.kop} onChange={(e) => zet({ kop: e.target.value })} maxLength={80}
                    placeholder="Grote titel, bijvoorbeeld: Handgemaakt in Ede" aria-label="Titel" className={veld} />
                  <textarea value={o.welkom} onChange={(e) => zet({ welkom: e.target.value })} maxLength={600} rows={3}
                    placeholder="Een paar zinnen om kopers te verwelkomen" aria-label="Welkomstekst" className={vak} />
                  {o.stijl === "magazine" && (
                    <input value={o.knop} onChange={(e) => zet({ knop: e.target.value })} maxLength={24}
                      placeholder="Tekst op de knop, bijvoorbeeld: Bekijk" aria-label="Knoptekst" className={veld} />
                  )}
                </Blok>
                <Blok titel="Onderdelen en volgorde" waarde={`${o.volgorde.length} van ${DELEN.length}`}>
                  <ul className="flex flex-col divide-y divide-lijn rounded-2xl bg-vlak">
                    {o.volgorde.map((d, i) => (
                      <li key={d} className="flex items-center gap-1.5 py-1.5 pr-2 pl-4">
                        <span className="flex-1">{DELEN.find(([x]) => x === d)?.[1]}</span>
                        <button onClick={() => schuif(d, -1)} disabled={i === 0} aria-label="Omhoog" className={rondje + " bg-white dark:bg-black/30"}>
                          <Terug className="size-4 rotate-90" /></button>
                        <button onClick={() => schuif(d, 1)} disabled={i === o.volgorde.length - 1} aria-label="Omlaag"
                          className={rondje + " bg-white dark:bg-black/30"}><Terug className="size-4 -rotate-90" /></button>
                        <button onClick={() => schakel(d)} aria-label="Verbergen" disabled={d === "producten"}
                          className={rondje + " bg-white dark:bg-black/30"}><Kruis className="size-4" /></button>
                      </li>
                    ))}
                  </ul>
                  {uit.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {uit.map(([d, naam]) => (
                        <button key={d} onClick={() => schakel(d)} className="flex h-9 items-center gap-1.5 rounded-full bg-vlak px-3 text-sm">
                          <Plus className="size-4" />{naam}</button>
                      ))}
                    </div>
                  )}
                </Blok>
                {aan("uitgelicht") && (
                  <Blok titel="Uitgelicht" waarde={`${o.uitgelicht.length} gekozen`}>
                    {!w.producten.length ? <p className="text-[13px] text-rustig">Zet eerst producten in je winkel.</p> : (
                      <ul className="flex flex-col gap-1">
                        {w.producten.map((p) => {
                          const gekozen = o.uitgelicht.includes(p.id);
                          return (
                            <li key={p.id}>
                              <label className="flex items-center gap-3 rounded-xl px-1 py-1.5">
                                <input type="checkbox" checked={gekozen} disabled={!gekozen && o.uitgelicht.length >= 8}
                                  onChange={() => zet({ uitgelicht: gekozen ? o.uitgelicht.filter((x) => x !== p.id) : [...o.uitgelicht, p.id] })}
                                  className="size-5 accent-[var(--color-accent)]" />
                                <span className="flex-1 truncate">{p.titel}</span>
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </Blok>
                )}
                {aan("over") && (
                  <Blok titel="Over ons" waarde={o.over ? "Ingevuld" : "Leeg"}>
                    <textarea value={o.over} onChange={(e) => zet({ over: e.target.value })} maxLength={3000} rows={5}
                      placeholder="Wie ben je, wat maak je en waarom?" aria-label="Over ons" className={vak} />
                  </Blok>
                )}
                {aan("vragen") && (
                  <Blok titel="Veelgestelde vragen" waarde={`${o.vragen.length}`}>
                    {o.vragen.map((v, i) => (
                      <div key={i} className="flex flex-col gap-2 rounded-2xl bg-vlak p-3">
                        <div className="flex gap-2">
                          <input value={v.vraag} maxLength={200} placeholder="Vraag" aria-label={`Vraag ${i + 1}`}
                            onChange={(e) => zet({ vragen: o.vragen.map((x, j) => j === i ? { ...x, vraag: e.target.value } : x) })}
                            className="h-10 min-w-0 flex-1 rounded-xl bg-white px-3 outline-none dark:bg-black/30" />
                          <button onClick={() => zet({ vragen: o.vragen.filter((_, j) => j !== i) })} aria-label="Vraag weghalen"
                            className={rondje + " bg-white dark:bg-black/30"}><Prullenbak className="size-4" /></button>
                        </div>
                        <textarea value={v.antwoord} maxLength={1000} rows={2} placeholder="Antwoord" aria-label={`Antwoord ${i + 1}`}
                          onChange={(e) => zet({ vragen: o.vragen.map((x, j) => j === i ? { ...x, antwoord: e.target.value } : x) })}
                          className="rounded-xl bg-white px-3 py-2 outline-none dark:bg-black/30" />
                      </div>
                    ))}
                    {o.vragen.length < 12 && (
                      <button onClick={() => zet({ vragen: [...o.vragen, { vraag: "", antwoord: "" }] })}
                        className="flex h-10 items-center gap-2 self-start rounded-full bg-vlak px-4 text-sm font-medium">
                        <Plus className="size-4" />Vraag toevoegen</button>
                    )}
                  </Blok>
                )}
                {aan("links") && (
                  <Blok titel="Links" waarde={`${o.links.length}`}>
                    {o.links.map((l, i) => (
                      <div key={i} className="flex gap-2">
                        <input value={l.label} maxLength={40} placeholder="Naam" aria-label={`Naam link ${i + 1}`}
                          onChange={(e) => zet({ links: o.links.map((x, j) => j === i ? { ...x, label: e.target.value } : x) })}
                          className="h-11 w-28 shrink-0 rounded-xl bg-vlak px-3 outline-none" />
                        <input value={l.url} maxLength={300} placeholder="instagram.com/..." inputMode="url" aria-label={`Adres link ${i + 1}`}
                          onChange={(e) => zet({ links: o.links.map((x, j) => j === i ? { ...x, url: e.target.value } : x) })}
                          className={`h-11 min-w-0 flex-1 rounded-xl bg-vlak px-3 outline-none ${l.url && !linkNetjes(l.url) ? "ring-2 ring-red-500" : ""}`} />
                        <button onClick={() => zet({ links: o.links.filter((_, j) => j !== i) })} aria-label="Link weghalen" className={rondje}>
                          <Prullenbak className="size-4" /></button>
                      </div>
                    ))}
                    {o.links.length < 8 && (
                      <button onClick={() => zet({ links: [...o.links, { label: "", url: "" }] })}
                        className="flex h-10 items-center gap-2 self-start rounded-full bg-vlak px-4 text-sm font-medium">
                        <Plus className="size-4" />Link toevoegen</button>
                    )}
                    <p className="text-[13px] text-rustig">Bijvoorbeeld je Instagram, TikTok of website.</p>
                  </Blok>
                )}
                {aan("openingstijden") && (
                  <Blok titel="Openingstijden" waarde={o.openingstijden ? "Ingevuld" : "Leeg"}>
                    <textarea value={o.openingstijden} onChange={(e) => zet({ openingstijden: e.target.value })} maxLength={400} rows={4}
                      placeholder={"Ma t/m vr 9:00 tot 17:00\nZa 10:00 tot 16:00"} aria-label="Openingstijden" className={vak} />
                  </Blok>
                )}
                <p className="px-1 pt-1 text-[13px] text-rustig">Naam, kleur en verzending pas je aan bij Aanpassen.</p>
              </div>
            )}
        </div>
      </div>
    </div>
  );
}

function Blok({ titel, waarde, open, children }: { titel: string; waarde?: string; open?: boolean; children: ReactNode }) {
  return (
    <details open={open} className="group rounded-2xl border border-lijn">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 marker:hidden">
        <span className="flex-1 font-medium">{titel}</span>
        {waarde && <span className="truncate text-sm text-rustig">{waarde}</span>}
        <Terug className="size-4 shrink-0 -rotate-90 text-zacht transition-transform group-open:rotate-90" />
      </summary>
      <div className="flex flex-col gap-3 px-4 pb-4">{children}</div>
    </details>
  );
}

/** Een klein plaatje van de stijl, zodat je ziet wat je kiest. */
function Schets({ stijl, kleur }: { stijl: string; kleur: string }) {
  const blok = "rounded bg-zacht/30";
  return (
    <span aria-hidden className="flex aspect-square w-full flex-col gap-1 rounded-lg bg-white p-1.5 dark:bg-black/30">
      <span className="h-3 rounded" style={{ background: kleur }} />
      {stijl === "etalage" && <span className="grid flex-1 grid-cols-2 gap-1">{[0, 1, 2, 3].map((i) => <span key={i} className={blok} />)}</span>}
      {stijl === "magazine" && <><span className={`${blok} h-1/2`} /><span className="grid flex-1 grid-cols-2 gap-1">
        <span className={blok} /><span className={blok} /></span></>}
      {stijl === "lijst" && [0, 1, 2, 3].map((i) => (
        <span key={i} className="flex flex-1 gap-1"><span className={`${blok} aspect-square h-full`} /><span className="flex flex-1 flex-col gap-0.5 py-0.5">
          <span className={`${blok} h-1.5`} /><span className={`${blok} h-1.5 w-2/3`} /></span></span>
      ))}
    </span>
  );
}

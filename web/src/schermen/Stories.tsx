import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Kruis, Oog, Plus, Prullenbak } from "../iconen";
import { STORY_KLEUREN, fotoVerkleinen, stories, storyGezien, storyPlaatsen, storyWeg, type Story, type StoryInhoud } from "../lib/chat";
import { MAX_SECONDEN, duurVan, videoKlaarmaken } from "../lib/video";
import { tijdje } from "../lib/tijd";
import { Rondje } from "../rondje";

const DUUR = 5000;

type Persoon = { maker: number; naam: string; lijst: Story[]; nieuw: boolean };

function groeperen(alle: Story[], ik: number): { eigen: Persoon | null; anderen: Persoon[] } {
  const per = new Map<number, Persoon>();
  for (const s of alle) {
    const p = per.get(s.maker) ?? { maker: s.maker, naam: s.naam, lijst: [], nieuw: false };
    p.lijst.push(s);
    if (!s.gezien && s.maker !== ik) p.nieuw = true;
    per.set(s.maker, p);
  }
  const anderen = [...per.values()].filter((p) => p.maker !== ik)
    .sort((a, b) => Number(b.nieuw) - Number(a.nieuw) || b.lijst[b.lijst.length - 1].tijd.localeCompare(a.lijst[a.lijst.length - 1].tijd));
  return { eigen: per.get(ik) ?? null, anderen };
}

/** De rij rondjes boven de gesprekken: jouw story en die van je contacten. */
export function StoryRij({ ik }: { ik: number }) {
  const [alle, setAlle] = useState<Story[]>([]);
  const [kijken, setKijken] = useState<{ reeks: Persoon[]; nr: number } | null>(null);
  const [maken, setMaken] = useState(false);

  const laden = useCallback(() => stories().then(setAlle).catch(() => {}), []);
  useEffect(() => {
    laden();
    const t = setInterval(() => document.visibilityState === "visible" && laden(), 30000);
    return () => clearInterval(t);
  }, [laden]);

  const { eigen, anderen } = groeperen(alle, ik);

  return (
    <>
      <ul aria-label="Stories" className="flex gap-4 overflow-x-auto px-6 pt-1 pb-4 [scrollbar-width:none]">
        <li className="flex w-16 shrink-0 flex-col items-center gap-1.5">
          <span className="relative">
            <button onClick={() => (eigen ? setKijken({ reeks: [eigen], nr: 0 }) : setMaken(true))}
              aria-label={eigen ? "Jouw story bekijken" : "Story plaatsen"}
              className={`flex rounded-full p-[3px] ${eigen ? "ring-2 ring-lijn" : ""}`}>
              <Rondje naam="Jij" id={ik} groot />
            </button>
            <button onClick={() => setMaken(true)} aria-label="Nieuwe story"
              className="absolute -right-0.5 -bottom-0.5 flex size-5 items-center justify-center rounded-full border-2 border-white bg-accent text-white dark:border-[#0b0b0d]">
              <Plus className="size-3" />
            </button>
          </span>
          <span className="w-full truncate text-center text-xs text-rustig">Jij</span>
        </li>
        {anderen.map((p, i) => (
          <li key={p.maker} className="flex w-16 shrink-0 flex-col items-center gap-1.5">
            <button onClick={() => setKijken({ reeks: anderen, nr: i })} aria-label={`Story van ${p.naam}${p.nieuw ? ", nieuw" : ""}`}
              className={`flex rounded-full p-[3px] ring-2 ${p.nieuw ? "ring-accent" : "ring-lijn"}`}>
              <Rondje naam={p.naam} id={p.maker} groot />
            </button>
            <span className={`w-full truncate text-center text-xs ${p.nieuw ? "font-medium" : "text-rustig"}`}>{p.naam}</span>
          </li>
        ))}
      </ul>
      {kijken && (
        <Kijker reeks={kijken.reeks} begin={kijken.nr} ik={ik}
          sluit={() => { setKijken(null); laden(); }} />
      )}
      {maken && <Maken sluit={() => setMaken(false)} geplaatst={() => { setMaken(false); laden(); }} />}
    </>
  );
}

function Kijker({ reeks, begin, ik, sluit }: { reeks: Persoon[]; begin: number; ik: number; sluit: () => void }) {
  const [persoon, setPersoon] = useState(begin);
  // Begin bij de eerste story die je nog niet zag.
  const eersteNieuw = (p: Persoon) => Math.max(0, p.lijst.findIndex((s) => !s.gezien && s.maker !== ik));
  const [nr, setNr] = useState(() => eersteNieuw(reeks[begin]));
  const [verstreken, setVerstreken] = useState(0);
  const [pauze, setPauze] = useState(false);
  const [kijkers, setKijkers] = useState(false);
  const [zeker, setZeker] = useState(false);
  const [weg, setWeg] = useState<number[]>([]);
  const ingedrukt = useRef(0);
  const film = useRef<HTMLVideoElement>(null);
  const [zonderGeluid, setZonderGeluid] = useState(false);

  const p = reeks[persoon];
  const lijst = p.lijst.filter((s) => !weg.includes(s.id));
  const s = lijst[Math.min(nr, lijst.length - 1)];
  const eigen = p.maker === ik;
  const duur = s?.inhoud?.t === "video" ? Math.min(MAX_SECONDEN, s.inhoud.duur) * 1000 : DUUR;

  const volgende = useCallback(() => {
    setVerstreken(0);
    setZeker(false);
    if (nr + 1 < lijst.length) return setNr(nr + 1);
    if (persoon + 1 < reeks.length) {
      setPersoon(persoon + 1);
      return setNr(eersteNieuw(reeks[persoon + 1]));
    }
    sluit();
  }, [nr, lijst.length, persoon, reeks, sluit]);

  const vorige = () => {
    setVerstreken(0);
    setZeker(false);
    if (nr > 0) return setNr(nr - 1);
    if (persoon > 0) {
      setPersoon(persoon - 1);
      setNr(reeks[persoon - 1].lijst.length - 1);
    }
  };

  useEffect(() => {
    if (s && !eigen && !s.gezien) {
      s.gezien = true;
      storyGezien(s.id);
    }
  }, [s, eigen]);

  const stil = pauze || kijkers || zeker;

  // Een filmpje speelt mee met de balk: stilzetten als je vasthoudt, verder als je loslaat.
  useEffect(() => {
    const v = film.current;
    if (!v) return;
    if (stil) return v.pause();
    v.play().catch(() => {
      v.muted = true;
      setZonderGeluid(true);
      v.play().catch(() => {});
    });
  }, [stil, s?.id]);

  useEffect(() => {
    if (stil || !s) return;
    const start = performance.now() - verstreken;
    let stap = 0;
    const tik = () => {
      const v = film.current;
      const t = v ? v.currentTime * 1000 : performance.now() - start;
      if (t >= duur || v?.ended) return volgende();
      setVerstreken(t);
      stap = requestAnimationFrame(tik);
    };
    stap = requestAnimationFrame(tik);
    return () => cancelAnimationFrame(stap);
  }, [stil, s?.id, volgende, duur]);

  useEffect(() => {
    const toets = (e: KeyboardEvent) => {
      if (e.key === "Escape") sluit();
      if (e.key === "ArrowRight") volgende();
      if (e.key === "ArrowLeft") vorige();
    };
    window.addEventListener("keydown", toets);
    return () => window.removeEventListener("keydown", toets);
  });

  useEffect(() => {
    if (!s) sluit();
  }, [s, sluit]);
  if (!s) return null;

  async function verwijderen() {
    if (!zeker) return setZeker(true);
    await storyWeg(s.id).catch(() => {});
    setWeg([...weg, s.id]);
    setZeker(false);
    if (lijst.length === 1) sluit();
    else if (nr >= lijst.length - 1) setNr(nr - 1);
  }

  const inhoud = s.inhoud!;
  return (
    <div role="dialog" aria-label={`Story van ${eigen ? "jou" : p.naam}`}
      className="fixed inset-0 z-40 flex flex-col bg-black text-white select-none">
      <div className="absolute inset-x-0 top-0 z-10 flex flex-col gap-3 bg-gradient-to-b from-black/50 to-transparent px-3 pt-[max(env(safe-area-inset-top),12px)] pb-6">
        <div className="flex gap-1">
          {lijst.map((x, i) => (
            <span key={x.id} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/30">
              <span className="block h-full bg-white"
                style={{ width: `${i < nr ? 100 : i > nr ? 0 : Math.min(100, (verstreken / duur) * 100)}%` }} />
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2.5 px-1">
          <Rondje naam={eigen ? "Jij" : p.naam} id={p.maker} />
          <span className="flex-1 text-sm"><span className="font-semibold">{eigen ? "Jouw story" : p.naam}</span>
            <span className="ml-2 text-white/70">{tijdje(s.tijd)}</span></span>
          <button onClick={sluit} aria-label="Sluiten" className="flex size-10 items-center justify-center rounded-full">
            <Kruis className="size-6" />
          </button>
        </div>
      </div>

      <div className="relative flex flex-1 items-center justify-center overflow-hidden"
        onPointerDown={() => { ingedrukt.current = performance.now(); setPauze(true); }}
        onPointerUp={(e) => {
          setPauze(false);
          if (performance.now() - ingedrukt.current > 350) return;
          const r = e.currentTarget.getBoundingClientRect();
          if (e.clientX - r.left < r.width / 3) vorige();
          else volgende();
        }}
        onPointerCancel={() => setPauze(false)}>
        {inhoud.t === "tekst" ? (
          <div className="flex size-full items-center justify-center px-8" style={{ background: inhoud.kleur }}>
            <p className="max-w-md text-center text-[28px] leading-snug font-semibold break-words whitespace-pre-wrap">{inhoud.tekst}</p>
          </div>
        ) : inhoud.t === "video" ? (
          <>
            <video key={s.id} ref={film} src={inhoud.video} playsInline preload="auto" aria-label={inhoud.tekst || "Filmpje"}
              className="max-h-full max-w-full object-contain" />
            {zonderGeluid && (
              <button onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()}
                onClick={() => { if (film.current) film.current.muted = false; setZonderGeluid(false); }}
                className="absolute top-28 right-4 rounded-full bg-black/50 px-4 py-2 text-sm">Geluid aan</button>
            )}
            {inhoud.tekst && (
              <p className="absolute inset-x-0 bottom-6 mx-auto w-fit max-w-[90%] rounded-2xl bg-black/50 px-4 py-2 text-center">{inhoud.tekst}</p>
            )}
          </>
        ) : (
          <>
            <img src={inhoud.foto} alt={inhoud.tekst || "Foto"} draggable={false} className="max-h-full max-w-full object-contain" />
            {inhoud.tekst && (
              <p className="absolute inset-x-0 bottom-6 mx-auto w-fit max-w-[90%] rounded-2xl bg-black/50 px-4 py-2 text-center">{inhoud.tekst}</p>
            )}
          </>
        )}
      </div>

      {eigen && (
        <div className="flex items-center justify-between gap-3 px-4 pt-3 pb-[max(env(safe-area-inset-bottom),16px)]">
          <button onClick={() => setKijkers(true)} className="flex h-11 items-center gap-2 rounded-full px-3 text-sm">
            <Oog className="size-5" />{(s.kijkers?.length ?? 0) === 1 ? "1 keer gezien" : `${s.kijkers?.length ?? 0} keer gezien`}
          </button>
          <span className="flex items-center gap-2">
            {zeker && <button onClick={() => setZeker(false)} className="h-11 rounded-full px-4 text-sm text-white/80">Annuleer</button>}
            <button onClick={verwijderen} aria-label="Story verwijderen"
              className={`flex h-11 items-center gap-2 rounded-full px-4 text-sm ${zeker ? "bg-red-600" : ""}`}>
              <Prullenbak className="size-5" />{zeker && "Verwijder"}
            </button>
          </span>
        </div>
      )}

      {kijkers && (
        <div className="absolute inset-0 z-20 flex items-end bg-black/40" onClick={() => setKijkers(false)}>
          <div role="dialog" aria-label="Gezien door" onClick={(e) => e.stopPropagation()}
            className="mx-auto flex max-h-[60%] w-full max-w-xl flex-col gap-3 rounded-t-[28px] bg-white px-6 pt-3 pb-[max(env(safe-area-inset-bottom),24px)] text-inkt dark:bg-[#16161a]">
            <span className="mx-auto h-1 w-10 rounded-full bg-lijn" />
            <h2 className="text-lg font-semibold">Gezien door</h2>
            {!s.kijkers?.length && <p className="text-sm text-rustig">Nog niemand.</p>}
            <ul className="flex flex-col gap-1 overflow-y-auto">
              {s.kijkers?.map((k, i) => (
                <li key={i} className="flex items-center gap-3 py-1.5">
                  <Rondje naam={k.naam} id={i + 1} />
                  <span className="flex-1">{k.naam}</span>
                  <span className="text-sm text-zacht">{tijdje(k.gezien)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

function Maken({ sluit, geplaatst }: { sluit: () => void; geplaatst: () => void }) {
  const [tekst, setTekst] = useState("");
  const [kleur, setKleur] = useState(STORY_KLEUREN[0]);
  const [foto, setFoto] = useState("");
  const [video, setVideo] = useState<{ bestand: File; url: string; lengte: number } | null>(null);
  const [start, setStart] = useState(0);
  const [voortgang, setVoortgang] = useState<number | null>(null);
  const voorbeeld = useRef<HTMLVideoElement>(null);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState("");
  const kiezer = useRef<HTMLInputElement>(null);

  useEffect(() => () => { if (video) URL.revokeObjectURL(video.url); }, [video]);

  async function kies(bestand?: File) {
    if (!bestand) return;
    setFout("");
    if (bestand.type.startsWith("video/")) {
      try {
        const lengte = await duurVan(bestand);
        setFoto("");
        setStart(0);
        setVideo({ bestand, url: URL.createObjectURL(bestand), lengte });
      } catch {
        setFout("Dit filmpje kan ik niet openen.");
      }
      return;
    }
    try {
      setVideo(null);
      setFoto(await fotoVerkleinen(bestand));
    } catch {
      setFout("Deze foto kan ik niet openen.");
    }
  }

  // Het voorbeeld speelt steeds het gekozen stuk van 15 seconden.
  function stukAfspelen() {
    const v = voorbeeld.current;
    if (v && (v.currentTime < start || v.currentTime > start + MAX_SECONDEN)) v.currentTime = start;
  }

  async function plaatsen() {
    setBezig(true);
    setFout("");
    try {
      let inhoud: StoryInhoud;
      if (video) {
        voorbeeld.current?.pause();
        setVoortgang(0);
        const knip = await videoKlaarmaken(video.bestand, start, Math.min(MAX_SECONDEN, video.lengte - start), setVoortgang);
        inhoud = { t: "video", video: knip.video, duur: knip.duur, tekst: tekst.trim() || undefined };
      } else inhoud = foto ? { t: "foto", foto, tekst: tekst.trim() || undefined } : { t: "tekst", tekst: tekst.trim(), kleur };
      await storyPlaatsen(inhoud);
      geplaatst();
    } catch (e) {
      setFout(e instanceof Error ? e.message : "Plaatsen lukte niet.");
      setVoortgang(null);
      setBezig(false);
    }
  }

  const klaar = foto || video || tekst.trim();
  const beeld = foto || video;
  return (
    <div role="dialog" aria-label="Nieuwe story" className="fixed inset-0 z-40 flex flex-col bg-black text-white"
      style={beeld ? undefined : { background: kleur }}>
      <div className="flex items-center justify-between px-3 pt-[max(env(safe-area-inset-top),12px)]">
        <button onClick={sluit} aria-label="Sluiten" className="flex size-11 items-center justify-center rounded-full">
          <Kruis className="size-6" />
        </button>
        <button onClick={plaatsen} disabled={!klaar || bezig}
          className="h-10 rounded-full bg-white px-5 font-medium text-black disabled:opacity-40">
          {voortgang !== null ? `Klaarmaken ${Math.round(voortgang * 100)}%` : bezig ? "Bezig…" : "Plaatsen"}
        </button>
      </div>

      <div className="relative flex flex-1 flex-col items-center justify-center gap-4 overflow-hidden px-6">
        {beeld ? (
          <>
            {video ? (
              <video ref={voorbeeld} src={video.url} muted playsInline autoPlay loop onTimeUpdate={stukAfspelen}
                aria-label="Gekozen filmpje" className="max-h-[60%] max-w-full rounded-2xl object-contain" />
            ) : <img src={foto} alt="Gekozen foto" className="max-h-[70%] max-w-full rounded-2xl object-contain" />}
            {video && video.lengte > MAX_SECONDEN && (
              <label className="flex w-full max-w-md flex-col gap-1 text-center text-sm text-white/80">
                Kies welke 15 seconden ({Math.floor(start)}–{Math.floor(start + MAX_SECONDEN)} s)
                <input type="range" min={0} max={Math.max(0, video.lengte - MAX_SECONDEN)} step={0.1} value={start}
                  disabled={bezig} onChange={(e) => {
                    setStart(Number(e.target.value));
                    if (voorbeeld.current) voorbeeld.current.currentTime = Number(e.target.value);
                  }} className="w-full accent-white" />
              </label>
            )}
            <input value={tekst} onChange={(e) => setTekst(e.target.value.slice(0, 200))} placeholder="Schrijf erbij (mag leeg)"
              aria-label={video ? "Tekst bij het filmpje" : "Tekst bij de foto"} className="h-11 w-full max-w-md rounded-full bg-white/15 px-4 text-center outline-none placeholder:text-white/60" />
          </>
        ) : (
          <textarea autoFocus value={tekst} onChange={(e) => setTekst(e.target.value.slice(0, 300))} rows={4}
            placeholder="Typ iets" aria-label="Tekst van je story"
            className="w-full max-w-md resize-none bg-transparent text-center text-[28px] leading-snug font-semibold outline-none placeholder:text-white/50" />
        )}
      </div>

      <div className="flex flex-col items-center gap-3 px-6 pb-[max(env(safe-area-inset-bottom),20px)]">
        {fout && <p role="alert" className="rounded-full bg-black/40 px-4 py-1.5 text-sm">{fout}</p>}
        <div className="flex items-center gap-3">
          {beeld ? (
            <button onClick={() => { setFoto(""); setVideo(null); }} disabled={bezig}
              className="h-10 rounded-full bg-white/15 px-4 text-sm">Alleen tekst</button>
          ) : (
            <>
              {STORY_KLEUREN.map((k) => (
                <button key={k} onClick={() => setKleur(k)} aria-label="Kleur kiezen" aria-pressed={k === kleur}
                  style={{ background: k }} className={`size-8 rounded-full border-2 ${k === kleur ? "border-white" : "border-white/30"}`} />
              ))}
              <button onClick={() => kiezer.current?.click()} aria-label="Foto of filmpje kiezen"
                className="ml-1 flex size-10 items-center justify-center rounded-full bg-white/15"><Camera className="size-5" /></button>
            </>
          )}
        </div>
        <p className="text-xs text-white/70">Alleen je contacten zien dit, 24 uur lang.</p>
        <input ref={kiezer} type="file" accept="image/*,video/*" hidden onChange={(e) => kies(e.target.files?.[0])} />
      </div>
    </div>
  );
}

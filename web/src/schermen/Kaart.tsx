// Een eenvoudige kaart met eigen code: OpenStreetMap-tegels, slepen om te schuiven, knoppen om in en uit te zoomen,
// en punten om op te tikken. Genoeg voor de winkelkaart, zonder grote kaartbibliotheek.
import { useEffect, useRef, useState, type PointerEvent as PE } from "react";
import { TEGEL, naarPixel, naarPunt, type KaartWinkel, type Punt } from "../lib/kaart";

const MIN = 11, MAX = 18;

export function Kaart({ midden, zet, punten, gekozen, kies, ik }: { midden: Punt; zet: (p: Punt) => void;
  punten: KaartWinkel[]; gekozen: KaartWinkel | null; kies: (w: KaartWinkel) => void; ik?: Punt | null }) {
  const [zoom, setZoom] = useState(15);
  const vak = useRef<HTMLDivElement>(null);
  const [maat, setMaat] = useState({ b: 360, h: 320 });
  const sleep = useRef<{ x: number; y: number; midden: { x: number; y: number }; bewogen: boolean } | null>(null);
  const [verschuiving, setVerschuiving] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const el = vak.current;
    if (!el) return;
    const meet = () => setMaat({ b: el.clientWidth, h: el.clientHeight });
    meet();
    const o = new ResizeObserver(meet);
    o.observe(el);
    return () => o.disconnect();
  }, []);

  const m = naarPixel(midden, zoom);
  const cx = m.x - verschuiving.x, cy = m.y - verschuiving.y;
  const links = cx - maat.b / 2, boven = cy - maat.h / 2;
  const aantal = 2 ** zoom;
  const tegels: { x: number; y: number; tx: number; ty: number }[] = [];
  for (let ty = Math.floor(boven / TEGEL); ty <= Math.floor((boven + maat.h) / TEGEL); ty++)
    for (let tx = Math.floor(links / TEGEL); tx <= Math.floor((links + maat.b) / TEGEL); tx++)
      if (ty >= 0 && ty < aantal) tegels.push({ x: tx * TEGEL - links, y: ty * TEGEL - boven, tx: ((tx % aantal) + aantal) % aantal, ty });

  function omlaag(e: PE) {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    sleep.current = { x: e.clientX, y: e.clientY, midden: { x: cx, y: cy }, bewogen: false };
  }
  function beweeg(e: PE) {
    const s = sleep.current;
    if (!s) return;
    const dx = e.clientX - s.x, dy = e.clientY - s.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) s.bewogen = true;
    setVerschuiving({ x: dx, y: dy });
  }
  function los() {
    const s = sleep.current;
    sleep.current = null;
    if (!s?.bewogen) { setVerschuiving({ x: 0, y: 0 }); return; }
    setVerschuiving({ x: 0, y: 0 });
    zet(naarPunt(cx, cy, zoom));
  }

  const opKaart = (p: Punt) => {
    const q = naarPixel(p, zoom);
    return { x: q.x - links, y: q.y - boven };
  };
  const zichtbaar = (q: { x: number; y: number }) => q.x > -20 && q.y > -20 && q.x < maat.b + 20 && q.y < maat.h + 20;
  const zoomKnop = "flex size-10 items-center justify-center rounded-full bg-white text-xl shadow dark:bg-[#26262b]";

  return (
    <div ref={vak} className="relative h-80 touch-none select-none overflow-hidden rounded-3xl bg-[#e8e4dc] dark:bg-[#2a2a2e]"
      onPointerDown={omlaag} onPointerMove={beweeg} onPointerUp={los} onPointerCancel={los} aria-label="Kaart met winkels" role="application">
      {tegels.map((t) => (
        <img key={`${zoom}/${t.tx}/${t.ty}/${t.x}`} src={`https://tile.openstreetmap.org/${zoom}/${t.tx}/${t.ty}.png`} alt=""
          draggable={false} className="pointer-events-none absolute dark:brightness-[.75] dark:contrast-[1.1]"
          style={{ left: t.x, top: t.y, width: TEGEL, height: TEGEL }} />
      ))}
      {ik && (() => { const q = opKaart(ik); return zichtbaar(q) && (
        <span aria-label="Jij" className="absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[#1d4ed8] shadow"
          style={{ left: q.x, top: q.y }} />); })()}
      {[...punten].reverse().map((w, i) => {
        const q = opKaart(w);
        if (!zichtbaar(q)) return null;
        const aan = gekozen === w;
        return (
          <button key={`${w.naam}-${i}`} onPointerDown={(e) => e.stopPropagation()} onClick={() => kies(w)} aria-label={w.naam}
            aria-pressed={aan}
            className={`absolute -translate-x-1/2 -translate-y-full rounded-full border-2 border-white shadow ${w.app ? "size-6 bg-accent" : "size-4 bg-[#6b7280]"} ${aan ? "z-10 scale-125 ring-2 ring-accent" : ""}`}
            style={{ left: q.x, top: q.y }} />
        );
      })}
      <div className="absolute right-3 top-3 flex flex-col gap-2" onPointerDown={(e) => e.stopPropagation()}>
        <button onClick={() => setZoom((z) => Math.min(MAX, z + 1))} aria-label="Inzoomen" className={zoomKnop}>+</button>
        <button onClick={() => setZoom((z) => Math.max(MIN, z - 1))} aria-label="Uitzoomen" className={zoomKnop}>−</button>
      </div>
      <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" onPointerDown={(e) => e.stopPropagation()}
        className="absolute bottom-0 right-0 rounded-tl-lg bg-white/80 px-1.5 text-[10px] text-black/70">© OpenStreetMap</a>
    </div>
  );
}

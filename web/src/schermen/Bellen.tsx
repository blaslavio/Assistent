// Het belscherm: een oproep die binnenkomt, of een gesprek dat loopt. Ligt over de hele app heen.
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { MicUit, Microfoon, Telefoon, Video } from "../iconen";
import { belDuur } from "../lib/chat";
import { beeldUit, belStaat, belVolgen, dempen, meldingWeg, ophangen, opnemen, weigeren } from "../lib/bellen";
import { Rondje } from "../rondje";

export const useBellen = () => useSyncExternalStore(belVolgen, belStaat);

function Beeld({ stroom, eigen, className }: { stroom?: MediaStream; eigen?: boolean; className: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (v && stroom && v.srcObject !== stroom) {
      v.srcObject = stroom;
      v.play().catch(() => {});
    }
  }, [stroom]);
  return <video ref={ref} autoPlay playsInline muted={eigen} className={className} />;
}

function Knop({ label, kleur, onClick, children }: { label: string; kleur: string; onClick: () => void;
  children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-label={label} className="flex flex-col items-center gap-2 text-[13px] text-white/80">
      <span className={`flex size-16 items-center justify-center rounded-full ${kleur}`}>{children}</span>
      {label}
    </button>
  );
}

export default function BelLaag({ naarProject }: { naarProject?: (gesprek: number) => void } = {}) {
  const { bel, binnen, melding } = useBellen();
  const [compact, setCompact] = useState(false);
  useEffect(() => { setCompact(false); }, [bel?.id]);
  const [, tik] = useState(0);
  useEffect(() => {
    if (bel?.fase !== "verbonden") return;
    const t = setInterval(() => tik((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [bel?.fase]);
  useEffect(() => {
    if (!melding) return;
    const t = setTimeout(meldingWeg, 3500);
    return () => clearTimeout(t);
  }, [melding]);

  if (binnen) {
    return (
      <div role="dialog" aria-label="Oproep" className="fixed inset-0 z-50 flex flex-col items-center justify-between bg-[#101014] px-8 pt-24 pb-[max(env(safe-area-inset-bottom),40px)] text-white">
        <div className="flex flex-col items-center gap-4">
          <Rondje naam={binnen.naam} id={binnen.ander} groot />
          <p className="text-2xl font-semibold">{binnen.naam || "Iemand"}</p>
          <p className="text-white/60">{binnen.video ? "Videogesprek" : "Belt je"}</p>
        </div>
        <div className="flex w-full justify-around">
          <Knop label="Weigeren" kleur="bg-red-500" onClick={weigeren}><Telefoon className="size-7 rotate-[135deg]" /></Knop>
          <Knop label="Opnemen" kleur="bg-green-500" onClick={opnemen}>
            {binnen.video ? <Video className="size-7" /> : <Telefoon className="size-7" />}
          </Knop>
        </div>
      </div>
    );
  }

  if (bel) {
    const status = bel.fase === "verbonden" && bel.begin ? belDuur(Math.round((Date.now() - bel.begin) / 1000))
      : bel.fase === "bellen" ? "Gaat over" : "Verbinden";
    const beeld = bel.video && bel.ander_beeld;
    if (compact) return <aside aria-label="Gesprek tijdens samenwerken"
      className="fixed right-3 top-3 z-50 w-56 max-w-[85vw] overflow-hidden rounded-2xl bg-[#101014] text-white shadow-xl">
      {bel.ander_beeld && <Beeld stroom={bel.ander_beeld} className={beeld ? "h-32 w-full object-cover" : "hidden"} />}
      <div className="p-3">
        <p className="truncate text-sm font-medium">{bel.naam}</p>
        <p className="text-xs text-white/70">{status}</p>
        <div className="mt-2 flex flex-wrap gap-1">
          <button onClick={dempen} className="min-h-11 px-2 text-xs">{bel.stil ? "Geluid aan" : "Dempen"}</button>
          {bel.video && <button onClick={beeldUit} className="min-h-11 px-2 text-xs">{bel.geenBeeld ? "Camera aan" : "Camera uit"}</button>}
          <button onClick={() => setCompact(false)} className="min-h-11 px-2 text-xs">Groot beeld</button>
          <button onClick={() => ophangen()} className="min-h-11 px-2 text-xs text-red-300">Ophangen</button>
        </div>
      </div>
    </aside>;
    return (
      <div role="dialog" aria-label="Gesprek" className="fixed inset-0 z-50 flex flex-col items-center justify-between bg-[#101014] px-8 pt-24 pb-[max(env(safe-area-inset-bottom),40px)] text-white">
        {bel.ander_beeld && <Beeld stroom={bel.ander_beeld}
          className={beeld ? "absolute inset-0 size-full object-cover" : "hidden"} />}
        {bel.video && bel.media && !bel.geenBeeld && (
          <Beeld stroom={bel.media} eigen className="absolute top-14 right-4 z-10 h-40 w-28 rounded-2xl object-cover shadow-lg" />
        )}
        <div className={`relative flex flex-col items-center gap-4 ${beeld ? "drop-shadow" : ""}`}>
          {!beeld && <Rondje naam={bel.naam} id={bel.ander} groot />}
          <p className="text-2xl font-semibold">{bel.naam}</p>
          <p className="text-white/70" aria-live="polite">{status}</p>
        </div>
        <div className="relative flex w-full flex-col gap-4">
          {naarProject && <button className="min-h-11 rounded-full bg-white/20 px-4 text-sm" onClick={() => {
            setCompact(true); naarProject(bel.gesprek);
          }}>Samen aan project werken</button>}
        <div className="flex w-full justify-around">
          <Knop label={bel.stil ? "Geluid aan" : "Dempen"} kleur={bel.stil ? "bg-white text-black" : "bg-white/15"} onClick={dempen}>
            {bel.stil ? <MicUit className="size-7" /> : <Microfoon className="size-7" />}
          </Knop>
          {bel.video && (
            <Knop label={bel.geenBeeld ? "Camera aan" : "Camera uit"} kleur={bel.geenBeeld ? "bg-white text-black" : "bg-white/15"}
              onClick={beeldUit}><Video className="size-7" /></Knop>
          )}
          <Knop label="Ophangen" kleur="bg-red-500" onClick={() => ophangen()}><Telefoon className="size-7 rotate-[135deg]" /></Knop>
        </div>
        </div>
      </div>
    );
  }

  if (melding) {
    return (
      <p role="status" className="fixed inset-x-0 top-12 z-50 mx-auto w-fit max-w-[90%] rounded-full bg-inkt px-5 py-2.5 text-sm text-white shadow-lg dark:bg-white dark:text-black">
        {melding}
      </p>
    );
  }
  return null;
}

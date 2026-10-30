import workerBron from "../kaartwerker.bundel";
/** Moderne vectorkaart; OpenFreeMap levert de stijl en gegevens zonder gebruikerssleutel. */
import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { KaartWinkel, Punt } from "../lib/kaart";

const stijl = () => `https://tiles.openfreemap.org/styles/${document.documentElement.classList.contains("dark") ? "dark" : "positron"}`;
type Props = { midden: Punt; zet: (p: Punt) => void; punten: KaartWinkel[]; gekozen: KaartWinkel | null;
  kies: (w: KaartWinkel) => void; ik?: Punt | null };
export function Kaart({ midden, zet, punten, gekozen, kies, ik }: Props) {
  const vak = useRef<HTMLDivElement>(null), kaart = useRef<maplibregl.Map | null>(null);
  const zetRef = useRef(zet), kiesRef = useRef(kies), begin = useRef(midden);
  zetRef.current = zet; kiesRef.current = kies;
  const [melding, setMelding] = useState("");
  useEffect(() => {
    if (!vak.current) return;
    let m: maplibregl.Map;
    const workerURL=URL.createObjectURL(new Blob([workerBron],{type:"text/javascript"}));
    maplibregl.setWorkerUrl(workerURL);
    try {
      m = new maplibregl.Map({ container: vak.current, style: stijl(), center: [begin.current.lon,begin.current.lat],
        zoom: 14, minZoom: 1, maxZoom: 19, maxPitch: 0, dragRotate: false, pitchWithRotate: false,
        attributionControl: { compact: true }, canvasContextAttributes: { antialias: true } });
    } catch { URL.revokeObjectURL(workerURL); setMelding("Dit apparaat kan de kaart niet tekenen. Gebruik de lijst of open je navigatie-app."); return; }
    kaart.current = m;
    m.getCanvas().setAttribute("aria-label", "Interactieve kaart. Gebruik pijltjestoetsen en plus of min; op je telefoon kun je slepen en knijpen.");
    m.on("moveend", () => { const c=m.getCenter(); zetRef.current({lat:Math.max(-85,Math.min(85,c.lat)),lon:((c.lng+180)%360+360)%360-180}); });
    m.on("error", () => setMelding("Niet alle kaartgegevens konden laden. De lijst en routeknoppen blijven beschikbaar."));
    const kijken = new MutationObserver(() => { setMelding(""); m.setStyle(stijl()); });
    kijken.observe(document.documentElement,{attributes:true,attributeFilter:["class"]});
    const maat = new ResizeObserver(() => m.resize()); maat.observe(vak.current);
    return () => { kijken.disconnect(); maat.disconnect(); m.remove(); URL.revokeObjectURL(workerURL); kaart.current=null; };
  }, []);
  useEffect(() => {
    const m=kaart.current;if(!m)return;
    const c=m.getCenter();
    if (Math.abs(c.lat-midden.lat)>1e-6 || Math.abs(c.lng-midden.lon)>1e-6) m.easeTo({center:[midden.lon,midden.lat],duration:matchMedia("(prefers-reduced-motion: reduce)").matches?0:350});
  }, [midden.lat,midden.lon]);
  useEffect(() => {
    const m=kaart.current;if(!m)return;
    const markers: maplibregl.Marker[]=[];
    for(const w of punten){
      const aan=gekozen===w;
      const knop=document.createElement("button");knop.type="button";knop.setAttribute("aria-label",w.naam);knop.setAttribute("aria-pressed",String(aan));
      knop.className=`relative flex size-10 items-center justify-center rounded-full border-2 border-white shadow-lg ${w.app?"bg-accent":"bg-[#64748b]"} ${aan?"ring-2 ring-accent ring-offset-2":""}`;
      const teken=document.createElement("span");teken.className="text-sm font-semibold text-white";teken.textContent=w.app?"◆":"•";knop.appendChild(teken);
      if(aan){const label=document.createElement("span");label.className="absolute left-1/2 top-full mt-2 max-w-44 -translate-x-1/2 truncate rounded-full bg-white px-3 py-1.5 text-xs font-medium text-inkt shadow dark:bg-[#26262b]";label.textContent=w.naam;knop.appendChild(label);}
      knop.addEventListener("click",()=>kiesRef.current(w));
      markers.push(new maplibregl.Marker({element:knop}).setLngLat([w.lon,w.lat]).addTo(m));
    }
    if(ik){const p=document.createElement("span");p.setAttribute("aria-label","Jouw locatie");p.className="size-5 rounded-full border-[3px] border-white bg-blue-600 shadow-lg ring-8 ring-blue-500/15";markers.push(new maplibregl.Marker({element:p}).setLngLat([ik.lon,ik.lat]).addTo(m));}
    return()=>markers.forEach(marker=>marker.remove());
  },[punten,gekozen,ik]);
  return <div className="relative overflow-hidden rounded-[28px] border border-lijn bg-vlak shadow-sm">
    <div ref={vak} className="h-[min(55dvh,480px)] min-h-80" aria-label="Kaart met winkels" />
    <div className="absolute right-3 top-3 flex flex-col gap-2">
      <button onClick={()=>kaart.current?.zoomIn()} aria-label="Inzoomen" className="flex size-11 items-center justify-center rounded-full bg-white text-xl text-inkt shadow-lg dark:bg-[#26262b]">+</button>
      <button onClick={()=>kaart.current?.zoomOut()} aria-label="Uitzoomen" className="flex size-11 items-center justify-center rounded-full bg-white text-xl text-inkt shadow-lg dark:bg-[#26262b]">−</button>
    </div>
    {melding&&<p role="status" className="absolute bottom-8 left-3 right-3 rounded-2xl bg-white/95 p-3 text-xs text-inkt shadow dark:bg-[#26262b]">{melding}</p>}
  </div>;
}

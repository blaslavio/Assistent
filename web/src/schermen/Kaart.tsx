import workerBron from "../kaartwerker.bundel";
import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { KaartWinkel, Punt } from "../lib/kaart";
import { kaartDonker,kaartStijlURL,eigenKaartkleur } from "../lib/kaartstijl";
import { geldigKaartpunt,routeSchets } from "../lib/kaartverbinding";
type Props={midden:Punt;zet:(p:Punt)=>void;punten:KaartWinkel[];gekozen:KaartWinkel|null;kies:(w:KaartWinkel)=>void;ik?:Punt|null;vanaf?:Punt|null};
const BRON="assistent-verbinding",LAAG="assistent-schets";
export function Kaart({midden,zet,punten,gekozen,kies,ik,vanaf}:Props){
 const vak=useRef<HTMLDivElement>(null),kaart=useRef<maplibregl.Map|null>(null),begin=useRef(midden);
 const zetRef=useRef(zet),kiesRef=useRef(kies),route=useRef(routeSchets(vanaf??ik??null,gekozen));
 zetRef.current=zet;kiesRef.current=kies;route.current=routeSchets(vanaf??ik??null,gekozen);
 const [melding,setMelding]=useState("");
 useEffect(()=>{
  if(!vak.current)return;
  const workerURL=URL.createObjectURL(new Blob([workerBron],{type:"text/javascript"}));maplibregl.setWorkerUrl(workerURL);
  let m:maplibregl.Map,donker=kaartDonker();
  try{m=new maplibregl.Map({container:vak.current,style:kaartStijlURL(donker),center:[begin.current.lon,begin.current.lat],zoom:13,minZoom:1,maxZoom:19,maxPitch:0,dragRotate:false,pitchWithRotate:false,attributionControl:{compact:true},canvasContextAttributes:{antialias:true}});}
  catch{URL.revokeObjectURL(workerURL);setMelding("De kaart kan hier niet worden getekend. Je bestemmingen en navigatieknop blijven beschikbaar.");return;}
  kaart.current=m;
  m.getCanvas().setAttribute("aria-label","Assistent-kaart. Sleep, knijp of gebruik pijltjestoetsen en plus/min. Klik op een lege plek om een eigen bestemming te kiezen.");
  function afwerken(){
   for(const laag of m.getStyle()?.layers??[]){const kleur=eigenKaartkleur(laag.id,laag.type,donker);if(kleur)m.setPaintProperty(laag.id,kleur.eigenschap,kleur.kleur);}
   if(!m.getSource(BRON))m.addSource(BRON,{type:"geojson",data:route.current});
   if(!m.getLayer(LAAG))m.addLayer({id:LAAG,type:"line",source:BRON,layout:{"line-cap":"round","line-join":"round"},paint:{"line-color":donker?"#9ad0ee":"#2463a6","line-width":3,"line-dasharray":[1,2]}});
  }
  m.on("style.load",afwerken);
  m.on("moveend",()=>{const c=m.getCenter();zetRef.current({lat:Math.max(-85,Math.min(85,c.lat)),lon:((c.lng+180)%360+360)%360-180});});
  m.on("click",e=>{const p={lat:e.lngLat.lat,lon:((e.lngLat.lng+180)%360+360)%360-180};if(geldigKaartpunt(p))kiesRef.current({...p,naam:"Gekozen plek",soort:"Kaartpunt",app:false,prive:true});});
  m.on("error",()=>setMelding("Niet alle kaartgegevens konden laden. Je kunt bestemmingen en routeopties blijven gebruiken."));
  const thema=()=>{const nieuw=kaartDonker();if(nieuw===donker)return;donker=nieuw;setMelding("");m.setStyle(kaartStijlURL(donker));};
  const kijken=new MutationObserver(thema);kijken.observe(document.documentElement,{attributes:true,attributeFilter:["class","data-thema"]});
  const voorkeur=matchMedia("(prefers-color-scheme: dark)");voorkeur.addEventListener("change",thema);
  const maat=new ResizeObserver(()=>m.resize());maat.observe(vak.current);
  return()=>{kijken.disconnect();voorkeur.removeEventListener("change",thema);maat.disconnect();m.remove();URL.revokeObjectURL(workerURL);kaart.current=null;};
 },[]);
 useEffect(()=>{const m=kaart.current;if(!m)return;const c=m.getCenter();if(Math.abs(c.lat-midden.lat)>1e-6||Math.abs(c.lng-midden.lon)>1e-6)m.easeTo({center:[midden.lon,midden.lat],duration:matchMedia("(prefers-reduced-motion: reduce)").matches||document.documentElement.classList.contains("minder-beweging")?0:350});},[midden.lat,midden.lon]);
 useEffect(()=>{const m=kaart.current;if(!m)return;(m.getSource(BRON) as maplibregl.GeoJSONSource|undefined)?.setData(route.current);},[gekozen,vanaf,ik]);
 useEffect(()=>{
  const m=kaart.current;if(!m)return;const markers:maplibregl.Marker[]=[];
  for(const w of punten.filter(geldigKaartpunt)){
   const aan=gekozen===w||!!(w.plekId&&w.plekId===gekozen?.plekId);
   const knop=document.createElement("button");knop.type="button";knop.setAttribute("aria-label",w.naam);knop.setAttribute("aria-pressed",String(aan));
   knop.className=`relative flex size-11 items-center justify-center rounded-2xl border-2 border-white shadow-lg ${w.prive?"bg-[#0f766e]":w.app?"bg-accent":"bg-[#52687c]"} ${aan?"ring-2 ring-accent ring-offset-2":""}`;
   const teken=document.createElement("span");teken.className="text-sm font-semibold text-white";teken.textContent=w.prive?"●":w.app?"◆":"•";knop.appendChild(teken);
   if(aan){const label=document.createElement("span");label.className="absolute left-1/2 top-full mt-2 max-w-44 -translate-x-1/2 truncate rounded-full bg-white px-3 py-1.5 text-xs font-medium text-inkt shadow dark:bg-[#26262b]";label.textContent=w.naam;knop.appendChild(label);}
   knop.addEventListener("click",e=>{e.stopPropagation();kiesRef.current(w);});markers.push(new maplibregl.Marker({element:knop}).setLngLat([w.lon,w.lat]).addTo(m));
  }
  if(ik&&geldigKaartpunt(ik)){const p=document.createElement("span");p.setAttribute("aria-label","Jouw locatie");p.className="size-5 rounded-full border-[3px] border-white bg-blue-600 shadow-lg ring-8 ring-blue-500/15";markers.push(new maplibregl.Marker({element:p}).setLngLat([ik.lon,ik.lat]).addTo(m));}
  return()=>markers.forEach(marker=>marker.remove());
 },[punten,gekozen,ik]);
 function overzicht(){const m=kaart.current;if(!m)return;const lijn=route.current.features[0]?.geometry.coordinates;
  if(lijn){const [a,b]=lijn;m.fitBounds([[Math.min(a[0],b[0]),Math.min(a[1],b[1])],[Math.max(a[0],b[0]),Math.max(a[1],b[1])]],{padding:60,maxZoom:15,duration:0});}
  else m.easeTo({center:[midden.lon,midden.lat],zoom:13,duration:0});
 }
 return <div className="relative shrink-0 overflow-hidden rounded-[28px] border border-lijn bg-vlak shadow-sm">
  <div ref={vak} className="h-[min(62dvh,560px)] min-h-80" aria-label="Assistent-kaart"/>
  <div className="absolute right-3 top-3 flex flex-col gap-2">
   <button onClick={()=>kaart.current?.zoomIn()} aria-label="Inzoomen" className="flex size-11 items-center justify-center rounded-2xl bg-white text-xl text-inkt shadow-lg dark:bg-[#26262b]">+</button>
   <button onClick={()=>kaart.current?.zoomOut()} aria-label="Uitzoomen" className="flex size-11 items-center justify-center rounded-2xl bg-white text-xl text-inkt shadow-lg dark:bg-[#26262b]">−</button>
   <button onClick={overzicht} aria-label="Hele verbinding bekijken" className="flex size-11 items-center justify-center rounded-2xl bg-white text-lg text-inkt shadow-lg dark:bg-[#26262b]">⌖</button>
  </div>
  <p className="absolute left-3 top-3 rounded-full bg-white/95 px-3 py-2 text-xs font-semibold text-inkt shadow dark:bg-[#26262b]">Assistent · Kaart</p>
  {route.current.features.length>0&&<p className="absolute bottom-8 left-3 rounded-full bg-white/95 px-3 py-2 text-xs text-inkt shadow dark:bg-[#26262b]">Stippellijn: schematisch, geen wegroute</p>}
  {melding&&<p role="status" className="absolute bottom-16 left-3 right-3 rounded-2xl bg-white/95 p-3 text-xs text-inkt shadow dark:bg-[#26262b]">{melding}</p>}
 </div>;
}

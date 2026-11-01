import workerBron from "../kaartwerker.bundel";
import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { KaartWinkel, Punt } from "../lib/kaart";
import { kaartDonker, kaartStijlURL, eigenKaartkleur } from "../lib/kaartstijl";
import { geldigKaartpunt, routeSchetsMulti } from "../lib/kaartverbinding";

export type KaartStop = { id: string; naam: string; lat: number; lon: number };
export type VolgendeAfspraakPunt = { lat: number; lon: number; titel: string; tijd?: string };

type Props = {
  midden: Punt; zet: (p: Punt) => void; punten: KaartWinkel[]; gekozen: KaartWinkel | null;
  kies: (w: KaartWinkel) => void; ik?: Punt | null; vanaf?: Punt | null;
  stops?: KaartStop[]; volgendeAfspraak?: VolgendeAfspraakPunt | null;
};

const BRON = "assistent-verbinding";
const LAAG = "assistent-schets";

function maakPin(w: KaartWinkel, aan: boolean, onKies: () => void): HTMLButtonElement {
  const el = document.createElement("button");
  el.type = "button";
  el.setAttribute("aria-label", w.naam);
  el.setAttribute("aria-pressed", String(aan));
  el.className = ["relative flex flex-col items-center outline-none transition-transform duration-150",
    aan ? "z-10 scale-110" : "hover:scale-105"].join(" ");
  const kleur = w.prive ? "bg-teal-600" : w.app ? "bg-accent" : "bg-slate-600";
  const kop = document.createElement("span");
  kop.className = ["flex size-10 items-center justify-center rounded-full border-[3px] border-white shadow-lg",
    kleur, aan ? "ring-2 ring-offset-2 ring-accent" : ""].join(" ");
  if (w.prive) {
    kop.innerHTML = '<svg viewBox="0 0 24 24" class="size-4 text-white" fill="currentColor" aria-hidden="true"><path d="M12 2C8.1 2 5 5.1 5 9c0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/></svg>';
  } else if (w.app) {
    kop.innerHTML = '<svg viewBox="0 0 24 24" class="size-4 text-white" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>';
  } else {
    kop.innerHTML = '<span class="size-2.5 rounded-full bg-white"></span>';
  }
  const steeltje = document.createElement("span");
  steeltje.className = "h-2 w-0.5 -mt-px opacity-50";
  steeltje.style.background = w.prive ? "#0f766e" : w.app ? "var(--color-accent, #2563eb)" : "#475569";
  el.appendChild(kop);
  el.appendChild(steeltje);
  if (aan) {
    const label = document.createElement("span");
    label.className = "absolute left-1/2 top-full mt-1 max-w-40 -translate-x-1/2 truncate rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-inkt shadow dark:bg-[#26262b]";
    label.textContent = w.naam;
    el.appendChild(label);
  }
  el.addEventListener("click", (e) => { e.stopPropagation(); onKies(); });
  return el;
}

export function Kaart({ midden, zet, punten, gekozen, kies, ik, vanaf, stops = [], volgendeAfspraak = null }: Props) {
  const vak = useRef<HTMLDivElement>(null);
  const kaart = useRef<maplibregl.Map | null>(null);
  const begin = useRef(midden);
  const zetRef = useRef(zet);
  const kiesRef = useRef(kies);
  const routeData = useRef(routeSchetsMulti([
    vanaf ?? ik ?? null, ...stops,
    gekozen && !stops.some((s) => s.id === gekozen.plekId) ? gekozen : null,
    volgendeAfspraak,
  ]));
  zetRef.current = zet;
  kiesRef.current = kies;
  routeData.current = routeSchetsMulti([
    vanaf ?? ik ?? null, ...stops,
    gekozen && !stops.some((s) => s.id === gekozen.plekId) ? gekozen : null,
    volgendeAfspraak,
  ]);
  const [melding, setMelding] = useState("");

  useEffect(() => {
    if (!vak.current) return;
    const workerURL = URL.createObjectURL(new Blob([workerBron], { type: "text/javascript" }));
    maplibregl.setWorkerUrl(workerURL);
    let m: maplibregl.Map;
    let donker = kaartDonker();
    try {
      m = new maplibregl.Map({
        container: vak.current, style: kaartStijlURL(donker),
        center: [begin.current.lon, begin.current.lat], zoom: 13, minZoom: 1, maxZoom: 19,
        maxPitch: 0, dragRotate: false, pitchWithRotate: false,
        attributionControl: { compact: true }, canvasContextAttributes: { antialias: true },
      });
    } catch {
      URL.revokeObjectURL(workerURL);
      setMelding("De kaart kan hier niet worden getekend. Je bestemmingen en navigatieknop blijven beschikbaar.");
      return;
    }
    kaart.current = m;
    m.getCanvas().setAttribute("aria-label", "Assistent-kaart. Sleep, knijp of gebruik pijltjestoetsen en plus/min. Klik op een lege plek om een eigen bestemming te kiezen.");
    function afwerken() {
      for (const laag of m.getStyle()?.layers ?? []) {
        const kleur = eigenKaartkleur(laag.id, laag.type, donker);
        if (kleur) m.setPaintProperty(laag.id, kleur.eigenschap, kleur.kleur);
      }
      if (!m.getSource(BRON)) m.addSource(BRON, { type: "geojson", data: routeData.current });
      if (!m.getLayer(LAAG)) {
        m.addLayer({
          id: LAAG, type: "line", source: BRON,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": donker ? "#7dd3fc" : "#2563eb", "line-width": 4, "line-opacity": 0.85, "line-dasharray": [2, 2] },
        });
      }
    }
    m.on("style.load", afwerken);
    m.on("moveend", () => {
      const c = m.getCenter();
      zetRef.current({ lat: Math.max(-85, Math.min(85, c.lat)), lon: ((((c.lng + 180) % 360) + 360) % 360) - 180 });
    });
    m.on("click", (e) => {
      const p = { lat: e.lngLat.lat, lon: ((((e.lngLat.lng + 180) % 360) + 360) % 360) - 180 };
      if (geldigKaartpunt(p)) kiesRef.current({ ...p, naam: "Gekozen plek", soort: "Kaartpunt", app: false, prive: true });
    });
    m.on("error", () => setMelding("Niet alle kaartgegevens konden laden. Je kunt bestemmingen en routeopties blijven gebruiken."));
    const thema = () => {
      const nieuw = kaartDonker();
      if (nieuw === donker) return;
      donker = nieuw; setMelding(""); m.setStyle(kaartStijlURL(donker));
    };
    const kijken = new MutationObserver(thema);
    kijken.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-thema"] });
    const voorkeur = matchMedia("(prefers-color-scheme: dark)");
    voorkeur.addEventListener("change", thema);
    const maat = new ResizeObserver(() => m.resize());
    maat.observe(vak.current);
    return () => {
      kijken.disconnect(); voorkeur.removeEventListener("change", thema); maat.disconnect();
      m.remove(); URL.revokeObjectURL(workerURL); kaart.current = null;
    };
  }, []);

  useEffect(() => {
    const m = kaart.current;
    if (!m) return;
    const c = m.getCenter();
    if (Math.abs(c.lat - midden.lat) > 1e-6 || Math.abs(c.lng - midden.lon) > 1e-6) {
      const stil = matchMedia("(prefers-reduced-motion: reduce)").matches
        || document.documentElement.classList.contains("minder-beweging");
      m.easeTo({ center: [midden.lon, midden.lat], duration: stil ? 0 : 350 });
    }
  }, [midden.lat, midden.lon]);

  useEffect(() => {
    const m = kaart.current;
    if (!m) return;
    (m.getSource(BRON) as maplibregl.GeoJSONSource | undefined)?.setData(routeData.current);
  }, [gekozen, vanaf, ik, stops, volgendeAfspraak]);

  useEffect(() => {
    const m = kaart.current;
    if (!m) return;
    const markers: maplibregl.Marker[] = [];
    const stopIds = new Set(stops.map((s) => s.id));
    for (const w of punten.filter(geldigKaartpunt)) {
      if (w.plekId && stopIds.has(w.plekId)) continue;
      const aan = gekozen === w || !!(w.plekId && w.plekId === gekozen?.plekId);
      markers.push(new maplibregl.Marker({ element: maakPin(w, aan, () => kiesRef.current(w)), anchor: "bottom" }).setLngLat([w.lon, w.lat]).addTo(m));
    }
    stops.forEach((s, i) => {
      if (!geldigKaartpunt(s)) return;
      const aan = gekozen?.plekId === s.id;
      const el = document.createElement("button");
      el.type = "button";
      el.setAttribute("aria-label", `Stop ${i + 1}: ${s.naam}`);
      el.className = ["flex size-9 items-center justify-center rounded-full border-[3px] border-white bg-indigo-600 text-xs font-bold text-white shadow-lg",
        aan ? "ring-2 ring-offset-2 ring-accent scale-110" : ""].join(" ");
      el.textContent = String(i + 1);
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        kiesRef.current({ lat: s.lat, lon: s.lon, naam: s.naam, soort: "Geplande stop", app: false, prive: false, plekId: s.id });
      });
      markers.push(new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat([s.lon, s.lat]).addTo(m));
    });
    if (ik && geldigKaartpunt(ik)) {
      const p = document.createElement("span");
      p.setAttribute("aria-label", "Jouw locatie");
      p.className = "relative flex size-4 items-center justify-center";
      p.innerHTML = `<span class="absolute size-8 animate-ping rounded-full bg-blue-500/25"></span><span class="relative size-4 rounded-full border-[3px] border-white bg-blue-600 shadow-lg"></span>`;
      markers.push(new maplibregl.Marker({ element: p }).setLngLat([ik.lon, ik.lat]).addTo(m));
    }
    if (vanaf && geldigKaartpunt(vanaf) && (!ik || Math.abs(vanaf.lat - ik.lat) > 1e-5 || Math.abs(vanaf.lon - ik.lon) > 1e-5)) {
      const v = document.createElement("span");
      v.setAttribute("aria-label", "Vertrekpunt");
      v.className = "flex size-8 items-center justify-center rounded-full border-[3px] border-white bg-indigo-600 text-[10px] font-bold text-white shadow-lg";
      v.textContent = "V";
      markers.push(new maplibregl.Marker({ element: v }).setLngLat([vanaf.lon, vanaf.lat]).addTo(m));
    }
    if (volgendeAfspraak && geldigKaartpunt(volgendeAfspraak)) {
      const el = document.createElement("button");
      el.type = "button";
      el.setAttribute("aria-label", `Volgende afspraak: ${volgendeAfspraak.titel}`);
      el.className = "relative flex flex-col items-center";
      const titel = volgendeAfspraak.titel.slice(0, 28);
      el.innerHTML = `<span class="flex size-10 items-center justify-center rounded-full border-[3px] border-white bg-rose-600 text-white shadow-lg"><svg viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4m8-4v4"/></svg></span><span class="mt-1 max-w-36 truncate rounded-full bg-white px-2 py-0.5 text-[10px] font-medium shadow dark:bg-[#26262b]">${titel}</span>`;
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        kiesRef.current({ lat: volgendeAfspraak.lat, lon: volgendeAfspraak.lon, naam: volgendeAfspraak.titel, soort: "Agenda", app: false, prive: true });
      });
      markers.push(new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat([volgendeAfspraak.lon, volgendeAfspraak.lat]).addTo(m));
    }
    return () => markers.forEach((marker) => marker.remove());
  }, [punten, gekozen, ik, vanaf, stops, volgendeAfspraak]);

  function overzicht() {
    const m = kaart.current;
    if (!m) return;
    const coords = routeData.current.features[0]?.geometry?.coordinates as [number, number][] | undefined;
    if (coords && coords.length >= 2) {
      let minLng = coords[0][0], minLat = coords[0][1], maxLng = coords[0][0], maxLat = coords[0][1];
      for (const [lng, lat] of coords) {
        minLng = Math.min(minLng, lng); maxLng = Math.max(maxLng, lng);
        minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
      }
      m.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: 72, maxZoom: 15, duration: 0 });
    } else {
      m.easeTo({ center: [midden.lon, midden.lat], zoom: 13, duration: 0 });
    }
  }

  return (
    <div className="relative shrink-0 overflow-hidden rounded-[28px] border border-lijn bg-vlak shadow-sm">
      <div ref={vak} className="h-[min(62dvh,560px)] min-h-80" aria-label="Assistent-kaart" />
      <div className="absolute right-3 top-3 flex flex-col gap-1.5">
        {([
          { label: "Inzoomen", actie: () => kaart.current?.zoomIn(), teken: "+" },
          { label: "Uitzoomen", actie: () => kaart.current?.zoomOut(), teken: "−" },
          { label: "Hele verbinding bekijken", actie: overzicht, teken: "·" },
        ] as const).map(({ label, actie, teken }) => (
          <button key={label} type="button" onClick={actie} aria-label={label}
            className="flex size-10 items-center justify-center rounded-2xl bg-white/95 text-lg font-medium text-inkt shadow-md backdrop-blur dark:bg-[#26262b]/95">
            {teken}
          </button>
        ))}
      </div>
      <p className="absolute left-3 top-3 rounded-full bg-white/95 px-3 py-1.5 text-xs font-semibold text-inkt shadow backdrop-blur dark:bg-[#26262b]/95">Assistent · Kaart</p>
      {routeData.current.features.length > 0 && (
        <p className="absolute bottom-8 left-3 rounded-full bg-white/95 px-3 py-1.5 text-xs text-inkt shadow backdrop-blur dark:bg-[#26262b]/95">Stippellijn: schematisch · geen wegroute</p>
      )}
      {melding && (
        <p role="status" className="absolute bottom-16 left-3 right-3 rounded-2xl bg-white/95 p-3 text-xs text-inkt shadow backdrop-blur dark:bg-[#26262b]/95">{melding}</p>
      )}
    </div>
  );
}

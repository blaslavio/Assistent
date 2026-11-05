// Een stille kaart met één speld en een kaartje erboven, bijvoorbeeld het afhaaladres van een bestelling.
// Niet versleepbaar: hij laat alleen zien waar het is. Lukt de kaart niet, dan blijft een rustig vlak met de speld staan.
import { useEffect, useRef, useState } from "react";
import type * as MapLibre from "maplibre-gl";
import { maplibreLaden } from "../lib/maplibreLaden";
import { eigenKaartkleur, kaartDonker, kaartStijlURL } from "../lib/kaartstijl";

export function PlekKaart({ lat, lon, titel, regels, hoogte = 220 }: {
  lat: number; lon: number; titel: string; regels: string[]; hoogte?: number;
}) {
  const vak = useRef<HTMLDivElement>(null);
  const [klaar, setKlaar] = useState(false);

  useEffect(() => {
    let weg = false;
    let m: MapLibre.Map | null = null;
    maplibreLaden().then((ml) => {
      if (weg || !vak.current) return;
      const donker = kaartDonker();
      try {
        m = new ml.Map({
          container: vak.current, style: kaartStijlURL(donker), center: [lon, lat], zoom: 15.5,
          interactive: false, attributionControl: { compact: true },
        });
      } catch { return; }
      const kaart = m;
      kaart.on("style.load", () => {
        for (const laag of kaart.getStyle()?.layers ?? []) {
          const k = eigenKaartkleur(laag.id, laag.type, donker);
          if (k) kaart.setPaintProperty(laag.id, k.eigenschap, k.kleur);
        }
        // Iets lager in beeld (op 67,5% van de hoogte), zodat het kaartje boven de speld past.
        kaart.setPadding({ top: hoogte * 0.35, bottom: 0, left: 0, right: 0 });
        kaart.jumpTo({ center: [lon, lat] });
        setKlaar(true);
      });
    }).catch(() => {});
    return () => { weg = true; m?.remove(); };
  }, [lat, lon, hoogte]);

  return (
    <div role="img" aria-label={`Kaart: ${titel}, ${regels.join(", ")}`} className="relative overflow-hidden bg-[#f3f4f6] dark:bg-[#111e2a]" style={{ height: hoogte }}>
      <div ref={vak} className={`absolute inset-0 transition-opacity duration-300 ${klaar ? "opacity-100" : "opacity-0"}`} />
      <div className="pointer-events-none absolute inset-x-0 flex flex-col items-center" style={{ bottom: hoogte * 0.325 }}>
        <div className="relative mb-3 rounded-2xl bg-white px-4 py-2.5 text-center shadow-lg ring-1 ring-black/5 dark:bg-[#1c1c21] dark:ring-white/10">
          <p className="text-[15px] font-semibold">{titel}</p>
          {regels.map((r) => <p key={r} className="text-[13px] text-rustig">{r}</p>)}
          <span aria-hidden className="absolute -bottom-1.5 left-1/2 size-3 -translate-x-1/2 rotate-45 bg-white dark:bg-[#1c1c21]" />
        </div>
        <span aria-hidden className="flex flex-col items-center">
          <span className="size-7 rounded-full bg-gradient-to-br from-[color-mix(in_oklab,var(--color-accent)_55%,white)] to-accent shadow-md ring-[3px] ring-white dark:ring-[#1c1c21]" />
          <span className="h-3 w-[3px] rounded-full bg-accent" />
        </span>
      </div>
    </div>
  );
}

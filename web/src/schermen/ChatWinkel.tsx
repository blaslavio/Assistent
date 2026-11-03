// Winkel binnen Chat: ontdekken, verkopen, bestellingen, kaart.
import { useEffect, useState } from "react";
import { Truck, Zoek } from "../iconen";
import Bestellingen from "./Bestellingen";
import { Raster } from "./Winkelen";
import { zoeken, type Product } from "../lib/winkelen";
import type { Staat } from "../App";
import type { Gegevens } from "../api";

export function WinkelApp({
  staat, setData, start, melding, adres, thuisadres, bestel, terug, terugNaam, losseKaart,
}: {
  staat: Staat;
  setData: (d: Gegevens) => void;
  start: "ontdekken" | "verkopen" | "bestellingen" | "kaart";
  melding?: string;
  adres?: string;
  thuisadres?: string;
  bestel: (p: Product) => void;
  terug: () => void;
  terugNaam?: string;
  losseKaart?: boolean;
}) {
  const [deel, setDeel] = useState(start);
  return (
    <div className="flex min-h-full flex-col">
      <header className="flex items-center gap-3 px-5 pt-4 pb-2">
        <button type="button" onClick={terug} className="text-sm text-accent">
          ← {terugNaam ?? "Chat"}
        </button>
        <h1 className="text-lg font-bold">Handel</h1>
      </header>
      <nav className="flex gap-2 overflow-x-auto px-5 pb-3">
        {([
          ["ontdekken", "Ontdekken"],
          ["bestellingen", "Bestellingen"],
          ["verkopen", "Verkopen"],
        ] as const).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setDeel(k)}
            className={`h-9 shrink-0 rounded-full px-4 text-[13px] font-medium ${
              deel === k ? "bg-inkt text-white dark:text-black" : "bg-vlak text-rustig"
            }`}
          >
            {label}
          </button>
        ))}
      </nav>
      {melding && (
        <p role="status" className="mx-5 mb-2 rounded-2xl bg-vlak px-4 py-3 text-sm">{melding}</p>
      )}
      {deel === "bestellingen" && <Bestellingen />}
      {deel === "ontdekken" && (
        <WinkelDeel staat={staat} setData={setData} bestel={bestel} thuisadres={thuisadres} />
      )}
      {deel === "verkopen" && (
        <p className="px-5 text-sm text-rustig">Verkoop via Studio of je aanbod hier later.</p>
      )}
      {deel === "kaart" && (
        <p className="px-5 text-sm text-rustig">Kaart opent via de werkruimte.</p>
      )}
    </div>
  );
}

export function WinkelDeel({
  staat, setData, bestel, thuisadres,
}: {
  staat: Staat;
  setData: (d: Gegevens) => void;
  bestel: (p: Product) => void;
  thuisadres?: string;
}) {
  const [zoek, setZoek] = useState("");
  const [term, setTerm] = useState("");
  const [bezorgen, setBezorgen] = useState(false);
  const [producten, setProducten] = useState<Product[] | null>(null);

  useEffect(() => {
    setProducten(null);
    zoeken(term, { bron: "alles", bezorgen, max: 40 })
      .then(setProducten)
      .catch(() => setProducten([]));
  }, [term, bezorgen]);

  return (
    <div className="flex flex-col gap-4 px-5 pb-8">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setTerm(zoek);
        }}
        className="flex h-12 items-center gap-2 rounded-2xl bg-vlak px-3"
      >
        <Zoek className="size-5 shrink-0 text-rustig" />
        <input
          value={zoek}
          onChange={(e) => {
            setZoek(e.target.value);
            if (!e.target.value) setTerm("");
          }}
          placeholder="Zoek producten, winkels, marktplaats"
          aria-label="Zoeken"
          className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-zacht"
        />
      </form>
      <button
        type="button"
        aria-pressed={bezorgen}
        onClick={() => setBezorgen((b) => !b)}
        className={`flex h-9 w-fit items-center gap-2 rounded-full px-3 text-[13px] ${
          bezorgen ? "bg-accent text-white" : "bg-vlak text-rustig"
        }`}
      >
        <Truck className="size-4" /> Alleen bezorgen
      </button>
      <p className="text-[12px] text-rustig">
        Bestellen loopt via de assistent; jij bevestigt elke betaling.
      </p>
      {producten === null ? (
        <p className="text-sm text-rustig">Zoeken…</p>
      ) : (
        <Raster producten={producten} open={bestel} />
      )}
    </div>
  );
}

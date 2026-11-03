// Nieuw gesprek en open gespreksscherm — privé, versleuteld, delen alleen bewust.
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Pijl, Slot, Terug } from "../iconen";
import {
  berichten,
  gesprekNaam,
  nieuwGesprek,
  versturen,
  type Gesprek,
  type Regel,
} from "../lib/chat";
import type { Staat } from "../App";

export function NieuwVeld({
  sluit, gestart,
}: {
  sluit: () => void;
  gestart: (id: number) => void;
}) {
  const [wie, setWie] = useState("");
  const [fout, setFout] = useState("");
  async function start(e: FormEvent) {
    e.preventDefault();
    setFout("");
    try {
      const id = await nieuwGesprek(wie.trim());
      gestart(id);
    } catch (er) {
      setFout(er instanceof Error ? er.message : "Starten lukte niet.");
    }
  }
  return (
    <form onSubmit={start} className="flex flex-col gap-3 px-5 pb-4">
      <p className="text-sm text-rustig">
        Typ een naam of mailadres. Het gesprek is privé: alleen jullie lezen mee.
      </p>
      <input
        value={wie}
        onChange={(e) => setWie(e.target.value)}
        placeholder="Naam of mail"
        className="h-12 rounded-2xl bg-vlak px-4 outline-none"
        autoFocus
      />
      {fout && <p className="text-sm text-red-600">{fout}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={sluit} className="h-11 flex-1 rounded-2xl bg-vlak">
          Annuleren
        </button>
        <button
          type="submit"
          disabled={!wie.trim()}
          className="h-11 flex-1 rounded-2xl bg-accent text-white disabled:opacity-40"
        >
          Start
        </button>
      </div>
    </form>
  );
}

export function Gesprekscherm({
  id, ik, begin, terug, beginConcept, bewaarConcept, gelezen,
}: {
  id: number;
  ik: number;
  begin?: Gesprek;
  terug: () => void;
  beginConcept: string;
  bewaarConcept: (id: number, tekst: string) => void;
  gelezen: (id: number) => void;
  staat: Staat;
  setStaat?: React.Dispatch<React.SetStateAction<Staat | null>>;
  projectOpen?: boolean;
  projectGeopend?: (id: number) => void;
  bronBericht?: number | null;
}) {
  const [regels, setRegels] = useState<Regel[]>([]);
  const [invoer, setInvoer] = useState(beginConcept);
  const [fout, setFout] = useState("");
  const onder = useRef<HTMLDivElement>(null);
  const naam = begin ? gesprekNaam(begin, ik) : "Gesprek";

  useEffect(() => {
    gelezen(id);
    berichten(id, 0)
      .then((r) => {
        setRegels(r);
        requestAnimationFrame(() => onder.current?.scrollIntoView({ behavior: "smooth" }));
      })
      .catch(() => setFout("Berichten laden lukte niet."));
  }, [id, gelezen]);

  useEffect(() => () => bewaarConcept(id, invoer), [id, invoer, bewaarConcept]);

  async function stuur(e: FormEvent) {
    e.preventDefault();
    const tekst = invoer.trim();
    if (!tekst) return;
    setInvoer("");
    try {
      await versturen(id, { t: "tekst", tekst });
      const r = await berichten(id, 0);
      setRegels(r);
      onder.current?.scrollIntoView({ behavior: "smooth" });
    } catch (er) {
      setFout(er instanceof Error ? er.message : "Versturen lukte niet.");
      setInvoer(tekst);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-2 border-b border-lijn px-3 py-2">
        <button type="button" onClick={terug} className="flex size-10 items-center justify-center text-accent">
          <Terug className="size-5" />
        </button>
        <h1 className="min-w-0 flex-1 truncate font-semibold">{naam}</h1>
        <span className="flex items-center gap-1 text-[11px] text-zacht" title="Versleuteld gesprek">
          <Slot className="size-3.5" /> Privé
        </span>
      </header>
      <main className="flex flex-1 flex-col gap-2 overflow-y-auto px-4 py-3">
        {fout && <p className="text-sm text-red-600">{fout}</p>}
        {regels.map((r) => {
          const mijn = r.afzender === ik;
          const tekst = r.bericht?.tekst ?? r.bericht?.t ?? "";
          if (r.weg || !tekst) return null;
          return (
            <div key={r.id} className={`flex ${mijn ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-[15px] ${
                  mijn ? "bg-accent text-white" : "bg-vlak"
                }`}
              >
                {tekst}
              </div>
            </div>
          );
        })}
        <div ref={onder} />
      </main>
      <form onSubmit={stuur} className="border-t border-lijn px-3 py-2">
        <p className="px-1 pb-1 text-[11px] text-zacht">
          Alleen in dit gesprek. Wil je iets buiten de app delen, kopieer of deel dat zelf.
        </p>
        <label className="flex items-center gap-2 rounded-3xl bg-vlak py-1.5 pr-1.5 pl-4">
          <input
            value={invoer}
            onChange={(e) => setInvoer(e.target.value)}
            placeholder="Bericht"
            className="h-10 flex-1 bg-transparent outline-none"
          />
          <button
            type="submit"
            disabled={!invoer.trim()}
            aria-label="Versturen"
            className="flex size-10 items-center justify-center rounded-full bg-accent text-white disabled:opacity-30"
          >
            <Pijl className="size-5" />
          </button>
        </label>
      </form>
    </div>
  );
}

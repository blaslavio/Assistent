// De lijst met gesprekken in Chat. Community's staan in ChatCommunity.tsx.
import { useState, type ReactNode } from "react";
import { Bewerk, Slot, Zoek } from "../iconen";
import { gesprekNaam, type Gesprek } from "../lib/chat";
import { Rondje } from "../rondje";
import { StoryRij } from "./Stories";
import { tijdje } from "../lib/tijd";

export function Leeg({
  icoon, titel, uitleg, children,
}: { icoon: ReactNode; titel: string; uitleg: string; children?: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-10 pb-16 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-vlak text-rustig">{icoon}</span>
      <p className="font-medium">{titel}</p>
      <p className="text-sm text-rustig">{uitleg}</p>
      {children}
    </div>
  );
}

export function Chats({
  ik, lijst, voorbeelden, open, nieuw, fout, zoekt, zoek, setZoek,
}: {
  zoek: string;
  setZoek: (s: string) => void;
  ik: number;
  lijst: Gesprek[];
  voorbeelden: Record<number, string>;
  open: (id: number) => void;
  nieuw: () => void;
  fout: string;
  zoekt: boolean;
}) {
  const [updates, setUpdates] = useState(false);
  const term = zoek.trim().toLocaleLowerCase("nl");
  const zichtbaar = lijst.filter((g) =>
    `${gesprekNaam(g, ik)} ${voorbeelden[g.id] ?? ""}`.toLocaleLowerCase("nl").includes(term),
  );
  return (
    <>
      <label className="mx-5 mb-2 flex h-12 items-center gap-2 rounded-2xl bg-vlak px-3">
        <Zoek className="size-5 shrink-0 text-rustig" />
        <input
          type="search"
          aria-label="Zoek een gesprek"
          placeholder="Zoek naam of groep"
          value={zoek}
          onChange={(e) => setZoek(e.target.value)}
          className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-zacht"
        />
      </label>
      <div className="mx-5 mb-3 flex gap-2">
        <button type="button" onClick={nieuw} className="flex h-10 flex-1 items-center justify-center gap-2 rounded-full bg-accent text-[13px] font-semibold text-white">
          <Bewerk className="size-4" /> Nieuw gesprek
        </button>
        <details className="relative" onToggle={(e) => setUpdates(e.currentTarget.open)}>
          <summary className="flex h-10 cursor-pointer list-none items-center rounded-full bg-vlak px-4 text-[13px] font-medium marker:content-none">Updates</summary>
          {updates && (
            <div className="absolute right-0 z-10 mt-2 w-[min(100vw-2.5rem,20rem)] rounded-2xl border border-lijn bg-white p-2 shadow-lg dark:bg-[#121216]">
              <StoryRij ik={ik} />
            </div>
          )}
        </details>
      </div>
      <p className="mx-5 mb-2 text-[12px] text-zacht">
        Privéchats zijn versleuteld. Delen buiten de app doe je zelf — wij sturen niets door.
      </p>
      {zoek.trim() && lijst.length > 0 && !zichtbaar.length && (
        <p role="status" className="px-5 text-sm text-rustig">Geen gesprek gevonden.</p>
      )}
      {lijst.length === 0 && !fout && !zoekt && (
        <Leeg icoon={<Slot />} titel="Nog geen gesprekken" uitleg="Privégesprekken voor afspraken en handel. Alleen jij en wie je uitnodigt lezen mee.">
          <button onClick={nieuw} className="mt-2 h-11 rounded-full bg-accent px-5 font-medium text-white">Begin een gesprek</button>
        </Leeg>
      )}
      <ul className="flex flex-col px-2">
        {zichtbaar.map((g) => {
          const naam = gesprekNaam(g, ik);
          return (
            <li key={g.id}>
              <button onClick={() => open(g.id)} className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left hover:bg-vlak">
                <Rondje naam={naam} id={g.soort === "groep" ? -g.id : g.leden.find((l) => l.id !== ik)?.id ?? g.id} groot />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className={`truncate ${g.ongelezen ? "font-semibold" : "font-medium"}`}>{naam}</span>
                    <span className={`shrink-0 text-xs ${g.ongelezen ? "font-semibold text-accent" : "text-zacht"}`}>{tijdje(g.laatst)}</span>
                  </span>
                  <span className="truncate text-[13px] text-rustig">{voorbeelden[g.id] ?? "\u00a0"}</span>
                </span>
                {g.ongelezen > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-semibold text-white">{g.ongelezen}</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}


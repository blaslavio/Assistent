// Chatlijsten + community-detail: netwerk, feed, privacy.
import { useState, type FormEvent, type ReactNode } from "react";
import { Ballon, Bewerk, Mensen, Slot, Terug, Zoek } from "../iconen";
import {
  communityDeelnemen,
  communityMaken,
  gesprekNaam,
  type Community,
  type Gesprek,
} from "../lib/chat";
import { feedInstelling } from "../lib/feed";
import { Rondje } from "../rondje";
import { StoryRij } from "./Stories";
import { Berichten, Schrijven } from "./Feed";
import { tijdje } from "../lib/tijd";
import { instellingenOpenen } from "../lib/naar";
import type { Staat } from "../App";

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
        <button
          type="button"
          onClick={nieuw}
          className="flex h-10 flex-1 items-center justify-center gap-2 rounded-full bg-accent text-[13px] font-semibold text-white"
        >
          <Bewerk className="size-4" /> Nieuw gesprek
        </button>
        <details className="relative" onToggle={(e) => setUpdates(e.currentTarget.open)}>
          <summary className="flex h-10 cursor-pointer list-none items-center rounded-full bg-vlak px-4 text-[13px] font-medium marker:content-none">
            Updates
          </summary>
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
        <Leeg
          icoon={<Slot />}
          titel="Nog geen gesprekken"
          uitleg="Privégesprekken voor afspraken en handel. Alleen jij en wie je uitnodigt lezen mee."
        >
          <button onClick={nieuw} className="mt-2 h-11 rounded-full bg-accent px-5 font-medium text-white">
            Begin een gesprek
          </button>
        </Leeg>
      )}
      <ul className="flex flex-col px-2">
        {zichtbaar.map((g) => {
          const naam = gesprekNaam(g, ik);
          return (
            <li key={g.id}>
              <button
                onClick={() => open(g.id)}
                className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left hover:bg-vlak"
              >
                <Rondje
                  naam={naam}
                  id={g.soort === "groep" ? -g.id : g.leden.find((l) => l.id !== ik)?.id ?? g.id}
                  groot
                />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className={`truncate ${g.ongelezen ? "font-semibold" : "font-medium"}`}>{naam}</span>
                    <span className={`shrink-0 text-xs ${g.ongelezen ? "font-semibold text-accent" : "text-zacht"}`}>
                      {tijdje(g.laatst)}
                    </span>
                  </span>
                  <span className="truncate text-[13px] text-rustig">{voorbeelden[g.id] ?? "\u00a0"}</span>
                </span>
                {g.ongelezen > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-semibold text-white">
                    {g.ongelezen}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

export function Communitys({
  lijst, open, vernieuw, staat,
}: {
  lijst: Community[];
  open: (id: number) => void;
  vernieuw: () => Promise<void>;
  staat: Staat;
}) {
  const [code, setCode] = useState("");
  const [naam, setNaam] = useState("");
  const [fout, setFout] = useState("");
  const [bezig, setBezig] = useState(false);
  const [paneel, setPaneel] = useState<null | "join" | "nieuw">(null);

  async function join(e: FormEvent) {
    e.preventDefault();
    setBezig(true);
    setFout("");
    try {
      const r = await communityDeelnemen(code.trim());
      setCode("");
      setPaneel(null);
      await vernieuw();
      open(r.id);
    } catch (er) {
      setFout(er instanceof Error ? er.message : "Deelnemen lukte niet.");
    } finally {
      setBezig(false);
    }
  }

  async function maak(e: FormEvent) {
    e.preventDefault();
    setBezig(true);
    setFout("");
    try {
      const r = await communityMaken(naam.trim(), "");
      setNaam("");
      setPaneel(null);
      await vernieuw();
      open(r.id);
    } catch (er) {
      setFout(er instanceof Error ? er.message : "Aanmaken lukte niet.");
    } finally {
      setBezig(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 px-5 pb-8">
      <p className="text-[13px] text-rustig">
        Clubs, buurten en teams met feed en kanalen. Privégesprekken blijven onder Chats — community-posts
        ziet elk lid.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setPaneel(paneel === "nieuw" ? null : "nieuw")}
          className="flex h-10 items-center gap-2 rounded-full bg-accent px-4 text-[13px] font-semibold text-white"
        >
          <Mensen className="size-4" /> Nieuwe community
        </button>
        <button
          type="button"
          onClick={() => setPaneel(paneel === "join" ? null : "join")}
          className="flex h-10 items-center gap-2 rounded-full bg-vlak px-4 text-[13px] font-medium"
        >
          Code invoeren
        </button>
        <button
          type="button"
          onClick={() => instellingenOpenen("privacy")}
          className="flex h-10 items-center gap-2 rounded-full bg-vlak px-4 text-[13px] font-medium"
        >
          <Slot className="size-4 text-accent" /> Privacy
        </button>
      </div>

      {paneel === "join" && (
        <form onSubmit={join} className="flex flex-col gap-2 rounded-2xl border border-lijn p-3">
          <p className="text-[13px] text-rustig">Met een uitnodigingscode word je lid. Jij kiest of je meedoet.</p>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Uitnodigingscode"
            className="h-11 rounded-xl bg-vlak px-3 outline-none"
          />
          <button
            type="submit"
            disabled={bezig || !code.trim()}
            className="h-11 rounded-xl bg-accent text-sm font-medium text-white disabled:opacity-40"
          >
            Deelnemen
          </button>
        </form>
      )}
      {paneel === "nieuw" && (
        <form onSubmit={maak} className="flex flex-col gap-2 rounded-2xl border border-lijn p-3">
          <p className="text-[13px] text-rustig">
            Jij beheert wie erbij mag. Posts zijn voor leden zichtbaar — geen openbare timeline buiten de app.
          </p>
          <input
            value={naam}
            onChange={(e) => setNaam(e.target.value)}
            placeholder="Naam van de community"
            className="h-11 rounded-xl bg-vlak px-3 outline-none"
            maxLength={80}
          />
          <button
            type="submit"
            disabled={bezig || !naam.trim()}
            className="h-11 rounded-xl bg-accent text-sm font-medium text-white disabled:opacity-40"
          >
            Aanmaken
          </button>
        </form>
      )}
      {fout && <p className="text-sm text-red-600 dark:text-red-400">{fout}</p>}

      {!lijst.length ? (
        <Leeg
          icoon={<Mensen />}
          titel="Nog geen netwerk"
          uitleg="Start of join een community om te netwerken en berichten te delen met leden."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {lijst.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => open(c.id)}
                className="flex min-h-14 w-full items-center gap-3 rounded-2xl bg-vlak px-4 text-left"
              >
                <span className="flex size-10 items-center justify-center rounded-xl bg-accent/10 text-accent">
                  <Mensen className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{c.naam}</span>
                  <span className="block text-[13px] text-rustig">
                    {c.status === "uitgenodigd"
                      ? "Uitnodiging open"
                      : `${c.kanalen?.length ?? 0} kanalen · ${c.leden ?? ""} leden`}
                  </span>
                </span>
                {c.kanalen?.some((k) => k.ongelezen > 0) && (
                  <span className="size-2.5 rounded-full bg-accent" aria-label="Ongelezen" />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Detail van één community: kanalen + feed, met privacy-context. */
export function CommunityScherm({
  c, openKanaal, terug, staat,
}: {
  c: Community;
  openKanaal: (id: number) => void;
  terug: () => void;
  staat: Staat;
}) {
  const [opnieuw, setOpnieuw] = useState(0);
  const keuze = feedInstelling(staat.data.instellingen as Record<string, unknown> | undefined);

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-10 border-b border-lijn bg-white/90 px-4 pt-3 pb-3 backdrop-blur dark:bg-[#0b0b0e]/90">
        <button type="button" onClick={terug} className="mb-1 flex items-center gap-1 text-sm text-accent">
          <Terug className="size-5" /> Netwerk
        </button>
        <h1 className="text-xl font-bold tracking-tight">{c.naam}</h1>
        {c.omschrijving && <p className="mt-0.5 text-[13px] text-rustig">{c.omschrijving}</p>}
        <p className="mt-2 text-[12px] leading-snug text-zacht">
          Posts en reacties ziet elk lid. Privé zaken horen in Chats. Delen buiten de app alleen via een
          link die jij zelf verstuurt.
        </p>
      </header>

      {c.kanalen?.length > 0 && (
        <section className="px-5 pt-4" aria-label="Kanalen">
          <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.06em] text-rustig">Kanalen</h2>
          <ul className="flex flex-col gap-1">
            {c.kanalen.map((k) => (
              <li key={k.id}>
                <button
                  type="button"
                  onClick={() => openKanaal(k.id)}
                  className="flex min-h-12 w-full items-center gap-3 rounded-2xl px-3 text-left hover:bg-vlak"
                >
                  <Ballon className="size-5 shrink-0 text-accent" />
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate ${k.ongelezen ? "font-semibold" : "font-medium"}`}>
                      {k.naam}
                    </span>
                    <span className="block text-[12px] text-rustig">
                      {k.alleen_beheer ? "Alleen beheerders" : "Iedereen schrijft"}
                    </span>
                  </span>
                  {k.ongelezen > 0 && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-semibold text-white">
                      {k.ongelezen}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-3 px-5 pt-5 pb-10" aria-label="Feed">
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.06em] text-rustig">Feed</h2>
        {!c.herinnering && (
          <Schrijven mijn={[c]} vast={c.id} geplaatst={() => setOpnieuw((n) => n + 1)} />
        )}
        <Berichten
          key={opnieuw}
          keuze={keuze}
          community={c.id}
          leeg="Nog geen berichten. Deel als eerste iets met de leden."
        />
      </section>
    </div>
  );
}

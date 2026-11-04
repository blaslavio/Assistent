// Werkruimte: privé-apps en zakelijk gescheiden. Recente apps in een horizontale schuifbalk.
// Privacy voorop: recente projecten alleen na sessie-check; geen zakelijke tools in privé-rij.
import { studioZoeken } from "../lib/studio";
import { huidigeSessie } from "../api";
import { overzicht, type Gesprek } from "../lib/chat";
import { plekSleutel, recenteWerkplekken, type Werkplek } from "../lib/werkplekken";
import { useSchermActief } from "./BewaarScherm";
import { lazy, Suspense, useEffect, useState } from "react";
import type { Staat } from "../App";
import { ONDERDELEN, type OnderdeelNaam } from "../lib/onderdeel-lijst";
import { studioOpenen, kaartOpenen, winkelAppOpenen, instellingenOpenen } from "../lib/naar";
import { KaartVouw, Projectmap, Tas, Terug, Winkelpand, Zoek } from "../iconen";
import { leesInteresses, type Interesse } from "../lib/interesses";
import BewaarScherm from "./BewaarScherm";

const Onderdeel = lazy(() => import("./Onderdelen").then((m) => ({ default: m.Onderdeel })));
const Projecten = lazy(() => import("./Projecten"));

type Deel = OnderdeelNaam | "projecten" | null;
type Props = {
  gebruik?: (p: Werkplek) => void;
  staat: Staat;
  vernieuw: () => Promise<void>;
  vraag: (t: string) => void;
  openProject: (id: number) => void;
  naarChat: () => void;
  start?: { naam: OnderdeelNaam; n: number } | null;
};

const UIT: Record<string, string> = {
  notities: "Snel iets vastleggen",
  documenten: "Lezen, schrijven en bewaren",
  huishouden: "Samen thuis organiseren",
  leren: "Oefenen en ontwikkelen",
  boodschappen: "Wat je nog wilt halen",
  kooplijst: "Je aankopen voorbereiden",
  wenslijst: "Je ideeën bewaren",
  budget: "Je inkomsten en uitgaven",
  beleggen: "Je portefeuille en volglijst",
  sport: "Bewegen en je gezondheid",
  zakelijk: "Klanten, rooster en administratie",
  studio: "Winkel, evenementen en tickets",
};

// Wat je bij de start koos, schuift die apps naar voren.
const BIJ_INTERESSE: Record<Interesse, string[]> = { dag: ["boodschappen", "huishouden"], geld: ["budget", "beleggen"],
  verkopen: ["kooplijst"], community: [], werk: ["documenten", "notities"], leren: ["leren"] };

const PRIVE: OnderdeelNaam[] = [
  "notities", "documenten", "huishouden", "boodschappen", "kooplijst",
  "wenslijst", "budget", "beleggen", "leren", "sport",
];
const ZAKELIJK: OnderdeelNaam[] = ["studio", "zakelijk"];

export default function Werkruimte({
  staat, vernieuw, vraag, openProject, naarChat, start, gebruik,
}: Props) {
  const [deel, setDeel] = useState<Deel>(start?.naam ?? null);
  const [zoek, setZoek] = useState("");
  useEffect(() => {
    if (start) {
      setDeel(start.naam);
      gebruik?.({ soort: "app", app: start.naam });
    }
  }, [start, gebruik]);

  const actief = useSchermActief();
  const recent = recenteWerkplekken(staat.data).filter(
    (p) => p.soort === "project" || (p.soort === "app" && !ZAKELIJK.includes(p.app)),
  );
  const ids = recent.filter((p) => p.soort === "project").map((p) => p.gesprek).join(",");
  const [projecten, setProjecten] = useState<Gesprek[]>([]);
  const [projectFout, setProjectFout] = useState(false);
  const [ronde, setRonde] = useState(0);

  useEffect(() => {
    if (!actief) return;
    let gestopt = false;
    const sessie = huidigeSessie();
    setProjecten([]);
    setProjectFout(false);
    const wis = () => {
      gestopt = true;
      setProjecten([]);
    };
    window.addEventListener("assistent-sessie", wis);
    if (ids && sessie) {
      overzicht(false)
        .then((r) => {
          if (!gestopt && huidigeSessie() === sessie) {
            setProjecten(r.gesprekken.filter((g) => g.status === "lid"));
          }
        })
        .catch(() => {
          if (!gestopt && huidigeSessie() === sessie) setProjectFout(true);
        });
    }
    return () => {
      gestopt = true;
      window.removeEventListener("assistent-sessie", wis);
    };
  }, [ids, actief, ronde]);

  function kiesApp(app: OnderdeelNaam) {
    gebruik?.({ soort: "app", app });
    setDeel(app);
  }

  const vervolg = recent
    .flatMap((p) => {
      if (p.soort === "app") {
        const a = ONDERDELEN.find(([id]) => id === p.app);
        if (!a) return [];
        return [{
          id: plekSleutel(p),
          naam: a[1],
          Icoon: a[2],
          doe: () => kiesApp(p.app),
          uitleg: "Recent",
        }];
      }
      const g = projecten.find((x) => x.id === p.gesprek);
      if (!g) return [];
      const naam =
        g.naam ||
        g.leden
          .filter((l) => l.id !== staat.gebruiker.id && l.status === "lid")
          .map((l) => l.naam)
          .join(", ") ||
        "Project";
      return [{
        id: plekSleutel(p),
        naam,
        Icoon: Projectmap,
        doe: () => openProject(g.id),
        uitleg: "Project",
      }];
    })
    .slice(0, 8);

  const term = zoek.trim().toLocaleLowerCase("nl");
  const match = (id: string, naam: string) =>
    `${naam} ${UIT[id] ?? ""}`.toLocaleLowerCase("nl").includes(term);

  const appKnop = ([id, naam, Icoon]: (typeof ONDERDELEN)[number]) => (
    <button
      key={id}
      type="button"
      onClick={() => kiesApp(id)}
      className="flex min-h-[3.75rem] w-full items-center gap-3 rounded-2xl bg-vlak px-4 py-3 text-left"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent text-white">
        <Icoon className="size-[18px]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium">{naam}</span>
        <span className="block truncate text-[13px] text-rustig">{UIT[id]}</span>
      </span>
      <Terug className="size-4 rotate-180 shrink-0 text-rustig" />
    </button>
  );

  // Eén app als icoontje met naam eronder, zoals op een telefoon. De uitleg staat in het label voor voorlezen.
  const tegel = (id: string, naam: string, Icoon: (p: { className?: string }) => React.ReactNode, doe: () => void, uitleg = UIT[id]) => (
    <button key={id} type="button" onClick={doe} aria-label={uitleg ? `${naam}, ${uitleg}` : naam}
      className="flex min-w-0 flex-col items-center gap-1.5 rounded-2xl py-1 active:scale-95">
      <span className="flex size-14 items-center justify-center rounded-[18px] bg-vlak text-accent">
        <Icoon className="size-6" />
      </span>
      <span className="line-clamp-2 w-full hyphens-auto text-center text-[11px] font-medium leading-tight">{naam.split(" · ")[0]}</span>
    </button>
  );

  const priveApps = ONDERDELEN.filter(([id]) => PRIVE.includes(id));
  // Belangrijkste eerst: werk en geld gaan voor lijstjes.
  const VOLGORDE = ["documenten", "notities", "budget", "boodschappen"];
  const voorkeur = leesInteresses(staat.data.instellingen).flatMap((i) => BIJ_INTERESSE[i]);
  const gewicht = (id: string) => (VOLGORDE.includes(id) ? VOLGORDE.indexOf(id) : voorkeur.includes(id) ? 10 : 20);
  const hoofd = priveApps.filter(([id]) => VOLGORDE.includes(id));
  const extra = priveApps.filter(
    ([id]) => !["notities", "documenten", "boodschappen", "budget"].includes(id),
  );
  const studioMatch =
    studioZoeken(zoek).length > 0 || "studio winkel evenementen deellinks tickets".includes(term);
  const resultaten = priveApps.filter(([id, naam]) => match(id, naam));
  const projectMatch = match("projecten", "Projecten samen werken gesprekken");
  const kaartMatch = match("kaart", "Kaart routes locaties reizen");
  const winkelMatch = match("winkel", "Winkel aanbod verkopen bestellingen");
  const zakelijkMatch =
    match("zakelijk", "Zakelijk klanten rooster") || studioMatch || "zakelijk studio bedrijf".includes(term);


  return (
    <section className="h-full" aria-label="Werkruimte">
      <BewaarScherm actief={deel === null} naam="Werkruimte overzicht">
        <div className="flex flex-col gap-5 px-5 pt-4 pb-8">
          <header className="flex flex-col gap-3">
            <h1 className="text-[22px] font-bold tracking-tight">Werkruimte</h1>
            <label className="flex h-10 items-center gap-2 rounded-full bg-vlak px-3.5">
              <Zoek className="size-4 shrink-0 text-rustig" />
              <input
                type="search"
                value={zoek}
                maxLength={100}
                onChange={(e) => setZoek(e.target.value)}
                placeholder="Zoek een app of project"
                aria-label="Zoek in werkruimte"
                className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-zacht"
              />
            </label>
          </header>

          {!term && (
            <section aria-label="Recent gebruikt" className={vervolg.length || projectFout ? "" : "hidden"}>
              <h2 className="mb-2 px-0.5 text-[12px] font-semibold uppercase tracking-[0.06em] text-rustig">
                Recent
              </h2>
              {vervolg.length > 0 ? (
                <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-lijn">
                  {vervolg.map(({ id, naam, Icoon, doe, uitleg }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={doe}
                      className="flex h-10 shrink-0 items-center gap-2 rounded-full bg-vlak pl-1.5 pr-3.5 text-left transition active:scale-[0.98]"
                    >
                      <span className="flex size-7 items-center justify-center rounded-full bg-white text-accent dark:bg-white/10">
                        <Icoon className="size-4" />
                      </span>
                      <span className="max-w-[9rem] truncate text-[13px] font-medium">{naam}</span>
                      <span className="sr-only">{uitleg}</span>
                    </button>
                  ))}
                </div>
              ) : null}
              {projectFout && (
                <p role="status" className="mt-2 text-xs text-rustig">
                  Projecten nog niet gecontroleerd.{" "}
                  <button type="button" className="text-accent" onClick={() => setRonde((n) => n + 1)}>
                    Opnieuw
                  </button>
                </p>
              )}
            </section>
          )}

          {term ? (
            <section className="flex flex-col gap-2" aria-label="Zoekresultaten">
              {resultaten.map((a) => appKnop(a))}
              {projectMatch && (
                <button
                  type="button"
                  onClick={() => setDeel("projecten")}
                  className="flex min-h-14 items-center gap-3 rounded-2xl bg-vlak px-4 text-left"
                >
                  <Projectmap className="size-5 text-accent" />
                  <span className="font-medium">Projecten</span>
                </button>
              )}
              {kaartMatch && (
                <button type="button" onClick={kaartOpenen} className="flex min-h-12 items-center gap-3 rounded-2xl bg-vlak px-4 text-left">
                  <KaartVouw className="size-5 text-accent" /> Kaart en routes
                </button>
              )}
              {winkelMatch && (
                <button type="button" onClick={winkelAppOpenen} className="flex min-h-12 items-center gap-3 rounded-2xl bg-vlak px-4 text-left">
                  <Tas className="size-5 text-accent" /> Winkel en aanbod
                </button>
              )}
              {zakelijkMatch && (
                <>
                  <button type="button" onClick={() => kiesApp("studio")} className="flex min-h-14 items-center gap-3 rounded-2xl border border-accent/30 bg-accent/5 px-4 text-left">
                    <Winkelpand className="size-5 text-accent" />
                    <span>
                      <span className="block font-medium">Studio</span>
                      <span className="text-[13px] text-rustig">Winkel en evenementen</span>
                    </span>
                  </button>
                  {studioZoeken(zoek).slice(0, 4).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => studioOpenen({ tool: t.id })}
                      className="min-h-11 rounded-xl bg-vlak px-4 py-2 text-left text-sm"
                    >
                      {t.naam}
                    </button>
                  ))}
                </>
              )}
              {!resultaten.length && !projectMatch && !kaartMatch && !winkelMatch && !zakelijkMatch && (
                <p role="status" className="text-sm text-rustig">
                  Niets gevonden. Probeer notities, budget of studio.
                </p>
              )}
            </section>
          ) : (
            <>
              <section aria-label="Privé" className="flex flex-col gap-2">
                <h2 className="px-0.5 text-[12px] font-semibold uppercase tracking-[0.06em] text-rustig">Privé</h2>
                <div className="grid grid-cols-4 gap-x-2 gap-y-3">
                  {[...hoofd, ...extra].sort((a, b) => gewicht(a[0]) - gewicht(b[0])).map(([id, naam, Icoon]) => tegel(id, naam, Icoon, () => kiesApp(id)))}
                  {tegel("projecten", "Samenwerken", Projectmap, () => setDeel("projecten"), "Projecten uit je gesprekken")}
                  {tegel("kaart", "Kaart", KaartVouw, kaartOpenen, "Routes en plekken")}
                </div>
              </section>

              <section aria-label="Zakelijk" className="flex flex-col gap-2">
                <h2 className="px-0.5 text-[12px] font-semibold uppercase tracking-[0.06em] text-rustig">Zakelijk</h2>
                <div className="grid grid-cols-4 gap-x-2 gap-y-3">
                  {ONDERDELEN.filter(([id]) => ZAKELIJK.includes(id)).map(([id, naam, Icoon]) => tegel(id, naam, Icoon, () => kiesApp(id)))}
                  {tegel("winkel", "Winkel", Tas, winkelAppOpenen, "Kopen en verkopen")}
                </div>
              </section>

              <p className="text-center text-[12px] text-zacht">
                Privé en zakelijk blijven gescheiden.{" "}
                <button type="button" className="text-accent" onClick={() => instellingenOpenen("privacy")}>
                  Privacy
                </button>
              </p>
            </>
          )}
        </div>
      </BewaarScherm>

      <BewaarScherm actief={deel === "projecten"} naam="Samenwerken">
        <button type="button" onClick={() => setDeel(null)} className="mx-4 mt-2 flex min-h-11 items-center gap-1 text-sm text-accent">
          <Terug className="size-5" /> Werkruimte
        </button>
        <Suspense fallback={<p role="status" className="p-6">Projecten laden…</p>}>
          <Projecten ingebed staat={staat} open={openProject} naarChat={naarChat} />
        </Suspense>
      </BewaarScherm>

      {deel && deel !== "projecten" && (
        <Suspense fallback={<p role="status" className="p-6">App laden…</p>}>
          <Onderdeel
            key={deel}
            naam={deel}
            staat={staat}
            vernieuw={vernieuw}
            vraag={vraag}
            terug={() => setDeel(null)}
            terugNaam="Werkruimte"
          />
        </Suspense>
      )}
    </section>
  );
}

// Werkruimte: een rustige lijst met je apps, privé en zakelijk gescheiden. Zoeken gaat via het zoekveld bovenin.
// Privacy voorop: recente projecten alleen na sessie-check; geen zakelijke tools in privé-rij.
import { huidigeSessie } from "../api";
import { overzicht, type Gesprek } from "../lib/chat";
import { plekSleutel, recenteWerkplekken, type Werkplek } from "../lib/werkplekken";
import { useSchermActief } from "./BewaarScherm";
import { lazy, Suspense, useEffect, useState } from "react";
import type { Staat } from "../App";
import { ONDERDELEN, UITLEG, type OnderdeelNaam } from "../lib/onderdeel-lijst";
import { kaartOpenen, winkelAppOpenen } from "../lib/naar";
import { KaartVouw, Projectmap, Tas, Terug } from "../iconen";
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
  const [alles, setAlles] = useState(false);
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

  type Rij = { id: string; naam: string; uitleg?: string; Icoon: (p: { className?: string }) => React.ReactNode; doe: () => void };
  // Eén rustige rij: klein icoon, naam, één regel uitleg en een pijltje. Rijen in één kaart, gescheiden door een lijntje.
  const lijst = (rijen: Rij[]) => (
    <ul className="divide-y divide-lijn overflow-hidden rounded-2xl bg-vlak">
      {rijen.map(({ id, naam, uitleg, Icoon, doe }) => (
        <li key={id}>
          <button type="button" onClick={doe} aria-label={uitleg ? `${naam}, ${uitleg}` : naam}
            className="flex min-h-[3.25rem] w-full items-center gap-3 px-4 py-2.5 text-left active:bg-lijn/40">
            <Icoon className="size-5 shrink-0 text-accent" />
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-medium">{naam}</span>
              {uitleg && <span className="block truncate text-[13px] text-rustig">{uitleg}</span>}
            </span>
            <Terug className="size-4 shrink-0 rotate-180 text-zacht" />
          </button>
        </li>
      ))}
    </ul>
  );
  const kop = (t: string) => <h2 className="px-1 text-[13px] font-medium text-rustig">{t}</h2>;

  // Belangrijkste eerst; wat je bij de start koos schuift naar voren. Eerst zes, de rest achter één knop.
  const VOLGORDE = ["documenten", "notities", "budget", "boodschappen"];
  const voorkeur = leesInteresses(staat.data.instellingen).flatMap((i) => BIJ_INTERESSE[i]);
  const gewicht = (id: string) => (VOLGORDE.includes(id) ? VOLGORDE.indexOf(id) : voorkeur.includes(id) ? 10 : 20);
  const priveRijen: Rij[] = [
    ...ONDERDELEN.filter(([id]) => PRIVE.includes(id))
      .sort((a, b) => gewicht(a[0]) - gewicht(b[0]))
      .map(([id, naam, Icoon]) => ({ id, naam, uitleg: UITLEG[id], Icoon, doe: () => kiesApp(id) })),
    { id: "projecten", naam: "Samenwerken", uitleg: "Projecten uit je gesprekken", Icoon: Projectmap, doe: () => setDeel("projecten") },
    { id: "kaart", naam: "Kaart", uitleg: "Routes en plekken", Icoon: KaartVouw, doe: kaartOpenen },
  ];
  const ZICHTBAAR = 6;
  const zakelijkRijen: Rij[] = [
    ...ONDERDELEN.filter(([id]) => ZAKELIJK.includes(id))
      .map(([id, naam, Icoon]) => ({ id, naam: naam.split(" · ")[0], uitleg: UITLEG[id], Icoon, doe: () => kiesApp(id) })),
    { id: "winkel", naam: "Winkel", uitleg: "Kopen en verkopen", Icoon: Tas, doe: winkelAppOpenen },
  ];

  return (
    <section className="h-full" aria-label="Werkruimte">
      <BewaarScherm actief={deel === null} naam="Werkruimte overzicht">
        <div className="flex flex-col gap-6 px-5 pt-3 pb-8">
          <h1 className="px-1 text-[22px] font-bold tracking-tight">Werkruimte</h1>

          {(vervolg.length > 0 || projectFout) && (
            <section aria-label="Recent gebruikt" className="flex flex-col gap-2">
              {kop("Recent")}
              {vervolg.length > 0 && lijst(vervolg.slice(0, 3).map((v) => ({ ...v, uitleg: undefined })))}
              {projectFout && (
                <p role="status" className="px-1 text-xs text-rustig">
                  Projecten nog niet gecontroleerd.{" "}
                  <button type="button" className="text-accent" onClick={() => setRonde((n) => n + 1)}>Opnieuw</button>
                </p>
              )}
            </section>
          )}

          <section aria-label="Privé" className="flex flex-col gap-2">
            {kop("Privé")}
            {lijst(alles ? priveRijen : priveRijen.slice(0, ZICHTBAAR))}
            {priveRijen.length > ZICHTBAAR && (
              <button type="button" onClick={() => setAlles((a) => !a)} aria-expanded={alles}
                className="self-start px-1 py-1.5 text-[14px] font-medium text-accent">
                {alles ? "Minder tonen" : `Alle apps tonen (${priveRijen.length})`}
              </button>
            )}
          </section>

          <section aria-label="Zakelijk" className="flex flex-col gap-2">
            {kop("Zakelijk")}
            {lijst(zakelijkRijen)}
          </section>
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

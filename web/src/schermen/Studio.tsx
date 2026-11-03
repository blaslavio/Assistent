// Studio: zakelijke werkbank + social agents.
import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import type { Staat } from "../App";
import {
  STUDIO_TOOLS,
  studioZoeken,
  ticketAdres,
  ticketAdresVerbruiken,
  type StudioVerzoek,
} from "../lib/studio";
import { instellingenOpenen, studioVerzoekBekijken, studioVerzoekLezen } from "../lib/naar";
import { Ballon, Kalender, Winkelpand, Tas, Slot, Terug, Zoek, Mensen } from "../iconen";

const Winkel = lazy(() => import("./MijnWinkel").then((m) => ({ default: m.MijnWinkel })));
const Product = lazy(() => import("./Verkopen").then((m) => ({ default: m.Verkopen })));
const Bestellingen = lazy(() => import("./Bestellingen"));
const Evenementen = lazy(() => import("./Evenementen"));
const EventBouwer = lazy(() => import("./EventBouwer"));
const Delen = lazy(() => import("./StudioDelen"));
const Tickets = lazy(() => import("./TicketDesk"));
const BotBeheer = lazy(() => import("./BotBeheer"));

const GROEP_ICOON = [Winkelpand, Tas, Kalender, Slot, Ballon, Mensen] as const;

export default function Studio({
  staat,
  vernieuw,
  terug,
}: {
  staat: Staat;
  vernieuw: () => Promise<void>;
  terug: () => void;
}) {
  const [verzoek, setVerzoek] = useState<StudioVerzoek | null>(() => {
    const vraag = studioVerzoekBekijken();
    const id = ticketAdres();
    return vraag ?? (id ? { tool: "tickets", evenement: id } : null);
  });
  const [zoek, setZoek] = useState("");
  const [ronde, setRonde] = useState(0);
  const [melding, setMelding] decuseState("");

  useEffect(() => {
    const eerste = studioVerzoekLezen();
    const ticket = ticketAdresVerbruiken();
    if (eerste) setVerzoek(eerste);
    else if (ticket) setVerzoek({ tool: "tickets", evenement: ticket });
    const open = () => {
      const p = studioVerzoekLezen();
      if (p) {
        setVerzoek(p);
        setRonde((n) => n + 1);
        setMelding("");
      }
    };
    window.addEventListener("studio-openen", open);
    return () => window.removeEventListener("studio-openen", open);
  }, []);

  const open = (p: StudioVerzoek) => {
    setVerzoek(p);
    setRonde((n) => n + 1);
    setMelding("");
  };

  const gekozen = STUDIO_TOOLS.find((t) => t.id === verzoek?.tool);
  const resultaten = studioZoeken(zoek);
  const groepen = [...new Set(STUDIO_TOOLS.map((t) => t.groep))];

  let inhoud: ReactNode = null;
  if (verzoek) {
    const t = verzoek.tool;
    if (["winkel", "ontwerp", "voorbeeld", "voorraad", "levering", "contact"].includes(t)) {
      inhoud = (
        <Winkel
          start={t as "winkel"}
          bekijk={(adres) => {
            import("../lib/mijnwinkel").then((m) => {
              m.winkelVragen(adres);
              import("../lib/naar").then((n) => n.naar({ tab: "chat" }));
            });
          }}
        />
      );
    } else if (t === "product") {
      inhoud = (
        <>
          <p className="mb-3 text-sm text-rustig">
            Je maakt een product of dienst als aanbod. Kies daarna bij Producten en voorraad wat in je
            webshop staat.
          </p>
          <button
            type="button"
            className="mb-3 min-h-11 rounded-full bg-vlak px-4 text-sm"
            onClick={() => setRonde((n) => n + 1)}
          >
            Productformulier opnieuw openen
          </button>
          <Product key={ronde} sluit={() => setVerzoek(null)} geplaatst={() => open({ tool: "voorraad" })} />
        </>
      );
    } else if (t === "bestellingen") inhoud = <Bestellingen />;
    else if (t === "betalingen") {
      inhoud = (
        <div className="flex flex-col gap-3 rounded-2xl border border-lijn p-4">
          <p className="text-sm text-rustig">
            Betalingen gebruiken dezelfde beveiligde voorziening als de rest van de app. Jij koppelt;
            niets gaat live zonder jouw instelling.
          </p>
          <button
            type="button"
            className="min-h-11 rounded-full bg-accent px-4 text-sm font-medium text-white"
            onClick={() => instellingenOpenen("betalingen")}
          >
            Open betaalinstellingen
          </button>
        </div>
      );
    } else if (t === "deellinks") inhoud = <Delen />;
    else if (t === "social_bots") inhoud = <BotBeheer />;
    else if (t === "evenementen") inhoud = <Evenementen staat={staat} setStaat={() => { void vernieuw(); }} />;
    else if (t === "event_maken") {
      inhoud = (
        <EventBouwer
          klaar={(groep, evenement) => {
            open({ tool: "tickets", groep, evenement });
            setMelding(
              "Evenement opgeslagen. Stel nu je gratis ticketinschrijving in als je die wilt gebruiken.",
            );
          }}
        />
      );
    } else {
      inhoud = <Tickets key={`${ronde}:${verzoek.evenement ?? 0}`} start={verzoek} />;
    }
  }

  const toolRij = (tools: typeof resultaten) => (
    <ul className="flex flex-col gap-2">
      {tools.map((t) => (
        <li key={t.id}>
          <button
            type="button"
            onClick={() => open({ tool: t.id })}
            className="flex min-h-[3.5rem] w-full items-center gap-3 rounded-2xl bg-vlak px-4 py-3 text-left"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-medium">{t.naam}</span>
              <span className="block text-[13px] text-rustig">{t.uitleg}</span>
            </span>
            <Terug className="size-4 shrink-0 rotate-180 text-rustig" />
          </button>
        </li>
      ))}
    </ul>
  );

  const snel = [
    { tool: "winkel" as const, label: "Winkel", sub: "Opzetten & ontwerp", Icoon: Winkelpand, primair: true },
    { tool: "event_maken" as const, label: "Evenement", sub: "Nieuw event", Icoon: Kalender, primair: false },
    { tool: "social_bots" as const, label: "Agents", sub: "Social & retentie", Icoon: Mensen, primair: false },
    { tool: "deellinks" as const, label: "Deellinks", sub: "Delen", Icoon: Ballon, primair: false },
  ];

  return (
    <section aria-label="Studio" className="flex flex-col gap-5 px-5 pt-4 pb-8">
      <button
        type="button"
        onClick={() => {
          if (verzoek) {
            setVerzoek(null);
            setMelding("");
          } else terug();
        }}
        className="flex min-h-11 self-start items-center gap-1 text-sm text-accent"
      >
        <Terug className="size-5" />
        {verzoek ? "Studio" : "Werkruimte"}
      </button>

      <header>
        <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-accent">Zakelijk</p>
        <h1 className="mt-1 text-[28px] font-bold tracking-tight">{gekozen?.naam ?? "Studio"}</h1>
        <p className="mt-1 text-[13px] text-rustig">
          {gekozen?.uitleg ??
            "Winkel, evenementen, tickets en agents. Bouwen en beheren — publiceren pas na jouw akkoord."}
        </p>
      </header>

      {melding && (
        <p role="status" className="rounded-2xl border border-accent/20 bg-accent/5 px-4 py-3 text-sm">
          {melding}
        </p>
      )}

      {verzoek ? (
        <Suspense fallback={<p role="status" className="text-sm text-rustig">Gereedschap laden…</p>}>
          {inhoud}
        </Suspense>
      ) : (
        <>
          <label className="flex h-12 items-center gap-2 rounded-2xl bg-vlak px-3">
            <Zoek className="size-5 shrink-0 text-rustig" />
            <input
              type="search"
              value={zoek}
              maxLength={100}
              onChange={(e) => setZoek(e.target.value)}
              placeholder="Zoek winkel, agents, tickets…"
              aria-label="Zoek in Studio"
              className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-zacht"
            />
          </label>

          {zoek.trim() ? (
            <>
              {toolRij(resultaten)}
              {!resultaten.length && (
                <p role="status" className="text-sm text-rustig">
                  Geen gereedschap gevonden. Probeer winkel, agents of tickets.
                </p>
              )}
            </>
          ) : (
            <>
              <section aria-label="Snel starten">
                <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.06em] text-rustig">
                  Snel starten
                </h2>
                <div className="grid grid-cols-2 gap-2">
                  {snel.map(({ tool, label, sub, Icoon, primair }) => (
                    <button
                      key={tool}
                      type="button"
                      onClick={() => open({ tool })}
                      className={
                        primair
                          ? "flex min-h-[5.5rem] flex-col items-start justify-between rounded-2xl bg-accent p-3.5 text-left text-white"
                          : "flex min-h-[5.5rem] flex-col items-start justify-between rounded-2xl border border-lijn bg-white p-3.5 text-left dark:bg-[#121216]"
                      }
                    >
                      <span
                        className={
                          primair
                            ? "flex size-9 items-center justify-center rounded-xl bg-white/20"
                            : "flex size-9 items-center justify-center rounded-xl bg-accent/10 text-accent"
                        }
                      >
                        <Icoon className="size-[18px]" />
                      </span>
                      <span>
                        <span className="block text-[14px] font-semibold">{label}</span>
                        <span className={`block text-[12px] ${primair ? "text-white/80" : "text-rustig"}`}>
                          {sub}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </section>

              <section aria-label="Verkoop" className="flex flex-col gap-2">
                <h2 className="text-[12px] font-semibold uppercase tracking-[0.06em] text-rustig">
                  Verkoop
                </h2>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => open({ tool: "product" })}
                    className="flex h-10 items-center gap-2 rounded-full bg-vlak px-3 text-[13px] font-medium"
                  >
                    <Tas className="size-4 text-accent" /> Product toevoegen
                  </button>
                  <button
                    type="button"
                    onClick={() => open({ tool: "bestellingen" })}
                    className="flex h-10 items-center gap-2 rounded-full bg-vlak px-3 text-[13px] font-medium"
                  >
                    Bestellingen
                  </button>
                  <button
                    type="button"
                    onClick={() => open({ tool: "betalingen" })}
                    className="flex h-10 items-center gap-2 rounded-full bg-vlak px-3 text-[13px] font-medium"
                  >
                    Betalingen
                  </button>
                </div>
              </section>

              <section aria-label="Alle gereedschappen" className="flex flex-col gap-3">
                <h2 className="text-[12px] font-semibold uppercase tracking-[0.06em] text-rustig">
                  Alle gereedschappen · {STUDIO_TOOLS.length}
                </h2>
                {groepen.map((groep, i) => {
                  const Icoon = GROEP_ICOON[i] ?? Winkelpand;
                  const tools = STUDIO_TOOLS.filter((t) => t.groep === groep);
                  return (
                    <details
                      key={groep}
                      className="group rounded-2xl border border-lijn open:border-accent/25"
                    >
                      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 py-2.5 text-[15px] font-medium marker:content-none">
                        <span className="flex size-8 items-center justify-center rounded-lg bg-accent/10 text-accent">
                          <Icoon className="size-4" />
                        </span>
                        {groep}
                        <span className="ml-auto text-[12px] text-rustig">{tools.length}</span>
                      </summary>
                      <div className="border-t border-lijn p-3">{toolRij(tools)}</div>
                    </details>
                  );
                })}
              </section>

              <p className="text-center text-[12px] text-zacht">
                Studio deelt geen privé-notities. Agents publiceren pas na jouw akkoord.
              </p>
            </>
          )}
        </>
      )}
    </section>
  );
}

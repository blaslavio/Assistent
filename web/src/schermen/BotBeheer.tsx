// BotBeheer: alle social-kanalen, één wachtrij, jij geeft akkoord.
import { useMemo, useState } from "react";
import {
  AGENT_DOELEN,
  ALLE_KANALEN,
  BOT_DOEL,
  bouwDigest,
  demoSignalen,
  demoVoorstellen,
  filterKanaal,
  keurLaagRisicoGoed,
  keurSelectie,
  markeerGeplaatst,
  standaardBeleidAlles,
  type BotBeleid,
  type BotKanaal,
  type BotVoorstel,
  type KlantSignaal,
} from "../lib/bots";
import { track, zetOAuthStatus, type OAuthProvider } from "../lib/platform-kern";

type Filter = BotKanaal | "alle";

export default function BotBeheer() {
  const [voorstellen, setVoorstellen] = useState<BotVoorstel[]>(() => demoVoorstellen());
  const [signalen, setSignalen] = useState<KlantSignaal[]>(() => demoSignalen());
  const [beleid, setBeleid] = useState<BotBeleid[]>(() => standaardBeleidAlles());
  const [filter, setFilter] = useState<Filter>("alle");
  const [gekozen, setGekozen] = useState<string[]>([]);

  const digest = useMemo(
    () => bouwDigest(voorstellen, signalen, beleid),
    [voorstellen, signalen, beleid],
  );
  const wachtrij = useMemo(
    () => filterKanaal(digest.wachtend, filter),
    [digest.wachtend, filter],
  );

  function toggle(id: string) {
    setGekozen((g) => (g.includes(id) ? g.filter((x) => x !== id) : [...g, id]));
  }

  function zetKanaalAan(id: BotKanaal, aan: boolean) {
    setBeleid((lijst) =>
      lijst.map((b) =>
        b.kanaal === id
          ? {
              ...b,
              aan,
              status: aan ? (b.status === "uit" ? "wacht_op_koppeling" : b.status) : "uit",
            }
          : b,
      ),
    );
  }

  function simuleerKoppeling(id: BotKanaal) {
    setBeleid((lijst) =>
      lijst.map((b) =>
        b.kanaal === id ? { ...b, aan: true, status: "actief" as const } : b,
      ),
    );
    if (["x", "instagram", "facebook", "tiktok", "linkedin", "youtube"].includes(id)) {
      zetOAuthStatus(id as OAuthProvider, "actief");
    }
  }

  const goedGekeurd = voorstellen.filter((v) => v.status === "goedgekeurd");

  return (
    <div className="flex flex-col gap-5 pb-4">
      <header className="flex flex-col gap-1">
        <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-accent">Agents</p>
        <h2 className="text-xl font-bold tracking-tight">Alle kanalen</h2>
        <p className="text-[13px] text-rustig">{BOT_DOEL}</p>
      </header>

      <section aria-label="Kanalen" className="flex flex-col gap-2">
        <h3 className="text-[12px] font-semibold uppercase tracking-[0.06em] text-rustig">Kanalen</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {ALLE_KANALEN.map((k) => {
            const b = beleid.find((x) => x.kanaal === k.id) ?? standaardBeleidAlles()[0];
            const w = digest.perKanaal[k.id]?.wachtend ?? 0;
            return (
              <div key={k.id} className="flex flex-col gap-2 rounded-2xl border border-lijn p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{k.naam}</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={b.aan}
                    onClick={() => zetKanaalAan(k.id, !b.aan)}
                    className={`relative h-6 w-11 rounded-full transition-colors ${b.aan ? "bg-accent" : "bg-vlak"}`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform ${b.aan ? "translate-x-5" : ""}`}
                    />
                  </button>
                </div>
                <p className="text-[11px] text-rustig">
                  {b.status === "actief"
                    ? "Gekoppeld"
                    : b.status === "wacht_op_koppeling"
                      ? "Wacht op koppeling"
                      : b.status === "fout"
                        ? "Fout — opnieuw koppelen"
                        : "Uit"}
                  {w > 0 ? ` · ${w} in wachtrij` : ""}
                </p>
                {b.aan && b.status !== "actief" && (
                  <button type="button" onClick={() => simuleerKoppeling(k.id)} className="h-8 rounded-full bg-vlak text-[12px] font-medium">
                    Koppel {k.naam}
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <p className="text-[12px] text-zacht">
          Echte publicatie vereist jouw login per netwerk (OAuth). Tot die tijd kun je de hele
          wachtrij al goedkeuren; plaatsen gebeurt zodra het kanaal actief is.
        </p>
      </section>

      <section className="rounded-2xl border border-accent/20 bg-accent/5 p-4" aria-label="Digest">
        <h3 className="text-[13px] font-semibold">Vandaag</h3>
        <p className="mt-1 text-[15px]">{digest.samenvatting}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="h-10 rounded-full bg-accent px-4 text-[13px] font-semibold text-white"
            onClick={() => {
              setVoorstellen((v) => keurLaagRisicoGoed(v));
              track("social_voorstel_goed", "laag");
            }}
          >
            Keur laag risico goed
          </button>
          <button
            type="button"
            disabled={!gekozen.length}
            className="h-10 rounded-full bg-vlak px-4 text-[13px] font-medium disabled:opacity-40"
            onClick={() => {
              setVoorstellen((v) => keurSelectie(v, gekozen, "goedgekeurd"));
              track("social_voorstel_goed", "selectie");
              setGekozen([]);
            }}
          >
            Selectie goedkeuren
          </button>
          <button
            type="button"
            disabled={!gekozen.length}
            className="h-10 rounded-full bg-vlak px-4 text-[13px] font-medium disabled:opacity-40"
            onClick={() => {
              setVoorstellen((v) => keurSelectie(v, gekozen, "afgewezen"));
              setGekozen([]);
            }}
          >
            Afwijzen
          </button>
          <button
            type="button"
            disabled={!goedGekeurd.length}
            className="h-10 rounded-full bg-vlak px-4 text-[13px] font-medium disabled:opacity-40"
            onClick={() => {
              setVoorstellen((v) =>
                markeerGeplaatst(
                  v,
                  v.filter((x) => x.status === "goedgekeurd").map((x) => x.id),
                ),
              );
              track("social_geplaatst");
            }}
          >
            Plaats goedgekeurde ({goedGekeurd.length})
          </button>
        </div>
      </section>

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5 [scrollbar-width:thin]">
        <button
          type="button"
          onClick={() => setFilter("alle")}
          className={`h-9 shrink-0 rounded-full px-3 text-[13px] font-medium ${
            filter === "alle" ? "bg-inkt text-white dark:bg-white dark:text-black" : "bg-vlak"
          }`}
        >
          Alle
        </button>
        {ALLE_KANALEN.map((k) => (
          <button
            key={k.id}
            type="button"
            onClick={() => setFilter(k.id)}
            className={`h-9 shrink-0 rounded-full px-3 text-[13px] font-medium ${
              filter === k.id ? "bg-inkt text-white dark:bg-white dark:text-black" : "bg-vlak"
            }`}
          >
            {k.naam}
            {(digest.perKanaal[k.id]?.wachtend ?? 0) > 0 ? ` ${digest.perKanaal[k.id].wachtend}` : ""}
          </button>
        ))}
      </div>

      <section aria-label="Wachtrij" className="flex flex-col gap-2">
        <h3 className="text-[12px] font-semibold uppercase tracking-[0.06em] text-rustig">
          Wachtrij · {wachtrij.length}
        </h3>
        {!wachtrij.length ? (
          <p className="text-sm text-rustig">Niets open op dit filter.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {wachtrij.map((v) => (
              <li key={v.id}>
                <label className="flex cursor-pointer gap-3 rounded-2xl border border-lijn p-3">
                  <input
                    type="checkbox"
                    checked={gekozen.includes(v.id)}
                    onChange={() => toggle(v.id)}
                    className="mt-1 size-4"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{v.titel}</span>
                      <span className="rounded-full bg-vlak px-2 py-0.5 text-[11px] text-rustig">
                        {v.kanaal} · {v.rol}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          v.risico === "hoog"
                            ? "bg-red-500/15 text-red-700 dark:text-red-300"
                            : v.risico === "middel"
                              ? "bg-amber-500/15 text-amber-800 dark:text-amber-200"
                              : "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200"
                        }`}
                      >
                        {v.risico ?? "middel"}
                      </span>
                    </span>
                    <span className="mt-1 block text-[14px] leading-snug">{v.inhoud}</span>
                    {v.bronVraag && (
                      <span className="mt-1 block text-[12px] text-rustig">Op: “{v.bronVraag}”</span>
                    )}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="KlantSignaal" className="flex flex-col gap-2">
        <h3 className="text-[12px] font-semibold uppercase tracking-[0.06em] text-rustig">
          KlantSignaal · {digest.signalen.length}
        </h3>
        <ul className="flex flex-col gap-2">
          {digest.signalen.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 rounded-2xl bg-vlak px-4 py-3">
              <span>
                <span className="block font-medium">{s.tekst}</span>
                <span className="text-[12px] text-rustig">
                  {s.bron}
                  {s.thema ? ` · ${s.thema}` : ""}
                  {s.aantal ? ` · ×${s.aantal}` : ""}
                </span>
              </span>
              <button
                type="button"
                className="h-9 shrink-0 rounded-full bg-white px-3 text-[12px] font-medium dark:bg-[#121216]"
                onClick={() => {
                  setSignalen((lijst) =>
                    lijst.map((x) => (x.id === s.id ? { ...x, status: "in_planning" } : x)),
                  );
                  track("signaal_in_planning", s.thema);
                }}
              >
                In planning
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Retentie" className="flex flex-col gap-2">
        <h3 className="text-[12px] font-semibold uppercase tracking-[0.06em] text-rustig">
          Platform actief houden
        </h3>
        <ul className="flex flex-col gap-1.5">
          {digest.retentieTips.map((tip) => (
            <li key={tip} className="rounded-xl border border-lijn px-3 py-2.5 text-[13px]">
              {tip}
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl bg-vlak p-4 text-[12px] text-rustig">
        <p className="font-medium text-inkt dark:text-white">Agent-doelen</p>
        <ul className="mt-2 list-inside list-disc space-y-1">
          {Object.entries(AGENT_DOELEN).map(([k, v]) => (
            <li key={k}>
              <span className="font-medium">{k}</span>: {v}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-zacht">
          Kanalen: Instagram, Facebook, TikTok, X, LinkedIn, YouTube. Jij koppelt en keurt goed;
          agents vullen de wachtrij op elk kanaal.
        </p>
      </section>
    </div>
  );
}

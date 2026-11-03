// BotBeheer: agent-wachtrij, signalen, retentie — jij tikt akkoord, agents doen het werk.
import { useMemo, useState } from "react";
import {
  AGENT_DOELEN,
  BOT_DOEL,
  bouwDigest,
  demoSignalen,
  demoVoorstellen,
  keurLaagRisicoGoed,
  keurSelectie,
  type BotVoorstel,
  type KlantSignaal,
} from "../lib/bots";

export default function BotBeheer() {
  const [voorstellen, setVoorstellen] = useState<BotVoorstel[]>(() => demoVoorstellen());
  const [signalen, setSignalen] = useState<KlantSignaal[]>(() => demoSignalen());
  const [gekozen, setGekozen] = useState<string[]>([]);
  const digest = useMemo(() => bouwDigest(voorstellen, signalen), [voorstellen, signalen]);

  function toggle(id: string) {
    setGekozen((g) => (g.includes(id) ? g.filter((x) => x !== id) : [...g, id]));
  }

  return (
    <div className="flex flex-col gap-5 pb-4">
      <header className="flex flex-col gap-1">
        <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-accent">Agents</p>
        <h2 className="text-xl font-bold tracking-tight">Social & retentie</h2>
        <p className="text-[13px] text-rustig">{BOT_DOEL}</p>
      </header>

      <section className="rounded-2xl border border-accent/20 bg-accent/5 p-4" aria-label="Digest">
        <h3 className="text-[13px] font-semibold">Vandaag</h3>
        <p className="mt-1 text-[15px]">{digest.samenvatting}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="h-10 rounded-full bg-accent px-4 text-[13px] font-semibold text-white"
            onClick={() => setVoorstellen((v) => keurLaagRisicoGoed(v))}
          >
            Keur laag risico goed
          </button>
          <button
            type="button"
            disabled={!gekozen.length}
            className="h-10 rounded-full bg-vlak px-4 text-[13px] font-medium disabled:opacity-40"
            onClick={() => {
              setVoorstellen((v) => keurSelectie(v, gekozen, "goedgekeurd"));
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
        </div>
      </section>

      <section aria-label="Wachtrij" className="flex flex-col gap-2">
        <h3 className="text-[12px] font-semibold uppercase tracking-[0.06em] text-rustig">
          Wachtrij · {digest.wachtend.length}
        </h3>
        {!digest.wachtend.length ? (
          <p className="text-sm text-rustig">Geen open voorstellen. Agents luisteren verder.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {digest.wachtend.map((v) => (
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
                    {v.doel && <span className="mt-0.5 block text-[12px] text-zacht">Doel: {v.doel}</span>}
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
            <li
              key={s.id}
              className="flex items-center justify-between gap-3 rounded-2xl bg-vlak px-4 py-3"
            >
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
                onClick={() =>
                  setSignalen((lijst) =>
                    lijst.map((x) => (x.id === s.id ? { ...x, status: "in_planning" } : x)),
                  )
                }
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
          Publiceren en gevoelige antwoorden blijven achter jouw akkoord. Laag risico mag je in batch
          doorzetten — het werk verdwijnt uit je handen, de regie niet.
        </p>
      </section>
    </div>
  );
}

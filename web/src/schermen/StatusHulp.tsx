// Status en meldingen — lokaal, privacy-first, duidelijk.
import { useMemo, useState } from "react";
import {
  bewaarMeldBeleid,
  leesMeldBeleid,
  metricsSamenvatting,
  V1_FOCUS,
  type MeldBeleid,
} from "../lib/platform-kern";
import { studioOpenen } from "../lib/naar";

export default function StatusHulp() {
  const m = useMemo(() => metricsSamenvatting(7), []);
  const [beleid, setBeleid] = useState<MeldBeleid>(() => leesMeldBeleid());
  const [notitie, setNotitie] = useState("");
  const [kopie, setKopie] = useState("");

  function zet<K extends keyof MeldBeleid>(k: K, v: MeldBeleid[K]) {
    setBeleid(bewaarMeldBeleid({ [k]: v }));
  }

  const kaarten = [
    { label: "App geopend", waarde: m.app_open, hint: "sessies" },
    { label: "Akkoorden", waarde: m.akkoord, hint: "expliciet" },
    { label: "Social goedgekeurd", waarde: m.social_goed, hint: "agents" },
    { label: "Geplaatst", waarde: m.social_geplaatst, hint: "na akkoord" },
    { label: "Signalen gepland", waarde: m.signalen, hint: "product" },
    { label: "Zoekacties", waarde: m.zoek, hint: "in-app" },
  ];

  return (
    <div className="flex flex-col gap-6 pb-4">
      <header className="flex flex-col gap-1">
        <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-accent">Overzicht</p>
        <p className="text-[14px] leading-snug text-rustig">
          Cijfers en meldingen blijven op{" "}
          <span className="font-medium text-inkt dark:text-white">dit apparaat</span>. Geen
          verborgen telemetrie.
        </p>
      </header>

      <section aria-label="Activiteit 7 dagen">
        <div className="mb-2 flex items-end justify-between gap-2">
          <h3 className="text-[12px] font-semibold uppercase tracking-[0.06em] text-rustig">
            Laatste 7 dagen
          </h3>
          <span className="text-[11px] text-zacht">Alleen lokaal</span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {kaarten.map((k) => (
            <div
              key={k.label}
              className="rounded-2xl border border-lijn bg-vlak/50 px-3 py-3 dark:bg-vlak/30"
            >
              <p className="text-[11px] text-rustig">{k.label}</p>
              <p className="mt-0.5 text-[22px] font-semibold tracking-tight tabular-nums">{k.waarde}</p>
              <p className="text-[11px] text-zacht">{k.hint}</p>
            </div>
          ))}
        </div>
      </section>

      <section aria-label="Meldbeleid" className="flex flex-col gap-2">
        <h3 className="text-[12px] font-semibold uppercase tracking-[0.06em] text-rustig">
          Meldingen
        </h3>
        <p className="text-[13px] text-rustig">
          Standaard rustig: geen marketing. Wachtrij en eigen events aan; stil na 22:00 tenzij je dat
          uitzet.
        </p>
        {(
          [
            ["akkoordWachtrij", "Social-agents wachtrij", "Als er voorstellen op akkoord wachten"],
            ["eigenEvents", "Evenementen en tickets", "Jouw events en check-in"],
            ["communityMention", "Community", "Als iemand je noemt of reageert"],
            ["marketing", "Tips en productnieuws", "Uit tenzij jij dit aanzet"],
          ] as const
        ).map(([k, label, sub]) => (
          <label
            key={k}
            className="flex min-h-[3.25rem] cursor-pointer items-center justify-between gap-3 rounded-2xl border border-lijn px-4 py-2.5"
          >
            <span className="min-w-0">
              <span className="block text-[14px] font-medium">{label}</span>
              <span className="block text-[12px] text-rustig">{sub}</span>
            </span>
            <input
              type="checkbox"
              checked={!!beleid[k]}
              onChange={(e) => zet(k, e.target.checked)}
              className="size-5 shrink-0"
            />
          </label>
        ))}
        <label className="flex min-h-[3.25rem] items-center justify-between gap-3 rounded-2xl border border-lijn px-4 py-2.5">
          <span>
            <span className="block text-[14px] font-medium">Stil na</span>
            <span className="block text-[12px] text-rustig">Lokale tijd, geen meldingen meer</span>
          </span>
          <select
            value={beleid.stilNaUur ?? ""}
            onChange={(e) =>
              zet("stilNaUur", e.target.value === "" ? null : Number(e.target.value))
            }
            className="rounded-xl border border-lijn bg-transparent px-2 py-1.5 text-[13px]"
          >
            <option value="">Uit</option>
            {[21, 22, 23].map((u) => (
              <option key={u} value={u}>
                {u}:00
              </option>
            ))}
          </select>
        </label>
      </section>

      <section aria-label="Agents" className="rounded-2xl border border-accent/20 bg-accent/5 p-4">
        <h3 className="text-[13px] font-semibold">Social agents</h3>
        <p className="mt-1 text-[13px] text-rustig">
          Voorstellen keuren en kanalen beheren doe je in Studio. Publiceren pas na jouw akkoord.
        </p>
        <button
          type="button"
          className="mt-3 h-10 rounded-full bg-accent px-4 text-[13px] font-semibold text-white"
          onClick={() => studioOpenen({ tool: "social_bots" })}
        >
          Open agents
        </button>
      </section>

      <section aria-label="Probleem melden" className="flex flex-col gap-2">
        <h3 className="text-[12px] font-semibold uppercase tracking-[0.06em] text-rustig">
          Iets mis?
        </h3>
        <p className="text-[13px] text-rustig">
          Noteer kort wat er misging. Dit blijft op het apparaat; plak het desgewenst in de Assistent.
        </p>
        <textarea
          value={notitie}
          onChange={(e) => setNotitie(e.target.value.slice(0, 500))}
          rows={3}
          placeholder="Bijv. bestelling blijft op wachten, ticket scan faalt…"
          className="w-full rounded-2xl border border-lijn bg-transparent px-3 py-2.5 text-[14px] outline-none focus:border-accent"
        />
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12px] text-zacht">{notitie.length}/500</span>
          <button
            type="button"
            disabled={!notitie.trim()}
            className="ml-auto h-9 rounded-full bg-vlak px-3 text-[12px] font-medium disabled:opacity-40"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(notitie.trim());
                setKopie("Gekopieerd — plak in Assistent indien nodig");
                setTimeout(() => setKopie(""), 2500);
              } catch {
                setKopie("Kopiëren lukte niet");
              }
            }}
          >
            Kopieer notitie
          </button>
        </div>
        {kopie && (
          <p role="status" className="text-[12px] text-accent">
            {kopie}
          </p>
        )}
      </section>

      <section className="rounded-2xl bg-vlak p-4 text-[12px] text-rustig">
        <p className="font-medium text-inkt dark:text-white">Focus v1</p>
        <ul className="mt-2 list-inside list-disc space-y-1">
          {V1_FOCUS.diamant.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}

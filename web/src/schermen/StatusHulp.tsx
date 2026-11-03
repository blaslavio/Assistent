// Self-serve status en hulp — zonder callcenter.
import { useMemo, useState } from "react";
import {
  bewaarMeldBeleid,
  leesMeldBeleid,
  metricsSamenvatting,
  type MeldBeleid,
} from "../lib/platform-kern";

export default function StatusHulp() {
  const m = useMemo(() => metricsSamenvatting(7), []);
  const [beleid, setBeleid] = useState<MeldBeleid>(() => leesMeldBeleid());
  const [tekst, setTekst] = useState("");

  function zet<K extends keyof MeldBeleid>(k: K, v: MeldBeleid[K]) {
    setBeleid(bewaarMeldBeleid({ [k]: v }));
  }

  return (
    <div className="flex flex-col gap-5 px-1 pb-6">
      <header>
        <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-accent">Hulp</p>
        <h2 className="text-xl font-bold tracking-tight">Status en meldingen</h2>
        <p className="mt-1 text-[13px] text-rustig">
          Cijfers blijven op dit apparaat. Geen verborgen telemetrie.
        </p>
      </header>

      <section className="rounded-2xl border border-lijn p-4" aria-label="Jouw week">
        <h3 className="text-[13px] font-semibold">Jouw activiteit (7 dagen, lokaal)</h3>
        <dl className="mt-2 grid grid-cols-2 gap-2 text-[13px]">
          <div className="rounded-xl bg-vlak px-3 py-2">
            <dt className="text-rustig">App open</dt>
            <dd className="text-lg font-semibold">{m.app_open}</dd>
          </div>
          <div className="rounded-xl bg-vlak px-3 py-2">
            <dt className="text-rustig">Akkoorden</dt>
            <dd className="text-lg font-semibold">{m.akkoord}</dd>
          </div>
          <div className="rounded-xl bg-vlak px-3 py-2">
            <dt className="text-rustig">Social goedgekeurd</dt>
            <dd className="text-lg font-semibold">{m.social_goed}</dd>
          </div>
          <div className="rounded-xl bg-vlak px-3 py-2">
            <dt className="text-rustig">Geplaatst</dt>
            <dd className="text-lg font-semibold">{m.social_geplaatst}</dd>
          </div>
        </dl>
      </section>

      <section className="flex flex-col gap-2" aria-label="Meldingen">
        <h3 className="text-[12px] font-semibold uppercase tracking-[0.06em] text-rustig">
          Meldbeleid
        </h3>
        {(
          [
            ["akkoordWachtrij", "Wachtrij social agents"],
            ["eigenEvents", "Mijn evenementen en tickets"],
            ["communityMention", "Community-vermeldingen"],
            ["marketing", "Tips en productnieuws"],
          ] as const
        ).map(([k, label]) => (
          <label
            key={k}
            className="flex min-h-12 items-center justify-between gap-3 rounded-2xl bg-vlak px-4"
          >
            <span className="text-[14px]">{label}</span>
            <input
              type="checkbox"
              checked={!!beleid[k]}
              onChange={(e) => zet(k, e.target.checked)}
              className="size-5"
            />
          </label>
        ))}
        <label className="flex min-h-12 items-center justify-between gap-3 rounded-2xl bg-vlak px-4">
          <span className="text-[14px]">Stil na uur (lokaal)</span>
          <select
            value={beleid.stilNaUur ?? ""}
            onChange={(e) =>
              zet("stilNaUur", e.target.value === "" ? null : Number(e.target.value))
            }
            className="rounded-lg bg-white px-2 py-1 dark:bg-[#121216]"
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

      <section className="flex flex-col gap-2" aria-label="Probleem">
        <h3 className="text-[12px] font-semibold uppercase tracking-[0.06em] text-rustig">
          Iets mis?
        </h3>
        <p className="text-[13px] text-rustig">
          Betaling, ticket of post die niet verscheen: beschrijf kort. Dit blijft op het apparaat tot
          er een support-RPC is; je kunt het ook in de Assistent plakken.
        </p>
        <textarea
          value={tekst}
          onChange={(e) => setTekst(e.target.value.slice(0, 500))}
          rows={3}
          placeholder="Bijv. bestelling #123 blijft op wachten…"
          className="w-full rounded-2xl border border-lijn bg-transparent px-3 py-2 text-[14px]"
        />
        <p className="text-[12px] text-zacht">{tekst.length}/500</p>
      </section>
    </div>
  );
}

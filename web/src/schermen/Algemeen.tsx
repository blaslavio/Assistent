// Algemene instellingen: hoe de app eruitziet, wat er op Vandaag staat, en een idee of probleem melden.
import { useEffect, useState } from "react";
import { alsIk } from "../api";
import { Schakelaar, kop } from "./instellingen-ui";
import { LANDEN, REGIO_S, REGIO_UITLEG, type FeestInstellingen } from "../lib/feestdagen";

export type Weergave = { thema?: "auto" | "licht" | "donker";
  toegankelijk?: { tekst?: string; contrast?: boolean; minder_beweging?: boolean };
  voorpagina?: Record<string, boolean>; voorbeeldvragen?: boolean; feestdagen?: Partial<FeestInstellingen> };

// Dezelfde namen als in de oude app, zodat een eerder gekozen tekstgrootte blijft staan.
export const TEKSTGROOTTE: Record<string, number> = { Klein: 0.92, Normaal: 1, Groot: 1.12, "Extra groot": 1.25 };
const THEMA: [NonNullable<Weergave["thema"]>, string][] = [["auto", "Automatisch"], ["licht", "Licht"], ["donker", "Donker"]];
export const VANDAAG: [string, string, string][] = [
  ["weer", "Weer", "Naast de datum"],
  ["mascotte", "Tips", "De mascotte met een korte tip"],
  ["afspraken", "Dagschema", "Wat er vandaag nog in je agenda staat"],
  ["taken", "Taken", "Je open taken en een veld om er een toe te voegen"],
];
export const opVandaag = (i: Weergave, k: string) => i.voorpagina?.[k] !== false;

/** Zet thema, tekstgrootte, contrast en beweging op de hele pagina. */
export function weergaveToepassen(i: Weergave) {
  const html = document.documentElement;
  const t = i.toegankelijk ?? {};
  if (i.thema === "licht" || i.thema === "donker") html.dataset.thema = i.thema;
  else delete html.dataset.thema;
  html.style.setProperty("--zoom", String(TEKSTGROOTTE[t.tekst ?? ""] ?? 1));
  html.classList.toggle("contrast", !!t.contrast);
  html.classList.toggle("minder-beweging", !!t.minder_beweging);
}

export function AlgemeenScherm({ inst, bewaar }: { inst: Weergave;
  bewaar: (aanpassen: (i: Record<string, unknown>) => void) => void }) {
  const t = inst.toegankelijk ?? {};
  const toegankelijk = (stuk: Weergave["toegankelijk"]) => bewaar((i) => { i.toegankelijk = { ...t, ...stuk }; });
  return <>
    <Keuzes label="Kleur" opties={THEMA} waarde={inst.thema ?? "auto"} kies={(v) => bewaar((i) => { i.thema = v; })} />
    <Keuzes label="Tekstgrootte" opties={Object.keys(TEKSTGROOTTE).map((k) => [k, k === "Extra groot" ? "Extra" : k])}
      waarde={t.tekst && t.tekst in TEKSTGROOTTE ? t.tekst : "Normaal"} kies={(v) => toegankelijk({ tekst: v })} />
    <div className="flex flex-col gap-2">
      <Schakelaar label="Meer contrast" uitleg="Duidelijkere tekst en randen." aan={!!t.contrast}
        zet={(aan) => toegankelijk({ contrast: aan })} />
      <Schakelaar label="Minder beweging" uitleg="Geen draaiende of wisselende dingen." aan={!!t.minder_beweging}
        zet={(aan) => toegankelijk({ minder_beweging: aan })} />
    </div>
    <Feestdagen inst={inst} bewaar={bewaar} />
    <section className="flex flex-col gap-2">
      <h2 className={kop}>Op Vandaag</h2>
      {VANDAAG.map(([k, label, uitleg]) => (
        <Schakelaar key={k} label={label} uitleg={uitleg} aan={opVandaag(inst, k)}
          zet={(aan) => bewaar((i) => { i.voorpagina = { ...(inst.voorpagina ?? {}), [k]: aan }; })} />
      ))}
    </section>
    <section className="flex flex-col gap-2">
      <h2 className={kop}>Bij de assistent</h2>
      <Schakelaar label="Voorbeeldvragen" uitleg="Een paar vragen om mee te beginnen." aan={inst.voorbeeldvragen !== false}
        zet={(aan) => bewaar((i) => { i.voorbeeldvragen = aan; })} />
    </section>
  </>;
}

/** Feestdagen en schoolvakanties in de agenda. Standaard Nederland met de leuke dagen erbij. */
function Feestdagen({ inst, bewaar }: { inst: Weergave; bewaar: (aanpassen: (i: Record<string, unknown>) => void) => void }) {
  const f = { land: "NL", extra: true, regio: "", ...(inst.feestdagen ?? {}) } as FeestInstellingen;
  const zet = (stuk: Partial<FeestInstellingen>) => bewaar((i) => { i.feestdagen = { ...f, ...stuk }; });
  return (
    <section className="flex flex-col gap-3">
      <Keuzes label="Feestdagen in je agenda" opties={LANDEN} waarde={f.land} kies={(land) => zet({ land })} />
      {f.land && (
        <Schakelaar label="Ook Moederdag, Vaderdag, Sinterklaas en Oudejaar" uitleg="Geen vrije dagen, wel handig om niet te vergeten."
          aan={f.extra} zet={(extra) => zet({ extra })} />
      )}
      {f.land === "NL" && <>
        <Keuzes label="Schoolvakanties" opties={REGIO_S} waarde={f.regio} kies={(regio) => zet({ regio })} />
        <a href={REGIO_UITLEG} target="_blank" rel="noopener noreferrer" className="px-1 text-sm text-accent">Welke regio is mijn gemeente?</a>
      </>}
    </section>
  );
}

function Keuzes<T extends string>({ label, opties, waarde, kies }: { label: string; opties: [T, string][]; waarde: string;
  kies: (v: T) => void }) {
  return (
    <fieldset>
      <legend className={kop}>{label}</legend>
      <div className="flex rounded-2xl bg-vlak p-1">
        {opties.map(([o, naam]) => (
          <button key={o} type="button" aria-pressed={o === waarde} onClick={() => o !== waarde && kies(o)}
            className={`h-10 flex-1 rounded-xl text-[15px] ${o === waarde ? "bg-white font-semibold shadow-sm dark:bg-[#2a2a31]" : "text-rustig"}`}>
            {naam}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

type Melding = { id: number; soort: string; tekst: string; status: string; antwoord?: string | null };
const STATUS: Record<string, string> = { nieuw: "Ontvangen", opgepakt: "Mee bezig", klaar: "Gedaan", afgewezen: "Niet gedaan" };

/** Een idee of probleem doorgeven; eronder zie je wat ermee gebeurd is. */
export function IdeeScherm() {
  const [soort, setSoort] = useState<"idee" | "probleem">("idee");
  const [tekst, setTekst] = useState("");
  const [lijst, setLijst] = useState<Melding[]>([]);
  const [melding, setMelding] = useState("");
  const laden = () => alsIk<{ meldingen?: Melding[] }>("mijn_app_meldingen").then((r) => setLijst(r.meldingen ?? [])).catch(() => {});
  useEffect(() => { laden(); }, []);

  async function versturen() {
    setMelding("");
    try {
      const r = await alsIk<{ fout?: string }>("app_melden", { p_soort: soort, p_tekst: tekst.trim(), p_pagina: "nieuwe app" });
      if (r?.fout) { setMelding(r.fout); return; }
      setTekst("");
      setMelding("Dank je. Hieronder zie je wat ermee gebeurt.");
      laden();
    } catch {
      setMelding("Versturen lukte niet. Probeer het opnieuw.");
    }
  }

  return <>
    <Keuzes label="Soort" opties={[["idee", "Idee"], ["probleem", "Probleem"]]} waarde={soort} kies={setSoort} />
    <div className="flex flex-col gap-2">
      <textarea value={tekst} onChange={(e) => setTekst(e.target.value)} maxLength={2000} rows={4} aria-label="Wat kan beter?"
        placeholder={soort === "idee" ? "Wat zou je graag willen?" : "Wat ging er mis, en waar?"}
        className="min-h-28 rounded-2xl bg-vlak px-4 py-3 outline-none placeholder:text-zacht" />
      <button disabled={tekst.trim().length < 3} onClick={versturen}
        className="h-12 self-start rounded-2xl bg-accent px-5 font-medium text-white disabled:opacity-30">Versturen</button>
      <p aria-live="polite" className="px-1 text-sm text-rustig">{melding || "Fouten in de app worden vanzelf gemeld, zonder je naam of gegevens."}</p>
    </div>
    {lijst.length > 0 && (
      <section>
        <h2 className={kop}>Eerder gemeld</h2>
        <ul className="flex flex-col divide-y divide-lijn rounded-2xl bg-vlak">
          {lijst.map((m) => (
            <li key={m.id} className="flex flex-col gap-0.5 px-4 py-3">
              <span className="line-clamp-3">{m.tekst}</span>
              <span className="text-[13px] text-rustig">{m.soort === "probleem" ? "Probleem" : "Idee"} · {STATUS[m.status] ?? m.status}</span>
              {m.antwoord && <span className="text-sm text-rustig">{m.antwoord}</span>}
            </li>
          ))}
        </ul>
      </section>
    )}
  </>;
}

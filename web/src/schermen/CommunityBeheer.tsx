// Instellingen van een community, voor eigenaar en beheerders: naam en omschrijving, openbaar, de code om mee te doen,
// kanalen, wie beheerder is, en (alleen de eigenaar) de community opheffen.
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Terug } from "../iconen";
import { Rondje } from "../rondje";
import {
  community, communityInstellen, communityLid, kanaalInstellen, kanaalMaken, type Community, type Deelnemer, type LidActie,
} from "../lib/chat";
import { openbaarZetten } from "../lib/feed";
import { Schakelaar, kop } from "./instellingen-ui";

const veld = "h-12 min-w-0 flex-1 rounded-2xl bg-vlak px-4 outline-none placeholder:text-zacht";
const knop = "h-12 shrink-0 rounded-2xl bg-accent px-5 font-medium text-white disabled:opacity-30";
const foutVan = (e: unknown) => (e instanceof Error ? e.message : "Dat lukte niet. Probeer het opnieuw.");

type Info = { code?: string | null; code_aan: boolean; deelnemers: Deelnemer[] };

function Blok({ titel, children }: { titel: string; children: ReactNode }) {
  return <section className="flex flex-col gap-2"><h2 className={kop}>{titel}</h2>{children}</section>;
}

export function CommunityBeheer({ c, terug, vernieuw, opgeheven }: { c: Community; terug?: () => void;
  vernieuw: () => Promise<void>; opgeheven: () => void }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [naam, setNaam] = useState(c.naam);
  const [over, setOver] = useState(c.omschrijving ?? "");
  const [openbaar, setOpenbaar] = useState(!!c.openbaar);
  const [nieuwKanaal, setNieuwKanaal] = useState("");
  const [melding, setMelding] = useState("");
  const [fout, setFout] = useState("");
  const [zeker, setZeker] = useState("");
  const eigenaar = c.rol === "eigenaar";

  const laden = useCallback(() => community(c.id).then(setInfo).catch((e) => setFout(foutVan(e))), [c.id]);
  useEffect(() => { laden(); }, [laden]);

  async function doe(actie: () => Promise<unknown>, klaar = "Bewaard") {
    setFout("");
    setMelding("");
    try {
      await actie();
      await Promise.all([vernieuw(), laden()]);
      setMelding(klaar);
      setTimeout(() => setMelding(""), 1800);
      return true;
    } catch (e) {
      setFout(foutVan(e));
      return false;
    }
  }

  return (
    <div className={`flex flex-col px-6 pb-10 ${terug ? "min-h-full pt-12" : ""}`}>
      {terug && <>
        <button onClick={terug} className="-ml-2 flex h-10 items-center gap-1 self-start pr-3 text-rustig">
          <Terug className="size-5" /> {c.naam}
        </button>
        <h1 className="mt-4 mb-6 text-[28px] font-bold tracking-tight">Instellingen</h1>
      </>}
      <div className="flex flex-col gap-7">
        <Blok titel="Naam en omschrijving">
          <input value={naam} onChange={(e) => setNaam(e.target.value)} maxLength={60} aria-label="Naam" className="h-12 rounded-2xl bg-vlak px-4 outline-none" />
          <textarea value={over} onChange={(e) => setOver(e.target.value)} maxLength={300} rows={3} aria-label="Omschrijving"
            placeholder="Waar gaat het over?" className="min-h-24 rounded-2xl bg-vlak px-4 py-3 outline-none placeholder:text-zacht" />
          <button disabled={!naam.trim() || (naam === c.naam && over === (c.omschrijving ?? ""))} className={`${knop} self-start`}
            onClick={() => doe(() => communityInstellen(c.id, { titel: naam.trim(), omschrijving: over.trim() }))}>Bewaar</button>
        </Blok>

        <Schakelaar label="Openbaar" uitleg="Iedereen in de app ziet de feed en kan meedoen. Kanalen blijven alleen voor leden."
          aan={openbaar} zet={(aan) => { setOpenbaar(aan); doe(() => openbaarZetten(c.id, aan)).then((ok) => ok || setOpenbaar(!aan)); }} />

        <Blok titel="Meedoen met een code">
          <Schakelaar label="Code aan" uitleg="Wie de code heeft, kan zelf meedoen." aan={!!info?.code_aan}
            zet={(aan) => doe(() => communityInstellen(c.id, { code_aan: aan }))} />
          {info?.code_aan && info.code && (
            <div className="flex items-center gap-3 rounded-2xl bg-vlak px-4 py-3">
              <span className="flex-1 select-all font-mono text-lg font-semibold tracking-wider">{info.code}</span>
              <button className="h-9 rounded-full px-3 text-sm text-rustig"
                onClick={() => doe(() => communityInstellen(c.id, { nieuwe_code: true }), "Nieuwe code gemaakt")}>Nieuwe code</button>
            </div>
          )}
        </Blok>

        <Blok titel="Kanalen">
          <ul className="flex flex-col divide-y divide-lijn rounded-2xl bg-vlak">
            {c.kanalen.map((k) => (
              <KanaalRij key={k.id} naam={k.naam} alleenBeheer={k.alleen_beheer} laatste={c.kanalen.length <= 1}
                bewaar={(p) => doe(() => kanaalInstellen(k.id, p), p.weg ? "Kanaal verwijderd" : "Bewaard")} />
            ))}
          </ul>
          <form className="flex gap-2" onSubmit={(e) => {
            e.preventDefault();
            doe(() => kanaalMaken(c.id, nieuwKanaal, false), "Kanaal gemaakt").then((ok) => ok && setNieuwKanaal(""));
          }}>
            <input value={nieuwKanaal} onChange={(e) => setNieuwKanaal(e.target.value)} maxLength={40} placeholder="Nieuw kanaal"
              aria-label="Naam van een nieuw kanaal" className={veld} />
            <button disabled={!nieuwKanaal.trim()} className={knop}>Maken</button>
          </form>
        </Blok>

        <Blok titel="Leden en beheerders">
          <ul className="flex flex-col divide-y divide-lijn rounded-2xl bg-vlak">
            {(info?.deelnemers ?? []).map((d) => (
              <LidRij key={d.id} d={d} eigenaar={eigenaar} doe={(actie) => doe(() => communityLid(c.id, d.id, actie))} />
            ))}
          </ul>
          <p className="px-1 text-sm text-rustig">Beheerders kunnen kanalen en leden beheren. Weren betekent dat iemand niet terug kan met de code.</p>
        </Blok>

        {eigenaar && (
          <Blok titel="Community opheffen">
            <p className="px-1 text-[15px] text-rustig">Alle kanalen en berichten verdwijnen voor iedereen. Dit kan niet terug.
              Typ de naam <b>{c.naam}</b> om te bevestigen.</p>
            <div className="flex gap-2">
              <input value={zeker} onChange={(e) => setZeker(e.target.value)} aria-label="Naam ter bevestiging" className={veld} />
              <button disabled={zeker.trim() !== c.naam} className="h-12 shrink-0 rounded-2xl bg-red-600 px-5 font-medium text-white disabled:opacity-30"
                onClick={async () => {
                  try { await communityInstellen(c.id, { opheffen: true }); opgeheven(); } catch (e) { setFout(foutVan(e)); }
                }}>Opheffen</button>
            </div>
          </Blok>
        )}
      </div>
      <p aria-live="polite" className={`mt-6 h-5 text-center text-sm ${fout ? "text-red-600 dark:text-red-400" : "text-rustig"}`}>{fout || melding}</p>
    </div>
  );
}

function KanaalRij({ naam, alleenBeheer, laatste, bewaar }: { naam: string; alleenBeheer: boolean; laatste: boolean;
  bewaar: (p: { titel?: string; alleen_beheer?: boolean; weg?: boolean }) => void }) {
  const [open, setOpen] = useState(false);
  const [titel, setTitel] = useState(naam);
  return (
    <li className="flex flex-col gap-2 px-4 py-3">
      <button className="flex items-center gap-3 text-left" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="text-rustig">#</span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-medium">{naam}</span>
          <span className="text-[13px] text-rustig">{alleenBeheer ? "Alleen beheerders schrijven" : "Iedereen schrijft"}</span>
        </span>
        <span className="text-sm text-rustig">{open ? "Klaar" : "Wijzig"}</span>
      </button>
      {open && (
        <div className="flex flex-col gap-2 pt-1">
          <div className="flex gap-2">
            <input value={titel} onChange={(e) => setTitel(e.target.value)} maxLength={40} aria-label="Naam van het kanaal"
              className="h-11 min-w-0 flex-1 rounded-xl bg-white px-3 outline-none dark:bg-black/30" />
            <button disabled={!titel.trim() || titel === naam} onClick={() => bewaar({ titel })}
              className="h-11 rounded-xl bg-accent px-4 text-sm font-medium text-white disabled:opacity-30">Bewaar</button>
          </div>
          <label className="flex items-center gap-3 text-[15px]">
            <input type="checkbox" checked={alleenBeheer} onChange={(e) => bewaar({ alleen_beheer: e.target.checked })}
              className="size-5 accent-[var(--color-accent)]" />
            Alleen beheerders schrijven
          </label>
          {!laatste && (
            <button onClick={() => bewaar({ weg: true })} className="self-start text-sm text-red-600 dark:text-red-400">Kanaal verwijderen</button>
          )}
        </div>
      )}
    </li>
  );
}

function LidRij({ d, eigenaar, doe }: { d: Deelnemer; eigenaar: boolean; doe: (actie: LidActie) => void }) {
  const [open, setOpen] = useState(false);
  // Een beheerder kan alleen gewone leden beheren; de eigenaar ook beheerders. De server controleert dat ook.
  const mag = d.rol === "lid" || (d.rol === "beheerder" && eigenaar);
  const acties: [LidActie, string][] = [
    ...(d.rol === "lid" ? [["beheerder", "Beheerder maken"]] as [LidActie, string][] : []),
    ...(d.rol === "beheerder" ? [["lid", "Gewoon lid maken"]] as [LidActie, string][] : []),
    ...(eigenaar && d.status === "lid" ? [["eigenaar", "Eigenaar maken"]] as [LidActie, string][] : []),
    ["verwijderen", "Verwijderen"],
    ["weren", "Weren"],
  ];
  return (
    <li className="flex flex-col gap-2 px-4 py-2.5">
      <div className="flex items-center gap-3">
        <Rondje naam={d.naam} id={d.id} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-medium">{d.naam}</span>
          <span className="text-[13px] text-rustig">
            {d.rol === "eigenaar" ? "Eigenaar" : d.rol === "beheerder" ? "Beheerder" : "Lid"}{d.status === "uitgenodigd" ? " · uitgenodigd" : ""}
          </span>
        </span>
        {mag && <button className="h-9 rounded-full px-3 text-sm text-rustig" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? "Klaar" : "Wijzig"}</button>}
      </div>
      {open && mag && (
        <div className="flex flex-wrap gap-2 pb-1">
          {acties.map(([actie, label]) => (
            <button key={actie} onClick={() => { setOpen(false); doe(actie); }}
              className={`h-9 rounded-full bg-white px-3 text-sm font-medium dark:bg-black/30 ${actie === "verwijderen" || actie === "weren" ? "text-red-600 dark:text-red-400" : ""}`}>
              {label}
            </button>
          ))}
        </div>
      )}
    </li>
  );
}

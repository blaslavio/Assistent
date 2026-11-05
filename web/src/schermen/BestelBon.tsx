// De bevestiging van één bestelling: waar je het ophaalt, hoe het ervoor staat en wat je betaalde.
// Alleen echte gegevens: staat iets niet bij de bestelling of de winkel, dan laten we het weg.
import { useEffect, useState } from "react";
import { rpc } from "../api";
import { Kruis } from "../iconen";
import { routeLink } from "../lib/kaart";
import { stand, type Bestelling } from "../lib/bestellingen";
import { bedragTekst } from "./BetaalBevestiging";
import { statusToon } from "./BestelStatus";
import { PlekKaart } from "./PlekKaart";

type Plek = { naam: string; winkeladres?: string; lat: number; lon: number };
type RuweWinkel = { naam?: string; verkoper?: string; winkeladres?: string; lat?: number | null; lon?: number | null };

/** De winkel van de verkoper, alleen als die naam precies één open winkel met een vestiging oplevert. */
export function plekVan(winkels: RuweWinkel[], verkoper: string): Plek | null {
  const passend = winkels.filter((w) => w.verkoper === verkoper && w.lat != null && w.lon != null);
  if (passend.length !== 1) return null;
  const w = passend[0];
  return { naam: w.naam || verkoper, winkeladres: w.winkeladres || undefined, lat: Number(w.lat), lon: Number(w.lon) };
}

const STAPPEN = ["aangevraagd", "geaccepteerd", "betaald", "geleverd", "afgerond"];
/** Hoe ver de bestelling is, van 0 tot 1, voor het ringetje. */
export function voortgang(status: string) {
  const i = STAPPEN.indexOf(status);
  return i < 0 ? 1 : (i + 1) / STAPPEN.length;
}

const PIL: Record<string, string> = {
  wacht: "bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-100",
  actie: "bg-accent/10 text-accent",
  ok: "bg-sky-100 text-sky-900 dark:bg-sky-500/15 dark:text-sky-100",
  fout: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-200",
  klaar: "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/15 dark:text-emerald-100",
};

export function BestelBon({ b, sluit }: { b: Bestelling; sluit: () => void }) {
  const [plek, setPlek] = useState<Plek | null>(null);
  const koper = b.rol === "koper";
  useEffect(() => {
    if (!koper || !b.webshop) return;
    let weg = false;
    rpc<RuweWinkel[]>("winkels_zoeken", { p_zoekterm: "" })
      .then((w) => { if (!weg && Array.isArray(w)) setPlek(plekVan(w, b.ander)); })
      .catch(() => {});
    return () => { weg = true; };
  }, [koper, b.webshop, b.ander]);
  useEffect(() => {
    const toets = (e: KeyboardEvent) => { if (e.key === "Escape") sluit(); };
    addEventListener("keydown", toets);
    return () => removeEventListener("keydown", toets);
  }, [sluit]);

  const s = statusToon(b);
  const kosten = koper ? Number(b.kosten ?? 0) : 0;
  const verzend = Number(b.verzendkosten ?? 0);
  const totaal = b.bedrag + kosten;
  const regels = b.regels?.length ? b.regels : [{ titel: b.titel, aantal: b.aantal ?? 1, prijs: null }];
  const somRegels = regels.every((x) => x.prijs != null) ? regels.reduce((t, x) => t + Number(x.prijs) * x.aantal, 0) : null;
  const korting = somRegels != null && somRegels - (b.bedrag - verzend) > 0.005 ? somRegels - (b.bedrag - verzend) : 0;
  const ophalen = /afha+l|ophalen/i.test(b.levering ?? "");
  const nummer = String(b.id).padStart(6, "0").replace(/(\d{3})(?=\d)/g, "$1-");
  const datum = b.aangemaakt ? new Date(b.aangemaakt).toLocaleString("nl-NL", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) : "";
  const r = 26, omtrek = 2 * Math.PI * r;

  return (
    <div role="dialog" aria-modal="true" aria-label={`Bestelling ${nummer}`} className="fixed inset-0 z-50 overflow-y-auto bg-[#f3f4f6] dark:bg-[#0f0f12]">
      <div className="relative">
        {plek
          ? <PlekKaart lat={plek.lat} lon={plek.lon} titel={ophalen ? "Afhaaladres" : plek.naam} regels={plek.winkeladres ? plek.winkeladres.split(/,\s*/) : [plek.naam]} hoogte={260} />
          : <div className="h-36 bg-gradient-to-br from-[color-mix(in_oklab,var(--color-accent)_55%,white)] to-accent" />}
        <button type="button" onClick={sluit} aria-label="Sluiten"
          className="absolute top-[max(env(safe-area-inset-top),12px)] left-4 flex size-10 items-center justify-center rounded-full bg-white/90 shadow-md ring-1 ring-black/5 backdrop-blur dark:bg-[#1c1c21]/90">
          <Kruis className="size-5" />
        </button>
      </div>

      <div className="relative mx-4 -mt-8 mb-8 flex flex-col gap-5 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-black/5 dark:bg-[#1c1c21] dark:ring-white/10">
        <div className="flex items-center gap-3 rounded-2xl border border-lijn p-3">
          <span className="relative flex size-14 shrink-0 items-center justify-center">
            <svg aria-hidden="true" viewBox="0 0 60 60" className="absolute inset-0 size-14 -rotate-90">
              <circle cx="30" cy="30" r={r} fill="none" stroke="currentColor" strokeWidth="3" className="text-lijn" />
              <circle cx="30" cy="30" r={r} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="text-accent"
                strokeDasharray={omtrek} strokeDashoffset={omtrek * (1 - voortgang(b.status))} />
            </svg>
            <span className="text-[13px] font-semibold tabular-nums">{Math.round(voortgang(b.status) * STAPPEN.length)}/{STAPPEN.length}</span>
          </span>
          <p role="status" className={`flex min-h-12 flex-1 items-center justify-center rounded-xl px-3 text-center text-[15px] font-semibold ${PIL[s.toon]}`}>{s.label}</p>
        </div>

        <div className="text-center">
          <h2 className="text-xl font-bold tracking-tight">{koper ? "Bedankt voor je bestelling!" : `Bestelling van ${b.ander}`}</h2>
          <p className="mt-1 text-sm text-rustig">Bestelnummer {nummer}{datum ? ` · ${datum}` : ""}</p>
        </div>

        <div className="flex items-center gap-3 border-t border-lijn pt-5">
          <div className="min-w-0 flex-1">
            <p className="text-lg font-bold">{plek?.naam ?? b.ander}</p>
            <p className="text-sm text-rustig">{plek?.winkeladres ?? (koper ? "Verkoper" : "Koper")}{b.levering ? ` · ${b.levering}` : ""}</p>
          </div>
          {plek && (
            <a href={routeLink({ lat: plek.lat, lon: plek.lon, naam: plek.naam })} target="_blank" rel="noreferrer" aria-label={`Route naar ${plek.naam}`}
              className="flex size-12 shrink-0 items-center justify-center rounded-full border border-lijn">
              <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M3 11 21 3l-8 18-2-8z" /></svg>
            </a>
          )}
        </div>

        <ul aria-label="Producten" className="flex flex-col gap-3">
          {regels.map((x, i) => (
            <li key={i} className="flex items-baseline gap-3 font-semibold">
              <span className="w-8 shrink-0 tabular-nums">{x.aantal}×</span>
              <span className="min-w-0 flex-1">{x.titel}</span>
              {x.prijs != null && <span className="shrink-0 tabular-nums">{bedragTekst(Number(x.prijs) * x.aantal)}</span>}
            </li>
          ))}
        </ul>

        <dl className="flex flex-col gap-1.5 text-[15px]">
          <div className="flex justify-between"><dt className="font-medium">Subtotaal</dt><dd className="tabular-nums">{bedragTekst(b.bedrag - verzend + korting)}</dd></div>
          {korting > 0 && <div className="flex justify-between"><dt className="font-medium">Korting</dt><dd className="tabular-nums">-{bedragTekst(korting)}</dd></div>}
          {verzend > 0 && <div className="flex justify-between"><dt className="font-medium">Verzending</dt><dd className="tabular-nums">{bedragTekst(verzend)}</dd></div>}
          {kosten > 0 && <div className="flex justify-between"><dt className="font-medium">Servicekosten</dt><dd className="tabular-nums">{bedragTekst(kosten)}</dd></div>}
          <div className="mt-2 flex justify-between text-lg"><dt className="font-bold">Totaal</dt><dd className="font-bold tabular-nums">{bedragTekst(totaal)}</dd></div>
        </dl>

        <p className="border-t border-lijn pt-4 text-[13px] text-rustig">{stand(b)}{b.track_code ? ` · ${b.vervoerder ?? ""} ${b.track_code}` : ""}</p>
      </div>
    </div>
  );
}

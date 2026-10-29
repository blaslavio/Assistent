// Community's opruimen zonder iets kwijt te raken. Vier keuzes, van licht naar zwaar:
// voor jezelf bewaren, een herinnering maken voor iedereen, tijdelijk maken (met een einde), of verlaten / verwijderen.
// Een tijdelijke community koppel je het liefst aan een afspraak: dan eindigt hij vanzelf een dag na de activiteit.
import { useMemo, useState } from "react";
import type { Afspraak } from "../api";
import { Kalender, Klok, Prullenbak, Ster } from "../iconen";
import { communityAntwoorden, communityBewaren, communityHerinnering, communityInstellen, communityTijdelijk,
  type Community } from "../lib/chat";
import { DAGEN, datumTekst, plusDagen } from "../lib/tijd";
import { Onderblad } from "./Onderblad";

const foutVan = (e: unknown) => (e instanceof Error && e.message ? e.message : "Dat lukte niet.");

export function wanneer(iso: string) {
  const d = new Date(iso);
  return `${DAGEN[d.getDay()].slice(0, 2)} ${d.getDate()}/${d.getMonth() + 1} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Eén regel onder de naam: tijdelijk tot, of herinnering sinds. */
export function opruimTekst(c: Community) {
  if (c.herinnering) return `Herinnering${c.herinnering_sinds ? ` sinds ${new Date(c.herinnering_sinds).toLocaleDateString("nl-NL", { day: "numeric", month: "short" })}` : ""}`;
  if (c.bewaard) return "Bewaard";
  if (c.eindigt) return `Tot ${wanneer(c.eindigt)}, daarna ${c.na_afloop === "opheffen" ? "weg" : "herinnering"}`;
  return "";
}

type Einde = { eindigt: Date; naAfloop: "herinnering" | "opheffen" };

/** Kies wanneer een tijdelijke community eindigt: na een afspraak, over een week, of een eigen datum. */
export function EindeKiezen({ afspraken, eigenaar, kies }: { afspraken: Afspraak[]; eigenaar: boolean;
  kies: (e: Einde | null) => void }) {
  const [gekozen, setGekozen] = useState<string>("");
  const [datum, setDatum] = useState(datumTekst(plusDagen(new Date(), 7)));
  const [na, setNa] = useState<"herinnering" | "opheffen">("herinnering");
  const nu = new Date().toISOString().slice(0, 16);
  const komend = useMemo(() => {
    const gezien = new Set<string>();
    return afspraken.filter((a) => a.start >= nu.slice(0, 10)).sort((x, y) => x.start.localeCompare(y.start))
      .filter((a) => { const k = `${a.titel}|${a.start}`; if (gezien.has(k)) return false; gezien.add(k); return true; }).slice(0, 5);
  }, [afspraken, nu]);

  // Een dag na de activiteit, zodat iedereen nog foto's kan delen.
  const einde = (): Date | null => {
    if (gekozen.startsWith("a:")) {
      const a = komend.find((x) => String(x.id) === gekozen.slice(2));
      if (!a) return null;
      const slot = new Date((a.einde || a.start).length > 10 ? (a.einde || a.start) : `${a.einde || a.start}T23:00`);
      return plusDagen(slot, 1);
    }
    if (gekozen === "datum") return new Date(`${datum}T23:59`);
    return null;
  };
  const e = einde();

  return (
    <div className="flex flex-col gap-3">
      <span className="text-sm text-rustig">Wanneer is het klaar?</span>
      <div className="flex flex-col gap-1.5">
        {komend.map((a) => (
          <button key={a.id} onClick={() => setGekozen(`a:${a.id}`)} aria-pressed={gekozen === `a:${a.id}`}
            className={`flex items-center gap-3 rounded-2xl border px-3 py-2.5 text-left ${gekozen === `a:${a.id}` ? "border-accent bg-accent/5" : "border-lijn"}`}>
            <Kalender className="size-[18px] shrink-0 text-accent" />
            <span className="flex min-w-0 flex-col">
              <span className="truncate font-medium">Na {a.titel}</span>
              <span className="text-[13px] text-rustig">{a.start.length > 10 ? wanneer(a.start) : a.start} · eindigt een dag later</span>
            </span>
          </button>
        ))}
        <button onClick={() => setGekozen("datum")} aria-pressed={gekozen === "datum"}
          className={`flex items-center gap-3 rounded-2xl border px-3 py-2.5 text-left ${gekozen === "datum" ? "border-accent bg-accent/5" : "border-lijn"}`}>
          <Klok className="size-[18px] shrink-0 text-accent" />
          <span className="font-medium">Op een datum</span>
          {gekozen === "datum" && (
            <input type="date" value={datum} min={datumTekst(new Date())} onChange={(x) => setDatum(x.target.value)}
              onClick={(x) => x.stopPropagation()} aria-label="Einddatum" className="ml-auto rounded-lg bg-vlak px-2 py-1 text-sm" />
          )}
        </button>
      </div>
      <span className="text-sm text-rustig">En daarna?</span>
      <div className="grid grid-cols-2 gap-1 rounded-full bg-vlak p-1">
        {([["herinnering", "Herinnering"], ["opheffen", "Verwijderen"]] as const).filter(([k]) => eigenaar || k === "herinnering").map(([k, t]) => (
          <button key={k} onClick={() => setNa(k)} aria-pressed={na === k}
            className={`h-9 rounded-full text-sm font-medium ${na === k ? "bg-white shadow-sm dark:bg-[#2a2a30]" : "text-rustig"}`}>{t}</button>
        ))}
      </div>
      <p className="text-[13px] text-rustig">{na === "herinnering"
        ? "Iedereen kan alles blijven teruglezen, maar niemand schrijft er nog in."
        : "De community en alle berichten verdwijnen voor iedereen."}</p>
      <button disabled={!e} onClick={() => e && kies({ eindigt: e, naAfloop: na })}
        className="h-12 rounded-2xl bg-accent font-medium text-white disabled:opacity-30">
        {e ? `Tijdelijk tot ${wanneer(e.toISOString())}` : "Kies een moment"}
      </button>
    </div>
  );
}

/** De opties achter de drie puntjes bij een community. */
export function OpruimBlad({ c, afspraken, sluit, klaar }: { c: Community; afspraken: Afspraak[]; sluit: () => void;
  klaar: (weg: boolean) => void }) {
  const [stap, setStap] = useState<"menu" | "tijdelijk" | "weg">("menu");
  const [fout, setFout] = useState("");
  const [bezig, setBezig] = useState(false);
  const eigenaar = c.rol === "eigenaar";
  const beheer = eigenaar || c.rol === "beheerder";

  async function doe(f: () => Promise<unknown>, weg = false) {
    setBezig(true);
    setFout("");
    try {
      await f();
      klaar(weg);
    } catch (e) {
      setFout(foutVan(e));
    } finally {
      setBezig(false);
    }
  }

  const optie = (titel: string, uitleg: string, Icoon: typeof Ster, actie: () => void, rood = false) => (
    <button onClick={actie} disabled={bezig} className="flex items-center gap-3 rounded-2xl px-1 py-2 text-left disabled:opacity-50">
      <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${rood ? "bg-red-500/10 text-red-600 dark:text-red-400" : "bg-vlak text-accent"}`}>
        <Icoon className="size-5" />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className={`font-medium ${rood ? "text-red-600 dark:text-red-400" : ""}`}>{titel}</span>
        <span className="text-[13px] text-rustig">{uitleg}</span>
      </span>
    </button>
  );

  return (
    <Onderblad titel={stap === "tijdelijk" ? "Tijdelijk maken" : stap === "weg" ? (eigenaar ? "Verwijderen?" : "Verlaten?") : c.naam} sluit={sluit}>
      {stap === "menu" && (
        <div className="flex flex-col gap-1">
          {c.bewaard
            ? optie("Terugzetten", "Weer bij je community's", Ster, () => doe(() => communityBewaren(c.id, false)))
            : !c.herinnering && optie("Bewaren", "Uit je lijst, alles blijft. Alleen voor jou.", Ster, () => doe(() => communityBewaren(c.id, true)))}
          {eigenaar && (c.herinnering
            ? optie("Weer openen", "Iedereen kan weer schrijven", Kalender, () => doe(() => communityHerinnering(c.id, false)))
            : optie("Herinnering maken", "Voor iedereen alleen nog teruglezen", Kalender, () => doe(() => communityHerinnering(c.id, true))))}
          {beheer && !c.herinnering && (c.eindigt
            ? optie("Niet meer tijdelijk", `Nu: ${opruimTekst(c)}`, Klok, () => doe(() => communityTijdelijk(c.id, null, "herinnering")))
            : optie("Tijdelijk maken", "Eindigt vanzelf na een activiteit", Klok, () => setStap("tijdelijk")))}
          {optie(eigenaar ? "Verwijderen" : "Verlaten", eigenaar ? "Voor iedereen, met alle berichten" : "Je kunt terug met een code",
            Prullenbak, () => setStap("weg"), true)}
        </div>
      )}
      {stap === "tijdelijk" && (
        <EindeKiezen afspraken={afspraken} eigenaar={eigenaar}
          kies={(e) => e && doe(() => communityTijdelijk(c.id, e.eindigt, e.naAfloop))} />
      )}
      {stap === "weg" && (
        <>
          <p className="text-rustig">{eigenaar
            ? `${c.naam} verdwijnt voor alle ${c.leden} leden, met alle berichten. Liever bewaren? Maak er een herinnering van.`
            : `Je verlaat ${c.naam}. De anderen gaan gewoon door.`}</p>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setStap("menu")} className="h-12 rounded-2xl bg-vlak font-medium">Toch niet</button>
            <button disabled={bezig} onClick={() => doe(() => eigenaar ? communityInstellen(c.id, { opheffen: true }) : communityAntwoorden(c.id, "verlaten"), true)}
              className="h-12 rounded-2xl bg-red-600 font-medium text-white disabled:opacity-50">{eigenaar ? "Verwijderen" : "Verlaten"}</button>
          </div>
          {eigenaar && !c.herinnering && (
            <button onClick={() => doe(() => communityHerinnering(c.id, true))} className="h-11 rounded-2xl font-medium text-accent">
              Maak er een herinnering van
            </button>
          )}
        </>
      )}
      {fout && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{fout}</p>}
    </Onderblad>
  );
}

import ProjectRegie from "./ProjectRegie";
import ProjectArchief from "./ProjectArchief";
import ProjectArchiefCatalogus from "./ProjectArchiefCatalogus";
import type { Staat } from "../App";
import type { Bron } from "../lib/projectregie";
import type { Lid } from "../lib/chat";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { bestandDelen, bestandMaken, MAX_TEKST, projectLezen, werkruimte, type Werkbestand } from "../lib/project";
import type { Regel } from "../lib/chat";
import { huidigeSessie } from "../api";

export default function ProjectWerkruimte({ gesprek, regels, schrijven, verdwijnend, beginOpen = false, ik, leden = [], vernieuw = async () => {}, staat, setData, aiMogelijk = false }: {
  gesprek: number; regels: Regel[]; schrijven: boolean; verdwijnend: boolean; beginOpen?: boolean; ik?: number; leden?: Lid[]; vernieuw?: () => Promise<void>; staat?: Staat; setData?: (data: Staat["data"]) => void; aiMogelijk?: boolean;
}) {
  const [open, setOpen] = useState(beginOpen);
  useEffect(() => { if (beginOpen) setOpen(true); }, [beginOpen]);
  const [gekozen, kies] = useState("");
  const [bronVoorstel, setBronVoorstel] = useState<Bron | null>(null);
  const [aanwijzing, setAanwijzing] = useState<string | null>(null);
  const [titel, setTitel] = useState("");
  const [fout, setFout] = useState("");
  const [, tik] = useState(0);
  const r = werkruimte(gesprek);
  const actief = r.bestanden.get(gekozen);
  const laden = useRef(false);
  useEffect(() => {
    const bron = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (d?.gesprek !== gesprek || !Number.isSafeInteger(d?.id) || !regels.some(r => r.id === d.id && !r.weg && !r.fout && r.bericht?.t === "tekst")) return;
      setOpen(true); setBronVoorstel({ soort: "bericht", id: d.id });
    };
    window.addEventListener("assistent-projectbron", bron);
    return () => window.removeEventListener("assistent-projectbron", bron);
  }, [gesprek, regels]);
  function bronOpenen(bron: Bron) {
    if (bron.soort === "eigen") { setFout("Deze bron is eigen inbreng van de bevestigende deelnemer."); return; }
    if (bron.soort === "bericht") {
      const element = document.getElementById(`chat-bericht-${bron.id}`);
      if (element) { element.scrollIntoView({ block: "center", behavior: "smooth" }); element.focus(); }
      else setFout("Dit bronbericht is niet geladen of is verwijderd.");
      return;
    }
    const b = r.bestanden.get(bron.id);
    if (!b || !b.inhoud.includes(bron.citaat)) { setFout("De aangewezen tekst is gewijzigd of ontbreekt."); return; }
    kies(bron.id); setAanwijzing(bron.citaat);
  }


  useEffect(() => { projectLezen(gesprek, regels); tik(n => n + 1); }, [gesprek, regels]);
  useEffect(() => {
    const stop = [...r.bestanden.values()].map(b => b.volgen(() => tik(n => n + 1)));
    return () => stop.forEach(f => f());
  }, [r, r.bestanden.size]);
  useEffect(() => {
    if (!schrijven || verdwijnend) return;
    const timer = setInterval(async () => {
      if (laden.current || document.visibilityState !== "visible") return;
      laden.current = true;
      try {
        // Houd ruimte over binnen de bestaande chatlimiet van 600 berichten/uur.
        if (Date.now() - r.laatstPoging < 10_000) return;
        const b = [...r.bestanden.values()].filter(b => b.wacht && !b.fout && !b.bezig)
          .sort((a, b) => a.laatstVerstuurd - b.laatstVerstuurd)[0];
        if (b) await bestandDelen(gesprek, b);
      } catch { setFout("Delen lukte niet. Download je eigen kopie en controleer je verbinding."); }
      finally { laden.current = false; }
    }, 1500);
    return () => clearInterval(timer);
  }, [gesprek, r, schrijven, verdwijnend]);

  function maak(e: FormEvent) {
    e.preventDefault();
    try { const b = bestandMaken(gesprek, titel); kies(b.id); setTitel(""); setFout(""); tik(n => n + 1); }
    catch (e) { setFout(e instanceof Error ? e.message : "Een bestand maken lukte niet."); }
  }

  return <section className="mx-4 mt-3 rounded-2xl border border-lijn p-4" aria-label="Samen aan project werken">
    <button onClick={() => setOpen(!open)} aria-expanded={open} className="min-h-11 w-full text-left font-semibold">
      Projectwerkruimte · {r.bestanden.size} bestanden
    </button>
    {open && <div className="flex flex-col gap-3">
      <p className="text-sm text-rustig">Werk met de deelnemers aan dezelfde tekst of Markdown. Wijzigingen worden versleuteld gedeeld en automatisch samengevoegd, normaal binnen circa 12 seconden. AI leest niet automatisch mee.</p>
      <p className="text-sm text-rustig">Alleen apparaten die de bijbehorende chatberichten kunnen ontsleutelen, kunnen deze bestanden openen. Download een eigen kopie als back-up.</p>
      {verdwijnend && <p role="alert">Zet verdwijnende berichten uit voordat je samenwerkt. Oude verlopen of verwijderde projectberichten kunnen ontbrekende inhoud veroorzaken.</p>}
      {(fout || r.fout) && <p role="alert">{fout || r.fout}</p>}
      <label>Projectbestand
        <select value={gekozen} onChange={e => kies(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl bg-vlak p-2">
          <option value="">Kies een bestand</option>
          {[...r.bestanden.values()].map(b => <option key={b.id} value={b.id}>{b.titel}{b.wacht ? " · nog delen" : ""}</option>)}
        </select>
      </label>
      {schrijven && !verdwijnend && <>
        <form onSubmit={maak} className="flex flex-wrap gap-2">
          <input aria-label="Naam nieuw projectbestand" value={titel} onChange={e => setTitel(e.target.value)} maxLength={100}
            placeholder="Bijvoorbeeld projectplan.md" className="min-h-11 min-w-0 flex-1 rounded-xl bg-vlak px-3" />
          <button disabled={!titel.trim()} className="min-h-11 rounded-xl bg-accent px-4 text-white disabled:opacity-50">Bestand maken en delen</button>
        </form>
        <label className="text-sm">Importeer en deel een eigen .txt- of .md-bestand met dit gesprek (maximaal 50.000 tekens)
          <input type="file" accept=".txt,.md,text/plain,text/markdown" className="mt-2 block max-w-full" onChange={async e => {
            const file = e.target.files?.[0]; e.target.value = "";
            if (!file) return;
            const sessie = huidigeSessie();
            try {
              if (!/\.(txt|md)$/i.test(file.name) || file.size > MAX_TEKST * 4) throw new Error("Gebruik een klein .txt- of .md-bestand.");
              const inhoud = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
              if (sessie !== huidigeSessie()) return;
              const b = bestandMaken(gesprek, file.name, inhoud); kies(b.id); tik(n => n + 1);
            } catch { setFout("Dit bestand kon niet worden geïmporteerd. Gebruik geldige UTF-8-tekst van maximaal 50.000 tekens."); }
          }} />
        </label>
      </>}
      {actief && <BestandEditor key={"editor-" + actief.id} bestand={actief} schrijven={schrijven && !verdwijnend}
        opnieuw={() => bestandDelen(gesprek, actief).catch(() => setFout("Delen is niet bevestigd."))}
        aanwijzing={aanwijzing} wijsAan={citaat => { setBronVoorstel({ soort: "bestand", id: actief.id, citaat }); setAanwijzing(null); }} />}
      {actief && <ProjectArchief key={"archief-" + actief.id} gesprek={gesprek} bestand={actief} leden={leden} auteurs={regels.filter(r => !r.weg && !r.fout && r.bericht?.t === "project" && r.bericht.bestand === actief.id).map(r => r.afzender)} schrijven={schrijven && !verdwijnend} />}
      <ProjectArchiefCatalogus gesprek={gesprek} schrijven={schrijven && !verdwijnend} geopend={id => { kies(id); tik(n => n + 1); }} />
      {ik && <ProjectRegie gesprek={gesprek} ik={ik} leden={leden} regels={regels} bestanden={r.bestanden}
        schrijven={schrijven && !verdwijnend} aiMogelijk={aiMogelijk && schrijven && !verdwijnend} vernieuw={vernieuw}
        bronVoorstel={bronVoorstel} bronOpenen={bronOpenen} bestandOpenen={id => { if (r.bestanden.has(id)) { kies(id); setAanwijzing(null); } }} staat={staat} setData={setData} />}
      {!schrijven && <p className="text-sm text-rustig">Je kunt deze bestanden bekijken. Schrijven volgt dezelfde rechten als dit chatkanaal.</p>}
    </div>}
  </section>;
}

function BestandEditor({ bestand: b, schrijven, opnieuw, aanwijzing, wijsAan }: { bestand: Werkbestand; schrijven: boolean; opnieuw: () => void; aanwijzing?: string | null; wijsAan?: (citaat: string) => void }) {
  const veld = useRef<HTMLTextAreaElement>(null);
  const [selectieFout, setSelectieFout] = useState("");
  useEffect(() => {
    if (!aanwijzing || !veld.current) return;
    const van = b.inhoud.indexOf(aanwijzing);
    if (van < 0 || b.inhoud.indexOf(aanwijzing, van + 1) !== -1) { setSelectieFout("Deze tekst is gewijzigd of komt meerdere keren voor. Selecteer de bedoelde tekst opnieuw."); return; }
    veld.current.focus(); veld.current.setSelectionRange(van, van + aanwijzing.length);
  }, [aanwijzing, b]);
  const [, tik] = useState(0);
  const [compositie, setCompositie] = useState<{ tekst: string; basis: Uint8Array } | null>(null);
  // Een invoerevent hoort bij de tekst uit deze render, niet bij een mogelijk
  // al ontvangen wijziging die React nog niet op het scherm heeft gezet.
  const zichtbareBasis = b.invoerBasis();
  useEffect(() => b.volgen(() => tik(n => n + 1)), [b]);
  return <div className="flex flex-col gap-2">
    <label className="font-medium">{b.titel}
      <textarea ref={veld} value={compositie?.tekst ?? b.inhoud} readOnly={!schrijven} maxLength={MAX_TEKST} rows={12}
        className="mt-2 w-full resize-y rounded-xl border border-lijn bg-transparent p-3 font-mono text-sm"
        onCompositionStart={e => setCompositie({ tekst: e.currentTarget.value, basis: zichtbareBasis })}
        onCompositionEnd={e => { try { b.bewerk(e.currentTarget.value, compositie?.basis); } catch { b.fout = "Deze tekst is te groot of ongeldig."; b.meld(); } setCompositie(null); }}
        onChange={e => {
          if (compositie !== null) { setCompositie({ ...compositie, tekst: e.target.value }); return; }
          try { b.bewerk(e.target.value, zichtbareBasis); } catch { b.fout = "Deze tekst is te groot of ongeldig."; b.meld(); }
        }} />
    </label>
    <p role="status" className="text-sm text-rustig">{b.bezig ? "Versleuteld delen…" : b.wacht ? "Lokale wijzigingen wachten nog op bevestiging." : b.bevestigd ? "Delen bevestigd. Andere deelnemers krijgen de wijzigingen bij het ophalen van de chat." : "Nog niet gedeeld."}</p>
    {b.fout && <p role="alert">{b.fout}</p>}
    {selectieFout && <p role="alert">{selectieFout}</p>}
    <div className="flex flex-wrap gap-3">
      {schrijven && wijsAan && <button className="min-h-11 text-accent" onClick={() => {
        const v = veld.current; const citaat = v ? v.value.slice(v.selectionStart, v.selectionEnd) : "";
        if (!citaat.trim() || citaat.length > 500) { setSelectieFout("Selecteer eerst 1 tot 500 tekens om samen te bekijken."); return; }
        setSelectieFout(""); wijsAan(citaat);
      }}>Geselecteerde tekst samen aanwijzen</button>}
      {schrijven && b.wacht && <button disabled={b.bezig} onClick={opnieuw} className="min-h-11 font-medium text-accent">Nu delen / opnieuw proberen</button>}
      <button className="min-h-11 font-medium text-accent" onClick={() => {
        const url = URL.createObjectURL(new Blob([b.inhoud], { type: "text/plain;charset=utf-8" }));
        const a = document.createElement("a"); a.href = url; a.download = b.titel.replace(/[\\/:*?"<>|]/g, "_"); a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }}>Download eigen kopie</button>
    </div>
  </div>;
}

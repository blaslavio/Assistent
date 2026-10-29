// De onderdelen uit de vorige app: boodschappen, kooplijst, wenslijst, notities, documenten, budget en leren.
// Lijstjes staan in je gegevens (dezelfde plek als in de vorige app); documenten en uitgaven hebben eigen tabellen.
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { alsIk, bijwerken, instellingenBijwerken, type Gegevens } from "../api";
import { BankKoppeling } from "./Bank";
import { AfschriftFout, afschriftLezen, categorieRaden, decoderen, metSleutels } from "../lib/afschrift";
import type { Staat } from "../App";
import { mascotteZeg } from "../mascotte";
import { Bestand, Bewerk, Boek, Grafiek, Hart, Kruis, Lijstje, Plus, Prullenbak, Tas, Terug, Winkelpand } from "../iconen";
import { Beleggen } from "./Beleggen";
import { kop } from "./instellingen-ui";
import { Leren } from "./Leren";
import { Zakelijk } from "./Zakelijk";
import { Huishoudens } from "./Huishouden";

import { ONDERDELEN, type OnderdeelNaam } from "../lib/onderdeel-lijst";
export { ONDERDELEN, type OnderdeelNaam };

const foutVan = (e: unknown) => (e instanceof Error && e.message ? e.message : "Dat lukte niet. Probeer het opnieuw.");
const veld = "h-12 min-w-0 flex-1 rounded-2xl bg-vlak px-4 outline-none placeholder:text-zacht";
const knop = "flex h-12 shrink-0 items-center justify-center rounded-2xl bg-accent px-4 font-medium text-white disabled:opacity-30";

function Scherm({ titel, terug, terugNaam = "Instellingen", children, rechts }: { titel: string; terug: () => void; terugNaam?: string;
  children: ReactNode; rechts?: ReactNode }) {
  return (
    <div className="flex min-h-full flex-col px-6 pt-12 pb-10">
      <div className="flex items-center justify-between">
        <button onClick={terug} className="-ml-2 flex h-10 items-center gap-1 pr-3 text-rustig">
          <Terug className="size-5" /> {terugNaam}
        </button>
        {rechts}
      </div>
      <h1 className="mt-4 mb-6 text-[28px] font-bold tracking-tight">{titel}</h1>
      <div className="flex flex-col gap-6">{children}</div>
    </div>
  );
}

export function Onderdeel({ naam, staat, vernieuw, terug, terugNaam, vraag }: { naam: OnderdeelNaam; staat: Staat;
  vernieuw: () => Promise<void>; terug: () => void; terugNaam?: string; vraag: (tekst: string) => void }) {
  const titel = ONDERDELEN.find(([id]) => id === naam)![1];
  if (naam === "documenten") return <Documenten terug={terug} />;
  if (naam === "leren") return <Scherm titel={titel} terug={terug} terugNaam={terugNaam}><Leren staat={staat} vernieuw={vernieuw} vraag={vraag} /></Scherm>;
  if (naam === "budget") return <Scherm titel={titel} terug={terug} terugNaam={terugNaam}><Budget staat={staat} /></Scherm>;
  if (naam === "beleggen") return <Scherm titel={titel} terug={terug} terugNaam={terugNaam}><Beleggen staat={staat} vernieuw={vernieuw} vraag={vraag} /></Scherm>;
  if (naam === "huishouden") return <Scherm titel={titel} terug={terug} terugNaam={terugNaam}><Huishoudens /></Scherm>;
  if (naam === "zakelijk") return <Scherm titel={titel} terug={terug} terugNaam={terugNaam}><Zakelijk staat={staat} vernieuw={vernieuw} vraag={vraag} /></Scherm>;
  return <Scherm titel={titel} terug={terug} terugNaam={terugNaam}><Lijst naam={naam} data={staat.data} vernieuw={vernieuw} /></Scherm>;
}

// --- Lijstjes ------------------------------------------------------------------------------------------------------

type Item = { id: number; tekst?: string; naam_product?: string; titel?: string; prijs?: number | null; gekocht?: boolean };
const tekstVan = (i: Item) => i.tekst ?? i.naam_product ?? i.titel ?? "";

function Lijst({ naam, data, vernieuw }: { naam: Exclude<OnderdeelNaam, "documenten" | "budget" | "beleggen" | "leren" | "zakelijk" | "huishouden">; data: Gegevens;
  vernieuw: () => Promise<void> }) {
  const [invoer, setInvoer] = useState("");
  const [notitie, setNotitie] = useState<Item | null>(null);
  const [fout, setFout] = useState("");
  const items = (Array.isArray(data[naam]) ? data[naam] : []) as Item[];
  const notities = naam === "notities";
  const vinkbaar = !notities;

  async function wijzig(aanpassen: (lijst: Item[], g: Gegevens) => void) {
    setFout("");
    try {
      await bijwerken((g) => {
        if (!Array.isArray(g[naam])) g[naam] = [];
        aanpassen(g[naam] as Item[], g);
      });
      await vernieuw();
    } catch (e) {
      setFout(foutVan(e));
    }
  }

  function toevoegen(e: FormEvent) {
    e.preventDefault();
    const tekst = invoer.trim();
    if (!tekst) return;
    setInvoer("");
    wijzig((lijst, g) => {
      const nieuwId = () => { g.volgend_id = g.volgend_id ?? 1; return g.volgend_id++; };
      const vandaag = new Date().toISOString().slice(0, 10);
      if (naam === "boodschappen") {
        for (const t of tekst.split(/,|\n/).map((x) => x.trim()).filter(Boolean))
          if (!lijst.some((b) => !b.gekocht && tekstVan(b).toLowerCase() === t.toLowerCase()))
            lijst.push({ id: nieuwId(), tekst: t, gekocht: false });
      } else if (notities) lijst.push({ id: nieuwId(), titel: tekst.slice(0, 40), tekst, toegevoegd: vandaag } as Item);
      else lijst.push({ id: nieuwId(), naam_product: tekst, prijs: null, winkel: "", link: "", gekocht: false, toegevoegd: vandaag } as Item);
    });
  }

  if (notitie) return <Notitie item={notitie} terug={() => setNotitie(null)} bewaar={async (tekst) => {
    await wijzig((lijst) => { const i = lijst.find((x) => x.id === notitie.id); if (i) { i.tekst = tekst; i.titel = tekst.split("\n")[0].slice(0, 40) || "Notitie"; } });
    setNotitie(null);
  }} />;

  const open = items.filter((i) => !i.gekocht);
  const klaar = items.filter((i) => i.gekocht);
  return <>
    <form onSubmit={toevoegen} className="flex gap-2">
      <input value={invoer} onChange={(e) => setInvoer(e.target.value)} aria-label="Toevoegen" className={veld}
        placeholder={naam === "boodschappen" ? "Melk, brood, eieren" : notities ? "Nieuwe notitie" : "Wat wil je kopen?"} />
      <button disabled={!invoer.trim()} aria-label="Toevoegen" className={`${knop} w-12 px-0`}><Plus className="size-5" /></button>
    </form>
    {items.length === 0 && <p className="text-rustig">Nog niets op deze lijst.</p>}
    {open.length > 0 && (
      <ul className="flex flex-col divide-y divide-lijn rounded-2xl bg-vlak">
        {open.map((i) => (
          <li key={i.id} className="flex items-center gap-3 px-4 py-3">
            {vinkbaar && <input type="checkbox" aria-label={`${tekstVan(i)} afvinken`} className="size-[22px] shrink-0 accent-accent"
              onChange={() => {
                if (open.length === 1) mascotteZeg(naam === "boodschappen" ? "Alles in je mandje. Goed gedaan!" : "Alles afgevinkt!");
                wijzig((l) => { const x = l.find((y) => y.id === i.id); if (x) x.gekocht = true; });
              }} />}
            {notities ? (
              <button onClick={() => setNotitie(i)} className="flex min-w-0 flex-1 flex-col text-left">
                <span className="truncate font-medium">{i.titel || "Notitie"}</span>
                <span className="truncate text-sm text-rustig">{(i.tekst ?? "").replace(/\s+/g, " ")}</span>
              </button>
            ) : (
              <span className="min-w-0 flex-1">{tekstVan(i)}{i.prijs ? <span className="text-rustig"> · € {Number(i.prijs).toFixed(2).replace(".", ",")}</span> : null}</span>
            )}
            <button aria-label={`${tekstVan(i) || "Notitie"} weghalen`} className="flex size-9 items-center justify-center text-zacht"
              onClick={() => wijzig((l) => { const n = l.findIndex((y) => y.id === i.id); if (n >= 0) l.splice(n, 1); })}>
              <Kruis className="size-4" />
            </button>
          </li>
        ))}
      </ul>
    )}
    {klaar.length > 0 && (
      <section>
        <div className="flex items-center justify-between">
          <h2 className={kop}>{naam === "boodschappen" ? "Gekocht" : "Afgevinkt"}</h2>
          <button className="mb-2 text-sm text-rustig" onClick={() => wijzig((l) => { const rest = l.filter((x) => !x.gekocht); l.splice(0, l.length, ...rest); })}>
            Weghalen</button>
        </div>
        <ul className="flex flex-col divide-y divide-lijn rounded-2xl bg-vlak">
          {klaar.map((i) => (
            <li key={i.id} className="flex items-center gap-3 px-4 py-3">
              <input type="checkbox" checked aria-label={`${tekstVan(i)} terugzetten`} className="size-[22px] shrink-0 accent-accent"
                onChange={() => wijzig((l) => { const x = l.find((y) => y.id === i.id); if (x) x.gekocht = false; })} />
              <span className="min-w-0 flex-1 text-rustig line-through">{tekstVan(i)}</span>
            </li>
          ))}
        </ul>
      </section>
    )}
    {fout && <p className="text-sm text-red-600 dark:text-red-400">{fout}</p>}
  </>;
}

function Notitie({ item, terug, bewaar }: { item: Item; terug: () => void; bewaar: (tekst: string) => Promise<void> }) {
  const [tekst, setTekst] = useState(item.tekst ?? "");
  return <>
    <textarea value={tekst} onChange={(e) => setTekst(e.target.value)} rows={12} aria-label="Notitie"
      className="min-h-64 rounded-2xl bg-vlak px-4 py-3 outline-none" />
    <div className="flex gap-2">
      <button onClick={() => bewaar(tekst)} className={knop}>Bewaar</button>
      <button onClick={terug} className="h-12 rounded-2xl px-4 text-rustig">Annuleer</button>
    </div>
  </>;
}

// --- Documenten ----------------------------------------------------------------------------------------------------

type Doc = { id: number; titel: string; gewijzigd: string; fragment?: string; versie: number; weg?: boolean; html?: string };

// Alleen eenvoudige opmaak blijft over; scripts, stijlen en vreemde links verdwijnen.
const TOEGESTAAN = new Set(["P", "BR", "B", "STRONG", "I", "EM", "U", "S", "H1", "H2", "H3", "UL", "OL", "LI", "BLOCKQUOTE", "A", "IMG", "DIV", "SPAN", "PRE", "CODE"]);
export function veiligHtml(html: string): string {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const schoon = (el: Element) => {
    for (const kind of [...el.children]) {
      if (!TOEGESTAAN.has(kind.tagName)) {
        if (["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "SVG", "MATH", "TEMPLATE"].includes(kind.tagName)) kind.remove();
        else { schoon(kind); kind.replaceWith(...kind.childNodes); }
        continue;
      }
      for (const a of [...kind.attributes]) {
        const ok = (kind.tagName === "A" && a.name === "href" && /^(https?:|mailto:)/i.test(a.value))
          || (kind.tagName === "IMG" && a.name === "src" && /^(https:|data:image\/(png|jpe?g|gif|webp);)/i.test(a.value));
        if (!ok) kind.removeAttribute(a.name);
      }
      if (kind.tagName === "A") { kind.setAttribute("target", "_blank"); kind.setAttribute("rel", "noopener noreferrer"); }
      schoon(kind);
    }
  };
  const root = doc.body.firstElementChild!;
  schoon(root);
  return root.innerHTML;
}

function Documenten({ terug }: { terug: () => void }) {
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [prullenbak, setPrullenbak] = useState(false);
  const [open, setOpen] = useState<number | "nieuw" | null>(null);
  const [zoek, setZoek] = useState("");
  const [fout, setFout] = useState("");

  const laden = useCallback(() => alsIk<{ documenten: Doc[] }>("documenten_lijst", { p_zoek: zoek.trim(), p_prullenbak: prullenbak })
    .then((r) => setDocs(r.documenten ?? [])).catch((e) => setFout(foutVan(e))), [zoek, prullenbak]);
  useEffect(() => { const t = setTimeout(laden, 250); return () => clearTimeout(t); }, [laden]);

  if (open !== null) return <Editor id={open === "nieuw" ? null : open} terug={() => { setOpen(null); laden(); }} />;

  async function doe(functie: string, p: Record<string, unknown>) {
    try {
      const r = await alsIk<{ fout?: string }>(functie, p);
      if (r?.fout) setFout(r.fout);
      laden();
    } catch (e) { setFout(foutVan(e)); }
  }

  return (
    <Scherm titel={prullenbak ? "Prullenbak" : "Documenten"} terug={prullenbak ? () => setPrullenbak(false) : terug}
      rechts={!prullenbak && <button onClick={() => setOpen("nieuw")} className="flex h-10 items-center gap-1.5 rounded-full bg-accent px-4 text-sm font-medium text-white">
        <Plus className="size-4" /> Nieuw</button>}>
      <input value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder="Zoek in je documenten" aria-label="Zoeken" className={veld} />
      {docs === null ? <p className="text-rustig">Even laden…</p> : docs.length === 0 ? (
        <p className="text-rustig">{prullenbak ? "De prullenbak is leeg." : zoek ? "Niets gevonden." : "Nog geen documenten. Tik op Nieuw om te beginnen."}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-lijn rounded-2xl bg-vlak">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center gap-3 px-4 py-3">
              <button disabled={prullenbak} onClick={() => setOpen(d.id)} className="flex min-w-0 flex-1 flex-col text-left">
                <span className="truncate font-medium">{d.titel}</span>
                <span className="truncate text-sm text-rustig">{new Date(d.gewijzigd).toLocaleDateString("nl-NL", { day: "numeric", month: "short" })}{d.fragment ? ` · ${d.fragment}` : ""}</span>
              </button>
              {prullenbak ? <>
                <button className="h-9 rounded-full px-3 text-sm" onClick={() => doe("document_weg", { p_id: d.id, p_weg: false })}>Terugzetten</button>
                <button className="h-9 rounded-full px-3 text-sm text-red-600 dark:text-red-400" onClick={() => doe("document_wissen", { p_id: d.id })}>Wissen</button>
              </> : (
                <button aria-label={`${d.titel} naar de prullenbak`} className="flex size-9 items-center justify-center text-zacht"
                  onClick={() => doe("document_weg", { p_id: d.id, p_weg: true })}><Prullenbak className="size-4" /></button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!prullenbak && <button onClick={() => setPrullenbak(true)} className="self-start text-sm text-rustig">Prullenbak</button>}
      {fout && <p className="text-sm text-red-600 dark:text-red-400">{fout}</p>}
    </Scherm>
  );
}

const apparaat = () => (/iPhone/.test(navigator.userAgent) ? "iPhone" : /iPad/.test(navigator.userAgent) ? "iPad" : "Browser");

function Editor({ id, terug }: { id: number | null; terug: () => void }) {
  const [doc, setDoc] = useState<Doc | null>(null);
  const [titel, setTitel] = useState("");
  const [status, setStatus] = useState("");
  const vak = useRef<HTMLDivElement>(null);
  const versie = useRef<number | null>(null);
  const docId = useRef<number | null>(id);
  const gewijzigd = useRef(false);

  useEffect(() => {
    if (id === null) { setDoc({ id: 0, titel: "", gewijzigd: "", versie: 0 }); return; }
    alsIk<{ document?: Doc; fout?: string }>("document_lezen", { p_id: id }).then((r) => {
      if (r.fout || !r.document) { setStatus(r.fout ?? "Dit document bestaat niet (meer)."); return; }
      setDoc(r.document);
      setTitel(r.document.titel);
      versie.current = r.document.versie;
    }).catch((e) => setStatus(foutVan(e)));
  }, [id]);

  useEffect(() => {
    if (doc && vak.current) vak.current.innerHTML = veiligHtml(doc.html ?? "");
  }, [doc]);

  async function bewaren(): Promise<boolean> {
    if (!gewijzigd.current && docId.current !== null) return true;
    const html = veiligHtml(vak.current?.innerHTML ?? "");
    const tekst = vak.current?.innerText ?? "";
    if (docId.current === null && !tekst.trim() && !titel.trim()) return true;
    setStatus("Bewaren…");
    try {
      const r = await alsIk<{ document?: Doc; conflict?: boolean; fout?: string }>("document_opslaan", {
        p_id: docId.current, p_titel: titel.trim() || null, p_inhoud: null, p_html: html, p_tekst: tekst,
        p_versie: versie.current, p_apparaat: apparaat() });
      if (r.conflict) {
        setStatus("Dit document is ergens anders ook gewijzigd. Kopieer je tekst en open het opnieuw.");
        return false;
      }
      if (r.fout || !r.document) { setStatus(r.fout ?? "Bewaren lukte niet."); return false; }
      docId.current = r.document.id;
      versie.current = r.document.versie;
      gewijzigd.current = false;
      setStatus("Bewaard");
      return true;
    } catch (e) {
      setStatus(foutVan(e));
      return false;
    }
  }

  // Elke paar seconden vanzelf bewaren als er iets veranderd is.
  useEffect(() => {
    const t = setInterval(() => { if (gewijzigd.current) bewaren(); }, 4000);
    return () => clearInterval(t);
  });

  const opmaak = (opdracht: string, waarde?: string) => { document.execCommand(opdracht, false, waarde); gewijzigd.current = true; vak.current?.focus(); };

  return (
    <div className="flex min-h-full flex-col px-6 pt-12 pb-10">
      <div className="flex items-center justify-between">
        <button onClick={async () => { if (await bewaren()) terug(); }} className="-ml-2 flex h-10 items-center gap-1 pr-3 text-rustig">
          <Terug className="size-5" /> Documenten
        </button>
        <span aria-live="polite" className="text-sm text-rustig">{status}</span>
      </div>
      {!doc ? <p className="mt-6 text-rustig">{status || "Even laden…"}</p> : <>
        <input value={titel} onChange={(e) => { setTitel(e.target.value); gewijzigd.current = true; }} placeholder="Titel" aria-label="Titel"
          style={{ fontSize: 26 }} className="mt-4 bg-transparent font-bold tracking-tight outline-none placeholder:text-zacht" />
        <div className="sticky top-0 z-10 -mx-2 my-3 flex gap-1 overflow-x-auto bg-white py-1 dark:bg-[#0b0b0e]">
          {([["bold", "B", "font-bold"], ["italic", "I", "italic"], ["underline", "U", "underline"]] as const).map(([o, l, c]) => (
            <button key={o} onMouseDown={(e) => e.preventDefault()} onClick={() => opmaak(o)} className={`h-9 min-w-9 rounded-lg bg-vlak px-2 ${c}`}>{l}</button>
          ))}
          <button onMouseDown={(e) => e.preventDefault()} onClick={() => opmaak("formatBlock", "<h2>")} className="h-9 rounded-lg bg-vlak px-3 text-sm font-semibold">Kop</button>
          <button onMouseDown={(e) => e.preventDefault()} onClick={() => opmaak("formatBlock", "<p>")} className="h-9 rounded-lg bg-vlak px-3 text-sm">Tekst</button>
          <button onMouseDown={(e) => e.preventDefault()} onClick={() => opmaak("insertUnorderedList")} className="h-9 rounded-lg bg-vlak px-3 text-sm">Lijst</button>
        </div>
        <div ref={vak} contentEditable suppressContentEditableWarning role="textbox" aria-multiline aria-label="Tekst"
          onInput={() => { gewijzigd.current = true; setStatus(""); }} onBlur={() => bewaren()}
          className="document min-h-[50vh] flex-1 text-[17px] leading-relaxed outline-none" />
      </>}
    </div>
  );
}

// --- Budget --------------------------------------------------------------------------------------------------------

type Regel = { id: number; datum: string; bedrag: number; omschrijving: string; tegenpartij?: string; categorie: string };
const CATEGORIEEN = ["Boodschappen", "Eten en drinken", "Winkelen", "Vervoer", "Wonen", "Energie en water", "Verzekeringen",
  "Abonnementen", "Gezondheid", "Vrije tijd", "Kinderen", "Sparen en beleggen", "Overig"];
const euro = (n: number) => n.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const maandNaam = (m: string) => new Date(`${m}-01T12:00:00`).toLocaleDateString("nl-NL", { month: "long", year: "numeric" });

function Budget({ staat }: { staat: Staat }) {
  const [maand, setMaand] = useState(() => new Date().toISOString().slice(0, 7));
  const [regels, setRegels] = useState<Regel[] | null>(null);
  const [bedrag, setBedrag] = useState("");
  const [wat, setWat] = useState("");
  const [cat, setCat] = useState("Overig");
  const [fout, setFout] = useState("");
  const b = (staat.data.instellingen?.budget ?? {}) as { budgetten?: Record<string, number>; regels?: Record<string, string>; gebruikt?: boolean };
  const budgetten = b.budgetten ?? {};
  const bankRegels = useMemo(() => b.regels ?? {}, [b.regels]);
  const [inlezen, setInlezen] = useState("");

  // Een afschrift van je bank inlezen: het bestand wordt op je toestel gelezen, alleen de regels gaan naar je account.
  async function afschrift(bestand: File) {
    setFout("");
    setInlezen("Inlezen…");
    try {
      const regels = await metSleutels(afschriftLezen(decoderen(await bestand.arrayBuffer())));
      let nieuw = 0;
      for (let i = 0; i < regels.length; i += 1000) {
        const stuk = regels.slice(i, i + 1000).map((r) => ({ ...r, bron: "import",
          categorie: categorieRaden(r.tegenpartij, r.omschrijving, r.bedrag, b.regels ?? {}) }));
        const r = await alsIk<{ nieuw?: number; fout?: string }>("transacties_toevoegen", { p_regels: stuk });
        if (r.fout) throw new AfschriftFout(r.fout);
        nieuw += r.nieuw ?? 0;
      }
      if (!b.gebruikt) await instellingenBijwerken((i) => { i.budget = { ...((i.budget as object) ?? {}), gebruikt: true }; });
      const datums = regels.map((r) => r.datum).sort();
      setInlezen(`${regels.length} regels gelezen, ${nieuw} nieuw (${datums[0]} tot ${datums[datums.length - 1]}).`);
      setMaand(datums[datums.length - 1].slice(0, 7));
      laden();
    } catch (e) {
      setInlezen("");
      setFout(e instanceof AfschriftFout ? e.message : foutVan(e));
    }
  }

  async function categorie(r: Regel, cat: string) {
    try { await alsIk("transactie_bijwerken", { p_id: r.id, p_categorie: cat, p_omschrijving: null }); laden(); }
    catch (e) { setFout(foutVan(e)); }
  }

  const laden = useCallback(() => {
    const [j, m] = maand.split("-").map(Number);
    const eind = new Date(j, m, 0).getDate();
    return alsIk<{ transacties: Regel[] }>("transacties_lijst", { p_van: `${maand}-01`, p_tot: `${maand}-${String(eind).padStart(2, "0")}` })
      .then((r) => setRegels((r.transacties ?? []).map((x) => ({ ...x, bedrag: Number(x.bedrag) })))).catch((e) => setFout(foutVan(e)));
  }, [maand]);
  useEffect(() => { setRegels(null); laden(); }, [laden]);

  const verschuif = (n: number) => {
    const [j, m] = maand.split("-").map(Number);
    const d = new Date(j, m - 1 + n, 1);
    setMaand(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  async function toevoegen(e: FormEvent) {
    e.preventDefault();
    const b = Number(bedrag.replace(/[€\s.]/g, "").replace(",", ".")) || Number(bedrag.replace(",", "."));
    if (!b || !wat.trim()) return;
    setFout("");
    const sleutel = `hand:${Array.from(crypto.getRandomValues(new Uint8Array(12)), (x) => x.toString(16).padStart(2, "0")).join("")}`;
    try {
      const r = await alsIk<{ fout?: string }>("transacties_toevoegen", { p_regels: [{ datum: new Date().toISOString().slice(0, 10),
        bedrag: -Math.abs(Math.round(b * 100) / 100), omschrijving: wat.trim(), tegenpartij: "", rekening: "", bron: "hand", categorie: cat, sleutel }] });
      if (r?.fout) { setFout(r.fout); return; }
      setBedrag(""); setWat("");
      laden();
    } catch (e2) { setFout(foutVan(e2)); }
  }

  async function weg(id: number) {
    try { await alsIk("transactie_weg", { p_id: id }); laden(); } catch (e) { setFout(foutVan(e)); }
  }

  const uit = (regels ?? []).filter((r) => r.bedrag < 0 && r.categorie !== "Sparen en beleggen");
  const totaalUit = uit.reduce((s, r) => s - r.bedrag, 0);
  const totaalIn = (regels ?? []).filter((r) => r.bedrag > 0).reduce((s, r) => s + r.bedrag, 0);
  const perCat = new Map<string, number>();
  for (const r of uit) perCat.set(r.categorie || "Overig", (perCat.get(r.categorie || "Overig") ?? 0) - r.bedrag);
  for (const c of Object.keys(budgetten)) if (!perCat.has(c)) perCat.set(c, 0);
  const rijen = [...perCat].sort((a, b) => b[1] - a[1]);

  return <>
    <div className="flex items-center justify-between rounded-2xl bg-vlak p-1">
      <button onClick={() => verschuif(-1)} aria-label="Vorige maand" className="flex size-10 items-center justify-center"><Terug className="size-5" /></button>
      <span className="font-semibold capitalize">{maandNaam(maand)}</span>
      <button onClick={() => verschuif(1)} aria-label="Volgende maand" className="flex size-10 items-center justify-center"><Terug className="size-5 rotate-180" /></button>
    </div>
    <div className="grid grid-cols-2 gap-2">
      <div className="rounded-2xl bg-vlak p-4"><p className="text-sm text-rustig">Uitgegeven</p><p className="text-xl font-semibold">€ {euro(totaalUit)}</p></div>
      <div className="rounded-2xl bg-vlak p-4"><p className="text-sm text-rustig">Binnengekomen</p><p className="text-xl font-semibold">€ {euro(totaalIn)}</p></div>
    </div>

    <form onSubmit={toevoegen} className="flex flex-col gap-2">
      <h2 className={kop}>Uitgave toevoegen</h2>
      <div className="flex gap-2">
        <input value={bedrag} onChange={(e) => setBedrag(e.target.value)} inputMode="decimal" placeholder="€ 0,00" aria-label="Bedrag" className={`${veld} max-w-28 flex-none`} />
        <input value={wat} onChange={(e) => setWat(e.target.value)} placeholder="Waaraan?" aria-label="Omschrijving" className={veld} />
      </div>
      <div className="flex gap-2">
        <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Categorie" className={`${veld} appearance-none`}>
          {CATEGORIEEN.map((c) => <option key={c}>{c}</option>)}
        </select>
        <button disabled={!bedrag.trim() || !wat.trim()} className={knop}>Toevoegen</button>
      </div>
    </form>

    {rijen.length > 0 && (
      <section>
        <h2 className={kop}>Per categorie</h2>
        <ul className="flex flex-col gap-3 rounded-2xl bg-vlak p-4">
          {rijen.map(([c, b]) => {
            const max = budgetten[c];
            return (
              <li key={c} className="flex flex-col gap-1">
                <div className="flex justify-between text-[15px]"><span>{c}</span>
                  <span className={max && b > max ? "text-red-600 dark:text-red-400" : "text-rustig"}>€ {euro(b)}{max ? ` van € ${euro(max)}` : ""}</span></div>
                {max ? <div className="h-1.5 overflow-hidden rounded-full bg-lijn"><div className={`h-full rounded-full ${b > max ? "bg-red-500" : "bg-accent"}`} style={{ width: `${Math.min(100, (b / max) * 100)}%` }} /></div> : null}
              </li>
            );
          })}
        </ul>
      </section>
    )}

    <section>
      <h2 className={kop}>Regels</h2>
      {regels === null ? <p className="text-rustig">Even laden…</p> : regels.length === 0 ? <p className="text-rustig">Nog niets deze maand.</p> : (
        <ul className="flex flex-col divide-y divide-lijn rounded-2xl bg-vlak">
          {regels.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-4 py-3">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate">{r.omschrijving || r.tegenpartij || "Zonder omschrijving"}</span>
                <span className="flex items-center gap-1 text-[13px] text-rustig">{new Date(`${r.datum}T12:00:00`).toLocaleDateString("nl-NL", { day: "numeric", month: "short" })} ·
                  <select value={r.categorie || "Overig"} onChange={(e) => categorie(r, e.target.value)} aria-label="Categorie wijzigen"
                    className="min-w-0 appearance-none bg-transparent text-[13px] text-rustig underline decoration-dotted outline-none">
                    {[...CATEGORIEEN, "Inkomen"].map((c) => <option key={c}>{c}</option>)}
                  </select></span>
              </span>
              <span className={`shrink-0 ${r.bedrag > 0 ? "text-emerald-600 dark:text-emerald-400" : ""}`}>{r.bedrag > 0 ? "+" : "−"} € {euro(Math.abs(r.bedrag))}</span>
              <button aria-label="Weghalen" onClick={() => weg(r.id)} className="flex size-8 items-center justify-center text-zacht"><Kruis className="size-4" /></button>
            </li>
          ))}
        </ul>
      )}
    </section>
    <section className="flex flex-col gap-2">
      <h2 className={kop}>Bank</h2>
      <BankKoppeling eigenaar={staat.gebruiker.id === 1} regels={bankRegels} bijgewerkt={laden} />
    </section>
    <section className="flex flex-col gap-2">
      <h2 className={kop}>Bankafschrift</h2>
      <label className="flex h-12 cursor-pointer items-center justify-center rounded-2xl bg-vlak font-medium">
        Afschrift inlezen
        <input type="file" accept=".csv,.txt,text/csv,text/plain" className="sr-only"
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) afschrift(f); }} />
      </label>
      <p aria-live="polite" className="px-1 text-sm text-rustig">{inlezen || "Download bij je bank een CSV-bestand (ABN AMRO: TXT). Twee keer inlezen zet niets dubbel."}</p>
    </section>
    {fout && <p className="text-sm text-red-600 dark:text-red-400">{fout}</p>}
  </>;
}

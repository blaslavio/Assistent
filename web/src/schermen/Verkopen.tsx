// Iets te koop zetten op de marktplaats: een product of een dienst, met foto, prijs en hoe het bij de koper komt.
import { useRef, useState } from "react";
import { alsIk } from "../api";
import { BETAALWIJZE, LEVERING } from "../lib/winkelen";
import { Camera, Kruis } from "../iconen";

/** Productfoto: hooguit 1080 pixels en klein genoeg voor de database (400 kB). */
async function productFoto(bestand: File): Promise<string> {
  const beeld = await createImageBitmap(bestand);
  for (const [maat, kwaliteit] of [[1080, 0.82], [900, 0.75], [720, 0.7], [600, 0.6]]) {
    const schaal = Math.min(1, maat / Math.max(beeld.width, beeld.height));
    const doek = document.createElement("canvas");
    doek.width = Math.round(beeld.width * schaal);
    doek.height = Math.round(beeld.height * schaal);
    doek.getContext("2d")!.drawImage(beeld, 0, 0, doek.width, doek.height);
    const url = doek.toDataURL("image/jpeg", kwaliteit);
    if (url.length <= 400000) return url;
  }
  throw new Error("Deze foto is te groot. Kies een andere.");
}

const knop = (aan: boolean) => `h-9 rounded-full px-4 text-sm ${aan ? "bg-accent font-medium text-white" : "bg-vlak text-rustig"}`;

export function Verkopen({ sluit, geplaatst }: { sluit: () => void; geplaatst: () => void }) {
  const [soort, setSoort] = useState<"product" | "dienst">("product");
  const [titel, setTitel] = useState("");
  const [prijs, setPrijs] = useState("");
  const [omschrijving, setOmschrijving] = useState("");
  const [plaats, setPlaats] = useState("");
  const [foto, setFoto] = useState<string | null>(null);
  const [levering, setLevering] = useState<string[]>(["ophalen"]);
  const [betaal, setBetaal] = useState<string[]>(["app", "tikkie", "contant"]);
  const [fout, setFout] = useState("");
  const [bezig, setBezig] = useState(false);
  const kiezer = useRef<HTMLInputElement>(null);

  const wissel = (lijst: string[], k: string) => lijst.includes(k) ? lijst.filter((x) => x !== k) : [...lijst, k];
  const bedrag = Number(prijs.replace(",", "."));
  const klaar = titel.trim().length >= 3 && prijs.trim() !== "" && bedrag >= 0 && levering.length > 0 && betaal.length > 0;

  async function plaats_() {
    setBezig(true);
    setFout("");
    try {
      const r = await alsIk<{ id?: number; fout?: string }>("aanbod_plaatsen", {
        p_soort: soort, p_titel: titel.trim(), p_omschrijving: omschrijving.trim(), p_prijs: Math.round(bedrag * 100) / 100,
        p_prijs_per: soort === "dienst" ? "uur" : "", p_plaats: plaats.trim(), p_contact: "",
        p_betaalwijzen: betaal, p_levering: levering });
      if (r.fout || !r.id) throw new Error(r.fout || "Plaatsen lukte niet.");
      if (foto) {
        const f = await alsIk<{ fout?: string }>("aanbod_foto_zetten", { p_aanbod: r.id, p_foto: foto });
        if (f?.fout) throw new Error(`Geplaatst, maar de foto lukte niet: ${f.fout}`);
      }
      geplaatst();
    } catch (e) {
      setFout(e instanceof Error ? e.message : "Plaatsen lukte niet.");
    } finally {
      setBezig(false);
    }
  }

  const veld = "rounded-2xl bg-vlak px-4 outline-none placeholder:text-zacht";
  return (
    <div role="dialog" aria-modal aria-label="Verkopen" className="fixed inset-0 z-40 overflow-y-auto bg-white dark:bg-[#0b0b0e]">
      <div className="mx-auto flex max-w-xl flex-col gap-5 px-6 pt-12 pb-10">
        <div className="flex items-center justify-between">
          <h1 className="text-[28px] font-bold tracking-tight">Verkopen</h1>
          <button onClick={sluit} aria-label="Sluiten" className="flex size-10 items-center justify-center rounded-full bg-vlak">
            <Kruis className="size-5" />
          </button>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => setSoort("product")} className={knop(soort === "product")}>Product</button>
          <button type="button" onClick={() => setSoort("dienst")} className={knop(soort === "dienst")}>Dienst</button>
        </div>
        <button type="button" onClick={() => kiezer.current?.click()}
          className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-3xl bg-vlak text-rustig">
          {foto ? <img src={foto} alt="Gekozen foto" className="size-full object-cover" />
            : <span className="flex flex-col items-center gap-2"><Camera className="size-8" />Foto toevoegen</span>}
        </button>
        <input ref={kiezer} type="file" accept="image/*" hidden onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          try { setFoto(await productFoto(f)); } catch (er) { setFout(er instanceof Error ? er.message : "Foto lukte niet."); }
        }} />
        <input value={titel} onChange={(e) => setTitel(e.target.value)} maxLength={80} aria-label="Titel"
          placeholder={soort === "product" ? "Wat verkoop je? Bijvoorbeeld: fiets" : "Wat bied je aan? Bijvoorbeeld: bijles wiskunde"}
          className={`h-12 ${veld}`} />
        <label className="flex h-12 items-center gap-2 rounded-2xl bg-vlak px-4">
          <span className="text-rustig">€</span>
          <input value={prijs} onChange={(e) => setPrijs(e.target.value.replace(/[^\d,.]/g, ""))} inputMode="decimal" aria-label="Prijs"
            placeholder="0,00" className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-zacht" />
          {soort === "dienst" && <span className="text-rustig">per uur</span>}
        </label>
        <textarea value={omschrijving} onChange={(e) => setOmschrijving(e.target.value)} maxLength={1000} rows={4}
          aria-label="Omschrijving" placeholder="Staat, maat, merk, wat erbij zit…" className={`py-3 ${veld}`} />
        <input value={plaats} onChange={(e) => setPlaats(e.target.value)} maxLength={60} aria-label="Plaats"
          placeholder="Plaats, bijvoorbeeld Ede" className={`h-12 ${veld}`} />
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium text-rustig">Hoe komt het bij de koper</legend>
          <div className="flex flex-wrap gap-2">
            {Object.entries(LEVERING).map(([k, naam]) => (
              <button key={k} type="button" aria-pressed={levering.includes(k)} onClick={() => setLevering((l) => wissel(l, k))}
                className={knop(levering.includes(k))}>{k === "verzenden" ? "Bezorgen" : naam}</button>
            ))}
          </div>
        </fieldset>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium text-rustig">Hoe kan er betaald worden</legend>
          <div className="flex flex-wrap gap-2">
            {Object.entries(BETAALWIJZE).map(([k, naam]) => (
              <button key={k} type="button" aria-pressed={betaal.includes(k)} onClick={() => setBetaal((l) => wissel(l, k))}
                className={knop(betaal.includes(k))}>{naam}</button>
            ))}
          </div>
          <p className="text-[13px] text-zacht">Via de app is het veiligst: het geld staat vast tot de koper bevestigt.</p>
        </fieldset>
        {fout && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{fout}</p>}
        <button disabled={!klaar || bezig} onClick={plaats_}
          className="h-12 rounded-2xl bg-accent font-medium text-white disabled:opacity-30">{bezig ? "Plaatsen…" : "Te koop zetten"}</button>
        <p className="text-[13px] text-zacht">Verboden zijn onder meer wapens, drugs, medicijnen, namaak en dieren. Zie de voorwaarden.</p>
      </div>
    </div>
  );
}

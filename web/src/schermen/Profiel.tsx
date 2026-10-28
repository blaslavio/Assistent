// Je profiel: foto, naam, gebruikersnaam, een korte tekst over jezelf en je story. Alles wat anderen van je zien.
import { useEffect, useRef, useState } from "react";
import { alsIk, type Gebruiker } from "../api";
import { starten } from "../lib/chat";
import { Camera, Persoon } from "../iconen";
import { StoryRij } from "./Stories";
import { kop } from "./instellingen-ui";


const ZICHTBAAR: [string, string][] = [["iedereen", "Iedereen"], ["contacten", "Contacten"], ["niemand", "Niemand"]];

/** Je eigen foto. Die staat niet in je gegevens, dus we halen hem apart op. */
export function useEigenFoto(g: Gebruiker): [string | null, (f: string | null) => void] {
  const [foto, setFoto] = useState<string | null>(null);
  useEffect(() => {
    if (!g.heeft_foto || !g.id) { setFoto(null); return; }
    alsIk<{ fotos?: Record<string, string> }>("chat_fotos", { p_ids: [g.id] })
      .then((r) => setFoto(r.fotos?.[String(g.id)] ?? null)).catch(() => {});
  }, [g.id, g.heeft_foto]);
  return [foto, setFoto];
}

/** Maakt er een vierkante foto van 256 bij 256 van, uit het midden. Klein genoeg voor de database. */
async function vierkant(bestand: File): Promise<string> {
  const beeld = await createImageBitmap(bestand);
  const zijde = Math.min(beeld.width, beeld.height);
  const doek = document.createElement("canvas");
  doek.width = doek.height = 256;
  doek.getContext("2d")!.drawImage(beeld, (beeld.width - zijde) / 2, (beeld.height - zijde) / 2, zijde, zijde, 0, 0, 256, 256);
  for (const kwaliteit of [0.85, 0.7, 0.55]) {
    const url = doek.toDataURL("image/jpeg", kwaliteit);
    if (url.length <= 60000) return url;
  }
  throw new Error("Deze foto is te groot. Kies een andere.");
}

export function Profiel({ g, vernieuw }: { g: Gebruiker; vernieuw: () => Promise<void> }) {
  const [foto, setFoto] = useEigenFoto(g);
  const [melding, setMelding] = useState("");
  const [ik, setIk] = useState<number | null>(null);
  const kiezer = useRef<HTMLInputElement>(null);
  useEffect(() => { starten().then(setIk).catch(() => {}); }, []);

  async function doe(werk: () => Promise<{ fout?: string } | null | undefined>, klaar = "Bewaard") {
    setMelding("");
    try {
      const r = await werk();
      if (r?.fout) return setMelding(r.fout);
      await vernieuw();
      setMelding(klaar);
    } catch (e) {
      setMelding(e instanceof Error ? e.message : "Bewaren lukte niet.");
    }
  }

  async function fotoGekozen(bestand: File | undefined) {
    if (!bestand) return;
    await doe(async () => {
      const nieuw = await vierkant(bestand);
      const r = await alsIk<{ fout?: string }>("profielfoto_instellen", { p_foto: nieuw, p_zichtbaar: null });
      if (!r.fout) setFoto(nieuw);
      return r;
    }, "Foto bewaard");
  }

  const bijwerken = (velden: Record<string, string | null>) =>
    alsIk<{ fout?: string }>("profiel_bijwerken", { p_nieuwe_naam: null, p_weergavenaam: null, p_nieuw_wachtwoord: null, ...velden });

  return <>
    <div className="flex flex-col items-center gap-3">
      <button onClick={() => kiezer.current?.click()} aria-label="Profielfoto kiezen" className="relative">
        <span className="flex size-28 items-center justify-center overflow-hidden rounded-full bg-vlak">
          {foto ? <img src={foto} alt="" className="size-full object-cover" /> : <Persoon className="size-12 text-rustig" />}
        </span>
        <span className="absolute right-0 bottom-0 ring-4 ring-white dark:ring-[#0b0b0e] flex size-9 items-center justify-center rounded-full bg-accent text-white">
          <Camera className="size-4" />
        </span>
      </button>
      <input ref={kiezer} type="file" accept="image/*" hidden onChange={(e) => { fotoGekozen(e.target.files?.[0]); e.target.value = ""; }} />
      {foto && (
        <button onClick={() => doe(async () => {
          const r = await alsIk<{ fout?: string }>("profielfoto_instellen", { p_foto: "", p_zichtbaar: null });
          if (!r.fout) setFoto(null);
          return r;
        }, "Foto weggehaald")} className="text-sm text-rustig">Foto weghalen</button>
      )}
    </div>

    <fieldset>
      <legend className={kop}>Wie ziet je foto</legend>
      <div className="flex rounded-2xl bg-vlak p-1">
        {ZICHTBAAR.map(([k, naam]) => {
          const aan = (g.foto_zichtbaar ?? "contacten") === k;
          return (
            <button key={k} type="button" aria-pressed={aan}
              onClick={() => !aan && doe(() => alsIk("profielfoto_instellen", { p_foto: null, p_zichtbaar: k }))}
              className={`h-10 flex-1 rounded-xl text-[15px] ${aan ? "bg-white font-semibold shadow-sm dark:bg-[#2a2a31]" : "text-rustig"}`}>
              {naam}
            </button>
          );
        })}
      </div>
    </fieldset>

    <Veld label="Naam" uitleg="Zo zien anderen je in de chat." waarde={g.weergavenaam ?? ""} max={40}
      bewaar={(v) => doe(() => bijwerken({ p_weergavenaam: v.trim() }))} />
    <Veld label="Gebruikersnaam" uitleg="Hiermee vinden anderen je. Alleen letters, cijfers, punt en liggend streepje."
      waarde={g.naam ?? ""} voor="@" max={30}
      bewaar={(v) => doe(() => bijwerken({ p_nieuwe_naam: v.trim().toLowerCase().replace(/^@/, "") }))} />
    <Veld label="Over mij" uitleg="Een korte zin, bijvoorbeeld wat je doet of verkoopt." waarde={g.over ?? ""} max={160} lang
      bewaar={(v) => doe(() => alsIk("profiel_over_instellen", { p_over: v }))} />

    <section>
      <h2 className={kop}>Story</h2>
      <p className="mb-3 px-1 text-sm text-rustig">Een foto, video of tekst die 24 uur blijft staan. Alleen je contacten zien hem, versleuteld.</p>
      <div className="-mx-6">{ik !== null ? <StoryRij ik={ik} /> : <p className="bezig-tekst px-7 text-sm text-rustig">Laden</p>}</div>
    </section>

    {melding && <p role="status" className="px-1 text-sm text-rustig">{melding}</p>}
  </>;
}

function Veld({ label, uitleg, waarde, bewaar, max, voor, lang = false }: { label: string; uitleg: string; waarde: string;
  bewaar: (v: string) => void; max: number; voor?: string; lang?: boolean }) {
  const [v, setV] = useState(waarde);
  useEffect(() => setV(waarde), [waarde]);
  const veranderd = v.trim() !== waarde.trim();
  const klasse = "min-w-0 flex-1 bg-transparent outline-none placeholder:text-zacht";
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (veranderd) bewaar(v); }} className="flex flex-col gap-2">
      <label className={kop} htmlFor={`veld-${label}`}>{label}</label>
      <div className="flex items-start gap-2">
        <div className={`flex flex-1 gap-1 rounded-2xl bg-vlak px-4 ${lang ? "py-3" : "h-12 items-center"}`}>
          {voor && <span className="text-rustig">{voor}</span>}
          {lang
            ? <textarea id={`veld-${label}`} value={v} maxLength={max} rows={3} onChange={(e) => setV(e.target.value)} className={`${klasse} resize-none`} />
            : <input id={`veld-${label}`} value={v} maxLength={max} onChange={(e) => setV(e.target.value)} className={klasse}
                autoCapitalize={voor ? "none" : undefined} autoCorrect={voor ? "off" : undefined} />}
        </div>
        <button disabled={!veranderd} className="h-12 rounded-2xl bg-accent px-5 font-medium text-white disabled:opacity-30">Bewaar</button>
      </div>
      <p className="px-1 text-sm text-rustig">{uitleg}{lang ? ` (${v.length}/${max})` : ""}</p>
    </form>
  );
}

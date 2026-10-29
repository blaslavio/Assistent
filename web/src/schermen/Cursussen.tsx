// Cursussen in een community: leden volgen lessen en vinken ze af, de eigenaar maakt en ordent ze.
import { useCallback, useEffect, useState } from "react";
import { Onderblad } from "./Onderblad";
import { Schakelaar } from "./instellingen-ui";
import { Boek, Kruis, Plus, Terug, Vinkje } from "../iconen";
import { mascotteZeg } from "../mascotte";
import { aanbod, kopen, lesKlaar, lesOpslaan, lesWijzigen, lezen, opslaan, prijsTekst, videoSpeler, type Aanbod, type Cursus,
  type Les } from "../lib/cursus";

const foutVan = (e: unknown) => (e instanceof Error && e.message ? e.message : "Dat lukte niet. Probeer het opnieuw.");
const veld = "h-12 w-full rounded-2xl bg-vlak px-4 outline-none placeholder:text-zacht focus:ring-2 focus:ring-accent";
const vlak = "w-full rounded-2xl bg-vlak px-4 py-3 outline-none placeholder:text-zacht focus:ring-2 focus:ring-accent";
const knop = "h-12 rounded-2xl bg-accent px-4 font-medium text-white disabled:opacity-40";

export function Cursussen({ community }: { community: number }) {
  const [a, setA] = useState<Aanbod | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [nieuw, setNieuw] = useState(false);
  const [fout, setFout] = useState("");
  const laden = useCallback(() => aanbod(community).then(setA).catch((e) => setFout(foutVan(e))), [community]);
  useEffect(() => { laden(); }, [laden]);

  if (open !== null) return <CursusScherm id={open} terug={() => { setOpen(null); laden(); }} />;
  return (
    <div className="flex flex-col gap-4 px-6 pb-8">
      {a === null && !fout && <p className="bezig-tekst text-rustig">Laden</p>}
      {a && a.cursussen.length === 0 && (
        <p className="text-rustig">{a.beheer ? "Maak een cursus met lessen voor je leden: gratis of te koop." : "Deze community heeft nog geen cursussen."}</p>
      )}
      {a && a.cursussen.length > 0 && (
        <ul className="flex flex-col gap-2">
          {a.cursussen.map((c) => (
            <li key={c.id}>
              <button onClick={() => setOpen(c.id)} className="flex w-full items-center gap-3 rounded-2xl bg-vlak p-4 text-left">
                <Boek className="size-6 shrink-0 text-accent" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium">{c.titel}</span>
                  <span className="text-[13px] text-rustig">{voortgang(c)}{!c.gepubliceerd ? " · concept" : ""}</span>
                </span>
                {!c.toegang && <span className="shrink-0 text-sm font-medium">{prijsTekst(c.prijs_cent)}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {a?.beheer && (
        <button onClick={() => setNieuw(true)} className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-vlak font-medium">
          <Plus className="size-5" /> Nieuwe cursus
        </button>
      )}
      {fout && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{fout}</p>}
      {nieuw && a && <CursusInstellen community={community} kanVerkopen={a.kan_ontvangen} sluit={() => setNieuw(false)}
        klaar={(id) => { setNieuw(false); laden(); setOpen(id); }} />}
    </div>
  );
}

function voortgang(c: Pick<Cursus, "lessen" | "klaar" | "minuten" | "toegang">) {
  const lessen = `${c.lessen} ${c.lessen === 1 ? "les" : "lessen"}`;
  if (c.toegang && c.klaar > 0) return `${c.klaar} van ${lessen} klaar`;
  return c.minuten ? `${lessen} · ${c.minuten} min` : lessen;
}

function CursusInstellen({ community, cursus, kanVerkopen, sluit, klaar }: { community: number; cursus?: Cursus;
  kanVerkopen: boolean; sluit: () => void; klaar: (id: number) => void }) {
  const [titel, setTitel] = useState(cursus?.titel ?? "");
  const [omschrijving, setOmschrijving] = useState(cursus?.omschrijving ?? "");
  const [prijs, setPrijs] = useState(cursus?.prijs_cent ? String(cursus.prijs_cent / 100).replace(".", ",") : "");
  const [gepubliceerd, setGepubliceerd] = useState(cursus?.gepubliceerd ?? false);
  const [fout, setFout] = useState("");
  async function bewaar() {
    setFout("");
    try {
      const r = await opslaan(community, cursus?.id ?? null, { titel, omschrijving, gepubliceerd,
        prijs: Number(prijs.replace(",", ".")) || 0 });
      klaar(r.id ?? cursus!.id);
    } catch (e) {
      setFout(foutVan(e));
    }
  }
  return (
    <Onderblad titel={cursus ? "Cursus aanpassen" : "Nieuwe cursus"} sluit={sluit}>
      <input value={titel} onChange={(e) => setTitel(e.target.value)} maxLength={100} placeholder="Titel" aria-label="Titel" className={veld} />
      <textarea value={omschrijving} onChange={(e) => setOmschrijving(e.target.value)} rows={3} maxLength={2000}
        placeholder="Wat leer je in deze cursus?" aria-label="Omschrijving" className={vlak} />
      <label className="flex flex-col gap-1.5">
        <span className="px-1 text-sm font-medium">Prijs</span>
        <input value={prijs} onChange={(e) => setPrijs(e.target.value)} inputMode="decimal" placeholder="Leeg is gratis voor leden" className={veld} />
        {!kanVerkopen && <span className="px-1 text-[13px] text-rustig">Verkopen kan zodra je betalingen ontvangt (Instellingen › Betalingen).</span>}
      </label>
      <Schakelaar label="Zichtbaar voor leden" uitleg="Zet dit aan als de lessen klaar zijn." aan={gepubliceerd} zet={setGepubliceerd} />
      {fout && <p role="alert" className="px-1 text-sm text-red-600">{fout}</p>}
      <button onClick={bewaar} disabled={!titel.trim()} className={knop}>Bewaren</button>
    </Onderblad>
  );
}

function CursusScherm({ id, terug }: { id: number; terug: () => void }) {
  const [c, setC] = useState<Awaited<ReturnType<typeof lezen>> | null>(null);
  const [les, setLes] = useState<Les | null>(null);
  const [bewerk, setBewerk] = useState<Les | "nieuw" | "cursus" | null>(null);
  const [fout, setFout] = useState("");
  const [akkoord, setAkkoord] = useState(false);
  const laden = useCallback(() => lezen(id).then(setC).catch((e) => setFout(foutVan(e))), [id]);
  useEffect(() => { laden(); }, [laden]);
  const doe = (f: () => Promise<unknown>) => f().then(laden).catch((e) => setFout(foutVan(e)));

  async function afvinken(l: Les) {
    await doe(() => lesKlaar(l.id, !l.klaar));
    if (!l.klaar && c && c.klaar + 1 === c.lessen) mascotteZeg(`Cursus ${c.titel} helemaal klaar. Knap gedaan!`);
  }

  if (les && c) {
    const v = videoSpeler(les.video ?? "");
    const volgende = c.les_lijst[c.les_lijst.findIndex((x) => x.id === les.id) + 1];
    return (
      <div className="flex flex-col gap-4 px-6 pb-8">
        <button onClick={() => { setLes(null); laden(); }} className="-ml-2 flex h-10 items-center gap-1 self-start pr-3 text-rustig"><Terug className="size-5" /> {c.titel}</button>
        <h2 className="text-xl font-semibold">{les.titel}</h2>
        {v?.soort === "embed" && <iframe src={v.src} title={les.titel} allow="fullscreen; picture-in-picture" className="aspect-video w-full rounded-2xl" />}
        {v?.soort === "bestand" && <video src={v.src} controls playsInline className="w-full rounded-2xl" />}
        {v?.soort === "link" && <a href={v.src} target="_blank" rel="noreferrer" className="font-medium text-accent">Video openen</a>}
        {les.inhoud && <p className="whitespace-pre-line text-[15px] leading-relaxed">{les.inhoud}</p>}
        <button onClick={async () => { await afvinken(les); if (volgende && !les.klaar) setLes(volgende); else setLes(null); }} className={knop}>
          {les.klaar ? "Toch nog niet klaar" : volgende ? "Klaar, volgende les" : "Klaar"}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 px-6 pb-8">
      <div className="flex items-center gap-2">
        <button onClick={terug} aria-label="Terug naar cursussen" className="-ml-2 flex size-10 items-center justify-center text-rustig"><Terug className="size-5" /></button>
        <h2 className="min-w-0 flex-1 truncate text-xl font-semibold">{c?.titel ?? ""}</h2>
        {c?.beheer && <button onClick={() => setBewerk("cursus")} className="text-sm font-medium text-accent">Aanpassen</button>}
      </div>
      {c && <>
        {c.omschrijving && <p className="whitespace-pre-line text-[15px] text-rustig">{c.omschrijving}</p>}
        <p className="text-[13px] text-rustig">{voortgang(c)}{c.beheer && c.kopers ? ` · ${c.kopers} keer verkocht` : ""}</p>
        {c.toegang && c.lessen > 0 && (
          <div className="h-1.5 overflow-hidden rounded-full bg-lijn"><div className="h-full rounded-full bg-accent" style={{ width: `${(c.klaar / c.lessen) * 100}%` }} /></div>
        )}
        {!c.toegang && (
          <div className="flex flex-col gap-3 rounded-2xl bg-vlak p-4">
            <span className="text-lg font-semibold">{prijsTekst(c.prijs_cent)}</span>
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" checked={akkoord} onChange={(e) => setAkkoord(e.target.checked)} className="mt-0.5 size-5 accent-[var(--color-accent)]" />
              <span>Ik wil meteen beginnen. Ik weet dat er dan geen bedenktijd is.</span>
            </label>
            <button disabled={!akkoord} onClick={() => kopen(c.id).catch((e) => setFout(foutVan(e)))} className={knop}>Kopen</button>
          </div>
        )}
        <ul className="flex flex-col divide-y divide-lijn rounded-2xl bg-vlak">
          {c.les_lijst.map((l, n) => (
            <li key={l.id} className="flex items-center gap-3 px-4 py-3">
              {c.toegang ? (
                <button onClick={() => afvinken(l)} aria-label={l.klaar ? `${l.titel} niet klaar` : `${l.titel} klaar`}
                  className={`flex size-6 shrink-0 items-center justify-center rounded-full border-2 ${l.klaar ? "border-accent bg-accent text-white" : "border-lijn"}`}>
                  {l.klaar && <Vinkje className="size-3.5" />}
                </button>
              ) : <span className="w-6 shrink-0 text-center text-sm text-zacht">{n + 1}</span>}
              <button disabled={!c.toegang} onClick={() => setLes(l)} className="flex min-w-0 flex-1 flex-col text-left">
                <span className="truncate">{l.titel}</span>
                {l.minuten > 0 && <span className="text-[13px] text-rustig">{l.minuten} min</span>}
              </button>
              {c.beheer && <>
                <button aria-label="Eerder" disabled={n === 0} onClick={() => doe(() => lesWijzigen(l.id, "op"))} className="flex size-8 items-center justify-center text-zacht disabled:opacity-30"><Terug className="size-4 rotate-90" /></button>
                <button aria-label="Bewerken" onClick={() => setBewerk(l)} className="text-sm text-accent">Wijzig</button>
                <button aria-label="Weghalen" onClick={() => doe(() => lesWijzigen(l.id, "weg"))} className="flex size-8 items-center justify-center text-zacht"><Kruis className="size-4" /></button>
              </>}
            </li>
          ))}
          {c.les_lijst.length === 0 && <li className="px-4 py-3 text-rustig">Nog geen lessen.</li>}
        </ul>
        {c.beheer && (
          <button onClick={() => setBewerk("nieuw")} className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-vlak font-medium"><Plus className="size-5" /> Les toevoegen</button>
        )}
      </>}
      {fout && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{fout}</p>}
      {c && bewerk === "cursus" && <CursusInstellen community={c.community} cursus={c} kanVerkopen sluit={() => setBewerk(null)}
        klaar={() => { setBewerk(null); laden(); }} />}
      {c && bewerk && bewerk !== "cursus" && <LesInstellen cursus={c.id} les={bewerk === "nieuw" ? undefined : bewerk}
        sluit={() => setBewerk(null)} klaar={() => { setBewerk(null); laden(); }} />}
    </div>
  );
}

function LesInstellen({ cursus, les, sluit, klaar }: { cursus: number; les?: Les; sluit: () => void; klaar: () => void }) {
  const [titel, setTitel] = useState(les?.titel ?? "");
  const [inhoud, setInhoud] = useState(les?.inhoud ?? "");
  const [video, setVideo] = useState(les?.video ?? "");
  const [minuten, setMinuten] = useState(les?.minuten ? String(les.minuten) : "");
  const [fout, setFout] = useState("");
  async function bewaar() {
    setFout("");
    try {
      await lesOpslaan(cursus, les?.id ?? null, { titel, inhoud, video, minuten: Number(minuten) || 0 });
      klaar();
    } catch (e) {
      setFout(foutVan(e));
    }
  }
  return (
    <Onderblad titel={les ? "Les aanpassen" : "Nieuwe les"} sluit={sluit}>
      <input value={titel} onChange={(e) => setTitel(e.target.value)} maxLength={100} placeholder="Titel van de les" aria-label="Titel van de les" className={veld} />
      <input value={video} onChange={(e) => setVideo(e.target.value)} inputMode="url" placeholder="Video (link van YouTube of Vimeo, mag leeg)" aria-label="Video" className={veld} />
      <textarea value={inhoud} onChange={(e) => setInhoud(e.target.value)} rows={6} placeholder="Uitleg, opdrachten of tekst" aria-label="Inhoud" className={vlak} />
      <input value={minuten} onChange={(e) => setMinuten(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="Hoeveel minuten ongeveer?" aria-label="Minuten" className={veld} />
      {fout && <p role="alert" className="px-1 text-sm text-red-600">{fout}</p>}
      <button onClick={bewaar} disabled={!titel.trim()} className={knop}>Bewaren</button>
    </Onderblad>
  );
}

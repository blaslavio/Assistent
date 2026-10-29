// De openbare profielpagina (?profiel=adres): ook zonder account te bekijken. Alleen wat de eigenaar toch al openbaar
// maakte: winkel, boekpagina, openbare community's, aanbod, berichten en spullen. Plus het instellen ervan.
import { useEffect, useState } from "react";
import { Boek, Delen, Kalender, Mensen, Persoon, Plus, Kruis, Winkelpand } from "../iconen";
import { boekLink } from "../lib/gasten";
import { winkelLink } from "../lib/mijnwinkel";
import { cursusLink } from "../lib/cursus";
import { postLink } from "../lib/feed";
import { linkNetjes } from "../lib/winkelopmaak";
import { ADRES, adresVan, mijnPagina, paginaBewaren, profielBekijken, profielLink, type Link, type MijnPagina,
  type ProfielPagina as Pagina } from "../lib/profielpagina";

const euro = (cent: number) => (cent ? `€ ${(cent / 100).toFixed(2).replace(".", ",")}` : "Gratis");
const SOORT = { cursus: "Cursus", training: "Training", dienst: "Dienst" } as const;
const host = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; } };
const kop = "text-[13px] font-semibold uppercase tracking-[0.06em] text-rustig";
const rij = "flex items-center gap-3 px-4 py-3";

async function delen(url: string, titel: string, klaar: (t: string) => void) {
  try {
    if (navigator.share) return await navigator.share({ title: titel, url });
  } catch {
    return;
  }
  try {
    await navigator.clipboard.writeText(url);
    klaar("Link gekopieerd.");
  } catch {
    klaar(url);
  }
}

export function ProfielScherm({ adres }: { adres: string }) {
  const [p, setP] = useState<Pagina | null | undefined>(undefined);
  const [melding, setMelding] = useState("");
  useEffect(() => { profielBekijken(adres).then(setP).catch(() => setP(null)); }, [adres]);

  return (
    <main className="mx-auto flex min-h-full max-w-xl flex-col gap-6 px-6 pt-14 pb-10">
      {p === undefined ? <p className="bezig-tekst text-[15px]">Laden</p> : p === null ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Deze pagina bestaat niet of staat uit</h1>
          <p className="text-rustig">Vraag om een nieuwe link.</p>
        </div>
      ) : (
        <>
          <header className="flex flex-col items-center gap-2 text-center">
            <span className="flex size-24 items-center justify-center overflow-hidden rounded-full bg-vlak">
              {p.foto ? <img src={p.foto} alt="" className="size-full object-cover" /> : <Persoon className="size-10 text-rustig" />}
            </span>
            <h1 className="text-[26px] font-bold leading-tight tracking-tight">{p.naam}</h1>
            {p.kop && <p className="text-[17px]">{p.kop}</p>}
            {p.over && <p className="whitespace-pre-wrap text-[15px] text-rustig">{p.over}</p>}
            <button onClick={() => delen(profielLink(p.adres), p.naam, setMelding)}
              className="mt-1 flex h-9 items-center gap-1.5 rounded-full bg-vlak px-4 text-sm"><Delen className="size-4" /> Delen</button>
            {melding && <p role="status" className="text-sm text-rustig">{melding}</p>}
          </header>

          {(p.links.length > 0 || p.winkel || p.boek) && (
            <div className="flex flex-col gap-2">
              {p.winkel && <Knop href={winkelLink(p.winkel.adres)} icoon={<Winkelpand className="size-5" />} titel={p.winkel.naam}
                sub={p.winkel.omschrijving || "Webshop"} />}
              {p.boek && <Knop href={boekLink(p.boek.adres)} icoon={<Kalender className="size-5" />} titel={p.boek.titel || "Afspraak maken"}
                sub="Kies zelf een moment" />}
              {p.links.map((l) => <Knop key={l.url} href={l.url} titel={l.label} sub={host(l.url)} extern />)}
            </div>
          )}

          {p.aanbod.length > 0 && (
            <Blok titel="Aanbod">
              {p.aanbod.map((a) => (
                <a key={a.id} href={cursusLink(a.id)} target="_top" className={rij}>
                  <Boek className="size-5 shrink-0 text-rustig" />
                  <span className="min-w-0 flex-1"><span className="block truncate">{a.titel}</span>
                    <span className="text-[13px] text-rustig">{SOORT[a.soort] ?? "Cursus"}</span></span>
                  <span className="text-sm tabular-nums">{euro(a.prijs_cent)}</span>
                </a>
              ))}
            </Blok>
          )}

          {p.communities.length > 0 && (
            <Blok titel="Community's">
              {p.communities.map((c) => (
                <div key={c.id} className={rij}>
                  <Mensen className="size-5 shrink-0 text-rustig" />
                  <span className="min-w-0 flex-1"><span className="block truncate">{c.naam}</span>
                    {c.omschrijving && <span className="block truncate text-[13px] text-rustig">{c.omschrijving}</span>}</span>
                  <span className="text-[13px] text-rustig">{c.leden} {c.leden === 1 ? "lid" : "leden"}</span>
                </div>
              ))}
            </Blok>
          )}

          {p.spullen.length > 0 && (
            <Blok titel="Te koop">
              {p.spullen.map((s) => (
                <div key={s.id} className={rij}>
                  <span className="min-w-0 flex-1 truncate">{s.titel}</span>
                  {s.prijs != null && <span className="text-sm tabular-nums">€ {Number(s.prijs).toFixed(2).replace(".", ",")}</span>}
                </div>
              ))}
            </Blok>
          )}

          {p.posts.length > 0 && (
            <Blok titel="Berichten">
              {p.posts.map((x) => (
                <a key={x.id} href={postLink(x.id)} target="_top" className="flex flex-col gap-1 px-4 py-3">
                  <span className="line-clamp-3 text-[15px]">{x.tekst}</span>
                  <span className="text-[12px] text-rustig">{x.community_naam} · {new Date(x.aangemaakt).toLocaleDateString("nl-NL", { day: "numeric", month: "short" })}</span>
                </a>
              ))}
            </Blok>
          )}
        </>
      )}
    </main>
  );
}

function Knop({ href, icoon, titel, sub, extern }: { href: string; icoon?: React.ReactNode; titel: string; sub: string; extern?: boolean }) {
  return (
    <a href={href} target={extern ? "_blank" : "_top"} rel={extern ? "noreferrer noopener" : undefined}
      className="flex items-center gap-3 rounded-2xl bg-vlak px-4 py-3">
      {icoon && <span className="text-accent">{icoon}</span>}
      <span className="min-w-0 flex-1"><span className="block truncate font-medium">{titel}</span>
        <span className="block truncate text-[13px] text-rustig">{sub}</span></span>
    </a>
  );
}

function Blok({ titel, children }: { titel: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className={kop}>{titel}</h2>
      <div className="flex flex-col divide-y divide-lijn rounded-2xl bg-vlak">{children}</div>
    </section>
  );
}

/** In je profiel: je openbare pagina aan of uit, met een eigen adres, een kop en je links. */
export function OpenbarePagina({ naam }: { naam: string }) {
  const [p, setP] = useState<MijnPagina | null | undefined>(undefined);
  const [melding, setMelding] = useState("");
  const [bezig, setBezig] = useState(false);
  useEffect(() => {
    mijnPagina().then((x) => setP(x ?? { adres: adresVan(naam) || "", aan: false, kop: "", links: [] })).catch(() => setP(null));
  }, [naam]);
  if (p === undefined) return null;
  if (p === null) return <p className="text-sm text-rustig">Je openbare pagina kon niet laden.</p>;

  async function bewaar(nieuw: MijnPagina, klaar = "Bewaard") {
    setBezig(true); setMelding("");
    try {
      const links = nieuw.links.map((l) => ({ label: l.label.trim(), url: linkNetjes(l.url) })).filter((l) => l.url);
      const adres = await paginaBewaren({ ...nieuw, links });
      setP({ ...nieuw, adres, links });
      setMelding(klaar);
    } catch (e) {
      setMelding(e instanceof Error ? e.message : "Bewaren lukte niet.");
    } finally {
      setBezig(false);
    }
  }
  const zet = (x: Partial<MijnPagina>) => setP({ ...p, ...x });
  const goedAdres = ADRES.test(p.adres);
  const pasLink = (i: number, l: Partial<Link>) => zet({ links: p.links.map((x, n) => (n === i ? { ...x, ...l } : x)) });

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className={kop}>Openbare pagina</h2>
          <p className="text-sm text-rustig">{p.aan ? "Iedereen met de link ziet hem." : "Staat uit. Alleen jij ziet je gegevens."}</p>
        </div>
        <button role="switch" aria-checked={p.aan} aria-label="Openbare pagina aan" disabled={bezig || !goedAdres}
          onClick={() => bewaar({ ...p, aan: !p.aan }, p.aan ? "Staat uit" : "Staat aan")}
          className={`relative h-8 w-13 shrink-0 rounded-full transition-colors disabled:opacity-40 ${p.aan ? "bg-accent" : "bg-lijn"}`}>
          <span className={`absolute top-1 size-6 rounded-full bg-white shadow transition-all ${p.aan ? "left-6" : "left-1"}`} />
        </button>
      </div>
      <details className="rounded-2xl bg-vlak px-4 py-1" open={p.aan || undefined}>
        <summary className="cursor-pointer py-2.5 text-[15px]">Adres, kop en links</summary>
        <form className="flex flex-col gap-2 pb-3" onSubmit={(e) => { e.preventDefault(); bewaar(p); }}>
          <label className="flex h-11 items-center rounded-xl bg-white/60 px-3 text-[15px] dark:bg-black/30">
            <span className="text-rustig">?profiel=</span>
            <input value={p.adres} onChange={(e) => zet({ adres: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 30) })}
              aria-label="Adres van je pagina" autoCapitalize="none" autoCorrect="off" className="min-w-0 flex-1 bg-transparent outline-none" />
          </label>
          {!goedAdres && <p className="text-[13px] text-rustig">3 tot 30 tekens: kleine letters, cijfers en streepjes.</p>}
          <input value={p.kop} onChange={(e) => zet({ kop: e.target.value.slice(0, 80) })} placeholder="Kop, bijvoorbeeld Bakker in Ede"
            aria-label="Kop" className="h-11 rounded-xl bg-white/60 px-3 outline-none placeholder:text-zacht dark:bg-black/30" />
          {p.links.map((l, i) => (
            <div key={i} className="flex gap-1.5">
              <input value={l.label} onChange={(e) => pasLink(i, { label: e.target.value.slice(0, 40) })} placeholder="Naam" aria-label="Naam van de link"
                className="h-11 w-28 shrink-0 rounded-xl bg-white/60 px-3 outline-none placeholder:text-zacht dark:bg-black/30" />
              <input value={l.url} onChange={(e) => pasLink(i, { url: e.target.value })} placeholder="instagram.com/…" aria-label="Adres van de link"
                inputMode="url" autoCapitalize="none" className="h-11 min-w-0 flex-1 rounded-xl bg-white/60 px-3 outline-none placeholder:text-zacht dark:bg-black/30" />
              <button type="button" onClick={() => zet({ links: p.links.filter((_, n) => n !== i) })} aria-label="Link weghalen"
                className="flex size-11 shrink-0 items-center justify-center text-rustig"><Kruis className="size-4" /></button>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2">
            {p.links.length < 6 && (
              <button type="button" onClick={() => zet({ links: [...p.links, { label: "", url: "" }] })}
                className="flex h-9 items-center gap-1 rounded-full bg-white/60 px-3 text-sm dark:bg-black/30"><Plus className="size-4" /> Link</button>
            )}
            <button disabled={bezig || !goedAdres} className="h-9 rounded-full bg-accent px-4 text-sm font-medium text-white disabled:opacity-40">Bewaar</button>
            {p.aan && <a href={profielLink(p.adres)} target="_blank" rel="noreferrer" className="text-sm text-accent">Bekijken</a>}
            {p.aan && <button type="button" onClick={() => delen(profielLink(p.adres), "Mijn pagina", setMelding)}
              className="text-sm text-accent">Delen</button>}
          </div>
        </form>
      </details>
      {melding && <p role="status" className="px-1 text-sm text-rustig">{melding}</p>}
    </section>
  );
}

// De feed bij Community's: berichten uit je eigen community's en uit openbare community's, met wat je wilt zien.
import { useCallback, useEffect, useRef, useState } from "react";
import { instellingenBijwerken } from "../api";
import { Ballon, Beeld, Delen, Hart, Kruis, Meer, Wereld } from "../iconen";
import { BRONNEN, postBekijken, feed, foto, fotoVerkleinen, leuk, meedoen, melden, ontdekken, plaatsen, postLink, reactieWeg, reacties as reactiesLaden,
  reageren, weghalen, type Reactie,
  type FeedInstelling, type Openbaar, type Post } from "../lib/feed";
import type { Community } from "../lib/chat";
import { tijdje } from "../lib/tijd";
import { Rondje } from "../rondje";

const foutVan = (e: unknown) => (e instanceof Error ? e.message : "Dat lukte niet.");
const pil = (aan: boolean) => `h-9 shrink-0 rounded-full px-3.5 text-sm ${aan ? "bg-inkt font-medium text-white dark:text-[#0b0b0e]" : "bg-vlak"}`;

/** De feed op het tabblad Community's. */
export function Feed({ mijn, begin, open, vernieuw, maken }: { mijn: Community[]; begin: FeedInstelling;
  open: (id: number) => void; vernieuw: () => Promise<void>; maken?: () => void }) {
  const [keuze, setKeuze] = useState(begin);
  const [aanpassen, setAanpassen] = useState(false);
  const [openbaar, setOpenbaar] = useState<Openbaar[]>([]);
  const [meerOntdekken, setMeerOntdekken] = useState(false);
  const [netLid, setNetLid] = useState<number[]>([]);

  const laadOpenbaar = useCallback(() => ontdekken().then(setOpenbaar).catch(() => {}), []);
  useEffect(() => { laadOpenbaar(); }, [laadOpenbaar]);

  function bewaar(k: FeedInstelling) {
    setKeuze(k);
    instellingenBijwerken((i) => { i.feed = k; }).catch(() => {});
  }

  const namen = new Map<number, string>([...openbaar.map((o) => [o.id, o.naam] as const), ...mijn.map((c) => [c.id, c.naam] as const)]);
  // Waar je net mee meedoet blijft even staan, met Openen erbij.
  const nieuw = openbaar.filter((o) => !o.lid || netLid.includes(o.id));

  async function doeMee(id: number) {
    await meedoen(id);
    setNetLid((l) => [...l, id]);
    await vernieuw();
    laadOpenbaar();
  }

  return (
    <div className="flex flex-col gap-4 pb-8">
      <div className="flex items-center gap-2 px-6">
        <div className="-my-1 flex min-w-0 flex-1 gap-2 overflow-x-auto py-1">
          {BRONNEN.map(([b, naam]) => (
            <button key={b} onClick={() => bewaar({ ...keuze, bron: b })} aria-pressed={keuze.bron === b} className={pil(keuze.bron === b)}>{naam}</button>
          ))}
        </div>
        <button onClick={() => setAanpassen(!aanpassen)} aria-expanded={aanpassen}
          className="h-9 shrink-0 rounded-full px-3 text-sm font-medium text-accent">{aanpassen ? "Klaar" : "Aanpassen"}</button>
      </div>

      {aanpassen && (
        <section className="opkomen mx-6 flex flex-col gap-1 rounded-2xl border border-lijn px-4 py-3">
          <h3 className="pb-1 text-sm font-medium text-rustig">Laat zien in je feed</h3>
          {namen.size === 0 && <p className="text-[15px] text-rustig">Nog geen community's.</p>}
          {[...namen].map(([id, naam]) => {
            const aan = !keuze.verborgen.includes(id);
            return (
              <label key={id} className="flex min-h-11 items-center gap-3">
                <span className="min-w-0 flex-1 truncate">{naam}</span>
                <input type="checkbox" checked={aan} className="size-5 accent-[var(--color-accent)]"
                  onChange={() => bewaar({ ...keuze, verborgen: aan ? [...keuze.verborgen, id] : keuze.verborgen.filter((x) => x !== id) })} />
              </label>
            );
          })}
        </section>
      )}

      {mijn.length === 0 && maken && (
        <section className="mx-6 flex flex-col gap-3 rounded-3xl bg-vlak p-5">
          <h3 className="text-lg font-semibold">Begin je eigen plek</h3>
          <p className="text-[15px] text-rustig">Een community is een groep met eigen kanalen en een feed. Versleuteld, zonder reclame, en jij bepaalt wie erin mag.</p>
          <div className="flex flex-wrap gap-2 text-sm">
            {["Je straat", "Je sportclub", "Je klas", "Je familie", "Je klanten"].map((x) => (
              <span key={x} className="rounded-full border border-lijn px-3 py-1.5 text-rustig">{x}</span>
            ))}
          </div>
          <button onClick={maken} className="h-11 rounded-full bg-accent font-medium text-white">Maak een community of doe mee</button>
        </section>
      )}

      {mijn.length > 0 && <Schrijven mijn={mijn} geplaatst={() => setKeuze((k) => ({ ...k }))} />}

      {nieuw.length > 0 && keuze.bron !== "mijn" && (
        <section className="flex flex-col gap-1 px-3">
          <h3 className="flex items-center gap-1.5 px-3 text-sm font-medium text-rustig"><Wereld className="size-4" /> Openbare community's</h3>
          <ul className="flex flex-col">
            {(meerOntdekken ? nieuw : nieuw.slice(0, 2)).map((o) => <Ontdek key={o.id} o={o} meedoen={() => doeMee(o.id)} open={open} />)}
          </ul>
          {nieuw.length > 2 && (
            <button onClick={() => setMeerOntdekken(!meerOntdekken)} className="h-9 self-start px-3 text-sm font-medium text-accent">
              {meerOntdekken ? "Minder" : `Alle ${nieuw.length} bekijken`}
            </button>
          )}
        </section>
      )}

      <Berichten keuze={keuze} leeg={mijn.length === 0 && nieuw.length === 0
        ? "Zodra je ergens lid van bent, verschijnen hier de berichten. Openbare community's zie je hierboven."
        : "Nog geen berichten. Schrijf als eerste iets."} />
    </div>
  );
}

function Ontdek({ o, meedoen: doe, open }: { o: Openbaar; meedoen: () => Promise<void>; open: (id: number) => void }) {
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState("");
  return (
    <li className="flex flex-col gap-1 rounded-2xl px-3 py-2">
      <div className="flex items-center gap-3">
        <Rondje naam={o.naam} id={-1000 - o.id} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-medium">{o.naam}</span>
          <span className="truncate text-[13px] text-rustig">{o.omschrijving || `${o.leden} ${o.leden === 1 ? "lid" : "leden"}`}</span>
        </span>
        {o.lid ? (
          <button onClick={() => open(o.id)} className="h-9 shrink-0 rounded-full bg-vlak px-4 text-sm font-medium">Openen</button>
        ) : (
          <button disabled={bezig} onClick={async () => {
            setBezig(true);
            setFout("");
            try { await doe(); } catch (e) { setFout(foutVan(e)); } finally { setBezig(false); }
          }} className="h-9 shrink-0 rounded-full bg-accent px-4 text-sm font-medium text-white disabled:opacity-50">Meedoen</button>
        )}
      </div>
      {fout && <p role="alert" className="pl-13 text-[13px] text-red-600 dark:text-red-400">{fout}</p>}
    </li>
  );
}

/** Een bericht plaatsen. Met één community hoef je niets te kiezen. */
export function Schrijven({ mijn, vast, geplaatst }: { mijn: Community[]; vast?: number; geplaatst: () => void }) {
  const [tekst, setTekst] = useState("");
  const [waar, setWaar] = useState<number>(vast ?? mijn[0]?.id ?? 0);
  const [beeld, setBeeld] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState("");
  const kies = useRef<HTMLInputElement>(null);
  const actief = tekst.length > 0 || beeld !== null;

  async function plaats() {
    setBezig(true);
    setFout("");
    try {
      await plaatsen(waar, tekst.trim(), beeld);
      setTekst("");
      setBeeld(null);
      geplaatst();
    } catch (e) {
      setFout(foutVan(e));
    } finally {
      setBezig(false);
    }
  }

  return (
    <section className="mx-6 flex flex-col gap-2 rounded-2xl bg-vlak px-4 py-3">
      <textarea value={tekst} onChange={(e) => setTekst(e.target.value)} rows={actief ? 3 : 1} maxLength={2000}
        placeholder="Deel iets met je community" aria-label="Bericht"
        className="w-full resize-none bg-transparent text-[16px] outline-none placeholder:text-zacht" />
      {beeld && (
        <div className="relative w-fit">
          <img src={beeld} alt="Gekozen foto" className="max-h-48 rounded-xl" />
          <button onClick={() => setBeeld(null)} aria-label="Foto weghalen"
            className="absolute top-1.5 right-1.5 flex size-8 items-center justify-center rounded-full bg-black/60 text-white"><Kruis className="size-4" /></button>
        </div>
      )}
      <div className="flex items-center gap-2">
        <button onClick={() => kies.current?.click()} aria-label="Foto toevoegen"
          className="flex size-9 items-center justify-center rounded-full text-rustig hover:bg-white dark:hover:bg-[#2a2a30]"><Beeld className="size-5" /></button>
        <input ref={kies} type="file" accept="image/*" hidden onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          try { setBeeld(await fotoVerkleinen(f)); } catch (er) { setFout(foutVan(er)); }
        }} />
        {vast === undefined && mijn.length > 1 ? (
          <select value={waar} onChange={(e) => setWaar(Number(e.target.value))} aria-label="In welke community"
            className="h-9 min-w-0 flex-1 truncate rounded-full bg-white px-3 text-sm outline-none dark:bg-[#2a2a30]">
            {mijn.map((c) => <option key={c.id} value={c.id}>{c.naam}</option>)}
          </select>
        ) : <span className="flex-1" />}
        <button disabled={bezig || !(tekst.trim() || beeld)} onClick={plaats}
          className="h-9 shrink-0 rounded-full bg-accent px-4 text-sm font-medium text-white disabled:opacity-30">Plaatsen</button>
      </div>
      {actief && <p className="text-[12px] text-zacht">De feed is niet versleuteld zoals de kanalen. Leden zien hem, en bij een openbare community iedereen in de app.</p>}
      {fout && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{fout}</p>}
    </section>
  );
}

/** De lijst met berichten. Laadt opnieuw als de keuze verandert. */
export function Berichten({ keuze, community, leeg }: { keuze: FeedInstelling; community?: number; leeg: string }) {
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [fout, setFout] = useState("");
  const [meer, setMeer] = useState(false);

  useEffect(() => {
    let weg = false;
    feed(keuze, undefined, community).then((p) => {
      if (weg) return;
      setPosts(p);
      setMeer(p.length === 20);
      setFout("");
    }).catch(() => !weg && setFout("De feed laden lukte niet. Probeer het zo opnieuw."));
    return () => { weg = true; };
  }, [keuze, community]);

  async function verder() {
    const laatste = posts?.at(-1);
    if (!laatste) return;
    const p = await feed(keuze, laatste.aangemaakt, community).catch(() => []);
    setPosts((oud) => [...(oud ?? []), ...p.filter((x) => !oud?.some((o) => o.id === x.id))]);
    setMeer(p.length === 20);
  }

  const bij = (id: number, nieuw: Partial<Post> | null) =>
    setPosts((l) => (l ?? []).flatMap((p) => (p.id !== id ? [p] : nieuw ? [{ ...p, ...nieuw }] : [])));

  if (fout) return <p role="alert" className="px-6 text-[15px] text-rustig">{fout}</p>;
  if (posts === null) return <p className="bezig-tekst px-6 py-4 text-[15px]">Laden</p>;
  if (posts.length === 0) return <p className="px-6 py-4 text-[15px] text-rustig">{leeg}</p>;
  return (
    <>
      <ul className="flex flex-col divide-y divide-lijn border-y border-lijn">
        {posts.map((p) => <Bericht key={p.id} p={p} bij={(n) => bij(p.id, n)} toonCommunity={community === undefined} />)}
      </ul>
      {meer && <button onClick={verder} className="h-10 self-center rounded-full bg-vlak px-5 text-sm font-medium">Meer laden</button>}
    </>
  );
}

export function Bericht({ p, bij, toonCommunity, open = false }: { p: Post; bij: (n: Partial<Post> | null) => void;
  toonCommunity: boolean; open?: boolean }) {
  const [gesprek, setGesprek] = useState(open);
  const [beeld, setBeeld] = useState<string | null>(null);
  const [menu, setMenu] = useState<"" | "open" | "melden" | "weg">("");
  const [reden, setReden] = useState("");
  const [melding, setMelding] = useState("");

  useEffect(() => { if (p.heeft_foto) foto(p.id).then(setBeeld); }, [p.id, p.heeft_foto]);

  async function hart() {
    const aan = !p.ik_leuk;
    bij({ ik_leuk: aan, leuk: p.leuk + (aan ? 1 : -1) });
    await leuk(p.id, aan).catch(() => bij({ ik_leuk: p.ik_leuk, leuk: p.leuk }));
  }
  async function doe(actie: () => Promise<unknown>, klaar: () => void) {
    try { await actie(); klaar(); } catch (e) { setMelding(foutVan(e)); }
  }

  return (
    <li className="flex gap-3 px-6 py-4">
      <Rondje naam={p.auteur} id={p.auteur_id} />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className="flex min-w-0 items-baseline gap-1.5 text-[15px]">
          <span className="truncate font-semibold">{p.auteur}</span>
          <span className="shrink-0 text-[13px] text-zacht">{tijdje(p.aangemaakt)}</span>
        </p>
        {toonCommunity && (
          <p className="-mt-1.5 flex items-center gap-1 truncate text-[13px] text-rustig">
            {p.openbaar && !p.lid && <Wereld className="size-3.5 shrink-0" />}{p.community_naam}
          </p>
        )}
        {p.tekst && <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">{p.tekst}</p>}
        {p.heeft_foto && (beeld
          ? <img src={beeld} alt="" className="mt-1 max-h-[420px] w-full rounded-2xl bg-vlak object-cover" />
          : <span className="mt-1 aspect-[4/3] w-full rounded-2xl bg-vlak" />)}
        <div className="-ml-2 flex items-center gap-1">
          <button onClick={hart} aria-pressed={p.ik_leuk} aria-label={p.ik_leuk ? "Niet meer leuk" : "Leuk"}
            className={`flex h-9 items-center gap-1.5 rounded-full px-2 text-sm ${p.ik_leuk ? "text-red-500" : "text-rustig"}`}>
            <Hart vol={p.ik_leuk} className="size-5" />{p.leuk > 0 && <span className="tabular-nums">{p.leuk}</span>}
          </button>
          <button onClick={() => setGesprek(!gesprek)} aria-expanded={gesprek} aria-label="Reacties"
            className="flex h-9 items-center gap-1.5 rounded-full px-2 text-sm text-rustig">
            <Ballon className="size-5" />{(p.reacties ?? 0) > 0 && <span className="tabular-nums">{p.reacties}</span>}
          </button>
          <button onClick={() => deel(p, setMelding)} aria-label="Delen"
            className="flex size-9 items-center justify-center rounded-full text-rustig"><Delen className="size-5" /></button>
          <span className="flex-1" />
          <button onClick={() => setMenu(menu ? "" : "open")} aria-label="Meer" aria-expanded={!!menu}
            className="flex size-9 items-center justify-center rounded-full text-rustig hover:bg-vlak"><Meer className="size-5" /></button>
        </div>
        {menu === "open" && (
          <div className="opkomen flex flex-wrap justify-end gap-2">
            {!p.van_mij && <button onClick={() => setMenu("melden")} className="h-9 rounded-full bg-vlak px-4 text-sm">Melden</button>}
            {p.mag_weg && <button onClick={() => setMenu("weg")} className="h-9 rounded-full bg-vlak px-4 text-sm text-red-600 dark:text-red-400">Verwijderen</button>}
          </div>
        )}
        {menu === "melden" && (
          <div className="opkomen flex flex-col gap-2">
            <input value={reden} onChange={(e) => setReden(e.target.value)} maxLength={300} autoFocus
              placeholder="Wat is er mis? (mag leeg)" aria-label="Reden"
              className="h-11 rounded-2xl bg-vlak px-4 text-[15px] outline-none placeholder:text-zacht" />
            <div className="flex justify-end gap-2">
              <button onClick={() => setMenu("")} className="h-9 rounded-full px-4 text-sm text-rustig">Annuleer</button>
              <button onClick={() => doe(() => melden(p.id, reden.trim()), () => { setMenu(""); setMelding("Gemeld. Dank je."); })}
                className="h-9 rounded-full bg-accent px-4 text-sm font-medium text-white">Melden</button>
            </div>
          </div>
        )}
        {menu === "weg" && (
          <div className="opkomen flex items-center justify-end gap-2">
            <span className="flex-1 text-sm text-rustig">Bericht verwijderen?</span>
            <button onClick={() => setMenu("")} className="h-9 rounded-full px-4 text-sm text-rustig">Toch niet</button>
            <button onClick={() => doe(() => weghalen(p.id), () => bij(null))}
              className="h-9 rounded-full bg-red-600 px-4 text-sm font-medium text-white">Verwijderen</button>
          </div>
        )}
        {melding && <p role="status" className="break-all text-[13px] text-rustig">{melding}</p>}
        {gesprek && <Reacties post={p.id} aantal={(n) => bij({ reacties: n })} />}
      </div>
    </li>
  );
}

async function deel(p: Post, melding: (t: string) => void) {
  const url = postLink(p.id);
  const titel = `${p.auteur} in ${p.community_naam}`;
  if (navigator.share) {
    try { await navigator.share({ title: titel, text: p.tekst.slice(0, 120), url }); return; }
    catch (e) { if ((e as Error).name === "AbortError") return; }
  }
  try { await navigator.clipboard.writeText(url); melding("Link gekopieerd."); } catch { melding(url); }
}

/** De reacties onder een bericht, met een veld om zelf te reageren als je lid bent. */
function Reacties({ post, aantal }: { post: number; aantal: (n: number) => void }) {
  const [lijst, setLijst] = useState<Reactie[] | null>(null);
  const [mag, setMag] = useState(false);
  const [tekst, setTekst] = useState("");
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState("");
  const laden = useCallback(() => reactiesLaden(post).then((r) => {
    setLijst(r.reacties);
    setMag(r.magReageren);
    aantal(r.reacties.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }).catch((e) => setFout(foutVan(e))), [post]);
  useEffect(() => { laden(); }, [laden]);

  async function stuur(e: React.FormEvent) {
    e.preventDefault();
    if (!tekst.trim() || bezig) return;
    setBezig(true);
    setFout("");
    try {
      await reageren(post, tekst);
      setTekst("");
      await laden();
    } catch (er) {
      setFout(foutVan(er));
    } finally {
      setBezig(false);
    }
  }

  return (
    <div className="opkomen mt-1 flex flex-col gap-2">
      {lijst === null && !fout && <p className="bezig-tekst text-[13px] text-rustig">Laden</p>}
      {lijst?.map((r) => (
        <div key={r.id} className="flex gap-2">
          <Rondje naam={r.auteur} id={r.auteur_id} klein />
          <div className="min-w-0 flex-1 rounded-2xl bg-vlak px-3 py-2">
            <p className="flex items-baseline gap-1.5 text-[13px]">
              <span className="truncate font-semibold">{r.auteur}</span>
              <span className="shrink-0 text-zacht">{tijdje(r.aangemaakt)}</span>
              {r.mag_weg && <button onClick={() => reactieWeg(r.id).then(laden).catch((e) => setFout(foutVan(e)))}
                aria-label="Reactie weghalen" className="ml-auto shrink-0 text-zacht"><Kruis className="size-3.5" /></button>}
            </p>
            <p className="whitespace-pre-wrap break-words text-[15px]">{r.tekst}</p>
          </div>
        </div>
      ))}
      {lijst?.length === 0 && !mag && <p className="text-[13px] text-rustig">Nog geen reacties.</p>}
      {mag && (
        <form onSubmit={stuur} className="flex gap-2">
          <input value={tekst} onChange={(e) => setTekst(e.target.value)} maxLength={500} placeholder="Reageer..."
            aria-label="Reactie" className="h-10 min-w-0 flex-1 rounded-full bg-vlak px-4 text-[15px] outline-none placeholder:text-zacht" />
          <button disabled={!tekst.trim() || bezig} className="h-10 rounded-full bg-accent px-4 text-sm font-medium text-white disabled:opacity-40">
            Stuur</button>
        </form>
      )}
      {fout && <p role="alert" className="text-[13px] text-red-600 dark:text-red-400">{fout}</p>}
    </div>
  );
}

/** Een gedeeld bericht (?post=id), los geopend over de app, met de reacties eronder. */
export function PostBlad({ id, sluit }: { id: number; sluit: () => void }) {
  const [p, setP] = useState<Post | null>(null);
  const [fout, setFout] = useState("");
  useEffect(() => { postBekijken(id).then(setP).catch((e) => setFout(foutVan(e))); }, [id]);
  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/30" onClick={sluit}>
      <div role="dialog" aria-label="Bericht" onClick={(e) => e.stopPropagation()}
        className="flex max-h-[88%] w-full max-w-xl flex-col overflow-y-auto rounded-t-[28px] bg-white pt-3 pb-[max(env(safe-area-inset-bottom),16px)] dark:bg-[#16161a]">
        <div className="flex items-center justify-between px-3">
          <span className="size-10" />
          <span className="h-1 w-10 rounded-full bg-lijn" />
          <button onClick={sluit} aria-label="Sluiten" className="flex size-10 items-center justify-center rounded-full hover:bg-vlak">
            <Kruis className="size-5" /></button>
        </div>
        {fout && <p role="alert" className="px-6 py-6 text-[15px] text-rustig">{fout}</p>}
        {!p && !fout && <p className="bezig-tekst px-6 py-6 text-[15px]">Laden</p>}
        {p && <ul><Bericht p={p} bij={(n) => (n ? setP({ ...p, ...n }) : sluit())} toonCommunity open /></ul>}
      </div>
    </div>
  );
}

// Een kleine, eigen weergave van de opmaak die de assistent gebruikt: alinea's, lijstjes, kopjes, vet, schuin,
// code en links. Alles wordt als React-tekst getoond, dus HTML uit een antwoord wordt nooit uitgevoerd.
import { Fragment, type ReactNode } from "react";

const INLINE = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`|\[[^\]]+\]\((https?:\/\/[^\s)]+)\)|https?:\/\/[^\s)]+)/g;

export function inline(tekst: string): ReactNode[] {
  const uit: ReactNode[] = [];
  let laatste = 0;
  for (const m of tekst.matchAll(INLINE)) {
    if (m.index > laatste) uit.push(tekst.slice(laatste, m.index));
    const t = m[0];
    const k = `${m.index}`;
    if (t.startsWith("**")) uit.push(<strong key={k} className="font-semibold">{t.slice(2, -2)}</strong>);
    else if (t.startsWith("`")) uit.push(<code key={k} className="rounded bg-vlak px-1 text-[0.92em]">{t.slice(1, -1)}</code>);
    else if (t.startsWith("*")) uit.push(<em key={k}>{t.slice(1, -1)}</em>);
    else {
      const href = m[2] ?? t;
      const naam = m[2] ? t.slice(1, t.indexOf("](")) : new URL(t).hostname.replace(/^www\./, "");
      uit.push(<a key={k} href={href} target="_blank" rel="noopener noreferrer"
        className="font-medium text-accent underline decoration-accent/30 underline-offset-2">{naam}</a>);
    }
    laatste = m.index + t.length;
  }
  if (laatste < tekst.length) uit.push(tekst.slice(laatste));
  return uit;
}

type Blok = { soort: "p" | "ul" | "ol" | "h"; regels: string[] };

export function blokken(tekst: string): Blok[] {
  const uit: Blok[] = [];
  for (const ruw of tekst.split("\n")) {
    const regel = ruw.trimEnd();
    const ul = regel.match(/^\s*[-*•]\s+(.*)$/);
    const ol = regel.match(/^\s*\d+[.)]\s+(.*)$/);
    const h = regel.match(/^#{1,6}\s+(.*)$/);
    const vorige = uit[uit.length - 1];
    if (!regel.trim()) uit.push({ soort: "p", regels: [] });
    else if (h) uit.push({ soort: "h", regels: [h[1]] });
    else if (ul) vorige?.soort === "ul" ? vorige.regels.push(ul[1]) : uit.push({ soort: "ul", regels: [ul[1]] });
    else if (ol) vorige?.soort === "ol" ? vorige.regels.push(ol[1]) : uit.push({ soort: "ol", regels: [ol[1]] });
    else if (vorige?.soort === "p") vorige.regels.push(regel);
    else uit.push({ soort: "p", regels: [regel] });
  }
  return uit.filter((b) => b.regels.length);
}

export function Opmaak({ tekst }: { tekst: string }) {
  return (
    <div className="flex flex-col gap-2.5 leading-relaxed">
      {blokken(tekst).map((b, i) => {
        if (b.soort === "h") return <p key={i} className="font-semibold">{inline(b.regels[0])}</p>;
        if (b.soort === "p")
          return <p key={i}>{b.regels.map((r, j) => <Fragment key={j}>{j > 0 && <br />}{inline(r)}</Fragment>)}</p>;
        const Lijst = b.soort === "ul" ? "ul" : "ol";
        return (
          <Lijst key={i} className={`flex flex-col gap-1 pl-5 ${b.soort === "ul" ? "list-disc" : "list-decimal"} marker:text-zacht`}>
            {b.regels.map((r, j) => <li key={j}>{inline(r)}</li>)}
          </Lijst>
        );
      })}
    </div>
  );
}

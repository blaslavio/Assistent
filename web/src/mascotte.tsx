// De eigen mascotte van de app: Vonk, een vierpuntige ster met een kleurverloop en twee fonkelende vonkjes.
// Ogen volgen je, hij geeft tips, doet een dutje en viert feest.
// Tips beschrijven mogelijkheden — geen vooraf ingevulde teksten of fictieve bedragen.
import { useEffect, useId, useRef, useState } from "react";

const ALTIJD = [
  "Ik doe nooit iets met geld of mail zonder dat jij eerst ja zegt.",
  "Bij betalen zie je eerst bedrag en ontvanger. Jij bevestigt.",
  "In de assistent kun je ook praten: tik op de microfoon.",
  "Je gesprekken zijn versleuteld op je eigen toestel.",
  "Tik op mij voor de volgende tip.",
];
const OCHTEND = ["Goedemorgen. Vraag gerust wat er vandaag openstaat."];
const MIDDAG = ["Halverwege de dag. Ik help als je wilt bijsturen."];
const AVOND = ["Tot morgen. Je kunt me vragen wat er op de planning staat."];

const schud = (l: string[]) =>
  l.map((t) => [Math.random(), t] as const).sort((x, y) => x[0] - y[0]).map(([, t]) => t);

export function tipsVoorNu(nu = new Date()): string[] {
  const uur = nu.getHours();
  return [...schud(uur < 12 ? OCHTEND : uur < 18 ? MIDDAG : AVOND), ...schud(ALTIJD)];
}
export const TIPS = ALTIJD;

export type Stemming =
  | "wacht" | "kijkt" | "luistert" | "denkt" | "blij" | "slaapt" | "wijst" | "feest";

const rustig = () =>
  matchMedia("(prefers-reduced-motion: reduce)").matches ||
  document.documentElement.classList.contains("minder-beweging");

export const afgevinktTekst = (over: number) =>
  over === 0
    ? "Alles afgevinkt. Daar mag je trots op zijn!"
    : over === 1
      ? "Afgevinkt! Nog maar één te gaan."
      : `Afgevinkt! Nog ${over} te gaan.`;

let hier = 0;
export function mascotteZeg(tekst: string) {
  if (!hier) window.dispatchEvent(new CustomEvent("mascotte-los", { detail: tekst }));
  window.dispatchEvent(new CustomEvent("mascotte", { detail: tekst }));
}

/** Het figuurtje zelf; de bewegingen staan in index.css (mascotte-*, stemming-*). */
export function Mascotte({
  className = "",
  hup = 0,
  stemming = "wacht",
}: {
  className?: string;
  hup?: number;
  stemming?: Stemming;
}) {
  const blik = useRef<SVGGElement>(null);
  const verloop = `vonk${useId().replace(/:/g, "")}`;

  useEffect(() => {
    if (stemming !== "wacht" || rustig()) return;
    const g = blik.current;
    const kijk = (e: PointerEvent) => {
      if (!g) return;
      const r = g.ownerSVGElement!.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 3);
      const lengte = Math.hypot(dx, dy) || 1;
      g.style.transform = `translate(${(dx / lengte) * 2.5}px, ${(dy / lengte) * 2}px)`;
    };
    window.addEventListener("pointermove", kijk);
    window.addEventListener("pointerdown", kijk);
    return () => {
      window.removeEventListener("pointermove", kijk);
      window.removeEventListener("pointerdown", kijk);
      if (g) g.style.transform = "";
    };
  }, [stemming]);

  return (
    <span
      key={hup}
      className={`mascotte stemming-${stemming} inline-block ${hup ? "mascotte-hup" : ""} ${className}`}
    >
      <svg
        viewBox="0 0 120 120"
        aria-hidden
        className="pointer-events-none size-full select-none overflow-visible"
      >
        <defs>
          <linearGradient id={verloop} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#fbbf24" />
            <stop offset=".55" stopColor="#fb7185" />
            <stop offset="1" stopColor="#8b5cf6" />
          </linearGradient>
        </defs>
        <path className="mascotte-arm mascotte-arm-l" d="M14 22l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="#fbbf24" />
        <path className="mascotte-arm mascotte-arm-r" d="M104 30l1.5 4 4 1.5-4 1.5-1.5 4-1.5-4-4-1.5 4-1.5z" fill="#a78bfa" />
        <path className="mascotte-vonkje" d="M100 96l1.5 4 4 1.5-4 1.5-1.5 4-1.5-4-4-1.5 4-1.5z" fill="#fb7185" />
        <g className="mascotte-lijf">
          <path
            d="M60 8C64 40 80 56 112 60 80 64 64 80 60 112 56 80 40 64 8 60 40 56 56 40 60 8Z"
            fill={`url(#${verloop})`}
            stroke={`url(#${verloop})`}
            strokeWidth="10"
            strokeLinejoin="round"
          />
          <g ref={blik} className="mascotte-blik">
            <ellipse className="mascotte-ogen" cx="52" cy="58" rx="4" ry="5.5" fill="#16161a" />
            <ellipse className="mascotte-ogen" cx="68" cy="58" rx="4" ry="5.5" fill="#16161a" />
          </g>
          <path d="M54 68Q60 73 66 68" fill="none" stroke="#16161a" strokeWidth="2.6" strokeLinecap="round" />
          <ellipse cx="46" cy="66" rx="4" ry="2.4" fill="#fff" opacity=".45" />
          <ellipse cx="74" cy="66" rx="4" ry="2.4" fill="#fff" opacity=".45" />
        </g>
      </svg>
    </span>
  );
}

const REACTIES = ["Hoi! Tik nog eens voor een andere tip.", "Ik ben er.", "Haha, dat kietelt.", "Nog een tip?"];

export function MascotteMetTip({ tips: eigen }: { tips?: string[] }) {
  const [tips] = useState(() => eigen ?? tipsVoorNu());
  const [i, setI] = useState(0);
  const [hup, setHup] = useState(0);
  const [tekst, setTekst] = useState<string | null>(null);
  const [stemming, setStemming] = useState<Stemming>("wacht");
  const tikken = useRef<number[]>([]);
  const stil = useRef(0);
  const terug = useRef(0);

  const even = (s: Stemming, ms: number) => {
    clearTimeout(terug.current);
    setStemming(s);
    terug.current = window.setTimeout(() => setStemming("wacht"), ms);
  };

  useEffect(() => {
    hier += 1;
    return () => {
      hier -= 1;
      clearTimeout(terug.current);
    };
  }, []);

  useEffect(() => {
    const wakker = () => {
      clearTimeout(stil.current);
      setStemming((s) => (s === "slaapt" ? "wacht" : s));
      stil.current = window.setTimeout(() => {
        setStemming("slaapt");
        setTekst("Zzz\u2026 tik op me als je me nodig hebt.");
      }, 60_000);
    };
    wakker();
    window.addEventListener("pointerdown", wakker);
    return () => {
      clearTimeout(stil.current);
      window.removeEventListener("pointerdown", wakker);
    };
  }, []);

  useEffect(() => {
    const zeg = (e: Event) => {
      setTekst((e as CustomEvent<string>).detail);
      even("feest", 2200);
    };
    window.addEventListener("mascotte", zeg);
    return () => window.removeEventListener("mascotte", zeg);
  }, []);

  useEffect(() => {
    if (rustig() || tekst) return;
    const t = setInterval(() => {
      setI((x) => (x + 1) % tips.length);
      even("wijst", 1800);
    }, 12_000);
    return () => clearInterval(t);
  }, [tips.length, tekst]);

  function tik() {
    const nu = Date.now();
    tikken.current = [...tikken.current.filter((t) => nu - t < 1200), nu];
    setHup((h) => h + 1);
    if (stemming === "slaapt") {
      setStemming("wacht");
      setTekst("Oh! Ik was even weg. Waar waren we?");
      return;
    }
    if (tikken.current.length >= 3) {
      tikken.current = [];
      setTekst(REACTIES[2]);
      even("blij", 1600);
      return;
    }
    setTekst(null);
    setI((x) => (x + 1) % tips.length);
    even("wijst", 1800);
  }

  return (
    <div className="flex select-none items-end gap-3">
      <button
        type="button"
        onClick={tik}
        aria-label="Tik op de mascotte voor een volgende tip"
        className="shrink-0 rounded-2xl active:scale-95"
      >
        <Mascotte hup={hup} stemming={stemming} className="size-16" />
      </button>
      <p
        key={tekst ?? i}
        aria-live="polite"
        className="opkomen relative mb-4 rounded-2xl rounded-bl-md bg-vlak px-4 py-3 text-[15px] leading-snug text-rustig"
      >
        {tekst ?? tips[i]}
      </p>
    </div>
  );
}

export function MascotteFeest() {
  const [tekst, setTekst] = useState<string | null>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    let weg = 0;
    const zeg = (e: Event) => {
      clearTimeout(weg);
      setTekst((e as CustomEvent<string>).detail);
      setN((x) => x + 1);
      weg = window.setTimeout(() => setTekst(null), 3200);
    };
    window.addEventListener("mascotte-los", zeg);
    return () => {
      clearTimeout(weg);
      window.removeEventListener("mascotte-los", zeg);
    };
  }, []);
  if (!tekst) return null;
  return (
    <div
      key={n}
      role="status"
      className="pointer-events-none fixed inset-x-0 bottom-24 z-40 flex justify-center px-6 opkomen"
    >
      <div className="flex max-w-sm items-end gap-2 rounded-3xl bg-white/95 py-2 pl-2 pr-4 shadow-lg ring-1 ring-lijn backdrop-blur dark:bg-[#16161a]/95">
        <Mascotte stemming="feest" className="size-11 shrink-0" />
        <p className="mb-1.5 text-[15px] leading-snug">{tekst}</p>
      </div>
    </div>
  );
}

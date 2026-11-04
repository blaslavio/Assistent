// De eigen mascotte van de app: een rond figuurtje met een vonkje, in de kleur van de app. Ogen volgen je,
// hij geeft tips, doet een dutje en viert feest.
// Tips beschrijven mogelijkheden — geen vooraf ingevulde teksten of fictieve bedragen.
import { useEffect, useRef, useState } from "react";

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

  useEffect(() => {
    if (stemming !== "wacht" || rustig()) return;
    const g = blik.current;
    const kijk = (e: PointerEvent) => {
      if (!g) return;
      const r = g.ownerSVGElement!.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 3);
      const lengte = Math.hypot(dx, dy) || 1;
      g.style.transform = `translate(${(dx / lengte) * 3}px, ${(dy / lengte) * 2.5}px)`;
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
        viewBox="0 0 100 120"
        aria-hidden
        className="mascotte-lijf pointer-events-none size-full select-none overflow-visible text-accent"
      >
        <path d="M50 1.5 52.4 7.6 58.5 10 52.4 12.4 50 18.5 47.6 12.4 41.5 10 47.6 7.6Z" fill="currentColor" opacity="0.75" />
        <path
          className="mascotte-arm mascotte-arm-l"
          d="M17 70Q6 73 7 85"
          fill="none"
          stroke="currentColor"
          strokeWidth="7"
          strokeLinecap="round"
        />
        <path
          className="mascotte-arm mascotte-arm-r"
          d="M83 70Q94 73 93 85"
          fill="none"
          stroke="currentColor"
          strokeWidth="7"
          strokeLinecap="round"
        />
        <path d="M50 20C75 20 87 41 87 67 87 94 71 110 50 110 29 110 13 94 13 67 13 41 25 20 50 20Z" fill="currentColor" />
        <ellipse cx="50" cy="84" rx="23" ry="18" fill="white" opacity="0.16" />
        <ellipse cx="33" cy="38" rx="7" ry="3.6" transform="rotate(-35 33 38)" fill="white" opacity="0.35" />
        <ellipse className="mascotte-ogen" cx="38" cy="60" rx="8.5" ry="10" fill="white" />
        <ellipse className="mascotte-ogen" cx="62" cy="60" rx="8.5" ry="10" fill="white" />
        <g ref={blik} className="mascotte-blik">
          <circle cx="38" cy="62" r="4.6" fill="#1c1c22" />
          <circle cx="62" cy="62" r="4.6" fill="#1c1c22" />
          <circle cx="39.6" cy="60.2" r="1.5" fill="white" />
          <circle cx="63.6" cy="60.2" r="1.5" fill="white" />
        </g>
        <ellipse cx="29" cy="76" rx="5" ry="3" fill="#fb7185" opacity="0.35" />
        <ellipse cx="71" cy="76" rx="5" ry="3" fill="#fb7185" opacity="0.35" />
        <path d="M44 79Q50 84 56 79" fill="none" stroke="#1c1c22" strokeWidth="2.6" strokeLinecap="round" opacity="0.8" />
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
        <Mascotte hup={hup} stemming={stemming} className="h-16 w-[54px]" />
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
        <Mascotte stemming="feest" className="h-12 w-10 shrink-0" />
        <p className="mb-1.5 text-[15px] leading-snug">{tekst}</p>
      </div>
    </div>
  );
}

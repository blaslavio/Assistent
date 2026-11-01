// Paperclip-mascotte (Clippy-stijl). Ogen volgen, tips, dutje, feest (inklappen).
// Tips beschrijven mogelijkheden — geen vooraf ingevulde teksten of fictieve bedragen.
import { useEffect, useRef, useState } from "react";

const ALTIJD = [
  "Ik doe nooit iets met geld of mail zonder dat jij eerst ja zegt.",
  "Bij betalen zie je eerst bedrag en ontvanger. Jij bevestigt.",
  "Veeg de balk in de chat omlaag voor het hele scherm.",
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

/** Paperclip-figuur met Clippy-beweging (CSS-klassen in index.css). */
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
      g.style.transform = `translate(${(dx / lengte) * 6}px, ${(dy / lengte) * 5}px)`;
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
        viewBox="0 0 80 120"
        aria-hidden
        className="mascotte-lijf pointer-events-none size-full select-none overflow-visible text-[#145b48] dark:text-[#6fcfae]"
      >
        <path
          fill="none"
          stroke="currentColor"
          strokeWidth="10"
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M28 108C18 108 12 98 12 88L12 28C12 14 22 6 34 6L48 6C62 6 70 16 70 28L70 78C70 90 62 98 50 98L36 98C28 98 24 92 24 86L24 36C24 28 30 24 36 24L44 24C50 24 54 28 54 34L54 72"
        />
        <g ref={blik} className="mascotte-blik">
          <ellipse className="mascotte-ogen" cx="34" cy="42" rx="4.2" ry="5.5" fill="currentColor" />
          <ellipse className="mascotte-ogen" cx="50" cy="42" rx="4.2" ry="5.5" fill="currentColor" />
        </g>
        <path
          className="mascotte-arm mascotte-arm-l"
          d="M22 70Q12 78 16 92"
          fill="none"
          stroke="currentColor"
          strokeWidth="8"
          strokeLinecap="round"
        />
        <path
          className="mascotte-arm mascotte-arm-r"
          d="M78 70Q90 76 86 92"
          fill="none"
          stroke="currentColor"
          strokeWidth="8"
          strokeLinecap="round"
        />
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
        setTekst("Zzz… tik op me als je me nodig hebt.");
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
        aria-label="Tik op de paperclip voor een volgende tip"
        className="shrink-0 rounded-2xl active:scale-95"
      >
        <Mascotte hup={hup} stemming={stemming} className="h-16 w-[52px]" />
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

export function MascotteCompanion() {
  const [open, setOpen] = useState(false);
  const [tips] = useState(() => tipsVoorNu());
  const [i, setI] = useState(0);
  const [hup, setHup] = useState(0);
  const [stemming, setStemming] = useState<Stemming>("wacht");
  const [eventTekst, setEventTekst] = useState<string | null>(null);
  const terug = useRef(0);

  useEffect(() => {
    const zeg = (e: Event) => {
      clearTimeout(terug.current);
      setEventTekst((e as CustomEvent<string>).detail);
      setStemming("feest");
      setOpen(true);
      terug.current = window.setTimeout(() => {
        setStemming("wacht");
        setEventTekst(null);
      }, 2200);
    };
    window.addEventListener("mascotte-los", zeg);
    return () => {
      clearTimeout(terug.current);
      window.removeEventListener("mascotte-los", zeg);
    };
  }, []);

  return (
    <div className="pointer-events-none fixed bottom-24 right-4 z-40 flex flex-col items-end gap-2">
      {open && (
        <div
          role="status"
          className="pointer-events-auto opkomen max-w-[240px] rounded-2xl border border-lijn bg-white/95 px-3 py-2.5 text-[13px] leading-snug shadow-lg backdrop-blur dark:bg-[#16161a]/95"
        >
          {eventTekst ?? tips[i % tips.length]}
        </div>
      )}
      <button
        type="button"
        className="pointer-events-auto flex size-14 items-center justify-center rounded-2xl border border-lijn bg-white/95 shadow-lg backdrop-blur transition active:scale-95 dark:bg-[#16161a]/95"
        aria-label="Paperclip"
        aria-expanded={open}
        onClick={() => {
          setHup((h) => h + 1);
          setEventTekst(null);
          setOpen(true);
          setI((x) => (open ? x + 1 : x));
          setStemming("wijst");
          clearTimeout(terug.current);
          terug.current = window.setTimeout(() => setStemming("wacht"), 1600);
        }}
      >
        <Mascotte hup={hup} stemming={stemming} className="h-11 w-9" />
      </button>
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
        <Mascotte stemming="feest" className="h-12 w-[39px] shrink-0" />
        <p className="mb-1.5 text-[15px] leading-snug">{tekst}</p>
      </div>
    </div>
  );
}

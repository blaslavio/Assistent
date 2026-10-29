// De goedgekeurde mascotte (assets/assistant_source.svg). Hij beweegt licht, volgt je vinger met zijn ogen, reageert
// als je op hem tikt en op wat je in de app doet, en dut in als je even niets doet.
import { useEffect, useId, useRef, useState } from "react";

// De ogen staan los van het lijf, zodat ze kunnen knipperen.
const OGEN = "M 760,361 L 757,362 L 753,366 L 750,373 L 750,389 L 751,390 L 751,394 L 757,409 L 762,415 L 768,419 L 771,419 L 772,420 L 777,419 L 782,415 L 785,409 L 786,396 L 785,395 L 784,386 L 781,380 L 781,378 L 780,378 L 780,380 L 776,384 L 773,384 L 769,380 L 769,374 L 770,372 L 773,370 L 776,370 L 776,369 L 770,363 L 766,361 Z M 846,326 L 841,329 L 838,335 L 838,338 L 837,339 L 837,353 L 838,354 L 838,358 L 839,359 L 839,362 L 841,368 L 846,378 L 851,383 L 855,385 L 860,385 L 867,379 L 868,373 L 869,372 L 869,357 L 868,356 L 868,352 L 865,344 L 864,347 L 861,350 L 859,350 L 855,347 L 854,345 L 854,340 L 860,335 L 860,333 L 855,328 L 850,326 Z";
const LIJF = "M 852,221 L 850,221 L 847,219 L 845,219 L 842,217 L 830,213 L 826,213 L 820,211 L 814,211 L 813,210 L 800,210 L 799,209 L 771,211 L 770,212 L 766,212 L 765,213 L 761,213 L 757,215 L 754,215 L 745,218 L 742,220 L 737,221 L 719,230 L 705,239 L 689,252 L 680,261 L 669,274 L 660,287 L 647,312 L 639,337 L 639,341 L 637,347 L 637,352 L 636,353 L 636,361 L 635,362 L 635,385 L 636,386 L 636,395 L 637,396 L 637,402 L 638,403 L 639,412 L 643,424 L 643,427 L 647,439 L 649,442 L 650,447 L 653,452 L 653,454 L 663,475 L 665,477 L 665,479 L 668,483 L 668,485 L 673,492 L 679,504 L 683,509 L 685,514 L 689,519 L 690,522 L 694,527 L 695,530 L 699,535 L 710,554 L 713,557 L 717,565 L 721,570 L 721,572 L 729,584 L 729,586 L 735,595 L 736,599 L 741,608 L 741,610 L 748,625 L 748,628 L 752,638 L 753,647 L 755,652 L 755,659 L 756,660 L 756,687 L 755,688 L 755,694 L 754,695 L 754,698 L 753,699 L 753,702 L 751,706 L 750,712 L 742,728 L 734,739 L 719,754 L 711,760 L 692,770 L 670,777 L 658,778 L 657,779 L 630,779 L 629,778 L 623,778 L 622,777 L 618,777 L 614,775 L 611,775 L 605,773 L 593,767 L 585,761 L 578,752 L 575,744 L 575,733 L 576,732 L 577,725 L 584,712 L 604,691 L 613,684 L 633,671 L 666,654 L 668,654 L 679,648 L 681,648 L 683,646 L 685,646 L 692,642 L 694,642 L 706,636 L 715,633 L 724,628 L 729,627 L 733,625 L 723,602 L 719,602 L 710,606 L 708,606 L 705,608 L 703,608 L 700,610 L 698,610 L 695,612 L 685,615 L 680,618 L 673,620 L 658,627 L 656,627 L 647,632 L 645,632 L 619,645 L 595,660 L 575,676 L 568,683 L 555,700 L 547,716 L 547,719 L 544,727 L 544,733 L 543,734 L 543,744 L 544,745 L 545,754 L 549,763 L 549,765 L 553,772 L 567,787 L 574,791 L 577,794 L 587,799 L 589,799 L 591,801 L 594,801 L 597,803 L 603,804 L 607,806 L 611,806 L 612,807 L 616,807 L 622,809 L 631,809 L 632,810 L 656,810 L 657,809 L 665,809 L 666,808 L 671,808 L 672,807 L 681,806 L 685,804 L 688,804 L 692,802 L 698,801 L 703,798 L 710,796 L 725,788 L 737,780 L 758,760 L 763,754 L 773,738 L 779,725 L 782,716 L 782,713 L 784,709 L 785,701 L 786,700 L 786,695 L 787,694 L 787,686 L 788,685 L 788,663 L 787,662 L 787,654 L 785,648 L 785,643 L 784,642 L 784,638 L 780,626 L 780,623 L 778,620 L 777,615 L 775,612 L 771,600 L 756,571 L 752,566 L 750,561 L 743,551 L 739,543 L 736,540 L 734,535 L 727,526 L 718,510 L 713,504 L 706,491 L 703,488 L 702,484 L 692,468 L 692,466 L 690,464 L 678,438 L 671,417 L 671,413 L 670,412 L 669,404 L 668,403 L 668,398 L 667,397 L 667,390 L 666,389 L 666,365 L 667,364 L 667,357 L 668,356 L 668,351 L 669,350 L 670,342 L 674,330 L 678,322 L 678,320 L 680,318 L 688,302 L 702,284 L 712,274 L 732,259 L 739,256 L 741,254 L 743,254 L 745,252 L 747,252 L 752,249 L 767,244 L 775,243 L 776,242 L 783,242 L 784,241 L 808,241 L 809,242 L 814,242 L 815,243 L 824,244 L 845,253 L 856,261 L 867,272 L 876,285 L 880,293 L 884,305 L 885,313 L 886,314 L 886,319 L 887,320 L 887,332 L 888,333 L 887,335 L 887,338 L 888,339 L 887,342 L 887,356 L 886,357 L 886,364 L 885,365 L 884,375 L 883,376 L 883,379 L 881,383 L 880,390 L 876,402 L 873,407 L 873,409 L 867,421 L 867,423 L 865,425 L 865,427 L 859,438 L 857,440 L 855,445 L 837,472 L 820,495 L 815,505 L 813,507 L 807,521 L 807,524 L 805,529 L 805,544 L 809,555 L 816,563 L 827,569 L 830,569 L 831,570 L 848,570 L 849,569 L 853,569 L 862,566 L 878,558 L 898,542 L 910,530 L 910,529 L 923,515 L 948,482 L 963,467 L 967,464 L 974,461 L 980,461 L 983,463 L 985,467 L 985,479 L 984,480 L 983,489 L 979,501 L 962,539 L 961,545 L 964,553 L 968,555 L 974,555 L 981,551 L 987,545 L 989,541 L 992,538 L 1005,515 L 1005,513 L 1011,500 L 1011,497 L 1013,493 L 1014,485 L 1015,484 L 1015,479 L 1016,478 L 1016,461 L 1015,460 L 1014,453 L 1009,443 L 1006,439 L 1000,434 L 987,429 L 971,429 L 962,432 L 954,436 L 945,442 L 938,449 L 937,449 L 937,450 L 921,467 L 918,472 L 913,477 L 907,486 L 897,497 L 893,503 L 882,515 L 881,515 L 867,528 L 858,534 L 849,538 L 839,539 L 836,536 L 836,529 L 842,516 L 852,501 L 853,498 L 859,491 L 863,484 L 872,472 L 873,469 L 876,466 L 878,461 L 888,445 L 897,426 L 897,424 L 901,417 L 902,412 L 904,409 L 905,404 L 908,398 L 908,395 L 910,391 L 910,387 L 913,379 L 913,375 L 914,374 L 915,365 L 916,364 L 917,347 L 918,346 L 918,325 L 917,324 L 917,315 L 916,314 L 915,303 L 914,302 L 914,299 L 911,292 L 911,289 L 909,283 L 907,280 L 907,278 L 905,276 L 905,274 L 902,270 L 902,268 L 893,254 L 878,238 L 866,229 Z";

// Tips die zeggen wat je met de app kunt, niet hoe hij werkt. Per moment van de dag een eigen stapel, en binnen
// een bezoek nooit twee keer dezelfde.
const ALTIJD = [
  "Typ \u201emorgen 9 uur tandarts\u201d en het staat in je agenda. Zonder knoppen, zonder formulier.",
  "Typ \u201e\u20ac12,50 lunch\u201d en je budget weet het. Aan het eind van de maand zie je waar je geld bleef.",
  "Zet je bankafschrift in Budget en ik sorteer honderden betalingen in een paar seconden.",
  "Iets verkopen? Een foto en een prijs, en het staat in de winkel. Bezorgen of ophalen kies jij.",
  "Betaal je via de app, dan staat je geld vast tot jij zegt dat alles klopt. Pas dan krijgt de verkoper het.",
  "Een story blijft 24 uur staan en alleen je contacten zien hem. Daarna is hij echt weg.",
  "Je gesprekken zijn versleuteld op je eigen toestel. Ook wij kunnen ze niet lezen.",
  "Met je boekingspagina plant iemand zonder account een afspraak in, op een tijd die jij vrij hebt.",
  "Een brief nodig? Documenten maakt er een Word- of PDF-bestand van, klaar om te mailen.",
  "Veeg de balk in de chat naar beneden, dan heb je het hele scherm voor je gesprek.",
  "Ik doe nooit iets met geld, mail of berichten zonder dat jij eerst ja zegt.",
  "Zet in je profiel een zin over jezelf. Kopers vertrouwen een verkoper met een gezicht sneller.",
];
const OCHTEND = [
  "Goedemorgen. Vraag \u201eplan mijn dag\u201d en ik zet je taken tussen je afspraken.",
  "Even kijken wat vandaag brengt? Hieronder zie je wat er straks is en hoeveel tijd je nog hebt.",
];
const MIDDAG = [
  "Halverwege de dag. Vraag wat er nog open staat, dan krijg je alleen wat echt nog moet.",
  "Boodschappen voor vanavond? Zet ze op je lijst en vink ze af terwijl je door de winkel loopt.",
];
const AVOND = [
  "Wat staat er morgen? Vraag het, en je weet het voor je gaat slapen.",
  "Rustig avondje? Kijk in de winkel wat mensen bij jou in de buurt verkopen.",
];

const schud = (l: string[]) => l.map((t) => [Math.random(), t] as const).sort((x, y) => x[0] - y[0]).map(([, t]) => t);

/** De tips voor dit moment van de dag eerst, daarna de rest, elke keer in een andere volgorde. */
export function tipsVoorNu(nu = new Date()): string[] {
  const uur = nu.getHours();
  return [...schud(uur < 12 ? OCHTEND : uur < 18 ? MIDDAG : AVOND), ...schud(ALTIJD)];
}
export const TIPS = ALTIJD;

// Het lijf zonder de krul rechts, en de twee armen (de krul is de rechterarm).
const ZONDER_KRUL = "533,199 1026,199 1026,425 905,425 888,455 870,490 868,820 533,820";
const ARM_R = "M862 551C902 548 932 515 952 475C965 450 990 440 987 478C985 505 972 528 958 548";
const ARM_L = "M668 512C640 522 614 540 598 572";

export type Stemming = "wacht" | "kijkt" | "luistert" | "denkt" | "blij" | "slaapt" | "wijst" | "feest";

const rustig = () => matchMedia("(prefers-reduced-motion: reduce)").matches
  || document.documentElement.classList.contains("minder-beweging");

/** Laat de mascotte reageren op iets wat je deed, waar hij ook staat. Bijvoorbeeld: een taak afgevinkt. */
/** Wat hij zegt als je een taak afvinkt, met hoeveel er nog over zijn. */
export const afgevinktTekst = (over: number) => over === 0 ? "Alles afgevinkt. Daar mag je trots op zijn!"
  : over === 1 ? "Afgevinkt! Nog maar één te gaan." : `Afgevinkt! Nog ${over} te gaan.`;

let hier = 0;
export function mascotteZeg(tekst: string) {
  if (!hier) window.dispatchEvent(new CustomEvent("mascotte-los", { detail: tekst }));
  window.dispatchEvent(new CustomEvent("mascotte", { detail: tekst }));
}

/** Zweeft zachtjes, wiegt een beetje en knippert af en toe met zijn ogen. Met een stemming reageert hij op wat je
 * doet: hij kijkt mee als je typt, luistert als je praat en denkt na als hij bezig is. `hup` laat hem opspringen.
 * Staat stil bij "Minder beweging". */
export function Mascotte({ className = "", hup = 0, stemming = "wacht" }: { className?: string; hup?: number; stemming?: Stemming }) {
  const blik = useRef<SVGGElement>(null);
  const knip = `krul${useId().replace(/:/g, "")}`;
  // De ogen volgen je vinger of muis, zolang hij niet zelf ergens naar kijkt.
  useEffect(() => {
    if (stemming !== "wacht" || rustig()) return;
    const g = blik.current;
    const kijk = (e: PointerEvent) => {
      if (!g) return;
      const r = g.ownerSVGElement!.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 3);
      const lengte = Math.hypot(dx, dy) || 1;
      g.style.transform = `translate(${(dx / lengte) * 22}px, ${(dy / lengte) * 22}px)`;
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
    <span key={hup} className={`mascotte stemming-${stemming} inline-block ${hup ? "mascotte-hup" : ""} ${className}`}>
      <svg viewBox="533 199 493 621" aria-hidden className="mascotte-lijf pointer-events-none size-full select-none overflow-visible text-[#145b48] dark:text-[#6fcfae]">
        <clipPath id={knip}><polygon points={ZONDER_KRUL} /></clipPath>
        <path fill="currentColor" fillRule="evenodd" d={LIJF} clipPath={`url(#${knip})`} />
        {/* Twee armen die vanaf de schouder draaien: zwaaien, wijzen en juichen. De rechter is de krul van het
            lijf zelf: die knippen we uit de tekening en tekenen hem los opnieuw, zodat hij kan bewegen. */}
        <path className="mascotte-arm mascotte-arm-l" d={ARM_L} fill="none" stroke="currentColor" strokeWidth="30" strokeLinecap="round" />
        <path className="mascotte-arm mascotte-arm-r" d={ARM_R} fill="none" stroke="currentColor" strokeWidth="30" strokeLinecap="round" />
        <g ref={blik} className="mascotte-blik">
          <path className="mascotte-ogen" fill="currentColor" fillRule="evenodd" d={OGEN} />
        </g>
      </svg>
    </span>
  );
}

const REACTIES = ["Hoi! Tik nog eens voor een andere tip.", "Ik ben er. Waar zal ik mee helpen?", "Haha, dat kietelt.",
  "Nog een tip? Komt eraan."];

/** De mascotte met een tip. Tik op hem voor een volgende tip of een reactie; vaak achter elkaar tikken kietelt.
 * Doe je een minuut niets, dan dut hij in. Wat je in de app doet (mascotteZeg) zegt hij hardop. */
export function MascotteMetTip({ tips: eigen }: { tips?: string[] }) {
  const [tips] = useState(() => eigen ?? tipsVoorNu());
  const [i, setI] = useState(0);
  const [hup, setHup] = useState(0);
  const [tekst, setTekst] = useState<string | null>(null);
  const [stemming, setStemming] = useState<Stemming>("wacht");
  const tikken = useRef<number[]>([]);
  const stil = useRef(0);
  const terug = useRef(0);
  // Even een stemming laten zien en daarna weer gewoon wachten.
  const even = (s: Stemming, ms: number) => {
    clearTimeout(terug.current);
    setStemming(s);
    terug.current = window.setTimeout(() => setStemming("wacht"), ms);
  };

  // Zolang hij op het scherm staat, viert hij zelf feest; anders doet de kleine mascotte onderin dat.
  useEffect(() => { hier += 1; return () => { hier -= 1; clearTimeout(terug.current); }; }, []);

  // Wakker houden: elke aanraking zet de slaapklok terug.
  useEffect(() => {
    const wakker = () => {
      clearTimeout(stil.current);
      setStemming((s) => (s === "slaapt" ? "wacht" : s));
      stil.current = window.setTimeout(() => { setStemming("slaapt"); setTekst("Zzz… tik op me als je me nodig hebt."); }, 60000);
    };
    wakker();
    window.addEventListener("pointerdown", wakker);
    return () => { clearTimeout(stil.current); window.removeEventListener("pointerdown", wakker); };
  }, []);

  // Reageren op wat je in de app doet.
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
    const t = setInterval(() => { setI((x) => (x + 1) % tips.length); even("wijst", 1800); }, 12000);
    return () => clearInterval(t);
  }, [tips.length, tekst]);

  function tik() {
    const nu = Date.now();
    tikken.current = [...tikken.current.filter((t) => nu - t < 1200), nu];
    setHup((h) => h + 1);
    if (stemming === "slaapt") { setStemming("wacht"); setTekst("Oh! Ik was even weg. Waar waren we?"); return; }
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
      <button type="button" onClick={tik} aria-label="Tik op de mascotte voor een volgende tip"
        className="shrink-0 rounded-2xl active:scale-95">
        <Mascotte hup={hup} stemming={stemming} className="h-16 w-[52px]" />
      </button>
      <p key={tekst ?? i} aria-live="polite" className="opkomen relative mb-4 rounded-2xl rounded-bl-md bg-vlak px-4 py-3 text-[15px] leading-snug text-rustig">
        {tekst ?? tips[i]}
      </p>
    </div>
  );
}

/** Iets gedaan op een scherm zonder mascotte, zoals een taak afvinken in de agenda: dan komt hij even onderin
 * juichen, klapt zich in als een paperclip en verdwijnt weer. */
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
    return () => { clearTimeout(weg); window.removeEventListener("mascotte-los", zeg); };
  }, []);
  if (!tekst) return null;
  return (
    <div key={n} role="status" className="pointer-events-none fixed inset-x-0 bottom-24 z-40 flex justify-center px-6 opkomen">
      <div className="flex max-w-sm items-end gap-2 rounded-3xl bg-white/95 py-2 pr-4 pl-2 shadow-lg ring-1 ring-lijn backdrop-blur dark:bg-[#16161a]/95">
        <Mascotte stemming="feest" className="h-12 w-[39px] shrink-0" />
        <p className="mb-1.5 text-[15px] leading-snug">{tekst}</p>
      </div>
    </div>
  );
}

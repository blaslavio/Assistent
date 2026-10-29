// Het scherm staat vast, zoals een echte app: niets schuift mee als je scrolt of als het toetsenbord opent.
// Alleen de lijsten in de app zelf scrollen. Bij een open toetsenbord krimpt de app tot het zichtbare deel,
// zodat het invoerveld vlak boven het toetsenbord staat, en verdwijnt de balk onderin.

const INVOER = "input:not([type=checkbox]):not([type=radio]):not([type=file]), textarea, [contenteditable=true]";

export function schermVastzetten() {
  const html = document.documentElement;
  const vv = window.visualViewport;
  const pas = () => {
    html.style.setProperty("--app-hoogte", `${Math.round(vv ? vv.height : window.innerHeight)}px`);
    if (window.scrollX || window.scrollY) window.scrollTo(0, 0);
  };
  vv?.addEventListener("resize", pas);
  vv?.addEventListener("scroll", pas);
  window.addEventListener("scroll", pas, { passive: true });
  window.addEventListener("resize", pas);
  pas();

  // Slepen op een deel dat zelf niet scrolt, verschuift op een iPhone het hele scherm (vooral met het toetsenbord
  // open). Dat houden we tegen; lijsten en vensters die wel scrollen, scrollen gewoon.
  document.addEventListener("touchmove", (e) => {
    if (e.touches.length > 1) return;
    for (let el = e.target as HTMLElement | null; el && el !== document.body; el = el.parentElement) {
      const stijl = getComputedStyle(el);
      if (/(auto|scroll)/.test(stijl.overflowY + stijl.overflowX)
        && (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1)) return;
      if (el.matches("input, textarea, canvas, video, iframe, [contenteditable=true], .leaflet-container, [data-sleep]")) return;
    }
    if (e.cancelable) e.preventDefault();
  }, { passive: false });

  // Tik je in een invoerveld, dan is het toetsenbord open (ook in het venster op de Streamlit-app, waar
  // het formaat van buitenaf komt).
  document.addEventListener("focusin", (e) => {
    if ((e.target as Element | null)?.matches?.(INVOER)) html.classList.add("toetsenbord-open");
  });
  document.addEventListener("focusout", () => {
    setTimeout(() => {
      if (!document.activeElement?.matches?.(INVOER)) html.classList.remove("toetsenbord-open");
      pas();
    }, 50);
  });
}

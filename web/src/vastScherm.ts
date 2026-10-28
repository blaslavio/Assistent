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

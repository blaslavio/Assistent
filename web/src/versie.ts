// Draait de app een oude versie uit de cache van de browser? Dan laden we de nieuwste. Dat gebeurt bij het openen en
// als je terugkomt in de app. In de Streamlit-app (één pagina zonder eigen adres) is dit niet nodig.

function eigenScript() {
  try {
    const u = new URL(import.meta.url);
    return u.protocol.startsWith("http") ? u.pathname.split("/").slice(-2).join("/") : "";
  } catch {
    return "";
  }
}

let bezig = false;

export async function versieControleren() {
  const eigen = eigenScript();
  if (!eigen || bezig) return;
  bezig = true;
  try {
    const r = await fetch(new URL(/* @vite-ignore */ "../versie.json", import.meta.url), { cache: "no-store" });
    const { script } = r.ok ? await r.json() as { script?: string } : {};
    // Eén keer per nieuwe versie, zodat de app nooit blijft herladen als de server nog even de oude geeft.
    if (script && script !== eigen && sessionStorage.getItem("assistent.versie") !== script) {
      sessionStorage.setItem("assistent.versie", script);
      // Een nieuw adres omzeilt een pagina die de browser nog bewaard heeft.
      const u = new URL(location.href);
      u.searchParams.set("v", script.replace(/\W/g, "").slice(-12));
      location.replace(u.href);
    }
  } catch {
    /* geen verbinding: dan gewoon de versie die er is */
  } finally {
    bezig = false;
  }
}

export function versieVolgen() {
  versieControleren();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") versieControleren();
  });
}

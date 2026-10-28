"""Optional Rive character renderer for Streamlit.

Place the approved exported animation at assets/assistant.riv. This module does
not generate or substitute character artwork.
"""
from __future__ import annotations

import base64
import json
import re
from pathlib import Path

STATES = ("idle", "listening", "thinking", "speaking", "success", "error")
DEFAULT_ASSET = Path(__file__).resolve().parent / "assets" / "assistant.riv"
DEFAULT_SVG = Path(__file__).resolve().parent / "assets" / "assistant_source.svg"


def normalized_state(value: str) -> str:
    return value if value in STATES else "idle"


def build_character_html(asset: bytes, state: str = "idle") -> str:
    """Create an isolated viewer. No user data or API keys are sent to Rive."""
    if not asset:
        raise ValueError("Rive asset is empty")
    encoded = json.dumps(base64.b64encode(asset).decode("ascii"))
    selected = json.dumps(normalized_state(state))
    return """<!doctype html>
<html lang="nl"><head><meta charset="utf-8">
<style>
html,body{margin:0;background:transparent;overflow:hidden}
main{height:100vh;display:grid;place-items:center}
canvas{width:100%;height:100%;max-height:240px}
#fallback{font:14px system-ui;color:inherit;text-align:left}
@media(prefers-reduced-motion:reduce){canvas{display:none}}
</style></head><body>
<main><canvas id="character" aria-label="AI-assistent" role="img"></canvas>
<span id="fallback" role="status" hidden>Assistent-animatie niet beschikbaar</span></main>
<script src="https://cdn.jsdelivr.net/npm/@rive-app/canvas@2.17.3/rive.js"></script>
<script>
const encoded = ENCODED_ASSET;
const desired = SELECTED_STATE;
const canvas = document.getElementById("character");
const fallback = document.getElementById("fallback");
function fail(){canvas.hidden=true;fallback.hidden=false;}
if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
  canvas.hidden=true;fallback.hidden=false;fallback.textContent="AI-assistent";
} else if (!window.rive) {fail();}
else {
  try {
    const bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));
    let character;
    character=new rive.Rive({
      buffer:bytes.buffer,
      canvas,
      autoplay:true,
      stateMachines:"Assistant",
      layout:new rive.Layout({fit:rive.Fit.contain,alignment:rive.Alignment.center}),
      onLoad:()=>{
        character.resizeDrawingSurfaceToCanvas();
        const inputs=character.stateMachineInputs("Assistant") || [];
        const input=inputs.find(i=>i.name==="status");
        // status is a Rive Number input: 0 idle, 1 listening,
        // 2 thinking, 3 speaking, 4 success, 5 error.
        if(input && input.type===rive.StateMachineInputType.Number)
          input.value=["idle","listening","thinking","speaking","success","error"].indexOf(desired);
      },
      onLoadError:fail
    });
    window.addEventListener("resize",()=>character.resizeDrawingSurfaceToCanvas());
  } catch(e){fail();}
}
</script></body></html>""".replace("ENCODED_ASSET", encoded).replace("SELECTED_STATE", selected)


def build_svg_fallback_html(svg: str, state: str = "idle") -> str:
    """Animate only our repository SVG until a compiled .riv exists."""
    # SVG source is committed alongside the app. Explicitly reject active content.
    if not svg.lstrip().startswith("<svg") or "</svg>" not in svg:
        raise ValueError("Invalid SVG")
    if re.search(r"<\s*(script|foreignObject|iframe|image|use)\b|\bon\w+\s*=|javascript:|<\!ENTITY", svg, re.I):
        raise ValueError("SVG contains unsupported elements")
    state = normalized_state(state)
    motion = {
        "idle": "sway 4s ease-in-out infinite",
        "listening": "sway 2.8s ease-in-out infinite",
        "thinking": "sway 1.6s ease-in-out infinite",
        "speaking": "pulse 1s ease-in-out infinite",
        "success": "pulse .7s ease-in-out 2",
        "error": "sway .7s ease-in-out 2",
    }[state]
    css = """<style>
      html,body{margin:0;background:transparent;overflow:hidden}
      main{height:100vh;display:grid;place-items:center}
      svg{width:100%;height:100%;max-height:220px;transform-origin:center;animation:ANIMATION}
      @keyframes sway{0%,100%{transform:rotate(-1deg) translateY(0)}50%{transform:rotate(1deg) translateY(-4px)}}
      @keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.035)}}
      @media(prefers-reduced-motion:reduce){svg{animation:none!important}}
    </style>""".replace("ANIMATION", motion)
    return "<!doctype html><html><head><meta charset='utf-8'>" + css + "</head><body><main>" + svg + "</main></body></html>"


def render_assistant_character(state: str = "idle", asset_path: Path | str = DEFAULT_ASSET,
                               height: int = 220) -> bool:
    """Use Rive when available; fall back to the approved vector animation."""
    path = Path(asset_path)
    if path.is_file():
        import streamlit.components.v1 as components
        components.html(build_character_html(path.read_bytes(), state), height=height, scrolling=False)
        return True
    if Path(asset_path) != DEFAULT_ASSET or not DEFAULT_SVG.is_file():
        return False
    import streamlit.components.v1 as components
    components.html(build_svg_fallback_html(DEFAULT_SVG.read_text(encoding="utf-8"), state),
                    height=height, scrolling=False)
    return True

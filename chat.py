"""Chat met end-to-end-versleuteling, gekoppeld aan de agenda. Zie chat_js.js en sql/chat.sql.

Versleutelen en ontsleutelen gebeurt alleen in de browser: deze server (en dus ook de assistent) ziet nooit wat er
in een bericht staat. De browser praat daarvoor zelf met de database, met dezelfde inlogsessie als de app.
Het onderdeel krijgt een naam met een vingerafdruk van de code, zodat een update meteen de nieuwe chat laat zien.
"""

import hashlib
import os
import time
from datetime import date, datetime, timedelta
from pathlib import Path

import anthropic
import streamlit as st

import beroep
import opslag
import samen
import slim
import taal
import toegang

CSS = """
.c-wortel { --c-rand: rgba(128,128,128,.22); --c-zacht: rgba(128,128,128,.09); --c-hoofd: var(--st-primary-color, #4f46e5);
  --c-tekst: var(--st-text-color, #1f2937); --c-achter: var(--st-background-color, #fff);
  font-family: inherit; color: var(--c-tekst); display: flex; flex-direction: column; position: relative;
  height: calc(100dvh - 8.5rem); min-height: 320px; font-size: 16px; overflow: hidden; overscroll-behavior: contain;
  border: 1px solid var(--c-rand); border-radius: 18px; background: var(--c-achter); }
.c-wortel [hidden] { display: none !important; }
.c-wortel.c-vol { border: 0; border-radius: 0; }
.c-lijst-kop { padding: 8px 14px 6px; display: flex; flex-direction: column; gap: 10px; background: var(--c-achter); }
.c-rij-kop { display: flex; align-items: center; justify-content: space-between; min-height: 40px; }
.c-rij-kop .c-groot-titel { font-size: 28px; font-weight: 700; padding-left: 0; }
.c-lijst-zoek { font: inherit; font-size: 16px; border: 0; outline: 0; background: var(--c-zacht); border-radius: 12px;
  padding: 9px 12px; width: 100%; box-sizing: border-box; color: inherit; -webkit-appearance: none; }
.c-pillen { display: flex; gap: 8px; overflow-x: auto; scrollbar-width: none; padding-bottom: 2px; }
.c-pillen::-webkit-scrollbar { display: none; }
.c-pillen .c-pil { flex: none; background: var(--c-zacht); border-color: transparent; }
.c-pillen .c-pil-aan { background: color-mix(in srgb, var(--c-hoofd) 16%, transparent); color: var(--c-hoofd); font-weight: 600; }
.c-lijst .c-avatar { width: 52px; height: 52px; }
.c-fab { position: absolute; right: 16px; bottom: calc(72px + env(safe-area-inset-bottom)); width: 56px; height: 56px;
  border-radius: 18px; border: 0; background: var(--c-hoofd); color: #fff; display: grid; place-items: center;
  box-shadow: 0 4px 14px rgba(0,0,0,.2); cursor: pointer; z-index: 3; }
.c-chip { display: flex; width: fit-content; align-items: center; gap: 6px; margin-top: 6px; font: inherit; font-size: 13px;
  padding: 5px 10px; border-radius: 999px; border: 0; background: rgba(128,128,128,.14); color: inherit; cursor: pointer; }
.c-chip svg { width: 15px; height: 15px; }
.c-bedrag { font-size: 30px; font-weight: 700; letter-spacing: -.01em; }
.c-betaal-kaart { align-items: flex-start; }
.c-betaal-kaart .c-breed { margin-top: 4px; }
.c-bedrag-groot { font-size: 40px; font-weight: 700; text-align: center; padding: 6px 0; letter-spacing: -.01em; }
.c-bedrag-veld { display: flex; align-items: baseline; justify-content: center; gap: 6px; font-size: 40px; font-weight: 700; padding: 4px 0; }
.c-bedrag-veld input { font: inherit; border: 0; outline: 0; background: transparent; color: inherit; width: 5.5ch; text-align: left; padding: 0; }
.c-midden { text-align: center; }
.c-klein { font-size: 14px; align-self: center; }
/* Bladen (peiling, betaalverzoek): kop met Annuleren, titel en Stuur, zoals op een iPhone. */
.c-paneel.c-blad { gap: 8px; max-height: 70%; overflow-y: auto; background: color-mix(in srgb, var(--c-tekst) 5%, var(--c-achter));
  border-top: 0; border-radius: 16px 16px 0 0; box-shadow: 0 -4px 18px rgba(0,0,0,.1); }
.c-blad .c-link { text-decoration: none; }
.c-blad-kop { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; margin: -2px 0 4px; }
.c-blad-kop b { font-size: 16px; }
.c-blad-kop > :first-child { justify-self: start; } .c-blad-kop > :last-child { justify-self: end; }
.c-link { font: inherit; font-size: 16px; border: 0; background: transparent; color: var(--c-hoofd); cursor: pointer; padding: 6px 2px; }
.c-vet { font-weight: 700; }
.c-sectie { font-size: 12px; text-transform: uppercase; letter-spacing: .04em; opacity: .55; margin: 6px 4px -2px; }
.c-groep-velden { display: flex; flex-direction: column; background: var(--c-achter); border-radius: 12px; overflow: hidden; }
.c-groep-velden > * + * { border-top: 1px solid var(--c-rand); }
.c-groep-velden .c-veld { border: 0; border-radius: 0; background: transparent; }
.c-blad > .c-veld { background: var(--c-achter); border: 0; border-radius: 12px; padding: 11px 12px; }
.c-blad .c-bedrag-veld + .c-veld { margin-top: 2px; }
.c-schakel-rij { flex-direction: row !important; align-items: center; justify-content: space-between; font-size: 16px !important;
  padding: 10px 12px; }
.c-schakel { -webkit-appearance: none; appearance: none; width: 51px; height: 31px; border-radius: 999px; background: rgba(120,120,128,.24);
  position: relative; cursor: pointer; transition: background .2s; flex: none; margin: 0; }
.c-schakel::before { content: ""; position: absolute; top: 2px; left: 2px; width: 27px; height: 27px; border-radius: 50%; background: #fff;
  box-shadow: 0 2px 4px rgba(0,0,0,.25); transition: transform .2s; }
.c-schakel:checked { background: #34c759; } .c-schakel:checked::before { transform: translateX(20px); }
/* Peiling in het gesprek */
.c-peiling { gap: 4px; }
.c-peiling .c-vraag { font-size: 16px; }
.c-poll { display: flex; align-items: flex-start; gap: 10px; width: 100%; font: inherit; font-size: 15px; color: inherit; text-align: left;
  border: 0; background: transparent; padding: 7px 0 3px; cursor: pointer; }
.c-rondje { flex: 0 0 22px; height: 22px; border-radius: 50%; border: 1.5px solid rgba(128,128,128,.5); display: grid; place-items: center;
  font-size: 13px; font-weight: 700; margin-top: 1px; }
.c-poll.c-meer .c-rondje { border-radius: 6px; }
.c-poll.c-aan .c-rondje { background: var(--c-hoofd); border-color: var(--c-hoofd); color: #fff; }
.c-poll-midden { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 5px; }
.c-poll-tekst { display: flex; justify-content: space-between; gap: 8px; }
.c-poll-tekst b { font-weight: 600; opacity: .7; }
.c-poll-balk { height: 6px; border-radius: 999px; background: rgba(128,128,128,.18); overflow: hidden; }
.c-poll-balk i { display: block; height: 100%; border-radius: 999px; background: var(--c-hoofd); transition: width .3s; }
.c-poll em { font-style: normal; font-size: 12px; opacity: .6; }
.c-poll-voet { text-align: center; padding-top: 6px; border-top: 1px solid var(--c-rand); margin-top: 4px; }
.c-groen { color: #16a34a; opacity: 1 !important; }
.c-kopie-rij { display: flex; align-items: center; gap: 10px; justify-content: space-between; }
.c-kopie-rij span { display: flex; flex-direction: column; min-width: 0; }
.c-kopie-rij b { overflow-wrap: anywhere; }
.c-kopie-rij small { opacity: .6; }
.c-link-knop { display: block; text-align: center; text-decoration: none; box-sizing: border-box; }
.c-fab:active { transform: scale(.96); }
.c-wortel svg { width: 22px; height: 22px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round;
  stroke-linejoin: round; flex: none; }
.c-wortel label { display: flex; flex-direction: column; gap: 4px; font-size: 14px; flex: 1; }
.c-balk { display: flex; align-items: center; gap: 6px; padding: 8px 10px; min-height: 52px; box-sizing: border-box;
  border-bottom: 1px solid var(--c-rand); background: var(--c-achter); }
.c-balk-midden { flex: 1; min-width: 0; display: flex; align-items: center; }
.c-groot-titel { font-size: 22px; padding-left: 6px; }
.c-ikoon { width: 40px; height: 40px; border-radius: 50%; border: 0; background: transparent; color: var(--c-hoofd);
  display: grid; place-items: center; cursor: pointer; padding: 0; }
.c-ikoon:active { background: var(--c-zacht); }
.c-inhoud { flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch; }
.c-vulling { padding: 14px; display: flex; flex-direction: column; gap: 12px; }
.c-midden { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; }
.c-tabs { display: flex; border-top: 1px solid var(--c-rand); background: var(--c-achter);
  padding-bottom: env(safe-area-inset-bottom); }
.c-tab { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 8px 0 6px;
  border: 0; background: transparent; color: inherit; opacity: .55; font: inherit; font-size: 12px; cursor: pointer; }
.c-tab.c-aan { opacity: 1; color: var(--c-hoofd); font-weight: 600; }
.c-knop { font: inherit; font-size: 15px; padding: 8px 16px; border-radius: 999px; border: 1px solid var(--c-rand);
  background: transparent; color: inherit; cursor: pointer; white-space: nowrap; }
.c-hoofd { background: var(--c-hoofd) !important; color: #fff !important; border-color: var(--c-hoofd) !important; }
.c-rood { color: #dc2626; }
.c-breed { width: 100%; margin-top: 8px; }
.c-sectie { font-size: 13px; font-weight: 600; opacity: .55; padding: 12px 16px 4px; text-transform: uppercase;
  letter-spacing: .03em; }
.c-vulling .c-sectie { padding: 4px 0 0; }
.c-item { display: flex; align-items: center; gap: 12px; width: 100%; text-align: left; font: inherit; color: inherit;
  background: transparent; border: 0; padding: 10px 14px; cursor: pointer; box-sizing: border-box; }
.c-item:active, .c-item-knop:active { background: var(--c-zacht); }
.c-item-tekst { flex: 1; display: flex; flex-direction: column; min-width: 0; gap: 2px;
  border-bottom: 1px solid var(--c-zacht); padding-bottom: 10px; margin-bottom: -10px; }
.c-item-tekst b, .c-item-tekst small { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.c-item-tekst small { opacity: .6; font-size: 14px; }
.c-item-rechts { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; align-self: flex-start; padding-top: 2px; }
.c-item-rechts small { font-size: 12px; opacity: .6; }
.c-accent { color: var(--c-hoofd) !important; opacity: 1 !important; }
.c-contact { cursor: default; padding-right: 6px; }
.c-item-knop { flex: 1; display: flex; align-items: center; gap: 12px; font: inherit; color: inherit; background: transparent;
  border: 0; padding: 0; text-align: left; cursor: pointer; min-width: 0; }
.c-item-knop:disabled { opacity: .55; cursor: default; }
.c-avatar { width: 46px; height: 46px; border-radius: 50%; display: grid; place-items: center; color: #fff;
  font-weight: 600; font-size: 19px; flex: none; }
.c-avatar.c-groep { background: var(--c-zacht); color: var(--c-hoofd); }
.c-avatar.c-groot { width: 84px; height: 84px; font-size: 34px; }
.c-avatar.c-foto { object-fit: cover; display: block; background: var(--c-zacht); }
.c-titel .c-avatar, .c-avatar.c-klein, .c-lid .c-avatar, .c-vink .c-avatar { width: 36px; height: 36px; font-size: 15px; }
.c-badge { background: var(--c-hoofd); color: #fff; border-radius: 999px; font-size: 12px; min-width: 20px; height: 20px;
  display: grid; place-items: center; padding: 0 6px; box-sizing: border-box; font-weight: 600; }
.c-zoek { display: flex; gap: 8px; padding: 12px 14px 4px; }
.c-vulling .c-zoek { padding: 0; }
.c-suggesties { padding: 4px 14px 0; display: flex; flex-direction: column; gap: 2px; }
.c-suggesties:empty { display: none; }
.c-suggestie { display: flex; align-items: center; gap: 10px; width: 100%; padding: 8px 6px; border: 0; border-radius: 10px;
  background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; }
.c-suggestie:hover { background: rgba(128,128,128,.12); }
.c-suggestie span { display: flex; flex-direction: column; min-width: 0; }
.c-suggestie small { opacity: .6; }
.c-suggestie .c-suggestie-i { width: 36px; text-align: center; font-size: 20px; }
.c-uitleg { font-size: 13px; opacity: .6; padding: 4px 16px 8px; }
.c-titel { flex: 1; display: flex; align-items: center; gap: 10px; font: inherit; color: inherit; background: transparent;
  border: 0; cursor: pointer; text-align: left; padding: 0; min-width: 0; }
.c-titel span { display: flex; flex-direction: column; min-width: 0; }
.c-titel b { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.c-titel small { opacity: .6; font-size: 12px; }
.c-berichten { flex: 1; overflow-y: auto; overscroll-behavior: contain; -webkit-overflow-scrolling: touch; display: flex; flex-direction: column; gap: 3px; padding: 10px 10px 12px;
  -webkit-overflow-scrolling: touch; background: color-mix(in srgb, var(--c-hoofd) 5%, var(--c-achter)); }
.c-e2e { align-self: center; max-width: 85%; text-align: center; font-size: 12px; line-height: 1.4; padding: 4px 12px;
  opacity: .55; margin: 4px 0 8px; }
.c-e2e svg { width: 13px; height: 13px; vertical-align: -2px; }
.c-dag { align-self: center; font-size: 12px; font-weight: 600; opacity: .7; background: var(--c-achter);
  border-radius: 8px; padding: 3px 10px; margin: 8px 0 4px; box-shadow: 0 1px 1px rgba(0,0,0,.06); }
.c-bericht { max-width: 78%; align-self: flex-start; background: var(--c-achter); border-radius: 18px 18px 18px 6px;
  padding: 7px 12px 6px; line-height: 1.35; overflow-wrap: anywhere; box-shadow: 0 1px 1px rgba(0,0,0,.07);
  -webkit-user-select: text; user-select: text; -webkit-touch-callout: none; }
.c-mijn { align-self: flex-end; background: var(--c-hoofd); color: #fff; border-radius: 18px 18px 6px 18px; }
/* Kaarten (peiling, betaalverzoek, afspraak...) staan los, zonder gekleurde ballon eromheen: rustig, zoals iMessage. */
.c-met-kaart { padding: 0; background: transparent !important; box-shadow: none; color: var(--c-tekst); min-width: min(270px, 78%); }
.c-met-kaart .c-tijd { opacity: .5; margin: 3px 4px 0; }
.c-met-kaart .c-naam { margin: 0 0 3px 4px; }
.c-bericht img { max-width: 100%; max-height: 320px; border-radius: 12px; display: block; }
.c-naam { font-size: 13px; font-weight: 600; color: var(--c-hoofd); margin-bottom: 1px; }
.c-tijd { font-size: 11px; opacity: .65; float: right; margin: 6px 0 -2px 10px; white-space: nowrap; }
.c-vinkjes { display: inline-block; margin-left: 3px; vertical-align: -1px; }
.c-wortel .c-vinkjes svg { width: 16px; height: 11px; stroke-width: 1.8; }
.c-gelezen { color: #7dd3fc; opacity: 1; }
.c-met-kaart .c-gelezen, .c-bericht:not(.c-mijn) .c-gelezen { color: #0ea5e9; }
.c-kaart { display: flex; flex-direction: column; gap: 6px; border-radius: 18px; padding: 12px 14px; line-height: 1.4;
  background: var(--c-achter); color: var(--c-tekst); box-shadow: 0 1px 2px rgba(0,0,0,.08), 0 0 0 1px rgba(128,128,128,.12); }
.c-mijn .c-kaart { box-shadow: 0 1px 2px rgba(0,0,0,.08), 0 0 0 1.5px color-mix(in srgb, var(--c-hoofd) 35%, transparent); }
.c-kaart-kop { display: flex; align-items: center; gap: 6px; font-size: 13px; opacity: .7; }
.c-kaart-kop svg, .c-kaart b svg { width: 16px; height: 16px; }
.c-kaart small { opacity: .65; }
.c-rij { display: flex; gap: 8px; align-items: flex-end; }
.c-wrap { flex-wrap: wrap; }
.c-smal { flex: 0 0 110px; }
.c-pil { font: inherit; font-size: 14px; padding: 6px 12px; border-radius: 999px; border: 1px solid var(--c-rand);
  background: transparent; color: inherit; cursor: pointer; }
.c-tip { align-self: center; font-size: 12px; opacity: .75; text-align: center; padding: 6px 12px; max-width: 90%; }
.c-verzoek { border-top: 1px solid var(--c-rand); padding: 12px 14px; display: flex; flex-direction: column; gap: 10px;
  background: var(--c-achter); font-size: 15px; }
.c-paneel { border-top: 1px solid var(--c-rand); padding: 12px 14px; display: flex; flex-direction: column; gap: 10px;
  background: var(--c-achter); }
.c-plus { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px 4px; }
.c-plus-knop { text-align: center; line-height: 1.2; }
.c-keus { display: flex; align-items: center; gap: 8px; font-size: 14px; }
.c-optie em, .c-vink em { display: block; font-style: normal; font-size: 12px; opacity: .65; font-weight: 400; }
.c-vink { display: flex; align-items: flex-start; gap: 10px; width: 100%; font: inherit; font-size: 15px; color: inherit; text-align: left;
  border: 0; background: transparent; padding: 4px 0; cursor: pointer; }
.c-vink .c-vakje { flex: 0 0 22px; height: 22px; border-radius: 6px; border: 1.5px solid var(--c-rand); display: grid; place-items: center;
  font-size: 14px; font-weight: 700; }
.c-vink.c-aan .c-vakje { background: var(--c-hoofd); border-color: var(--c-hoofd); color: #fff; }
.c-vink.c-aan .c-vink-tekst { text-decoration: line-through; opacity: .6; }
.c-item-veld { flex: 1; min-width: 0; }
.c-plus-knop { display: flex; flex-direction: column; align-items: center; gap: 4px; font: inherit; font-size: 13px;
  border: 0; background: transparent; color: inherit; cursor: pointer; }
.c-plus-knop span { width: 52px; height: 52px; border-radius: 16px; background: var(--c-zacht); display: grid;
  place-items: center; font-size: 24px; color: var(--c-hoofd); }
.c-plus-knop span svg { width: 26px; height: 26px; }
.c-blad-knop > svg { width: 22px; height: 22px; flex: none; }
.c-ai svg, .c-tijd svg, .c-wortel small svg { width: 12px; height: 12px; vertical-align: -1px; margin-right: 2px; }
.c-suggestie .c-suggestie-i svg { width: 22px; height: 22px; color: var(--c-hoofd); }
.c-invoer { display: flex; gap: 8px; align-items: flex-end; padding: 8px 10px; border-top: 1px solid var(--c-rand);
  background: var(--c-achter); padding-bottom: calc(8px + env(safe-area-inset-bottom)); }
.c-invoer textarea { flex: 1; resize: none; border-radius: 22px; padding: 9px 16px; max-height: 140px; line-height: 1.35;
  background: var(--c-zacht); border-color: transparent; }
.c-rond { width: 40px; height: 40px; border-radius: 50%; border: 0; background: var(--c-zacht); color: var(--c-hoofd);
  cursor: pointer; flex: none; display: grid; place-items: center; padding: 0; }
.c-rond.c-hoofd svg { stroke: #fff; }
.c-veld { font: inherit; font-size: 16px; padding: 9px 12px; border-radius: 12px; border: 1px solid var(--c-rand);
  background: var(--c-achter); color: inherit; width: 100%; box-sizing: border-box; min-width: 0; }
.c-veld:focus { outline: 2px solid color-mix(in srgb, var(--c-hoofd) 45%, transparent); outline-offset: -1px; }
.c-melding { position: absolute; left: 50%; bottom: 76px; transform: translateX(-50%); z-index: 5; max-width: 86%;
  background: #111827; color: #fff; border-radius: 12px; padding: 9px 14px; font-size: 14px; text-align: center;
  box-shadow: 0 4px 16px rgba(0,0,0,.18); }
.c-profiel { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 8px 0; }
.c-profiel b { font-size: 20px; }
.c-profiel small { opacity: .6; }
.c-code { font-family: ui-monospace, Menlo, monospace; font-size: 17px; letter-spacing: .05em; word-spacing: .4em; line-height: 1.7; }
.c-instel { border: 1px solid var(--c-rand); flex-shrink: 0; }
.c-instel .c-lid { padding: 10px 12px; }
.c-instel .c-schakel-rij { display: flex; gap: 12px; }
.c-instel .c-klein { width: auto; max-width: 45%; padding: 6px 8px; border: 1px solid var(--c-rand); border-radius: 8px; }
.c-uitleg { font-size: 13px; opacity: .6; margin: -6px 4px 0; line-height: 1.4; }
.c-geavanceerd { flex-shrink: 0; border: 1px solid var(--c-rand); border-radius: 12px; padding: 10px 12px; display: flex; flex-direction: column; gap: 10px; }
.c-geavanceerd summary { cursor: pointer; font-weight: 600; }
.c-geavanceerd[open] { gap: 10px; }
.c-geavanceerd > * + * { margin-top: 10px; }
.c-tech { display: grid; grid-template-columns: auto 1fr; gap: 6px 12px; margin: 0; font-size: 13px; }
.c-tech dt { opacity: .6; } .c-tech dd { margin: 0; }
.c-code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; word-break: break-all; }
.c-lid { display: flex; align-items: center; gap: 10px; padding: 6px 0; justify-content: space-between; }
.c-lid > span { flex: 1; }
.c-lid small { opacity: .6; }
.c-vink { flex-direction: row !important; align-items: center; gap: 10px !important; justify-content: space-between;
  font-size: 16px !important; }
.c-vink span { flex: 1; }
.c-vink input { width: 22px; height: 22px; accent-color: var(--c-hoofd); }
.c-mini { font: inherit; font-size: 20px; background: transparent; border: 0; color: inherit; opacity: .45; cursor: pointer;
  width: 36px; height: 36px; }
.c-grijs { opacity: .6; }
.c-waarschuwing { color: #b45309; }
.c-fout { color: #b91c1c; text-align: center; padding: 0 20px; }
.c-leeg { opacity: .65; text-align: center; padding: 36px 20px; line-height: 1.6; }
.c-leeg .c-knop { margin-top: 12px; opacity: 1; }
.c-voet { font-size: 12px; opacity: .5; text-align: center; padding: 18px 10px; display: flex; gap: 4px;
  justify-content: center; align-items: center; }
.c-voet svg { width: 13px; height: 13px; }
.c-link { font: inherit; background: transparent; border: 0; color: var(--c-hoofd); cursor: pointer; padding: 0; text-decoration: underline; }
.c-avatar.c-vierkant { border-radius: 14px; }
.c-hekje { width: 46px; height: 46px; display: grid; place-items: center; font-size: 22px; font-weight: 600; opacity: .5; flex: none; }
.c-titel .c-hekje { width: 28px; height: 36px; }
.c-achtergrond { position: absolute; inset: 0; background: rgba(0,0,0,.28); z-index: 6; }
.c-blad { position: absolute; left: 0; right: 0; bottom: 0; z-index: 7; background: var(--c-achter); border-radius: 18px 18px 0 0;
  padding: 8px 8px calc(10px + env(safe-area-inset-bottom)); display: flex; flex-direction: column; box-shadow: 0 -4px 20px rgba(0,0,0,.12); }
.c-blad-knop { display: flex; align-items: center; gap: 14px; font: inherit; font-size: 16px; color: inherit; background: transparent;
  border: 0; padding: 13px 12px; border-radius: 12px; cursor: pointer; text-align: left; }
.c-blad-knop:active { background: var(--c-zacht); }
.c-blad-knop svg { color: var(--c-hoofd); }
.c-blad-knop.c-rood svg { color: #dc2626; }
.c-emoji-rij { display: flex; justify-content: space-around; padding: 6px 4px 10px; border-bottom: 1px solid var(--c-zacht); margin-bottom: 4px; }
.c-emoji-rij button { font-size: 28px; background: var(--c-zacht); border: 0; border-radius: 50%; width: 46px; height: 46px; cursor: pointer; padding: 0; }
.c-emojis { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; clear: both; }
.c-emoji { font: inherit; font-size: 13px; border-radius: 999px; padding: 1px 8px; cursor: pointer; border: 1px solid var(--c-rand);
  background: var(--c-achter); color: var(--c-tekst); }
.c-emoji.c-aan { border-color: var(--c-hoofd); background: color-mix(in srgb, var(--c-hoofd) 14%, var(--c-achter)); }
.c-citaat { display: flex; flex-direction: column; text-align: left; width: 100%; font: inherit; font-size: 13px; color: inherit;
  border: 0; border-left: 3px solid currentColor; border-radius: 6px; background: rgba(128,128,128,.14); padding: 4px 8px;
  margin-bottom: 4px; cursor: pointer; opacity: .9; }
.c-citaat span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; opacity: .8; }
.c-vermeld { font-weight: 600; }
.c-link { color: inherit; text-decoration: underline; overflow-wrap: anywhere; }
.c-bericht:not(.c-mijn) .c-vermeld { color: var(--c-hoofd); }
.c-flits { outline: 3px solid color-mix(in srgb, var(--c-hoofd) 50%, transparent); }
.c-vast { display: flex; align-items: center; gap: 8px; font: inherit; font-size: 14px; color: inherit; background: var(--c-achter);
  border: 0; border-bottom: 1px solid var(--c-rand); padding: 7px 14px; cursor: pointer; text-align: left; }
.c-vast svg { width: 16px; height: 16px; color: var(--c-hoofd); }
.c-vast span { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.c-vast small { opacity: .55; }
.c-antwoord-balk { display: flex; align-items: center; gap: 8px; padding: 8px 12px 0; background: var(--c-achter);
  border-top: 1px solid var(--c-rand); font-size: 13px; }
.c-antwoord-balk div { flex: 1; min-width: 0; border-left: 3px solid var(--c-hoofd); padding-left: 8px; display: flex; flex-direction: column; }
.c-antwoord-balk span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; opacity: .7; }
.c-antwoord-balk + .c-invoer { border-top: 0; }
.c-ai { display: block; font-size: 11px; opacity: .6; margin-top: 3px; }
.c-hulp { display: flex; align-items: flex-start; gap: 6px; padding: 8px 10px 0; background: var(--c-achter); }
.c-hulp-lijst { flex: 1; display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; }
.c-hulp-keuze { flex: 0 0 auto; max-width: 80%; font: inherit; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  border: 1px solid var(--c-rand); border-radius: 16px; padding: 7px 12px; background: var(--c-zacht); color: inherit; cursor: pointer; }
.c-hulp-tekst { font-size: 13px; opacity: .65; padding: 7px 2px; }
.c-vermeld-rij { display: flex; gap: 6px; padding: 6px 10px 0; overflow-x: auto; background: var(--c-achter); }
.c-vermeld-rij:empty { display: none; }
.c-alleen { text-align: center; font-size: 13px; opacity: .6; padding: 12px; border-top: 1px solid var(--c-rand);
  padding-bottom: calc(12px + env(safe-area-inset-bottom)); }
.c-optie { position: relative; display: flex; justify-content: space-between; gap: 8px; width: 100%; font: inherit; font-size: 15px;
  color: inherit; text-align: left; border: 1px solid var(--c-rand); border-radius: 10px; padding: 7px 10px; background: transparent;
  cursor: pointer; overflow: hidden; }
.c-optie i { position: absolute; left: 0; top: 0; bottom: 0; background: color-mix(in srgb, var(--c-hoofd) 16%, transparent); z-index: 0; }
.c-optie span, .c-optie small { position: relative; z-index: 1; }
.c-optie.c-aan { border-color: var(--c-hoofd); font-weight: 600; }
.c-rol { font: inherit; font-size: 13px; padding: 4px 6px; border-radius: 8px; border: 1px solid var(--c-rand); background: var(--c-achter);
  color: inherit; max-width: 130px; }
.c-bel-knoppen { display: flex; gap: 2px; }
.c-bel-regel { display: flex; align-items: center; justify-content: center; gap: 6px; }
.c-bel-regel svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 2; }
.c-code-groot { font-family: ui-monospace, Menlo, monospace; font-size: 22px; letter-spacing: .08em; text-align: center; padding: 4px 0; }
"""

_JS = (Path(__file__).parent / "chat_js.js").read_text()
_chat = st.components.v2.component("chat_" + hashlib.sha1((_JS + CSS).encode()).hexdigest()[:10],
                                   html='<div class="c-wortel"></div>', css=CSS, js=_JS)

# Ongelezen berichten per account, kort onthouden zodat de kopbalk niet bij elke klik de database vraagt.
_ongelezen: dict[str, tuple[float, int]] = {}


def ongelezen() -> int:
    """Aantal ongelezen chatberichten (en nieuwe verzoeken). Hoogstens elke halve minuut gevraagd."""
    if not opslag.online() or not opslag._wachtwoord.get():
        return 0
    sleutel = f"{opslag._naam.get()}|{opslag._wachtwoord.get()}"
    bewaard = _ongelezen.get(sleutel)
    if bewaard and time.time() - bewaard[0] < 30:
        return bewaard[1]
    try:
        alles = opslag._rpc_ik("chat_gesprekken")
    except Exception:
        return bewaard[1] if bewaard else 0
    aantal = sum(g["ongelezen"] + (g["status"] == "verzoek") for g in alles.get("gesprekken", []))
    # Community's tellen alleen mee met uitnodigingen en mededelingen; gewone kanalen houden de balk rustig.
    for c in alles.get("communities", []):
        aantal += (c.get("status") == "uitgenodigd") + sum(k["ongelezen"] for k in c.get("kanalen", []) if k.get("alleen_beheer"))
    if aantal:  # de app staat open: nieuwe berichten zijn op dit apparaat aangekomen (twee grijze vinkjes)
        try:
            opslag._rpc_ik("chat_ontvangen")
        except Exception:
            pass
    _ongelezen[sleutel] = (time.time(), aantal)
    return aantal


def apparaat_naam() -> str:
    ua = (st.context.headers.get("User-Agent") or "").lower()
    for woord, naam in (("iphone", "iPhone"), ("ipad", "iPad"), ("android", "Android"), ("macintosh", "Mac"),
                        ("windows", "Windows"), ("linux", "Linux")):
        if woord in ua:
            return naam
    return "Browser"


def vrije_momenten(aantal: int = 8) -> list[str]:
    """Een paar vrije uren in de komende week (10, 13, 16 of 19 uur), hoogstens twee per dag."""
    vandaag = date.today()
    bezet = []
    for a in opslag.afspraken_tussen(vandaag.isoformat(), (vandaag + timedelta(days=8)).isoformat()):
        if a.get("soort") == "vrij" or "T" not in (a.get("start") or ""):
            continue
        start = datetime.fromisoformat(a["start"][:16])
        einde = datetime.fromisoformat(a["einde"][:16]) if a.get("einde") and "T" in a["einde"] else start + timedelta(hours=1)
        bezet.append((start, einde))
    nu = datetime.now() + timedelta(hours=2)
    momenten = []
    for d in range(8):
        dag = vandaag + timedelta(days=d)
        per_dag = 0
        for uur in (10, 13, 16, 19):
            begin = datetime.combine(dag, datetime.min.time()).replace(hour=uur)
            if begin < nu or per_dag == 2 or any(s < begin + timedelta(hours=1) and e > begin for s, e in bezet):
                continue
            momenten.append(begin.strftime("%Y-%m-%dT%H:%M"))
            per_dag += 1
            if len(momenten) == aantal:
                return momenten
    return momenten


def _naar_agenda(a: dict | None) -> None:
    """De knop 'In mijn agenda' bij een afspraak in de chat."""
    if not isinstance(a, dict) or a.get("n") == st.session_state.get("_chat_laatste"):
        return
    st.session_state._chat_laatste = a.get("n")
    try:
        start = datetime.fromisoformat(str(a["start"])[:16])
    except (KeyError, ValueError):
        return
    einde = start + timedelta(minutes=int(a.get("minuten") or 60))
    titel = str(a.get("titel") or "Afspraak")[:120]
    met = str(a.get("met") or "")[:60]
    opslag.afspraak_toevoegen(titel, start.strftime("%Y-%m-%dT%H:%M"), einde.strftime("%Y-%m-%dT%H:%M"),
                              notitie=f"Via de chat met {met}" if met else "Via de chat",
                              locatie=str(a.get("plaats") or "")[:200], soort="familie en vrienden")
    st.toast(f"{titel} staat in je agenda.")


def _boeking(a: dict | None) -> None:
    """Je boekte via de chat: elke keer komt in je eigen agenda (en we onthouden welke, om later op te ruimen)."""
    if not isinstance(a, dict) or a.get("n") == st.session_state.get("_chat_boeking"):
        return
    st.session_state._chat_boeking = a.get("n")
    minuten = min(480, max(10, int(a.get("minuten") or 60)))
    titel = str(a.get("titel") or "Afspraak")[:120]
    notitie = f"Geboekt via de chat bij {str(a.get('met') or '')[:60]}".strip()
    if a.get("status") == "aangevraagd":
        les = str((a.get("ids") or [""])[0]).startswith("les:")
        notitie += ". Je staat op de wachtlijst." if les else ". Wacht op bevestiging."
    gekoppeld = dict(opslag.instellingen().get("chat_boekingen") or {})
    for boeking_id, start in list(zip(a.get("ids") or [], a.get("starts") or []))[:12]:
        try:
            begin = datetime.fromisoformat(str(start)).astimezone()
        except ValueError:
            continue
        afspraak = opslag.afspraak_toevoegen(titel, begin.strftime("%Y-%m-%dT%H:%M"),
                                             (begin + timedelta(minutes=minuten)).strftime("%Y-%m-%dT%H:%M"),
                                             notitie=notitie, locatie=str(a.get("plaats") or "")[:200], soort="afspraak")
        gekoppeld[str(boeking_id)] = afspraak["id"]
    opslag.instellingen_bijwerken(chat_boekingen=gekoppeld)


def _mijn_winkel() -> dict | None:
    """Je eigen open webshop, om in een gesprek te delen (vijf minuten bewaard)."""
    bewaard = st.session_state.get("_chat_winkel")
    if not bewaard or time.time() - bewaard[0] > 300:
        try:
            w = samen.mijn_winkel().get("winkel")
        except opslag.GeenToegang:
            raise
        except Exception:
            w = None
        w = {k: w[k] for k in ("adres", "naam", "omschrijving")} if w and w.get("open") else None
        bewaard = (time.time(), w)
        st.session_state._chat_winkel = bewaard
    return bewaard[1]


def _naar_winkel(a: dict | None) -> None:
    """Webshop openen vanuit een kaartje in de chat: binnen de app, waar je ook bestelt en betaalt."""
    if not isinstance(a, dict) or a.get("n") == st.session_state.get("_chat_winkel_open") or not a.get("adres"):
        return
    st.session_state._chat_winkel_open = a.get("n")
    st.session_state.open_winkel = str(a["adres"])[:60]
    st.session_state.pop("webshop_betalen", None)
    st.session_state.ga_naar = "winkels"
    st.rerun()


def _openen_vanuit_profiel(a: dict | None) -> None:
    """Vanuit iemands profiel in de chat: diens gedeelde agenda of een VR-ruimte openen."""
    if not isinstance(a, dict) or a.get("n") == st.session_state.get("_chat_profiel_open"):
        return
    st.session_state._chat_profiel_open = a.get("n")
    if a.get("soort") == "agenda":
        st.session_state.agenda_deel = "Samen"
        st.session_state.samen_deel = "Gedeeld met mij"
        st.session_state.gedeeld_wie = int(a.get("id") or 0)
        st.session_state.ga_naar = "agenda"
    elif a.get("soort") == "pot":
        st.session_state.pot_community = int(a.get("id") or 0)
        st.session_state.ga_naar = "inzamelen"
    elif a.get("soort") == "cursussen":
        st.session_state.cursus_community = int(a.get("id") or 0)
        st.session_state.ga_naar = "cursussen"
    elif a.get("soort") == "ruimte":
        st.session_state.open_ruimte = int(a.get("id") or 0)
        st.session_state.ga_naar = "ruimtes"
    else:
        return
    st.rerun()


def _boeking_weg(a: dict | None) -> None:
    """Afgewezen of geannuleerd: die keren gaan uit je agenda."""
    if not isinstance(a, dict) or a.get("n") == st.session_state.get("_chat_boeking_weg"):
        return
    st.session_state._chat_boeking_weg = a.get("n")
    gekoppeld = dict(opslag.instellingen().get("chat_boekingen") or {})
    weg = [gekoppeld.pop(str(i)) for i in a.get("ids") or [] if str(i) in gekoppeld]
    for afspraak_id in weg:
        opslag.afspraak_verwijderen(afspraak_id)
    if weg:
        opslag.instellingen_bijwerken(chat_boekingen=gekoppeld)


def _betaalgegevens() -> dict:
    """Je eigen rekeninggegevens voor betaalverzoeken, zodat ze vooraf ingevuld zijn (op al je apparaten)."""
    g = opslag.instellingen().get("betaalgegevens") or {}
    return {k: str(g.get(k) or "")[:120] for k in ("iban", "naam", "link")}


def _betaal_bewaren(a: dict | None) -> None:
    if not isinstance(a, dict) or a.get("n") == st.session_state.get("_chat_betaal"):
        return
    st.session_state._chat_betaal = a.get("n")
    nieuw = {"iban": str(a.get("iban") or "").replace(" ", "").upper()[:34], "naam": str(a.get("naam") or "")[:70],
             "link": str(a.get("link") or "")[:300] if str(a.get("link") or "").startswith("https://") else ""}
    if nieuw != _betaalgegevens():
        opslag.instellingen_bijwerken(betaalgegevens=nieuw)


def _hulp(a: dict | None) -> None:
    """Antwoord voorstellen: alleen als je erom vraagt leest de assistent de laatste berichten mee (al ontsleuteld)."""
    if not isinstance(a, dict) or not a.get("n") or a.get("n") == st.session_state.get("_chat_hulp_n"):
        return
    st.session_state._chat_hulp_n = a["n"]
    berichten = [{"van": str(b.get("van") or "")[:40], "tekst": str(b.get("tekst") or "")[:600]}
                 for b in (a.get("berichten") or [])[-14:] if isinstance(b, dict)]
    uit = {"n": a["n"], "lijst": [], "fout": ""}
    api = toegang.sleutel()
    auto = bool(a.get("auto")) and _klantstand()["stand"] == "zelf"
    vandaag = date.today().isoformat()
    teller = st.session_state.setdefault("_chat_auto", {})
    if auto and teller.get(vandaag, 0) >= AUTO_PER_DAG:
        uit["fout"] = "limiet"
    elif not api:
        uit["fout"] = "uit"
    elif not berichten:
        uit["fout"] = "leeg"
    else:
        try:
            # Een klantgesprek: antwoorden met wat klanten over je zaak mogen weten (prijzen, aanbod, diensten).
            kennis = beroep.klantkennis() if a.get("klant") else {}
            if kennis:
                ik = (st.session_state.get("ik") or {}).get("weergavenaam") or st.session_state.get("naam", "")
                k = slim.klant_antwoord(toegang.claude(api), berichten, kennis, ik, str(a.get("wie") or ""))
                uit["lijst"] = k["antwoorden"]
                if not k["zeker"] and k["voor_jou"]:
                    st.toast(f"{str(a.get('wie') or 'Een klant')[:40]}: {k['voor_jou']}", icon=":material/help:")
            elif not auto:
                uit["lijst"] = slim.chat_antwoorden(toegang.claude(api), berichten, str(a.get("wie") or ""))
        except (slim.Mislukt, anthropic.APIError):
            uit["fout"] = "mislukt"
    if auto and uit["lijst"]:
        teller[vandaag] = teller.get(vandaag, 0) + 1
    st.session_state.chat_hulp = uit
    st.rerun()


AUTO_PER_DAG = 60


def _klantstand() -> dict:
    """Hoe de assistent helpt bij klantvragen (Instellingen › Werk): uit, voorstel of zelf, en welke gesprekken."""
    k = opslag.instellingen().get("klantenchat") or {}
    return {"stand": k.get("stand", "uit") if k.get("stand") in ("uit", "voorstel", "zelf") else "uit",
            "verzoeken": bool(k.get("verzoeken", True)), "gesprekken": [int(x) for x in k.get("gesprekken", [])][-500:]}


def _klantgesprek(a: dict | None) -> None:
    """Een gesprek wel of niet als klantgesprek (schakelaar bij de info van het gesprek)."""
    if not isinstance(a, dict) or not a.get("n") or a.get("n") == st.session_state.get("_chat_klant_n"):
        return
    st.session_state._chat_klant_n = a["n"]
    try:
        g = int(a.get("g"))
    except (TypeError, ValueError):
        return
    k = dict(opslag.instellingen().get("klantenchat") or {})
    lijst = [x for x in k.get("gesprekken", []) if x != g] + ([g] if a.get("aan") else [])
    k["gesprekken"] = lijst[-500:]
    opslag.instellingen_bijwerken(klantenchat=k)


def _open() -> int | None:
    """Een gesprek om meteen te openen: via een melding op je telefoon (?gesprek=nummer) of vanuit de app."""
    gesprek = st.query_params.pop("gesprek", None) or st.session_state.pop("chat_open", None)
    try:
        return int(gesprek) if gesprek else None
    except ValueError:
        return None


def pagina() -> None:
    if not opslag.online():
        st.info("De chat werkt alleen in de online versie van de app.")
        return
    if not opslag.is_sessie(st.session_state.get("wachtwoord", "")):
        st.info("Log opnieuw in om de beveiligde chat te gebruiken.")
        return
    try:
        vrij = vrije_momenten()
    except Exception:
        vrij = []
    resultaat = _chat(key="chat", data={
        "url": os.environ.get("SUPABASE_URL", opslag.SUPABASE_URL).rstrip("/"),
        "key": os.environ.get("SUPABASE_KEY", opslag.SUPABASE_PUBLISHABLE_KEY),
        "naam": st.session_state.get("naam", ""), "token": st.session_state.get("wachtwoord", ""),
        "label": apparaat_naam(), "vrij": vrij, "open": _open(), "taal": taal.chat_teksten(), "winkel": _mijn_winkel(),
        "betaal": _betaalgegevens(), "hulp": st.session_state.get("chat_hulp"), "klant": _klantstand(),
    }, on_agenda_change=lambda: None, on_hulp_change=lambda: None, on_klantgesprek_change=lambda: None, on_betaal_change=lambda: None, on_boeking_change=lambda: None, on_boekingweg_change=lambda: None,
        on_winkel_change=lambda: None, on_open_change=lambda: None)
    _naar_agenda(getattr(resultaat, "agenda", None) if resultaat is not None else None)
    _boeking(getattr(resultaat, "boeking", None) if resultaat is not None else None)
    _boeking_weg(getattr(resultaat, "boekingweg", None) if resultaat is not None else None)
    _naar_winkel(getattr(resultaat, "winkel", None) if resultaat is not None else None)
    _openen_vanuit_profiel(getattr(resultaat, "open", None) if resultaat is not None else None)
    _betaal_bewaren(getattr(resultaat, "betaal", None) if resultaat is not None else None)
    _klantgesprek(getattr(resultaat, "klantgesprek", None) if resultaat is not None else None)
    _hulp(getattr(resultaat, "hulp", None) if resultaat is not None else None)
    # Zo blijft het aantal in de kopbalk kloppen nadat je berichten hebt gelezen.
    _ongelezen.pop(f"{opslag._naam.get()}|{opslag._wachtwoord.get()}", None)

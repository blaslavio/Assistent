"""De echte navigatiefunctie in 1000 benoemde instellingencombinaties.

Dit zijn configuratiescenario’s, geen 1000 ontdekte fouten. Externe pagina’s
worden geregistreerd maar niet uitgevoerd; backendautorisatie is een aparte test.
"""
import ast
from dataclasses import dataclass
import itertools
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import gereedschappen
import indeling

ROOT = Path(__file__).parent
BOOM = ast.parse((ROOT / "app.py").read_text())
PAGINAS_FUNCTIE = next(n for n in BOOM.body if isinstance(n, ast.FunctionDef) and n.name == "paginas")

UIT_VARIANTEN = [(), tuple(indeling.ONDERDELEN), ("onbekend",), ("Chat",), ("Leren",), ("Mail",),
    ("Marktplaats",), ("Budget",), ("Beleggen",), ("Zakelijk",), ("Boodschappen",), ("Lijstjes",),
    ("Hulpmiddelen",), ("Scannen",), ("DIY",), ("Documenten",), ("Bestanden",), ("Samen",), ("VR-ruimtes",),
    ("Boodschappen", "Lijstjes"), ("Hulpmiddelen", "Scannen", "DIY"), ("Chat", "Leren"),
    ("Marktplaats", "Zakelijk"), ("Mail", "Documenten", "Bestanden"), ("Budget", "Beleggen", "Sport")]
VOORKEUREN = [
    {},
    {"groepen": list(reversed(gereedschappen.GROEPEN)), "favorieten": ["gereedschappen", "planning-backup", "werkzoeken"]},
    {"groepen": ["Geld", "Geld", "niet-bestaand"], "favorieten": ["gereedschappen", "gereedschappen", "verdwenen"], "bovenaan": ["werkzoeken", "werkzoeken"]},
    {"bovenaan": None, "favorieten": [None, {}, "werkzoeken"], "groepen": ["Geld", None, "Geld"]},
    {"bovenaan": list(indeling.PAGINAS), "favorieten": list(indeling.PAGINAS), "groepen": list(gereedschappen.GROEPEN)}]


@dataclass
class Pagina:
    functie: object
    title: str
    icon: str
    url_path: str


def context(online, uit, niveau, voorkeur):
    pagina, groepen = {}, {}
    def maak(functie, title, icon, url_path, **kwargs):
        if url_path in pagina:
            raise AssertionError("Dubbele route: " + url_path)
        p = Pagina(functie, title, icon, url_path)
        pagina[url_path] = p
        return p
    env = {"PAGINA": {}, "GROEPEN": groepen, "onderdelen_uit": lambda: list(uit),
           "samen": SimpleNamespace(beschikbaar=lambda: online),
           "samen_scherm": SimpleNamespace(nieuw_kort=lambda: {"bestellingen": 2, "gedeeld": 3}),
           "boekingen_wachten": lambda: 4, "ik": lambda: {"niveau": niveau},
           "mijn_avatar": lambda: {"naam": "Assistent"}, "gereedschappen": gereedschappen,
           "indeling": indeling, "st": SimpleNamespace(Page=maak, session_state=SimpleNamespace(), switch_page=lambda _: None)}
    dummy = lambda: None
    for name in ("werkruimte_pagina", "master_hub_pagina", "universele_zoekhub", "dating_pagina", "communicatie_hub", "chat_met_profiel", "vandaag_overzicht", "agenda_tabblad", "gesprek", "instellingen_tabblad"):
        env[name] = dummy
    for name in ("chat", "winkelen_scherm"):
        env[name] = SimpleNamespace(pagina=dummy)
    for tool in gereedschappen.TOOLS:
        mod, punt, attr = tool["functie"].partition(".")
        if punt:
            if mod not in env:
                env[mod] = SimpleNamespace()
            setattr(env[mod], attr, dummy)
        else:
            env[mod] = dummy
    exec(compile(ast.Module(body=[PAGINAS_FUNCTIE], type_ignores=[]), "app.py", "exec"), env)  # nosec B102: uitsluitend AST van het vertrouwde lokale app.py in een testcontext
    with patch.object(indeling.opslag, "instellingen", return_value={"indeling": voorkeur}), patch.object(indeling.beroep, "huidig", return_value={"soort": ""}):
        env["paginas"]()
        huidig = indeling.huidig()
    return env["PAGINA"], groepen, huidig


def verwacht(online, uit, niveau):
    uit = set(uit)
    routes = {"vandaag", "agenda", "assistent", "instellingen", "universal-os", "gereedschappen", "werkdossier", "werkruimte", "masterhub", "zoekhub", "dating", "communicatie", "communicatiecentrum", "actielinks",
              "buurt", "werkzoeken", "werkbronnen", "taakplanning", "sport", "gegevenscontrole", "planning-backup",
              "sjablonen", "activiteitenoverzicht", "bestandsgereedschap", "browser"}
    for module, route in (("Leren", "leren"), ("Mail", "mail"), ("Beleggen", "beleggen")):
        if module not in uit:
            routes.add(route)
    if not {"Boodschappen", "Lijstjes"} <= uit:
        routes.add("lijstjes")
    if not {"Hulpmiddelen", "Scannen", "DIY"} <= uit:
        routes.add("hulpmiddelen")
    if online:
        routes.update({"inzamelen", "boekingen", "prikken"})
        for module, route in (("Chat", "chat"), ("Documenten", "documenten"), ("Bestanden", "bestanden"),
                              ("Leren", "cursussen"), ("Samen", "samen"), ("VR-ruimtes", "ruimtes"), ("Budget", "budget"), ("Zakelijk", "zakelijk")):
            if module not in uit:
                routes.add(route)
        if "Zakelijk" not in uit:
            routes.update({"rooster", "klantenbeheer", "boekhoudingbeheer"})
        if "Marktplaats" not in uit:
            routes.update({"winkelen", "zoeken", "winkels", "verkopen", "bestellingen", "berichten"})
            if niveau in {"verkoper", "ondernemer"}:
                routes.update({"webshop", "verkoopoverzicht"})
    return routes


class InterfaceMatrixTest(unittest.TestCase):
    pass


def matrixcontrole(online, rol, variant, voorkeur):
    def test(self):
        uit = UIT_VARIANTEN[variant]
        paginas, groepen, huidig = context(online, uit, rol, VOORKEUREN[voorkeur])
        self.assertEqual(set(paginas), verwacht(online, uit, rol))
        self.assertEqual(set(groepen), set(gereedschappen.GROEPEN))
        self.assertEqual(len(huidig["groepen"]), len(set(huidig["groepen"])))
        self.assertEqual(list(groepen), huidig["groepen"])
        alle = [u for urls in groepen.values() for u in urls]
        self.assertEqual(len(alle), len(set(alle)))
        self.assertTrue(set(alle) <= set(paginas))
        self.assertTrue((set(paginas) - {"vandaag", "assistent", "instellingen", "universal-os"}) <= set(indeling.PAGINAS))
        self.assertLessEqual(len(huidig["bovenaan"]), indeling.MAX_BOVENAAN)
        self.assertLessEqual(len(huidig["favorieten"]), indeling.MAX_FAVORIETEN)
        for key in ("bovenaan", "favorieten"):
            self.assertEqual(len(huidig[key]), len(set(huidig[key])))
        self.assertTrue(all(r["status"] != "niet beschikbaar" for r in gereedschappen.dekking(gereedschappen.catalogus(online, uit, rol), paginas)))
        self.assertTrue(all(callable(p.functie) and p.title and p.icon and "/" not in p.url_path for p in paginas.values()))
        if online and "Marktplaats" not in uit:
            self.assertEqual(paginas["bestellingen"].title, "Bestellingen (2)")
        if online and "Samen" not in uit:
            self.assertEqual(paginas["samen"].title, "Samen (3)")
    return test


SCENARIOS = []
for nummer, (online, rol, variant, voorkeur) in enumerate(itertools.product((False, True), ("particulier", "verkoper", "ondernemer", "onbekend"), range(25), range(5)), 1):
    naam = f"test_{nummer:04d}_{'online' if online else 'lokaal'}_{rol}_uit{variant:02d}_voorkeur{voorkeur}"
    setattr(InterfaceMatrixTest, naam, matrixcontrole(online, rol, variant, voorkeur))
    SCENARIOS.append({"nummer": nummer, "test": "test_interface.InterfaceMatrixTest." + naam,
                      "online": online, "rol": rol, "uit": list(UIT_VARIANTEN[variant]), "voorkeur": voorkeur})
assert len(SCENARIOS) == 1000


class InterfaceDetailsTest(unittest.TestCase):
    def test_catalogus_callbacks_bestaan_in_broncode(self):
        globaal = {n.name for n in BOOM.body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))}
        for tool in gereedschappen.TOOLS:
            module, punt, attr = tool["functie"].partition(".")
            if punt:
                boom = ast.parse((ROOT / (module + ".py")).read_text())
                self.assertTrue(any(isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name == attr for n in boom.body), tool["functie"])
            else:
                self.assertIn(module, globaal)

    def test_zoeken_en_beschikbaarheidsreden(self):
        tools = gereedschappen.catalogus(False, ["Mail", "Leren"], "particulier")
        self.assertEqual(gereedschappen.zoek(tools, "planning backup")[0]["url"], "planning-backup")
        self.assertTrue(next(t for t in tools if t["url"] == "webshop")["redenen"])
        self.assertFalse(gereedschappen.zoek(tools, "documenten", alleen_beschikbaar=True))
        with self.assertRaises(ValueError):
            gereedschappen.zoek(tools, "x" * 161)

    def test_nieuwe_tools_kunnen_als_favoriet_worden_opgeslagen(self):
        import copy
        from unittest.mock import patch
        inst = {"indeling": {}}
        with patch.object(indeling.opslag, "instellingen", return_value=inst), patch.object(indeling.opslag, "instellingen_bijwerken") as opslaan:
            onbekend = indeling.bijwerken(favorieten=["Alle gereedschappen", "Planningback-up en herstel", "Taken en capaciteit"])
        self.assertEqual(onbekend, [])
        self.assertEqual(opslaan.call_args.kwargs["indeling"]["favorieten"], ["gereedschappen", "planning-backup", "taakplanning"])

    def test_korte_namen_zijn_herkenbaar_en_bestandtools_is_geen_cloudmap(self):
        self.assertEqual(indeling.url_van("Tools"), "gereedschappen")
        self.assertEqual(indeling.url_van("Bestandtools"), "bestandsgereedschap")
        self.assertEqual(indeling.url_van("Bestanden"), "bestanden")
        self.assertIsNone(indeling.url_van(123))
        self.assertIsNone(indeling.groep_van({}))


if __name__ == "__main__":
    unittest.main()

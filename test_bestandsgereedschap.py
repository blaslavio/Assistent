"""Werkelijke gzip-, CSV- en FFmpeg-verwerking en downloadresultaten per sessie."""

from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal
import gzip
import io
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import bestandsgereedschap as tools


class BestandTest(unittest.TestCase):
    def test_gzip_bewaart_exact_de_originele_bytes(self):
        inhoud = ("Test met euro € en accenten é\n" * 100).encode()
        resultaat = tools.comprimeer("../../rapport.txt", inhoud)
        self.assertEqual(resultaat["naam"], "rapport.txt.gz")
        self.assertEqual(gzip.decompress(resultaat["data"]), inhoud)
        self.assertLess(resultaat["grootte"], resultaat["origineel"])
        self.assertEqual(len(resultaat["sha256"]), 64)

    def test_leeg_en_al_gecomprimeerd_geeft_eerlijke_grootte(self):
        leeg = tools.comprimeer("leeg", b"")
        self.assertEqual(gzip.decompress(leeg["data"]), b"")
        self.assertEqual(leeg["besparing"], 0)
        bestaand = gzip.compress(b"")
        resultaat = tools.comprimeer("bestaand.gz", bestaand)
        self.assertGreater(resultaat["grootte"], len(bestaand))
        self.assertLess(resultaat["besparing"], 0)

    def test_bestandsnaam_en_limiet(self):
        self.assertEqual(tools.veilige_naam("..\\map\\test\x00.txt"), "test.txt")
        self.assertEqual(tools.veilige_naam("../.."), "bestand")
        with self.assertRaises(tools.Fout):
            tools.comprimeer("groot", b"x" * (tools.MAX_BYTES + 1))

    def test_csv_met_decimale_komma_en_lege_velden(self):
        inhoud = "\ufeffnaam;bedrag\nA;1,25\nB;2,75\nC;\n".encode()
        resultaat = tools.analyseer_csv("gegevens.csv", inhoud)
        stats = resultaat["statistieken"][1]
        self.assertEqual((resultaat["rijen"], stats["getallen"], stats["leeg"]), (3, 2, 1))
        self.assertEqual(Decimal(stats["som"]), Decimal("4"))
        self.assertEqual(resultaat["grafiek"]["bedrag"], [1.25, 2.75, None])
        self.assertEqual(json.loads(resultaat["data"])["rijen"], 3)

    def test_csv_statistiek_gebruikt_meer_dan_het_voorbeeld(self):
        data = ("waarde\n" + "\n".join(str(n) for n in range(1, 232))).encode()
        resultaat = tools.analyseer_csv("tabel.csv", data)
        self.assertEqual(len(resultaat["voorbeeld"]), 200)
        self.assertEqual(resultaat["rijen"], 231)
        self.assertEqual(Decimal(resultaat["statistieken"][0]["som"]), sum(range(1, 232)))

    def test_csv_onleesbaar_dubbele_headers_en_foute_rijen(self):
        for inhoud in (b"", b"a,a\n1,2", b"a,b\n1,2,3", b"a\n\xff", b"a\n\x00"):
            with self.subTest(inhoud=inhoud), self.assertRaises(tools.Fout):
                tools.analyseer_csv("test.csv", inhoud)

    def test_csv_nan_en_extreme_exponenten_zijn_geen_grafiekgetallen(self):
        data = b"waarde\nNaN\n1e999\n3\n"
        resultaat = tools.analyseer_csv("test.csv", data)
        self.assertEqual(resultaat["statistieken"][0]["overig"], 2)
        self.assertFalse(resultaat["grafiek"])

    def test_csv_limiet_en_exacte_som_van_grote_getallen(self):
        with self.assertRaises(tools.Fout):
            tools.analyseer_csv("teveel.csv", b"waarde\n" + b"1\n" * (tools.MAX_RIJEN + 1))
        resultaat = tools.analyseer_csv("groot.csv", b"waarde\n1e100\n1\n")
        self.assertEqual(resultaat["statistieken"][0]["som"], str(10 ** 100 + 1))


@unittest.skipUnless(tools.video_beschikbaar(), "FFmpeg en FFprobe ontbreken")
class VideoTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.mapje = tempfile.TemporaryDirectory()
        cls.addClassCleanup(cls.mapje.cleanup)
        cls.bron = Path(cls.mapje.name) / "bron.mp4"
        subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
                        "-f", "lavfi", "-i", "testsrc2=size=160x90:rate=30", "-f", "lavfi", "-i", "sine=frequency=880:sample_rate=44100",
                        "-t", "3", "-c:v", "libx264", "-threads", "1", "-pix_fmt", "yuv420p", "-c:a", "aac", str(cls.bron)],
                       check=True, capture_output=True, timeout=20)
        cls.inhoud = cls.bron.read_bytes()

    def test_echt_videofragment_is_afspeelbaar_en_heeft_juiste_duur(self):
        resultaat = tools.knip_video("video.mp4", self.inhoud, start=0.5, duur=0.7)
        uitvoer = Path(self.mapje.name) / "uitvoer.mp4"
        uitvoer.write_bytes(resultaat["data"])
        metadata = tools._probe(uitvoer)
        self.assertEqual(metadata["codec_name"], "h264")
        self.assertAlmostEqual(metadata["duur"], 0.7, delta=0.1)

    def test_twee_bewerkingen_met_dezelfde_naam_blijven_gescheiden(self):
        with ThreadPoolExecutor(max_workers=2) as pool:
            resultaten = list(pool.map(lambda duur: tools.knip_video("zelfde.mp4", self.inhoud, duur=duur), [0.5, 1.5]))
        self.assertNotEqual(resultaten[0]["data"], resultaten[1]["data"])
        self.assertLess(resultaten[0]["duur"], resultaten[1]["duur"])

    def test_fout_ruimt_tijdelijke_bestanden_op(self):
        echt = tempfile.TemporaryDirectory
        with echt() as mapje:
            with patch.object(tools.tempfile, "TemporaryDirectory", side_effect=lambda **kw: echt(dir=mapje, **kw)):
                with self.assertRaises(tools.Fout):
                    tools.knip_video("video.mp4", b"geen video")
            self.assertFalse(list(Path(mapje).iterdir()))

    def test_ongeldige_tijden_en_timeout_worden_geweigerd(self):
        for start, duur in ((float("nan"), 1), (0, float("inf")), (-1, 2), (5, 1), (0, 61)):
            with self.subTest(start=start, duur=duur), self.assertRaises(tools.Fout):
                tools.knip_video("video.mp4", self.inhoud, start, duur)
        with patch.object(tools.subprocess, "run", side_effect=subprocess.TimeoutExpired("ffprobe", 15)), self.assertRaises(tools.Fout):
            tools.knip_video("video.mp4", self.inhoud)


class SchermTest(unittest.TestCase):
    def bestand(self, naam="test.txt", inhoud=b"test" * 100):
        bestand = io.BytesIO(inhoud)
        bestand.name = naam
        return bestand

    def test_download_blijft_beschikbaar_na_rerun_en_kan_gewist(self):
        import streamlit as st
        from streamlit.testing.v1 import AppTest
        with patch.object(st, "file_uploader", return_value=self.bestand()) as upload:
            app = AppTest.from_string("import bestandsgereedschap_scherm\nbestandsgereedschap_scherm.pagina()").run()
            app.button(key="bt_verwerk").click().run()
            self.assertFalse(app.exception)
            self.assertTrue(app.success)
            self.assertEqual(gzip.decompress(app.session_state.bt_resultaat["data"]), b"test" * 100)
            app.run()
            self.assertTrue(app.success)
            upload.return_value = None
            app.button(key="bt_wissen").click().run()
            self.assertNotIn("bt_resultaat", app.session_state)

    def test_accountwissel_wist_oude_resultaten(self):
        import streamlit as st
        from streamlit.testing.v1 import AppTest
        with patch.object(st, "file_uploader", return_value=self.bestand()) as upload:
            app = AppTest.from_string("import bestandsgereedschap_scherm\nbestandsgereedschap_scherm.pagina()").run()
            app.button(key="bt_verwerk").click().run()
            upload.return_value = None
            app.session_state.naam = "ander-account"
            app.run()
            self.assertFalse(app.exception)
            self.assertNotIn("bt_resultaat", app.session_state)

    def test_csv_grafiek_en_fout_zonder_valse_succesmelding(self):
        import streamlit as st
        from streamlit.testing.v1 import AppTest
        with patch.object(st, "file_uploader", return_value=self.bestand("tabel.csv", b"waarde\n1\n2\n")) as upload:
            app = AppTest.from_string("import bestandsgereedschap_scherm\nbestandsgereedschap_scherm.pagina()").run()
            app.selectbox(key="bt_bewerking").select("CSV analyseren").run()
            app.button(key="bt_verwerk").click().run()
            self.assertFalse(app.exception)
            self.assertEqual(app.session_state.bt_resultaat["rijen"], 2)
            upload.return_value = self.bestand("fout.csv", b"a,a\n1,2")
            app.button(key="bt_verwerk").click().run()
            self.assertTrue(app.error)
            self.assertFalse(app.success)


if __name__ == "__main__":
    unittest.main()

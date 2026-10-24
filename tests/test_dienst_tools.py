import unittest
import dienst_tools

class DienstTests(unittest.TestCase):
    def test_rechten(self):
        self.assertTrue(dienst_tools.toegestaan('student', 'document_lezen'))
        self.assertFalse(dienst_tools.toegestaan('student', 'rooster_publiceren', True))
        self.assertFalse(dienst_tools.toegestaan('docent', 'livestream_starten'))
        self.assertTrue(dienst_tools.toegestaan('docent', 'livestream_starten', True))

import ast
from pathlib import Path
import unittest

class LabelTests(unittest.TestCase):
    def test_samen_labels_without_emoji(self):
        tree = ast.parse(Path('samen.py').read_text(encoding='utf-8'))
        names = {'SOORTEN_DELEN', 'SOORTEN_ITEM', 'SOORTEN_AANBOD', 'BETAALWIJZEN', 'LEVERING', 'STATUS'}
        values = {}
        for node in tree.body:
            if isinstance(node, ast.Assign):
                for target in node.targets:
                    if isinstance(target, ast.Name) and target.id in names:
                        values[target.id] = ast.literal_eval(node.value)
        self.assertEqual(set(values), names)
        for group in values.values():
            for label in group.values():
                self.assertTrue(label and label[0].isalpha(), label)

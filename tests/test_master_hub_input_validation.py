"""Regression tests for Master Hub draft validation and intent boundaries."""
import pytest
from multistream_core import make_draft, classify, filter_drafts

@pytest.mark.parametrize("message,category", [
    ("Plan een voetbalwedstrijd", "Sport"),
    ("Verhuur een zaal", "Verhuur / Rooster"),
    ("Maak een video", "Video Project"),
    ("Nieuwe deadline", "Projecten"),
    ("Verkoop een fiets", "Verkoop"),
    ("Deel met de groep", "Community"),
    ("Hoi", "Chat"),
])
def test_routing(message, category):
    assert classify(message) == category

@pytest.mark.parametrize("bad", ["\x00test", "test\x1b", "\x7ftest", "x" * 501, ""])
def test_reject_invalid_input(bad):
    with pytest.raises(ValueError):
        make_draft(bad)

def test_multiline_is_allowed():
    assert make_draft("Regel 1\nRegel 2").status == "concept"

def test_filtered_drafts_do_not_cross_lens():
    drafts = [{"category": "Sport"}, {"category": "Chat"}]
    assert filter_drafts(drafts, "Sport") == [drafts[0]]
    with pytest.raises(ValueError):
        filter_drafts(drafts, "Niet bestaand")

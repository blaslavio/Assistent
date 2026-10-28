"""Regression coverage for Master Hub routing and privacy-preserving drafts."""
import pytest
from multistream_core import classify, make_draft, filter_drafts, LENSES

@pytest.mark.parametrize("message,expected", [
    ("Start een videoproject", "Video Project"),
    ("Monteer een film", "Video Project"),
    ("Verhuur de vergaderzaal", "Verhuur / Rooster"),
    ("Wijzig het rooster", "Verhuur / Rooster"),
    ("Plan een voetbalwedstrijd", "Sport"),
    ("Bokstraining op zaterdag", "Sport"),
    ("Verkoop mijn fiets", "Verkoop"),
    ("Nieuwe project deadline", "Projecten"),
    ("Deel met de groep", "Community"),
    ("Goedemorgen", "Chat"),
    ("Kan ik je iets vragen?", "Chat"),
])
def test_stream_routing(message, expected):
    assert classify(message) == expected

def test_draft_never_executes_external_action():
    draft = make_draft("Verhuur de zaal")
    assert draft.category == "Verhuur / Rooster"
    assert draft.status == "concept"
    assert draft.text == "Verhuur de zaal"

def test_all_filters_available():
    assert {"Video Project", "Verhuur / Rooster", "Sport"}.issubset(LENSES)
    drafts = [{"category": "Sport", "text": "Training"}, {"category": "Chat", "text": "Hallo"}]
    assert filter_drafts(drafts, "Sport") == drafts[:1]
    assert filter_drafts(drafts, "Alles") == drafts

@pytest.mark.parametrize("bad", ["", " ", "x" * 501])
def test_invalid_drafts_rejected(bad):
    with pytest.raises(ValueError):
        make_draft(bad)

def test_unknown_filter_rejected():
    with pytest.raises(ValueError):
        filter_drafts([], "onbekend")

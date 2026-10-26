import pytest
from life_swarm_core import (
    LIFE_ROLES, classify_life_role, life_draft_profile,
    validate_life_role, may_publish_life_draft,
)

@pytest.mark.parametrize("text,expected", [
    ("Een herinnering aan oma", "Community & Nalatenschap"),
    ("Training morgen", "Trainer & Sport"),
    ("Huiswerk voor examen", "Leerling & Studie"),
    ("Verkoop mijn fiets", "Verkoop & Initiatief"),
    ("Mijn dochter komt morgen", "Vader & Gezin"),
    ("Een date plannen", "Dating & Verbinding"),
    ("Training met mijn kinderen", None),
    ("Hoi", None),
])
def test_role_advisory(text, expected):
    assert classify_life_role(text) == expected

@pytest.mark.parametrize("role", LIFE_ROLES)
def test_all_roles_private(role):
    assert validate_life_role(role) == role
    assert life_draft_profile(role) == "Privé"
    assert may_publish_life_draft(explicitly_confirmed=True) is False

def test_unknown_role_rejected():
    with pytest.raises(ValueError):
        validate_life_role("Admin")

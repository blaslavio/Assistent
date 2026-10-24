"""Toegestane acties per dienstverlening. Database controleert rechten opnieuw."""
DIENSTEN = {
    "student": {"document_lezen", "document_maken", "document_delen", "cursus_lezen"},
    "community": {"community_lezen", "community_chat", "livestream_bekijken"},
    "docent": {"cursus_lezen", "lesmateriaal_beheren", "videoles_plannen", "livestream_starten"},
    "werk": {"rooster_bekijken", "ruilverzoek_maken"},
    "planner": {"rooster_bekijken", "ruilverzoek_maken", "rooster_publiceren"},
    "winkel": {"catalogus_zoeken", "mandje_wijzigen"},
}
BEVESTIGEN = {"document_delen", "lesmateriaal_beheren", "videoles_plannen",
              "livestream_starten", "rooster_publiceren", "mandje_wijzigen"}


def toegestaan(dienst: str, actie: str, bevestigd: bool = False) -> bool:
    return actie in DIENSTEN.get(dienst, set()) and (actie not in BEVESTIGEN or bevestigd)


def acties(dienst: str) -> list[str]:
    return sorted(DIENSTEN.get(dienst, set()))

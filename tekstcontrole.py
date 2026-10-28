"""Tekstgrenzen voor invoer die veilig in JSON, PostgreSQL en de UI past."""
import unicodedata


def veilig(tekst, regels=False):
    if not isinstance(tekst, str):
        return False
    toegestaan = {"\n", "\r", "\t"} if regels else set()
    return not any(unicodedata.category(c) == "Cs" or (unicodedata.category(c) == "Cc" and c not in toegestaan) for c in tekst)

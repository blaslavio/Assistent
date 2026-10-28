"""Community Hub: purpose-first content categories and moderation defaults.

Public reading is possible; publishing requires an authenticated user.
No infinite-scroll engagement ranking, public popularity score or automatic code execution.
"""
from dataclasses import dataclass
from enum import Enum


class Category(str, Enum):
    HELP = "hulp"
    NEWS = "nieuws"
    VIDEO = "video"
    SERVICE = "dienst"
    PROJECT = "project"
    LEARNING = "leren"


@dataclass(frozen=True)
class CommunityEntry:
    category: Category
    title: str
    summary: str
    author_id: str
    source_url: str | None = None
    status: str = "pending_review"


def prepare_entry(category: str, title: str, summary: str, author_id: str,
                  source_url: str | None = None) -> CommunityEntry:
    kind = Category(category)
    if not author_id.strip():
        raise PermissionError("Inloggen is vereist om iets te publiceren.")
    if not 3 <= len(title.strip()) <= 160:
        raise ValueError("Titel moet tussen 3 en 160 tekens bevatten.")
    if not 10 <= len(summary.strip()) <= 5000:
        raise ValueError("Beschrijving moet tussen 10 en 5000 tekens bevatten.")
    if kind in (Category.NEWS, Category.VIDEO) and not source_url:
        raise ValueError("Nieuws en videos vereisen een bronlink.")
    if source_url:
        from urllib.parse import urlsplit
        parts = urlsplit(source_url)
        if parts.scheme != "https" or not parts.hostname or parts.username or parts.password:
            raise ValueError("Gebruik een geldige HTTPS-bronlink.")
    return CommunityEntry(kind, title.strip(), summary.strip(), author_id.strip(), source_url)


def can_publish(entry: CommunityEntry, moderator_approved: bool) -> bool:
    return moderator_approved and entry.status == "pending_review"

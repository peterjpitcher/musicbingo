from __future__ import annotations

from dataclasses import dataclass
import hashlib
import random


@dataclass(frozen=True)
class Card:
    artists: tuple[str, ...]
    titles: tuple[str, ...]
    card_id: str


def _card_signature(artists: tuple[str, ...], titles: tuple[str, ...]) -> str:
    joined = "\n".join(artists) + "\n---\n" + "\n".join(titles)
    return hashlib.sha256(joined.encode("utf-8")).hexdigest()


def generate_cards(
    *,
    unique_artists: list[str],
    unique_titles: list[str],
    count: int = 200,
    seed: int | None = None,
    max_attempts_per_card: int = 1000,
) -> list[Card]:
    if len(unique_artists) < 25:
        raise ValueError(f"Need at least 25 unique artists, got {len(unique_artists)}")
    if len(unique_titles) < 25:
        raise ValueError(f"Need at least 25 unique titles, got {len(unique_titles)}")
    if count <= 0:
        raise ValueError("count must be > 0")

    rng = random.Random(seed)
    seen: set[str] = set()
    cards: list[Card] = []

    for _ in range(count):
        for _attempt in range(max_attempts_per_card):
            artists = tuple(rng.sample(unique_artists, k=25))
            titles = tuple(rng.sample(unique_titles, k=25))
            artists = tuple(rng.sample(list(artists), k=25))
            titles = tuple(rng.sample(list(titles), k=25))

            sig = _card_signature(artists, titles)
            if sig in seen:
                continue
            seen.add(sig)
            cards.append(Card(artists=artists, titles=titles, card_id=sig[:10]))
            break
        else:
            raise RuntimeError(
                "Unable to generate a unique card; try increasing the source list or retry limits."
            )

    return cards

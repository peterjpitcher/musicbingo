from __future__ import annotations

from dataclasses import dataclass
import re
from typing import Iterable


_DECADE_HEADER_RE = re.compile(r"^\s*\d{4}s\s*\(\s*\d+\s*\)\s*$")
_SPLIT_RE = re.compile(r"\s+[–—-]\s+")
_WS_RE = re.compile(r"\s+")


@dataclass(frozen=True)
class ParseResult:
    songs: list[tuple[str, str]]
    unique_artists: list[str]
    unique_titles: list[str]
    ignored_lines: list[str]


def _iter_nonempty_lines(text: str) -> Iterable[str]:
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        yield line


def parse_song_list_text(text: str) -> ParseResult:
    songs: list[tuple[str, str]] = []
    seen_song_keys: set[tuple[str, str]] = set()
    artist_casefold_to_value: dict[str, str] = {}
    title_casefold_to_value: dict[str, str] = {}
    ignored: list[str] = []

    for line in _iter_nonempty_lines(text):
        if _DECADE_HEADER_RE.match(line):
            ignored.append(line)
            continue

        parts = _SPLIT_RE.split(line, maxsplit=1)
        if len(parts) != 2:
            ignored.append(line)
            continue

        artist = _WS_RE.sub(" ", parts[0]).strip()
        title = _WS_RE.sub(" ", parts[1]).strip()
        if not artist or not title:
            ignored.append(line)
            continue

        song_key = (artist.casefold(), title.casefold())
        if song_key in seen_song_keys:
            continue
        seen_song_keys.add(song_key)
        songs.append((artist, title))

        artist_casefold_to_value.setdefault(artist.casefold(), artist)
        title_casefold_to_value.setdefault(title.casefold(), title)

    unique_artists = list(artist_casefold_to_value.values())
    unique_titles = list(title_casefold_to_value.values())

    return ParseResult(
        songs=songs,
        unique_artists=unique_artists,
        unique_titles=unique_titles,
        ignored_lines=ignored,
    )

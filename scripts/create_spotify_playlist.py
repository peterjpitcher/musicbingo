from __future__ import annotations

import argparse
from dataclasses import dataclass
from getpass import getpass
import os
from pathlib import Path
import re
import sys

SCOPE = "playlist-modify-private user-read-private"

DEFAULT_INPUT_FILENAME = "song_list.txt"
DEFAULT_EVENT_DATE_FILENAME = "event_date.txt"

SCRIPT_DIR = Path(__file__).resolve().parent


@dataclass(frozen=True)
class SpotifyConfig:
    client_id: str
    client_secret: str
    redirect_uri: str


class MissingSpotifyCredentialsError(RuntimeError):
    pass


def _import_load_dotenv():
    try:
        from dotenv import load_dotenv
    except ModuleNotFoundError as exc:  # pragma: no cover - depends on local env
        raise RuntimeError(
            "Missing dependency: python-dotenv.\n"
            "Install it with:\n"
            "  python3 -m pip install -r requirements.txt"
        ) from exc
    return load_dotenv


def _import_spotipy():
    try:
        import spotipy
        from spotipy.oauth2 import SpotifyOAuth
    except ModuleNotFoundError as exc:  # pragma: no cover - depends on local env
        raise RuntimeError(
            "Missing dependency: spotipy.\n"
            "Install it with:\n"
            "  python3 -m pip install -r requirements.txt"
        ) from exc
    return spotipy, SpotifyOAuth


def _import_tqdm():
    try:
        from tqdm import tqdm
    except ModuleNotFoundError as exc:  # pragma: no cover - depends on local env
        raise RuntimeError(
            "Missing dependency: tqdm.\n"
            "Install it with:\n"
            "  python3 -m pip install -r requirements.txt"
        ) from exc
    return tqdm


def _normalize_env_value(value: str) -> str:
    v = (value or "").strip()
    if len(v) >= 2 and ((v[0] == v[-1] == '"') or (v[0] == v[-1] == "'")):
        v = v[1:-1].strip()
    return v


def _missing_spotify_env_message(missing: list[str]) -> str:
    env_path = SCRIPT_DIR / ".env"
    env_example_path = SCRIPT_DIR / ".env.example"
    has_env = env_path.exists()
    lines = [
        "Missing Spotify credentials: " + ", ".join(missing),
        "",
        "This script needs Spotify API keys from a Spotify Developer app:",
        "  https://developer.spotify.com/dashboard",
        "",
        f"{'Edit' if has_env else 'Create'} {env_path.name} in this folder:",
        f"  {SCRIPT_DIR}",
    ]
    if env_example_path.exists():
        lines += [
            "",
            "Quick start:",
            f"  cp {env_example_path.name} {env_path.name}",
            "  # then edit .env and fill in SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET",
            "",
            "macOS Finder note: files starting with '.' may be hidden. You can show hidden files with:",
            "  Cmd + Shift + .",
        ]
    lines += [
        "",
        "Or run the interactive setup:",
        "  python3 create_spotify_playlist.py --configure",
    ]
    return "\n".join(lines)


def _load_spotify_config(load_dotenv) -> SpotifyConfig:
    load_dotenv(dotenv_path=SCRIPT_DIR / ".env")
    client_id = _normalize_env_value(os.getenv("SPOTIFY_CLIENT_ID", ""))
    client_secret = _normalize_env_value(os.getenv("SPOTIFY_CLIENT_SECRET", ""))
    redirect_uri = _normalize_env_value(os.getenv("SPOTIFY_REDIRECT_URI", "http://127.0.0.1:8888/callback"))

    placeholders = {"your_client_id", "your_client_secret"}
    if client_id in placeholders:
        client_id = ""
    if client_secret in placeholders:
        client_secret = ""

    missing = [name for name, val in [
        ("SPOTIFY_CLIENT_ID", client_id),
        ("SPOTIFY_CLIENT_SECRET", client_secret),
    ] if not val]
    if missing:
        raise MissingSpotifyCredentialsError(_missing_spotify_env_message(missing))

    return SpotifyConfig(client_id=client_id, client_secret=client_secret, redirect_uri=redirect_uri)


def _read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


_DECADE_HEADER_RE = re.compile(r"^\s*\d{4}s\s*\(\s*\d+\s*\)\s*$")
_SPLIT_RE = re.compile(r"\s+[–—-]\s+")
_WS_RE = re.compile(r"\s+")


def parse_song_list_text(text: str) -> list[tuple[str, str]]:
    songs: list[tuple[str, str]] = []
    seen_song_keys: set[tuple[str, str]] = set()

    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        if _DECADE_HEADER_RE.match(line):
            continue

        parts = _SPLIT_RE.split(line, maxsplit=1)
        if len(parts) != 2:
            continue

        artist = _WS_RE.sub(" ", parts[0]).strip()
        title = _WS_RE.sub(" ", parts[1]).strip()
        if not artist or not title:
            continue

        song_key = (artist.casefold(), title.casefold())
        if song_key in seen_song_keys:
            continue
        seen_song_keys.add(song_key)
        songs.append((artist, title))

    return songs


def _make_playlist_name(event_date: str) -> str:
    return f"Music Bingo - {event_date}".strip()


def _default_input_path() -> Path:
    return SCRIPT_DIR / DEFAULT_INPUT_FILENAME


def _read_default_event_date() -> str | None:
    path = SCRIPT_DIR / DEFAULT_EVENT_DATE_FILENAME
    if not path.exists():
        return None
    text = path.read_text(encoding="utf-8").strip()
    return text or None


def _configure_env_interactive() -> int:
    env_path = SCRIPT_DIR / ".env"
    env_example_path = SCRIPT_DIR / ".env.example"
    if env_path.exists():
        resp = input(f"{env_path.name} already exists. Overwrite it? [y/N]: ").strip().lower()
        if resp not in {"y", "yes"}:
            print(f"Keeping existing {env_path.name}.")
            return 0

    print("Spotify credentials are required to create a playlist.")
    print("Create a Spotify Developer app here (Client ID + Client Secret):")
    print("  https://developer.spotify.com/dashboard")
    print("")
    client_id = input("SPOTIFY_CLIENT_ID: ").strip()
    client_secret = getpass("SPOTIFY_CLIENT_SECRET: ").strip()
    redirect_uri = (
        input("SPOTIFY_REDIRECT_URI [http://127.0.0.1:8888/callback]: ").strip()
        or "http://127.0.0.1:8888/callback"
    )

    missing: list[str] = []
    if not client_id:
        missing.append("SPOTIFY_CLIENT_ID")
    if not client_secret:
        missing.append("SPOTIFY_CLIENT_SECRET")
    if missing:
        raise RuntimeError("Missing values: " + ", ".join(missing))

    header = "# Generated by create_spotify_playlist.py --configure\n"
    if env_example_path.exists():
        first_lines = env_example_path.read_text(encoding="utf-8").splitlines()
        if first_lines:
            header = first_lines[0].rstrip() + "\n"
    contents = (
        header
        + f"SPOTIFY_CLIENT_ID={client_id}\n"
        + f"SPOTIFY_CLIENT_SECRET={client_secret}\n"
        + f"SPOTIFY_REDIRECT_URI={redirect_uri}\n"
    )
    env_path.write_text(contents, encoding="utf-8")
    print(f"Wrote {env_path}")
    print("Make sure your Spotify app Redirect URI matches SPOTIFY_REDIRECT_URI.")
    return 0


def _prompt_yes_no(prompt: str, default_yes: bool = True) -> bool:
    suffix = " [Y/n]: " if default_yes else " [y/N]: "
    try:
        resp = input(prompt + suffix).strip().lower()
    except EOFError:
        return False
    if not resp:
        return default_yes
    return resp in {"y", "yes"}

def _looks_like_invalid_redirect_uri_error(exc: Exception) -> bool:
    msg = str(exc).lower()
    if "redirect" not in msg or "uri" not in msg:
        return False
    return "invalid redirect" in msg or ("invalid" in msg and "redirect uri" in msg)


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="Create a private Spotify playlist from a Music Bingo song list.")
    parser.add_argument("--configure", action="store_true", help="Interactively create/update a .env file next to this script")
    parser.add_argument(
        "--input",
        default=None,
        help=f"Path to the input .txt song list (default: {DEFAULT_INPUT_FILENAME} next to this script)",
    )
    parser.add_argument(
        "--event-date",
        default=None,
        help=f'Event date string, e.g. "May 1st 2026" (default: read {DEFAULT_EVENT_DATE_FILENAME} next to this script)',
    )
    parser.add_argument("--playlist-name", default=None, help="Optional explicit playlist name override")
    parser.add_argument("--dry-run", action="store_true", help="Do everything except create/modify playlist")
    args = parser.parse_args(argv)

    if args.configure:
        return _configure_env_interactive()

    path = _default_input_path() if not args.input else Path(args.input).expanduser()
    if not path.exists():
        raise RuntimeError(
            "Input file not found:\n"
            f"  {path}\n"
            "\n"
            "Tip: put song_list.txt next to this script, or pass --input /path/to/song_list.txt"
        )

    text = _read_text(path)
    songs = parse_song_list_text(text)
    if not songs:
        raise RuntimeError("No songs found in input file.")

    event_date = (args.event_date or "").strip() or _read_default_event_date()
    if not args.playlist_name and not event_date:
        raise RuntimeError(
            "Event date is required. Provide --event-date or create an event_date.txt next to the script."
        )

    playlist_name = args.playlist_name or _make_playlist_name(event_date or "")

    if args.dry_run:
        print(f"[dry-run] Would create private playlist: {playlist_name}")
        print(f"[dry-run] Would search/add {len(songs)} tracks")
        return 0

    load_dotenv = _import_load_dotenv()
    spotipy, SpotifyOAuth = _import_spotipy()
    tqdm = _import_tqdm()
    try:
        cfg = _load_spotify_config(load_dotenv)
    except MissingSpotifyCredentialsError as exc:
        if _prompt_yes_no("Spotify credentials are not configured. Set them up now?", default_yes=True):
            _configure_env_interactive()
            cfg = _load_spotify_config(load_dotenv)
        else:
            raise RuntimeError(str(exc)) from exc

    auth = SpotifyOAuth(
        client_id=cfg.client_id,
        client_secret=cfg.client_secret,
        redirect_uri=cfg.redirect_uri,
        scope=SCOPE,
        open_browser=True,
        cache_path=str(SCRIPT_DIR / ".spotify_token_cache"),
    )
    try:
        sp = spotipy.Spotify(auth_manager=auth)
        user_id = sp.me()["id"]
    except Exception as exc:
        if _looks_like_invalid_redirect_uri_error(exc):
            raise RuntimeError(
                "Spotify rejected the redirect URI.\n"
                f"Configured SPOTIFY_REDIRECT_URI:\n  {cfg.redirect_uri}\n"
                "\nFix:\n"
                "- In your Spotify Developer app settings, add that exact value under Redirect URIs and save.\n"
                "- Or change SPOTIFY_REDIRECT_URI in .env, but it must exactly match a Redirect URI registered in the app.\n"
                "\nCommon mismatches: localhost vs 127.0.0.1, wrong port, missing /callback, trailing slash, http vs https."
            ) from exc
        raise

    playlist = sp.user_playlist_create(user_id, playlist_name, public=False, description="Generated by Music Bingo")
    playlist_id = playlist["id"]

    track_uris: list[str] = []
    not_found: list[tuple[str, str]] = []

    print(f"Searching for {len(songs)} songs on Spotify...")
    for artist, title in tqdm(songs, desc="Searching"):
        q = f'track:"{title}" artist:"{artist}"'
        result = sp.search(q=q, type="track", limit=5)
        items = result.get("tracks", {}).get("items", []) or []
        if not items:
            not_found.append((artist, title))
            continue
        track_uris.append(items[0]["uri"])

    if track_uris:
        print("\nAdding tracks to playlist...")
        for i in tqdm(range(0, len(track_uris), 100), desc="Adding"):
            sp.playlist_add_items(playlist_id, track_uris[i : i + 100])

    print(f'\nPlaylist "{playlist_name}" created with {len(track_uris)} tracks.')
    if not_found:
        print(f"{len(not_found)} tracks not found:")
        for artist, title in not_found:
            print(f"- {artist} — {title}")

    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main(sys.argv[1:]))
    except KeyboardInterrupt:
        print("\nCancelled.", file=sys.stderr)
        raise SystemExit(130)
    except Exception as exc:
        msg = str(exc).rstrip() or repr(exc)
        if "\n" in msg:
            first, rest = msg.split("\n", 1)
            print(f"ERROR: {first}", file=sys.stderr)
            print(rest, file=sys.stderr)
        else:
            print(f"ERROR: {msg}", file=sys.stderr)
        raise SystemExit(2)

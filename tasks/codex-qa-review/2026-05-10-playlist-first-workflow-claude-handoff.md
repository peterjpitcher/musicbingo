# Claude Hand-Off Brief: Playlist-First Workflow Spec

**Generated:** 2026-05-10
**Review mode:** A (Adversarial Challenge)
**Overall risk:** Medium — spec is solid on the core workflow but has 4 gaps to close before implementation

## DO NOT REWRITE

- The two-phase split (create playlists → generate cards) is correct
- The no-Spotify fallback path is correctly preserved
- The API surface (2 new routes) is appropriately minimal
- The `introSongs` array model with typed entries is the right shape
- The files-to-modify list accurately matches the codebase

## SPEC REVISION REQUIRED

- [ ] **Intro URL validation table**: Define accepted formats (track URL, track URI), rejected formats (playlist/album/shortened URLs), empty state (optional?), and when validation fires (on paste/blur)
- [ ] **Double-submit protection**: Specify button disabled during creation; playlist IDs persisted so refresh doesn't lose state
- [ ] **Per-game failure handling**: Each game gets independent success/failed/pending status; failed games can retry individually; orphan Spotify playlists are accepted as harmless
- [ ] **Intro song data flow**: Confirm stored in `LiveGameConfig.introSongs`, used for host playback detection, included in DOCX clipboard, NOT on bingo cards
- [ ] **Challenge songs unchanged**: Explicitly confirm challenge songs remain as song-list dropdowns (not affected by this change)

## ASSUMPTIONS TO RESOLVE

- [ ] Are intro songs (dance along / sing along) required or optional per game?
- [ ] Should the "Refresh from Spotify" button also re-validate intro song URLs?
- [ ] Do challenge songs need the same URL-based treatment, or are they staying as dropdowns?

## REPO CONVENTIONS TO PRESERVE

- Spotify API calls go through `lib/spotifyWeb.ts` helpers, not inline in routes
- Form state in prep page uses React `useState` with FormData submission
- Live session types in `lib/live/types.ts` — keep backward compat with `?` optional fields
- Song parsing stays in `lib/parser.ts` — intro songs bypass this entirely

## RE-REVIEW REQUIRED AFTER FIXES

- [ ] AB-002 / WF-002: Re-review after intro URL validation table is added
- [ ] WF-003: Re-review after double-submit behaviour is specified

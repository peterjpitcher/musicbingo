# Adversarial Review: Playlist-First Workflow Spec

**Date:** 2026-05-10
**Mode:** A (Adversarial Challenge)
**Scope:** `tasks/spec-playlist-first-workflow.md`
**Pack:** `tasks/codex-qa-review/2026-05-10-playlist-first-workflow-review-pack.md`
**Reviewers:** Assumption Breaker, Integration & Architecture, Workflow & Failure-Path

## Executive Summary

The spec covers the core workflow split (create playlists → curate → generate cards) and the intro song URL change clearly. Three reviewers identified **no implementation defects** (no code to review yet) but flagged **4 spec-level gaps** worth addressing before implementation: URL validation detail, double-submit protection, partial failure handling, and intro song data ownership.

## What Appears Solid

- **Two-phase split is well-defined** — clear separation between playlist creation and card generation, with the Spotify playlist becoming the source of truth for card content
- **Fallback path preserved** — no-Spotify usage still works from raw song list
- **API surface is minimal** — one new route for playlist tracks, one for track metadata resolution
- **Files-to-modify list is accurate** — matches the actual codebase structure
- **Edge cases table covers the main scenarios** — fewer songs, extra songs, auth expiry, no playlists

## Spec Gaps to Address

### 1. Intro Song URL Validation (High)
**ID:** AB-002, WF-002

The spec says "validate URL format" but doesn't define accepted formats exhaustively or error states.

**What's missing:**
- What happens with playlist URLs (`open.spotify.com/playlist/...`), album URLs, shortened URLs (`spotify.link/...`)?
- What if the track is region-restricted or unavailable?
- What if the field is left empty? (Is intro song optional?)
- Should validation happen on paste, on blur, or on submit?

**Recommendation:** Add a validation table to the spec covering each URL variant and the expected behaviour.

### 2. Double-Submit / Idempotency (Medium)
**ID:** WF-003

The spec doesn't address what happens if the user clicks "Create Spotify Playlists" twice, or refreshes mid-creation.

**What's missing:**
- Does a second click create a duplicate playlist, or reuse the existing one?
- Is the button disabled during creation?
- What if the user refreshes after playlists are created but before generating cards — is the playlist state preserved?

**Recommendation:** Specify that the button is disabled during creation and that playlist IDs are persisted in component state (or localStorage) so a refresh doesn't lose them.

### 3. Partial Failure Across Services (Medium)
**ID:** WF-004

The workflow crosses Spotify API and local state. The spec doesn't define what happens when one succeeds and the other fails.

**What's missing:**
- If Game 1 playlist creation succeeds but Game 2 fails, what's the user's recovery path?
- If playlist creation succeeds but the state update fails (unlikely but possible), is the playlist orphaned?

**Recommendation:** Add a failure states section: per-game status (success/failed/pending), retry for individual games, and accept that orphan playlists in Spotify are harmless (user can delete manually).

### 4. Intro Song Data Ownership (Medium)
**ID:** ARCH-002

The spec changes intro songs from dropdown-selected (part of game song list) to URL-based (independent). But it doesn't fully specify where the resolved metadata lives across the data flow.

**What's missing:**
- Are resolved intro song details stored in `LiveGameConfig` in the live session?
- Do they appear in the PDF export? (Currently intro songs show in the host clipboard/DOCX)
- Does the guest view need intro song info?

**Recommendation:** Confirm that intro songs are stored in `LiveGameConfig.introSongs` array, included in the live session for host playback detection, and optionally shown in the DOCX clipboard but NOT on bingo cards.

## Minor Observations

- The complexity score bump from 3→4 is appropriate given the intro songs change adds a second API route and type model changes
- The `introSongs` array model (with `type: 'dance-along' | 'sing-along'`) is cleaner than two separate field pairs — good call
- Challenge songs are not mentioned in the spec — confirm they remain as dropdowns from the song list (unchanged)

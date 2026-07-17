# Defect log: prep wizard save flow

| ID | Type | Severity | Confidence | Status |
|----|------|----------|------------|--------|
| FF-001 | UX gap (reported bug) | Critical | High | Fixed |
| FF-002 | Data risk | Critical | High | Fixed |
| FF-003 | Bug (duplicate data) | High | High | Fixed |
| FF-004 | UX gap (double submit) | Medium | High | Fixed |
| FF-005 | UX gap (partial failure) | Low | High | Fixed via FF-001 |
| FF-006 | Maintainability | Low | High | Fixed |
| FF-007 | Observation | Low | Medium | Out of scope |

## FF-001: Save button invisible until both playlists exist
- Evidence: app/prep/StepGenerateConnect.tsx:333, block gated on `livePlaylistByGame`.
- Impact: host reaches the final step and cannot see any way to save; believes the
  feature is missing; abandons and loses prep (the reported incident).
- Root cause: conditional render hides the affordance instead of disabling it.
- Sibling check: brands page and host console always show their save/persist paths;
  no other hidden primary action found in app/ or components/.
- Fix: always render the Live Session block on the Generate step; disable Save and
  Export with an inline explanation (including which game's playlist is missing).
- Acceptance: Generate step shows the block with no playlists created; buttons
  disabled with reason; enabled after both playlists exist.

## FF-002: No draft persistence, refresh loses the whole game
- Evidence: app/prep/page.tsx holds all wizard fields in useState only; nothing is
  written anywhere before a successful save (which itself needs playlists).
- Impact: refresh, crash, tab close, or accidental navigation loses all typed prep.
- Root cause: missing autosave requirement; save was coupled to Spotify completion.
- Sibling check: host runtime state IS persisted (lib/live/storage.ts,
  runtimeSync.ts); the prep wizard was the only long-form flow without persistence.
  BrandForm is a short form with a always-visible save; out of scope.
- Fix: new lib/prepDraft.ts, versioned draft in localStorage; debounced autosave
  of all wizard fields (new-game mode), restore on mount with notice + discard,
  cleared after a successful save. Unit tests in lib/prepDraft.test.ts.
- Acceptance: type songs, reload page, fields and step restored; discard resets;
  after Save Live Session the draft is cleared.

## FF-003: Every save mints a new session id
- Evidence: app/prep/page.tsx:588 `id: editingSessionId ?? makeSessionId()`;
  saveLiveSession and exportLiveSession both call buildLiveSessionPayload.
- Impact: Generate Event Pack auto-save + manual Save = two duplicate sessions in
  the dashboard; double-clicking Save also duplicates.
- Root cause: id not remembered after first successful upsert.
- Sibling check: edit mode already stable via editingSessionId; export path shares
  the same builder so it is fixed by the same change.
- Fix: remember the id in savedSessionIdRef after a successful upsert; reuse it in
  buildLiveSessionPayload; centralised in persistLiveSession().
- Acceptance: save twice, one session row; generate pack then save, one row.

## FF-004: Save/Export have no busy or disabled state
- Evidence: StepGenerateConnect.tsx:354-355, plain onClick, no disabled while
  in flight. Authority: workspace ui-patterns.md (loading states on async actions,
  prevent double-submit).
- Fix: savingLive state in page.tsx passed as `saving`; both buttons disabled and
  Save shows "Saving..." while in flight.

## FF-005: Partial playlist failure leaves save impossible with no explanation
- Evidence: handleCreatePlaylists maps only successful playlists; one failure means
  `livePlaylistByGame` stays null while `playlistsCreated` can be true.
- Fix: covered by FF-001's hint, which names the specific game missing a playlist.

## FF-006: Empty challenge entries literal duplicated 7 times
- Evidence: `Array(5).fill(null).map(() => ({ value: "", type: "sing-along" }))` at
  page.tsx lines 105, 160, 172, 419, 433, 446, 460.
- Fix: makeEmptyChallengeEntries() helper used everywhere (needed anyway for
  discard-draft reset).

## FF-007: Re-saving updates createdAt so the dashboard reorders (observation)
- A re-save overwrites created_at with a fresh timestamp. Harmless for a
  single-operator tool; left as is deliberately. Not a defect without an authority.

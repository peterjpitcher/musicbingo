# Spec: 60-Second Song Duration + Host Dashboard Table Layout

## Problem Statement

1. **Song duration too short** — songs currently auto-advance after 40 seconds (with reveals at 13s/27s/33s). Users want 60 seconds per song to give players more time.
2. **Host dashboard layout** — the `/host` page uses a card grid (`grid-cols-1 sm:grid-cols-2`) which doesn't scale well with multiple sessions. Needs converting to a table.

## Change 1: Song Duration 40s → 60s

### What changes

The `DEFAULT_REVEAL_CONFIG` in `lib/live/types.ts` controls all timing. Currently:

```
albumMs:  13,000  (album art appears at 13s)
titleMs:  27,000  (title appears at 27s)
artistMs: 33,000  (artist appears at 33s)
nextMs:   40,000  (auto-advance at 40s)
```

New timings (proportionally scaled to fill 60s, with more breathing room):

```
albumMs:  15,000  (album art at 15s)
titleMs:  30,000  (title at 30s)
artistMs: 40,000  (artist at 40s)
nextMs:   60,000  (auto-advance at 60s)
```

The `CHALLENGE_REVEAL_CONFIG` stays at 90s (`nextMs: 90_000`) — no change needed.

### Files to change

| File | Change | Line(s) |
|------|--------|---------|
| `lib/live/types.ts` | Update `DEFAULT_REVEAL_CONFIG` values | 13-18 |
| `lib/live/reveal.test.ts` | Update test thresholds to match new config | 11-21, 31-57, 61 |
| `app/host/[sessionId]/page.tsx` | Update hardcoded badge labels: `@10s`→`@15s`, `@20s`→`@30s`, `@25s`→`@40s` | 1052-1054 |
| `app/host/[sessionId]/page.tsx` | Update challenge song description: `90s instead of 40s` → `90s instead of 60s` | 1108 |
| `app/host/[sessionId]/page.tsx` | Update fallback `nextMs: 30_000` to `60_000` (2 places) | 1025, 1057 |
| `app/guest/[sessionId]/page.tsx` | Update placeholder text: `Album reveals at 10s` → `15s`, `Title reveals at 20s` → `30s`, `Artist reveals at 25s` → `40s` | 317, 330, 340 |
| `app/guest/[sessionId]/page.tsx` | Update "Next song at" calculation: `30_000` → `60_000` | 354 |

### What does NOT change
- `CHALLENGE_REVEAL_CONFIG` (stays 90s)
- `extensionMs` logic (+30s button, skip 30s) — these are relative increments, still valid
- Spotify playback control — no timing hardcoded there
- Python test suite — doesn't test reveal timing
- Database schema — `revealConfig` is stored per-session in JSONB; existing sessions keep their saved config

### Existing sessions
Existing saved sessions store their own `revealConfig` in the `data` JSONB blob. Those sessions will keep their 40s timing until re-created. The default only affects new sessions. This is correct behaviour — no migration needed.

## Change 2: Host Dashboard Cards → Table

### Current layout (`app/host/page.tsx`)
- Uses `<Card>` components in a `grid-cols-1 sm:grid-cols-2` grid
- Each card shows: name, event date, created date, brand ID, game badges, action buttons, optional brand selector
- With many sessions, cards create a long scrolling page and waste horizontal space

### New layout
Replace the card grid with a responsive table:

| Column | Content |
|--------|---------|
| Name | Session name (bold, linked to host controller) |
| Event Date | `eventDateDisplay` |
| Games | Game badges inline (Game 1: Theme, Game 2: Theme) |
| Brand | Brand selector dropdown (inline, no toggle needed) |
| Actions | Re-download, Delete buttons |

### Design decisions
- **Responsive**: On mobile (`< md`), fall back to a stacked card-like layout per row using CSS
- **Link the name**: Session name links directly to `/host/[sessionId]` — removes the need for a separate "Open Host Controller" button
- **Inline brand selector**: Always visible as a dropdown in the Brand column — removes the "Change Brand" toggle
- **Slim actions**: Only "Re-download" and "Delete" remain as explicit buttons
- **Table wrapper**: Use `overflow-x-auto` for horizontal scroll on narrow screens
- **Consistent styling**: Use the existing `text-slate-*` colour palette, no new design tokens

### Files to change

| File | Change |
|------|--------|
| `app/host/page.tsx` | Replace card grid (lines 279-357) with table markup |

### What does NOT change
- All existing functionality (import, delete, re-download, brand change)
- `AppHeader` and action buttons in the header
- Loading/empty/error states (just re-styled for table context)
- No new components needed — plain HTML `<table>` with Tailwind

## Complexity Score

**Score: 2 (S)** — 5 files touched, no schema changes, no new dependencies, straightforward find-and-replace for timing, layout swap for table.

## Testing Plan

- [ ] Update `lib/live/reveal.test.ts` with new thresholds — run `npm test`
- [ ] Verify host controller badges show correct times
- [ ] Verify guest display placeholder text shows correct times
- [ ] Verify "Next song at" countdown uses 60s baseline
- [ ] Verify challenge song still shows 90s
- [ ] Verify +30s extension still works correctly
- [ ] Verify host dashboard table renders correctly with 0, 1, and multiple sessions
- [ ] Verify brand selector works inline in table
- [ ] Verify delete and re-download work from table actions
- [ ] Run full verification pipeline: `npm run verify`

# Codex Review Brief: Challenge Song Detection Bug

## Problem

Challenge songs are NOT being detected during live gameplay. The guest screen never shows the challenge banner. The host page shows no "CHALLENGE" badge either. This has been confirmed in production with multiple songs.

**Example:** Challenge song configured as "I Wanna Dance with Somebody — Whitney Houston". Spotify returns track title "I Wanna Dance with Somebody (Who Loves Me)" by "Whitney Houston". The substring matching should handle this, but it doesn't appear to work.

## Your Mission

Find why `isChallengeSong` never becomes `true` in the runtime state. The logic LOOKS correct — your job is to find what actually breaks at runtime.

## Key Files

- `app/host/[sessionId]/page.tsx` — Host controller. Runs Spotify polling, challenge detection, broadcasts runtime state.
- `app/guest/[sessionId]/page.tsx` — Guest display. Reads runtime state and shows challenge banner when `runtime.isChallengeSong` is true.
- `lib/live/types.ts` — Type definitions including `LiveRuntimeState`, `ChallengeSong`, `getChallengeSongs()`.
- `lib/live/storage.ts` — Runtime state validation for localStorage persistence and cross-device sync.

## Detection Flow (host page)

### Step 1: Playlist loads → resolve challenge track IDs (line ~237)
```typescript
// When playlist loads, fuzzy-match challenge songs to Spotify track IDs
if (game) {
  const songs = getChallengeSongs(game);
  const norm = (s: string) => s.trim().toLowerCase();
  const matched = new Set<string>();
  for (const cs of songs) {
    const ct = norm(cs.title);
    const ca = norm(cs.artist);
    const match = data.tracks.find((t) => {
      const tt = norm(t.title);
      const ta = norm(t.artist);
      return (tt.includes(ct) || ct.includes(tt)) && (ta.includes(ca) || ca.includes(ta));
    });
    if (match?.trackId) matched.add(match.trackId);
  }
  challengeTrackIdsRef.current = matched;  // <-- Set<string> stored in ref
}
```

### Step 2: Every 2s Spotify poll → `applyStatusSnapshot` callback (line ~310)
```typescript
const applyStatusSnapshot = useCallback(
  (payload: LiveStatusResponse, opts?: { mode?: LiveRuntimeState["mode"] }) => {
    if (!session) return;  // EARLY RETURN if no session
    const track = normalizeTrackSnapshot(payload.playback);
    commitRuntime((prev) => {
      const game = prev.activeGameNumber
        ? session.games.find((g) => g.gameNumber === prev.activeGameNumber) ?? null
        : null;
      const trackChanged = track?.trackId != null && track.trackId !== prev.currentTrack?.trackId;

      // Challenge detection
      const detectChallengeType = (t: typeof track): 'sing-along' | 'dance-along' | null => {
        if (!t) return null;
        if (challengeTrackIdsRef.current.has(t.trackId ?? "")) {
          return matchChallengeSong(t, game) ?? 'sing-along';
        }
        return matchChallengeSong(t, game);
      };
      const detectedType = isIntroSong
        ? null
        : trackChanged
          ? detectChallengeType(track)
          : (prev.challengeType ?? detectChallengeType(track));
      const isChallengeSong = detectedType !== null;
      const challengeType = detectedType;

      return {
        ...prev,
        isChallengeSong,
        challengeType,
        // ... other fields
      };
    });
  },
  [commitRuntime, session]  // <-- useCallback dependencies
);
```

### Step 3: `matchChallengeSong` function (line ~40)
```typescript
function matchChallengeSong(
  track: { title: string; artist: string } | null,
  game: LiveGameConfig | null | undefined
): 'sing-along' | 'dance-along' | null {
  if (!track || !game) return null;
  const songs = getChallengeSongs(game);
  if (songs.length === 0) return null;
  const norm = (s: string) => s.trim().toLowerCase();
  const t = norm(track.title);
  const a = norm(track.artist);
  const match = songs.find((cs) => {
    const ct = norm(cs.title);
    const ca = norm(cs.artist);
    return (t.includes(ct) || ct.includes(t)) && (a.includes(ca) || ca.includes(a));
  });
  return match?.type ?? null;
}
```

### Step 4: `getChallengeSongs` in types.ts
```typescript
export function getChallengeSongs(game: LiveGameConfig): ChallengeSong[] {
  if (game.challengeSongs && game.challengeSongs.length > 0) {
    return game.challengeSongs.map((s) => ({
      artist: s.artist,
      title: s.title,
      type: s.type ?? 'sing-along',
    }));
  }
  // Legacy fallback
  if (game.challengeSongArtist && game.challengeSongTitle) {
    return [{ artist: game.challengeSongArtist, title: game.challengeSongTitle, type: 'sing-along' }];
  }
  return [];
}
```

## Guest page rendering (line ~387)
```typescript
) : runtime.isChallengeSong ? (
  <div className="w-full bg-brand-gold/90 ...">
    <p>{runtime.challengeType === 'dance-along' ? "Dancing Challenge" : "Sing-Along Challenge"}</p>
    <h2>{runtime.challengeType === 'dance-along' ? "Get Up and Dance!" : "Sing Along!"}</h2>
  </div>
) : null}
```

## What to investigate

1. **Is `game` null when detection runs?** — `prev.activeGameNumber` resolves `game` from `session.games`. If the session's `games` array uses a different shape or the gameNumber doesn't match, game would be null and detection silently returns null.

2. **Is `getChallengeSongs()` returning an empty array?** — Maybe the session was created before the `challengeSongs` array field existed and uses legacy single-challenge fields. Or maybe the `challengeSongs` array exists but is empty, and the legacy fields are also empty.

3. **Does the runtime state actually get broadcast with `isChallengeSong`?** — Check that `commitRuntime` actually persists and broadcasts the updated state. Check that `persistAndBroadcastRuntime` includes `isChallengeSong` and `challengeType` in localStorage writes and BroadcastChannel messages.

4. **Is `validateRuntimeState` in storage.ts stripping `challengeType`?** — This function validates state from localStorage. If it doesn't recognise `challengeType`, it might drop it or return null for the entire state.

5. **Race condition: does `applyStatusSnapshot` run before `session` is loaded?** — The callback captures `session` in its closure. If `session` is null, the function returns early (line: `if (!session) return;`). But is there a window where polls fire before session loads?

6. **Is `isIntroSong` stuck as true?** — If `isIntroSong` never flips to false, challenge detection is permanently suppressed (line: `isIntroSong ? null : ...`).

7. **Does the guest page ever receive runtime updates with `isChallengeSong: true`?** — The guest receives state via BroadcastChannel (same device), localStorage polling (same device), and HTTP API polling (cross-device). Check all three paths.

8. **Is there a stale closure issue?** — `applyStatusSnapshot` depends on `[commitRuntime, session]`. If `session` updates but the callback isn't recreated, it might use a stale `session` object without the challenge songs data.

## Acceptance criteria for your findings

- Identify the specific line(s) where the bug occurs
- Explain WHY the detection fails at runtime despite looking correct statically
- Propose a fix

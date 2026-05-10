# StepGenerateConnect Two-Phase UI — Handoff

## Summary

StepGenerateConnect has been restructured from a single "Generate + Create Playlists" action into two distinct phases:

1. **Create Spotify Playlists** — connects to Spotify and creates playlists
2. **Generate Event Pack** — downloads PDFs, DOCX, and QR codes

## Props Interface

### Removed Props

- `onSubmit` — replaced by `onCreatePlaylists` and `onGenerateEventPack`

### New Props

```typescript
playlistsCreated: boolean;
playlistResults: Array<{
  gameNumber: 1 | 2;
  playlistId: string;
  playlistUrl: string;
  addedCount: number;
  totalSongs: number;
  notFoundSongs: Array<{ artist: string; title: string }>;
}> | null;
onCreatePlaylists: () => void;
onRefreshFromSpotify: () => void;
onGenerateEventPack: () => void;
onDownloadOnly: () => void;       // kept from before
refreshing: boolean;
```

### Unchanged Props

```typescript
canSubmit: boolean;
busy: boolean;
spotifyConnected: boolean;
spotifyConnecting: boolean;
spotifyCreating: boolean;
spotifyCallbackUrl: string;
spotifyResult: SpotifyPlaylistResult[] | null;
livePlaylistByGame: { game1: SpotifyPlaylistResult; game2: SpotifyPlaylistResult } | null;
liveSessionName: string;
onLiveSessionName: (v: string) => void;
liveSessionNotice: string;
error: string;
qrNotice: string;
onConnectSpotify: () => void;
onDisconnectSpotify: () => void;
onSaveLiveSession: () => void;
onExportLiveSession: () => void;
onBack: () => void;
```

## UI States

### State 1: Before playlists created (`!playlistsCreated`)

- Spotify connect/disconnect section (separate Card)
- "Create Spotify Playlists" button (primary, disabled when not connected or busy)
- "Download Only (No Spotify)" button (secondary fallback)

### State 2: Playlists created (`playlistsCreated && !busy`)

- Playlist Status Panel per game showing:
  - Track match count (e.g. "18/20 tracks matched")
  - "Open in Spotify" external link
  - Not-found songs list (only when applicable)
- "Refresh from Spotify" button
- Helper text prompting user to review before generating
- "Generate Event Pack" button in a separate Card (Step 2)

### State 3: After generation

- Playlist status panels remain visible
- Live session section appears (when `livePlaylistByGame` is set)
- Download/QR notice displays persist

## Integration Notes for page.tsx

The parent `page.tsx` needs to:

1. Add state: `playlistsCreated`, `playlistResults`, `refreshing`
2. Implement handlers: `handleCreatePlaylists`, `handleRefreshFromSpotify`, `handleGenerateEventPack`
3. Remove the old `onSubmit` prop pass
4. Split the existing combined submit logic into the two separate handlers
5. Pass the new props to `<StepGenerateConnect />`

## Downstream Type Error (Expected)

`page.tsx` line ~708 will error because it still passes `onSubmit`. This is expected and will be resolved when page.tsx is updated to use the new props.

# API connection discovery

Critical path: both export buttons in app/prep/page.tsx, app/api/generate/route.ts, lib/eventFeed/index.ts. Supporting: brand feed configuration, both feed adapters and PDF promotion rendering. Peripheral: adapter tests and browser flow script.

The route drops feed failure information and emits none of the metadata expected by either export button. Brand feed lookup errors abort the entire pack. Both adapters share the same error handling. Intentional disabled feeds must remain distinct from missing configuration. PDFs show four events, while the run sheet can use twelve; counts must describe the four promotional slots.

Music Bingo requires only management read:events. Quiz and Cash Bingo integration is outside this change. No database changes or live writes.

Final evidence: browser generation returned HTTP 200, produced a readable three-PDF ZIP, and both export buttons displayed promotional feed warnings. Provider and brand configuration failure tests preserve pack generation. Live read-only brand inspection confirmed The Anchor Pub has no per-brand management URL or token override and uses the Musi Bingo environment key; Barons Pubs uses a separate BaronsHub key. The management scope required is read:events. Deployed environment verification and key changes belong to the parent task.

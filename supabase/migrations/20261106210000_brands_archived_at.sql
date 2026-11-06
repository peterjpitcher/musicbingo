-- Archive a venue without deleting it: public.brands.archived_at.
--
-- WHY
--   Music Bingo now runs for The Anchor only (Peter, 6 November 2026, spec
--   M-6). Barons Pubs is archived, not deleted: games already made for it must
--   still open, and its row keeps the history. The app hides any venue with
--   archived_at set from selection (BrandSelector, the venue page), refuses to
--   move a game onto one (PUT /api/sessions/[id]/brand), and shows games that
--   still point at one in the default venue's look
--   (resolveScreenBrandConfig in lib/brands/brandRepo.ts).
--
-- WHAT THIS DOES
--   Adds one nullable column. Additive only: no row changes here, so it is
--   safe to apply before or after the code ships. Archiving Barons Pubs itself
--   is a separate data change (musicbingo-archive-barons.sql), applied by hand.
--
-- ACCESS
--   Unchanged. brands keeps RLS on with anon and authenticated revoked; only
--   the service role reads or writes it.
--
-- ROLLBACK
--   alter table public.brands drop column if exists archived_at;
--   Archived venues would then show in selection again.

alter table public.brands add column if not exists archived_at timestamptz;

comment on column public.brands.archived_at is
  'When the venue was retired. Archived venues are hidden from selection; games that use one render in the default venue look.';

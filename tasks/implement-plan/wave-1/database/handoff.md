# Database Agent Handoff

## Files Created

1. `supabase/migrations/20260424120000_create_brands.sql` — brands table with 15 columns, CHECK constraints on all 4 colour fields, unique partial index for single default, and Anchor Pub seed data
2. `supabase/migrations/20260424120001_add_brand_id_to_sessions.sql` — nullable `brand_id` FK on `live_sessions` referencing `brands(id)`, with index
3. `supabase/migrations/20260424120002_create_brand_assets_bucket.sql` — public `brand-assets` storage bucket via `storage.buckets` insert

## Migration Ordering

The three migrations must run in sequence (timestamps enforce this):
- `120000` creates the `brands` table (required before FK reference)
- `120001` adds `brand_id` FK to `live_sessions` (depends on `brands` table)
- `120002` creates the storage bucket (independent, but ordered last)

## Notes

- Emoji characters in seed data use PostgreSQL `U&''` Unicode escape syntax (`\1F37A` for beer mug, `\2014` for em dash)
- The unique partial index `idx_brands_single_default` ensures at most one row can have `is_default = true`
- `brand_id` on `live_sessions` is nullable — existing sessions will have `NULL` and fall back to the default brand at the application layer
- The storage bucket insert uses `ON CONFLICT DO NOTHING` for idempotency

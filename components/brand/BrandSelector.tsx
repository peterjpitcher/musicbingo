"use client";

import { useBrandList } from "@/lib/brands/brandList";

type BrandSelectorProps = {
  value: string | null;
  onChange: (brandId: string) => void;
  className?: string;
  disabled?: boolean;
};

export function BrandSelector({ value, onChange, className, disabled }: BrandSelectorProps): React.ReactNode {
  // Shared across every mounted selector: /host renders one per game row, and
  // fetching per row meant a dozen identical GET /api/brands on a page load.
  // The store calls assertSignedIn, so an ended sign-in still bounces to
  // the sign-in page, once for the page rather than once per row.
  const { brands, loading, error, errorStatus } = useBrandList();

  if (loading) {
    return (
      <select disabled className={className}>
        <option>Loading brands…</option>
      </select>
    );
  }

  // A server that answered and refused (the staff gate's 401 once the
  // sign-in has ended) still reads as "nothing to pick", as it did when this
  // component fetched for itself. Only a request that never landed is an error.
  const requestFailed = error !== null && errorStatus === null;

  // Archived venues (Barons Pubs) are never offered. A game that already uses
  // one shows it as a disabled entry so the select still reads truthfully;
  // its screens fall back to the default venue.
  const live = brands.filter((b) => !b.archived_at);
  const currentArchived = value ? brands.find((b) => b.id === value && b.archived_at) : undefined;

  if (requestFailed || live.length === 0) {
    return (
      <select disabled className={className}>
        <option>{requestFailed ? "Failed to load brands" : "No brands available"}</option>
      </select>
    );
  }

  const defaultBrand = live.find((b) => b.is_default);
  const selectedId = value ?? defaultBrand?.id ?? "";

  return (
    <select
      value={selectedId}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className={className}
    >
      {currentArchived ? (
        <option value={currentArchived.id} disabled>
          {currentArchived.name} (archived)
        </option>
      ) : null}
      {live.map((b) => (
        <option key={b.id} value={b.id}>
          {b.name}{b.is_default ? " (default)" : ""}
        </option>
      ))}
    </select>
  );
}

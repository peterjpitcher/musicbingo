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
  // The store calls assertAdminUnlocked, so a lapsed cookie still bounces to
  // the unlock page, once for the page rather than once per row.
  const { brands, loading, error, errorStatus } = useBrandList();

  if (loading) {
    return (
      <select disabled className={className}>
        <option>Loading brands…</option>
      </select>
    );
  }

  // A server that answered and refused (the admin gate's 401 once the unlock
  // cookie has lapsed) still reads as "nothing to pick", as it did when this
  // component fetched for itself. Only a request that never landed is an error.
  const requestFailed = error !== null && errorStatus === null;

  if (requestFailed || brands.length === 0) {
    return (
      <select disabled className={className}>
        <option>{requestFailed ? "Failed to load brands" : "No brands available"}</option>
      </select>
    );
  }

  const defaultBrand = brands.find((b) => b.is_default);
  const selectedId = value ?? defaultBrand?.id ?? "";

  return (
    <select
      value={selectedId}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className={className}
    >
      {brands.map((b) => (
        <option key={b.id} value={b.id}>
          {b.name}{b.is_default ? " (default)" : ""}
        </option>
      ))}
    </select>
  );
}

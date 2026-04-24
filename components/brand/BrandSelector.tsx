"use client";

import { useEffect, useState } from "react";
import type { Brand } from "@/lib/brands/types";

type BrandSelectorProps = {
  value: string | null;
  onChange: (brandId: string) => void;
  className?: string;
};

export function BrandSelector({ value, onChange, className }: BrandSelectorProps): React.ReactNode {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    fetch("/api/brands")
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setBrands(data))
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <select disabled className={className}>
        <option>Loading brands…</option>
      </select>
    );
  }

  if (loadError || brands.length === 0) {
    return (
      <select disabled className={className}>
        <option>{loadError ? "Failed to load brands" : "No brands available"}</option>
      </select>
    );
  }

  const defaultBrand = brands.find((b) => b.is_default);
  const selectedId = value ?? defaultBrand?.id ?? "";

  return (
    <select
      value={selectedId}
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

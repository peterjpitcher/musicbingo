"use client";

import { useEffect, useState, use } from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { BrandForm } from "@/components/brand/BrandForm";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Notice } from "@/components/ui/Notice";
import type { Brand } from "@/lib/brands/types";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default function EditBrandPage({ params }: PageProps): React.ReactElement {
  const { id } = use(params);
  const [brand, setBrand] = useState<Brand | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadBrand(): Promise<void> {
      try {
        const res = await fetch(`/api/brands/${id}`);
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error((data as { error?: string }).error || "Failed to load brand.");
        }
        const data: Brand = await res.json();
        setBrand(data);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to load brand.";
        setError(message);
      } finally {
        setLoading(false);
      }
    }
    void loadBrand();
  }, [id]);

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader
        title={brand ? `Edit: ${brand.name}` : "Edit Brand"}
        subtitle="Update brand settings"
        variant="light"
        actions={
          <Button as="link" href="/brands" variant="secondary" size="sm">
            Back to Brands
          </Button>
        }
      />

      <main className="max-w-5xl mx-auto px-4 py-8">
        {loading ? (
          <Card>
            <p className="text-slate-500 text-sm">Loading brand...</p>
          </Card>
        ) : error ? (
          <Notice variant="error">{error}</Notice>
        ) : brand ? (
          <BrandForm
            brand={brand}
            onSaved={(updated) => setBrand(updated)}
          />
        ) : null}
      </main>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/layout/AppHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Notice } from "@/components/ui/Notice";
import type { Brand } from "@/lib/brands/types";

type BrandWithUrls = Brand & { logo_dark_public_url?: string; logo_light_public_url?: string };

export default function BrandsPage(): React.ReactElement {
  const router = useRouter();
  const [brands, setBrands] = useState<BrandWithUrls[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function refreshBrands(): Promise<void> {
    const res = await fetch("/api/brands");
    if (res.ok) {
      setBrands(await res.json());
    }
  }

  useEffect(() => {
    refreshBrands().finally(() => setLoading(false));
  }, []);

  async function onDelete(brand: Brand): Promise<void> {
    if (!window.confirm(`Delete brand "${brand.name}"?`)) return;
    try {
      const res = await fetch(`/api/brands/${brand.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || "Failed to delete brand.");
      }
      await refreshBrands();
      setNotice(`Deleted brand: ${brand.name}`);
      setError("");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to delete brand.";
      setError(message);
      setNotice("");
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader
        title="Brand Management"
        subtitle="Create and manage venue brands"
        variant="light"
        actions={
          <>
            <Button
              variant="primary"
              size="sm"
              onClick={() => router.push("/brands/new/edit")}
            >
              + New Brand
            </Button>
            <Button as="link" href="/host" variant="secondary" size="sm">
              Back to Host
            </Button>
          </>
        }
      />

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-4">
        {notice ? <Notice variant="success">{notice}</Notice> : null}
        {error ? <Notice variant="error">{error}</Notice> : null}

        {loading ? (
          <Card>
            <p className="text-slate-500 text-sm">Loading brands...</p>
          </Card>
        ) : brands.length === 0 ? (
          <Card>
            <h2 className="text-lg font-bold text-slate-800 mb-2">No brands</h2>
            <p className="text-slate-500 text-sm">
              Create your first brand to get started.
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {brands.map((brand) => (
              <Card
                key={brand.id}
                className={brand.is_default ? "ring-2 ring-brand-gold" : ""}
              >
                {/* Colour preview header */}
                <div
                  className="rounded-xl p-4 mb-3 flex items-center gap-3"
                  style={{ backgroundColor: brand.color_primary }}
                >
                  {brand.logo_dark_public_url &&
                  brand.logo_dark_url !== "pending-upload" ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={brand.logo_dark_public_url}
                      alt={brand.name}
                      className="max-h-8 w-auto object-contain"
                    />
                  ) : (
                    <span className="text-white font-bold text-sm truncate">
                      {brand.name}
                    </span>
                  )}
                  {brand.is_default && (
                    <span className="ml-auto text-xs bg-brand-gold text-white px-2 py-0.5 rounded-full font-semibold">
                      Default
                    </span>
                  )}
                </div>

                {/* Colour palette swatches */}
                <div className="flex gap-2 mb-3">
                  {[
                    { colour: brand.color_primary, label: "Primary" },
                    { colour: brand.color_primary_light, label: "Primary Light" },
                    { colour: brand.color_accent, label: "Accent" },
                    { colour: brand.color_accent_light, label: "Accent Light" },
                  ].map((swatch) => (
                    <div key={swatch.label} className="flex flex-col items-center gap-1">
                      <div
                        className="w-8 h-8 rounded-full border border-slate-200"
                        style={{ backgroundColor: swatch.colour }}
                        title={`${swatch.label}: ${swatch.colour}`}
                      />
                      <span className="text-[10px] text-slate-400">
                        {swatch.colour}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Font and message info */}
                <p className="text-xs text-slate-500 mb-1">
                  Font: {brand.font_family ?? "Inter (default)"}
                </p>
                {brand.break_message ? (
                  <p className="text-xs text-slate-500 mb-3 truncate">
                    Break: {brand.break_message}
                  </p>
                ) : null}

                {/* Actions */}
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => router.push(`/brands/${brand.id}/edit`)}
                  >
                    Edit
                  </Button>
                  {!brand.is_default ? (
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => void onDelete(brand)}
                    >
                      Delete
                    </Button>
                  ) : null}
                </div>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

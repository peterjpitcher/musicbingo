"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Notice } from "@/components/ui/Notice";
import type { Brand, BrandInput } from "@/lib/brands/types";

type QrItem = { label: string; url: string };

const FONT_OPTIONS = [
  "Inter",
  "Playfair Display",
  "Poppins",
  "Montserrat",
  "Roboto",
  "Open Sans",
  "Lato",
  "Oswald",
  "Raleway",
  "Nunito",
];

const COLOUR_FIELDS: { key: keyof Pick<BrandInput, "color_primary" | "color_primary_light" | "color_accent" | "color_accent_light">; label: string }[] = [
  { key: "color_primary", label: "Primary" },
  { key: "color_primary_light", label: "Primary Light" },
  { key: "color_accent", label: "Accent" },
  { key: "color_accent_light", label: "Accent Light" },
];

const DEFAULT_COLOURS: Pick<BrandInput, "color_primary" | "color_primary_light" | "color_accent" | "color_accent_light"> = {
  color_primary: "#1a3a2a",
  color_primary_light: "#2d5a3d",
  color_accent: "#c8a951",
  color_accent_light: "#d4b96a",
};

type BrandFormProps = {
  /** Existing brand to edit. If undefined, the form is in "create" mode. */
  brand?: Brand;
  /** Called when Save succeeds; the parent page handles redirect. */
  onSaved?: (brand: Brand) => void;
};

export function BrandForm({ brand, onSaved }: BrandFormProps): React.ReactElement {
  const router = useRouter();
  const isNew = !brand;

  // Form state
  const [name, setName] = useState(brand?.name ?? "");
  const [colorPrimary, setColorPrimary] = useState(brand?.color_primary ?? DEFAULT_COLOURS.color_primary);
  const [colorPrimaryLight, setColorPrimaryLight] = useState(brand?.color_primary_light ?? DEFAULT_COLOURS.color_primary_light);
  const [colorAccent, setColorAccent] = useState(brand?.color_accent ?? DEFAULT_COLOURS.color_accent);
  const [colorAccentLight, setColorAccentLight] = useState(brand?.color_accent_light ?? DEFAULT_COLOURS.color_accent_light);
  const [fontFamily, setFontFamily] = useState(brand?.font_family ?? "Inter");
  const [websiteUrl, setWebsiteUrl] = useState(brand?.website_url ?? "");
  const [breakMessage, setBreakMessage] = useState(brand?.break_message ?? "");
  const [endMessage, setEndMessage] = useState(brand?.end_message ?? "");
  const [isDefault, setIsDefault] = useState(brand?.is_default ?? false);
  const [qrItems, setQrItems] = useState<QrItem[]>(
    brand?.qr_items?.map((item) => ({ label: item.label, url: item.url })) ?? []
  );

  // Logo upload state
  const [logoDarkFile, setLogoDarkFile] = useState<File | null>(null);
  const [logoLightFile, setLogoLightFile] = useState<File | null>(null);
  const [logoDarkPreview, setLogoDarkPreview] = useState(brand?.logo_dark_url ?? "");
  const [logoLightPreview, setLogoLightPreview] = useState(brand?.logo_light_url ?? "");

  // UI state
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  function addQrItem(): void {
    if (qrItems.length >= 4) return;
    setQrItems([...qrItems, { label: "", url: "" }]);
  }

  function removeQrItem(index: number): void {
    setQrItems(qrItems.filter((_, i) => i !== index));
  }

  function updateQrItem(index: number, field: "label" | "url", value: string): void {
    const updated = [...qrItems];
    updated[index] = { ...updated[index], [field]: value };
    setQrItems(updated);
  }

  function handleLogoSelect(slot: "dark" | "light", file: File | null): void {
    if (!file) return;
    if (slot === "dark") {
      setLogoDarkFile(file);
      setLogoDarkPreview(URL.createObjectURL(file));
    } else {
      setLogoLightFile(file);
      setLogoLightPreview(URL.createObjectURL(file));
    }
  }

  async function uploadLogo(brandId: string, slot: "dark" | "light", file: File): Promise<void> {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("slot", `logo-${slot}`);
    const res = await fetch(`/api/brands/${brandId}/logo`, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error((data as { error?: string }).error || `Failed to upload ${slot} logo.`);
    }
  }

  async function handleSave(): Promise<void> {
    setError("");
    setSuccess("");

    if (!name.trim()) {
      setError("Brand name is required.");
      return;
    }

    setSaving(true);
    try {
      // Filter out empty QR items
      const validQrItems = qrItems.filter((item) => item.label.trim() && item.url.trim());

      const payload: BrandInput = {
        name: name.trim(),
        is_default: isDefault,
        logo_dark_url: brand?.logo_dark_url ?? "/placeholder.png",
        logo_light_url: brand?.logo_light_url ?? "/placeholder.png",
        color_primary: colorPrimary,
        color_primary_light: colorPrimaryLight,
        color_accent: colorAccent,
        color_accent_light: colorAccentLight,
        font_family: fontFamily || null,
        break_message: breakMessage.trim() || null,
        end_message: endMessage.trim() || null,
        website_url: websiteUrl.trim() || null,
        qr_items: validQrItems.length > 0 ? validQrItems : null,
      };

      let savedBrand: Brand;

      if (isNew) {
        // Create brand
        const res = await fetch("/api/brands", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error((data as { error?: string }).error || "Failed to create brand.");
        }
        savedBrand = await res.json();
      } else {
        // Update brand
        const res = await fetch(`/api/brands/${brand.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error((data as { error?: string }).error || "Failed to update brand.");
        }
        savedBrand = await res.json();
      }

      // Upload logos if selected
      if (logoDarkFile) {
        await uploadLogo(savedBrand.id, "dark", logoDarkFile);
      }
      if (logoLightFile) {
        await uploadLogo(savedBrand.id, "light", logoLightFile);
      }

      if (isNew) {
        // Redirect to the edit page for the newly created brand
        router.push(`/brands/${savedBrand.id}/edit`);
      } else {
        setSuccess("Brand saved successfully.");
        onSaved?.(savedBrand);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to save brand.";
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {error ? <Notice variant="error">{error}</Notice> : null}
      {success ? <Notice variant="success">{success}</Notice> : null}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left column: Name, Colours, Font */}
        <div className="space-y-4">
          <Card>
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide mb-4">
              Brand Identity
            </h2>

            {/* Brand Name */}
            <label className="block mb-4">
              <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                Brand Name *
              </span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. The Anchor Pub"
                className="mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2 text-sm
                  focus:outline-none focus:ring-2 focus:ring-brand-gold focus:border-brand-gold"
                required
              />
            </label>

            {/* Colour Pickers */}
            <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">
              Brand Colours
            </h3>
            <div className="grid grid-cols-2 gap-3 mb-4">
              {COLOUR_FIELDS.map(({ key, label }) => {
                const value =
                  key === "color_primary" ? colorPrimary :
                  key === "color_primary_light" ? colorPrimaryLight :
                  key === "color_accent" ? colorAccent :
                  colorAccentLight;
                const setter =
                  key === "color_primary" ? setColorPrimary :
                  key === "color_primary_light" ? setColorPrimaryLight :
                  key === "color_accent" ? setColorAccent :
                  setColorAccentLight;

                return (
                  <label key={key} className="block">
                    <span className="text-xs text-slate-500">{label}</span>
                    <div className="flex items-center gap-2 mt-1">
                      <input
                        type="color"
                        value={value}
                        onChange={(e) => setter(e.target.value)}
                        className="w-10 h-10 rounded-lg border border-slate-300 cursor-pointer p-0.5"
                      />
                      <input
                        type="text"
                        value={value}
                        onChange={(e) => setter(e.target.value)}
                        className="flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-xs font-mono
                          focus:outline-none focus:ring-2 focus:ring-brand-gold focus:border-brand-gold"
                        pattern="^#[0-9a-fA-F]{6}$"
                        maxLength={7}
                      />
                    </div>
                  </label>
                );
              })}
            </div>

            {/* Font Family */}
            <label className="block">
              <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                Font Family
              </span>
              <select
                value={fontFamily}
                onChange={(e) => setFontFamily(e.target.value)}
                className="mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2 text-sm
                  focus:outline-none focus:ring-2 focus:ring-brand-gold focus:border-brand-gold"
              >
                {FONT_OPTIONS.map((font) => (
                  <option key={font} value={font}>
                    {font}
                  </option>
                ))}
              </select>
            </label>
          </Card>
        </div>

        {/* Right column: Logos, Website, QR Items, Messages */}
        <div className="space-y-4">
          {/* Logo uploads */}
          <Card>
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide mb-4">
              Logos
            </h2>

            <div className="grid grid-cols-2 gap-4">
              {/* Dark background logo */}
              <div>
                <span className="text-xs text-slate-500 block mb-1">
                  Logo (Dark Background)
                </span>
                <div
                  className="relative rounded-xl border-2 border-dashed border-slate-300 p-4 text-center
                    hover:border-brand-gold transition-colors cursor-pointer min-h-[100px] flex items-center justify-center"
                  style={{ backgroundColor: colorPrimary }}
                  onClick={() => document.getElementById("logo-dark-input")?.click()}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      document.getElementById("logo-dark-input")?.click();
                    }
                  }}
                >
                  {logoDarkPreview && logoDarkPreview !== "/placeholder.png" ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={logoDarkPreview}
                      alt="Dark background logo"
                      className="max-h-16 w-auto object-contain"
                    />
                  ) : (
                    <span className="text-white/60 text-xs">Click to upload</span>
                  )}
                </div>
                <input
                  id="logo-dark-input"
                  type="file"
                  accept="image/png,image/svg+xml,image/webp"
                  className="hidden"
                  onChange={(e) => handleLogoSelect("dark", e.target.files?.[0] ?? null)}
                />
              </div>

              {/* Light background logo */}
              <div>
                <span className="text-xs text-slate-500 block mb-1">
                  Logo (Light Background)
                </span>
                <div
                  className="relative rounded-xl border-2 border-dashed border-slate-300 p-4 text-center
                    hover:border-brand-gold transition-colors cursor-pointer min-h-[100px] flex items-center justify-center"
                  style={{ backgroundColor: "#f8fafc" }}
                  onClick={() => document.getElementById("logo-light-input")?.click()}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      document.getElementById("logo-light-input")?.click();
                    }
                  }}
                >
                  {logoLightPreview && logoLightPreview !== "/placeholder.png" ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={logoLightPreview}
                      alt="Light background logo"
                      className="max-h-16 w-auto object-contain"
                    />
                  ) : (
                    <span className="text-slate-400 text-xs">Click to upload</span>
                  )}
                </div>
                <input
                  id="logo-light-input"
                  type="file"
                  accept="image/png,image/svg+xml,image/webp"
                  className="hidden"
                  onChange={(e) => handleLogoSelect("light", e.target.files?.[0] ?? null)}
                />
              </div>
            </div>
          </Card>

          {/* Website URL */}
          <Card>
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide mb-4">
              Website & QR Codes
            </h2>

            <label className="block mb-4">
              <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                Website URL
              </span>
              <input
                type="url"
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                placeholder="https://example.com"
                className="mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2 text-sm
                  focus:outline-none focus:ring-2 focus:ring-brand-gold focus:border-brand-gold"
              />
            </label>

            {/* QR Items */}
            <div className="mb-2">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                  QR Code Items
                </span>
                {qrItems.length < 4 && (
                  <Button variant="secondary" size="sm" onClick={addQrItem}>
                    + Add
                  </Button>
                )}
              </div>
              {qrItems.length === 0 ? (
                <p className="text-xs text-slate-400">No QR items added.</p>
              ) : (
                <div className="space-y-2">
                  {qrItems.map((item, index) => (
                    <div key={index} className="flex gap-2 items-start">
                      <input
                        type="text"
                        value={item.label}
                        onChange={(e) => updateQrItem(index, "label", e.target.value)}
                        placeholder="Label"
                        className="flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-xs
                          focus:outline-none focus:ring-2 focus:ring-brand-gold focus:border-brand-gold"
                        maxLength={50}
                      />
                      <input
                        type="url"
                        value={item.url}
                        onChange={(e) => updateQrItem(index, "url", e.target.value)}
                        placeholder="https://..."
                        className="flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-xs
                          focus:outline-none focus:ring-2 focus:ring-brand-gold focus:border-brand-gold"
                      />
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => removeQrItem(index)}
                        aria-label={`Remove QR item ${index + 1}`}
                      >
                        X
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>

          {/* Messages */}
          <Card>
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide mb-4">
              Screen Messages
            </h2>

            <label className="block mb-4">
              <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                Break Screen Message
              </span>
              <textarea
                value={breakMessage}
                onChange={(e) => setBreakMessage(e.target.value)}
                placeholder="Message displayed during breaks..."
                rows={3}
                maxLength={500}
                className="mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2 text-sm resize-y
                  focus:outline-none focus:ring-2 focus:ring-brand-gold focus:border-brand-gold"
              />
            </label>

            <label className="block">
              <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                End Screen Message
              </span>
              <textarea
                value={endMessage}
                onChange={(e) => setEndMessage(e.target.value)}
                placeholder="Message displayed when game ends..."
                rows={3}
                maxLength={500}
                className="mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2 text-sm resize-y
                  focus:outline-none focus:ring-2 focus:ring-brand-gold focus:border-brand-gold"
              />
            </label>
          </Card>
        </div>
      </div>

      {/* Footer: Default checkbox + Save/Cancel */}
      <Card>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-brand-gold focus:ring-brand-gold"
            />
            <span className="text-sm text-slate-700">Set as default brand</span>
          </label>

          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => router.push("/brands")}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => void handleSave()}
              disabled={saving}
            >
              {saving ? "Saving..." : isNew ? "Create Brand" : "Save Brand"}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AppHeader } from "@/components/layout/AppHeader";
import { BrandPreviewPane } from "@/components/brand/BrandPreviewPane";
import {
  BrandForm,
  blankEditableBrand,
  brandToEditable,
  editableToQrItems,
  type EditableBrand,
  type EditableLogoSlot,
} from "@/components/brand/BrandForm";
import {
  resolveSupportedFont,
  DEFAULT_DISPLAY_FONT,
  DEFAULT_BODY_FONT,
} from "@/lib/brands/fonts";
import type { Brand, BrandConfig, BrandInput } from "@/lib/brands/types";

/** Sentinel id used in `?id=` to mean "create a new venue". */
const NEW_ID = "new";

type BrandWithUrls = Brand & {
  logo_dark_public_url?: string;
  logo_light_public_url?: string;
  event_logo_public_url?: string;
};

/** Files staged for upload on the next save, keyed by slot. */
type StagedFiles = Partial<Record<EditableLogoSlot, File>>;

/** Build the BrandConfig the live preview consumes from the editable draft. */
function draftToBrandConfig(id: string, draft: EditableBrand): BrandConfig {
  return {
    id: id === NEW_ID ? "00000000-0000-0000-0000-000000000000" : id,
    name: draft.name || "New Venue",
    logo_dark_url: draft.logoDarkPreview || "pending-upload",
    logo_light_url: draft.logoLightPreview || "pending-upload",
    color_primary: draft.colorPrimary,
    color_primary_light: draft.colorPrimaryLight,
    color_accent: draft.colorAccent,
    color_accent_light: draft.colorAccentLight,
    font_family: draft.fontBody || null,
    font_display: resolveSupportedFont(draft.fontDisplay, DEFAULT_DISPLAY_FONT),
    font_body: resolveSupportedFont(draft.fontBody, DEFAULT_BODY_FONT),
    event_logo_url: draft.eventLogoPreview || null,
    break_message: draft.breakMessage || null,
    end_message: draft.endMessage || null,
    website_url: draft.websiteUrl || null,
    qr_items: editableToQrItems(draft),
    event_feed_type: draft.eventFeedType,
    event_feed_base_url: draft.eventFeedBaseUrl || null,
    event_feed_venue_id: draft.eventFeedVenueId || null,
    event_feed_has_key: draft.eventFeedHasKey,
  };
}

function BrandsEditor(): React.ReactElement {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selId = searchParams.get("id");

  const [brands, setBrands] = useState<BrandWithUrls[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [draft, setDraft] = useState<EditableBrand>(() => blankEditableBrand());
  const [apiKey, setApiKey] = useState("");
  const [staged, setStaged] = useState<StagedFiles>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Object URLs created for staged-file previews, keyed by slot. Re-picking a
  // slot revokes its previous URL immediately; all are revoked on unmount.
  const objectUrls = useRef<Partial<Record<EditableLogoSlot, string>>>({});
  useEffect(() => {
    // Snapshot the (stable) map reference so cleanup revokes every live URL.
    const urls = objectUrls.current;
    return () => {
      Object.values(urls).forEach((url) => {
        if (url) URL.revokeObjectURL(url);
      });
    };
  }, []);

  const isNew = selId === NEW_ID || selId === null;

  const refreshBrands = useCallback(async (): Promise<BrandWithUrls[]> => {
    const res = await fetch("/api/brands");
    if (!res.ok) throw new Error(`Failed to load venues (HTTP ${res.status})`);
    const data: BrandWithUrls[] = await res.json();
    setBrands(data);
    return data;
  }, []);

  // Load the venue list once on mount.
  useEffect(() => {
    refreshBrands()
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Failed to load venues.")
      )
      .finally(() => setLoadingList(false));
  }, [refreshBrands]);

  // Whenever the selected id (or the loaded list) changes, hydrate the draft.
  useEffect(() => {
    setError("");
    setNotice("");
    setApiKey("");
    setStaged({});
    if (isNew) {
      setDraft(blankEditableBrand());
      return;
    }
    const found = brands.find((b) => b.id === selId);
    if (found) setDraft(brandToEditable(found));
  }, [selId, isNew, brands]);

  function select(id: string): void {
    router.push(id === NEW_ID ? "/brands?id=new" : `/brands?id=${id}`);
  }

  function onChange(patch: Partial<EditableBrand>): void {
    setDraft((prev) => ({ ...prev, ...patch }));
  }

  function onLogoFile(slot: EditableLogoSlot, file: File | null): void {
    // Revoke any previous preview URL staged for this slot.
    const prevUrl = objectUrls.current[slot];
    if (prevUrl) {
      URL.revokeObjectURL(prevUrl);
      delete objectUrls.current[slot];
    }
    if (!file) {
      setStaged((prev) => {
        const next = { ...prev };
        delete next[slot];
        return next;
      });
      return;
    }
    const url = URL.createObjectURL(file);
    objectUrls.current[slot] = url;
    setStaged((prev) => ({ ...prev, [slot]: file }));
    if (slot === "logo-dark") onChange({ logoDarkPreview: url });
    else if (slot === "logo-light") onChange({ logoLightPreview: url });
    else onChange({ eventLogoPreview: url });
  }

  async function uploadStaged(brandId: string): Promise<void> {
    const slots = Object.keys(staged) as EditableLogoSlot[];
    for (const slot of slots) {
      const file = staged[slot];
      if (!file) continue;
      const formData = new FormData();
      formData.append("file", file);
      formData.append("slot", slot);
      const res = await fetch(`/api/brands/${brandId}/logo`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || `Failed to upload ${slot}.`);
      }
    }
  }

  async function onSave(): Promise<void> {
    setError("");
    setNotice("");

    if (!draft.name.trim()) {
      setError("Venue name is required.");
      return;
    }
    if (draft.eventFeedType !== "none" && draft.eventFeedType !== "anchor_management") {
      if (!draft.eventFeedBaseUrl.trim()) {
        setError("API base URL is required for this event feed.");
        return;
      }
      if (!draft.eventFeedHasKey && !apiKey.trim()) {
        setError("API key is required for this event feed.");
        return;
      }
    }

    setSaving(true);
    try {
      const existing = isNew ? undefined : brands.find((b) => b.id === selId);
      // Coerce empty optional fields to null (R5) so the repo stores null, not "".
      const payload: BrandInput = {
        name: draft.name.trim(),
        is_default: draft.isDefault,
        logo_dark_url: existing?.logo_dark_url ?? "pending-upload",
        logo_light_url: existing?.logo_light_url ?? "pending-upload",
        color_primary: draft.colorPrimary,
        color_primary_light: draft.colorPrimaryLight,
        color_accent: draft.colorAccent,
        color_accent_light: draft.colorAccentLight,
        font_family: draft.fontBody || null,
        font_display: draft.fontDisplay || null,
        font_body: draft.fontBody || null,
        event_logo_url: existing?.event_logo_url || null,
        break_message: draft.breakMessage.trim() || null,
        end_message: draft.endMessage.trim() || null,
        website_url: draft.websiteUrl.trim() || null,
        qr_items: editableToQrItems(draft),
        event_feed_type: draft.eventFeedType,
        event_feed_base_url:
          draft.eventFeedType !== "none" ? draft.eventFeedBaseUrl.trim() || null : null,
        event_feed_venue_id:
          draft.eventFeedType !== "none" ? draft.eventFeedVenueId.trim() || null : null,
      };

      const body: Record<string, unknown> = { ...payload };
      if (draft.eventFeedType !== "none" && apiKey.trim()) {
        body.event_feed_api_key = apiKey.trim();
      }

      const res = await fetch(isNew ? "/api/brands" : `/api/brands/${selId}`, {
        method: isNew ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || "Failed to save venue.");
      }
      const saved: BrandWithUrls = await res.json();

      if (Object.keys(staged).length > 0) {
        await uploadStaged(saved.id);
      }

      // Refresh the list, then re-hydrate from the freshly-saved row.
      const list = await refreshBrands();
      const fresh = list.find((b) => b.id === saved.id) ?? saved;
      setDraft(brandToEditable(fresh));
      setStaged({});
      setApiKey("");
      setNotice(isNew ? "Venue created." : "Venue saved.");

      if (isNew) {
        router.push(`/brands?id=${saved.id}`);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save venue.");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(): Promise<void> {
    if (isNew || !selId) return;
    if (!window.confirm(`Delete venue "${draft.name}"? This cannot be undone.`)) return;
    setError("");
    setNotice("");
    try {
      const res = await fetch(`/api/brands/${selId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || "Failed to delete venue.");
      }
      await refreshBrands();
      router.push("/brands");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to delete venue.");
    }
  }

  const previewBrand = useMemo(
    () => draftToBrandConfig(selId ?? NEW_ID, draft),
    [selId, draft]
  );

  return (
    <div className="host-root">
      <AppHeader
        title="Music Bingo"
        subtitle="Brands &amp; Venues"
        actions={
          <>
            <Link href="/host" className="hbtn">
              ← Dashboard
            </Link>
            <button
              type="button"
              className="hbtn hbtn--primary"
              onClick={() => select(NEW_ID)}
            >
              + New Venue
            </button>
          </>
        }
      />

      <main
        className="host-main"
        style={{ gridTemplateColumns: "260px minmax(0,1fr) minmax(0,1fr)" }}
      >
        {/* Pane 1 — venue list */}
        <div className="host-col">
          <div className="panel">
            <h2>Venues</h2>
            {loadingList ? (
              <p className="hint-small">Loading venues…</p>
            ) : (
              <div className="ros">
                {isNew ? (
                  <button type="button" className="ros-step live">
                    <span className="sw-lg" style={{ background: draft.colorAccent }} />
                    <span>
                      <span className="lbl">{draft.name || "New Venue"}</span>
                      <br />
                      <span className="sub">Unsaved draft</span>
                    </span>
                  </button>
                ) : null}
                {brands.map((b) => (
                  <button
                    type="button"
                    key={b.id}
                    className={`ros-step ${b.id === selId ? "live" : ""}`}
                    onClick={() => select(b.id)}
                  >
                    <span className="sw-lg" style={{ background: b.color_accent }} />
                    <span>
                      <span className="lbl">{b.name}</span>
                      <br />
                      <span className="sub">
                        {b.is_default ? "★ Default · " : ""}
                        {b.event_feed_type === "none" ? "No event feed" : "Live event feed"}
                      </span>
                    </span>
                  </button>
                ))}
                {brands.length === 0 && !isNew ? (
                  <p className="hint-small">No venues yet. Create your first one.</p>
                ) : null}
              </div>
            )}
          </div>
        </div>

        {/* Pane 2 — edit form */}
        <div className="host-col">
          {error ? (
            <div className="panel" role="alert">
              <p style={{ color: "#f0b6b6", margin: 0 }}>{error}</p>
            </div>
          ) : null}
          {notice ? (
            <div className="panel">
              <p style={{ color: "#8fe0ab", margin: 0 }}>{notice}</p>
            </div>
          ) : null}

          <BrandForm
            draft={draft}
            onChange={onChange}
            onLogoFile={onLogoFile}
            apiKey={apiKey}
            onApiKeyChange={setApiKey}
          />

          <div className="panel">
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <button
                type="button"
                className="hbtn hbtn--primary"
                style={{ minHeight: 46 }}
                onClick={() => void onSave()}
                disabled={saving}
              >
                {saving ? "Saving…" : isNew ? "Create venue" : "Save venue"}
              </button>
              {!isNew ? (
                <button
                  type="button"
                  className="hbtn hbtn--danger"
                  style={{ minHeight: 46 }}
                  onClick={() => void onDelete()}
                  disabled={saving}
                >
                  Delete venue
                </button>
              ) : null}
            </div>
          </div>
        </div>

        {/* Pane 3 — live preview */}
        <div className="host-col">
          <div className="panel" style={{ position: "sticky", top: 90 }}>
            <h2>
              Live Preview <span className="meta">{draft.name || "New Venue"}</span>
            </h2>
            <BrandPreviewPane brand={previewBrand} variant="A" />
            <div className="swatches">
              {[
                draft.colorPrimary,
                draft.colorPrimaryLight,
                draft.colorAccent,
                draft.colorAccentLight,
              ].map((c, i) => (
                <div key={i} className="swatch">
                  <span style={{ background: c }} />
                  <code>{c}</code>
                </div>
              ))}
            </div>
            <p className="hint-small">
              Colours, logos and fonts apply consistently across the TV screens, host
              console, bingo cards and run sheet.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function BrandsPage(): React.ReactElement {
  return (
    <Suspense fallback={<div className="host-root" />}>
      <BrandsEditor />
    </Suspense>
  );
}

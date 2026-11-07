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
import { refreshBrandList, type BrandWithUrls } from "@/lib/brands/brandList";
import type { BrandConfig, BrandInput } from "@/lib/brands/types";
import { assertSignedIn } from "@/lib/live/signInGuard";
import { buttonClass } from "@anchor-nights/kit/ui";

/**
 * Sentinel id used in `?id=` to mean "create a new venue". Only reachable when
 * no live venue exists: The Anchor is the only selectable venue (spec M-6), and
 * archived venues (Barons Pubs) are hidden from this page.
 */
const NEW_ID = "new";

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

  // Archived venues stay in the database so old games still render, but they
  // are not offered for editing or selection.
  const visibleBrands = useMemo(() => brands.filter((b) => !b.archived_at), [brands]);
  const isNew = !loadingList && visibleBrands.length === 0;

  // Always goes back to the server: this is the editor, so it must not serve a
  // list another page cached. The result refreshes the shared cache too, so any
  // selector mounted elsewhere picks up an edit without its own request.
  // refreshBrandList calls assertSignedIn and rethrows, so an ended sign-in
  // still bounces to the sign-in page.
  const refreshBrands = useCallback(async (): Promise<BrandWithUrls[]> => {
    const data = await refreshBrandList();
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

  // With a live venue to edit, any other address (none, "new", an archived or
  // unknown id) opens the default venue instead.
  useEffect(() => {
    if (loadingList || visibleBrands.length === 0) return;
    if (selId && visibleBrands.some((b) => b.id === selId)) return;
    const target = visibleBrands.find((b) => b.is_default) ?? visibleBrands[0];
    router.replace(`/brands?id=${target.id}`);
  }, [loadingList, visibleBrands, selId, router]);

  // Whenever the selected id (or the loaded list) changes, hydrate the draft.
  useEffect(() => {
    setError("");
    setNotice("");
    setStaged({});
    if (isNew) {
      setDraft(blankEditableBrand());
      return;
    }
    const found = visibleBrands.find((b) => b.id === selId);
    if (found) setDraft(brandToEditable(found));
  }, [selId, isNew, visibleBrands]);

  function select(id: string): void {
    router.push(`/brands?id=${id}`);
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
      assertSignedIn(res);
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

  const previewBrand = useMemo(
    () => draftToBrandConfig(selId ?? NEW_ID, draft),
    [selId, draft]
  );

  return (
    <div className="host-root theme-desk">
      <AppHeader
        title="Music Bingo"
        subtitle="Venue"
        actions={
          <>
            <Link href="/host" className={buttonClass({ variant: "outline", size: "sm" })}>
              ← Dashboard
            </Link>
          </>
        }
      />

      <main className="host-main host-main--venue">
        {/* Pane 1: venue list */}
        <div className="host-col">
          <div className="panel">
            <h2>Venues</h2>
            {loadingList ? (
              <p className="hint-small">Loading venues…</p>
            ) : (
              <div className="ros">
                {isNew ? (
                  <button type="button" className="ros-step live">
                    <span>
                      <span className="lbl">{draft.name || "New Venue"}</span>
                      <br />
                      <span className="sub">Unsaved draft</span>
                    </span>
                  </button>
                ) : null}
                {visibleBrands.map((b) => (
                  <button
                    type="button"
                    key={b.id}
                    className={`ros-step ${b.id === selId ? "live" : ""}`}
                    onClick={() => select(b.id)}
                  >
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
                {visibleBrands.length === 0 && !isNew ? (
                  <p className="hint-small">No venues yet. Create your first one.</p>
                ) : null}
              </div>
            )}
          </div>
        </div>

        {/* Pane 2: edit form */}
        <div className="host-col">
          {error ? (
            <div className="panel" role="alert">
              <p style={{ color: "var(--danger-text)", margin: 0 }}>{error}</p>
            </div>
          ) : null}
          {notice ? (
            <div className="panel">
              <p style={{ color: "var(--success-text)", margin: 0 }}>{notice}</p>
            </div>
          ) : null}

          <BrandForm
            draft={draft}
            onChange={onChange}
            onLogoFile={onLogoFile}
          />

          <div className="panel">
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <button
                type="button"
                className={buttonClass({ variant: "primary", size: "sm" })}
                style={{ minHeight: 46 }}
                onClick={() => void onSave()}
                disabled={saving || loadingList}
              >
                {saving ? "Saving…" : isNew ? "Create venue" : "Save venue"}
              </button>
            </div>
          </div>
        </div>

        {/* Pane 3: live preview */}
        <div className="host-col">
          <div className="panel" style={{ position: "sticky", top: 90 }}>
            <h2>
              Live Preview <span className="meta">{draft.name || "New Venue"}</span>
            </h2>
            <BrandPreviewPane brand={previewBrand} variant="A" />
            <p className="hint-small">
              Every screen uses The Anchor look. The name, logos, messages and QR links
              here fill in the TV screens, bingo cards and run sheet.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function BrandsPage(): React.ReactElement {
  return (
    <Suspense fallback={<div className="host-root theme-desk" />}>
      <BrandsEditor />
    </Suspense>
  );
}

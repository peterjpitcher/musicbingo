"use client";

import { useMemo } from "react";
import {
  SUPPORTED_BRAND_FONTS,
  DEFAULT_DISPLAY_FONT,
  DEFAULT_BODY_FONT,
} from "@/lib/brands/fonts";
import type { Brand } from "@/lib/brands/types";

/** A QR link as edited in the form. */
export type QrItem = { label: string; url: string };

/** Logo slots the form can stage a file for, mirroring brandStorage `LogoSlot`. */
export type EditableLogoSlot = "logo-dark" | "logo-light" | "event-logo";

/**
 * The editable shape of a brand, owned by the page (the live-preview draft).
 * Colours/name/fonts feed the preview directly; the API key and staged logo
 * files are write-only and never surfaced in the preview.
 */
export type EditableBrand = {
  name: string;
  isDefault: boolean;
  colorPrimary: string;
  colorPrimaryLight: string;
  colorAccent: string;
  colorAccentLight: string;
  fontDisplay: string;
  fontBody: string;
  websiteUrl: string;
  breakMessage: string;
  endMessage: string;
  /**
   * Free-form QR links (max 4). The ThankYou screen matches them by label
   * substring ("review"; "book"/"booking"/"reserve"/"event") — there are no
   * discrete review/booking fields (spec A8).
   */
  qrItems: QrItem[];
  eventFeedType: "anchor_management" | "baronshub" | "none";
  eventFeedBaseUrl: string;
  eventFeedVenueId: string;
  /** Whether a key is already stored server-side (read-only flag). */
  eventFeedHasKey: boolean;
  /** Public URLs for previewing already-uploaded logos. */
  logoDarkPreview: string;
  logoLightPreview: string;
  eventLogoPreview: string;
};

/** Inline style for an uploaded-logo thumbnail (no bespoke CSS class). */
const THUMB_STYLE: React.CSSProperties = {
  marginTop: 4,
  borderRadius: 11,
  border: "1px solid rgb(255 255 255 / .16)",
  minHeight: 72,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 10,
};
const THUMB_IMG_STYLE: React.CSSProperties = {
  maxHeight: 56,
  width: "auto",
  objectFit: "contain",
};

const DEFAULT_COLOURS = {
  colorPrimary: "#1a3a2a",
  colorPrimaryLight: "#2d5a3d",
  colorAccent: "#c8a951",
  colorAccentLight: "#d4b96a",
} as const;

/** Build a blank editable brand for the "new venue" flow. */
export function blankEditableBrand(): EditableBrand {
  return {
    name: "",
    isDefault: false,
    ...DEFAULT_COLOURS,
    fontDisplay: DEFAULT_DISPLAY_FONT,
    fontBody: DEFAULT_BODY_FONT,
    websiteUrl: "",
    breakMessage: "",
    endMessage: "",
    qrItems: [],
    eventFeedType: "none",
    eventFeedBaseUrl: "",
    eventFeedVenueId: "",
    eventFeedHasKey: false,
    logoDarkPreview: "",
    logoLightPreview: "",
    eventLogoPreview: "",
  };
}

type BrandWithUrls = Brand & {
  logo_dark_public_url?: string;
  logo_light_public_url?: string;
  event_logo_public_url?: string;
};

/** Convert a loaded brand (API shape) into the editable draft. */
export function brandToEditable(brand: BrandWithUrls): EditableBrand {
  return {
    name: brand.name,
    isDefault: brand.is_default,
    colorPrimary: brand.color_primary,
    colorPrimaryLight: brand.color_primary_light,
    colorAccent: brand.color_accent,
    colorAccentLight: brand.color_accent_light,
    fontDisplay: brand.font_display ?? DEFAULT_DISPLAY_FONT,
    fontBody: brand.font_body ?? brand.font_family ?? DEFAULT_BODY_FONT,
    websiteUrl: brand.website_url ?? "",
    breakMessage: brand.break_message ?? "",
    endMessage: brand.end_message ?? "",
    qrItems: brand.qr_items?.map((q) => ({ label: q.label, url: q.url })) ?? [],
    eventFeedType: brand.event_feed_type,
    eventFeedBaseUrl: brand.event_feed_base_url ?? "",
    eventFeedVenueId: brand.event_feed_venue_id ?? "",
    eventFeedHasKey: brand.event_feed_has_key,
    logoDarkPreview:
      brand.logo_dark_url === "pending-upload"
        ? ""
        : brand.logo_dark_public_url ?? brand.logo_dark_url,
    logoLightPreview:
      brand.logo_light_url === "pending-upload"
        ? ""
        : brand.logo_light_public_url ?? brand.logo_light_url,
    eventLogoPreview: brand.event_logo_public_url ?? brand.event_logo_url ?? "",
  };
}

/**
 * Assemble the persisted `qr_items` array from the draft: the free-form QR
 * links, trimmed and with empties dropped, capped at the schema max of 4.
 * Returns `null` when there are none, matching the column's nullable contract.
 */
export function editableToQrItems(draft: EditableBrand): QrItem[] | null {
  const items = draft.qrItems
    .filter((q) => q.label.trim() && q.url.trim())
    .map((q) => ({ label: q.label.trim(), url: q.url.trim() }));
  return items.length > 0 ? items.slice(0, 4) : null;
}

type BrandFormProps = {
  /** The editable draft owned by the parent page. */
  draft: EditableBrand;
  /** Patch the draft on every keystroke so the live preview stays in sync. */
  onChange: (patch: Partial<EditableBrand>) => void;
  /** Stage a logo file for upload on the next save. */
  onLogoFile: (slot: EditableLogoSlot, file: File | null) => void;
  /** The API key entered this session (empty keeps the existing one). */
  apiKey: string;
  onApiKeyChange: (value: string) => void;
};

/** A single labelled field cell. */
function Field({
  label,
  help,
  span2,
  children,
}: {
  label: string;
  help?: string;
  span2?: boolean;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className={`fg${span2 ? " span2" : ""}`}>
      <label>{label}</label>
      {children}
      {help ? <span className="help">{help}</span> : null}
    </div>
  );
}

/** Colour swatch + hex text row. */
function ColorRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}): React.ReactElement {
  return (
    <div className="fg">
      <label>{label}</label>
      <div className="colorrow">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={`${label} colour picker`}
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          pattern="^#[0-9a-fA-F]{6}$"
          maxLength={7}
          aria-label={`${label} colour hex`}
        />
      </div>
    </div>
  );
}

/**
 * Dark-console brand editor. Fully controlled: it renders the parent's `draft`
 * and reports every change up via `onChange`, so the parent page can mirror the
 * same draft into the live preview pane without any network round-trips.
 */
export function BrandForm({
  draft,
  onChange,
  onLogoFile,
  apiKey,
  onApiKeyChange,
}: BrandFormProps): React.ReactElement {
  const displayFonts = useMemo(
    () =>
      Object.entries(SUPPORTED_BRAND_FONTS)
        .filter(([, f]) => f.category === "display" || f.category === "both")
        .map(([name]) => name),
    []
  );
  const bodyFonts = useMemo(
    () =>
      Object.entries(SUPPORTED_BRAND_FONTS)
        .filter(([, f]) => f.category === "body" || f.category === "both")
        .map(([name]) => name),
    []
  );

  const feedDisabled = draft.eventFeedType === "none";

  function updateQr(index: number, patch: Partial<QrItem>): void {
    onChange({
      qrItems: draft.qrItems.map((q, i) => (i === index ? { ...q, ...patch } : q)),
    });
  }

  return (
    <>
      <div className="panel">
        <h2>Brand Details</h2>
        <div className="form-grid">
          <Field label="Venue name" span2>
            <input
              value={draft.name}
              onChange={(e) => onChange({ name: e.target.value })}
              placeholder="e.g. The Anchor"
              maxLength={100}
            />
          </Field>

          <Field
            label="Logo for dark screens"
            help="Shown on the TV display and host console (light / white logo)"
          >
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => onLogoFile("logo-dark", e.target.files?.[0] ?? null)}
            />
            {draft.logoDarkPreview ? (
              <div style={{ ...THUMB_STYLE, background: draft.colorPrimary }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={draft.logoDarkPreview}
                  alt="Dark-screen logo preview"
                  style={THUMB_IMG_STYLE}
                />
              </div>
            ) : null}
          </Field>

          <Field
            label="Logo for light / print"
            help="Used on the bingo cards and run sheet (dark / black logo)"
          >
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => onLogoFile("logo-light", e.target.files?.[0] ?? null)}
            />
            {draft.logoLightPreview ? (
              <div style={{ ...THUMB_STYLE, background: "#f8fafc" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={draft.logoLightPreview}
                  alt="Light / print logo preview"
                  style={THUMB_IMG_STYLE}
                />
              </div>
            ) : null}
          </Field>

          <div
            className="fg span2"
            style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
          >
            <button
              type="button"
              className={`hbtn ${draft.isDefault ? "hbtn--on" : ""}`}
              style={{ minHeight: 40 }}
              onClick={() => onChange({ isDefault: true })}
              disabled={draft.isDefault}
            >
              {draft.isDefault ? "★ Default venue" : "Set as default venue"}
            </button>
            <span className="help">Pre-selected when creating a new game.</span>
          </div>

          <ColorRow
            label="Primary"
            value={draft.colorPrimary}
            onChange={(v) => onChange({ colorPrimary: v })}
          />
          <ColorRow
            label="Primary light"
            value={draft.colorPrimaryLight}
            onChange={(v) => onChange({ colorPrimaryLight: v })}
          />
          <ColorRow
            label="Accent"
            value={draft.colorAccent}
            onChange={(v) => onChange({ colorAccent: v })}
          />
          <ColorRow
            label="Accent light"
            value={draft.colorAccentLight}
            onChange={(v) => onChange({ colorAccentLight: v })}
          />

          <Field label="Display font" help="Headlines and big numbers">
            <select
              value={draft.fontDisplay}
              onChange={(e) => onChange({ fontDisplay: e.target.value })}
            >
              {displayFonts.map((font) => (
                <option key={font} value={font}>
                  {font}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Body font" help="Supporting copy and labels">
            <select
              value={draft.fontBody}
              onChange={(e) => onChange({ fontBody: e.target.value })}
            >
              {bodyFonts.map((font) => (
                <option key={font} value={font}>
                  {font}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="Event logo (gold)"
            help="WEBP only — the gold lockup used on the event pack"
            span2
          >
            <input
              type="file"
              accept="image/webp"
              onChange={(e) => onLogoFile("event-logo", e.target.files?.[0] ?? null)}
            />
            {draft.eventLogoPreview ? (
              <div style={{ ...THUMB_STYLE, background: draft.colorPrimary }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={draft.eventLogoPreview}
                  alt="Event logo preview"
                  style={THUMB_IMG_STYLE}
                />
              </div>
            ) : null}
          </Field>
        </div>
      </div>

      <div className="panel">
        <h2>Messaging</h2>
        <div className="form-grid">
          <Field label="Break message" span2>
            <textarea
              value={draft.breakMessage}
              onChange={(e) => onChange({ breakMessage: e.target.value })}
              placeholder="Shown on the break screen…"
              maxLength={500}
              rows={3}
            />
          </Field>
          <Field label="End message" span2>
            <textarea
              value={draft.endMessage}
              onChange={(e) => onChange({ endMessage: e.target.value })}
              placeholder="Shown when the game ends…"
              maxLength={500}
              rows={3}
            />
          </Field>
        </div>
      </div>

      <div className="panel">
        <h2>Website &amp; Links</h2>
        <div className="form-grid">
          <Field label="Website" span2>
            <input
              type="url"
              value={draft.websiteUrl}
              onChange={(e) => onChange({ websiteUrl: e.target.value })}
              placeholder="https://…"
              maxLength={200}
            />
          </Field>
        </div>
      </div>

      <div className="panel">
        <h2>
          QR Links <span className="meta">on the thank-you screen · up to 4</span>
        </h2>
        <p className="hint-small" style={{ marginTop: 0 }}>
          Label a link with “review” for the Review card, or “book”, “reserve” or
          “event” for the Book Again card.
        </p>
        {draft.qrItems.length === 0 ? (
          <p className="hint-small">No QR links added.</p>
        ) : (
          draft.qrItems.map((q, i) => (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <input
                style={{
                  flex: "0 0 36%",
                  background: "rgb(0 0 0 / .3)",
                  border: "1px solid rgb(255 255 255 / .16)",
                  borderRadius: 11,
                  color: "var(--cream)",
                  fontFamily: "inherit",
                  fontSize: 15,
                  padding: "11px 13px",
                }}
                value={q.label}
                onChange={(e) => updateQr(i, { label: e.target.value })}
                placeholder="Label"
                maxLength={50}
                aria-label={`QR link ${i + 1} label`}
              />
              <input
                style={{
                  flex: 1,
                  background: "rgb(0 0 0 / .3)",
                  border: "1px solid rgb(255 255 255 / .16)",
                  borderRadius: 11,
                  color: "var(--cream)",
                  fontFamily: "inherit",
                  fontSize: 15,
                  padding: "11px 13px",
                }}
                value={q.url}
                onChange={(e) => updateQr(i, { url: e.target.value })}
                placeholder="https://…"
                aria-label={`QR link ${i + 1} URL`}
              />
              <button
                type="button"
                className="hbtn iconbtn hbtn--danger"
                title="Remove"
                aria-label={`Remove QR link ${i + 1}`}
                onClick={() =>
                  onChange({ qrItems: draft.qrItems.filter((_, j) => j !== i) })
                }
              >
                ✕
              </button>
            </div>
          ))
        )}
        {draft.qrItems.length < 4 ? (
          <button
            type="button"
            className="hbtn"
            onClick={() => onChange({ qrItems: [...draft.qrItems, { label: "", url: "" }] })}
          >
            + Add QR link
          </button>
        ) : null}
      </div>

      <div className="panel">
        <h2>
          Event Feed <span className="meta">auto-fills upcoming events</span>
        </h2>
        <div className="form-grid">
          <Field label="Provider">
            <select
              value={draft.eventFeedType}
              onChange={(e) =>
                onChange({
                  eventFeedType: e.target.value as EditableBrand["eventFeedType"],
                })
              }
            >
              <option value="none">None</option>
              <option value="anchor_management">Anchor Management</option>
              <option value="baronshub">Baron&apos;s Hub</option>
            </select>
          </Field>
          <Field label="Venue ID">
            <input
              value={draft.eventFeedVenueId}
              onChange={(e) => onChange({ eventFeedVenueId: e.target.value })}
              placeholder="Leave blank for all venues"
              disabled={feedDisabled}
              maxLength={100}
            />
          </Field>
          <Field label="API base URL" span2>
            <input
              type="url"
              value={draft.eventFeedBaseUrl}
              onChange={(e) => onChange({ eventFeedBaseUrl: e.target.value })}
              placeholder="https://…"
              disabled={feedDisabled}
            />
          </Field>
          <div
            className="fg span2"
            style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
          >
            <span className={`statustag ${draft.eventFeedHasKey ? "ready" : "draft"}`}>
              {draft.eventFeedHasKey ? "API key saved" : "No API key"}
            </span>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => onApiKeyChange(e.target.value)}
              placeholder={
                draft.eventFeedHasKey ? "Leave blank to keep existing" : "Enter API key"
              }
              disabled={feedDisabled}
              style={{
                flex: 1,
                background: "rgb(0 0 0 / .3)",
                border: "1px solid rgb(255 255 255 / .16)",
                borderRadius: 11,
                color: "var(--cream)",
                fontFamily: "inherit",
                fontSize: 15,
                padding: "11px 13px",
              }}
              aria-label="Event feed API key"
            />
          </div>
        </div>
      </div>
    </>
  );
}

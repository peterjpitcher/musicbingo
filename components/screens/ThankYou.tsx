"use client";

import React from "react";
import type { ScreenProps } from "@/components/screens/types";
import type { BrandConfig } from "@/lib/brands/types";
import { Sunburst } from "@/components/motifs/Sunburst";
import { VenueLogo } from "@/components/motifs/VenueLogo";
import { Qr, qrValue } from "@anchor-nights/kit/qr";
import { Editable } from "@/components/motifs/Editable";
import { useEdit } from "@/components/motifs/EditContext";
import { Chrome } from "@/components/motifs/Chrome";
import { normaliseWebUrl, websiteLabel } from "@/lib/brands/websiteUrl";

/**
 * Resolve a QR URL from `brand.qr_items` using a keyword search.
 * Falls back through qr_items order, then `fallback`, then `brand.website_url`,
 * then empty string. Callers normalise the result with `normaliseWebUrl`.
 */
function resolveQrUrl(
  brand: BrandConfig,
  keywords: string[],
  fallback: string | null | undefined
): string {
  const items = brand.qr_items ?? [];
  const match = items.find((item) =>
    keywords.some((kw) => item.label.toLowerCase().includes(kw))
  );
  if (match) return match.url;
  return fallback ?? brand.website_url ?? "";
}

type QrCard = { label: string; key: string; url: string; sub: string; delay: number };

/**
 * Screen 13 — Thank You / Reviews / Next Event.
 *
 * Left column: venue logo, headline, lede, next-event date badge.
 * Right column: two QR cards, "Review us" and "Book Again".
 *
 * QR URLs are resolved from `brand.qr_items`:
 *   - Review card  → label containing "review"
 *   - Booking card → label containing "book", "booking", "reserve", or "event"
 * Falls back to the first / second qr_items entries, then `brand.website_url`.
 * Every URL is normalised to https:// (the brand value may be stored without
 * a scheme); a card with no usable URL is hidden rather than given an
 * invented code. The "Next Event" badge only shows when the host typed a date.
 */
export function ThankYou({ brand }: ScreenProps): React.ReactElement {
  const { editing, get } = useEdit();
  const items = brand.qr_items ?? [];

  // Prefer keyword-matched items; fall back by position, then website_url.
  const reviewUrl = normaliseWebUrl(
    get("reviewQrUrl", "").trim() || resolveQrUrl(brand, ["review"], items[0]?.url),
  );
  const bookUrl = normaliseWebUrl(
    get("bookQrUrl", "").trim() || resolveQrUrl(brand, ["book", "booking", "reserve", "event"], items[1]?.url ?? items[0]?.url),
  );
  const nextDate = get("nextDate", "").trim();
  const showNextDate = Boolean(nextDate) || editing;

  // Every address is normalised to https:// first (the brand value may be
  // stored without a scheme), then only links a phone can open get a card
  // (the kit's QR guard): a typo or a localhost address shows no code rather
  // than one that scans to nothing. The review card asks for feedback, never
  // for a particular rating or a particular site (owner rule, website SSOT
  // section 17): its QR leads to a neutral feedback page.
  const qrCards: QrCard[] = [
    { label: "Review us",   key: "review", url: reviewUrl ?? "", sub: "Tell us how we did", delay: 4 },
    { label: "Book Again",  key: "book",   url: bookUrl ?? "",   sub: "Book your seats before you leave!", delay: 5 },
  ].filter((card) => qrValue(card.url) !== null);

  return (
    <div
      className="screen grain vignette"
      style={{
        padding: "76px 120px 104px",
        flexDirection: "row",
        alignItems: "center",
        gap: 90,
      }}
    >
      <Sunburst
        size={1500}
        style={{
          left: "-360px",
          top: "50%",
          transform: "translateY(-50%)",
          opacity: 0.3,
        }}
      />

      {/* Left column: text content */}
      <div
        className="col"
        style={{ flex: 1, gap: 24, position: "relative", zIndex: 2 }}
      >
        <VenueLogo brand={brand} />
        <h1
          className="display display--gold an-rise d2"
          style={{ fontSize: 150 }}
        >
          <Editable as="div" field="tyL1" placeholder="Thank You" />
          <Editable as="div" field="tyL2" placeholder="& Goodnight" />
        </h1>
        <p className="lede an-rise d3" style={{ maxWidth: 760 }}>
          <Editable
            field="tyLede"
            placeholder="We hope you had a brilliant night. We'd love to hear how it went."
          />
        </p>
        {showNextDate && (
        <div
          className="an-rise d4"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 22,
            padding: "20px 30px",
            borderRadius: 18,
            width: "fit-content",
            background: "color-mix(in srgb, var(--anchor-gold) 16%, transparent)",
            border: "2px solid var(--anchor-gold)",
          }}
        >
          <span
            style={{
              fontSize: 32,
              letterSpacing: ".2em",
              textTransform: "uppercase",
              color: "var(--anchor-gold-bright)",
              fontWeight: 700,
            }}
          >
            Next Event
          </span>
          <span
            style={{
              fontFamily: "var(--font-dm-serif), serif",
              fontSize: 52,
              color: "var(--anchor-cream-text)",
              lineHeight: 0.9,
            }}
          >
            <Editable optional field="nextDate" placeholder="Next event date" />
          </span>
        </div>
        )}
      </div>

      {/* Right column: QR cards */}
      {qrCards.length > 0 ? (
      <div
        className="col"
        style={{
          flex: "0 0 620px",
          flexDirection: "row",
          gap: 44,
          position: "relative",
          zIndex: 2,
        }}
      >
        {qrCards.map(({ label, key, url, sub, delay }) => (
          <div
            key={key}
            className={`an-pop d${delay}`}
            style={{ textAlign: "center", flex: 1 }}
          >
            <div
              style={{
                padding: 16,
                background: "#ffffff",
                borderRadius: 20,
                display: "inline-block",
                boxShadow: "0 24px 60px rgba(0,0,0,.5)",
                border: "3px solid var(--anchor-gold-bright)",
              }}
            >
              <Qr value={url} title={`QR code: ${label}`} size={250} />
            </div>
            <div
              style={{
                fontFamily: "var(--font-dm-serif), serif",
                fontSize: 44,
                marginTop: 20,
                color: "var(--anchor-cream-text)",
                whiteSpace: "nowrap",
              }}
            >
              {label}
            </div>
            <div className="muted" style={{ fontSize: 32, marginTop: 6 }}>
              {sub}
            </div>
          </div>
        ))}
      </div>
      ) : null}

      <Chrome
        left={<Editable field="venueWeb" placeholder={websiteLabel(brand.website_url) || brand.name} />}
        right="See You Next Month"
      />
    </div>
  );
}

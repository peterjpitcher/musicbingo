"use client";

import React from "react";
import type { ScreenProps } from "@/components/screens/types";
import type { BrandConfig } from "@/lib/brands/types";
import { Sunburst } from "@/components/motifs/Sunburst";
import { VenueLogo } from "@/components/motifs/VenueLogo";
import { Qr } from "@/components/motifs/Qr";
import { Editable } from "@/components/motifs/Editable";
import { useEdit } from "@/components/motifs/EditContext";
import { Chrome } from "@/components/motifs/Chrome";

/**
 * Resolve a QR URL from `brand.qr_items` using a keyword search.
 * Falls back through qr_items order, then `fallback`, then empty string.
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

/**
 * Screen 13 — Thank You / Reviews / Next Event.
 *
 * Left column: venue logo, headline, lede, next-event date badge.
 * Right column: two QR cards — "Review Us" and "Book Again".
 *
 * QR URLs are resolved from `brand.qr_items`:
 *   - Review card  → label containing "review"
 *   - Booking card → label containing "book", "booking", "reserve", or "event"
 * Falls back to the first / second qr_items entries, then `brand.website_url`.
 */
export function ThankYou({ brand }: ScreenProps): React.ReactElement {
  const { get } = useEdit();
  const items = brand.qr_items ?? [];

  // Prefer keyword-matched items; fall back by position, then website_url.
  const reviewUrl = get("reviewQrUrl", "").trim() || resolveQrUrl(brand, ["review"], items[0]?.url);
  const bookUrl = get("bookQrUrl", "").trim() || resolveQrUrl(brand, ["book", "booking", "reserve", "event"], items[1]?.url ?? items[0]?.url);

  const qrCards: Array<{ label: string; key: string; url: string; sub: string; delay: number }> = [
    { label: "Review Us",   key: "review", url: reviewUrl, sub: "Scan & rate us ★★★★★",  delay: 4 },
    { label: "Book Again",  key: "book",   url: bookUrl,   sub: "Book your seats before you leave!", delay: 5 },
  ];

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

      {/* Left column — text content */}
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
            placeholder="We hope you had a brilliant night. If you did, a Google review means the world to us."
          />
        </p>
        <div
          className="an-rise d4"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 22,
            padding: "20px 30px",
            borderRadius: 18,
            width: "fit-content",
            background: "rgb(var(--brand-accent-rgb) / .16)",
            border: "2px solid var(--brand-accent)",
          }}
        >
          <span
            style={{
              fontSize: 18,
              letterSpacing: ".2em",
              textTransform: "uppercase",
              color: "var(--brand-accent-light)",
              fontWeight: 700,
            }}
          >
            Next Event
          </span>
          <span
            style={{
              fontFamily: "var(--brand-display)",
              fontSize: 52,
              color: "var(--cream)",
              lineHeight: 0.9,
            }}
          >
            <Editable field="nextDate" placeholder="Fri 27 June · 8PM" />
          </span>
        </div>
      </div>

      {/* Right column — QR cards */}
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
                background: "var(--cream)",
                borderRadius: 20,
                display: "inline-block",
                boxShadow: "0 24px 60px rgba(0,0,0,.5)",
                border: "3px solid var(--brand-accent-light)",
              }}
            >
              <Qr value={url} size={250} />
            </div>
            <div
              style={{
                fontFamily: "var(--brand-display)",
                fontSize: 38,
                textTransform: "uppercase",
                marginTop: 20,
                color: "var(--cream)",
                whiteSpace: "nowrap",
              }}
            >
              {label}
            </div>
            <div className="muted" style={{ fontSize: 22, marginTop: 6 }}>
              {sub}
            </div>
          </div>
        ))}
      </div>

      <Chrome
        left={<Editable field="venueWeb" placeholder={brand.website_url ?? brand.name} />}
        right="See You Next Month"
      />
    </div>
  );
}

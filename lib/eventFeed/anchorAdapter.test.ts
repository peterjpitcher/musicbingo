import { expect, test } from "vitest";

import { resolveAnchorEventUrl } from "./anchorAdapter.ts";

const baseUrl = "https://management.orangejelly.co.uk";

test("resolveAnchorEventUrl prefers the public slug URL over management API URLs", () => {
  expect(
    resolveAnchorEventUrl({
      baseUrl,
      websiteUrl: "https://the-anchor.pub",
      event: {
        slug: "music-bingo-2026-07-17",
        url: "https://management.orangejelly.co.uk/events/music-bingo-2026-07-17",
      },
    }),
  ).toBe("https://the-anchor.pub/events/music-bingo-2026-07-17");
});

test("resolveAnchorEventUrl accepts a public website without a scheme", () => {
  expect(
    resolveAnchorEventUrl({
      baseUrl,
      websiteUrl: "the-anchor.pub",
      event: {
        slug: "quiz-night-2026-07-24",
        eventUrl: "https://management.orangejelly.co.uk/events/quiz-night-2026-07-24",
      },
    }),
  ).toBe("https://the-anchor.pub/events/quiz-night-2026-07-24");
});

test("resolveAnchorEventUrl uses a customer booking URL when no slug is available", () => {
  expect(
    resolveAnchorEventUrl({
      baseUrl,
      websiteUrl: "https://the-anchor.pub",
      event: {
        bookingUrl: "https://tickets.example.com/events/123",
      },
    }),
  ).toBe("https://tickets.example.com/events/123");
});

test("resolveAnchorEventUrl rejects management URLs when no public URL exists", () => {
  expect(
    resolveAnchorEventUrl({
      baseUrl,
      websiteUrl: "https://the-anchor.pub",
      event: {
        eventUrl: "https://management.orangejelly.co.uk/events/private-admin-page",
      },
    }),
  ).toBeNull();
});

test("resolveAnchorEventUrl rejects a legacy vip-club.uk booking URL in favour of the slug", () => {
  expect(
    resolveAnchorEventUrl({
      baseUrl,
      websiteUrl: "https://www.the-anchor.pub",
      event: {
        slug: "music-bingo-2026-09-18",
        bookingUrl: "https://vip-club.uk/abc123",
      },
    }),
  ).toBe("https://www.the-anchor.pub/events/music-bingo-2026-09-18");
});

test("resolveAnchorEventUrl returns null for a legacy vip-club.uk booking URL with no slug", () => {
  expect(
    resolveAnchorEventUrl({
      baseUrl,
      websiteUrl: "https://www.the-anchor.pub",
      event: {
        booking_url: "vip-club.uk/abc123",
      },
    }),
  ).toBeNull();
});

test("resolveAnchorEventUrl rejects vip-club.uk subdomains in offers", () => {
  expect(
    resolveAnchorEventUrl({
      baseUrl,
      websiteUrl: "https://www.the-anchor.pub",
      event: {
        offers: [{ url: "https://go.vip-club.uk/abc123" }],
      },
    }),
  ).toBeNull();
});

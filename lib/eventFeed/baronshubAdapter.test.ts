import assert from "node:assert/strict";
import test from "node:test";

import { resolveBaronsHubEventUrl } from "./baronshubAdapter.ts";

const apiBaseUrl = "https://baronshub.orangejelly.co.uk/api/v1/events";

test("resolveBaronsHubEventUrl prefers HTTPS booking URLs from the API", () => {
  assert.equal(
    resolveBaronsHubEventUrl({
      bookingUrl: "https://tickets.example.com/event",
      bookingPageUrl: "https://l.baronspubs.com/local-event",
      seoSlug: "local-event",
      apiBaseUrl,
    }),
    "https://tickets.example.com/event"
  );
});

test("resolveBaronsHubEventUrl accepts HTTP booking URLs from the API", () => {
  assert.equal(
    resolveBaronsHubEventUrl({
      bookingUrl: "http://buytickets.at/meadehallatthecrowncushion/1986164",
      seoSlug: "unforgettable-live-music-experience-2026-08-06",
      apiBaseUrl,
    }),
    "http://buytickets.at/meadehallatthecrowncushion/1986164"
  );
});

test("resolveBaronsHubEventUrl uses the API booking page URL when no HTTPS booking URL exists", () => {
  assert.equal(
    resolveBaronsHubEventUrl({
      bookingUrl: null,
      bookingPageUrl: "https://l.baronspubs.com/local-event",
      seoSlug: "local-event",
      apiBaseUrl,
    }),
    "https://l.baronspubs.com/local-event"
  );
});

test("resolveBaronsHubEventUrl falls back to the BaronsHub landing page for current API responses", () => {
  assert.equal(
    resolveBaronsHubEventUrl({
      bookingUrl: null,
      seoSlug: "summer-party-with-dj-darren-2026-07-05",
      apiBaseUrl,
    }),
    "https://baronshub.orangejelly.co.uk/l/summer-party-with-dj-darren-2026-07-05"
  );
});

test("resolveBaronsHubEventUrl does not turn rejected booking URLs into guessed landing pages", () => {
  assert.equal(
    resolveBaronsHubEventUrl({
      bookingUrl: "mailto:events@example.com",
      seoSlug: "unforgettable-live-music-experience-2026-08-06",
      apiBaseUrl,
    }),
    null
  );
});

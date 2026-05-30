import { test, expect } from "vitest";

import { resolveBaronsHubEventUrl } from "./baronshubAdapter.ts";

const apiBaseUrl = "https://baronshub.orangejelly.co.uk/api/v1/events";

test("resolveBaronsHubEventUrl prefers HTTPS booking URLs from the API", () => {
  expect(
    resolveBaronsHubEventUrl({
      bookingUrl: "https://tickets.example.com/event",
      bookingPageUrl: "https://l.baronspubs.com/local-event",
      seoSlug: "local-event",
      apiBaseUrl,
    })
  ).toBe("https://tickets.example.com/event");
});

test("resolveBaronsHubEventUrl accepts HTTP booking URLs from the API", () => {
  expect(
    resolveBaronsHubEventUrl({
      bookingUrl: "http://buytickets.at/meadehallatthecrowncushion/1986164",
      seoSlug: "unforgettable-live-music-experience-2026-08-06",
      apiBaseUrl,
    })
  ).toBe("http://buytickets.at/meadehallatthecrowncushion/1986164");
});

test("resolveBaronsHubEventUrl uses the API booking page URL when no HTTPS booking URL exists", () => {
  expect(
    resolveBaronsHubEventUrl({
      bookingUrl: null,
      bookingPageUrl: "https://l.baronspubs.com/local-event",
      seoSlug: "local-event",
      apiBaseUrl,
    })
  ).toBe("https://l.baronspubs.com/local-event");
});

test("resolveBaronsHubEventUrl falls back to the BaronsHub landing page for current API responses", () => {
  expect(
    resolveBaronsHubEventUrl({
      bookingUrl: null,
      seoSlug: "summer-party-with-dj-darren-2026-07-05",
      apiBaseUrl,
    })
  ).toBe("https://baronshub.orangejelly.co.uk/l/summer-party-with-dj-darren-2026-07-05");
});

test("resolveBaronsHubEventUrl does not turn rejected booking URLs into guessed landing pages", () => {
  expect(
    resolveBaronsHubEventUrl({
      bookingUrl: "mailto:events@example.com",
      seoSlug: "unforgettable-live-music-experience-2026-08-06",
      apiBaseUrl,
    })
  ).toBeNull();
});

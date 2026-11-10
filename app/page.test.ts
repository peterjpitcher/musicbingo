import { afterEach, describe, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ScreenFeed } from "@anchor-nights/kit/events/shared";

import { NO_FEED, QUIZ_NOV_25, feedWith } from "@/lib/test/screenFeedFixtures";

const getFeed = vi.fn<() => Promise<ScreenFeed>>();
const reportError = vi.fn();

vi.mock("@/lib/eventsFeed", () => ({ eventsFeed: { getFeed: () => getFeed() } }));
vi.mock("@/lib/reportError", () => ({ reportError: (...args: unknown[]) => reportError(...args) }));
vi.mock("next/link", () => ({ default: "a" }));

async function renderHome(): Promise<string> {
  const { default: Home } = await import("./page");
  return renderToStaticMarkup(await Home());
}

afterEach(() => {
  vi.unstubAllEnvs();
  getFeed.mockReset();
  reportError.mockReset();
});

describe("the front page (spec M-10)", () => {
  test("the kit front page: Music Bingo and the three staff tiles", async () => {
    getFeed.mockResolvedValue(feedWith([]));
    const html = await renderHome();
    expect(html).toContain("Music Bingo");
    for (const href of ['href="/host"', 'href="/tv"', 'href="/admin"']) expect(html).toContain(href);
    expect(html).not.toContain("Other nights");
  });

  test("a sister night appears when it is running and has an address", async () => {
    vi.stubEnv("NEXT_PUBLIC_QUIZ_NIGHT_URL", "https://quiz.example.com");
    getFeed.mockResolvedValue(feedWith([], [QUIZ_NOV_25]));
    const html = await renderHome();
    expect(html).toContain("Other nights");
    expect(html).toContain('href="https://quiz.example.com/"');
  });

  test("with the feed down the row is hidden, the page still renders, and the failure is reported", async () => {
    vi.stubEnv("NEXT_PUBLIC_QUIZ_NIGHT_URL", "https://quiz.example.com");
    getFeed.mockResolvedValue(NO_FEED);
    const html = await renderHome();
    expect(html).toContain('href="/host"');
    expect(html).not.toContain("Other nights");
    expect(reportError).toHaveBeenCalledWith({ scope: "front:other-nights" }, expect.any(Error));
  });
});

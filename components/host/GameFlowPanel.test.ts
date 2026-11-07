import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { END_SESSION_HOLD_LABEL, GameFlowPanel, RESET_LOBBY_HOLD_LABEL, type GameFlowPanelProps } from "@/components/host/GameFlowPanel";

/**
 * Hold-to-confirm on the two actions the room cannot take back (spec M-9,
 * S4.2): End Session and Reset to Lobby. Everything else stays one tap.
 * The press-and-hold itself is driven in the browser by e2e Flow 16.
 */

const noop = (): void => undefined;

function render(mode: string): string {
  const props: GameFlowPanelProps = {
    mode,
    activeGame: mode === "running" ? 1 : null,
    onIntro: noop,
    onStart: noop,
    onBreak: noop,
    onResume: noop,
    resumeGameNumber: null,
    onResumeGame: noop,
    onEnd: noop,
    onReset: noop,
    onClaim: noop,
    onBackToGame: noop,
    claimAvailable: false,
    claimCount: 0,
    claimActive: false,
  };
  return renderToStaticMarkup(createElement(GameFlowPanel, props));
}

/** The visible text of each plain (single-tap) button. */
function tapButtons(html: string): string[] {
  return [...html.matchAll(/<button(?![^>]*aria-label="[^"]*Press and hold)[^>]*>([\s\S]*?)<\/button>/g)].map((m) =>
    m[1].replace(/<[^>]+>/g, "").trim()
  );
}

describe("GameFlowPanel", () => {
  test("End Session is a hold while a game runs, and nothing else is", () => {
    const html = render("running");
    expect(html).toContain(`aria-label="${END_SESSION_HOLD_LABEL}. Press and hold."`);
    expect(html.match(/Press and hold/g)).toHaveLength(1);
    expect(tapButtons(html)).not.toContain("End Session");
    expect(tapButtons(html)).toEqual(expect.arrayContaining(["Start Game 1", "Show Break Screen"]));
  });

  test("End Session is a hold on the break screen too", () => {
    const html = render("break");
    expect(html).toContain(`aria-label="${END_SESSION_HOLD_LABEL}. Press and hold."`);
    expect(tapButtons(html)).toContain("▶ Continue Show");
  });

  test("Reset to Lobby is a hold once the session has ended", () => {
    const html = render("ended");
    expect(html).toContain(`aria-label="${RESET_LOBBY_HOLD_LABEL}. Press and hold."`);
    expect(html).not.toContain(END_SESSION_HOLD_LABEL);
    expect(tapButtons(html).some((text) => /Reset to Lobby/i.test(text))).toBe(false);
  });
});

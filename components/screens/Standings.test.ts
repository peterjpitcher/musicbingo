import { describe, it, expect } from "vitest";

import { rankTeams } from "@/components/screens/Standings";

const team = (name: string, score: number) => ({ id: `t-${name}`, name, score });

describe("rankTeams", () => {
  it("ranks best first", () => {
    const rows = rankTeams([team("Bar Flies", 40), team("Quiz Kids", 95), team("Anchors", 60)]);
    expect(rows.map((r) => r.team.name)).toEqual(["Quiz Kids", "Anchors", "Bar Flies"]);
    expect(rows.map((r) => r.position)).toEqual([1, 2, 3]);
  });

  it("gives tied teams the same position and skips the places they use up", () => {
    const rows = rankTeams([
      team("Anchors", 50),
      team("Bar Flies", 70),
      team("Quiz Kids", 50),
      team("Dabbers", 20),
    ]);
    expect(rows.map((r) => [r.team.name, r.position])).toEqual([
      ["Bar Flies", 1],
      ["Anchors", 2],
      ["Quiz Kids", 2],
      ["Dabbers", 4],
    ]);
    expect(rows.map((r) => r.sharesPosition)).toEqual([false, true, true, false]);
  });

  it("marks every team as tied when nobody has scored yet", () => {
    const rows = rankTeams([team("Anchors", 0), team("Bar Flies", 0)]);
    expect(rows.map((r) => r.position)).toEqual([1, 1]);
    expect(rows.every((r) => r.sharesPosition)).toBe(true);
  });

  it("sorts equal scores by name so the order is stable between renders", () => {
    const rows = rankTeams([team("Zebras", 30), team("Aces", 30)]);
    expect(rows.map((r) => r.team.name)).toEqual(["Aces", "Zebras"]);
  });

  it("drops unnamed placeholder teams", () => {
    const rows = rankTeams([team("Anchors", 10), team("   ", 90)]);
    expect(rows).toHaveLength(1);
    expect(rows[0].team.name).toBe("Anchors");
  });
});

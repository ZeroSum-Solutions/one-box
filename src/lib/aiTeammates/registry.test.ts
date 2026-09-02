import { describe, expect, it } from "vitest";

import { AI_TEAMMATE_IDS } from "../contracts";
import { getAiTeammate, listAiTeammates } from "./registry";

describe("AI teammate registry", () => {
  it("returns the immutable exact eight-role roster", () => {
    const roster = listAiTeammates();

    expect(roster.map(({ id }) => id)).toEqual(AI_TEAMMATE_IDS);
    expect(roster.map(({ displayName }) => displayName)).toEqual([
      "Researcher",
      "PRD Planner",
      "Architecture Analyst",
      "Canvas Designer",
      "Implementation Producer",
      "QA Challenger",
      "Security Challenger",
      "SEO Qualifier",
    ]);
    expect(Object.isFrozen(roster)).toBe(true);
    expect(roster.every((teammate) => Object.isFrozen(teammate))).toBe(true);
    expect(
      roster.every(
        (teammate) =>
          Object.isFrozen(teammate.skills) &&
          Object.isFrozen(teammate.dataClasses) &&
          Object.isFrozen(teammate.effectClasses),
      ),
    ).toBe(true);

    expect(getAiTeammate("canvas-designer")).toBe(roster[3]);
    expect(getAiTeammate("not-a-role")).toBeUndefined();
  });
});

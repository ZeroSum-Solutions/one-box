import { describe, expect, it } from "vitest";
import {
  REFERENCE_RECORD_PROMPT_CAP,
  serializeReferenceRecordForPrompt,
} from "./referenceRecordPrompt";

describe("serializeReferenceRecordForPrompt", () => {
  it("returns the full JSON untouched when it fits the cap", () => {
    const record = { title: "Ambrook", northStar: "Rustic ledger on cream parchment" };
    expect(serializeReferenceRecordForPrompt(record)).toBe(JSON.stringify(record));
  });

  it("serializes a missing record as the JSON null literal", () => {
    expect(serializeReferenceRecordForPrompt(null)).toBe("null");
  });

  it("drops the Agent Prompt Guide custom section before cutting anything else", () => {
    const filler = "x".repeat(REFERENCE_RECORD_PROMPT_CAP - 2_000);
    const record = {
      title: "Ambrook",
      layout: filler,
      customSections: [
        { title: "Agent Prompt Guide", content: "y".repeat(4_000) },
        { title: "Motion Philosophy", content: "transitions are 0.15s ease" },
      ],
    };
    const out = serializeReferenceRecordForPrompt(record);
    expect(out.length).toBeLessThanOrEqual(REFERENCE_RECORD_PROMPT_CAP);
    const parsed = JSON.parse(out) as typeof record;
    expect(parsed.customSections).toHaveLength(1);
    expect(parsed.customSections[0].title).toBe("Motion Philosophy");
    expect(parsed.layout).toBe(filler);
  });

  it("hard-slices only as the last resort, when dropping the guide is not enough", () => {
    const record = {
      title: "Huge",
      layout: "z".repeat(REFERENCE_RECORD_PROMPT_CAP * 2),
    };
    const out = serializeReferenceRecordForPrompt(record);
    expect(out).toHaveLength(REFERENCE_RECORD_PROMPT_CAP);
  });

  it("raises the historical 14k cap to 24k so composition fields survive", () => {
    expect(REFERENCE_RECORD_PROMPT_CAP).toBe(24_000);
  });
});

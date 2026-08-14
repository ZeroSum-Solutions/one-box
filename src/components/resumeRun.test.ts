import { describe, expect, it } from "vitest";
import { resumedRunId } from "./resumeRun";

describe("resumedRunId", () => {
  it("restores a valid evidence workspace continuation link", () => {
    expect(resumedRunId("?run=abcd_1234")).toBe("abcd_1234");
  });

  it("rejects path and query injection", () => {
    expect(resumedRunId("?run=../../etc/passwd")).toBeNull();
    expect(resumedRunId("?run=abc&next=https://evil.example")).toBeNull();
  });
});

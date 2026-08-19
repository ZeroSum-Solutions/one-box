import { describe, expect, it } from "vitest";
import { POST } from "./route";

// Selection-Scoped Assistant References (canvas-upgrade Wave 6, Play 5): the
// scopeEditId format check happens at the zod boundary, before the run or
// its site are ever touched -- so this is real end-to-end coverage of the
// route with no mocking required, matching the malformed-body cases motion
// and edit's own route tests already cover for their fields.
function request(body: unknown) {
  return new Request("http://localhost:3000/api/assistant/test-run", {
    method: "POST",
    headers: {
      Host: "localhost:3000",
      Origin: "http://localhost:3000",
      "Sec-Fetch-Site": "same-origin",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function context(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("assistant route selection scope validation", () => {
  it("rejects a malformed selection scope before touching the run", async () => {
    const response = await POST(
      request({ text: "make this punchier", scopeEditId: "not a valid id!" }),
      context("test-run"),
    );
    expect(response.status).toBe(400);
    const data = (await response.json()) as { error: string };
    expect(data.error).toContain("selection scope");
  });

  it("accepts a request with no selection scope at all", async () => {
    // assertAssistantAvailable() fails past this point in this unmocked
    // test (no such run on disk) -- the point here is only that omitting
    // scopeEditId is not itself a validation failure at the boundary.
    const response = await POST(
      request({ text: "what would you improve first?" }),
      context("no-such-run-xyz"),
    );
    expect(response.status).not.toBe(400);
  });

  it("rejects an empty-string selection scope the same as a missing shape", async () => {
    const response = await POST(
      request({ text: "make this punchier", scopeEditId: "" }),
      context("test-run"),
    );
    expect(response.status).toBe(400);
  });
});

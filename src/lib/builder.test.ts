import { describe, expect, it } from "vitest";
import { findDanglingTokenRefs } from "./builder";

// ENG-008. A generated site shipped `--border-subtle: 1px solid
// var(--color-stone-grey)` against a --color-stone-grey that no token defined.
// The browser drops the whole declaration, the border vanishes, and the
// token-drift gate never sees it because that gate inspects colour and font
// only. These tests pin the check that would have caught it.
describe("findDanglingTokenRefs", () => {
  it("reports a var() reference no declaration defines", () => {
    expect(
      findDanglingTokenRefs([
        "  --color-border: #dddddd;",
        "  --border-subtle: 1px solid var(--color-stone-grey);",
      ])
    ).toEqual(["--color-stone-grey"]);
  });

  it("accepts a reference that resolves, whatever the declaration order", () => {
    expect(
      findDanglingTokenRefs([
        "  --border-subtle: 1px solid var(--color-border);",
        "  --color-border: #dddddd;",
      ])
    ).toEqual([]);
  });

  it("accepts a dangling reference that carries a fallback", () => {
    // var(--x, 1px) still renders when --x is missing, so it is not a defect.
    expect(
      findDanglingTokenRefs(["  --border-subtle: var(--color-nope, 1px) solid #ddd;"])
    ).toEqual([]);
  });

  it("reports every distinct dangling reference once", () => {
    expect(
      findDanglingTokenRefs([
        "  --shadow-card: 0 1px var(--space-nope) var(--color-nope);",
        "  --shadow-lifted: 0 2px var(--space-nope);",
      ])
    ).toEqual(["--color-nope", "--space-nope"]);
  });

  it("ignores a var() inside the declaration NAME position", () => {
    expect(findDanglingTokenRefs(["  --space-md: 16px;"])).toEqual([]);
  });
});

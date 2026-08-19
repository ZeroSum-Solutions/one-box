import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EditorThread } from "@/lib/contracts";
import {
  AssistantPanelContent,
  applyAssistantSuggestion,
  assistantThumbnailUrl,
  sendAssistantTurn,
} from "./AssistantPanel";

const suggestion = {
  id: "suggestion-1",
  editId: "hero-heading",
  instruction: "Make the opening sentence describe the visitor benefit first.",
  summary: "Clarify the opening promise",
};

const thread: EditorThread = {
  updatedAt: "2026-08-15T12:00:00.000Z",
  messages: [
    {
      id: "owner-1",
      role: "owner",
      text: "How could the opening feel more welcoming?",
      at: "2026-08-15T12:00:00.000Z",
    },
    {
      id: "assistant-1",
      role: "assistant",
      reply: "Lead with the visitor benefit.\n\nKeep the next step visible.",
      at: "2026-08-15T12:01:00.000Z",
      evidence: [
        {
          screenId: "screen-1",
          thumbnailPath: "research/refero/assistant/bright-home.png",
          siteName: "Bright Home",
          takeaway: "A clear first sentence makes the offer easy to understand.",
        },
      ],
      suggestions: [
        suggestion,
      ],
    },
  ],
};

afterEach(() => vi.unstubAllGlobals());

describe("AssistantPanel", () => {
  it("renders the saved conversation with inspiration evidence and suggestions", () => {
    const html = renderToStaticMarkup(
      <AssistantPanelContent
        runId="run-1"
        state={{ kind: "ready", thread }}
        draft=""
        isSending={false}
        suggestionStates={{}}
        onDraftChange={() => undefined}
        onSend={() => undefined}
        onApplySuggestion={() => undefined}
      />,
    );

    expect(html).toContain("How could the opening feel more welcoming?");
    expect(html).toContain("Lead with the visitor benefit.");
    expect(html).toContain("Keep the next step visible.");
    expect(html).toContain("Real business site used for inspiration");
    expect(html).toContain("Bright Home");
    expect(html).toContain("Clarify the opening promise");
    expect(html).toContain("Make the opening sentence describe the visitor benefit first.");
    expect(html).toContain('src="/api/sites/run-1/research/refero/assistant/bright-home.png"');
  });

  it("sends trimmed owner text and returns the updated conversation", async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ runId: "run-1", thread }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetch);

    const result = await sendAssistantTurn("run-1", "  Please review the first section.  ");

    expect(result).toEqual({ kind: "ready", thread });
    expect(fetch).toHaveBeenCalledWith("/api/assistant/run-1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "Please review the first section." }),
    });
  });

  // Selection-Scoped Assistant References (canvas-upgrade Wave 6, Play 5d):
  // the outgoing half of this play's own verification — a canvas selection
  // rides along in the SAME request as the typed text.
  it("includes the selection scope in the outgoing request when a selection is present", async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ runId: "run-1", thread }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetch);

    const result = await sendAssistantTurn("run-1", "Make this punchier.", "services");

    expect(result).toEqual({ kind: "ready", thread });
    expect(fetch).toHaveBeenCalledWith("/api/assistant/run-1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "Make this punchier.", scopeEditId: "services" }),
    });
  });

  it("shows what the turn is scoped to when an element is selected", () => {
    const html = renderToStaticMarkup(
      <AssistantPanelContent
        runId="run-1"
        state={{ kind: "ready", thread }}
        selection={{ editId: "services", tag: "section", text: "Services", behavior: "container" }}
        draft=""
        isSending={false}
        suggestionStates={{}}
        onDraftChange={() => undefined}
        onSend={() => undefined}
        onApplySuggestion={() => undefined}
      />,
    );

    expect(html).toContain("Scoped to");
    expect(html).toContain("services");
    expect(html).toContain('aria-label="Ask about section services…"');
  });

  it("stays unscoped and says so when nothing is selected", () => {
    const html = renderToStaticMarkup(
      <AssistantPanelContent
        runId="run-1"
        state={{ kind: "ready", thread }}
        selection={null}
        draft=""
        isSending={false}
        suggestionStates={{}}
        onDraftChange={() => undefined}
        onSend={() => undefined}
        onApplySuggestion={() => undefined}
      />,
    );

    expect(html).not.toContain("Scoped to");
    expect(html).toContain("No element selected");
    expect(html).toContain('aria-label="Ask a question about your site"');
  });

  it("keeps the composer available when a saved message needs a retry", async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ error: "The assistant could not answer just now. Your message is saved; please try again." }),
        { status: 502 },
      ),
    );
    vi.stubGlobal("fetch", fetch);

    const result = await sendAssistantTurn("run-1", "Please review the first section.");
    const html = renderToStaticMarkup(
      <AssistantPanelContent
        runId="run-1"
        state={{ kind: "ready", thread }}
        turnError={result.kind === "error" ? result.message : null}
        draft="Please review the first section."
        isSending={false}
        suggestionStates={{}}
        onDraftChange={() => undefined}
        onSend={() => undefined}
        onApplySuggestion={() => undefined}
      />,
    );

    expect(html).toContain("Your message is saved; please try again.");
    expect(html).toContain('aria-label="Ask a question about your site"');
    expect(html).toContain("Please review the first section.");
  });

  it("shows the guardrail reason when a suggestion is refused", async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: false,
          guardrail: { decision: "refuse", reason: "This change would make the claim misleading." },
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetch);

    const result = await applyAssistantSuggestion("run-1", suggestion);

    expect(result).toEqual({
      kind: "guardrail",
      guardrail: { decision: "refuse", reason: "This change would make the claim misleading." },
    });
  });

  it("applies the guardrail's alternative when the redirect is confirmed", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: false,
            guardrail: {
              decision: "redirect",
              reason: "This needs a more specific request.",
              suggestedAlternative: "Describe the visitor benefit in the opening sentence.",
            },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, gates: [], gatesClean: true }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetch);

    const redirected = await applyAssistantSuggestion("run-1", suggestion);
    const result = await applyAssistantSuggestion(
      "run-1",
      suggestion,
      true,
      "Describe the visitor benefit in the opening sentence.",
    );

    expect(redirected).toEqual({
      kind: "guardrail",
      guardrail: {
        decision: "redirect",
        reason: "This needs a more specific request.",
        suggestedAlternative: "Describe the visitor benefit in the opening sentence.",
      },
    });
    expect(result).toEqual({ kind: "done" });
    // Confirming applies the alternative — matching the page editor and the
    // button copy "Apply the suggested version instead" — never the original
    // instruction the guardrail redirected away from.
    expect(fetch).toHaveBeenLastCalledWith("/api/edit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        runId: "run-1",
        editId: "hero-heading",
        instruction: "Describe the visitor benefit in the opening sentence.",
        confirmRedirect: true,
      }),
    });
  });

  it("explains that the assistant becomes available after the site is generated", () => {
    const html = renderToStaticMarkup(
      <AssistantPanelContent
        runId="run-1"
        state={{ kind: "unavailable" }}
        draft=""
        isSending={false}
        suggestionStates={{}}
        onDraftChange={() => undefined}
        onSend={() => undefined}
        onApplySuggestion={() => undefined}
      />,
    );

    expect(html).toContain("Generate the site first");
    expect(html).not.toContain('aria-label="Ask a question about your site"');
  });

  it("encodes the run and every saved thumbnail path segment", () => {
    expect(assistantThumbnailUrl("run one", "research/refero/assistant/bright home.png")).toBe(
      "/api/sites/run%20one/research/refero/assistant/bright%20home.png",
    );
  });
});

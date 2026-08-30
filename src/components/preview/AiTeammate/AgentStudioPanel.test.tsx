import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  AgentStudioPanel,
  AgentStudioPanelContent,
} from "./AgentStudioPanel";

describe("AgentStudioPanel", () => {
  it("defaults to Teammates and Local foundation", () => {
    const html = renderToStaticMarkup(
      <AgentStudioPanel runId="run-demo" selection={null} />,
    );

    expect(html).toContain("Agent Studio mode");
    expect(html).toContain('aria-pressed="true">Teammates');
    expect(html).toContain('aria-pressed="false">Site advice');
    expect(html).toContain("Local foundation");
    expect(html).toContain("Loading the local roster…");
  });

  it("keeps both modes mounted while hiding the inactive pane", () => {
    const html = renderToStaticMarkup(
      <AgentStudioPanelContent
        mode="site-advice"
        teammatesBusy={false}
        onModeChange={() => undefined}
        teammates={<p>Local teammate surface</p>}
        siteAdvice={<p>Existing site-assistant conversation</p>}
      />,
    );

    expect(html).toContain('aria-pressed="false">Teammates');
    expect(html).toContain('aria-pressed="true">Site advice');
    expect(html).toContain("Existing site-assistant conversation");
    expect(html).toContain(
      "Site advice is separate from Local foundation teammate proposals and receipts.",
    );
    expect(html).toContain("Local teammate surface");
    expect(html).toContain(
      'data-agent-studio-pane="teammates" hidden=""',
    );
    expect(html).toContain('data-agent-studio-pane="site-advice"');
    expect(html).not.toContain(
      'data-agent-studio-pane="site-advice" hidden=""',
    );
  });

  it("locks mode switching while the teammate live region is busy", () => {
    const html = renderToStaticMarkup(
      <AgentStudioPanelContent
        mode="teammates"
        teammatesBusy
        onModeChange={() => undefined}
        teammates={<p>Working teammate</p>}
        siteAdvice={<p>Site advice</p>}
      />,
    );

    expect(html.match(/class="seg-pill"[^>]*disabled/g)).toHaveLength(2);
    expect(html).toContain("Working teammate");
  });
});

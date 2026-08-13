"use client";

import { use, useEffect, useRef, useState } from "react";
import { ChatComposer } from "@/components/ChatComposer";
import { GateStrip } from "@/components/GateStrip";

interface Selection {
  editId: string;
  tag: string;
  text: string;
}

interface EditApiGate {
  gate: string;
  pass: boolean;
  blocking: boolean;
}

// Shape guard for the overlay's postMessage payload (public/overlay.js).
function isOneboxSelectMessage(
  data: unknown
): data is { type: "onebox-select"; editId: string; tag: string; text: string } {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  return (
    d.type === "onebox-select" &&
    typeof d.editId === "string" &&
    typeof d.tag === "string" &&
    typeof d.text === "string"
  );
}

export default function PreviewPage(props: PageProps<"/preview/[id]">) {
  const { id } = use(props.params);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [instruction, setInstruction] = useState("");
  const [imageIntent, setImageIntent] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editResult, setEditResult] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [gateRefreshToken, setGateRefreshToken] = useState(0);
  const [iframeVersion, setIframeVersion] = useState(0);

  // The iframe renders at an opaque origin (sandbox="allow-scripts" without
  // allow-same-origin per audit E21), so event.origin is always the literal
  // string "null" — not a meaningful check. Verify provenance via window
  // identity instead, then validate the message shape before trusting it.
  useEffect(() => {
    function handleMessage(e: MessageEvent) {
      if (e.source !== iframeRef.current?.contentWindow) return;
      if (!isOneboxSelectMessage(e.data)) return;
      setSelection(e.data.editId ? { editId: e.data.editId, tag: e.data.tag, text: e.data.text } : null);
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  async function submitEdit() {
    if (!selection || !instruction.trim() || isEditing) return;
    setIsEditing(true);
    setEditError(null);
    setEditResult(null);
    try {
      const res = await fetch("/api/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runId: id,
          editId: selection.editId,
          instruction: instruction.trim(),
          imageIntent,
        }),
      });
      const data = (await res.json().catch(() => null)) as
        | { ok: true; gates: EditApiGate[]; gatesClean: boolean }
        | { error: string }
        | null;

      if (!res.ok || !data || "error" in data) {
        throw new Error((data && "error" in data && data.error) || `Edit failed (${res.status}).`);
      }

      const passing = data.gates.filter((g) => g.pass).length;
      setEditResult(`Applied. Gates ${data.gatesClean ? "clean" : "flagged"} (${passing}/${data.gates.length} passing).`);
      setInstruction("");
      setImageIntent(false);
      setGateRefreshToken((n) => n + 1);
      setIframeVersion((n) => n + 1); // remounts the iframe to load the patched source
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Edit failed.");
    } finally {
      setIsEditing(false);
    }
  }

  return (
    <div className="preview-layout">
      <iframe
        key={iframeVersion}
        ref={iframeRef}
        className="preview-frame"
        src={`/api/sites/${id}/index.html?edit=1`}
        sandbox="allow-scripts"
        title="Site preview"
      />
      <aside className="preview-rail">
        <p className="eyebrow">{"{ Edit }"}</p>

        {selection ? (
          <div className="selection-chip">
            <span className="selection-chip__tag">{selection.tag}</span>
            {selection.editId}
            {selection.text && <span className="selection-chip__text">&ldquo;{selection.text}&rdquo;</span>}
          </div>
        ) : (
          <div className="selection-chip selection-chip--empty">
            Click an element in the preview to select it.
          </div>
        )}

        <ChatComposer
          value={instruction}
          onChange={setInstruction}
          onSubmit={submitEdit}
          placeholder={selection ? "Make the headline bolder…" : "Select an element first"}
          disabled={!selection || isEditing}
          submitLabel={isEditing ? "Applying…" : "Apply"}
          rows={3}
          extra={
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={imageIntent}
                onChange={(e) => setImageIntent(e.target.checked)}
              />
              Generate image
            </label>
          }
        />

        {editResult && <p className="edit-status">{editResult}</p>}
        {editError && <p className="edit-error">{editError}</p>}

        <hr className="hairline" />

        <GateStrip runId={id} refreshToken={gateRefreshToken} />
      </aside>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";

interface TokenInfo {
  name: string;
  semanticName: string;
  value: string;
  category: string;
  usageScope: string[];
  affectedEditIds: string[];
  editable: boolean;
}

interface TokenResponse {
  tokens: TokenInfo[];
  canRevert: boolean;
}

export function TokenControls({ runId, onMutationComplete, onPreview }: { runId: string; onMutationComplete: () => void; onPreview: (token: string, value: string) => void }) {
  const [data, setData] = useState<TokenResponse | null>(null);
  const [selectedName, setSelectedName] = useState("");
  const [value, setValue] = useState("");
  const [preview, setPreview] = useState<{ token: TokenInfo; value: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const response = await fetch(`/api/tokens?runId=${encodeURIComponent(runId)}`, { cache: "no-store" });
      const next = (await response.json()) as TokenResponse | { error: string };
      if (!response.ok || "error" in next) throw new Error("error" in next ? next.error : "token inspection failed");
      setData(next);
      setSelectedName((current) => current || next.tokens.find((token) => token.editable)?.name || "");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "token inspection failed");
    }
  }

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/tokens?runId=${encodeURIComponent(runId)}`, { cache: "no-store" })
      .then(async (response) => {
        const next = (await response.json()) as TokenResponse | { error: string };
        if (!response.ok || "error" in next) throw new Error("error" in next ? next.error : "token inspection failed");
        if (!cancelled) {
          const first = next.tokens.find((token) => token.editable) ?? next.tokens[0];
          setData(next);
          setSelectedName(first?.name ?? "");
          setValue(first?.value ?? "");
        }
      })
      .catch((loadError: unknown) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "token inspection failed");
      });
    return () => { cancelled = true; };
  }, [runId]);
  const selected = useMemo(() => data?.tokens.find((token) => token.name === selectedName) ?? null, [data, selectedName]);

  async function act(action: "preview" | "apply" | "revert") {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action === "revert" ? { action, runId } : { action, runId, token: selectedName, value }),
      });
      const result = await response.json();
      if (!response.ok || result.error) throw new Error(result.error || "token mutation failed");
      if (action === "preview") {
        setPreview({ token: result.token, value: result.value });
        onPreview(result.token.name, result.value);
      }
      else {
        setData({ tokens: result.tokens, canRevert: result.canRevert });
        setPreview(null);
        onMutationComplete();
      }
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "token mutation failed");
    } finally {
      setPending(false);
    }
  }

  if (error && !data) return <div className="workbench-state workbench-state--error" role="alert"><strong>Token inspection failed</strong><p>{error}</p><button type="button" onClick={() => void load()}>Retry</button></div>;
  if (!data) return <div className="workbench-state workbench-state--loading" role="status"><strong>Loading tokens</strong><p>Reading the portable semantic token sheet.</p></div>;
  if (!data.tokens.length) return <div className="workbench-state workbench-state--empty" role="status"><strong>No semantic tokens</strong><p>This site has no inspectable custom properties.</p></div>;

  return <div className="token-controls">
    <label className="workbench-field"><span>Semantic token</span><select value={selectedName} onChange={(event) => { const next = data.tokens.find((token) => token.name === event.target.value); setSelectedName(event.target.value); setValue(next?.value ?? ""); setPreview(null); }}>{data.tokens.map((token) => <option key={token.name} value={token.name}>{token.semanticName} · {token.category}</option>)}</select></label>
    {selected && <>
      <div className="token-scope"><strong>{selected.name}</strong><span>{selected.editable ? "Editable" : "Derived / read-only"}</span><p>Usage scope: {selected.usageScope.length ? selected.usageScope.join(", ") : "declared but unused"}</p><p>Affected elements: {selected.affectedEditIds.length ? selected.affectedEditIds.join(", ") : "none directly addressable"}</p></div>
      <label className="workbench-field"><span>Validated value</span><input value={value} disabled={!selected.editable} onChange={(event) => { setValue(event.target.value); setPreview(null); }} /></label>
      {preview && <div className="token-preview" role="status"><strong>Preview ready</strong><p>{preview.token.name}: {preview.token.value} → {preview.value}</p><p>{preview.token.affectedEditIds.length} affected editable element(s). Apply persists through blocking gates.</p></div>}
      <div className="token-actions"><button type="button" disabled={pending || !selected.editable} onClick={() => void act("preview")}>Preview change</button><button type="button" disabled={pending || !preview} onClick={() => void act("apply")}>Apply token</button><button type="button" disabled={pending || !data.canRevert} onClick={() => void act("revert")}>Revert last token</button></div>
    </>}
    {error && <p className="edit-error" role="alert">{error}</p>}
  </div>;
}

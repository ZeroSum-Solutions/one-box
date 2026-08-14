import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createReferoFetch,
  PersistentReferoOAuthProvider,
  referoCredentialsAvailable,
} from "./referoAuth";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))
  );
});

async function oauthStore(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "one-box-refero-oauth-"));
  roots.push(root);
  return path.join(root, "oauth", "refero.json");
}

describe("persistent Refero OAuth", () => {
  it("persists refreshable OAuth state with private file permissions", async () => {
    const store = await oauthStore();
    const provider = new PersistentReferoOAuthProvider(
      "http://127.0.0.1:3000/api/refero/callback",
      store
    );
    await provider.saveClientInformation({
      client_id: "client-id",
      client_secret: "client-secret",
    });
    await provider.saveTokens({
      access_token: "access-token",
      refresh_token: "refresh-token",
      token_type: "Bearer",
    });
    await provider.saveCodeVerifier("code-verifier");
    const state = await provider.state();

    const reloaded = new PersistentReferoOAuthProvider(
      "http://127.0.0.1:3000/api/refero/callback",
      store
    );
    await expect(reloaded.tokens()).resolves.toMatchObject({
      refresh_token: "refresh-token",
    });
    await expect(reloaded.codeVerifier()).resolves.toBe("code-verifier");
    await expect(reloaded.state()).resolves.toBe(state);
    await expect(reloaded.verifyState(state)).resolves.toBeUndefined();
    expect(referoCredentialsAvailable(store)).toBe(true);
    expect((await fs.stat(store)).mode & 0o777).toBe(0o600);
  });

  it("removes invalid tokens without deleting registered client metadata", async () => {
    const store = await oauthStore();
    const provider = new PersistentReferoOAuthProvider(
      "http://127.0.0.1:3000/api/refero/callback",
      store
    );
    await provider.saveClientInformation({ client_id: "client-id" });
    await provider.saveTokens({
      access_token: "access-token",
      token_type: "Bearer",
    });
    await provider.invalidateCredentials("tokens");

    await expect(provider.tokens()).resolves.toBeUndefined();
    await expect(provider.clientInformation()).resolves.toMatchObject({
      client_id: "client-id",
    });
    expect(referoCredentialsAvailable(store)).toBe(false);
  });

  it("rejects a callback whose OAuth state was not issued locally", async () => {
    const store = await oauthStore();
    const provider = new PersistentReferoOAuthProvider(
      "http://127.0.0.1:3000/api/refero/callback",
      store
    );
    await provider.state();
    await expect(provider.verifyState("attacker-state")).rejects.toThrow(
      /did not match/
    );
  });

  it("preserves concurrent OAuth registration, tokens, and verifier writes", async () => {
    const store = await oauthStore();
    const provider = new PersistentReferoOAuthProvider(
      "http://127.0.0.1:3000/api/refero/callback",
      store
    );
    await Promise.all([
      provider.saveClientInformation({ client_id: "client-id" }),
      provider.saveTokens({ access_token: "access-token", token_type: "Bearer" }),
      provider.saveCodeVerifier("code-verifier"),
    ]);

    await expect(provider.clientInformation()).resolves.toMatchObject({
      client_id: "client-id",
    });
    await expect(provider.tokens()).resolves.toMatchObject({
      access_token: "access-token",
    });
    await expect(provider.codeVerifier()).resolves.toBe("code-verifier");
  });

  it("requires a refresh token before preflight treats OAuth as durable", async () => {
    const store = await oauthStore();
    const provider = new PersistentReferoOAuthProvider(
      "http://127.0.0.1:3000/api/refero/callback",
      store
    );
    await provider.saveTokens({ access_token: "access-token", token_type: "Bearer" });
    expect(referoCredentialsAvailable(store)).toBe(false);
    await provider.saveTokens({
      access_token: "access-token",
      refresh_token: "refresh-token",
      token_type: "Bearer",
    });
    expect(referoCredentialsAvailable(store)).toBe(true);
  });

  it("does not let a stale refresh failure delete newer rotated tokens", async () => {
    const store = await oauthStore();
    const staleProvider = new PersistentReferoOAuthProvider(
      "http://127.0.0.1:3000/api/refero/callback",
      store
    );
    const freshProvider = new PersistentReferoOAuthProvider(
      "http://127.0.0.1:3000/api/refero/callback",
      store
    );
    await staleProvider.saveTokens({
      access_token: "old-access",
      refresh_token: "old-refresh",
      token_type: "Bearer",
    });
    await staleProvider.tokens();
    await freshProvider.saveTokens({
      access_token: "new-access",
      refresh_token: "new-refresh",
      token_type: "Bearer",
    });
    await staleProvider.invalidateCredentials("tokens");

    await expect(freshProvider.tokens()).resolves.toMatchObject({
      access_token: "new-access",
      refresh_token: "new-refresh",
    });
  });

  it("restricts OAuth and MCP requests to Refero HTTPS hosts without redirects", async () => {
    const underlyingFetch = vi.fn(async () => new Response(null, { status: 204 }));
    const safeFetch = createReferoFetch(underlyingFetch);

    await expect(safeFetch("http://127.0.0.1/internal")).rejects.toThrow(
      /outside the Refero HTTPS boundary/
    );
    await expect(safeFetch("https://refero.design.example/steal")).rejects.toThrow(
      /outside the Refero HTTPS boundary/
    );
    expect(underlyingFetch).not.toHaveBeenCalled();

    await safeFetch("https://api.refero.design/mcp", { method: "POST" });
    expect(underlyingFetch).toHaveBeenCalledWith(
      "https://api.refero.design/mcp",
      expect.objectContaining({ method: "POST", redirect: "error" })
    );
  });

  it("invalidates client registration and tokens when the callback URL changes", async () => {
    const store = await oauthStore();
    const original = new PersistentReferoOAuthProvider(
      "http://127.0.0.1:3000/api/refero/callback",
      store
    );
    await original.saveClientInformation({ client_id: "old-client" });
    await original.saveTokens({
      access_token: "old-access",
      refresh_token: "old-refresh",
      token_type: "Bearer",
    });
    const moved = new PersistentReferoOAuthProvider(
      "http://127.0.0.1:3001/api/refero/callback",
      store
    );

    await expect(moved.clientInformation()).resolves.toBeUndefined();
    await expect(moved.tokens()).resolves.toBeUndefined();
    expect(
      referoCredentialsAvailable(
        store,
        "http://127.0.0.1:3001/api/refero/callback"
      )
    ).toBe(false);
  });
});

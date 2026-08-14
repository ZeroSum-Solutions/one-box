import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  UnauthorizedError,
  type OAuthClientProvider,
  type OAuthDiscoveryState,
} from "@modelcontextprotocol/sdk/client/auth.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type {
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import type { FetchLike } from "@modelcontextprotocol/sdk/shared/transport.js";
import { withFileLock } from "./fileLock";

export const REFERO_MCP_URL = "https://api.refero.design/mcp";

export function referoCallbackUrl(): string {
  return new URL(
    "/api/refero/callback",
    process.env.ONEBOX_BASE_URL ?? "http://127.0.0.1:3000"
  ).toString();
}

interface PersistedReferoOAuthState {
  callbackUrl?: string;
  clientInformation?: OAuthClientInformationMixed;
  tokens?: OAuthTokens;
  codeVerifier?: string;
  state?: string;
  discoveryState?: OAuthDiscoveryState;
}

const stateWriteQueues = new Map<string, Promise<void>>();

function isReferoHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return normalized === "refero.design" || normalized.endsWith(".refero.design");
}

export function isReferoHttpsUrl(value: string | URL): boolean {
  try {
    const url = value instanceof URL ? value : new URL(value);
    return (
      url.protocol === "https:" &&
      isReferoHost(url.hostname) &&
      (url.port === "" || url.port === "443")
    );
  } catch {
    return false;
  }
}

export function createReferoFetch(fetchImpl: FetchLike = globalThis.fetch): FetchLike {
  return async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    if (!isReferoHttpsUrl(url)) {
      throw new Error("Refero OAuth attempted a request outside the Refero HTTPS boundary.");
    }
    return fetchImpl(input, { ...init, redirect: "error" });
  };
}

export const referoFetch = createReferoFetch();

export function referoOAuthStorePath(): string {
  return (
    process.env.ONE_BOX_REFERO_OAUTH_STORE ??
    path.join(process.cwd(), ".one-box", "oauth", "refero.json")
  );
}

function readPersistedStateSync(storePath: string): PersistedReferoOAuthState {
  if (!existsSync(storePath)) return {};
  try {
    return JSON.parse(readFileSync(storePath, "utf8")) as PersistedReferoOAuthState;
  } catch {
    return {};
  }
}

async function readPersistedState(
  storePath: string
): Promise<PersistedReferoOAuthState> {
  try {
    return JSON.parse(await fs.readFile(storePath, "utf8")) as PersistedReferoOAuthState;
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return {};
    }
    throw error;
  }
}

async function writePersistedState(
  storePath: string,
  state: PersistedReferoOAuthState
): Promise<void> {
  await fs.mkdir(path.dirname(storePath), { recursive: true, mode: 0o700 });
  const temporary = `${storePath}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(state, null, 2), {
    encoding: "utf8",
    mode: 0o600,
    flag: "wx",
  });
  await fs.rename(temporary, storePath);
  await fs.chmod(storePath, 0o600);
}

async function updatePersistedState(
  storePath: string,
  update: (current: PersistedReferoOAuthState) => PersistedReferoOAuthState
): Promise<void> {
  const previous = stateWriteQueues.get(storePath) ?? Promise.resolve();
  const queued = previous.catch(() => undefined).then(async () => {
    await withFileLock(
      `${storePath}.lock`,
      async () => {
        const current = await readPersistedState(storePath);
        await writePersistedState(storePath, update(current));
      },
      { maxWaitMs: 5_000, orphanAgeMs: 30_000 }
    );
  });
  stateWriteQueues.set(storePath, queued);
  try {
    await queued;
  } finally {
    if (stateWriteQueues.get(storePath) === queued) {
      stateWriteQueues.delete(storePath);
    }
  }
}

export class PersistentReferoOAuthProvider implements OAuthClientProvider {
  private authorizationUrl: URL | null = null;
  private readonly callbackUrl: string;
  private readonly storePath: string;
  private lastClientInformationRead: OAuthClientInformationMixed | undefined;
  private lastTokensRead: OAuthTokens | undefined;

  constructor(callbackUrl: string, storePath = referoOAuthStorePath()) {
    this.callbackUrl = callbackUrl;
    this.storePath = storePath;
  }

  get redirectUrl(): string {
    return this.callbackUrl;
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: "ONE BOX",
      redirect_uris: [this.callbackUrl],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "client_secret_post",
    };
  }

  async clientInformation(): Promise<OAuthClientInformationMixed | undefined> {
    const persisted = await readPersistedState(this.storePath);
    if (persisted.callbackUrl !== this.callbackUrl) {
      await updatePersistedState(this.storePath, (current) => ({
        callbackUrl: this.callbackUrl,
        discoveryState: current.discoveryState,
      }));
      this.lastClientInformationRead = undefined;
      this.lastTokensRead = undefined;
      return undefined;
    }
    const clientInformation = persisted.clientInformation;
    this.lastClientInformationRead = clientInformation;
    return clientInformation;
  }

  async saveClientInformation(
    clientInformation: OAuthClientInformationMixed
  ): Promise<void> {
    await this.update({ callbackUrl: this.callbackUrl, clientInformation });
    this.lastClientInformationRead = clientInformation;
  }

  async tokens(): Promise<OAuthTokens | undefined> {
    const tokens = (await readPersistedState(this.storePath)).tokens;
    this.lastTokensRead = tokens;
    return tokens;
  }

  async saveTokens(tokens: OAuthTokens): Promise<void> {
    await this.update({ callbackUrl: this.callbackUrl, tokens });
    this.lastTokensRead = tokens;
  }

  redirectToAuthorization(authorizationUrl: URL): void {
    this.authorizationUrl = authorizationUrl;
  }

  pendingAuthorizationUrl(): URL | null {
    return this.authorizationUrl;
  }

  async saveCodeVerifier(codeVerifier: string): Promise<void> {
    await this.update({ codeVerifier });
  }

  async codeVerifier(): Promise<string> {
    const codeVerifier = (await readPersistedState(this.storePath)).codeVerifier;
    if (!codeVerifier) throw new Error("Refero OAuth code verifier is missing.");
    return codeVerifier;
  }

  async state(): Promise<string> {
    const persisted = await readPersistedState(this.storePath);
    if (persisted.state) return persisted.state;
    const state = randomBytes(24).toString("base64url");
    await this.update({ state });
    return state;
  }

  async verifyState(receivedState: string): Promise<void> {
    const expected = (await readPersistedState(this.storePath)).state;
    if (!expected || receivedState !== expected) {
      throw new Error("Refero OAuth state did not match the local authorization request.");
    }
  }

  async saveDiscoveryState(discoveryState: OAuthDiscoveryState): Promise<void> {
    await this.update({ discoveryState });
  }

  async discoveryState(): Promise<OAuthDiscoveryState | undefined> {
    return (await readPersistedState(this.storePath)).discoveryState;
  }

  async invalidateCredentials(
    scope: "all" | "client" | "tokens" | "verifier" | "discovery"
  ): Promise<void> {
    await updatePersistedState(this.storePath, (state) => {
      if (
        (scope === "all" || scope === "client") &&
        (!this.lastClientInformationRead ||
          isDeepStrictEqual(state.clientInformation, this.lastClientInformationRead))
      ) {
        delete state.clientInformation;
      }
      if (
        (scope === "all" || scope === "tokens") &&
        (!this.lastTokensRead || isDeepStrictEqual(state.tokens, this.lastTokensRead))
      ) {
        delete state.tokens;
      }
      if (scope === "all" || scope === "verifier") {
        delete state.codeVerifier;
        delete state.state;
      }
      if (scope === "all" || scope === "discovery") delete state.discoveryState;
      return state;
    });
  }

  private async update(
    patch: Partial<PersistedReferoOAuthState>
  ): Promise<void> {
    await updatePersistedState(this.storePath, (current) => ({
      ...current,
      ...patch,
    }));
  }
}

export function referoCredentialsAvailable(
  storePath = referoOAuthStorePath(),
  callbackUrl = referoCallbackUrl()
): boolean {
  if (Boolean(process.env.REFERO_MCP_TOKEN)) return true;
  const persisted = readPersistedStateSync(storePath);
  const tokens = persisted.tokens;
  return Boolean(
    persisted.callbackUrl === callbackUrl &&
    tokens &&
      typeof tokens.access_token === "string" &&
      tokens.access_token.length > 0 &&
      typeof tokens.refresh_token === "string" &&
      tokens.refresh_token.length > 0
  );
}

export async function beginReferoAuthorization(callbackUrl: string): Promise<{
  connected: boolean;
  authorizationUrl?: string;
}> {
  const provider = new PersistentReferoOAuthProvider(callbackUrl);
  const client = new Client({ name: "one-box", version: "0.1.0" });
  const transport = new StreamableHTTPClientTransport(new URL(REFERO_MCP_URL), {
    authProvider: provider,
    fetch: referoFetch,
  });
  try {
    await client.connect(transport);
    await client.close();
    return { connected: true };
  } catch (error) {
    await client.close().catch(() => undefined);
    const authorizationUrl = provider.pendingAuthorizationUrl();
    if (error instanceof UnauthorizedError && authorizationUrl) {
      return { connected: false, authorizationUrl: authorizationUrl.toString() };
    }
    throw error;
  }
}

export async function completeReferoAuthorization(
  callbackUrl: string,
  code: string,
  state: string
): Promise<void> {
  const provider = new PersistentReferoOAuthProvider(callbackUrl);
  await provider.verifyState(state);
  const transport = new StreamableHTTPClientTransport(new URL(REFERO_MCP_URL), {
    authProvider: provider,
    fetch: referoFetch,
  });
  await transport.finishAuth(code);
  await provider.invalidateCredentials("verifier");
  const client = new Client({ name: "one-box", version: "0.1.0" });
  await client.connect(transport);
  await client.close();
}

const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

function isLoopback(url: URL): boolean {
  return LOOPBACK_HOSTNAMES.has(url.hostname.toLowerCase());
}

function effectiveRequestUrl(request: Request, requestUrl: URL): URL | null {
  const host = request.headers.get("host");
  if (!host || host !== host.trim()) return null;

  try {
    const effectiveUrl = new URL(`${requestUrl.protocol}//${host}`);
    if (!isLoopback(effectiveUrl)) return null;
    if (effectiveUrl.host.toLowerCase() !== host.toLowerCase()) return null;
    if (effectiveUrl.port !== requestUrl.port) return null;
    return effectiveUrl;
  } catch {
    return null;
  }
}

/** Local workspace APIs accept exact same-origin browser requests or the
 * optional bearer token for non-browser clients. Mutations are valid only on
 * an explicit loopback URL, and browser mutations require Fetch Metadata. */
export function isLocalApiAuthorized(request: Request): boolean {
  let requestUrl: URL;
  try {
    requestUrl = new URL(request.url);
  } catch {
    return false;
  }
  if (!isLoopback(requestUrl)) return false;
  const effectiveUrl = effectiveRequestUrl(request, requestUrl);
  if (!effectiveUrl) return false;
  const origin = request.headers.get("origin");
  if (request.method === "GET" || request.method === "HEAD") {
    return !origin || origin === effectiveUrl.origin;
  }
  const configuredToken = process.env.ONE_BOX_API_TOKEN;
  if (
    configuredToken &&
    request.headers.get("authorization") === `Bearer ${configuredToken}`
  ) {
    return true;
  }
  if (!origin || origin !== effectiveUrl.origin) return false;
  if (request.headers.get("sec-fetch-site") !== "same-origin") return false;
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  return (
    contentType.startsWith("application/json") ||
    contentType.startsWith("multipart/form-data")
  );
}

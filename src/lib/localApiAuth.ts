const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

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
  if (!LOOPBACK_HOSTNAMES.has(requestUrl.hostname.toLowerCase())) return false;
  const origin = request.headers.get("origin");
  if (request.method === "GET" || request.method === "HEAD") {
    return !origin || origin === requestUrl.origin;
  }
  const configuredToken = process.env.ONE_BOX_API_TOKEN;
  if (
    configuredToken &&
    request.headers.get("authorization") === `Bearer ${configuredToken}`
  ) {
    return true;
  }
  if (!origin || origin !== requestUrl.origin) return false;
  if (request.headers.get("sec-fetch-site") !== "same-origin") return false;
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  return (
    contentType.startsWith("application/json") ||
    contentType.startsWith("multipart/form-data")
  );
}

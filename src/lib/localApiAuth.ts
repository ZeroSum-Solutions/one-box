/** Local workspace APIs accept exact same-origin browser requests or the
 * optional bearer token for non-browser clients. Mutations never accept a
 * missing Origin without that capability. */
export function isLocalApiAuthorized(request: Request): boolean {
  const configuredToken = process.env.ONE_BOX_API_TOKEN;
  if (
    configuredToken &&
    request.headers.get("authorization") === `Bearer ${configuredToken}`
  ) {
    return true;
  }
  const origin = request.headers.get("origin");
  if (request.method === "GET" || request.method === "HEAD") {
    return !origin || origin === new URL(request.url).origin;
  }
  if (!origin || origin !== new URL(request.url).origin) return false;
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin") return false;
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  return (
    contentType.startsWith("application/json") ||
    contentType.startsWith("multipart/form-data")
  );
}

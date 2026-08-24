import { isLocalApiAuthorized } from "../../../../lib/localApiAuth";
import {
  beginReferoAuthorization,
  isReferoHttpsUrl,
  referoCallbackUrl,
} from "../../../../lib/referoAuth";

interface ReferoConnectDependencies {
  beginReferoAuthorization: typeof beginReferoAuthorization;
}

export async function handleReferoConnect(
  request: Request,
  dependencies: ReferoConnectDependencies = { beginReferoAuthorization }
) {
  if (!isLocalApiAuthorized(request)) {
    return Response.json({ error: "Unauthorized local API request" }, { status: 403 });
  }
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    return Response.json({ error: "Unauthorized local API request" }, { status: 403 });
  }
  const callbackUrl = referoCallbackUrl();
  const result = await dependencies.beginReferoAuthorization(callbackUrl);
  if (result.connected) {
    return Response.redirect(new URL("/?refero=connected", request.url));
  }
  if (!result.authorizationUrl) {
    return Response.json({ error: "Refero authorization did not start." }, { status: 502 });
  }
  const authorizationUrl = new URL(result.authorizationUrl);
  if (!isReferoHttpsUrl(authorizationUrl)) {
    return Response.json({ error: "Refero returned an unsafe authorization URL." }, { status: 502 });
  }
  return Response.redirect(authorizationUrl);
}

export async function GET(request: Request) {
  return handleReferoConnect(request);
}

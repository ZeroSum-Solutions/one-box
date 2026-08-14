import { isLocalApiAuthorized } from "../../../../lib/localApiAuth";
import {
  completeReferoAuthorization,
  referoCallbackUrl,
} from "../../../../lib/referoAuth";

interface ReferoCallbackDependencies {
  completeReferoAuthorization: typeof completeReferoAuthorization;
}

export async function handleReferoCallback(
  request: Request,
  dependencies: ReferoCallbackDependencies = { completeReferoAuthorization }
) {
  if (!isLocalApiAuthorized(request)) {
    return Response.json({ error: "Unauthorized local API request" }, { status: 403 });
  }
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state || code.length > 4096 || state.length > 512) {
    return Response.json({ error: "Invalid Refero OAuth callback." }, { status: 400 });
  }
  try {
    await dependencies.completeReferoAuthorization(
      referoCallbackUrl(),
      code,
      state
    );
  } catch {
    return Response.json({ error: "Refero authorization could not be completed." }, { status: 400 });
  }
  return Response.redirect(new URL("/?refero=connected", request.url));
}

export async function GET(request: Request) {
  return handleReferoCallback(request);
}

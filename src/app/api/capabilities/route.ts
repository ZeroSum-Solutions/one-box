import { isLocalApiAuthorized } from "../../../lib/localApiAuth";
import { referoCredentialsAvailable } from "../../../lib/referoAuth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isLocalApiAuthorized(request)) {
    return Response.json(
      { error: "Unauthorized local API request" },
      { status: 403 }
    );
  }

  return Response.json(
    {
      referoDesignEvidence: referoCredentialsAvailable(),
      referoConnectUrl: "/api/refero/connect",
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

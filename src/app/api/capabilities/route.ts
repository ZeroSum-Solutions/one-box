import { isLocalApiAuthorized } from "../../../lib/localApiAuth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isLocalApiAuthorized(request)) {
    return Response.json(
      { error: "Unauthorized local API request" },
      { status: 403 }
    );
  }

  return Response.json(
    { referoDesignEvidence: Boolean(process.env.REFERO_MCP_TOKEN) },
    { headers: { "Cache-Control": "no-store" } }
  );
}

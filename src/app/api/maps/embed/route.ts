import {
  MapEmbedQuerySchema,
  googleEmbedDestination,
  mapsEmbedConfigured,
} from "../../../../lib/tools/mapEmbed";

const RESPONSE_HEADERS = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "origin",
  "X-Content-Type-Options": "nosniff",
};

export async function GET(request: Request): Promise<Response> {
  const parsed = MapEmbedQuerySchema.safeParse(new URL(request.url).searchParams.get("q") ?? "");
  if (!parsed.success) {
    return new Response("Invalid map query", { status: 400, headers: RESPONSE_HEADERS });
  }
  if (!mapsEmbedConfigured()) {
    return new Response("Map display is not configured", {
      status: 503,
      headers: RESPONSE_HEADERS,
    });
  }
  return new Response(null, {
    status: 307,
    headers: {
      ...RESPONSE_HEADERS,
      Location: googleEmbedDestination(parsed.data).toString(),
    },
  });
}

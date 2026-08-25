import { z } from "zod";

export const MapEmbedQuerySchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .refine((value) => !/[\r\n]/.test(value), "map query cannot contain line breaks");

function mapsEmbedApiKey(): string | undefined {
  return process.env.GOOGLE_MAPS_EMBED_API_KEY || undefined;
}

export function mapsEmbedConfigured(): boolean {
  return !!mapsEmbedApiKey();
}

export function embedSearchQuery(query: string): string | undefined {
  if (!mapsEmbedConfigured()) return undefined;
  return MapEmbedQuerySchema.parse(query);
}

export function googleEmbedDestination(query: string): URL {
  const key = mapsEmbedApiKey();
  if (!key) throw new Error("Google Maps Embed is not configured");
  const destination = new URL("https://www.google.com/maps/embed/v1/search");
  destination.searchParams.set("key", key);
  destination.searchParams.set("q", MapEmbedQuerySchema.parse(query));
  return destination;
}

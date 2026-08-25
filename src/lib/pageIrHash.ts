import { createHash } from "node:crypto";
import { PageIRV1Schema, type PageIRV1 } from "./contracts";

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, nested]) => nested !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, nested]) => `${JSON.stringify(key)}:${canonicalJson(nested)}`)
      .join(",")}}`;
  }
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new Error("Page IR contains a non-canonical value");
  return encoded;
}

/** Sole authority for hashing a validated Page IR v1 value. */
export function pageIrSha256(pageIr: PageIRV1): string {
  const validated = PageIRV1Schema.safeParse(pageIr);
  if (!validated.success) throw new Error("Cannot hash an invalid Page IR artifact");
  return createHash("sha256")
    .update(new TextEncoder().encode(canonicalJson(validated.data)))
    .digest("hex");
}

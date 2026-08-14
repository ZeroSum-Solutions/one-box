/**
 * Serves built sites and research artifacts. Hardened per audit E20/E21:
 * path-sanitized, CSP'd, refuses incomplete builds, injects the editor
 * overlay only when ?edit=1. The preview iframe loads this WITHOUT
 * allow-same-origin, so the document runs in an opaque origin.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { sitePaths } from "../../../../../lib/runstate";
import { ARTIFACTS, SiteManifestSchema } from "../../../../../lib/contracts";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".md": "text/plain; charset=utf-8",
};

// Both modes stay opaque because the iframe never receives allow-same-origin.
// View permits only normal in-frame behavior against self-hosted assets;
// Edit additionally removes form submission at CSP level and its injected
// overlay consumes navigation/form events before generated handlers run.
const VIEW_CSP =
  "default-src 'none'; img-src 'self' data: blob:; media-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'none'";
const EDIT_CSP = VIEW_CSP.replace(
  "connect-src 'self'",
  "connect-src 'none'",
).replace("form-action 'self'", "form-action 'none'");

function safePathSegment(raw: string): string | null {
  let decoded = raw;
  for (let pass = 0; pass < 3; pass += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      return null;
    }
  }
  if (
    !decoded ||
    decoded === "." ||
    decoded === ".." ||
    /[\\/\0]/.test(decoded)
  )
    return null;
  return decoded;
}

function redactPublicIntake(data: Buffer): Buffer {
  try {
    const intake = JSON.parse(data.toString("utf8")) as Record<string, unknown>;
    if (Array.isArray(intake.uploads)) {
      // Uploaded-file metadata belongs to the local evidence workspace. The
      // public artifact keeps non-upload intake fields, but publishes neither
      // claimed paths/hashes nor client file names, media types, or identifiers.
      intake.uploads = [];
    }
    return Buffer.from(JSON.stringify(intake, null, 2));
  } catch {
    return Buffer.from("{}");
  }
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string; path: string[] }> },
) {
  const { id, path: rawParts } = await ctx.params;
  if (!/^[a-z0-9_-]{4,40}$/i.test(id))
    return new Response("bad id", { status: 400 });
  const parts = rawParts.map(safePathSegment);
  if (parts.some((part) => part === null))
    return new Response("forbidden", { status: 403 });
  const safeParts = parts as string[];

  const roots = sitePaths(id);
  // research/* serves scan artifacts to the chat UI; gates.json and DESIGN.md
  // live at the run root; everything else is the built site.
  const isResearch = safeParts[0] === "research";
  const isEvidence =
    safeParts[0] === "evidence" &&
    safeParts.length >= 3 &&
    ["versions", "approved", "qa"].includes(safeParts[1]);
  // Every stage artifact is openable from its chat card — the run is only
  // auditable if you can read what each stage actually produced. Explicit
  // allowlist, never a prefix match: sites/<id>/site/ stays behind the
  // build-complete check below.
  const isRootArtifact =
    safeParts.length === 1 &&
    [
      "gates.json",
      "DESIGN.md",
      "run.json",
      ARTIFACTS.intake,
      ARTIFACTS.scan,
      ARTIFACTS.lock,
      ARTIFACTS.tokens,
      ARTIFACTS.skeleton,
      ARTIFACTS.copy,
    ].includes(safeParts[0]);
  const base = isResearch
    ? roots.research
    : isRootArtifact || isEvidence
      ? roots.root
      : roots.site;
  const relParts = isResearch ? safeParts.slice(1) : safeParts;
  if (relParts.length === 0) return new Response("not found", { status: 404 });
  const rel = relParts.join("/");
  const resolved = path.resolve(base, rel);
  if (
    !resolved.startsWith(path.resolve(base) + path.sep) &&
    resolved !== path.resolve(base)
  ) {
    return new Response("forbidden", { status: 403 });
  }

  if (!isResearch && !isRootArtifact && !isEvidence) {
    // Refuse to serve an incomplete build (atomic completion marker).
    try {
      const manifest = SiteManifestSchema.parse(
        JSON.parse(
          await fs.readFile(path.join(roots.site, "manifest.json"), "utf8"),
        ),
      );
      if (!manifest.complete)
        return new Response("build incomplete", { status: 409 });
    } catch {
      if (!rel.endsWith("gates.json")) {
        return new Response("no build", { status: 404 });
      }
    }
  }

  let data: Buffer;
  try {
    const [realBase, realFile] = await Promise.all([
      fs.realpath(base),
      fs.realpath(resolved),
    ]);
    if (
      realFile !== realBase &&
      !realFile.startsWith(`${realBase}${path.sep}`)
    ) {
      return new Response("forbidden", { status: 403 });
    }
    data = await fs.readFile(realFile);
  } catch {
    return new Response("not found", { status: 404 });
  }

  if (isRootArtifact && safeParts[0] === ARTIFACTS.intake) {
    data = redactPublicIntake(data);
  }

  const ext = path.extname(resolved).toLowerCase();
  const type = MIME[ext] ?? "application/octet-stream";

  // Inject the selector overlay into HTML when editing.
  if (ext === ".html" && new URL(req.url).searchParams.get("edit") === "1") {
    let overlay: string;
    try {
      overlay = await fs.readFile(
        path.join(process.cwd(), "public", "overlay.js"),
        "utf8",
      );
    } catch {
      return new Response("editor overlay unavailable", { status: 503 });
    }
    if (!overlay.trim())
      return new Response("editor overlay unavailable", { status: 503 });
    const source = data.toString("utf8");
    const headOpen = /<head(?:\s[^>]*)?>/i;
    if (!headOpen.test(source))
      return new Response("editor overlay injection point missing", {
        status: 409,
      });
    const html = source.replace(
      headOpen,
      (match) => `${match}<script>${overlay}</script>`,
    );
    return new Response(html, {
      headers: { "Content-Type": type, "Content-Security-Policy": EDIT_CSP },
    });
  }

  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": type,
      "Content-Security-Policy": ext === ".html" ? VIEW_CSP : "",
      "Cache-Control": "no-store",
    },
  });
}

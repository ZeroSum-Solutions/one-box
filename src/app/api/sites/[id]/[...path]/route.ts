/**
 * Serves built sites and research artifacts. Hardened per audit E20/E21:
 * path-sanitized, CSP'd, refuses incomplete builds, injects the editor
 * overlay only when ?edit=1. The preview iframe loads this WITHOUT
 * allow-same-origin, so the document runs in an opaque origin.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { sitePaths } from "@/lib/runstate";
import { SiteManifestSchema } from "@/lib/contracts";

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

const CSP =
  "default-src 'none'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self'; connect-src 'none'; form-action 'none'; base-uri 'none'";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string; path: string[] }> }
) {
  const { id, path: parts } = await ctx.params;
  if (!/^[a-z0-9_-]{4,40}$/i.test(id)) return new Response("bad id", { status: 400 });

  const roots = sitePaths(id);
  // research/* serves scan artifacts to the chat UI; gates.json and DESIGN.md
  // live at the run root; everything else is the built site.
  const isResearch = parts[0] === "research";
  const isRootArtifact =
    parts.length === 1 && ["gates.json", "DESIGN.md", "run.json"].includes(parts[0]);
  const base = isResearch || isRootArtifact ? roots.root : roots.site;
  const rel = parts.join("/");
  const resolved = path.resolve(base, rel);
  if (!resolved.startsWith(path.resolve(base) + path.sep) && resolved !== path.resolve(base)) {
    return new Response("forbidden", { status: 403 });
  }

  if (!isResearch && !isRootArtifact) {
    // Refuse to serve an incomplete build (atomic completion marker).
    try {
      const manifest = SiteManifestSchema.parse(
        JSON.parse(await fs.readFile(path.join(roots.site, "manifest.json"), "utf8"))
      );
      if (!manifest.complete) return new Response("build incomplete", { status: 409 });
    } catch {
      if (!rel.endsWith("gates.json")) {
        return new Response("no build", { status: 404 });
      }
    }
  }

  let data: Buffer;
  try {
    data = await fs.readFile(resolved);
  } catch {
    return new Response("not found", { status: 404 });
  }

  const ext = path.extname(resolved).toLowerCase();
  const type = MIME[ext] ?? "application/octet-stream";

  // Inject the selector overlay into HTML when editing.
  if (ext === ".html" && new URL(req.url).searchParams.get("edit") === "1") {
    const overlay = await fs
      .readFile(path.join(process.cwd(), "public", "overlay.js"), "utf8")
      .catch(() => "");
    const html = data
      .toString("utf8")
      .replace("</body>", `<script>${overlay}</script></body>`);
    return new Response(html, {
      headers: { "Content-Type": type, "Content-Security-Policy": CSP.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'") },
    });
  }

  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": type,
      "Content-Security-Policy": ext === ".html" ? CSP : "",
      "Cache-Control": "no-store",
    },
  });
}

#!/usr/bin/env python3
"""Tailnet access shim for the one-box local API.

WHY THIS EXISTS
one-box refuses any request whose URL and Host are not loopback (see
docs/security/local-api-threat-model.md). That check is a CSRF and
LAN-exposure defence for a single-user workspace normally reached only over
loopback.

Reaching the workspace from a phone needs a different arrangement, and the
threat model names the sanctioned one: "deployment on a shared or public
interface requires mandatory authentication at the reverse proxy or
application layer." Tailscale Serve is that reverse proxy. It terminates
inside the tailnet, admits only devices already enrolled and authorised by
the tailnet owner, and stamps every request with the caller's verified
identity.

This shim therefore SWAPS one authority for another; it does not remove one:

  phone --wireguard--> tailscale serve   (tailnet only, verified identity)
        --> this shim on 127.0.0.1       (identity check, Host/Origin rewrite)
        --> one-box on 127.0.0.1:3400

WHAT IT DELIBERATELY GIVES UP
Requests arriving this way no longer prove same-origin via one-box's own
Origin and Sec-Fetch-Site checks, because the shim rewrites those to satisfy
the loopback rule. The replacement authority is Tailscale device enrolment
plus the identity header below. If that trade is not acceptable for a given
machine, do not run this shim.

GUARDRAILS
  - Binds to 127.0.0.1 only; it is never itself reachable off-box.
  - Refuses anything without the expected Tailscale identity header, so it is
    not a general-purpose loopback bypass for other local processes.
  - Strips client-supplied Tailscale-* headers before forwarding, so a caller
    cannot forge identity through it.
  - Never enables Funnel. The serve binding MUST stay tailnet-only; verify
    with `tailscale serve status` that the entry does not say "Funnel on".

USAGE
  python3 scripts/tailnet-proxy.py
  tailscale serve --bg --https=3443 http://127.0.0.1:3401
  # phone: https://<machine>.<tailnet>.ts.net:3443
TEARDOWN
  tailscale serve --https=3443 off     # then stop this process
"""
from __future__ import annotations

import http.client
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

LISTEN_PORT = int(os.environ.get("TAILNET_PROXY_PORT", "3401"))
UPSTREAM_HOST = "127.0.0.1"
UPSTREAM_PORT = int(os.environ.get("ONE_BOX_PORT", "3400"))
# The authority one-box must see: a loopback name whose port matches the port
# it actually serves on, or its own check rejects the request.
UPSTREAM_AUTHORITY = f"localhost:{UPSTREAM_PORT}"
ALLOWED_USER = os.environ.get("TAILNET_PROXY_USER", "wiggdevin@github")

# RFC 7230 hop-by-hop headers describe a single connection and are not relayed.
HOP_BY_HOP = {
    "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
    "te", "trailers", "transfer-encoding", "upgrade",
}


class Shim(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "one-box-tailnet-shim"

    def log_message(self, fmt: str, *args) -> None:
        sys.stderr.write("%s %s\n" % (self.address_string(), fmt % args))

    def deny(self, code: int, why: str) -> None:
        body = why.encode()
        self.send_response(code)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def handle_any(self) -> None:
        # Only Tailscale Serve can legitimately set this. Without it we are not
        # looking at an authenticated tailnet request, so we must not lend it
        # loopback authority.
        who = self.headers.get("Tailscale-User-Login")
        if who != ALLOWED_USER:
            self.deny(403, "This shim serves authenticated tailnet requests only.\n")
            return

        body = None
        length = self.headers.get("Content-Length")
        if length:
            body = self.rfile.read(int(length))
        elif self.headers.get("Transfer-Encoding", "").lower() == "chunked":
            self.deny(411, "Chunked request bodies are not supported.\n")
            return

        forwarded = {}
        for key, value in self.headers.items():
            low = key.lower()
            # Drop caller-supplied Tailscale-* so identity cannot be forged
            # through this shim; Serve's own copies were read above.
            if low in HOP_BY_HOP or low.startswith("tailscale-"):
                continue
            forwarded[key] = value

        # The rewrites that let one-box's authority check pass: the request now
        # genuinely originates from this loopback process.
        forwarded["Host"] = UPSTREAM_AUTHORITY
        if "Origin" in forwarded:
            forwarded["Origin"] = f"http://{UPSTREAM_AUTHORITY}"
        if "Referer" in forwarded:
            forwarded["Referer"] = f"http://{UPSTREAM_AUTHORITY}/"
        # Recorded for the upstream log only, never treated as an auth claim.
        forwarded["X-Tailnet-User"] = who
        # Identity encoding keeps server-sent events from being buffered by a
        # compressor somewhere in the chain.
        forwarded["Accept-Encoding"] = "identity"

        upstream = http.client.HTTPConnection(UPSTREAM_HOST, UPSTREAM_PORT, timeout=900)
        try:
            upstream.request(self.command, self.path, body=body, headers=forwarded)
            response = upstream.getresponse()
        except Exception as cause:
            upstream.close()
            self.deny(502, f"one-box did not answer on {UPSTREAM_AUTHORITY}: {cause}\n")
            return

        self.send_response(response.status)
        for key, value in response.getheaders():
            low = key.lower()
            # Length is dropped because the reply is relayed as chunks.
            if low in HOP_BY_HOP or low == "content-length":
                continue
            self.send_header(key, value)
        self.send_header("Transfer-Encoding", "chunked")
        self.end_headers()

        if self.command == "HEAD":
            self.wfile.write(b"0\r\n\r\n")
            upstream.close()
            return

        try:
            while True:
                # read1 returns whatever has arrived instead of blocking for a
                # full buffer. A pipeline run holds its SSE stream open for
                # minutes, so read() here would deliver the whole run at once.
                chunk = response.read1(65536)
                if not chunk:
                    break
                self.wfile.write(b"%X\r\n" % len(chunk) + chunk + b"\r\n")
                self.wfile.flush()
            self.wfile.write(b"0\r\n\r\n")
            self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            pass  # viewer navigated away mid-stream
        finally:
            upstream.close()

    do_GET = do_POST = do_PUT = do_PATCH = do_DELETE = do_HEAD = do_OPTIONS = handle_any


def main() -> None:
    server = ThreadingHTTPServer((UPSTREAM_HOST, LISTEN_PORT), Shim)
    server.daemon_threads = True
    print(
        f"tailnet shim: 127.0.0.1:{LISTEN_PORT} -> {UPSTREAM_AUTHORITY} "
        f"(identity {ALLOWED_USER})",
        flush=True,
    )
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.shutdown()


if __name__ == "__main__":
    main()

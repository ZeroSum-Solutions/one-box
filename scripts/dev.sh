#!/bin/zsh
# Start the one-box dev server with credentials sourced from ZS Vault lanes.
# No secrets live in this repo; this script resolves them only for the process.
set -e

# Optional first argument sets the dev-server port; dev:next reads $PORT.
# Passing it explicitly (rather than letting Next default) keeps the
# fail-if-busy behaviour — a silent retry onto another port is how you end up
# auditing the wrong site.
if [[ -n "${1:-}" ]]; then
  [[ "$1" == <-> ]] || { print -u2 "one-box: port must be numeric, got '$1'"; exit 1; }
  export PORT="$1"
fi

if [[ -z "${OPENROUTER_API_KEY:-}" ]]; then
  export OPENROUTER_API_KEY="$(zsvault get openrouter_api_key 2>/dev/null || true)"
fi
if [[ -z "${FIRECRAWL_API_KEY:-}" ]]; then
  export FIRECRAWL_API_KEY="$(zsvault get firecrawl_api_key 2>/dev/null || true)"
fi
: "${OPENROUTER_API_KEY:?missing; run zsvault unlock before starting OneBox}"
[[ -n "${FIRECRAWL_API_KEY:-}" ]] ||
  print -u2 "one-box: FIRECRAWL_API_KEY missing; paid fallback is unavailable."

exec npm run dev:next

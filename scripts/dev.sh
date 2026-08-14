#!/bin/zsh
# Start the one-box dev server with credentials sourced from ZS Vault lanes.
# No secrets live in this repo; this script resolves them only for the process.
set -e

if [[ -z "${OPENROUTER_API_KEY:-}" ]]; then
  export OPENROUTER_API_KEY="$(zsvault get openrouter_api_key 2>/dev/null || true)"
fi
if [[ -z "${FIRECRAWL_API_KEY:-}" ]]; then
  export FIRECRAWL_API_KEY="$(zsvault get firecrawl_api_key 2>/dev/null || true)"
fi
if [[ -z "${REFERO_MCP_TOKEN:-}" ]]; then
  export REFERO_MCP_TOKEN="$(zsvault get refero_mcp_token 2>/dev/null || true)"
fi

: "${OPENROUTER_API_KEY:?missing; run zsvault unlock before starting OneBox}"
[[ -n "${FIRECRAWL_API_KEY:-}" ]] ||
  print -u2 "one-box: FIRECRAWL_API_KEY missing; paid fallback is unavailable."
[[ -n "${REFERO_MCP_TOKEN:-}" ]] ||
  print -u2 "one-box: REFERO_MCP_TOKEN missing; turn off Design-reference evidence in Research settings."

exec npm run dev

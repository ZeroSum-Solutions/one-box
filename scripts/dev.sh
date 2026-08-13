#!/bin/zsh
# Start the one-box dev server with credentials sourced from ZS Vault lanes.
# No secrets live in this repo — this script pulls them at launch.
set -e
source ~/.config/zs-api-keys.env
export REFERO_MCP_TOKEN="${REFERO_MCP_TOKEN:-$(zsvault get refero_mcp_token)}"
: "${OPENROUTER_API_KEY:?missing}" "${FIRECRAWL_API_KEY:?missing}" "${REFERO_MCP_TOKEN:?missing}"
exec npm run dev

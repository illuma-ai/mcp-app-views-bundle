#!/usr/bin/env bash
# Exports the MCP-views host changes (overlay files, seam list, docs, config fragment) into one folder.
# Usage: tools/export-host-changes.sh [out-dir]   (default: ../m365-setup/export/host-<date>)
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="${1:-../m365-setup/export/host-$(date +%Y%m%d)}"
mkdir -p "$OUT"
# 1. overlay files named in the transfer manifest (table rows with a backticked path)
grep -oE '^\| `[^`]+`' docs/mcp-ui/TRANSFER.md | sed -E 's/^\| `//; s/`$//' | grep -v '\*\*' | while read -r p; do
  if [ -e "$p" ]; then mkdir -p "$OUT/$(dirname "$p")"; cp -r "$p" "$OUT/$p"; fi
done
# 2. docs, ledger, config
mkdir -p "$OUT/docs"; cp -r docs/mcp-ui "$OUT/docs/"; cp docs/mcp-apps.md "$OUT/docs/" 2>/dev/null || true
cp CHANGES.md "$OUT/"
node -e "
const y=require('js-yaml'),fs=require('fs');const c=y.load(fs.readFileSync('librechat.yaml','utf8'));
const frag={endpoints:{agents:{toolApproval:c.endpoints.agents.toolApproval},all:{maxToolResultChars:c.endpoints.all?.maxToolResultChars}},mcpSettings:c.mcpSettings,mcpAppSandbox:c.mcpAppSandbox,mcpServers:{m365:c.mcpServers.m365,ado:c.mcpServers.ado}};
fs.writeFileSync('docs/mcp-ui/config-fragment.yaml','# Config fragment for the MCP views work (generated '+new Date().toISOString().slice(0,10)+')\n'+y.dump(frag,{lineWidth:120}));"
cp docs/mcp-ui/config-fragment.yaml "$OUT/docs/mcp-ui/"
# 3. seams: every upstream file carrying an ext marker for the MCP-views slugs, as a unified diff against the upstream line
for slug in mcp-app-honor-tool-approval mcp-app-view-eviction mcp-oauth-tokens-disabled mcp-app-host-name ptc-policy-bypass tool-budget-deferral context-overflow-last-resort-exports context-compact-retry; do
  grep -rln "ext:begin $slug" --include=*.ts --include=*.tsx --include=*.js --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.git api client/src packages 2>/dev/null >> "$OUT/seams.txt" || true
done
sort -u -o "$OUT/seams.txt" "$OUT/seams.txt"
echo "exported to $OUT"; find "$OUT" -type f | wc -l

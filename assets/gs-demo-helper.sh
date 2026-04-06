#!/usr/bin/env bash
# Helper for demo tape: extracts session IDs from ghostshift trace
# Usage: gs-demo-helper.sh <index>   (0 = newest)
GS="node /Users/efegorkembildi/Code/ghostshift/apps/cli/src/index.js"
$GS trace --json 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[int('$1')]['id'])"

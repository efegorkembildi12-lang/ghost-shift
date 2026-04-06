# Dogfood Report: v1.0.0

Date: `2026-04-06`

## Workspace

- fresh repo created under `/tmp/ghostshift-soft-launch/demo-repo`
- baseline commit created on `main`
- Ghostshift tested via local repo binary using `npm exec --prefix /Users/efegorkembildi/Code/ghostshift`

## Flow Executed

- `ghostshift init`
- `ghostshift run`
- `ghostshift blame --line`
- `ghostshift explain`
- `ghostshift replay`
- `ghostshift compare`
- `ghostshift pr-summary`
- `ghostshift-preview --help`

## Result

All CLI steps completed successfully on a fresh repo.

Observed outputs looked launch-worthy:

- `blame --line` returned the session id, semantic labels, and linked decision
- `explain` returned semantic and provenance summaries
- `replay` created a linked session with verification delta
- `compare` highlighted replay relation, semantic changes, and provenance context
- `pr-summary` produced usable Markdown without extra editing

## Noted Constraints

- direct browser launch was not manually exercised in this environment because sandboxed commands cannot bind a local port here
- preview load is already covered by automated server smoke tests in `apps/server/test/server.test.js`

## Launch Blockers Found

None from the manual CLI dogfood pass.

## Non-Blocking Notes

- actual announcement screenshots/GIFs still need to be captured in a normal desktop/browser environment before public posting

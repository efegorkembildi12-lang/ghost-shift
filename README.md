# Ghostshift

Ghostshift is an open-source CLI and self-hostable platform that records, explains, replays, and verifies AI-made work.

The wedge is simple: `git` tells you what changed, but it does not tell you why an agent made the change, what task it belonged to, or how to replay it later. Ghostshift is built to become that missing audit trail.

## Current Scope

This repository is the first serious scaffold for the product:

- local-first npm monorepo
- open data model for AI work traces
- working CLI with line-aware blame primitives
- file-backed session storage for early development
- governance docs and RFC process for OSS-first growth

The current release now covers capture, inspection, semantic line-aware blame, decision-linked blame, semantic explain/compare, verification, replay, compare, plugin metadata, stable patch-aware exports, a self-host preview server, a minimal web UI, and a GitHub-ready PR summary flow.

## Product Principles

- Open source by default
- Local-first before cloud
- Self-hostable from the start
- Open schema and exportable history
- Plugin-native integrations

## Monorepo Layout

```text
apps/
  cli/        npm CLI entrypoint
  server/     self-host preview HTTP server
  ui/         static preview web UI
packages/
  core/       task/session orchestration
  plugins/    stable plugin runtime and official adapters
  spec/       open data shapes and schema versioning
  storage/    local storage adapters
docs/
  architecture/
  rfcs/
  spec/
examples/
  local-repo/
```

## CLI Prototype

The current CLI exposes the first set of commands:

```bash
node apps/cli/src/index.js init
node apps/cli/src/index.js run "refactor auth middleware" --files src/auth.ts,src/session.ts
node apps/cli/src/index.js trace
node apps/cli/src/index.js blame src/auth.ts
node apps/cli/src/index.js blame src/auth.ts --line 42
node apps/cli/src/index.js explain gs_...
node apps/cli/src/index.js verify gs_...
node apps/cli/src/index.js replay gs_...
node apps/cli/src/index.js compare gs_old gs_new
node apps/cli/src/index.js export
node apps/cli/src/index.js doctor
```

What each command does today:

- `init`: creates `.ghostshift/` and local config
- `run`: records a task-oriented session and optional file touches
- `run`: when executed in a git repo, automatically captures unified diffs for changed files
- `trace`: lists captured sessions
- `blame`: finds sessions that touched a file
- `blame --line`: resolves the latest session that changed the requested current line and reports semantic patch context when available
- `explain`: summarizes why a session happened, what it touched, and what kind of patch it contains
- `verify`: shows verification state for a recorded session
- `replay`: creates a new session linked to an earlier session
- `compare`: shows what changed between two sessions, including check-level verification diffs and semantic patch differences
- `export`: emits a stable patch-aware payload with raw sessions, derived reports, and plugin export sections
- `doctor`: validates config and storage directories

`run` also accepts the first structured metadata inputs:

```bash
node apps/cli/src/index.js run "refactor auth middleware" \
  --files src/auth.ts,src/session.ts \
  --decision "rationale:split auth checks from session loading" \
  --decision "risk:avoid changing token parsing in this pass" \
  --verify "lint:passed" \
  --verify "unit-tests:pending:needs fixture coverage"
```

## Current Goal

Ship a credible open-source `v1.0` for:

1. session capture
2. trace inspection
3. line-aware and decision-aware blame
4. explain, verify, replay, and compare flows
5. stable open export format
6. stable plugin API and official adapters
7. self-host preview server and UI
8. GitHub-ready PR summaries
9. contributor-friendly architecture and release docs

## Open-Source Operating Model

Ghostshift is intended to stay fully open source. The license split is now locked:

- product packages are `AGPL-3.0-only`
- spec and future SDK packages are `Apache-2.0`

The rationale is documented in [docs/rfcs/0001-monorepo-and-oss.md](/Users/efegorkembildi/Code/ghostshift/docs/rfcs/0001-monorepo-and-oss.md).

## v1.0 Highlights

- stable CLI and export surface
- self-host preview server and static UI
- plugin API `1.0.0`
- GitHub PR summary command and workflow example
- quickstart, migration notes, and release checklist

## Development

This release does not require external dependencies beyond Node and npm.

```bash
npm test
node apps/cli/src/index.js --help
node apps/server/src/index.js --help
npm exec ghostshift -- help
npm exec ghostshift-preview -- --help
```

See [docs/quickstart.md](/Users/efegorkembildi/Code/ghostshift/docs/quickstart.md) for the fastest path from install to first trace.

## Plugin Runtime

Ghostshift now ships a first stable plugin API with four hook types:

- `captureSession`
- `enrichPatch`
- `reportVerification`
- `consumeExport`

The built-in adapters are:

- `git`
- `shell`

The default config enables both adapters:

```json
{
  "plugins": {
    "enabled": ["git", "shell"]
  }
}
```

You can also load a local plugin module by relative path:

```json
{
  "plugins": {
    "enabled": ["git", "./ghostshift-plugin.mjs"]
  }
}
```

## Stable Export

`ghostshift export` now emits:

- raw `sessions`
- derived `reports` keyed by session id
- plugin catalog and plugin-produced export sections
- explicit `exportVersion` and capability metadata

Derived reports now include:

- `verificationSummary`
- `patchSummary`
- `semanticSummary`
- `provenanceSummary`
- `replayLineage`

See [docs/spec/export-format.md](/Users/efegorkembildi/Code/ghostshift/docs/spec/export-format.md) and [docs/architecture/plugins.md](/Users/efegorkembildi/Code/ghostshift/docs/architecture/plugins.md) for the exact shape and adapter contract.

## PR Summary Flow

Generate a Markdown summary from the latest two sessions:

```bash
npm exec ghostshift -- pr-summary
```

Or write it to a file for PR automation:

```bash
npm exec ghostshift -- pr-summary gs_base gs_head --output ghostshift-pr-summary.md
```

See [examples/github-action/README.md](/Users/efegorkembildi/Code/ghostshift/examples/github-action/README.md) for the GitHub Actions example.

## Self-Host Preview

Start the preview server inside a workspace that already contains `.ghostshift/`:

```bash
npm run preview
```

Or point it at another workspace:

```bash
GHOSTSHIFT_WORKSPACE=/absolute/path/to/repo node apps/server/src/index.js
```

The preview exposes:

- session list and session detail
- explain report view
- compare report view
- line-aware blame lookup
- export payload import/sync

See [docs/architecture/self-host-preview.md](/Users/efegorkembildi/Code/ghostshift/docs/architecture/self-host-preview.md) for the API surface and workflow.

## Release Docs

- [Quickstart](/Users/efegorkembildi/Code/ghostshift/docs/quickstart.md)
- [Migrations And Compatibility](/Users/efegorkembildi/Code/ghostshift/docs/migrations.md)
- [Release Checklist](/Users/efegorkembildi/Code/ghostshift/docs/release-checklist.md)
- [Release Notes v1.0.0](/Users/efegorkembildi/Code/ghostshift/docs/release-notes-v1.0.0.md)
- [Launch Messaging](/Users/efegorkembildi/Code/ghostshift/docs/launch-messaging.md)
- [Demo Script](/Users/efegorkembildi/Code/ghostshift/docs/demo-script.md)
- [Dogfood Report v1.0.0](/Users/efegorkembildi/Code/ghostshift/docs/dogfood-report-v1.0.0.md)
- [Launch Assets Manifest](/Users/efegorkembildi/Code/ghostshift/docs/assets-manifest.md)

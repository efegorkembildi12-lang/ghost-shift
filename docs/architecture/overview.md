# Architecture Overview

Ghostshift starts with a deliberately simple shape:

- `apps/cli` is the user-facing entrypoint
- `apps/server` serves the self-host preview API and static UI
- `apps/ui` contains the static preview frontend
- `packages/core` owns project operations and domain logic
- `packages/plugins` owns the stable plugin runtime and built-in adapters
- `packages/spec` defines the shared data model
- `packages/storage` handles persistence

## Why This Split

The product should eventually support multiple frontends, adapters, and runtimes. Keeping the data model and storage boundaries separate from the CLI makes that growth path much cleaner.

## Current Runtime Model

- storage is local filesystem JSON
- config lives in `.ghostshift/config.json`
- sessions are written to `.ghostshift/sessions/*.json`
- sessions can carry decision and verification records
- sessions can also carry per-file unified diffs and parsed hunk metadata
- replay sessions link back to their source run
- exports are deterministic JSON snapshots
- semantic patch summaries are derived at read time from stored patch hunks
- decision provenance is derived at read time from decisions, files, and patch semantics
- sessions can carry stable plugin metadata under `session.plugins`
- patches can carry adapter metadata under `patch.metadata`
- exports now carry raw sessions plus derived reports and plugin export sections
- self-host preview reads local workspace data directly through the same core APIs

## Future Evolution

- default SQLite adapter
- optional remote sync
- replay workers
- web UI and self-hosted server

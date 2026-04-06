# Self-Host Preview

Ghostshift `v0.9` ships a minimal self-host preview with:

- a local HTTP server in `apps/server`
- a static browser UI in `apps/ui`

## Runtime Model

- the server points at one workspace directory
- it reads `.ghostshift` data through the same core APIs as the CLI
- the UI is static and fetches JSON from `/api/*`
- import/sync works by posting a `ghostshift export` payload to `/api/import`

## HTTP API

- `GET /api/health`
- `GET /api/sessions`
- `GET /api/sessions/:id`
- `GET /api/explain/:id`
- `GET /api/compare?left=<id>&right=<id>`
- `GET /api/blame?file=<path>&line=<n>`
- `GET /api/export`
- `POST /api/import`

## Preview Goals

- make current CLI data explorable without adding a database or hosted service
- prove that Ghostshift reports can support a browser frontend
- keep the full experience local-first and self-hostable

## Out Of Scope

- auth
- multi-user collaboration
- background workers
- remote storage
- tenant isolation

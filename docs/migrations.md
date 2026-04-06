# Migrations And Compatibility

## v1.0 Compatibility Contract

Ghostshift `v1.0.0` freezes these public surfaces:

- CLI commands: `init`, `run`, `trace`, `blame`, `explain`, `verify`, `replay`, `compare`, `pr-summary`, `export`, `doctor`
- export payload `exportVersion: 1.0.0`
- plugin API `1.0.0`
- stored session schema `1.0.0`

## Additive Changes After v1

After `v1.0.0`, supported changes are additive only:

- new optional fields in stored session/config JSON
- new optional fields in export payloads
- new optional plugin hooks
- new UI routes and read-only server endpoints

## Breaking Changes

Any future breaking change must:

- bump `schemaVersion` or `exportVersion`
- ship migration notes here
- include a compatibility test
- document fallback behavior for old traces

## Current Migration State

No stored-data migration is required from `v0.9` to `v1.0`.

- session provenance remains derived at read time
- semantic summaries remain derived at read time
- self-host preview reads the same `.ghostshift` layout already used by the CLI

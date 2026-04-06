# RFC 0001: Monorepo And OSS Licensing Strategy

## Status

Accepted

## Context

Ghostshift is intended to remain fully open source while still being defensible as a long-term company and community project.

Two goals need to coexist:

- make the core product easy to inspect, self-host, and contribute to
- avoid burying the data model and ecosystem in a single proprietary implementation

## Decision

This scaffold adopts the following repository structure:

- `apps/` for runnable products
- `packages/` for reusable modules
- `docs/` for architecture, specs, and RFCs

The accepted licensing split is:

- `apps/*`, `packages/core`, `packages/storage`, and future hosted product code: `AGPL-3.0-only`
- `packages/spec` and future SDK packages: `Apache-2.0`

## Why

- the product remains open source and self-hostable
- the spec can become a genuine shared standard
- downstream integrators get a permissive path for schema and SDK adoption
- the main product is less exposed to silent hosted forks

## Consequences

- each package should declare its own license explicitly
- the repository root should document the split clearly
- official license texts should live in the repository

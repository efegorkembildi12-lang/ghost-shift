# Ghostshift v1.0.0

## Git blame for AI work, fully open source.

Ghostshift is the open-source audit trail for AI-made work.

Git shows what changed. Ghostshift shows why an AI agent changed it, how to
replay it, and how to inspect it later.

## What Shipped In v1.0.0

- line-aware blame with semantic patch context
- decision-linked provenance in `blame --line`, `explain`, `compare`, and `export`
- stable export format and plugin API `1.0.0`
- official built-in `git` and `shell` adapters
- self-host preview server and static UI
- Markdown PR summary generation with `ghostshift pr-summary`
- GitHub Actions example for PR comment workflows

## Fastest Getting Started Flow

```bash
npm install
npm exec ghostshift -- init
npm exec ghostshift -- run "refactor auth middleware" --decision "rationale:split auth checks"
npm exec ghostshift -- explain gs_...
npm exec ghostshift -- blame src/auth.ts --line 42
npm exec ghostshift -- pr-summary
npm exec ghostshift-preview
```

## Docs

- [Quickstart](/Users/efegorkembildi/Code/ghostshift/docs/quickstart.md)
- [Self-Host Preview](/Users/efegorkembildi/Code/ghostshift/docs/architecture/self-host-preview.md)
- [Plugin Runtime](/Users/efegorkembildi/Code/ghostshift/docs/architecture/plugins.md)
- [Export Format](/Users/efegorkembildi/Code/ghostshift/docs/spec/export-format.md)
- [Migrations And Compatibility](/Users/efegorkembildi/Code/ghostshift/docs/migrations.md)

## What This Is Not Yet

- not a hosted SaaS
- not a multi-user cloud control plane
- not a GitHub app with deep native permissions
- not a full enterprise governance product

This release is intentionally local-first, self-hostable, and open-source from
day one.

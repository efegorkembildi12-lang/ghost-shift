# Plugin Runtime

Ghostshift `v0.7` ships a first stable plugin runtime in `packages/plugins`.

## Hook Surface

Built-in and third-party plugins target four hooks:

- `captureSession(context)`
- `enrichPatch(context)`
- `reportVerification(context)`
- `consumeExport(context)`

## Behavior

- `captureSession` returns session metadata stored under `session.plugins[pluginId]`
- `enrichPatch` returns patch metadata stored under `patch.metadata[pluginId]`
- `reportVerification` returns human-readable report lines for `verify`
- `consumeExport` returns adapter-specific aggregate data for `export`

## Built-In Adapters

- `git`
  - captures branch, commit, dirty paths, and patch summary
  - enriches each patch with added/removed line counts and hunk count
  - contributes git aggregate data to export output
- `shell`
  - captures current shell executable, platform, and CLI invocation
  - contributes runtime context to verification output and export output

## Authoring A Plugin

The stable contract is intentionally simple: plugins are pure async objects with
one or more of the four hook functions above. A minimal plugin can be written as
an object that returns JSON-safe data from those hooks.

Config can enable built-ins by id or load a local plugin module by relative path:

```json
{
  "plugins": {
    "enabled": ["git", "./ghostshift-plugin.mjs"]
  }
}
```

See [examples/plugin-skeleton/README.md](/Users/efegorkembildi/Code/ghostshift/examples/plugin-skeleton/README.md) for a starting point.

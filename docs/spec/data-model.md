# Data Model

The early Ghostshift data model is intentionally compact.

## Config

```json
{
  "schemaVersion": "0.9.0",
  "projectRoot": "/absolute/path",
  "storage": {
    "driver": "fs",
    "baseDir": ".ghostshift"
  },
  "plugins": {
    "enabled": ["git", "shell"]
  }
}
```

## Session

```json
{
  "id": "gs_20260405T120000Z_ab12cd",
  "schemaVersion": "0.9.0",
  "task": "refactor auth middleware",
  "status": "captured",
  "createdAt": "2026-04-05T12:00:00.000Z",
  "actor": {
    "type": "human-triggered",
    "name": "local-cli"
  },
  "workspace": {
    "cwd": "/absolute/path",
    "gitBranch": "main",
    "gitCommit": "abc123"
  },
  "files": [
    "src/auth.ts"
  ],
  "notes": [],
  "plugins": {
    "git": {
      "branch": "main",
      "commit": "abc123",
      "dirtyPaths": ["src/auth.ts"],
      "patchSummary": {
        "totalFiles": 1,
        "totalHunks": 1,
        "byKind": {
          "added": 0,
          "modified": 1,
          "deleted": 0
        }
      }
    },
    "shell": {
      "executable": "/bin/zsh",
      "name": "zsh",
      "platform": "darwin",
      "invocation": "apps/cli/src/index.js run refactor auth middleware --json"
    }
  },
  "patches": [
    {
      "path": "src/auth.ts",
      "kind": "modified",
      "diff": "diff --git a/src/auth.ts b/src/auth.ts\n@@ -1,3 +1,4 @@\n ...",
      "metadata": {
        "git": {
          "hunks": 1,
          "addedLines": 1,
          "removedLines": 1
        }
      },
      "hunks": [
        {
          "header": "@@ -10,3 +10,4 @@",
          "oldStart": 10,
          "oldLines": 3,
          "newStart": 10,
          "newLines": 4,
          "lines": [
            " context line",
            "-old line",
            "+new line"
          ]
        }
      ]
    }
  ],
  "replay": {
    "sourceSessionId": "gs_20260405T110000Z_aa11bb",
    "reason": "rerun with narrowed file scope",
    "replayedAt": "2026-04-05T12:00:05.000Z"
  },
  "verification": [
    {
      "id": "ver_20260405T120100Z_fg45hi",
      "name": "lint",
      "status": "passed",
      "details": null,
      "recordedAt": "2026-04-05T12:01:00.000Z"
    }
  ],
  "decisions": [
    {
      "id": "dec_20260405T120030Z_bc34de",
      "type": "rationale",
      "summary": "split auth checks from session loading",
      "recordedAt": "2026-04-05T12:00:30.000Z"
    }
  ]
}
```

## Verification Statuses

- `passed`
- `failed`
- `pending`
- `running`
- `skipped`

## Replay

Replay is modeled as an optional link from a new session back to a previous one.

```json
{
  "sourceSessionId": "gs_20260405T110000Z_aa11bb",
  "reason": "rerun with narrowed file scope",
  "replayedAt": "2026-04-05T12:00:05.000Z"
}
```

Replay lineage is derived from these links at read time; it does not require a
separate stored object.

## Patches

Patch capture is optional and is currently populated automatically when `run`
executes inside a git repository with a valid `HEAD`. Line-aware blame uses this
data when present and falls back gracefully when it is not.

Semantic summaries are intentionally not stored in session JSON. They are
derived from `patches` when `explain` and `compare` reports are generated.

Plugin-derived session metadata is stored under `session.plugins`, and
plugin-derived patch metadata is stored under `patch.metadata`.

Decision provenance is still derived at read time. It is exposed in `explain`,
`compare`, `blame --line`, and `export` reports without mutating stored session
JSON.

## Planned Additions

- artifact references
- policy and approval events

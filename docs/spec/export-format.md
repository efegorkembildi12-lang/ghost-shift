# Export Format

`ghostshift export` emits a stable, patch-aware JSON payload.

## Top-Level Shape

```json
{
  "schemaVersion": "0.9.0",
  "exportVersion": "1.0.0",
  "exportedAt": "2026-04-05T12:00:00.000Z",
  "generatedBy": {
    "name": "ghostshift",
    "version": "0.9.0"
  },
  "capabilities": [
    "patch-aware-export",
    "line-aware-blame",
    "semantic-summary",
    "decision-provenance",
    "replay-lineage",
    "plugin-metadata"
  ],
  "plugins": {
    "apiVersion": "1.0.0",
    "enabled": [
      {
        "id": "git",
        "displayName": "Git Adapter",
        "hookNames": ["captureSession", "enrichPatch", "reportVerification", "consumeExport"]
      }
    ],
    "exports": {
      "git": {
        "sessionsWithGitContext": 1,
        "branches": ["main"],
        "totalPatchedFiles": 1
      }
    }
  },
  "sessions": [],
  "reports": {
    "gs_...": {
      "verificationSummary": {},
      "patchSummary": {},
      "semanticSummary": {},
      "provenanceSummary": {},
      "replayLineage": []
    }
  }
}
```

## Stability Rules

- `sessions` stays the source of truth for raw trace data.
- `reports` contains derived, read-time summaries keyed by session id.
- `plugins.exports` contains adapter-produced aggregate export sections.
- `exportVersion` changes only for breaking export payload changes.
- `schemaVersion` tracks stored config/session shapes.

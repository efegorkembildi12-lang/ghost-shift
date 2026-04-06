# Decision Provenance

Ghostshift `v0.8` derives a lightweight provenance layer from existing session
data. Stored sessions are not mutated; provenance is computed at read time.

## What It Links

- session decisions
- touched files
- captured patches
- semantic patch summaries

## Heuristics

Decision linking is deterministic and local-first:

- match file paths, basenames, and filename stems mentioned in decision text
- match semantic labels to decision keywords such as `rename`, `guard`, `risk`, or `signature`
- fall back only for single-decision single-file sessions

## Where It Appears

- `blame --line` as `relatedDecisions`
- `explain` as `provenanceSummary`
- `compare` as `provenanceChanges`
- `export` derived reports as `reports[sessionId].provenanceSummary`

## Why It Exists

This is the first step from “who changed this line?” toward “which decision made
this line exist?”. Later milestones can add explicit decision-to-hunk recording,
but the current heuristic layer already makes the CLI substantially more useful
without changing the stored schema.

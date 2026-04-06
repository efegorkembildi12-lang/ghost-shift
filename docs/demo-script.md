# Demo Script

## Canonical Setup

Use a tiny repo with one file: `auth.ts`.

Initial content:

```ts
const token = read();
```

Changed content:

```ts
const parsedToken = read();
```

## 90-Second Demo

1. `ghostshift init`
2. `ghostshift run "rename auth token" --decision "rationale:rename auth variable for clarity" --verify "lint:passed"`
3. `ghostshift blame auth.ts --line 1`
4. `ghostshift explain <session-id>`
5. `ghostshift replay <session-id> --reason "validate replay flow" --verify "unit-tests:pending:demo replay"`
6. `ghostshift compare <base> <head>`
7. `ghostshift pr-summary`
8. `ghostshift-preview`

## Narration

- `Git can show the diff, but Ghostshift can tell me which session changed this line.`
- `I can inspect the semantic type of the change and the decision that went with it.`
- `I can replay the work, compare the replay, and produce a PR summary from the same trace data.`
- `If I want a browser view, I can self-host the preview UI without a cloud dependency.`

## Must-Capture Assets

- terminal output for `ghostshift blame auth.ts --line 1`
- terminal output for `ghostshift pr-summary`
- preview UI session detail screen

## Full Demo

Use the same flow as the short demo, but pause briefly on:

- semantic + provenance explanation in `explain`
- replay lineage and verification delta in `compare`
- open export / self-host angle in the preview UI

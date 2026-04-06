# Local Repo Example

This example is the smallest manual Ghostshift walkthrough.

## Setup

```bash
mkdir demo-repo
cd demo-repo
git init
git branch -m main
git config user.name "Ghostshift Demo"
git config user.email "demo@example.com"

printf 'const token = read();\n' > auth.ts
git add .
git commit -m "baseline"
```

## Initialize Ghostshift

```bash
npm exec --prefix /Users/efegorkembildi/Code/ghostshift ghostshift -- init
```

## Record One Change

```bash
printf 'const parsedToken = read();\n' > auth.ts
npm exec --prefix /Users/efegorkembildi/Code/ghostshift ghostshift -- run \
  "rename auth token" \
  --decision "rationale:rename auth variable for clarity" \
  --verify "lint:passed"
```

## Inspect It

```bash
npm exec --prefix /Users/efegorkembildi/Code/ghostshift ghostshift -- trace
npm exec --prefix /Users/efegorkembildi/Code/ghostshift ghostshift -- blame auth.ts --line 1
npm exec --prefix /Users/efegorkembildi/Code/ghostshift ghostshift -- explain <session-id>
```

## Replay And Compare

```bash
npm exec --prefix /Users/efegorkembildi/Code/ghostshift ghostshift -- replay <session-id> \
  --reason "validate replay flow" \
  --verify "unit-tests:pending:demo replay"

npm exec --prefix /Users/efegorkembildi/Code/ghostshift ghostshift -- compare <base-session-id> <replay-session-id>
npm exec --prefix /Users/efegorkembildi/Code/ghostshift ghostshift -- pr-summary
```

## Open The Preview

```bash
GHOSTSHIFT_WORKSPACE=$PWD node /Users/efegorkembildi/Code/ghostshift/apps/server/src/index.js
```

See also:

- [Quickstart](/Users/efegorkembildi/Code/ghostshift/docs/quickstart.md)
- [Demo Script](/Users/efegorkembildi/Code/ghostshift/docs/demo-script.md)
- [Dogfood Report](/Users/efegorkembildi/Code/ghostshift/docs/dogfood-report-v1.0.0.md)

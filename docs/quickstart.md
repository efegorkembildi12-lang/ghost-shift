# Quickstart

## 1. Install

Clone the repo, then install dependencies:

```bash
npm install
```

You can now run the local binaries with either:

```bash
npm exec ghostshift -- help
npm exec ghostshift-preview -- --help
```

## 2. Initialize A Workspace

Inside a repo you want to track:

```bash
npm exec ghostshift -- init
```

## 3. Record AI Work

```bash
npm exec ghostshift -- run "refactor auth middleware" \
  --decision "rationale:split auth checks from session loading" \
  --verify "lint:passed"
```

## 4. Inspect The Trace

```bash
npm exec ghostshift -- trace
npm exec ghostshift -- explain gs_...
npm exec ghostshift -- blame src/auth.ts --line 42
```

## 5. Compare And Export

```bash
npm exec ghostshift -- replay gs_...
npm exec ghostshift -- compare gs_base gs_head
npm exec ghostshift -- export --output .ghostshift/exports/latest.json
```

## 6. Generate A PR Summary

```bash
npm exec ghostshift -- pr-summary
```

Or compare two explicit sessions:

```bash
npm exec ghostshift -- pr-summary gs_base gs_head --output ghostshift-pr-summary.md
```

## 7. Launch The Preview UI

```bash
npm exec ghostshift-preview
```

Then open the reported local URL in your browser.

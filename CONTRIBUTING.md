# Contributing

Thanks for helping build Ghostshift.

## How To Contribute

- Open an issue or draft RFC for changes that affect architecture, schemas, or public APIs.
- Send focused pull requests for contained improvements.
- Keep changes local-first unless the feature clearly needs a networked component.
- Prefer additive changes to the trace schema wherever possible.

## Development Workflow

```bash
npm test
node apps/cli/src/index.js --help
```

## Pull Request Expectations

- Explain the user problem first.
- Call out schema or storage implications explicitly.
- Add or update tests when behavior changes.
- Document user-facing commands and config changes.

## RFC Triggers

Please open an RFC before implementation if your change alters:

- session schema shape
- storage adapter contracts
- plugin API boundaries
- replay semantics
- licensing or governance

# Release Checklist

## Package And Versioning

- update root and workspace package versions
- verify CLI and preview server `--version`
- run `npm install` to refresh lockfile

## Product Validation

- run `npm test`
- verify `ghostshift help`
- verify `ghostshift-preview --help`
- verify `ghostshift pr-summary`
- verify self-host preview can load sessions and compare reports

## Docs

- README reflects the shipped surface
- Quickstart is current
- export format docs are current
- migration notes are current
- roadmap status is current

## Examples

- local repo example still makes sense
- plugin skeleton still matches plugin API
- GitHub Action PR summary example references current commands

## Release Artifacts

- create release tag `v1.0.0`
- include a short changelog
- include install and quickstart links
- include note that hosted/cloud features are out of scope

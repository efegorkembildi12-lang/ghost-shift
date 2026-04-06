# GitHub PR Summary Example

This example shows how to generate a Markdown PR summary from Ghostshift and
post it back to a pull request.

The workflow:

1. checks out the repo
2. installs dependencies
3. runs `ghostshift pr-summary`
4. writes the result to `ghostshift-pr-summary.md`
5. posts that Markdown as a PR comment

See `ghostshift-pr-summary.yml` in this directory.

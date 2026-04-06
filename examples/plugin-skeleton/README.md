# Plugin Skeleton

This example shows the minimum Ghostshift plugin shape for `v0.7`.

```js
export default {
  id: "example",
  displayName: "Example Adapter",
  async captureSession(context) {
    return {
      task: context.task
    };
  },
  async enrichPatch({ patch }) {
    return {
      hunks: patch.hunks.length
    };
  },
  async reportVerification({ verificationSummary }) {
    return {
      title: "Example report",
      lines: [`Overall: ${verificationSummary.overallStatus}`]
    };
  },
  async consumeExport({ sessions }) {
    return {
      sessionsObserved: sessions.length
    };
  }
};
```

The official built-in adapters live in `packages/plugins/src/index.js`.

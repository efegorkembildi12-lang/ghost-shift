import path from "node:path";

export const SCHEMA_VERSION = "1.0.0";
export const EXPORT_FORMAT_VERSION = "1.0.0";
const DECISION_TYPES = new Set(["rationale", "risk", "tradeoff", "follow-up"]);
const VERIFICATION_STATUSES = new Set(["passed", "failed", "pending", "running", "skipped"]);
const PATCH_KINDS = new Set(["added", "modified", "deleted"]);

export function createConfig(projectRoot) {
  return {
    schemaVersion: SCHEMA_VERSION,
    projectRoot,
    storage: {
      driver: "fs",
      baseDir: ".ghostshift"
    },
    plugins: {
      enabled: ["git", "shell"]
    }
  };
}

export function createSessionRecord({
  task,
  cwd,
  files = [],
  note,
  decisions = [],
  verification = [],
  patches = [],
  plugins = {},
  replay,
  gitBranch,
  gitCommit
}) {
  const normalizedPatchRecords = patches.map(createPatchRecord);
  const mergedFiles = uniqueNormalizedPaths([...files, ...normalizedPatchRecords.map((patch) => patch.path)]);

  return {
    id: createSessionId(),
    schemaVersion: SCHEMA_VERSION,
    task,
    status: "captured",
    createdAt: new Date().toISOString(),
    actor: {
      type: "human-triggered",
      name: "local-cli"
    },
    workspace: {
      cwd,
      projectName: path.basename(cwd),
      gitBranch,
      gitCommit
    },
    files: mergedFiles,
    notes: note ? [note] : [],
    plugins: normalizePluginMap(plugins),
    patches: normalizedPatchRecords,
    replay: replay ? createReplayRecord(replay) : null,
    verification: verification.map(createVerificationRecord),
    decisions: decisions.map(createDecisionRecord)
  };
}

export function summarizeVerification(verification = []) {
  const counts = {
    passed: 0,
    failed: 0,
    pending: 0,
    running: 0,
    skipped: 0
  };

  for (const check of verification) {
    const status = VERIFICATION_STATUSES.has(check.status) ? check.status : "pending";
    counts[status] += 1;
  }

  let overallStatus = "missing";
  if (counts.failed > 0) {
    overallStatus = "failed";
  } else if (counts.pending > 0 || counts.running > 0) {
    overallStatus = "pending";
  } else if (counts.passed > 0) {
    overallStatus = "passed";
  } else if (counts.skipped > 0) {
    overallStatus = "skipped";
  }

  return {
    overallStatus,
    total: verification.length,
    counts
  };
}

export function summarizePatches(patches = []) {
  const summary = {
    totalFiles: patches.length,
    totalHunks: 0,
    byKind: {
      added: 0,
      modified: 0,
      deleted: 0
    }
  };

  for (const patch of patches) {
    const kind = PATCH_KINDS.has(patch.kind) ? patch.kind : "modified";
    summary.byKind[kind] += 1;
    summary.totalHunks += patch.hunks.length;
  }

  return summary;
}

function createDecisionRecord(decision) {
  return {
    id: createRecordId("dec"),
    type: DECISION_TYPES.has(decision.type) ? decision.type : "rationale",
    summary: decision.summary,
    recordedAt: new Date().toISOString()
  };
}

function createVerificationRecord(check) {
  return {
    id: createRecordId("ver"),
    name: check.name,
    status: VERIFICATION_STATUSES.has(check.status) ? check.status : "pending",
    details: check.details ?? null,
    recordedAt: new Date().toISOString()
  };
}

function createReplayRecord(replay) {
  return {
    sourceSessionId: replay.sourceSessionId,
    reason: replay.reason ?? null,
    replayedAt: new Date().toISOString()
  };
}

function createPatchRecord(patch) {
  return {
    path: normalizePathValue(patch.path),
    kind: PATCH_KINDS.has(patch.kind) ? patch.kind : "modified",
    diff: patch.diff,
    metadata: normalizePluginMap(patch.metadata ?? {}),
    hunks: (patch.hunks ?? []).map((hunk) => ({
      header: hunk.header,
      oldStart: hunk.oldStart,
      oldLines: hunk.oldLines,
      newStart: hunk.newStart,
      newLines: hunk.newLines,
      lines: [...hunk.lines]
    }))
  };
}

function createSessionId() {
  return createRecordId("gs");
}

function createRecordId(prefix) {
  const timestamp = new Date().toISOString().replace(/[-:.]/g, "");
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${timestamp}_${random}`;
}

function uniqueNormalizedPaths(paths) {
  return [...new Set(paths.map(normalizePathValue).filter(Boolean))];
}

function normalizePluginMap(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => entry && typeof entry === "object" && !Array.isArray(entry))
      .map(([key, entry]) => [key, { ...entry }])
  );
}

function normalizePathValue(input) {
  return String(input).replaceAll("\\", "/").replace(/^\.\/+/, "");
}

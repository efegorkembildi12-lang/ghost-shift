import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import {
  EXPORT_FORMAT_VERSION,
  SCHEMA_VERSION,
  createConfig,
  createSessionRecord,
  summarizePatches,
  summarizeVerification
} from "../../spec/src/index.js";
import {
  PLUGIN_API_VERSION,
  applyCapturePlugins,
  describePlugins,
  buildExportPluginSections,
  buildVerificationPluginReports,
  loadPlugins
} from "../../plugins/src/index.js";
import { ensureDir, exists, listJsonFiles, readJson, writeJson } from "../../storage/src/index.js";

const execFileAsync = promisify(execFile);

export async function initProject(cwd) {
  const paths = resolvePaths(cwd);

  await ensureDir(paths.baseDir);
  await ensureDir(paths.sessionsDir);
  await ensureDir(paths.exportsDir);

  if (!(await exists(paths.configPath))) {
    await writeJson(paths.configPath, createConfig(cwd));
  }

  return paths;
}

export async function recordSession({
  cwd,
  task,
  files = [],
  note,
  decisions = [],
  verification = [],
  invocation
}) {
  const patches = await captureGitPatches(cwd);

  return persistSession({
    cwd,
    task,
    files,
    note,
    decisions,
    verification,
    patches,
    invocation,
    replay: null
  });
}

export async function replaySession(
  cwd,
  sessionId,
  { note, reason, decisions = [], verification = [], invocation } = {}
) {
  const sourceSession = await getSession(cwd, sessionId);
  const replaySessionRecord = await persistSession({
    cwd,
    task: sourceSession.task,
    files: sourceSession.files,
    note,
    decisions: [...sourceSession.decisions.map(toDecisionInput), ...decisions],
    verification: [...sourceSession.verification.map(toVerificationInput), ...verification],
    patches: [],
    invocation,
    replay: {
      sourceSessionId: sourceSession.id,
      reason: reason ?? null
    }
  });

  return {
    sourceSession,
    replaySession: replaySessionRecord,
    verificationSummary: summarizeVerification(replaySessionRecord.verification)
  };
}

export async function compareSessions(cwd, leftId, rightId) {
  const left = await getSession(cwd, leftId);
  const right = await getSession(cwd, rightId);
  const leftLineage = await getReplayLineage(cwd, left.id);
  const rightLineage = await getReplayLineage(cwd, right.id);
  const verificationDiff = diffVerificationChecks(left.verification, right.verification);
  const decisionDiff = diffDecisionLists(left.decisions, right.decisions);
  const leftSemantic = summarizeSessionSemantics(left);
  const rightSemantic = summarizeSessionSemantics(right);
  const leftProvenance = summarizeSessionProvenance(left, cwd);
  const rightProvenance = summarizeSessionProvenance(right, cwd);

  return {
    left,
    right,
    taskChanged: left.task !== right.task,
    files: diffStringLists(left.files, right.files),
    decisions: decisionDiff,
    verification: {
      left: summarizeVerification(left.verification).overallStatus,
      right: summarizeVerification(right.verification).overallStatus,
      changes: verificationDiff
    },
    semanticChanges: compareSemanticSummaries(leftSemantic, rightSemantic),
    provenanceChanges: compareProvenanceSummaries(leftProvenance, rightProvenance),
    replayRelation: detectReplayRelation(left, right),
    lineage: {
      left: leftLineage,
      right: rightLineage,
      commonAncestor: findCommonAncestor(leftLineage, rightLineage)
    }
  };
}

export async function listSessions(cwd) {
  const paths = await requireProject(cwd);
  const files = await listJsonFiles(paths.sessionsDir);
  const sessions = await Promise.all(files.map((file) => readJson(file)));
  return sessions.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function readSession(cwd, sessionId) {
  return getSession(cwd, sessionId);
}

export async function findSessionsByFile(cwd, targetFile) {
  const normalizedTarget = normalizePath(targetFile, cwd);
  const sessions = await listSessions(cwd);
  return sessions.filter((session) =>
    session.files.some((entry) => normalizePath(entry, cwd) === normalizedTarget)
  );
}

export async function getLineBlameReport(cwd, targetFile, line) {
  const normalizedTarget = normalizePath(targetFile, cwd);
  const sessions = await listSessions(cwd);
  const candidateSessions = [];
  let mappedLine = line;

  for (const session of sessions) {
    const patch = getPatchForFile(session, normalizedTarget, cwd);
    const touchesFile =
      session.files.some((entry) => normalizePath(entry, cwd) === normalizedTarget) || Boolean(patch);

    if (!touchesFile) {
      continue;
    }

    const candidate = summarizeSessionCandidate(session, patch);
    candidateSessions.push(candidate);

    if (!patch || patch.hunks.length === 0) {
      continue;
    }

    const mapping = reverseMapLineThroughPatch(mappedLine, patch);
    if (mapping.matchedHunk) {
      return {
        path: normalizedTarget,
        line,
        precision: "line",
        matchedSession: candidate,
        matchedLineage: await getReplayLineage(cwd, session.id),
        matchedHunk: summarizeMatchedHunk(mapping.matchedHunk),
        semanticSummary: summarizePatchSemantics(patch),
        relatedDecisions: getRelatedDecisionsForPath(session, normalizedTarget, cwd),
        candidateSessions
      };
    }

    mappedLine = mapping.line;
  }

  if (candidateSessions.length > 0) {
    const fallbackSession = sessions.find((session) => session.id === candidateSessions[0].id) ?? null;
    const fallbackPatch = fallbackSession ? getPatchForFile(fallbackSession, normalizedTarget, cwd) : null;

    return {
      path: normalizedTarget,
      line,
      precision: "file",
      matchedSession: candidateSessions[0],
      matchedLineage: await getReplayLineage(cwd, candidateSessions[0].id),
      matchedHunk: null,
      semanticSummary: fallbackPatch ? summarizePatchSemantics(fallbackPatch) : null,
      relatedDecisions: fallbackSession
        ? getRelatedDecisionsForPath(fallbackSession, normalizedTarget, cwd)
        : [],
      candidateSessions
    };
  }

  return {
    path: normalizedTarget,
    line,
    precision: "none",
    matchedSession: null,
    matchedLineage: [],
    matchedHunk: null,
    semanticSummary: null,
    relatedDecisions: [],
    candidateSessions: []
  };
}

export async function exportSessions(cwd, outputPath) {
  const project = await requireProject(cwd);
  const runtimePlugins = await loadPlugins(cwd, project.config.plugins?.enabled ?? ["git", "shell"]);
  const sessions = await listSessions(cwd);
  const reports = {};

  for (const session of sessions) {
    reports[session.id] = {
      verificationSummary: summarizeVerification(session.verification),
      patchSummary: summarizePatches(session.patches ?? []),
      semanticSummary: summarizeSessionSemantics(session),
      provenanceSummary: summarizeSessionProvenance(session, cwd),
      replayLineage: await getReplayLineage(cwd, session.id)
    };
  }

  const pluginSections = await buildExportPluginSections(runtimePlugins, {
    cwd,
    sessions,
    reports
  });
  const payload = {
    schemaVersion: SCHEMA_VERSION,
    exportVersion: EXPORT_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    generatedBy: {
      name: "ghostshift",
      version: SCHEMA_VERSION
    },
    capabilities: [
      "patch-aware-export",
      "line-aware-blame",
      "semantic-summary",
      "decision-provenance",
      "replay-lineage",
      "plugin-metadata"
    ],
    plugins: {
      apiVersion: PLUGIN_API_VERSION,
      enabled: describePlugins(runtimePlugins),
      exports: pluginSections
    },
    sessions,
    reports
  };

  if (outputPath) {
    const absoluteOutput = path.resolve(cwd, outputPath);
    await writeJson(absoluteOutput, payload);
    return { ...payload, outputPath: absoluteOutput };
  }

  return payload;
}

export async function importExportPayload(cwd, payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Import payload must be a JSON object.");
  }

  const sessions = Array.isArray(payload.sessions) ? payload.sessions : null;
  if (!sessions) {
    throw new Error("Import payload must include a sessions array.");
  }

  const project = await requireProject(cwd);
  let imported = 0;
  let updated = 0;
  let skipped = 0;

  for (const session of sessions) {
    if (!session?.id) {
      skipped += 1;
      continue;
    }

    const targetPath = path.join(project.sessionsDir, `${session.id}.json`);
    if (await exists(targetPath)) {
      const current = await readJson(targetPath);
      if (JSON.stringify(current) === JSON.stringify(session)) {
        skipped += 1;
        continue;
      }

      await writeJson(targetPath, session);
      updated += 1;
      continue;
    }

    await writeJson(targetPath, session);
    imported += 1;
  }

  return {
    imported,
    updated,
    skipped,
    total: sessions.length
  };
}

export async function buildPrSummary(cwd, leftId, rightId) {
  const sessions = await listSessions(cwd);
  if (sessions.length === 0) {
    throw new Error("No sessions recorded yet. Run ghostshift run first.");
  }

  let resolvedLeft = leftId ?? null;
  let resolvedRight = rightId ?? null;

  if (!resolvedLeft && !resolvedRight) {
    if (sessions.length >= 2) {
      resolvedLeft = sessions[1].id;
      resolvedRight = sessions[0].id;
    } else {
      resolvedLeft = sessions[0].id;
    }
  }

  if (resolvedLeft && !resolvedRight) {
    const report = await explainSession(cwd, resolvedLeft);
    return {
      mode: "single",
      sessionId: resolvedLeft,
      markdown: renderSingleSessionPrSummary(report),
      report
    };
  }

  const report = await compareSessions(cwd, resolvedLeft, resolvedRight);
  return {
    mode: "compare",
    leftId: resolvedLeft,
    rightId: resolvedRight,
    markdown: renderComparePrSummary(report),
    report
  };
}

export async function explainSession(cwd, sessionId) {
  const session = await getSession(cwd, sessionId);
  return {
    session,
    verificationSummary: summarizeVerification(session.verification),
    patchSummary: summarizePatches(session.patches ?? []),
    semanticSummary: summarizeSessionSemantics(session),
    provenanceSummary: summarizeSessionProvenance(session, cwd),
    replayLineage: await getReplayLineage(cwd, session.id),
    highlights: {
      filesTouched: session.files.length,
      patchesCaptured: (session.patches ?? []).length,
      decisionsCaptured: session.decisions.length,
      checksCaptured: session.verification.length
    }
  };
}

export async function getVerificationReport(cwd, sessionId) {
  const project = await requireProject(cwd);
  const runtimePlugins = await loadPlugins(cwd, project.config.plugins?.enabled ?? ["git", "shell"]);
  const session = await getSession(cwd, sessionId);
  const summary = summarizeVerification(session.verification);
  const pluginReports = await buildVerificationPluginReports(runtimePlugins, {
    cwd,
    session,
    verificationSummary: summary
  });

  return {
    session,
    overallStatus: summary.overallStatus,
    counts: summary.counts,
    checks: session.verification,
    pluginReports
  };
}

export async function runDoctor(cwd) {
  const paths = resolvePaths(cwd);
  const checks = [
    {
      label: `${paths.baseDir} exists`,
      ok: await exists(paths.baseDir)
    },
    {
      label: `${paths.configPath} exists`,
      ok: await exists(paths.configPath)
    },
    {
      label: `${paths.sessionsDir} exists`,
      ok: await exists(paths.sessionsDir)
    },
    {
      label: `${paths.exportsDir} exists`,
      ok: await exists(paths.exportsDir)
    }
  ];

  return {
    ok: checks.every((check) => check.ok),
    checks
  };
}

async function persistSession({
  cwd,
  task,
  files,
  note,
  decisions,
  verification,
  patches,
  replay,
  invocation
}) {
  const paths = await requireProject(cwd);
  const runtimePlugins = await loadPlugins(cwd, paths.config.plugins?.enabled ?? ["git", "shell"]);
  const gitInfo = await getGitInfo(cwd);
  const pluginCapture = await applyCapturePlugins(runtimePlugins, {
    cwd,
    task,
    files,
    note,
    decisions,
    verification,
    patches,
    replay,
    gitInfo,
    invocation
  });
  const session = createSessionRecord({
    task,
    cwd,
    files,
    note,
    decisions,
    verification,
    patches: pluginCapture.patches,
    plugins: pluginCapture.plugins,
    replay,
    gitBranch: gitInfo.branch,
    gitCommit: gitInfo.commit
  });

  await writeJson(path.join(paths.sessionsDir, `${session.id}.json`), session);
  return session;
}

async function requireProject(cwd) {
  const paths = resolvePaths(cwd);
  if (!(await exists(paths.configPath))) {
    throw new Error("Ghostshift is not initialized here. Run ghostshift init first.");
  }
  return {
    ...paths,
    config: await readJson(paths.configPath)
  };
}

async function getSession(cwd, sessionId) {
  const sessions = await listSessions(cwd);
  const exact = sessions.find((session) => session.id === sessionId);
  if (exact) {
    return exact;
  }

  const partialMatches = sessions.filter((session) => session.id.startsWith(sessionId));
  if (partialMatches.length === 1) {
    return partialMatches[0];
  }

  if (partialMatches.length > 1) {
    throw new Error(`Session id "${sessionId}" is ambiguous.`);
  }

  throw new Error(`Session "${sessionId}" was not found.`);
}

function resolvePaths(cwd) {
  const baseDir = path.join(cwd, ".ghostshift");
  return {
    baseDir,
    configPath: path.join(baseDir, "config.json"),
    sessionsDir: path.join(baseDir, "sessions"),
    exportsDir: path.join(baseDir, "exports")
  };
}

async function getGitInfo(cwd) {
  const branch = await tryGitCommand(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const commit = await tryGitCommand(cwd, ["rev-parse", "--short", "HEAD"]);

  return {
    branch: branch ?? null,
    commit: commit ?? null
  };
}

async function captureGitPatches(cwd) {
  const gitRoot = await tryGitCommand(cwd, ["rev-parse", "--show-toplevel"]);
  const head = await tryGitCommand(cwd, ["rev-parse", "--verify", "HEAD"]);
  if (!gitRoot || !head) {
    return [];
  }

  const trackedStatuses = await listTrackedPatchCandidates(cwd);
  const untrackedPaths = await listUntrackedPatchCandidates(cwd);
  const patches = [];

  for (const entry of trackedStatuses) {
    const diff = await captureTrackedFileDiff(cwd, entry.path);
    if (!diff.trim()) {
      continue;
    }

    patches.push({
      path: normalizePath(entry.path, cwd),
      kind: mapGitStatusToPatchKind(entry.status),
      diff,
      hunks: parseUnifiedDiff(diff)
    });
  }

  for (const filePath of untrackedPaths) {
    const diff = await captureUntrackedFileDiff(cwd, gitRoot, filePath);
    if (!diff.trim()) {
      continue;
    }

    patches.push({
      path: normalizePath(toProjectPath(cwd, path.join(gitRoot, filePath)), cwd),
      kind: "added",
      diff,
      hunks: parseUnifiedDiff(diff)
    });
  }

  return patches;
}

async function listTrackedPatchCandidates(cwd) {
  const output = await tryGitCommand(cwd, ["diff", "--name-status", "--diff-filter=AMD", "HEAD", "--"]);
  if (!output) {
    return [];
  }

  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [status, filePath] = line.split("\t");
      return { status, path: filePath };
    })
    .filter((entry) => entry.status && entry.path)
    .filter((entry) => shouldCapturePath(entry.path));
}

async function listUntrackedPatchCandidates(cwd) {
  const output = await tryGitCommand(cwd, ["ls-files", "--others", "--exclude-standard"]);
  if (!output) {
    return [];
  }

  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((filePath) => shouldCapturePath(filePath));
}

async function captureTrackedFileDiff(cwd, filePath) {
  return runGitCommandAllowDiffExit(cwd, ["diff", "--no-ext-diff", "--unified=3", "HEAD", "--", filePath]);
}

async function captureUntrackedFileDiff(cwd, gitRoot, filePath) {
  const absolutePath = path.join(gitRoot, filePath);
  const relativePath = normalizePath(toProjectPath(cwd, absolutePath), cwd);
  const diff = await runGitCommandAllowDiffExit(cwd, [
    "diff",
    "--no-index",
    "--unified=3",
    "--",
    "/dev/null",
    absolutePath
  ]);

  if (diff.trim()) {
    return rewriteNoIndexDiffPath(diff, relativePath);
  }

  const content = await readFile(absolutePath, "utf8");
  return buildSyntheticAddedDiff(relativePath, content);
}

async function runGitCommandAllowDiffExit(cwd, args) {
  try {
    const { stdout } = await execFileAsync("git", args, { cwd });
    return stdout;
  } catch (error) {
    if ((error.code === 1 || error.code === "1") && typeof error.stdout === "string") {
      return error.stdout;
    }
    return "";
  }
}

async function tryGitCommand(cwd, args) {
  try {
    const { stdout } = await execFileAsync("git", args, { cwd });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

function parseUnifiedDiff(diff) {
  const lines = diff.split("\n");
  const hunks = [];
  let currentHunk = null;

  for (const line of lines) {
    const match = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/);
    if (match) {
      if (currentHunk) {
        hunks.push(currentHunk);
      }

      currentHunk = {
        header: line,
        oldStart: Number.parseInt(match[1], 10),
        oldLines: Number.parseInt(match[2] ?? "1", 10),
        newStart: Number.parseInt(match[3], 10),
        newLines: Number.parseInt(match[4] ?? "1", 10),
        lines: []
      };
      continue;
    }

    if (currentHunk) {
      currentHunk.lines.push(line);
    }
  }

  if (currentHunk) {
    hunks.push(currentHunk);
  }

  return hunks;
}

function reverseMapLineThroughPatch(line, patch) {
  let mappedLine = line;
  const hunks = [...patch.hunks].sort((left, right) => right.newStart - left.newStart);

  for (const hunk of hunks) {
    const newEnd = hunk.newStart + hunk.newLines - 1;
    const delta = hunk.newLines - hunk.oldLines;

    if (hunk.newLines > 0 && mappedLine >= hunk.newStart && mappedLine <= newEnd) {
      const analysis = analyzeLineWithinHunk(mappedLine, hunk);
      if (analysis.matched) {
        return {
          line: mappedLine,
          matchedHunk: hunk
        };
      }

      mappedLine = analysis.line;
      continue;
    }

    if (mappedLine > newEnd) {
      mappedLine -= delta;
    }
  }

  return {
    line: mappedLine,
    matchedHunk: null
  };
}

async function getReplayLineage(cwd, sessionId) {
  const sessions = await listSessions(cwd);
  const byId = new Map(sessions.map((session) => [session.id, session]));
  const lineage = [];
  let current = byId.get(sessionId);

  while (current) {
    lineage.unshift(current.id);
    const parentId = current.replay?.sourceSessionId;
    if (!parentId) {
      break;
    }
    current = byId.get(parentId) ?? null;
  }

  return lineage;
}

function diffStringLists(left, right) {
  const leftSet = new Set(left);
  const rightSet = new Set(right);

  return {
    added: right.filter((item) => !leftSet.has(item)),
    removed: left.filter((item) => !rightSet.has(item))
  };
}

function diffDecisionLists(leftDecisions, rightDecisions) {
  const leftStrings = leftDecisions.map(formatDecision);
  const rightStrings = rightDecisions.map(formatDecision);
  const baseDiff = diffStringLists(leftStrings, rightStrings);
  const decisionTypes = new Set([
    ...leftDecisions.map((decision) => decision.type),
    ...rightDecisions.map((decision) => decision.type)
  ]);

  const byType = [...decisionTypes]
    .sort()
    .map((type) => {
      const leftTyped = leftDecisions.filter((decision) => decision.type === type).map(formatDecision);
      const rightTyped = rightDecisions
        .filter((decision) => decision.type === type)
        .map(formatDecision);
      const diff = diffStringLists(leftTyped, rightTyped);
      return {
        type,
        added: diff.added,
        removed: diff.removed
      };
    })
    .filter((entry) => entry.added.length || entry.removed.length);

  return {
    ...baseDiff,
    byType
  };
}

function diffVerificationChecks(leftChecks, rightChecks) {
  const leftIndex = indexVerificationChecks(leftChecks);
  const rightIndex = indexVerificationChecks(rightChecks);
  const names = new Set([...leftIndex.keys(), ...rightIndex.keys()]);
  const changes = {
    added: [],
    removed: [],
    changed: [],
    unchanged: []
  };

  for (const name of [...names].sort()) {
    const left = leftIndex.get(name);
    const right = rightIndex.get(name);

    if (!left && right) {
      changes.added.push({ name, to: formatVerificationState(right) });
      continue;
    }

    if (left && !right) {
      changes.removed.push({ name, from: formatVerificationState(left) });
      continue;
    }

    const from = formatVerificationState(left);
    const to = formatVerificationState(right);
    if (from === to) {
      changes.unchanged.push({ name, status: to });
    } else {
      changes.changed.push({ name, from, to });
    }
  }

  return changes;
}

function indexVerificationChecks(checks) {
  const index = new Map();
  for (const check of checks) {
    index.set(check.name, check);
  }
  return index;
}

function formatVerificationState(check) {
  if (!check) {
    return "missing";
  }
  return check.details ? `${check.status} (${check.details})` : check.status;
}

function findCommonAncestor(leftLineage, rightLineage) {
  const leftSet = new Set(leftLineage);
  for (let index = rightLineage.length - 1; index >= 0; index -= 1) {
    const candidate = rightLineage[index];
    if (leftSet.has(candidate)) {
      return candidate;
    }
  }
  return null;
}

function formatDecision(decision) {
  return `[${decision.type}] ${decision.summary}`;
}

function detectReplayRelation(left, right) {
  if (right.replay?.sourceSessionId === left.id) {
    return "right replays left";
  }

  if (left.replay?.sourceSessionId === right.id) {
    return "left replays right";
  }

  return null;
}

function toDecisionInput(decision) {
  return {
    type: decision.type,
    summary: decision.summary
  };
}

function toVerificationInput(check) {
  return {
    name: check.name,
    status: check.status,
    details: check.details
  };
}

function summarizeSessionCandidate(session, patch) {
  return {
    id: session.id,
    task: session.task,
    createdAt: session.createdAt,
    hasPatch: Boolean(patch),
    replay: session.replay
  };
}

function summarizeMatchedHunk(hunk) {
  return {
    header: hunk.header,
    oldStart: hunk.oldStart,
    oldLines: hunk.oldLines,
    newStart: hunk.newStart,
    newLines: hunk.newLines,
    excerpt: hunk.lines.slice(0, 6)
  };
}

function getPatchForFile(session, targetFile, cwd) {
  return (session.patches ?? []).find((patch) => normalizePath(patch.path, cwd) === targetFile) ?? null;
}

function mapGitStatusToPatchKind(status) {
  if (status === "A") {
    return "added";
  }
  if (status === "D") {
    return "deleted";
  }
  return "modified";
}

function rewriteNoIndexDiffPath(diff, relativePath) {
  return diff
    .replace(/^diff --git a\/.* b\/.*$/m, `diff --git a/${relativePath} b/${relativePath}`)
    .replace(/^\+\+\+ b\/.*$/m, `+++ b/${relativePath}`);
}

function buildSyntheticAddedDiff(relativePath, content) {
  const lines = splitContentLines(content);
  const body = lines.map((line) => `+${line}`).join("\n");
  return `diff --git a/${relativePath} b/${relativePath}\nnew file mode 100644\n--- /dev/null\n+++ b/${relativePath}\n@@ -0,0 +1,${lines.length} @@\n${body}\n`;
}

function analyzeLineWithinHunk(targetLine, hunk) {
  let oldLine = hunk.oldStart;
  let newLine = hunk.newStart;

  for (const line of hunk.lines) {
    if (line.startsWith("\\")) {
      continue;
    }

    if (line.startsWith(" ")) {
      if (newLine === targetLine) {
        return {
          matched: false,
          line: oldLine
        };
      }
      oldLine += 1;
      newLine += 1;
      continue;
    }

    if (line.startsWith("+")) {
      if (newLine === targetLine) {
        return {
          matched: true,
          line: targetLine
        };
      }
      newLine += 1;
      continue;
    }

    if (line.startsWith("-")) {
      oldLine += 1;
    }
  }

  return {
    matched: false,
    line: targetLine
  };
}

function splitContentLines(content) {
  if (content === "") {
    return [""];
  }

  const normalized = content.endsWith("\n") ? content.slice(0, -1) : content;
  return normalized.split("\n");
}

function toProjectPath(cwd, targetPath) {
  return normalizePath(path.relative(cwd, targetPath), cwd);
}

function normalizePath(input, cwd = null) {
  const value = String(input);
  const relativeValue = cwd && path.isAbsolute(value) ? path.relative(cwd, value) : value;
  return relativeValue.replaceAll("\\", "/").replace(/^\.\/+/, "");
}

function shouldCapturePath(filePath) {
  const normalized = normalizePath(filePath);
  return normalized !== ".ghostshift" && !normalized.startsWith(".ghostshift/");
}

function summarizeSessionSemantics(session) {
  const patches = session.patches ?? [];
  const summaries = patches.map(summarizePatchSemantics);
  const labelCounts = {};

  for (const patch of summaries) {
    for (const label of patch.labels) {
      labelCounts[label] = (labelCounts[label] ?? 0) + 1;
    }
  }

  return {
    patches: summaries,
    labelCounts,
    headlines: summaries.map((patch) => `${patch.path}: ${patch.headline}`)
  };
}

function summarizeSessionProvenance(session, cwd) {
  const paths = new Set([
    ...(session.files ?? []).map((entry) => normalizePath(entry, cwd)),
    ...((session.patches ?? []).map((patch) => normalizePath(patch.path, cwd)))
  ]);
  const byFile = [...paths]
    .sort()
    .map((filePath) => {
      const patch = getPatchForFile(session, filePath, cwd);
      const semanticSummary = patch ? summarizePatchSemantics(patch) : null;
      const relatedDecisions = getRelatedDecisionsForPath(session, filePath, cwd);

      return {
        path: filePath,
        semanticHeadline: semanticSummary?.headline ?? null,
        semanticLabels: semanticSummary?.labels ?? [],
        relatedDecisions,
        decisionTypes: [...new Set(relatedDecisions.map((decision) => decision.type))].sort()
      };
    });

  const decisionTypes = {};
  for (const file of byFile) {
    for (const type of file.decisionTypes) {
      decisionTypes[type] = (decisionTypes[type] ?? 0) + 1;
    }
  }

  return {
    byFile,
    headlines: byFile
      .filter((file) => file.relatedDecisions.length > 0)
      .map((file) => {
        const decisionText = file.relatedDecisions
          .map((decision) => `[${decision.type}] ${decision.summary}`)
          .join(" | ");
        return `${file.path}: ${decisionText}`;
      }),
    linkedDecisions: byFile.reduce((total, file) => total + file.relatedDecisions.length, 0),
    decisionTypes
  };
}

function getRelatedDecisionsForPath(session, targetPath, cwd) {
  const normalizedTarget = normalizePath(targetPath, cwd);
  const patch = getPatchForFile(session, normalizedTarget, cwd);
  const semanticSummary = patch ? summarizePatchSemantics(patch) : null;
  const basename = path.basename(normalizedTarget);
  const stem = basename.replace(/\.[^.]+$/, "");
  const keywords = buildDecisionKeywords(normalizedTarget, semanticSummary);
  const singleFileSession = (session.files?.length ?? 0) <= 1 && (session.patches?.length ?? 0) <= 1;

  const scored = session.decisions
    .map((decision) => {
      const summary = decision.summary.toLowerCase();
      let score = 0;
      const signals = [];

      if (summary.includes(normalizedTarget.toLowerCase()) || summary.includes(basename.toLowerCase())) {
        score += 3;
        signals.push(`path:${basename}`);
      } else if (stem && summary.includes(stem.toLowerCase())) {
        score += 2;
        signals.push(`path:${stem}`);
      }

      for (const keyword of keywords) {
        if (summary.includes(keyword)) {
          score += 2;
          signals.push(`keyword:${keyword}`);
        }
      }

      if (score === 0 && singleFileSession && session.decisions.length === 1) {
        score = 1;
        signals.push("fallback:single-file-session");
      }

      return {
        id: decision.id,
        type: decision.type,
        summary: decision.summary,
        score,
        signals: [...new Set(signals)]
      };
    })
    .filter((decision) => decision.score > 0)
    .sort((left, right) => right.score - left.score || left.summary.localeCompare(right.summary));

  if (scored.length > 0) {
    return scored.slice(0, 3);
  }

  if (session.decisions.length === 1) {
    const [decision] = session.decisions;
    return [
      {
        id: decision.id,
        type: decision.type,
        summary: decision.summary,
        score: 1,
        signals: ["fallback:single-decision"]
      }
    ];
  }

  return [];
}

function summarizePatchSemantics(patch) {
  const metrics = collectPatchMetrics(patch);
  const labels = deriveSemanticLabels(patch, metrics);

  return {
    path: patch.path,
    labels,
    metrics,
    headline: buildSemanticHeadline(labels)
  };
}

function collectPatchMetrics(patch) {
  let addedLines = 0;
  let removedLines = 0;

  for (const hunk of patch.hunks) {
    for (const line of hunk.lines) {
      if (line.startsWith("+")) {
        addedLines += 1;
      } else if (line.startsWith("-")) {
        removedLines += 1;
      }
    }
  }

  return {
    addedLines,
    removedLines,
    modifiedHunks: patch.hunks.length
  };
}

function deriveSemanticLabels(patch, metrics) {
  const labels = new Set();

  if (patch.kind === "added") {
    labels.add("new-file");
  }
  if (patch.kind === "deleted") {
    labels.add("deleted-file");
  }
  if (metrics.addedLines > 0 && metrics.removedLines === 0) {
    labels.add("lines-added");
  }
  if (metrics.removedLines > 0 && metrics.addedLines === 0) {
    labels.add("lines-removed");
  }
  if (metrics.addedLines > 0 && metrics.removedLines > 0) {
    labels.add("lines-modified");
  }
  if (patchHasBranchKeyword(patch, "+")) {
    labels.add("branch-added");
  }
  if (patchHasBranchKeyword(patch, "-")) {
    labels.add("branch-removed");
  }
  if (patchHasSignatureChange(patch)) {
    labels.add("signature-changed");
  }
  if (patchHasIdentifierRename(patch)) {
    labels.add("identifier-renamed");
  }

  if (labels.size === 0) {
    labels.add("lines-modified");
  }

  return [...labels].sort();
}

function patchHasBranchKeyword(patch, prefix) {
  return patch.hunks.some((hunk) =>
    hunk.lines.some((line) => {
      if (!line.startsWith(prefix)) {
        return false;
      }
      const body = line.slice(1);
      return /\b(if|else|switch|case|catch|try|for|while)\b/.test(body);
    })
  );
}

function patchHasSignatureChange(patch) {
  return patch.hunks.some((hunk) =>
    hunk.lines.some((line) => {
      if (!line.startsWith("+") && !line.startsWith("-")) {
        return false;
      }
      const body = line.slice(1).trim();
      if (/^(if|else|switch|case|catch|try|for|while)\b/.test(body)) {
        return false;
      }
      return (
        /^function\s+\w+\s*\(/.test(body) ||
        /^const\s+\w+\s*=\s*(async\s*)?\(/.test(body) ||
        /^\w+\s*\([^)]*\)\s*\{?$/.test(body)
      );
    })
  );
}

function patchHasIdentifierRename(patch) {
  return patch.hunks.some((hunk) => {
    const added = hunk.lines.filter((line) => line.startsWith("+")).map((line) => line.slice(1));
    const removed = hunk.lines.filter((line) => line.startsWith("-")).map((line) => line.slice(1));

    if (added.length === 0 || removed.length === 0 || added.length !== removed.length) {
      return false;
    }

    return added.some((addedLine, index) => isIdentifierRename(removed[index], addedLine));
  });
}

function isIdentifierRename(left, right) {
  const leftTokens = left.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? [];
  const rightTokens = right.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? [];

  if (leftTokens.length !== rightTokens.length || leftTokens.length === 0) {
    return false;
  }

  let differences = 0;
  for (let index = 0; index < leftTokens.length; index += 1) {
    if (leftTokens[index] !== rightTokens[index]) {
      differences += 1;
    }
  }

  return differences === 1;
}

function buildSemanticHeadline(labels) {
  const phrases = labels.map((label) => semanticLabelPhrase(label));
  return phrases.join(", ");
}

function semanticLabelPhrase(label) {
  switch (label) {
    case "new-file":
      return "new file";
    case "deleted-file":
      return "deleted file";
    case "lines-added":
      return "added lines";
    case "lines-removed":
      return "removed lines";
    case "lines-modified":
      return "modified lines";
    case "branch-added":
      return "added branch";
    case "branch-removed":
      return "removed branch";
    case "signature-changed":
      return "changed signature";
    case "identifier-renamed":
      return "renamed identifier";
    default:
      return label;
  }
}

function compareSemanticSummaries(leftSemantic, rightSemantic) {
  const leftLabels = Object.keys(leftSemantic.labelCounts).sort();
  const rightLabels = Object.keys(rightSemantic.labelCounts).sort();
  const leftSet = new Set(leftLabels);
  const rightSet = new Set(rightLabels);
  const paths = new Set([
    ...leftSemantic.patches.map((patch) => patch.path),
    ...rightSemantic.patches.map((patch) => patch.path)
  ]);

  return {
    leftHeadlines: leftSemantic.headlines,
    rightHeadlines: rightSemantic.headlines,
    addedLabels: rightLabels.filter((label) => !leftSet.has(label)),
    removedLabels: leftLabels.filter((label) => !rightSet.has(label)),
    commonLabels: leftLabels.filter((label) => rightSet.has(label)),
    perFile: [...paths]
      .sort()
      .map((path) => {
        const leftPatch = leftSemantic.patches.find((patch) => patch.path === path) ?? null;
        const rightPatch = rightSemantic.patches.find((patch) => patch.path === path) ?? null;
        return {
          path,
          leftHeadline: leftPatch?.headline ?? null,
          rightHeadline: rightPatch?.headline ?? null,
          addedLabels: rightPatch ? rightPatch.labels.filter((label) => !(leftPatch?.labels ?? []).includes(label)) : [],
          removedLabels: leftPatch ? leftPatch.labels.filter((label) => !(rightPatch?.labels ?? []).includes(label)) : []
        };
      })
  };
}

function compareProvenanceSummaries(leftProvenance, rightProvenance) {
  const leftTypes = Object.keys(leftProvenance.decisionTypes).sort();
  const rightTypes = Object.keys(rightProvenance.decisionTypes).sort();
  const leftTypeSet = new Set(leftTypes);
  const rightTypeSet = new Set(rightTypes);
  const paths = new Set([
    ...leftProvenance.byFile.map((entry) => entry.path),
    ...rightProvenance.byFile.map((entry) => entry.path)
  ]);

  return {
    leftHeadlines: leftProvenance.headlines,
    rightHeadlines: rightProvenance.headlines,
    addedDecisionTypes: rightTypes.filter((type) => !leftTypeSet.has(type)),
    removedDecisionTypes: leftTypes.filter((type) => !rightTypeSet.has(type)),
    commonDecisionTypes: leftTypes.filter((type) => rightTypeSet.has(type)),
    perFile: [...paths]
      .sort()
      .map((filePath) => {
        const leftFile = leftProvenance.byFile.find((entry) => entry.path === filePath) ?? null;
        const rightFile = rightProvenance.byFile.find((entry) => entry.path === filePath) ?? null;
        const leftDecisions = leftFile?.relatedDecisions.map(formatLinkedDecision) ?? [];
        const rightDecisions = rightFile?.relatedDecisions.map(formatLinkedDecision) ?? [];

        return {
          path: filePath,
          leftHeadline: leftFile
            ? buildProvenanceHeadline(leftFile.semanticHeadline, leftDecisions)
            : null,
          rightHeadline: rightFile
            ? buildProvenanceHeadline(rightFile.semanticHeadline, rightDecisions)
            : null,
          leftDecisions,
          rightDecisions,
          addedDecisions: rightDecisions.filter((decision) => !leftDecisions.includes(decision)),
          removedDecisions: leftDecisions.filter((decision) => !rightDecisions.includes(decision))
        };
      })
  };
}

function buildDecisionKeywords(normalizedTarget, semanticSummary) {
  const keywords = new Set();
  const segments = normalizedTarget
    .toLowerCase()
    .split(/[/.:_-]/)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length >= 3);

  for (const segment of segments) {
    keywords.add(segment);
  }

  for (const label of semanticSummary?.labels ?? []) {
    for (const keyword of semanticLabelKeywords(label)) {
      keywords.add(keyword);
    }
  }

  return [...keywords];
}

function semanticLabelKeywords(label) {
  switch (label) {
    case "new-file":
      return ["new", "create", "add", "introduce"];
    case "deleted-file":
      return ["delete", "remove", "drop"];
    case "lines-added":
      return ["add", "insert", "append"];
    case "lines-removed":
      return ["remove", "delete", "drop"];
    case "lines-modified":
      return ["change", "update", "refactor", "rewrite", "adjust"];
    case "branch-added":
      return ["branch", "guard", "condition", "fallback", "if"];
    case "branch-removed":
      return ["simplify", "remove", "drop", "branch", "guard"];
    case "signature-changed":
      return ["signature", "function", "method", "parameter", "api"];
    case "identifier-renamed":
      return ["rename", "identifier", "variable", "field"];
    default:
      return [];
  }
}

function formatLinkedDecision(decision) {
  return `[${decision.type}] ${decision.summary}`;
}

function buildProvenanceHeadline(semanticHeadline, decisions) {
  const parts = [];
  if (semanticHeadline) {
    parts.push(semanticHeadline);
  }
  if (decisions.length > 0) {
    parts.push(decisions.join(" | "));
  }
  return parts.length > 0 ? parts.join(" => ") : null;
}

function renderSingleSessionPrSummary(explain) {
  const lines = [
    "# Ghostshift PR Summary",
    "",
    "## Session",
    `- Session: \`${explain.session.id}\``,
    `- Task: ${explain.session.task}`,
    `- Verification: ${explain.verificationSummary.overallStatus}`,
    `- Files: ${explain.session.files.length === 0 ? "none" : explain.session.files.join(", ")}`,
    ""
  ];

  if (explain.semanticSummary.headlines.length > 0) {
    lines.push("## Semantic Changes");
    for (const headline of explain.semanticSummary.headlines) {
      lines.push(`- ${headline}`);
    }
    lines.push("");
  }

  if (explain.provenanceSummary.headlines.length > 0) {
    lines.push("## Decision Provenance");
    for (const headline of explain.provenanceSummary.headlines) {
      lines.push(`- ${headline}`);
    }
    lines.push("");
  }

  if (explain.session.verification.length > 0) {
    lines.push("## Verification Checks");
    for (const check of explain.session.verification) {
      lines.push(`- ${check.name}: ${check.status}${check.details ? ` (${check.details})` : ""}`);
    }
    lines.push("");
  }

  return `${lines.join("\n").trim()}\n`;
}

function renderComparePrSummary(compare) {
  const changedFiles = [
    ...new Set([
      ...compare.files.added,
      ...compare.files.removed,
      ...compare.semanticChanges.perFile
        .filter((file) => file.leftHeadline !== file.rightHeadline)
        .map((file) => file.path)
    ])
  ].sort();

  const lines = [
    "# Ghostshift PR Summary",
    "",
    "## Sessions",
    `- Base: \`${compare.left.id}\``,
    `- Head: \`${compare.right.id}\``,
    `- Task changed: ${compare.taskChanged ? "yes" : "no"}`,
    `- Verification: ${compare.verification.left} -> ${compare.verification.right}`,
    ""
  ];

  lines.push("## Files");
  if (changedFiles.length === 0) {
    lines.push("- No file-level change summary detected.");
  } else {
    for (const file of changedFiles) {
      lines.push(`- ${file}`);
    }
  }
  lines.push("");

  if (
    compare.semanticChanges.addedLabels.length ||
    compare.semanticChanges.removedLabels.length ||
    compare.semanticChanges.commonLabels.length
  ) {
    lines.push("## Semantic Changes");
    if (compare.semanticChanges.addedLabels.length) {
      lines.push(`- Added labels: ${compare.semanticChanges.addedLabels.join(", ")}`);
    }
    if (compare.semanticChanges.removedLabels.length) {
      lines.push(`- Removed labels: ${compare.semanticChanges.removedLabels.join(", ")}`);
    }
    for (const file of compare.semanticChanges.perFile) {
      if (file.leftHeadline === file.rightHeadline) {
        continue;
      }
      lines.push(`- ${file.path}: ${file.leftHeadline ?? "none"} -> ${file.rightHeadline ?? "none"}`);
    }
    lines.push("");
  }

  if (
    compare.provenanceChanges.addedDecisionTypes.length ||
    compare.provenanceChanges.removedDecisionTypes.length ||
    compare.provenanceChanges.commonDecisionTypes.length
  ) {
    lines.push("## Decision Provenance");
    if (compare.provenanceChanges.addedDecisionTypes.length) {
      lines.push(`- Added decision types: ${compare.provenanceChanges.addedDecisionTypes.join(", ")}`);
    }
    if (compare.provenanceChanges.removedDecisionTypes.length) {
      lines.push(`- Removed decision types: ${compare.provenanceChanges.removedDecisionTypes.join(", ")}`);
    }
    for (const file of compare.provenanceChanges.perFile) {
      if (
        file.leftHeadline === file.rightHeadline &&
        file.addedDecisions.length === 0 &&
        file.removedDecisions.length === 0
      ) {
        continue;
      }
      lines.push(`- ${file.path}: ${file.leftHeadline ?? "none"} -> ${file.rightHeadline ?? "none"}`);
    }
    lines.push("");
  }

  if (
    compare.verification.changes.added.length ||
    compare.verification.changes.removed.length ||
    compare.verification.changes.changed.length
  ) {
    lines.push("## Verification Changes");
    for (const check of compare.verification.changes.added) {
      lines.push(`- Added check: ${check.name} -> ${check.to}`);
    }
    for (const check of compare.verification.changes.removed) {
      lines.push(`- Removed check: ${check.name} -> ${check.from}`);
    }
    for (const check of compare.verification.changes.changed) {
      lines.push(`- Updated check: ${check.name} ${check.from} -> ${check.to}`);
    }
    lines.push("");
  }

  if (compare.replayRelation || compare.lineage.commonAncestor) {
    lines.push("## Replay Context");
    if (compare.replayRelation) {
      lines.push(`- Relation: ${compare.replayRelation}`);
    }
    if (compare.lineage.commonAncestor) {
      lines.push(`- Common ancestor: \`${compare.lineage.commonAncestor}\``);
    }
    lines.push("");
  }

  return `${lines.join("\n").trim()}\n`;
}

export function analyzePatchSemanticsForTest(patch) {
  return summarizePatchSemantics(patch);
}

export function summarizeSessionSemanticsForTest(session) {
  return summarizeSessionSemantics(session);
}

export function summarizeSessionProvenanceForTest(session, cwd = null) {
  return summarizeSessionProvenance(session, cwd);
}

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  analyzePatchSemanticsForTest,
  summarizeSessionProvenanceForTest,
  summarizeSessionSemanticsForTest
} from "/Users/efegorkembildi/Code/ghostshift/packages/core/src/index.js";

const cliPath = "/Users/efegorkembildi/Code/ghostshift/apps/cli/src/index.js";

function runCli(cwd, args) {
  return execFileSync(process.execPath, [cliPath, ...args], {
    cwd,
    encoding: "utf8"
  });
}

function runGit(cwd, args) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8"
  });
}

function setupGitRepo(prefix = "ghostshift-git-") {
  const cwd = mkdtempSync(path.join(tmpdir(), prefix));
  runGit(cwd, ["init", "-q"]);
  runGit(cwd, ["branch", "-m", "main"]);
  runGit(cwd, ["config", "user.name", "Ghostshift Test"]);
  runGit(cwd, ["config", "user.email", "ghostshift@example.com"]);
  return cwd;
}

function commitAll(cwd, message) {
  runGit(cwd, ["add", "."]);
  runGit(cwd, ["commit", "-m", message]);
}

test("init creates a ghostshift project", () => {
  const cwd = mkdtempSync(path.join(tmpdir(), "ghostshift-init-"));

  runCli(cwd, ["init"]);

  const configPath = path.join(cwd, ".ghostshift", "config.json");
  const config = JSON.parse(readFileSync(configPath, "utf8"));

  assert.equal(config.storage.driver, "fs");
});

test("run records a session that trace can read", () => {
  const cwd = mkdtempSync(path.join(tmpdir(), "ghostshift-run-"));

  runCli(cwd, ["init"]);
  runCli(cwd, ["run", "refactor auth middleware", "--files", "src/auth.ts"]);

  const output = runCli(cwd, ["trace", "--json"]);
  const sessions = JSON.parse(output);

  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].task, "refactor auth middleware");
  assert.deepEqual(sessions[0].files, ["src/auth.ts"]);
});

test("explain and verify expose decision and verification records", () => {
  const cwd = mkdtempSync(path.join(tmpdir(), "ghostshift-explain-"));

  runCli(cwd, ["init"]);
  const rawSession = runCli(cwd, [
    "run",
    "stabilize auth middleware",
    "--files",
    "src/auth.ts,src/session.ts",
    "--decision",
    "rationale:split auth checks from session loading",
    "--decision",
    "risk:leave token parsing untouched in this pass",
    "--verify",
    "lint:passed",
    "--verify",
    "unit-tests:pending:needs fixture coverage",
    "--json"
  ]);

  const session = JSON.parse(rawSession);
  const explain = JSON.parse(runCli(cwd, ["explain", session.id, "--json"]));
  const verification = JSON.parse(runCli(cwd, ["verify", session.id, "--json"]));

  assert.equal(explain.session.decisions.length, 2);
  assert.equal(explain.verificationSummary.overallStatus, "pending");
  assert.deepEqual(explain.replayLineage, [session.id]);
  assert.equal(explain.patchSummary.totalFiles, 0);
  assert.equal(verification.checks.length, 2);
  assert.equal(verification.counts.passed, 1);
  assert.equal(verification.counts.pending, 1);
});

test("replay creates a linked session and compare reports the differences", () => {
  const cwd = mkdtempSync(path.join(tmpdir(), "ghostshift-replay-"));

  runCli(cwd, ["init"]);
  const original = JSON.parse(
    runCli(cwd, [
      "run",
      "refactor auth middleware",
      "--files",
      "src/auth.ts",
      "--decision",
      "rationale:separate guard logic",
      "--verify",
      "lint:passed",
      "--json"
    ])
  );

  const replay = JSON.parse(
    runCli(cwd, [
      "replay",
      original.id,
      "--reason",
      "rerun with pending tests",
      "--decision",
      "follow-up:add fixture coverage before merge",
      "--verify",
      "unit-tests:pending:needs auth fixtures",
      "--json"
    ])
  );

  const compare = JSON.parse(runCli(cwd, ["compare", original.id, replay.replaySession.id, "--json"]));

  assert.equal(replay.sourceSession.id, original.id);
  assert.equal(replay.replaySession.replay.sourceSessionId, original.id);
  assert.equal(compare.replayRelation, "right replays left");
  assert.equal(compare.verification.left, "passed");
  assert.equal(compare.verification.right, "pending");
  assert.equal(compare.decisions.added.length, 1);
  assert.equal(compare.decisions.byType.length, 1);
  assert.equal(compare.decisions.byType[0].type, "follow-up");
  assert.equal(compare.verification.changes.added.length, 1);
  assert.equal(compare.verification.changes.added[0].name, "unit-tests");
  assert.equal(compare.lineage.commonAncestor, original.id);
});

test("run captures unified diff patches for tracked files in git repos", () => {
  const cwd = setupGitRepo("ghostshift-patch-tracked-");

  writeFileSync(path.join(cwd, "auth.txt"), "alpha\nbeta\ngamma\n", "utf8");
  commitAll(cwd, "baseline");
  runCli(cwd, ["init"]);

  writeFileSync(path.join(cwd, "auth.txt"), "alpha\nbeta updated\ngamma\n", "utf8");

  const session = JSON.parse(runCli(cwd, ["run", "update auth", "--json"]));

  assert.equal(session.patches.length, 1);
  assert.equal(session.patches[0].path, "auth.txt");
  assert.equal(session.patches[0].kind, "modified");
  assert.match(session.patches[0].diff, /diff --git/);
  assert.equal(session.patches[0].hunks.length, 1);
  assert.deepEqual(session.files, ["auth.txt"]);
});

test("run captures added patches for untracked files in git repos", () => {
  const cwd = setupGitRepo("ghostshift-patch-untracked-");

  writeFileSync(path.join(cwd, "base.txt"), "baseline\n", "utf8");
  commitAll(cwd, "baseline");
  runCli(cwd, ["init"]);

  writeFileSync(path.join(cwd, "new.txt"), "one\ntwo\n", "utf8");

  const session = JSON.parse(runCli(cwd, ["run", "add new file", "--json"]));

  assert.equal(session.patches.length, 1);
  assert.equal(session.patches[0].path, "new.txt");
  assert.equal(session.patches[0].kind, "added");
  assert.equal(session.patches[0].hunks[0].newStart, 1);
  assert.deepEqual(session.files, ["new.txt"]);
});

test("run records built-in plugin metadata and patch enrichment", () => {
  const cwd = setupGitRepo("ghostshift-plugin-capture-");

  writeFileSync(path.join(cwd, "app.txt"), "one\ntwo\n", "utf8");
  commitAll(cwd, "baseline");
  runCli(cwd, ["init"]);

  writeFileSync(path.join(cwd, "app.txt"), "one changed\ntwo\n", "utf8");
  const session = JSON.parse(runCli(cwd, ["run", "capture plugin metadata", "--json"]));

  assert.equal(session.plugins.git.branch, "main");
  assert.equal(session.plugins.git.patchSummary.totalFiles, 1);
  assert.equal(session.plugins.shell.platform.length > 0, true);
  assert.match(session.plugins.shell.invocation, /run/);
  assert.equal(session.patches[0].metadata.git.hunks, 1);
  assert.equal(session.patches[0].metadata.git.addedLines, 1);
  assert.equal(session.patches[0].metadata.git.removedLines, 1);
});

test("verify exposes built-in plugin reports", () => {
  const cwd = setupGitRepo("ghostshift-plugin-verify-");

  writeFileSync(path.join(cwd, "app.txt"), "one\ntwo\n", "utf8");
  commitAll(cwd, "baseline");
  runCli(cwd, ["init"]);

  writeFileSync(path.join(cwd, "app.txt"), "one changed\ntwo\n", "utf8");
  const session = JSON.parse(
    runCli(cwd, ["run", "verify plugin reports", "--verify", "lint:passed", "--json"])
  );

  const report = JSON.parse(runCli(cwd, ["verify", session.id, "--json"]));
  const human = runCli(cwd, ["verify", session.id]);

  assert.equal(report.pluginReports.length >= 2, true);
  assert.equal(report.pluginReports[0].plugin, "git");
  assert.match(human, /Plugin reports:/);
  assert.match(human, /Git context/);
  assert.match(human, /Shell context/);
});

test("run can load a local plugin module from config", () => {
  const cwd = setupGitRepo("ghostshift-plugin-local-");

  writeFileSync(path.join(cwd, "app.txt"), "one\ntwo\n", "utf8");
  commitAll(cwd, "baseline");
  runCli(cwd, ["init"]);

  const configPath = path.join(cwd, ".ghostshift", "config.json");
  const config = JSON.parse(readFileSync(configPath, "utf8"));
  config.plugins.enabled = ["./ghostshift-plugin.mjs"];
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

  writeFileSync(
    path.join(cwd, "ghostshift-plugin.mjs"),
    `export default {
  id: "example",
  displayName: "Example Adapter",
  async captureSession(context) {
    return { task: context.task };
  },
  async consumeExport({ sessions }) {
    return { sessionsObserved: sessions.length };
  }
};\n`,
    "utf8"
  );

  writeFileSync(path.join(cwd, "app.txt"), "one changed\ntwo\n", "utf8");
  const session = JSON.parse(runCli(cwd, ["run", "load local plugin", "--json"]));
  const exported = JSON.parse(runCli(cwd, ["export"]));

  assert.equal(session.plugins.example.task, "load local plugin");
  assert.equal(exported.plugins.enabled[0].id, "example");
  assert.equal(exported.plugins.exports.example.sessionsObserved, 1);
});

test("blame line resolves the latest matching hunk", () => {
  const cwd = setupGitRepo("ghostshift-line-blame-");

  writeFileSync(path.join(cwd, "app.txt"), "one\ntwo\nthree\n", "utf8");
  commitAll(cwd, "baseline");
  runCli(cwd, ["init"]);

  writeFileSync(path.join(cwd, "app.txt"), "one\ntwo changed\nthree\n", "utf8");
  const session = JSON.parse(runCli(cwd, ["run", "change line two", "--json"]));

  const report = JSON.parse(runCli(cwd, ["blame", "app.txt", "--line", "2", "--json"]));

  assert.equal(report.precision, "line");
  assert.equal(report.matchedSession.id, session.id);
  assert.match(report.matchedHunk.header, /^@@/);
  assert.ok(report.semanticSummary);
  assert.equal(report.semanticSummary.path, "app.txt");
});

test("line blame reverse maps through later insertions", () => {
  const cwd = setupGitRepo("ghostshift-line-insert-");

  writeFileSync(path.join(cwd, "app.txt"), "one\ntwo\nthree\n", "utf8");
  commitAll(cwd, "baseline");
  runCli(cwd, ["init"]);

  writeFileSync(path.join(cwd, "app.txt"), "one\ntwo\nthree changed\n", "utf8");
  const first = JSON.parse(runCli(cwd, ["run", "change line three", "--json"]));
  commitAll(cwd, "first session committed");

  writeFileSync(path.join(cwd, "app.txt"), "zero\none\ntwo\nthree changed\n", "utf8");
  runCli(cwd, ["run", "insert line above", "--json"]);

  const report = JSON.parse(runCli(cwd, ["blame", "app.txt", "--line", "4", "--json"]));

  assert.equal(report.precision, "line");
  assert.equal(report.matchedSession.id, first.id);
});

test("line blame reverse maps through deletions without false attribution", () => {
  const cwd = setupGitRepo("ghostshift-line-delete-");

  writeFileSync(path.join(cwd, "app.txt"), "one\ntwo\nthree\nfour\nfive\n", "utf8");
  commitAll(cwd, "baseline");
  runCli(cwd, ["init"]);

  writeFileSync(path.join(cwd, "app.txt"), "one\ntwo\nthree\nfour\nfive changed\n", "utf8");
  const first = JSON.parse(runCli(cwd, ["run", "change final line", "--json"]));
  commitAll(cwd, "first session committed");

  writeFileSync(path.join(cwd, "app.txt"), "one\nthree\nfour\nfive changed\n", "utf8");
  runCli(cwd, ["run", "delete second line", "--json"]);

  const report = JSON.parse(runCli(cwd, ["blame", "app.txt", "--line", "4", "--json"]));

  assert.equal(report.precision, "line");
  assert.equal(report.matchedSession.id, first.id);
});

test("line blame falls back to file-level history for legacy sessions without patches", () => {
  const cwd = setupGitRepo("ghostshift-line-legacy-");

  writeFileSync(path.join(cwd, "app.txt"), "one\ntwo\n", "utf8");
  commitAll(cwd, "baseline");
  runCli(cwd, ["init"]);

  const session = JSON.parse(runCli(cwd, ["run", "touch file", "--files", "app.txt", "--json"]));
  const sessionPath = path.join(cwd, ".ghostshift", "sessions", `${session.id}.json`);
  const legacySession = JSON.parse(readFileSync(sessionPath, "utf8"));
  delete legacySession.patches;
  writeFileSync(sessionPath, `${JSON.stringify(legacySession, null, 2)}\n`, "utf8");

  const report = JSON.parse(runCli(cwd, ["blame", "app.txt", "--line", "1", "--json"]));

  assert.equal(report.precision, "file");
  assert.equal(report.matchedSession.id, session.id);
  assert.equal(report.semanticSummary, null);
});

test("line blame includes semantic summary for branch-introducing lines", () => {
  const cwd = setupGitRepo("ghostshift-semantic-blame-branch-");

  writeFileSync(path.join(cwd, "app.ts"), "const ready = true;\n", "utf8");
  commitAll(cwd, "baseline");
  runCli(cwd, ["init"]);

  writeFileSync(path.join(cwd, "app.ts"), "const ready = true;\nif (ready) {\n  run();\n}\n", "utf8");
  const session = JSON.parse(runCli(cwd, ["run", "add branch", "--json"]));
  const report = JSON.parse(runCli(cwd, ["blame", "app.ts", "--line", "2", "--json"]));
  const explain = JSON.parse(runCli(cwd, ["explain", session.id, "--json"]));

  assert.equal(report.precision, "line");
  assert.equal(report.matchedSession.id, session.id);
  assert.ok(report.semanticSummary.labels.includes("branch-added"));
  assert.deepEqual(report.semanticSummary.labels, explain.semanticSummary.patches[0].labels);
  assert.equal(report.semanticSummary.headline, explain.semanticSummary.patches[0].headline);
});

test("line blame links related decisions for the matched file", () => {
  const cwd = setupGitRepo("ghostshift-decision-blame-");

  writeFileSync(path.join(cwd, "auth.ts"), "const token = read();\n", "utf8");
  commitAll(cwd, "baseline");
  runCli(cwd, ["init"]);

  writeFileSync(path.join(cwd, "auth.ts"), "const parsedToken = read();\n", "utf8");
  const session = JSON.parse(
    runCli(cwd, [
      "run",
      "rename auth token",
      "--decision",
      "rationale:rename auth variable for clarity",
      "--decision",
      "risk:avoid touching session loading",
      "--json"
    ])
  );

  const report = JSON.parse(runCli(cwd, ["blame", "auth.ts", "--line", "1", "--json"]));
  const human = runCli(cwd, ["blame", "auth.ts", "--line", "1"]);

  assert.equal(report.matchedSession.id, session.id);
  assert.equal(report.relatedDecisions.length >= 1, true);
  assert.match(report.relatedDecisions[0].summary, /rename auth variable/i);
  assert.match(human, /Decisions:/);
});

test("line blame includes semantic summary for identifier rename lines", () => {
  const cwd = setupGitRepo("ghostshift-semantic-blame-rename-");

  writeFileSync(path.join(cwd, "app.ts"), "const user = account.id;\n", "utf8");
  commitAll(cwd, "baseline");
  runCli(cwd, ["init"]);

  writeFileSync(path.join(cwd, "app.ts"), "const member = account.id;\n", "utf8");
  runCli(cwd, ["run", "rename identifier", "--json"]);
  const report = JSON.parse(runCli(cwd, ["blame", "app.ts", "--line", "1", "--json"]));

  assert.equal(report.precision, "line");
  assert.ok(report.semanticSummary.labels.includes("identifier-renamed"));
});

test("file-level semantic fallback returns semantic data when patch exists", () => {
  const cwd = setupGitRepo("ghostshift-semantic-file-fallback-");

  writeFileSync(path.join(cwd, "app.ts"), "const ready = true;\n", "utf8");
  commitAll(cwd, "baseline");
  runCli(cwd, ["init"]);

  writeFileSync(path.join(cwd, "app.ts"), "const ready = true;\nif (ready) {\n  run();\n}\n", "utf8");
  const session = JSON.parse(runCli(cwd, ["run", "add branch", "--json"]));

  const report = JSON.parse(runCli(cwd, ["blame", "app.ts", "--line", "99", "--json"]));

  assert.equal(report.precision, "file");
  assert.equal(report.matchedSession.id, session.id);
  assert.ok(report.semanticSummary);
  assert.ok(report.semanticSummary.labels.includes("branch-added"));
});

test("line blame returns no semantic data when no file history exists", () => {
  const cwd = setupGitRepo("ghostshift-semantic-none-");

  writeFileSync(path.join(cwd, "app.ts"), "const ready = true;\n", "utf8");
  commitAll(cwd, "baseline");
  runCli(cwd, ["init"]);

  const report = JSON.parse(runCli(cwd, ["blame", "missing.ts", "--line", "1", "--json"]));

  assert.equal(report.precision, "none");
  assert.equal(report.semanticSummary, null);
});

test("explain exposes patch summary when patch data exists", () => {
  const cwd = setupGitRepo("ghostshift-explain-patches-");

  writeFileSync(path.join(cwd, "app.txt"), "one\ntwo\n", "utf8");
  commitAll(cwd, "baseline");
  runCli(cwd, ["init"]);

  writeFileSync(path.join(cwd, "app.txt"), "one changed\ntwo\n", "utf8");
  const session = JSON.parse(runCli(cwd, ["run", "change app", "--json"]));
  const explain = JSON.parse(runCli(cwd, ["explain", session.id, "--json"]));

  assert.equal(explain.patchSummary.totalFiles, 1);
  assert.equal(explain.patchSummary.totalHunks, 1);
  assert.equal(explain.highlights.patchesCaptured, 1);
  assert.ok(explain.semanticSummary.headlines.length >= 1);
});

test("explain and export include provenance summaries", () => {
  const cwd = setupGitRepo("ghostshift-provenance-export-");

  writeFileSync(path.join(cwd, "auth.ts"), "const token = read();\n", "utf8");
  commitAll(cwd, "baseline");
  runCli(cwd, ["init"]);

  writeFileSync(path.join(cwd, "auth.ts"), "const parsedToken = read();\n", "utf8");
  const session = JSON.parse(
    runCli(cwd, [
      "run",
      "rename auth token",
      "--decision",
      "rationale:rename auth variable for clarity",
      "--decision",
      "risk:avoid touching session loading",
      "--json"
    ])
  );

  const explain = JSON.parse(runCli(cwd, ["explain", session.id, "--json"]));
  const exported = JSON.parse(runCli(cwd, ["export"]));

  assert.equal(explain.provenanceSummary.byFile.length, 1);
  assert.equal(explain.provenanceSummary.byFile[0].path, "auth.ts");
  assert.equal(explain.provenanceSummary.byFile[0].relatedDecisions.length >= 1, true);
  assert.ok(exported.capabilities.includes("decision-provenance"));
  assert.equal(exported.reports[session.id].provenanceSummary.byFile.length, 1);
});

test("export emits stable patch-aware payload with plugin sections and reports", () => {
  const cwd = setupGitRepo("ghostshift-export-stable-");

  writeFileSync(path.join(cwd, "app.ts"), "const user = account.id;\n", "utf8");
  commitAll(cwd, "baseline");
  runCli(cwd, ["init"]);

  writeFileSync(path.join(cwd, "app.ts"), "const member = account.id;\n", "utf8");
  const session = JSON.parse(
    runCli(cwd, ["run", "rename identifier", "--decision", "rationale:rename local", "--json"])
  );

  const exported = JSON.parse(runCli(cwd, ["export"]));

  assert.equal(exported.exportVersion, "1.0.0");
  assert.ok(exported.capabilities.includes("patch-aware-export"));
  assert.equal(exported.plugins.apiVersion, "1.0.0");
  assert.equal(exported.plugins.enabled.some((plugin) => plugin.id === "git"), true);
  assert.equal(exported.sessions[0].plugins.git.branch, "main");
  assert.ok(exported.reports[session.id]);
  assert.ok(exported.reports[session.id].semanticSummary.headlines.length >= 1);
  assert.equal(exported.plugins.exports.git.totalPatchedFiles, 1);
  assert.equal(exported.plugins.exports.shell.sessionsWithShellContext, 1);
});

test("semantic analyzer classifies new and deleted files from patch kind", () => {
  const added = analyzePatchSemanticsForTest({
    path: "new.ts",
    kind: "added",
    diff: "",
    hunks: [{ header: "@@ -0,0 +1,1 @@", oldStart: 0, oldLines: 0, newStart: 1, newLines: 1, lines: ["+const value = 1;"] }]
  });
  const deleted = analyzePatchSemanticsForTest({
    path: "old.ts",
    kind: "deleted",
    diff: "",
    hunks: [{ header: "@@ -1,1 +0,0 @@", oldStart: 1, oldLines: 1, newStart: 0, newLines: 0, lines: ["-const value = 1;"] }]
  });

  assert.ok(added.labels.includes("new-file"));
  assert.ok(deleted.labels.includes("deleted-file"));
});

test("semantic analyzer distinguishes added, removed, and modified lines", () => {
  const added = analyzePatchSemanticsForTest({
    path: "add.ts",
    kind: "modified",
    diff: "",
    hunks: [{ header: "@@ -1,0 +1,1 @@", oldStart: 1, oldLines: 0, newStart: 1, newLines: 1, lines: ["+const added = true;"] }]
  });
  const removed = analyzePatchSemanticsForTest({
    path: "remove.ts",
    kind: "modified",
    diff: "",
    hunks: [{ header: "@@ -1,1 +1,0 @@", oldStart: 1, oldLines: 1, newStart: 1, newLines: 0, lines: ["-const removed = true;"] }]
  });
  const modified = analyzePatchSemanticsForTest({
    path: "modify.ts",
    kind: "modified",
    diff: "",
    hunks: [{ header: "@@ -1,1 +1,1 @@", oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: ["-const before = 1;", "+const after = 2;"] }]
  });

  assert.ok(added.labels.includes("lines-added"));
  assert.ok(removed.labels.includes("lines-removed"));
  assert.ok(modified.labels.includes("lines-modified"));
});

test("semantic analyzer detects branch and signature changes", () => {
  const branch = analyzePatchSemanticsForTest({
    path: "branch.ts",
    kind: "modified",
    diff: "",
    hunks: [{ header: "@@ -1,1 +1,2 @@", oldStart: 1, oldLines: 1, newStart: 1, newLines: 2, lines: [" const ready = true;", "+if (ready) {", "+  run();"] }]
  });
  const signature = analyzePatchSemanticsForTest({
    path: "signature.ts",
    kind: "modified",
    diff: "",
    hunks: [{ header: "@@ -1,1 +1,1 @@", oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: ["-function load(user) {", "+function loadUser(user) {"] }]
  });

  assert.ok(branch.labels.includes("branch-added"));
  assert.ok(signature.labels.includes("signature-changed"));
});

test("semantic analyzer detects single identifier renames without overfiring", () => {
  const renamed = analyzePatchSemanticsForTest({
    path: "rename.ts",
    kind: "modified",
    diff: "",
    hunks: [{ header: "@@ -1,1 +1,1 @@", oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: ["-const user = account.id;", "+const member = account.id;"] }]
  });
  const unrelated = analyzePatchSemanticsForTest({
    path: "complex.ts",
    kind: "modified",
    diff: "",
    hunks: [{ header: "@@ -1,1 +1,1 @@", oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: ["-const user = a + b;", "+return account.lookup(id);"] }]
  });

  assert.ok(renamed.labels.includes("identifier-renamed"));
  assert.ok(!unrelated.labels.includes("identifier-renamed"));
});

test("session semantic summary aggregates per-patch labels and headlines", () => {
  const summary = summarizeSessionSemanticsForTest({
    patches: [
      {
        path: "branch.ts",
        kind: "modified",
        diff: "",
        hunks: [{ header: "@@ -1,1 +1,2 @@", oldStart: 1, oldLines: 1, newStart: 1, newLines: 2, lines: [" const ready = true;", "+if (ready) {", "+  run();"] }]
      },
      {
        path: "file.ts",
        kind: "added",
        diff: "",
        hunks: [{ header: "@@ -0,0 +1,1 @@", oldStart: 0, oldLines: 0, newStart: 1, newLines: 1, lines: ["+export const value = 1;"] }]
      }
    ]
  });

  assert.equal(summary.patches.length, 2);
  assert.ok(summary.labelCounts["branch-added"] >= 1);
  assert.ok(summary.labelCounts["new-file"] >= 1);
  assert.equal(summary.headlines.length, 2);
});

test("session provenance summary links decisions to matching files", () => {
  const summary = summarizeSessionProvenanceForTest(
    {
      files: ["src/auth.ts"],
      patches: [
        {
          path: "src/auth.ts",
          kind: "modified",
          diff: "",
          hunks: [
            {
              header: "@@ -1,1 +1,1 @@",
              oldStart: 1,
              oldLines: 1,
              newStart: 1,
              newLines: 1,
              lines: ["-const token = read();", "+const parsedToken = read();"]
            }
          ]
        }
      ],
      decisions: [
        {
          id: "dec_one",
          type: "rationale",
          summary: "rename auth variable for clarity"
        },
        {
          id: "dec_two",
          type: "risk",
          summary: "avoid touching payment flow"
        }
      ]
    },
    null
  );

  assert.equal(summary.byFile.length, 1);
  assert.equal(summary.byFile[0].relatedDecisions.length, 1);
  assert.match(summary.byFile[0].relatedDecisions[0].summary, /rename auth variable/i);
});

test("compare exposes semantic changes across two sessions", () => {
  const cwd = setupGitRepo("ghostshift-semantic-compare-");

  writeFileSync(path.join(cwd, "app.ts"), "const ready = true;\n", "utf8");
  commitAll(cwd, "baseline");
  runCli(cwd, ["init"]);

  writeFileSync(path.join(cwd, "app.ts"), "const ready = true;\nif (ready) {\n  run();\n}\n", "utf8");
  const left = JSON.parse(runCli(cwd, ["run", "add branch", "--json"]));
  commitAll(cwd, "left session committed");

  writeFileSync(path.join(cwd, "app.ts"), "const ready = true;\nconst runTask = () => {\n  run();\n};\n", "utf8");
  const right = JSON.parse(runCli(cwd, ["run", "change signature", "--json"]));

  const compare = JSON.parse(runCli(cwd, ["compare", left.id, right.id, "--json"]));

  assert.ok(compare.semanticChanges.removedLabels.includes("branch-added"));
  assert.ok(compare.semanticChanges.addedLabels.includes("signature-changed"));
  assert.ok(compare.semanticChanges.perFile.length >= 1);
});

test("compare exposes provenance changes across two sessions", () => {
  const cwd = setupGitRepo("ghostshift-provenance-compare-");

  writeFileSync(path.join(cwd, "auth.ts"), "const token = read();\n", "utf8");
  commitAll(cwd, "baseline");
  runCli(cwd, ["init"]);

  writeFileSync(path.join(cwd, "auth.ts"), "const parsedToken = read();\n", "utf8");
  const left = JSON.parse(
    runCli(cwd, [
      "run",
      "rename auth token",
      "--decision",
      "rationale:rename auth variable for clarity",
      "--json"
    ])
  );
  commitAll(cwd, "left session committed");

  writeFileSync(path.join(cwd, "auth.ts"), "if (enabled) {\n  const parsedToken = read();\n}\n", "utf8");
  const right = JSON.parse(
    runCli(cwd, [
      "run",
      "add auth guard",
      "--decision",
      "tradeoff:add auth guard before token read",
      "--json"
    ])
  );

  const compare = JSON.parse(runCli(cwd, ["compare", left.id, right.id, "--json"]));
  const human = runCli(cwd, ["compare", left.id, right.id]);

  assert.ok(compare.provenanceChanges.addedDecisionTypes.includes("tradeoff"));
  assert.ok(compare.provenanceChanges.removedDecisionTypes.includes("rationale"));
  assert.equal(compare.provenanceChanges.perFile.length >= 1, true);
  assert.match(human, /Provenance:/);
});

test("pr-summary renders markdown for the latest two sessions", () => {
  const cwd = setupGitRepo("ghostshift-pr-summary-compare-");

  writeFileSync(path.join(cwd, "auth.ts"), "const token = read();\n", "utf8");
  commitAll(cwd, "baseline");
  runCli(cwd, ["init"]);

  writeFileSync(path.join(cwd, "auth.ts"), "const parsedToken = read();\n", "utf8");
  runCli(
    cwd,
    ["run", "rename auth token", "--decision", "rationale:rename auth variable for clarity", "--json"]
  );
  commitAll(cwd, "left session committed");

  writeFileSync(path.join(cwd, "auth.ts"), "if (enabled) {\n  const parsedToken = read();\n}\n", "utf8");
  runCli(
    cwd,
    ["run", "add auth guard", "--decision", "tradeoff:add auth guard before token read", "--json"]
  );

  const markdown = runCli(cwd, ["pr-summary"]);

  assert.match(markdown, /# Ghostshift PR Summary/);
  assert.match(markdown, /## Sessions/);
  assert.match(markdown, /## Semantic Changes/);
  assert.match(markdown, /## Decision Provenance/);
});

test("pr-summary can render a single-session summary and write it to a file", () => {
  const cwd = setupGitRepo("ghostshift-pr-summary-single-");

  writeFileSync(path.join(cwd, "auth.ts"), "const token = read();\n", "utf8");
  commitAll(cwd, "baseline");
  runCli(cwd, ["init"]);

  writeFileSync(path.join(cwd, "auth.ts"), "const parsedToken = read();\n", "utf8");
  const session = JSON.parse(
    runCli(
      cwd,
      ["run", "rename auth token", "--decision", "rationale:rename auth variable for clarity", "--json"]
    )
  );

  const outputPath = path.join(cwd, "ghostshift-pr-summary.md");
  runCli(cwd, ["pr-summary", session.id, "--output", outputPath]);
  const markdown = readFileSync(outputPath, "utf8");
  const json = JSON.parse(runCli(cwd, ["pr-summary", session.id, "--json"]));

  assert.match(markdown, /## Session/);
  assert.match(markdown, /rename auth token/);
  assert.equal(json.mode, "single");
  assert.equal(json.sessionId, session.id);
});

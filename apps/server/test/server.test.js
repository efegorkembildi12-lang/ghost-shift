import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createGhostshiftServer } from "/Users/efegorkembildi/Code/ghostshift/apps/server/src/app.js";

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

function setupGitRepo(prefix = "ghostshift-server-") {
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

async function startServer(workspaceDir) {
  const server = createGhostshiftServer({ workspaceDir });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  return {
    baseUrl,
    close: async () => {
      await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  };
}

test("server preview exposes health, session APIs, compare, blame, export, and UI", async () => {
  const cwd = setupGitRepo("ghostshift-server-preview-");

  writeFileSync(path.join(cwd, "app.ts"), "const ready = true;\n", "utf8");
  commitAll(cwd, "baseline");
  runCli(cwd, ["init"]);

  writeFileSync(path.join(cwd, "app.ts"), "const ready = true;\nif (ready) {\n  run();\n}\n", "utf8");
  const left = JSON.parse(
    runCli(cwd, [
      "run",
      "add branch",
      "--decision",
      "tradeoff:add guard before run",
      "--json"
    ])
  );
  commitAll(cwd, "left session committed");

  writeFileSync(path.join(cwd, "app.ts"), "const ready = true;\nconst runTask = () => {\n  run();\n};\n", "utf8");
  const right = JSON.parse(
    runCli(cwd, [
      "run",
      "change signature",
      "--decision",
      "rationale:change run function signature",
      "--json"
    ])
  );

  const server = await startServer(cwd);

  try {
    const health = await fetchJson(`${server.baseUrl}/api/health`);
    const sessions = await fetchJson(`${server.baseUrl}/api/sessions`);
    const explain = await fetchJson(`${server.baseUrl}/api/explain/${right.id}`);
    const compare = await fetchJson(
      `${server.baseUrl}/api/compare?left=${encodeURIComponent(left.id)}&right=${encodeURIComponent(right.id)}`
    );
    const blame = await fetchJson(
      `${server.baseUrl}/api/blame?file=${encodeURIComponent("app.ts")}&line=2`
    );
    const exported = await fetchJson(`${server.baseUrl}/api/export`);
    const ui = await fetchText(`${server.baseUrl}/`);

    assert.equal(health.ok, true);
    assert.equal(sessions.sessions.length, 2);
    assert.equal(explain.report.provenanceSummary.byFile.length >= 1, true);
    assert.equal(compare.report.provenanceChanges.perFile.length >= 1, true);
    assert.equal(blame.report.relatedDecisions.length >= 1, true);
    assert.ok(exported.payload.capabilities.includes("decision-provenance"));
    assert.match(ui, /Ghostshift Preview/);
  } finally {
    await server.close();
  }
});

test("server import endpoint syncs exported sessions into another workspace", async () => {
  const source = setupGitRepo("ghostshift-server-import-source-");

  writeFileSync(path.join(source, "auth.ts"), "const token = read();\n", "utf8");
  commitAll(source, "baseline");
  runCli(source, ["init"]);

  writeFileSync(path.join(source, "auth.ts"), "const parsedToken = read();\n", "utf8");
  runCli(
    source,
    ["run", "rename auth token", "--decision", "rationale:rename auth variable for clarity", "--json"]
  );

  const payload = JSON.parse(runCli(source, ["export"]));

  const target = mkdtempSync(path.join(tmpdir(), "ghostshift-server-import-target-"));
  runCli(target, ["init"]);

  const server = await startServer(target);

  try {
    const imported = await fetchJson(`${server.baseUrl}/api/import`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    const sessions = await fetchJson(`${server.baseUrl}/api/sessions`);

    assert.equal(imported.result.total, payload.sessions.length);
    assert.equal(imported.result.imported, payload.sessions.length);
    assert.equal(sessions.sessions.length, payload.sessions.length);
  } finally {
    await server.close();
  }
});

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const payload = await response.json();
  assert.equal(response.ok, true, JSON.stringify(payload));
  return payload;
}

async function fetchText(url, options) {
  const response = await fetch(url, options);
  const payload = await response.text();
  assert.equal(response.ok, true, payload);
  return payload;
}

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  compareSessions,
  explainSession,
  exportSessions,
  getLineBlameReport,
  importExportPayload,
  initProject,
  listSessions,
  readSession,
  runDoctor
} from "../../../packages/core/src/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_UI_DIR = path.resolve(__dirname, "../../ui/public");

export function createGhostshiftServer({
  workspaceDir,
  uiDir = DEFAULT_UI_DIR
}) {
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://localhost");

      if (url.pathname.startsWith("/api/")) {
        await handleApiRequest({ request, response, url, workspaceDir });
        return;
      }

      await serveUiAsset({ response, url, uiDir });
    } catch (error) {
      sendJson(response, 500, {
        ok: false,
        error: error.message
      });
    }
  });
}

async function handleApiRequest({ request, response, url, workspaceDir }) {
  if (request.method === "GET" && url.pathname === "/api/health") {
    await initProject(workspaceDir);
    const doctor = await runDoctor(workspaceDir);
    sendJson(response, 200, {
      ok: true,
      workspaceDir,
      doctor
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/sessions") {
    const sessions = await listSessions(workspaceDir);
    sendJson(response, 200, {
      ok: true,
      sessions
    });
    return;
  }

  if (request.method === "GET" && url.pathname.startsWith("/api/sessions/")) {
    const sessionId = decodeURIComponent(url.pathname.slice("/api/sessions/".length));
    const session = await readSession(workspaceDir, sessionId);
    sendJson(response, 200, {
      ok: true,
      session
    });
    return;
  }

  if (request.method === "GET" && url.pathname.startsWith("/api/explain/")) {
    const sessionId = decodeURIComponent(url.pathname.slice("/api/explain/".length));
    const report = await explainSession(workspaceDir, sessionId);
    sendJson(response, 200, {
      ok: true,
      report
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/compare") {
    const left = url.searchParams.get("left");
    const right = url.searchParams.get("right");
    if (!left || !right) {
      sendJson(response, 400, {
        ok: false,
        error: "Both left and right query parameters are required."
      });
      return;
    }

    const report = await compareSessions(workspaceDir, left, right);
    sendJson(response, 200, {
      ok: true,
      report
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/blame") {
    const file = url.searchParams.get("file");
    const line = Number.parseInt(url.searchParams.get("line") ?? "", 10);
    if (!file || !Number.isInteger(line) || line <= 0) {
      sendJson(response, 400, {
        ok: false,
        error: "file and positive integer line query parameters are required."
      });
      return;
    }

    const report = await getLineBlameReport(workspaceDir, file, line);
    sendJson(response, 200, {
      ok: true,
      report
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/export") {
    const payload = await exportSessions(workspaceDir);
    sendJson(response, 200, {
      ok: true,
      payload
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/import") {
    const payload = await readJsonBody(request);
    await initProject(workspaceDir);
    const result = await importExportPayload(workspaceDir, payload);
    sendJson(response, 200, {
      ok: true,
      result
    });
    return;
  }

  sendJson(response, 404, {
    ok: false,
    error: "Not found"
  });
}

async function serveUiAsset({ response, url, uiDir }) {
  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  const requestedPath = path.normalize(path.join(uiDir, pathname));
  const insideUiDir = requestedPath.startsWith(path.normalize(uiDir));
  const targetPath = insideUiDir ? requestedPath : path.join(uiDir, "index.html");

  try {
    const filePath = targetPath.endsWith(".html") || targetPath.endsWith(".js") || targetPath.endsWith(".css")
      ? targetPath
      : path.join(uiDir, "index.html");
    const content = await readFile(filePath);
    response.writeHead(200, {
      "content-type": contentTypeForPath(filePath)
    });
    response.end(content);
  } catch {
    const fallback = await readFile(path.join(uiDir, "index.html"));
    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8"
    });
    response.end(fallback);
  }
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }

  const body = Buffer.concat(chunks).toString("utf8").trim();
  if (!body) {
    throw new Error("Request body must contain JSON.");
  }

  return JSON.parse(body);
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8"
  });
  response.end(`${JSON.stringify(payload, null, 2)}\n`);
}

function contentTypeForPath(targetPath) {
  if (targetPath.endsWith(".css")) {
    return "text/css; charset=utf-8";
  }
  if (targetPath.endsWith(".js")) {
    return "application/javascript; charset=utf-8";
  }
  return "text/html; charset=utf-8";
}

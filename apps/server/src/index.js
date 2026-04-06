#!/usr/bin/env node

import process from "node:process";
import { createGhostshiftServer } from "./app.js";

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h") || args.includes("help")) {
  console.log(`Ghostshift Preview Server

Usage:
  node apps/server/src/index.js

Environment:
  GHOSTSHIFT_WORKSPACE   Workspace to serve (defaults to current working directory)
  HOST                   Host to bind (defaults to 127.0.0.1)
  PORT                   Port to bind (defaults to 4310)
`);
  process.exit(0);
}

if (args.includes("--version") || args.includes("-v") || args.includes("version")) {
  console.log("1.0.0");
  process.exit(0);
}

const workspaceDir = process.env.GHOSTSHIFT_WORKSPACE
  ? process.env.GHOSTSHIFT_WORKSPACE
  : process.cwd();
const port = Number.parseInt(process.env.PORT ?? "4310", 10);
const host = process.env.HOST ?? "127.0.0.1";

const server = createGhostshiftServer({ workspaceDir });

server.listen(port, host, () => {
  console.log(`Ghostshift preview listening on http://${host}:${port}`);
  console.log(`Workspace: ${workspaceDir}`);
});

server.on("error", (error) => {
  console.error(`Ghostshift preview failed to start: ${error.message}`);
  process.exitCode = 1;
});

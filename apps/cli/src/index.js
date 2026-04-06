#!/usr/bin/env node

import { writeFile } from "node:fs/promises";
import process from "node:process";
import {
  buildPrSummary,
  compareSessions,
  explainSession,
  exportSessions,
  findSessionsByFile,
  getLineBlameReport,
  getVerificationReport,
  initProject,
  listSessions,
  replaySession,
  recordSession,
  runDoctor
} from "../../../packages/core/src/index.js";
import {
  printCompareReport,
  printDoctor,
  printExplanation,
  printError,
  printHelp,
  printLineBlameReport,
  printReplayReport,
  printSessions,
  printSuccess,
  printVerificationReport
} from "./format.js";
import {
  parseCliArgs,
  parseDecisionOption,
  parseFilesOption,
  parseVerificationOption
} from "./parse.js";

async function main() {
  const { command, positionals, options } = parseCliArgs(process.argv.slice(2));
  const cwd = process.cwd();
  const invocation = process.argv.slice(1).join(" ");

  switch (command) {
    case undefined:
    case "help":
    case "--help":
    case "-h":
      printHelp();
      return;
    case "--version":
    case "-v":
    case "version":
      console.log("1.0.0");
      return;
    case "init": {
      const result = await initProject(cwd);
      printSuccess(`Initialized Ghostshift in ${result.baseDir}`);
      return;
    }
    case "run": {
      const task = positionals.join(" ").trim();
      if (!task) {
        throw new Error("Missing task. Usage: ghostshift run \"your task\"");
      }

      const session = await recordSession({
        cwd,
        task,
        files: parseFilesOption(options.files),
        note: options.note ? String(options.note) : undefined,
        decisions: parseDecisionOption(options.decision),
        verification: parseVerificationOption(options.verify),
        invocation
      });

      if (options.json) {
        console.log(JSON.stringify(session, null, 2));
        return;
      }

      printSuccess(`Recorded ${session.id} for task: ${session.task}`);
      return;
    }
    case "trace": {
      const sessions = await listSessions(cwd);
      if (options.json) {
        console.log(JSON.stringify(sessions, null, 2));
        return;
      }

      printSessions(sessions);
      return;
    }
    case "blame": {
      const file = positionals[0];
      if (!file) {
        throw new Error("Missing file. Usage: ghostshift blame <path>");
      }

      if (options.line !== undefined) {
        const parsedLine = Number.parseInt(String(options.line), 10);
        if (!Number.isInteger(parsedLine) || parsedLine <= 0) {
          throw new Error("Invalid line. Usage: ghostshift blame <path> --line <positive integer>");
        }

        const report = await getLineBlameReport(cwd, file, parsedLine);
        if (options.json) {
          console.log(JSON.stringify(report, null, 2));
          return;
        }

        printLineBlameReport(report);
        return;
      }

      const sessions = await findSessionsByFile(cwd, file);
      if (options.json) {
        console.log(JSON.stringify(sessions, null, 2));
        return;
      }

      printSessions(sessions);
      return;
    }
    case "export": {
      const payload = await exportSessions(cwd, options.output ? String(options.output) : undefined);
      if (!options.output) {
        console.log(JSON.stringify(payload, null, 2));
      } else {
        printSuccess(`Exported ${payload.sessions.length} sessions to ${payload.outputPath}`);
      }
      return;
    }
    case "explain": {
      const sessionId = positionals[0];
      if (!sessionId) {
        throw new Error("Missing session id. Usage: ghostshift explain <session-id>");
      }

      const report = await explainSession(cwd, sessionId);
      if (options.json) {
        console.log(JSON.stringify(report, null, 2));
        return;
      }

      printExplanation(report);
      return;
    }
    case "verify": {
      const sessionId = positionals[0];
      if (!sessionId) {
        throw new Error("Missing session id. Usage: ghostshift verify <session-id>");
      }

      const report = await getVerificationReport(cwd, sessionId);
      if (options.json) {
        console.log(JSON.stringify(report, null, 2));
        return;
      }

      printVerificationReport(report);
      return;
    }
    case "replay": {
      const sessionId = positionals[0];
      if (!sessionId) {
        throw new Error("Missing session id. Usage: ghostshift replay <session-id>");
      }

      const report = await replaySession(cwd, sessionId, {
        note: options.note ? String(options.note) : undefined,
        reason: options.reason ? String(options.reason) : undefined,
        decisions: parseDecisionOption(options.decision),
        verification: parseVerificationOption(options.verify),
        invocation
      });

      if (options.json) {
        console.log(JSON.stringify(report, null, 2));
        return;
      }

      printReplayReport(report);
      return;
    }
    case "compare": {
      const leftId = positionals[0];
      const rightId = positionals[1];
      if (!leftId || !rightId) {
        throw new Error("Missing session ids. Usage: ghostshift compare <left> <right>");
      }

      const report = await compareSessions(cwd, leftId, rightId);
      if (options.json) {
        console.log(JSON.stringify(report, null, 2));
        return;
      }

      printCompareReport(report);
      return;
    }
    case "pr-summary": {
      const leftId = positionals[0];
      const rightId = positionals[1];
      const summary = await buildPrSummary(cwd, leftId, rightId);

      if (options.json) {
        console.log(JSON.stringify(summary, null, 2));
        return;
      }

      if (options.output) {
        await writeFile(String(options.output), summary.markdown, "utf8");
        printSuccess(`Wrote PR summary to ${options.output}`);
        return;
      }

      process.stdout.write(summary.markdown);
      return;
    }
    case "doctor": {
      const result = await runDoctor(cwd);
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      printDoctor(result);
      if (!result.ok) {
        process.exitCode = 1;
      }
      return;
    }
    default:
      throw new Error(`Unknown command "${command}". Run ghostshift help.`);
  }
}

main().catch((error) => {
  printError(error.message);
  process.exitCode = 1;
});

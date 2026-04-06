export function printHelp() {
  console.log(`Ghostshift

Usage:
  ghostshift <command> [options]

Commands:
  init                       Initialize .ghostshift in the current project
  run <task>                 Record a task-oriented AI work session
  trace                      List captured sessions
  blame <file>               Show sessions that touched a file
  explain <session-id>       Explain why a session happened
  verify <session-id>        Show verification state for a session
  replay <session-id>        Create a new session from an earlier one
  compare <left> <right>     Compare two sessions
  pr-summary [left] [right]  Render a Markdown PR summary from one or two sessions
  export [--output path]     Export all session data as JSON
  doctor                     Validate project setup
  help                       Show this help text

Options:
  --files a,b,c              Attach touched files to a session
  --line n                   Resolve line-aware blame for the current file line
  --note "text"              Add a freeform note to a session
  --decision "type:text"     Record a decision note on run
  --verify "name:status"     Record a verification result on run
  --reason "text"            Attach a replay reason
  --output path              Write export or PR summary output to a file
  --json                     Emit JSON output where supported
`);
}

export function printError(message) {
  console.error(`Error: ${message}`);
}

export function printSuccess(message) {
  console.log(message);
}

export function printSessions(sessions) {
  if (sessions.length === 0) {
    console.log("No sessions recorded yet.");
    return;
  }

  for (const session of sessions) {
    console.log(`${session.id}  ${session.createdAt}  ${session.task}`);
    if (session.files.length > 0) {
      console.log(`  files: ${session.files.join(", ")}`);
    }
    if (session.replay) {
      console.log(`  replayed-from: ${session.replay.sourceSessionId}`);
    }
  }
}

export function printLineBlameReport(report) {
  console.log(`Path: ${report.path}`);
  console.log(`Line: ${report.line}`);
  console.log(`Precision: ${report.precision}`);

  if (report.precision === "none") {
    console.log("No recorded session history matched this file.");
    return;
  }

  if (report.precision === "file") {
    console.log(`Latest file-level session: ${report.matchedSession.id}`);
    console.log(`Task: ${report.matchedSession.task}`);
    if (report.semanticSummary) {
      console.log(
        `Semantic: ${report.semanticSummary.headline} [${report.semanticSummary.labels.join(", ")}]`
      );
    }
    if (report.relatedDecisions?.length) {
      console.log("Decisions:");
      for (const decision of report.relatedDecisions) {
        console.log(`  - [${decision.type}] ${decision.summary}`);
      }
    }
    console.log("No patch hunk matched this line. Falling back to file-level history.");
    return;
  }

  console.log(`Matched session: ${report.matchedSession.id}`);
  console.log(`Task: ${report.matchedSession.task}`);
  if (report.matchedLineage?.length > 1) {
    console.log(`Lineage: ${report.matchedLineage.join(" -> ")}`);
  }
  if (report.matchedHunk) {
    console.log(`Hunk: ${report.matchedHunk.header}`);
    console.log("Excerpt:");
    for (const line of report.matchedHunk.excerpt) {
      console.log(`  ${line}`);
    }
  }
  if (report.semanticSummary) {
    console.log(
      `Semantic: ${report.semanticSummary.headline} [${report.semanticSummary.labels.join(", ")}]`
    );
  }
  if (report.relatedDecisions?.length) {
    console.log("Decisions:");
    for (const decision of report.relatedDecisions) {
      console.log(`  - [${decision.type}] ${decision.summary}`);
    }
  }
}

export function printDoctor(result) {
  for (const check of result.checks) {
    const prefix = check.ok ? "[ok]" : "[x]";
    console.log(`${prefix} ${check.label}`);
  }

  if (result.ok) {
    console.log("Ghostshift project looks healthy.");
  } else {
    console.log("Ghostshift found setup issues.");
  }
}

export function printExplanation(report) {
  const {
    session,
    verificationSummary,
    patchSummary,
    semanticSummary,
    provenanceSummary,
    replayLineage
  } = report;

  console.log(`Task: ${session.task}`);
  console.log(`Session: ${session.id}`);
  console.log(`Created: ${session.createdAt}`);
  console.log(`Workspace: ${session.workspace.cwd}`);
  console.log(
    `Git: ${session.workspace.gitBranch ?? "unknown"} @ ${session.workspace.gitCommit ?? "unknown"}`
  );
  console.log(`Files: ${session.files.length === 0 ? "none" : session.files.join(", ")}`);
  console.log(
    `Verification: ${verificationSummary.overallStatus} (${verificationSummary.total} checks)`
  );
  if (patchSummary.totalFiles > 0) {
    console.log(
      `Patches: ${patchSummary.totalFiles} files, ${patchSummary.totalHunks} hunks (${patchSummary.byKind.added} added / ${patchSummary.byKind.modified} modified / ${patchSummary.byKind.deleted} deleted)`
    );
  }
  if (semanticSummary.headlines.length > 0) {
    console.log(
      `Semantic: ${Object.entries(semanticSummary.labelCounts)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([label, count]) => `${label}=${count}`)
        .join(", ")}`
    );
    for (const headline of semanticSummary.headlines) {
      console.log(`  - ${headline}`);
    }
  }
  if (provenanceSummary.headlines.length > 0) {
    console.log(
      `Provenance: ${Object.entries(provenanceSummary.decisionTypes)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([type, count]) => `${type}=${count}`)
        .join(", ")}`
    );
    for (const headline of provenanceSummary.headlines) {
      console.log(`  - ${headline}`);
    }
  }
  if (session.replay) {
    console.log(`Replay: ${session.replay.sourceSessionId}`);
    if (session.replay.reason) {
      console.log(`Replay reason: ${session.replay.reason}`);
    }
  }
  if (replayLineage.length > 1) {
    console.log(`Lineage: ${replayLineage.join(" -> ")}`);
  }

  if (session.decisions.length === 0) {
    console.log("Decisions: none recorded");
  } else {
    console.log("Decisions:");
    for (const decision of session.decisions) {
      console.log(`  - [${decision.type}] ${decision.summary}`);
    }
  }

  if (session.verification.length === 0) {
    console.log("Checks: none recorded");
  } else {
    console.log("Checks:");
    for (const check of session.verification) {
      const details = check.details ? ` (${check.details})` : "";
      console.log(`  - ${check.name}: ${check.status}${details}`);
    }
  }
}

export function printVerificationReport(report) {
  console.log(`Session: ${report.session.id}`);
  console.log(`Task: ${report.session.task}`);
  console.log(`Overall: ${report.overallStatus}`);
  console.log(
    `Counts: passed=${report.counts.passed} failed=${report.counts.failed} pending=${report.counts.pending} running=${report.counts.running} skipped=${report.counts.skipped}`
  );

  if (report.checks.length === 0) {
    console.log("No verification checks recorded.");
  } else {
    for (const check of report.checks) {
      const details = check.details ? ` (${check.details})` : "";
      console.log(`- ${check.name}: ${check.status}${details}`);
    }
  }

  if (report.pluginReports?.length) {
    console.log("Plugin reports:");
    for (const pluginReport of report.pluginReports) {
      console.log(`- ${pluginReport.title}`);
      for (const line of pluginReport.lines) {
        console.log(`  ${line}`);
      }
    }
  }
}

export function printReplayReport(report) {
  console.log(`Created replay session: ${report.replaySession.id}`);
  console.log(`Source session: ${report.sourceSession.id}`);
  console.log(`Task: ${report.replaySession.task}`);
  console.log(`Files: ${report.replaySession.files.length === 0 ? "none" : report.replaySession.files.join(", ")}`);
  console.log(`Verification: ${report.verificationSummary.overallStatus}`);
  if (report.replaySession.replay?.reason) {
    console.log(`Reason: ${report.replaySession.replay.reason}`);
  }
}

export function printCompareReport(report) {
  console.log(`Left: ${report.left.id}`);
  console.log(`Right: ${report.right.id}`);
  console.log(`Task changed: ${report.taskChanged ? "yes" : "no"}`);
  console.log(`Verification: ${report.verification.left} -> ${report.verification.right}`);

  if (report.files.added.length || report.files.removed.length) {
    console.log("Files:");
    if (report.files.added.length) {
      console.log(`  + ${report.files.added.join(", ")}`);
    }
    if (report.files.removed.length) {
      console.log(`  - ${report.files.removed.join(", ")}`);
    }
  } else {
    console.log("Files: unchanged");
  }

  if (report.decisions.added.length || report.decisions.removed.length) {
    console.log("Decisions:");
    if (report.decisions.added.length) {
      console.log(`  + ${report.decisions.added.join(" | ")}`);
    }
    if (report.decisions.removed.length) {
      console.log(`  - ${report.decisions.removed.join(" | ")}`);
    }
  } else {
    console.log("Decisions: unchanged");
  }

  if (report.decisions.byType.length) {
    console.log("Decision types:");
    for (const entry of report.decisions.byType) {
      const parts = [];
      if (entry.added.length) {
        parts.push(`+ ${entry.added.join(" | ")}`);
      }
      if (entry.removed.length) {
        parts.push(`- ${entry.removed.join(" | ")}`);
      }
      console.log(`  ${entry.type}: ${parts.join(" ; ")}`);
    }
  }

  const verificationChanges = report.verification.changes;
  if (
    verificationChanges.added.length ||
    verificationChanges.removed.length ||
    verificationChanges.changed.length
  ) {
    console.log("Verification checks:");
    for (const check of verificationChanges.added) {
      console.log(`  + ${check.name}: ${check.to}`);
    }
    for (const check of verificationChanges.removed) {
      console.log(`  - ${check.name}: ${check.from}`);
    }
    for (const check of verificationChanges.changed) {
      console.log(`  ~ ${check.name}: ${check.from} -> ${check.to}`);
    }
  } else {
    console.log("Verification checks: unchanged");
  }

  if (report.replayRelation) {
    console.log(`Replay relation: ${report.replayRelation}`);
  }
  if (report.lineage.commonAncestor) {
    console.log(`Common ancestor: ${report.lineage.commonAncestor}`);
  }

  const semanticChanges = report.semanticChanges;
  if (
    semanticChanges.addedLabels.length ||
    semanticChanges.removedLabels.length ||
    semanticChanges.commonLabels.length
  ) {
    console.log("Semantic changes:");
    if (semanticChanges.addedLabels.length) {
      console.log(`  + labels: ${semanticChanges.addedLabels.join(", ")}`);
    }
    if (semanticChanges.removedLabels.length) {
      console.log(`  - labels: ${semanticChanges.removedLabels.join(", ")}`);
    }
    if (semanticChanges.commonLabels.length) {
      console.log(`  = labels: ${semanticChanges.commonLabels.join(", ")}`);
    }

    for (const fileChange of semanticChanges.perFile) {
      if (fileChange.leftHeadline === fileChange.rightHeadline && fileChange.addedLabels.length === 0 && fileChange.removedLabels.length === 0) {
        continue;
      }

      console.log(`  ${fileChange.path}: ${fileChange.leftHeadline ?? "none"} -> ${fileChange.rightHeadline ?? "none"}`);
    }
  }

  const provenanceChanges = report.provenanceChanges;
  if (
    provenanceChanges.addedDecisionTypes.length ||
    provenanceChanges.removedDecisionTypes.length ||
    provenanceChanges.commonDecisionTypes.length
  ) {
    console.log("Provenance:");
    if (provenanceChanges.addedDecisionTypes.length) {
      console.log(`  + decision types: ${provenanceChanges.addedDecisionTypes.join(", ")}`);
    }
    if (provenanceChanges.removedDecisionTypes.length) {
      console.log(`  - decision types: ${provenanceChanges.removedDecisionTypes.join(", ")}`);
    }
    if (provenanceChanges.commonDecisionTypes.length) {
      console.log(`  = decision types: ${provenanceChanges.commonDecisionTypes.join(", ")}`);
    }

    for (const fileChange of provenanceChanges.perFile) {
      if (
        fileChange.leftHeadline === fileChange.rightHeadline &&
        fileChange.addedDecisions.length === 0 &&
        fileChange.removedDecisions.length === 0
      ) {
        continue;
      }

      console.log(
        `  ${fileChange.path}: ${fileChange.leftHeadline ?? "none"} -> ${fileChange.rightHeadline ?? "none"}`
      );
    }
  }
}

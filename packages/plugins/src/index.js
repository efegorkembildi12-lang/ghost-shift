import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { summarizePatches } from "../../spec/src/index.js";

export const PLUGIN_API_VERSION = "1.0.0";

const BUILTIN_PLUGINS = [createGitPlugin(), createShellPlugin()];
const BUILTIN_PLUGIN_MAP = new Map(BUILTIN_PLUGINS.map((plugin) => [plugin.id, plugin]));

export function listBuiltinPlugins() {
  return BUILTIN_PLUGINS.map((plugin) => ({
    id: plugin.id,
    displayName: plugin.displayName,
    hookNames: Object.keys(plugin).filter((key) => key !== "id" && key !== "displayName")
  }));
}

export async function loadPlugins(cwd, enabled = ["git", "shell"]) {
  const pluginRefs = enabled.length > 0 ? enabled : ["git", "shell"];
  const loaded = [];

  for (const pluginRef of pluginRefs) {
    if (BUILTIN_PLUGIN_MAP.has(pluginRef)) {
      loaded.push(BUILTIN_PLUGIN_MAP.get(pluginRef));
      continue;
    }

    const modulePath = path.resolve(cwd, pluginRef);
    const module = await import(pathToFileURL(modulePath).href);
    const plugin = module.default ?? module.plugin ?? module;
    loaded.push(assertValidPlugin(plugin, pluginRef));
  }

  return loaded;
}

export function describePlugins(plugins) {
  return plugins.map((plugin) => ({
    id: plugin.id,
    displayName: plugin.displayName,
    hookNames: Object.keys(plugin).filter((key) => key !== "id" && key !== "displayName")
  }));
}

export async function applyCapturePlugins(runtimePlugins, context) {
  let patches = (context.patches ?? []).map((patch) => ({
    ...patch,
    metadata: { ...(patch.metadata ?? {}) }
  }));
  const pluginData = {};

  for (const plugin of runtimePlugins) {
    if (typeof plugin.captureSession === "function") {
      const result = await plugin.captureSession({ ...context, patches });
      if (result && Object.keys(result).length > 0) {
        pluginData[plugin.id] = result;
      }
    }

    if (typeof plugin.enrichPatch === "function" && patches.length > 0) {
      patches = await Promise.all(
        patches.map(async (patch) => {
          const enrichment = await plugin.enrichPatch({ ...context, patch });
          if (!enrichment || Object.keys(enrichment).length === 0) {
            return patch;
          }

          return {
            ...patch,
            metadata: {
              ...(patch.metadata ?? {}),
              [plugin.id]: enrichment
            }
          };
        })
      );
    }
  }

  return {
    patches,
    plugins: pluginData
  };
}

export async function buildVerificationPluginReports(runtimePlugins, context) {
  const reports = [];

  for (const plugin of runtimePlugins) {
    if (typeof plugin.reportVerification !== "function") {
      continue;
    }

    const report = await plugin.reportVerification(context);
    if (report && report.lines?.length) {
      reports.push({
        plugin: plugin.id,
        title: report.title ?? plugin.displayName,
        lines: report.lines
      });
    }
  }

  return reports;
}

export async function buildExportPluginSections(runtimePlugins, context) {
  const sections = {};

  for (const plugin of runtimePlugins) {
    if (typeof plugin.consumeExport !== "function") {
      continue;
    }

    const section = await plugin.consumeExport(context);
    if (section && Object.keys(section).length > 0) {
      sections[plugin.id] = section;
    }
  }

  return sections;
}

function createGitPlugin() {
  return {
    id: "git",
    displayName: "Git Adapter",
    async captureSession({ gitInfo, patches }) {
      const normalizedPatches = patches ?? [];
      const patchSummary = summarizePatches(normalizedPatches);

      return {
        branch: gitInfo.branch ?? null,
        commit: gitInfo.commit ?? null,
        dirtyPaths: normalizedPatches.map((patch) => patch.path),
        patchSummary
      };
    },
    async enrichPatch({ patch }) {
      const stats = countPatchEdits(patch);
      return {
        hunks: patch.hunks.length,
        addedLines: stats.addedLines,
        removedLines: stats.removedLines
      };
    },
    async reportVerification({ session }) {
      const pluginData = session.plugins?.git;
      if (!pluginData) {
        return null;
      }

      const branch = pluginData.branch ?? "unknown";
      const commit = pluginData.commit ?? "unknown";
      const dirtyFiles = pluginData.patchSummary?.totalFiles ?? 0;

      return {
        title: "Git context",
        lines: [
          `Branch: ${branch}`,
          `Commit: ${commit}`,
          `Patched files: ${dirtyFiles}`
        ]
      };
    },
    async consumeExport({ sessions }) {
      const branches = [...new Set(sessions.map((session) => session.workspace.gitBranch).filter(Boolean))].sort();
      const commits = sessions.filter((session) => session.workspace.gitCommit).length;
      const patchedFiles = sessions.reduce(
        (total, session) => total + (session.patches ?? []).length,
        0
      );

      return {
        sessionsWithGitContext: commits,
        branches,
        totalPatchedFiles: patchedFiles
      };
    }
  };
}

function createShellPlugin() {
  return {
    id: "shell",
    displayName: "Shell Adapter",
    async captureSession({ invocation }) {
      const executable = process.env.SHELL ?? null;
      return {
        executable,
        name: executable ? path.basename(executable) : null,
        platform: process.platform,
        invocation: invocation ?? "ghostshift"
      };
    },
    async reportVerification({ session }) {
      const pluginData = session.plugins?.shell;
      if (!pluginData) {
        return null;
      }

      return {
        title: "Shell context",
        lines: [
          `Shell: ${pluginData.name ?? "unknown"}`,
          `Platform: ${pluginData.platform}`,
          `Invocation: ${pluginData.invocation}`
        ]
      };
    },
    async consumeExport({ sessions }) {
      const names = [
        ...new Set(
          sessions
            .map((session) => session.plugins?.shell?.name)
            .filter(Boolean)
        )
      ].sort();

      return {
        sessionsWithShellContext: sessions.filter((session) => session.plugins?.shell).length,
        shells: names
      };
    }
  };
}

function assertValidPlugin(plugin, pluginRef) {
  if (!plugin || typeof plugin !== "object") {
    throw new Error(`Plugin "${pluginRef}" did not export a plugin object.`);
  }

  if (!plugin.id || !plugin.displayName) {
    throw new Error(`Plugin "${pluginRef}" must define "id" and "displayName".`);
  }

  return plugin;
}

function countPatchEdits(patch) {
  let addedLines = 0;
  let removedLines = 0;

  for (const hunk of patch.hunks ?? []) {
    for (const line of hunk.lines ?? []) {
      if (line.startsWith("+") && !line.startsWith("+++")) {
        addedLines += 1;
      } else if (line.startsWith("-") && !line.startsWith("---")) {
        removedLines += 1;
      }
    }
  }

  return { addedLines, removedLines };
}

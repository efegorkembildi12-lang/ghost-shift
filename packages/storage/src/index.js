import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

export async function ensureDir(dirPath) {
  await mkdir(dirPath, { recursive: true });
}

export async function exists(targetPath) {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function writeJson(filePath, data) {
  await ensureDir(path.dirname(filePath));
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

export async function readJson(filePath) {
  const content = await readFile(filePath, "utf8");
  return JSON.parse(content);
}

export async function listJsonFiles(dirPath) {
  if (!(await exists(dirPath))) {
    return [];
  }

  const names = await readdir(dirPath);
  return names
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => path.join(dirPath, name));
}

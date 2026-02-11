import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const FORMATTED_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".json",
  ".css",
  ".md",
  ".yml",
  ".yaml",
]);

function shouldCheck(filePath) {
  return FORMATTED_EXTENSIONS.has(path.extname(filePath));
}

const SKIP_DIRECTORIES = new Set([".git", ".next", "node_modules", "coverage"]);

function listFilesRecursively(rootDirectory) {
  const files = [];
  const entries = readdirSync(rootDirectory, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name.startsWith(".") && entry.name !== ".github") {
      continue;
    }

    const fullPath = path.join(rootDirectory, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRECTORIES.has(entry.name)) {
        continue;
      }
      files.push(...listFilesRecursively(fullPath));
      continue;
    }

    files.push(fullPath);
  }

  return files;
}

function listFilesFromStdin() {
  try {
    const stdin = readFileSync(0, "utf8");
    return stdin
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function collectFormattingIssues(filePath) {
  const contents = readFileSync(filePath, "utf8");
  const issues = [];
  const lines = contents.split("\n");

  lines.forEach((line, index) => {
    if (/[ \t]+$/.test(line)) {
      issues.push(`${filePath}:${index + 1} trailing whitespace`);
    }
  });

  if (contents.length > 0 && !contents.endsWith("\n")) {
    issues.push(`${filePath}: missing trailing newline`);
  }

  return issues;
}

const filesFromStdin = listFilesFromStdin();
const files = filesFromStdin.length > 0 ? filesFromStdin : listFilesRecursively(".");
const issues = files
  .filter(shouldCheck)
  .flatMap((filePath) => collectFormattingIssues(filePath));

if (issues.length > 0) {
  console.error("Formatting check failed:");
  for (const issue of issues) {
    console.error(`- ${issue}`);
  }
  process.exit(1);
}

console.log(`Formatting check passed for ${files.filter(shouldCheck).length} files.`);

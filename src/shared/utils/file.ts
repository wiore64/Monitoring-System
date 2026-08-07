import fs from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT_URL = new URL("../../../", import.meta.url);

export function appendFile(
  relativePath: string,
  content: string,
  options: { basePath?: string | URL; delimeter?: string } = {},
): void {
  fs.appendFileSync(
    resolvePath(options.basePath ?? ROOT_URL, relativePath),
    content + (options.delimeter ?? "\n"),
    {
      encoding: "utf-8",
    },
  );
}

export function writeFile(
  relativePath: string,
  content: string,
  options: { basePath?: string | URL } = {},
): void {
  fs.writeFileSync(resolvePath(options.basePath ?? ROOT_URL, relativePath), content, {
    encoding: "utf-8",
  });
}

export function readFile(relativePath: string, options: { basePath?: string | URL } = {}): string {
  return fs.readFileSync(resolvePath(options.basePath ?? ROOT_URL, relativePath), {
    encoding: "utf-8",
  });
}

export function writeJsonFile(
  relativePath: string,
  content: object,
  options: { basePath?: string | URL; indentation?: number } = {},
): void {
  writeFile(relativePath, JSON.stringify(content, null, options.indentation ?? 2), options);
}

export function readJsonFile<T>(
  relativePath: string,
  options: { basePath?: string | URL } = {},
): T {
  return JSON.parse(readFile(relativePath, options));
}

export function createDirectory(
  relativePath: string,
  options: { basePath?: string | URL } = {},
): void {
  fs.mkdirSync(resolvePath(options.basePath ?? ROOT_URL, relativePath), { recursive: true });
}

function resolvePath(basePath: string | URL, relativePath: string): string {
  return fileURLToPath(new URL(relativePath, basePath));
}

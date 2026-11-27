import fs from "node:fs";

export function appendFile(relativePath: string, content: string, delimiter = "\n"): void {
  fs.appendFileSync(relativePath, content + delimiter, {
    encoding: "utf-8",
  });
}

export function writeFile(relativePath: string, content: string): void {
  fs.writeFileSync(relativePath, content, {
    encoding: "utf-8",
  });
}

export function readFile(relativePath: string): string {
  ensureFileExists(relativePath);
  return fs.readFileSync(relativePath, {
    encoding: "utf-8",
  });
}

export function writeJsonFile(relativePath: string, content: object, indentation = 2): void {
  writeFile(relativePath, JSON.stringify(content, null, indentation));
}

export function readJsonFile<T>(relativePath: string): T {
  ensureFileExists(relativePath, "{}");
  return JSON.parse(readFile(relativePath));
}

export function createDirectory(relativePath: string): void {
  fs.mkdirSync(relativePath, { recursive: true });
}

function ensureFileExists(relativePath: string, defContent: string = ""): void {
  if (fs.existsSync(relativePath)) {
    return;
  }

  fs.writeFileSync(relativePath, defContent);
}

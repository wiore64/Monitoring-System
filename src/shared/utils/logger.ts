import { ValidationError } from "#shared/error.js";
import { appendFile } from "#utils/file.js";

const LOG_PATHS: Record<LogLevel, string> = {
  debug: "./logs/debug.log",
  info: "./logs/info.log",
  warn: "./logs/warn.log",
  severe: "./logs/severe.log",
} as const;

type LogLevel = "debug" | "info" | "warn" | "severe";

export function generateTraceId(): string {
  return crypto.randomUUID();
}

export function debug(origin: string, message: string, traceId: string): void {
  log("debug", origin, message, traceId);
}

export function info(origin: string, message: string, traceId: string): void {
  log("info", origin, message, traceId);
}

export function warn(origin: string, message: string, traceId: string): void {
  log("warn", origin, message, traceId);
}

export function severe(origin: string, message: string, traceId: string): void {
  log("severe", origin, message, traceId);
}

function log(level: LogLevel, origin: string, message: string, traceId: string): void {
  const path = LOG_PATHS[level];
  const record = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    origin,
    message,
    traceId,
  });

  switch (level) {
    case "debug":
      saveRecord(path, record);
      break;
    case "info":
      console.info(record);
      saveRecord(path, record);
      break;
    case "warn":
      console.warn(record);
      saveRecord(path, record);
      break;
    case "severe":
      console.error(record);
      saveRecord(path, record);
      break;
    default:
      throw new ValidationError(
        `Unknown log level '${level}' for the log record: ${record}`,
        "UNKNOWN_LOG_LEVEL",
      );
  }
}

function saveRecord(path: string, record: string): void {
  appendFile(path, record);
}

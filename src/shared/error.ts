const DNS_ERROR_CODES: ReadonlySet<string> = new Set([
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ENOTFOUND",
  // "EAI_AGAIN",
]);

export class ValidationError extends Error {
  readonly code: string;
  readonly stack: string;

  constructor(message: string, code: string, stack?: string, cause?: Error) {
    super(message, { cause });
    this.name = "ValidationError";
    this.code = code;
    this.stack = stack ?? "No stack trace provided";
  }
}

export abstract class ConnectionError extends Error {
  readonly code: string;
  readonly stack: string;

  protected constructor(message: string, code: string, stack?: string, cause?: Error) {
    super(message, cause);
    this.name = "ConnectionError";
    this.code = code;
    this.stack = stack ?? "No stack trace provided";
  }
}

export class HttpError extends ConnectionError {
  constructor(message: string, code: string, stack?: string, cause?: Error) {
    super(message, code, stack, cause);
    this.name = "HttpError";
  }
}

export class DnsError extends ConnectionError {
  constructor(message: string, code: string, stack?: string, cause?: Error) {
    super(message, code, stack, cause);
    this.name = "DnsError";
  }
}

export class TimeoutError extends ConnectionError {
  constructor(message: string, code: string, stack?: string, cause?: Error) {
    super(message, code, stack, cause);
    this.name = "TimeoutError";
  }
}

export function toError(cause: unknown): Error | undefined {
  if (cause == null) {
    return undefined;
  }

  return cause instanceof Error ? cause : new Error(String(cause));
}

// Far from ideal

export function classifyNetworkError(error: Error): HttpError | DnsError | TimeoutError {
  if (error instanceof HttpError || error instanceof DnsError || error instanceof TimeoutError) {
    return error;
  }

  const errorCode = getCode(error) ?? "";

  if (DNS_ERROR_CODES.has(errorCode)) {
    return new DnsError(error.message, errorCode, error.stack, error);
  }

  if (error.name === "TimeoutError") {
    return new TimeoutError(error.message, errorCode, error.stack, error);
  }

  const cause = getCause(error);

  return cause
    ? classifyNetworkError(cause)
    : new HttpError(error.message, errorCode, error.stack, error);
}

export function getCause(error: Error): Error | undefined {
  return toError(error.cause);
}

export function getCode(error: Error): string | undefined {
  return "code" in error && typeof error.code === "string" ? error.code : "";
}

const DNS_ERROR_CODES = new Set(["EAI_AGAIN" /*, "ENOTFOUND" */, "EHOSTUNREACH"]);

const TIMEOUT_ERROR_CODES = new Set([
  "ETIMEDOUT",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
]);

export class ValidationError extends Error {
  constructor(
    readonly message: string,
    readonly code?: string,
    readonly cause?: Error,
  ) {
    super(message, { cause });
    this.name = "ValidationError";
  }
}

abstract class NetworkError extends Error {
  protected constructor(
    readonly message: string,
    readonly code: string,
    readonly cause?: Error,
  ) {
    super(message, { cause });
    this.name = "NetworkError";
  }
}

export class HttpError extends NetworkError {
  constructor(message: string, code: string, cause?: Error) {
    super(message, code, cause);
    this.name = "HttpError";
  }
}

export class DnsError extends NetworkError {
  constructor(message: string, code: string, cause?: Error) {
    super(message, code, cause);
    this.name = "DnsError";
  }
}

export class TimeoutError extends NetworkError {
  constructor(message: string, code: string, cause?: Error) {
    super(message, code, cause);
    this.name = "TimeoutError";
  }
}

export function classifyNetworkError(error: Error): Error {
  if (error instanceof NetworkError) {
    return error;
  }

  let currentError: Error | undefined = error;

  while (currentError) {
    const code = getCode(currentError) ?? "";

    if (DNS_ERROR_CODES.has(code)) {
      return new DnsError(currentError.message, code, error);
    }

    if (currentError.name === "TimeoutError" || TIMEOUT_ERROR_CODES.has(code)) {
      return new TimeoutError(currentError.message, code, error);
    }

    currentError = getCause(currentError);
  }

  return error;
}

export function isDnsError(error: Error): boolean {
  return error instanceof DnsError;
}

export function toError(thing: unknown): Error | undefined {
  if (thing == null) {
    return undefined;
  }

  return thing instanceof Error ? thing : new Error(String(thing));
}

export function getCause(error: Error): Error | undefined {
  return toError(error.cause);
}

export function getCode(error: Error): string | undefined {
  return "code" in error && typeof error.code === "string" ? error.code : undefined;
}

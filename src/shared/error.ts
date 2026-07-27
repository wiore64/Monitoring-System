const DNS_ERROR_CODES: ReadonlySet<string> = new Set([
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ENOTFOUND",
  "EAI_AGAIN",
]);

abstract class ConnectionError extends Error {
  protected readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "ConnectionError";
    this.code = code;
  }
}

export class HttpError extends ConnectionError {
  constructor(message: string, code: string) {
    super(message, code);
    this.name = "HttpError";
  }
}

export class DnsError extends ConnectionError {
  constructor(message: string, code: string) {
    super(message, code);
    this.name = "DnsError";
  }
}

export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TimeoutError";
  }
}

export function toError(thing: unknown): Error | undefined {
  if (thing === null || thing === undefined) {
    return undefined;
  }

  return thing instanceof Error ? thing : new Error(String(thing));
}

export function normalizeConnectionError(error: Error): HttpError | DnsError {
  if (error instanceof HttpError || error instanceof DnsError) {
    return error;
  }

  const errorCode = getCode(error);

  if (DNS_ERROR_CODES.has(errorCode)) {
    return new DnsError(error.message, errorCode);
  }

  const cause = error.cause;
  const causeError = toError(cause);

  return causeError
    ? normalizeConnectionError(causeError)
    : new HttpError(error.message, errorCode);
}

export function getCode(error: Error): string {
  return "code" in error && typeof error.code === "string" ? error.code : "";
}

export function getStack(error: Error): string {
  return error.stack ?? "";
}

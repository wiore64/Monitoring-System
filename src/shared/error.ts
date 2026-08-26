const DNS_ERROR_CODES: ReadonlySet<string> = new Set([
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ENOTFOUND",
  "EAI_AGAIN",
]);

abstract class ConnectionError extends Error {
  readonly code: string;
  readonly trace: string;

  protected constructor(message: string, code: string, stack: string, cause?: Error) {
    super(message, cause);
    this.name = "ConnectionError";
    this.code = code;
    this.trace = stack;
  }
}

export class HttpError extends ConnectionError {
  constructor(message: string, code: string);
  constructor(message: string, code: string, stack: string);
  constructor(message: string, code: string, stack: string, cause: Error);

  constructor(message: string, code: string, stack?: string, cause?: Error) {
    super(message, code, stack ?? "", cause);
    this.name = "HttpError";
  }
}

export class DnsError extends ConnectionError {
  constructor(message: string, code: string);
  constructor(message: string, code: string, stack: string);
  constructor(message: string, code: string, stack: string, cause: Error);

  constructor(message: string, code: string, stack?: string, cause?: Error) {
    super(message, code, stack ?? "", cause);
    this.name = "DnsError";
  }
}

export class TimeoutError extends ConnectionError {
  constructor(message: string);
  constructor(message: string, cause: Error);

  constructor(message: string, cause?: Error) {
    super(message, "", "", cause);
    this.name = "TimeoutError";
  }
}

export function isConnectionError(error: Error): boolean {
  return error instanceof ConnectionError;
}

export function toError(thing: unknown): Error | undefined {
  if (thing === null || thing === undefined) {
    return undefined;
  }

  return thing instanceof Error ? thing : new Error(String(thing));
}

export function translateNetworkError(error: Error): HttpError | DnsError | TimeoutError {
  if (error instanceof HttpError || error instanceof DnsError || error instanceof TimeoutError) {
    return error;
  }

  const errorCode = getCode(error);

  if (DNS_ERROR_CODES.has(errorCode)) {
    return new DnsError(error.message, errorCode, getStack(error), error);
  }

  if (error.name === "TimeoutError") {
    return new TimeoutError(error.message, error);
  }

  const cause = getCause(error);

  return cause
    ? translateNetworkError(cause)
    : new HttpError(error.message, errorCode, getStack(error), error);
}

export function getCause(error: Error): Error | undefined {
  return toError(error.cause);
}

export function getStack(error: Error): string {
  return error.stack ?? "";
}

export function getCode(error: Error): string {
  return "code" in error && typeof error.code === "string" ? error.code : "";
}

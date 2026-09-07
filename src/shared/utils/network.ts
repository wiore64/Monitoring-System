import { ConnectionError, toError, classifyNetworkError, ValidationError } from "#shared/error.js";

type FetchUrlResult =
  { success: true; data: Response } | { success: false; error: ValidationError | ConnectionError };

export async function fetchUrl(url: string, timeoutMs: number): Promise<FetchUrlResult> {
  try {
    return {
      success: true,
      data: await fetch(url, { signal: AbortSignal.timeout(timeoutMs) }),
    };
  } catch (cause: unknown) {
    const error = toError(cause);

    if (!error) {
      return {
        success: false,
        error: new ValidationError(`Non-error thrown: ${cause}`, "NON_ERROR"),
      };
    }

    return {
      success: false,
      error: classifyNetworkError(error),
    };
  }
}

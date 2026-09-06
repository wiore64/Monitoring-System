import { ConnectionError, toError, translateNetworkError } from "#shared/error.js";

type FetchUrlResult =
  { success: true; data: Response } | { success: false; error: ConnectionError };

export async function fetchUrl(url: string, timeoutMs: number): Promise<FetchUrlResult> {
  try {
    return {
      success: true,
      data: await fetch(url, { signal: AbortSignal.timeout(timeoutMs) }),
    };
  } catch (cause: unknown) {
    const error = toError(cause);

    if (!error) {
      throw new TypeError(`Non-error thrown: ${cause}`, { cause });
    }

    return {
      success: false,
      error: translateNetworkError(error),
    };
  }
}

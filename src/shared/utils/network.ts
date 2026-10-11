import { toError, classifyNetworkError, ValidationError, HttpError } from "#shared/error.js";

type FetchUrlResult =
  { success: true; data: Response } | { success: false; data?: Response; error: Error };

export async function fetchUrl(url: string, timeoutMs: number): Promise<FetchUrlResult> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (response.status >= 400) {
      return {
        success: false,
        data: response,
        error: new HttpError(
          "Failed to fetch a response.",
          `${response.status} ${response.statusText}`,
        ),
      };
    }

    return {
      success: true,
      data: response,
    };
  } catch (cause: unknown) {
    const error = toError(cause);

    if (!error) {
      return {
        success: false,
        error: new ValidationError(`Non-error thrown: ${JSON.stringify(cause)}`),
      };
    }

    return {
      success: false,
      error: classifyNetworkError(error),
    };
  }
}

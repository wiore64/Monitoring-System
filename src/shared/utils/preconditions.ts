export function mustNotBeNull<T>(value: T, message?: string): void {
  if (value == null) {
    throw new TypeError(message ?? `Value must not be null`);
  }
}

export function mustNotHaveNull(obj: object, message?: string): void {
  mustNotBeNull(obj, message);
  for (const [key, value] of Object.entries(obj)) {
    mustNotBeNull(key, message);
    mustNotHaveNull(value, message);
  }
}

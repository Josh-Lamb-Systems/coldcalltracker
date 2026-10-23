import PocketBase, { ClientResponseError } from "pocketbase";

export const pb = new PocketBase("/");

// Taps fire in quick succession; never let the SDK cancel an in-flight
// request because a similar one started.
pb.autoCancellation(false);

export function errorMessage(err: unknown, fallback = "Something went wrong. Please try again."): string {
  if (!(err instanceof ClientResponseError)) return fallback;
  if (err.status === 0) return "Can't reach the server. Check your connection.";
  const fields: Record<string, { message?: unknown } | undefined> = err.response?.data ?? {};
  const fieldError = Object.values(fields).find((value) => typeof value?.message === "string");
  return (fieldError?.message as string | undefined) ?? err.response?.message ?? fallback;
}

/** Network failures and server hiccups are worth retrying; client errors aren't. */
export function isRetryable(err: unknown): boolean {
  return err instanceof ClientResponseError && (err.status === 0 || err.status === 429 || err.status >= 500);
}

/** Quotes a value for use in a PocketBase filter string. */
export function filterValue(value: string): string {
  return JSON.stringify(value);
}

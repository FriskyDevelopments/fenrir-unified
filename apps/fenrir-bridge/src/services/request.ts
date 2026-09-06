/** Bound a stalled operation even when the underlying client does not reject. */
export async function withDeadline<T>(
  operation: Promise<T>,
  timeoutMs = 12_000,
  message = "request_timeout",
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMs = 12_000,
) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (init?.signal?.aborted) controller.abort();
  else init?.signal?.addEventListener("abort", abort, { once: true });
  try {
    return await withDeadline(
      fetch(input, { ...init, signal: controller.signal }),
      timeoutMs,
    );
  } catch (error) {
    controller.abort();
    throw error;
  } finally {
    init?.signal?.removeEventListener("abort", abort);
  }
}

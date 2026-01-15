type KeyFn<T> = (arg: T) => string;

export function createThrottledRequester<TArg, TResult>(opts: {
  waitMs: number;
  key: KeyFn<TArg>;
  request: (arg: TArg, signal: AbortSignal) => Promise<TResult>;
}) {
  const { waitMs, key, request } = opts;

  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const inFlight = new Map<string, AbortController>();
  const latestArg = new Map<string, TArg>();

  return function throttled(arg: TArg): Promise<TResult> {
    const k = key(arg);
    latestArg.set(k, arg);

    // cancel any in-flight request for same key
    const inflight = inFlight.get(k);
    if (inflight) inflight.abort();

    // reset timer
    const existingTimer = timers.get(k);
    if (existingTimer) clearTimeout(existingTimer);

    return new Promise<TResult>((resolve, reject) => {
      const t = setTimeout(async () => {
        timers.delete(k);
        const controller = new AbortController();
        inFlight.set(k, controller);

        try {
          const a = latestArg.get(k)!;
          const result = await request(a, controller.signal);
          // only resolve if this controller wasn't aborted by a newer call
          if (!controller.signal.aborted) resolve(result);
        } catch (e) {
          // swallow abort errors as "normal"
          if ((e as any)?.name === "AbortError") return;
          reject(e);
        } finally {
          if (inFlight.get(k) === controller) inFlight.delete(k);
        }
      }, waitMs);

      timers.set(k, t);
    });
  };
}

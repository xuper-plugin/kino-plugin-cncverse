// A time budget: Kino cuts a call at a fixed time (search 15 s, everything else 20 s) and throws away whatever it had, so every
// path that makes several requests shares one budget and sizes each request from what is left of it.
export function makeBudget(ms) {
  const end = Date.now() + ms;
  return {
    end,
    /** Ms left (negative once over). */
    left: () => end - Date.now(),
    /** A request's timeout: at most [max], at most what is left less [reserve], never under [min]. */
    cap: (max, reserve = 0, min = 0) => Math.max(min, Math.min(max, end - Date.now() - reserve)),
    /** True when a request of at least [needed] ms no longer fits. */
    short: (needed) => end - Date.now() < needed,
  };
}

/** Resolves with `work`'s value, or null when [ms] pass first (the work is left running); never rejects. */
export async function withTime(ms, work) {
  if (ms < 1000) return null;
  let timedOut = false;
  const stop = kino.sleep(ms).then(() => {
    timedOut = true;
    return null;
  });
  const out = await Promise.race([Promise.resolve(work).catch(() => null), stop]);
  return timedOut ? null : out;
}

const store = new Map(); // key -> { value, expiresAt }
const inFlight = new Map(); // key -> Promise

// Wraps an async fetcher with a TTL cache and in-flight dedup: identical
// concurrent calls (e.g. two clients requesting the same pair/range at once)
// share one exchange request instead of firing it twice, and results are
// reused for `ttlMs` afterward.
export async function cached(key, ttlMs, fetcher) {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && hit.expiresAt > now) return hit.value;

  if (inFlight.has(key)) return inFlight.get(key);

  const promise = fetcher()
    .then((value) => {
      store.set(key, { value, expiresAt: Date.now() + ttlMs });
      inFlight.delete(key);
      return value;
    })
    .catch((e) => {
      inFlight.delete(key);
      throw e;
    });

  inFlight.set(key, promise);
  return promise;
}

export function clearCache() {
  store.clear();
  inFlight.clear();
}

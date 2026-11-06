import { useCallback, useEffect, useRef, useState } from "react";

export type Loaded<T> = { status: "loading" } | { status: "error"; error: string } | { status: "ready"; data: T };

/**
 * Loads data when `key` changes and exposes `reload`. Reads only: a loader must never start a write.
 * The previous data stays visible while a reload runs (`refreshing`), so a view does not flash.
 */
export function useLoad<T>(loader: () => Promise<T>, key: string): { state: Loaded<T>; reload: () => void; refreshing: boolean; mutate: (patch: (data: T) => T) => void } {
  const [state, setState] = useState<Loaded<T>>({ status: "loading" });
  const [refreshing, setRefreshing] = useState(false);
  const [tick, setTick] = useState(0);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const keyRef = useRef(key);

  useEffect(() => {
    let cancelled = false;
    const keyChanged = keyRef.current !== key;
    keyRef.current = key;
    if (keyChanged) setState({ status: "loading" });
    setRefreshing(true);
    loaderRef
      .current()
      .then((data) => !cancelled && setState({ status: "ready", data }))
      .catch((e: Error) => !cancelled && setState({ status: "error", error: e.message }))
      .finally(() => !cancelled && setRefreshing(false));
    return () => {
      cancelled = true;
    };
  }, [key, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  /** Applies a local change to the loaded data (an approved write shown at once, before the reload confirms it). */
  const mutate = useCallback((patch: (data: T) => T) => setState((prev) => (prev.status === "ready" ? { status: "ready", data: patch(prev.data) } : prev)), []);
  return { state, reload, refreshing, mutate };
}

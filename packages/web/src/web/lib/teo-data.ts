import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type SetStateAction,
  type Dispatch,
} from "react";

export * from "../../shared/teo";
export function useStored<T>(key: string, initial: T) {
  const initialRef = useRef(initial);
  const load = useCallback((): T => {
    try {
      const v = localStorage.getItem("teo-" + key);
      return v ? JSON.parse(v) : initialRef.current;
    } catch {
      return initialRef.current;
    }
  }, [key]);
  const [state, setState] = useState<{ key: string; value: T }>(() => ({
    key,
    value: load(),
  }));
  const value = state.key === key ? state.value : load();
  const setValue: Dispatch<SetStateAction<T>> = useCallback(
    (next) =>
      setState((prev) => ({
        key,
        value:
          typeof next === "function"
            ? (next as (v: T) => T)(prev.key === key ? prev.value : load())
            : next,
      })),
    [key, load],
  );
  useEffect(() => {
    if (state.key !== key) return;
    try {
      localStorage.setItem("teo-" + key, JSON.stringify(value));
    } catch {
      /* storage unavailable */
    }
  }, [key, value, state.key]);
  return [value, setValue] as const;
}

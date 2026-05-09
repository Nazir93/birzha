import { useEffect, useState } from "react";

/**
 * Подписка на matchMedia (мобильная вёрстка, drawer меню).
 * До гидрации и при `window === undefined` возвращает `null`.
 */
export function useMatchMedia(query: string): boolean | null {
  const [matches, setMatches] = useState<boolean | null>(null);

  useEffect(() => {
    const mq = window.matchMedia(query);
    const sync = () => setMatches(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, [query]);

  return matches;
}

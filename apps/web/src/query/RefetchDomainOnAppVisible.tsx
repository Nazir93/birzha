import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { invalidateStockQueries, queryRoots } from "./core-list-queries.js";

/** Свести в один invalidate серию быстрых событий (visibility + focus + pageshow). */
const DEBOUNCE_MS = 400;

/**
 * При возврате во вкладку помечаем кэш устаревшим — активные экраны перезапросят API.
 *
 * Раньше стоял жёсткий throttle 8 с: при частом переключении «другое приложение → Биржа» повторный сброс
 * кэша не выполнялся, и продажа с ПК не подтягивалась без выхода из учётки.
 */
export function RefetchDomainOnAppVisible() {
  const qc = useQueryClient();
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const invalidateTripDomain = () => {
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        return;
      }
      void qc.invalidateQueries({ queryKey: queryRoots.trips });
      void qc.invalidateQueries({ queryKey: queryRoots.shipmentReport });
      invalidateStockQueries(qc);
    };

    const schedule = () => {
      window.clearTimeout(debounceTimer.current);
      debounceTimer.current = window.setTimeout(() => {
        debounceTimer.current = undefined;
        invalidateTripDomain();
      }, DEBOUNCE_MS);
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        schedule();
      }
    };

    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        schedule();
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", schedule);
    window.addEventListener("pageshow", onPageShow as EventListener);

    return () => {
      window.clearTimeout(debounceTimer.current);
      debounceTimer.current = undefined;
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", schedule);
      window.removeEventListener("pageshow", onPageShow as EventListener);
    };
  }, [qc]);

  return null;
}

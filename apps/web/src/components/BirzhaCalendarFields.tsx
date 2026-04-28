import { useCallback, useId, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";

import { fieldStyle } from "../ui/styles.js";

const RU_WEEK: string[] = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

const MONTH_NAMES: string[] = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
];

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

/** Локальная YYYY-MM-DD, без сдвига UTC. */
export function formatYmd(y: number, m0: number, d: number): string {
  return `${y}-${pad2(m0 + 1)}-${pad2(d)}`;
}

function parseYmdString(s: string): { y: number; m0: number; d: number } | null {
  const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(s.trim());
  if (!m) {
    return null;
  }
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const t = new Date(y, mo, d);
  if (t.getFullYear() !== y || t.getMonth() !== mo || t.getDate() !== d) {
    return null;
  }
  return { y, m0: mo, d };
}

export function toDatetimeLocalValue(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(
    d.getMinutes(),
  )}`;
}

function parseDatetimeLocal(s: string): Date | null {
  if (!s.trim()) {
    return null;
  }
  const t = new Date(s);
  return Number.isNaN(t.getTime()) ? null : t;
}

function goMonth(anchor: Date, delta: number): Date {
  return new Date(anchor.getFullYear(), anchor.getMonth() + delta, 1);
}

function buildMonthGrid(viewMonth: Date): (number | null)[] {
  const y = viewMonth.getFullYear();
  const m = viewMonth.getMonth();
  const firstDow = (new Date(y, m, 1).getDay() + 6) % 7; // 0=Пн
  const daysInM = new Date(y, m + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDow; i++) {
    cells.push(null);
  }
  for (let d = 1; d <= daysInM; d++) {
    cells.push(d);
  }
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }
  return cells;
}

const triggerStyleBase: CSSProperties = {
  ...fieldStyle,
  display: "flex",
  width: "100%",
  maxWidth: "100%",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "0.5rem",
  cursor: "pointer",
  textAlign: "left" as const,
  font: "inherit",
  boxShadow: "none" as const,
  WebkitAppearance: "none" as const,
};

function CalendarIcon() {
  return (
    <svg
      className="birzha-dp__icon"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M7 2v2M17 2v2M3 9h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type CalProps = {
  viewMonth: Date;
  onViewMonth: (d: Date) => void;
  /** Выбранный день (в viewMonth) или null */
  selectedDay: number | null;
  onPickDay: (d: number) => void;
};

function MonthCalendar({ viewMonth, onViewMonth, selectedDay, onPickDay }: CalProps) {
  const cells = useMemo(() => buildMonthGrid(viewMonth), [viewMonth]);
  const y = viewMonth.getFullYear();
  const m0 = viewMonth.getMonth();
  const todayY = new Date().getFullYear();
  const todayM = new Date().getMonth();
  const todayD = new Date().getDate();

  return (
    <div className="birzha-dp__cal">
      <div className="birzha-dp__cal-top">
        <button type="button" className="birzha-dp__nav" onClick={() => onViewMonth(goMonth(viewMonth, -1))} aria-label="Предыдущий месяц">
          ‹
        </button>
        <span className="birzha-dp__title" aria-live="polite">
          {MONTH_NAMES[m0]} {y}
        </span>
        <button type="button" className="birzha-dp__nav" onClick={() => onViewMonth(goMonth(viewMonth, 1))} aria-label="Следующий месяц">
          ›
        </button>
      </div>
      <div className="birzha-dp__dow" role="row">
        {RU_WEEK.map((d) => (
          <div key={d} className="birzha-dp__dow-lbl">
            {d}
          </div>
        ))}
      </div>
      <div className="birzha-dp__grid" role="grid" aria-label="Календарь">
        {cells.map((d, i) => {
          if (d == null) {
            return <div key={`e-${i}`} className="birzha-dp__cell birzha-dp__cell--empty" aria-hidden />;
          }
          const isSelected = selectedDay === d;
          const isToday = y === todayY && m0 === todayM && d === todayD;
          return (
            <button
              key={d + "-" + i}
              type="button"
              className={[
                "birzha-dp__day",
                isSelected ? "birzha-dp__day--selected" : "",
                isToday && !isSelected ? "birzha-dp__day--today" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => onPickDay(d)}
            >
              {d}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export type BirzhaDateFieldProps = {
  id?: string;
  "aria-label"?: string;
  value: string;
  onChange: (ymd: string) => void;
  style?: CSSProperties;
  className?: string;
  disabled?: boolean;
};

/**
 * Дата (YYYY-MM-DD) через центрированный диалог, без нативного `input type="date"`.
 */
export function BirzhaDateField({ id, "aria-label": ariaLabel, value, onChange, style, className, disabled }: BirzhaDateFieldProps) {
  const did = useId();
  const idFinal = id ?? `birzha-date-${did}`;
  const ref = useRef<HTMLDialogElement | null>(null);
  const parsed = value ? parseYmdString(value) : null;
  const display =
    parsed != null
      ? new Date(parsed.y, parsed.m0, parsed.d).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" })
      : "— выберите —";

  const [viewMonth, setViewMonth] = useState(() => new Date(parsed ? new Date(parsed.y, parsed.m0, 1) : new Date()));
  const [sel, setSel] = useState<{ y: number; m0: number; d: number } | null>(() => parsed);

  const open = useCallback(() => {
    if (disabled) {
      return;
    }
    if (parsed) {
      setViewMonth(new Date(parsed.y, parsed.m0, 1));
      setSel({ y: parsed.y, m0: parsed.m0, d: parsed.d });
    } else {
      const t = new Date();
      setViewMonth(new Date(t.getFullYear(), t.getMonth(), 1));
      setSel(null);
    }
    ref.current?.showModal();
  }, [disabled, parsed]);

  const onPickDay = useCallback(
    (d: number) => {
      const m = viewMonth.getMonth();
      const y = viewMonth.getFullYear();
      setSel({ y, m0: m, d });
      onChange(formatYmd(y, m, d));
      ref.current?.close();
    },
    [onChange, viewMonth],
  );

  return (
    <>
      <button
        type="button"
        id={idFinal}
        className={["birzha-dp-trigger", className].filter(Boolean).join(" ")}
        style={{ ...triggerStyleBase, ...style }}
        onClick={open}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
      >
        <span className="birzha-dp-trigger__val">{value ? <strong style={{ fontWeight: 500 }}>{display}</strong> : <span className="birzha-dp-trigger__ph">{display}</span>}</span>
        <CalendarIcon />
      </button>
      <dialog ref={ref} className="birzha-dp" aria-labelledby={idFinal + "-title"}>
        <div
          className="birzha-dp__layout"
          onClick={() => {
            ref.current?.close();
          }}
        >
          <div
            className="birzha-dp__card"
            onClick={(e) => e.stopPropagation()}
            role="presentation"
          >
            <p id={idFinal + "-title"} className="birzha-dp__heading">
              Выбор даты
            </p>
            <MonthCalendar
              viewMonth={viewMonth}
              onViewMonth={setViewMonth}
              selectedDay={sel && sel.y === viewMonth.getFullYear() && sel.m0 === viewMonth.getMonth() ? sel.d : null}
              onPickDay={onPickDay}
            />
            <div className="birzha-dp__row">
              <button
                type="button"
                className="birzha-dp__linkish"
                onClick={() => {
                  const t = new Date();
                  onChange(formatYmd(t.getFullYear(), t.getMonth(), t.getDate()));
                  ref.current?.close();
                }}
              >
                Сегодня
              </button>
              <button type="button" className="birzha-dp__secondary" onClick={() => ref.current?.close()}>
                Закрыть
              </button>
            </div>
          </div>
        </div>
      </dialog>
    </>
  );
}

export type BirzhaDateTimeFieldProps = {
  id?: string;
  "aria-label"?: string;
  value: string;
  onChange: (local: string) => void;
  style?: CSSProperties;
  className?: string;
  disabled?: boolean;
  allowClear?: boolean;
  /** Текст при пустом значении */
  emptyLabel?: string;
};

/**
 * Локальные дата и время в формате `input[type="datetime-local"]` (YYYY-MM-DDTHH:mm) через диалог.
 */
export function BirzhaDateTimeField({
  id,
  "aria-label": ariaLabel,
  value,
  onChange,
  className,
  disabled,
  allowClear = true,
  emptyLabel = "— не задано —",
  style,
}: BirzhaDateTimeFieldProps) {
  const did = useId();
  const idFinal = id ?? `birzha-dt-${did}`;
  const ref = useRef<HTMLDialogElement | null>(null);
  const parsed = useMemo(() => (value.trim() ? parseDatetimeLocal(value) : null), [value]);

  const [viewMonth, setViewMonth] = useState(() => {
    if (parsed) {
      return new Date(parsed.getFullYear(), parsed.getMonth(), 1);
    }
    return new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  });
  const [sel, setSel] = useState<{ y: number; m0: number; d: number } | null>(() => {
    if (parsed) {
      return { y: parsed.getFullYear(), m0: parsed.getMonth(), d: parsed.getDate() };
    }
    return null;
  });
  const [time, setTime] = useState(() => {
    if (parsed) {
      return `${pad2(parsed.getHours())}:${pad2(parsed.getMinutes())}`;
    }
    return "12:00";
  });

  const display = useMemo(() => {
    if (!parsed) {
      return null;
    }
    return parsed.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }, [parsed]);

  const open = useCallback(() => {
    if (disabled) {
      return;
    }
    if (value.trim() && parseDatetimeLocal(value)) {
      const p = parseDatetimeLocal(value) as Date;
      setViewMonth(new Date(p.getFullYear(), p.getMonth(), 1));
      setSel({ y: p.getFullYear(), m0: p.getMonth(), d: p.getDate() });
      setTime(`${pad2(p.getHours())}:${pad2(p.getMinutes())}`);
    } else {
      const t = new Date();
      setViewMonth(new Date(t.getFullYear(), t.getMonth(), 1));
      setSel(null);
      setTime("12:00");
    }
    ref.current?.showModal();
  }, [disabled, value]);

  const apply = useCallback(() => {
    if (!sel) {
      return;
    }
    const [hh, mm] = time.split(":").map((x) => Number.parseInt(x, 10));
    if (!Number.isInteger(hh) || !Number.isInteger(mm) || mm < 0 || mm > 59 || hh < 0 || hh > 23) {
      return;
    }
    const d = new Date(sel.y, sel.m0, sel.d, hh, mm, 0, 0);
    onChange(toDatetimeLocalValue(d));
    ref.current?.close();
  }, [onChange, sel, time]);

  return (
    <>
      <button
        type="button"
        id={idFinal}
        className={["birzha-dp-trigger", className].filter(Boolean).join(" ")}
        style={{ ...triggerStyleBase, ...style }}
        onClick={open}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
      >
        <span className="birzha-dp-trigger__val">
          {display ? <strong style={{ fontWeight: 500 }}>{display}</strong> : <span className="birzha-dp-trigger__ph">{emptyLabel}</span>}
        </span>
        <CalendarIcon />
      </button>
      <dialog ref={ref} className="birzha-dp" aria-labelledby={idFinal + "-title"}>
        <div className="birzha-dp__layout" onClick={() => ref.current?.close()}>
          <div className="birzha-dp__card birzha-dp__card--wide" onClick={(e) => e.stopPropagation()} role="presentation">
            <p id={idFinal + "-title"} className="birzha-dp__heading">
              Дата и время
            </p>
            <MonthCalendar
              viewMonth={viewMonth}
              onViewMonth={setViewMonth}
              selectedDay={sel && sel.y === viewMonth.getFullYear() && sel.m0 === viewMonth.getMonth() ? sel.d : null}
              onPickDay={(d) => {
                const m = viewMonth.getMonth();
                const y = viewMonth.getFullYear();
                setSel({ y, m0: m, d });
              }}
            />
            <label className="birzha-dp__time-lbl" htmlFor={idFinal + "-time"}>
              Время
            </label>
            <input
              id={idFinal + "-time"}
              className="birzha-dp__time"
              type="time"
              step={60}
              value={time}
              onChange={(e) => setTime(e.target.value.split(":").length >= 2 ? e.target.value : time)}
            />
            <div className="birzha-dp__row birzha-dp__row--end">
              {allowClear && (
                <button
                  type="button"
                  className="birzha-dp__linkish"
                  onClick={() => {
                    onChange("");
                    ref.current?.close();
                  }}
                >
                  Без даты/времени
                </button>
              )}
              <button type="button" className="birzha-dp__secondary" onClick={() => ref.current?.close()}>
                Отмена
              </button>
              <button type="button" className="birzha-dp__primary" onClick={apply} disabled={!sel}>
                Готово
              </button>
            </div>
          </div>
        </div>
      </dialog>
    </>
  );
}

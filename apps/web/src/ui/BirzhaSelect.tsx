import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";

export type BirzhaSelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

export type BirzhaSelectOptionGroup = {
  label: string;
  options: BirzhaSelectOption[];
};

export type BirzhaSelectProps = {
  id?: string;
  "aria-label"?: string;
  "aria-busy"?: boolean;
  value: string;
  onChange: (value: string) => void;
  options?: BirzhaSelectOption[];
  groups?: BirzhaSelectOptionGroup[];
  placeholder?: string;
  disabled?: boolean;
  style?: CSSProperties;
  className?: string;
};

type MenuPosition = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
};

const MENU_GAP_PX = 4;
const MENU_MAX_HEIGHT_PX = 16 * 16;

const SELECT_WRAPPER_STYLE_KEYS = new Set<keyof CSSProperties>([
  "width",
  "maxWidth",
  "minWidth",
  "minWidth",
  "margin",
  "marginTop",
  "marginBottom",
  "marginLeft",
  "marginRight",
  "flex",
  "flexGrow",
  "flexShrink",
  "flexBasis",
  "alignSelf",
  "gridColumn",
  "gridRow",
  "gridArea",
  "justifySelf",
  "display",
  "position",
  "zIndex",
  "visibility",
  "opacity",
]);

export function splitBirzhaSelectStyle(style?: CSSProperties): {
  wrapperStyle: CSSProperties | undefined;
  triggerStyle: CSSProperties | undefined;
} {
  if (!style) {
    return { wrapperStyle: undefined, triggerStyle: undefined };
  }
  const wrapperStyle: Record<string, string | number> = {};
  const triggerStyle: Record<string, string | number> = {};
  for (const key of Object.keys(style) as (keyof CSSProperties)[]) {
    const value = style[key];
    if (value === undefined) {
      continue;
    }
    if (SELECT_WRAPPER_STYLE_KEYS.has(key)) {
      wrapperStyle[key as string] = value as string | number;
    } else {
      triggerStyle[key as string] = value as string | number;
    }
  }
  return {
    wrapperStyle: Object.keys(wrapperStyle).length > 0 ? (wrapperStyle as CSSProperties) : undefined,
    triggerStyle: Object.keys(triggerStyle).length > 0 ? (triggerStyle as CSSProperties) : undefined,
  };
}

function flattenSelectable(options?: BirzhaSelectOption[], groups?: BirzhaSelectOptionGroup[]): BirzhaSelectOption[] {
  if (groups && groups.length > 0) {
    return groups.flatMap((group) => group.options.filter((opt) => !opt.disabled));
  }
  return (options ?? []).filter((opt) => !opt.disabled);
}

function resolveDisplayLabel(
  value: string,
  placeholder: string,
  options?: BirzhaSelectOption[],
  groups?: BirzhaSelectOptionGroup[],
): string {
  if (!value) {
    return placeholder;
  }
  const flat = flattenSelectable(options, groups);
  const hit = flat.find((opt) => opt.value === value);
  return hit?.label ?? value;
}

function ChevronDownIcon() {
  return (
    <svg
      className="birzha-select__chevron"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="m6 9 6 6 6-6"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function computeMenuPosition(trigger: HTMLElement): MenuPosition {
  const rect = trigger.getBoundingClientRect();
  const viewportPadding = 8;
  const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
  const spaceAbove = rect.top - viewportPadding;
  const openUp = spaceBelow < 180 && spaceAbove > spaceBelow;
  const maxHeight = Math.min(
    MENU_MAX_HEIGHT_PX,
    Math.max(120, openUp ? spaceAbove - MENU_GAP_PX : spaceBelow - MENU_GAP_PX),
  );
  const top = openUp ? rect.top - maxHeight - MENU_GAP_PX : rect.bottom + MENU_GAP_PX;
  return {
    top: Math.max(viewportPadding, top),
    left: rect.left,
    width: rect.width,
    maxHeight,
  };
}

export function BirzhaSelect({
  id,
  "aria-label": ariaLabel,
  "aria-busy": ariaBusy,
  value,
  onChange,
  options,
  groups,
  placeholder = "— выберите —",
  disabled = false,
  style,
  className,
}: BirzhaSelectProps) {
  const autoId = useId();
  const triggerId = id ?? `birzha-select-${autoId}`;
  const listboxId = `${triggerId}-listbox`;
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<MenuPosition | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);

  const selectable = useMemo(() => flattenSelectable(options, groups), [options, groups]);
  const displayLabel = useMemo(
    () => resolveDisplayLabel(value, placeholder, options, groups),
    [value, placeholder, options, groups],
  );
  const isPlaceholder = !value;
  const { wrapperStyle, triggerStyle } = useMemo(() => splitBirzhaSelectStyle(style), [style]);

  const close = useCallback(() => {
    setOpen(false);
    setActiveIndex(-1);
  }, []);

  const openMenu = useCallback(() => {
    if (disabled) {
      return;
    }
    setOpen(true);
    const idx = selectable.findIndex((opt) => opt.value === value);
    setActiveIndex(idx >= 0 ? idx : 0);
  }, [disabled, selectable, value]);

  const pick = useCallback(
    (nextValue: string) => {
      onChange(nextValue);
      close();
      triggerRef.current?.focus();
    },
    [close, onChange],
  );

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) {
      setMenuPos(null);
      return;
    }
    const update = () => {
      if (triggerRef.current) {
        setMenuPos(computeMenuPosition(triggerRef.current));
      }
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }
      close();
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [close, open]);

  const onTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) {
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (!open) {
        openMenu();
        return;
      }
    }
    if (!open) {
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((idx) => {
        const next = idx + 1;
        return next >= selectable.length ? 0 : next;
      });
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((idx) => {
        const next = idx - 1;
        return next < 0 ? selectable.length - 1 : next;
      });
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const opt = selectable[activeIndex];
      if (opt) {
        pick(opt.value);
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  };

  const menu =
    open && menuPos && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={menuRef}
            id={listboxId}
            role="listbox"
            aria-labelledby={triggerId}
            className="birzha-select__menu"
            style={{
              top: menuPos.top,
              left: menuPos.left,
              width: menuPos.width,
              maxHeight: menuPos.maxHeight,
            }}
          >
            {groups && groups.length > 0
              ? groups.map((group) => (
                  <div key={group.label} className="birzha-select__group" role="presentation">
                    <div className="birzha-select__group-label">{group.label}</div>
                    {group.options.map((opt) => {
                      const flatIndex = selectable.findIndex((item) => item.value === opt.value);
                      const selected = value === opt.value;
                      const active = flatIndex === activeIndex;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          role="option"
                          aria-selected={selected}
                          disabled={opt.disabled}
                          className={[
                            "birzha-select__option",
                            selected ? "birzha-select__option--selected" : "",
                            active ? "birzha-select__option--active" : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          onMouseEnter={() => {
                            if (flatIndex >= 0) {
                              setActiveIndex(flatIndex);
                            }
                          }}
                          onClick={() => {
                            if (!opt.disabled) {
                              pick(opt.value);
                            }
                          }}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                ))
              : (options ?? []).map((opt) => {
                  const flatIndex = selectable.findIndex((item) => item.value === opt.value);
                  const selected = value === opt.value;
                  const active = flatIndex === activeIndex;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      disabled={opt.disabled}
                      className={[
                        "birzha-select__option",
                        selected ? "birzha-select__option--selected" : "",
                        active ? "birzha-select__option--active" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      onMouseEnter={() => {
                        if (flatIndex >= 0) {
                          setActiveIndex(flatIndex);
                        }
                      }}
                      onClick={() => {
                        if (!opt.disabled) {
                          pick(opt.value);
                        }
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
          </div>,
          document.body,
        )
      : null;

  return (
    <div className={["birzha-select", className].filter(Boolean).join(" ")} style={wrapperStyle}>
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        className="birzha-select__trigger"
        style={triggerStyle}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-busy={ariaBusy || undefined}
        disabled={disabled}
        onClick={() => {
          if (open) {
            close();
          } else {
            openMenu();
          }
        }}
        onKeyDown={onTriggerKeyDown}
      >
        <span className={isPlaceholder ? "birzha-select__value birzha-select__value--placeholder" : "birzha-select__value"}>
          {displayLabel}
        </span>
        <ChevronDownIcon />
      </button>
      {menu}
    </div>
  );
}

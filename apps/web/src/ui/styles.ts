import type { CSSProperties } from "react";

/** Шрифт интерфейса (см. `index.html` + `index.css`). */
export const fontUi = '"Montserrat", system-ui, -apple-system, "Segoe UI", sans-serif';

/** Поля форм (основная ширина). */
export const fieldStyle: CSSProperties = {
  display: "block",
  width: "100%",
  maxWidth: "100%",
  marginTop: "0.35rem",
  padding: "0.5rem 0.75rem",
  fontFamily: fontUi,
  fontSize: "0.9375rem",
  fontWeight: 500,
  lineHeight: 1.45,
  color: "#18181b",
  borderRadius: 8,
  border: "1px solid #d4d4d8",
  background: "#fff",
  boxSizing: "border-box",
  minHeight: "2.625rem",
  transition: "border-color 0.15s ease, box-shadow 0.15s ease",
};

/** `input[type="date"]` — плюс `color-scheme` (см. `index.css`), единообразно с `fieldStyle`. */
export const dateFieldStyle: CSSProperties = {
  ...fieldStyle,
  colorScheme: "only light",
  accentColor: "#15803d",
};

/** Как `fieldStyleCompact`, с `color-scheme` / `accent-color` для нативного календаря (см. `index.css`). */
export const dateFieldStyleCompact: CSSProperties = {
  ...dateFieldStyle,
  maxWidth: "100%",
};

export const fieldStyleCompact: CSSProperties = {
  ...fieldStyle,
  maxWidth: "100%",
};

/** Селект на всю ширину карточки (например выбор рейса в отчёте). */
export const fieldStyleFullWidth: CSSProperties = {
  ...fieldStyle,
  maxWidth: "100%",
};

/** Блок с JSON для отладки / служебных экранов. */
export const preJson: CSSProperties = {
  margin: "0.5rem 0 0",
  padding: "0.75rem",
  background: "#f4f4f5",
  borderRadius: 6,
  overflow: "auto",
  fontSize: "0.85rem",
  lineHeight: 1.45,
};

/** Основная кнопка действия в формах. */
export const btnStyle: CSSProperties = {
  marginTop: "0.65rem",
  marginRight: "0.5rem",
  padding: "0.5rem 1rem",
  fontFamily: fontUi,
  fontSize: "0.9rem",
  fontWeight: 600,
  cursor: "pointer",
  borderRadius: 8,
  border: "1px solid #d4d4d8",
  background: "#fff",
  transition: "background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease",
};

/** Как `btnStyle`, без верхнего отступа (ряд кнопок в шапке карточки). */
export const btnStyleInline: CSSProperties = {
  marginTop: 0,
  marginRight: "0.5rem",
  padding: "0.5rem 1rem",
  fontFamily: fontUi,
  fontSize: "0.9rem",
  fontWeight: 600,
  cursor: "pointer",
  borderRadius: 8,
  border: "1px solid #d4d4d8",
  background: "#fff",
  transition: "background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease",
};

/** Вторичная (компактная) кнопка — CSV, мелкие действия. */
export const btnSecondary: CSSProperties = {
  marginLeft: "0.75rem",
  padding: "0.4rem 0.7rem",
  fontFamily: fontUi,
  fontSize: "0.82rem",
  fontWeight: 600,
  cursor: "pointer",
  borderRadius: 8,
  border: "1px solid #d4d4d8",
  background: "#fff",
};

export const sectionBox: CSSProperties = {
  marginBottom: "1.25rem",
  paddingBottom: "1rem",
  borderBottom: "1px solid #e4e4e7",
};

export const muted: CSSProperties = { color: "#52525b", fontSize: "0.85rem", margin: "0 0 0.75rem" };

export const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: "0.88rem",
  marginTop: "0.5rem",
};

export const tableStyleDense: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: "0.82rem",
};

export const thtd: CSSProperties = {
  border: "1px solid #e4e4e7",
  padding: "0.35rem 0.5rem",
  textAlign: "left" as const,
};

export const thtdDense: CSSProperties = {
  border: "1px solid #e4e4e7",
  padding: "0.3rem 0.45rem",
  textAlign: "left" as const,
};

export const thHead: CSSProperties = {
  ...thtd,
  background: "#f4f4f5",
  fontWeight: 600,
};

export const thHeadDense: CSSProperties = {
  ...thtdDense,
  background: "#f4f4f5",
  fontWeight: 600,
};

/** Карточка контента в `App`. */
export const sectionCard: CSSProperties = {
  marginTop: "1.25rem",
  fontFamily: fontUi,
  fontSize: "0.95rem",
  padding: "1.25rem",
  border: "1px solid #e4e4e7",
  borderRadius: 10,
  background: "#fafafa",
};

export const successText: CSSProperties = { color: "#15803d", marginTop: "0.5rem", fontSize: "0.88rem" };

export const errorText: CSSProperties = {
  color: "#b91c1c",
  marginTop: "0.5rem",
  fontSize: "0.88rem",
  whiteSpace: "pre-wrap" as const,
};

export const warnText: CSSProperties = { color: "#b45309", fontSize: "0.88rem" };

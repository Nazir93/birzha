import type { CSSProperties } from "react";

/** Поля форм (основная ширина). */
export const fieldStyle: CSSProperties = {
  display: "block",
  width: "100%",
  maxWidth: 360,
  marginTop: "0.35rem",
  padding: "0.45rem 0.6rem",
  fontSize: "0.95rem",
  borderRadius: 6,
  border: "1px solid #d4d4d8",
  boxSizing: "border-box",
};

export const fieldStyleCompact: CSSProperties = {
  ...fieldStyle,
  maxWidth: 320,
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
  padding: "0.45rem 0.85rem",
  fontSize: "0.9rem",
  cursor: "pointer",
  borderRadius: 6,
  border: "1px solid #d4d4d8",
  background: "#fff",
};

/** Как `btnStyle`, без верхнего отступа (ряд кнопок в шапке карточки). */
export const btnStyleInline: CSSProperties = {
  marginTop: 0,
  marginRight: "0.5rem",
  padding: "0.45rem 0.85rem",
  fontSize: "0.9rem",
  cursor: "pointer",
  borderRadius: 6,
  border: "1px solid #d4d4d8",
  background: "#fff",
};

/** Вторичная (компактная) кнопка — CSV, мелкие действия. */
export const btnSecondary: CSSProperties = {
  marginLeft: "0.75rem",
  padding: "0.35rem 0.65rem",
  fontSize: "0.82rem",
  cursor: "pointer",
  borderRadius: 6,
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
  fontSize: "0.95rem",
  padding: "1rem",
  border: "1px solid #e4e4e7",
  borderRadius: 8,
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

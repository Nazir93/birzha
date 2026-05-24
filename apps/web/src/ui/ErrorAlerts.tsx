import type { ReactNode } from "react";

import { humanizeErrorMessage } from "../format/user-facing-error.js";

import { BirzhaAlert } from "./BirzhaAlert.js";

/** Ошибка запроса или формы — не рендерится, если текста нет. */
export function ErrorAlert({
  error,
  message,
  title,
  className,
  role = "alert",
}: {
  error?: unknown;
  message?: string | null;
  title?: string;
  className?: string;
  role?: "alert" | "status";
}) {
  const text =
    message != null && message !== ""
      ? message
      : error != null
        ? humanizeErrorMessage(error)
        : "";
  if (!text) {
    return null;
  }
  return (
    <BirzhaAlert variant="error" title={title} className={className} role={role}>
      {text}
    </BirzhaAlert>
  );
}

/** Предупреждение (блокировка кнопки, офлайн и т.п.). */
export function WarningAlert({
  children,
  title,
  className = "",
  role = "status",
}: {
  children: ReactNode;
  title?: string;
  className?: string;
  role?: "alert" | "status";
}) {
  if (children == null || children === "") {
    return null;
  }
  return (
    <BirzhaAlert variant="warning" title={title} className={className} role={role}>
      {children}
    </BirzhaAlert>
  );
}

/** Информационный блок (подсказки, офлайн-режим). */
export function InfoAlert({
  children,
  title,
  className,
  role = "status",
}: {
  children: ReactNode;
  title?: string;
  className?: string;
  role?: "alert" | "status";
}) {
  return (
    <BirzhaAlert variant="info" title={title} className={className} role={role}>
      {children}
    </BirzhaAlert>
  );
}

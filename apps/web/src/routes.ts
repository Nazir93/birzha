/** Пути клиентского SPA (история браузера, закладки). */
export const routes = {
  reports: "/reports",
  purchaseNakladnaya: "/purchase-nakladnaya",
  operations: "/operations",
  offline: "/offline",
  service: "/service",
  login: "/login",
} as const;

/** Карточка сохранённой накладной (строки, партии). */
export function purchaseNakladnayaDocumentPath(documentId: string): string {
  return `${routes.purchaseNakladnaya}/${encodeURIComponent(documentId)}`;
}

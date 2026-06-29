/** PWA / «На экран Домой»: уже открыто как standalone (не вкладка браузера). */
export function isPwaStandalone(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true || window.matchMedia("(display-mode: standalone)").matches;
}

/** iOS Safari без установки на экран «Домой». */
export function isIosSafariNotStandalone(): boolean {
  if (typeof navigator === "undefined" || isPwaStandalone()) {
    return false;
  }
  const ua = navigator.userAgent;
  const isIos =
    /iphone|ipad|ipod/i.test(ua) ||
    (navigator.platform === "MacIntel" && (navigator.maxTouchPoints ?? 0) > 1);
  return isIos;
}

/** Кабинет продавца — основной сценарий установки PWA. */
export function isSellerCabinetPath(pathname: string): boolean {
  return pathname === "/s" || pathname.startsWith("/s/");
}

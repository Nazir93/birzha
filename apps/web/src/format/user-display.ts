/** Логин из справочника; UUID не показываем, если логин не найден. */
export function resolveUserLogin(
  loginById: Map<string, string>,
  userId: string | null | undefined,
): string {
  const id = userId?.trim();
  if (!id) {
    return "—";
  }
  const login = loginById.get(id)?.trim();
  if (!login || login === id) {
    return "—";
  }
  return login;
}

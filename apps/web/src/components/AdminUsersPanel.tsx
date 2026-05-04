import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { apiFetch, assertOkResponse } from "../api/fetch-api.js";
import { useAuth } from "../auth/auth-context.js";
import { adminRoutes } from "../routes.js";
import { Link } from "react-router-dom";
import { LoadingBlock } from "../ui/LoadingIndicator.js";
import { btnStyle, btnStyleInline, errorText, fieldStyle, muted, tableStyle, thHead, thtd } from "../ui/styles.js";

const ROLE_LABEL: Record<string, string> = {
  admin: "Администратор",
  manager: "Руководитель (зам.)",
  purchaser: "Закупщик",
  warehouse: "Кладовщик",
  logistics: "Логист",
  receiver: "Приёмщик",
  seller: "Продавец",
  accountant: "Бухгалтер",
};

const ALL_ROLE_CODES = [
  "admin",
  "manager",
  "purchaser",
  "warehouse",
  "logistics",
  "receiver",
  "seller",
  "accountant",
] as const;

const MANAGER_ASSIGNABLE: readonly string[] = [
  "purchaser",
  "warehouse",
  "logistics",
  "receiver",
  "seller",
  "accountant",
];

type AdminUserRow = { id: string; login: string; isActive: boolean; roleCodes: string[] };

function rowMayChangePassword(isAdmin: boolean, currentUserId: string, row: AdminUserRow): boolean {
  if (row.id === currentUserId) {
    return true;
  }
  if (isAdmin) {
    return true;
  }
  return !row.roleCodes.includes("admin") && !row.roleCodes.includes("manager");
}

function rowMayDelete(isAdmin: boolean, currentUserId: string, row: AdminUserRow): boolean {
  if (row.id === currentUserId) {
    return false;
  }
  if (isAdmin) {
    return true;
  }
  return !row.roleCodes.includes("admin") && !row.roleCodes.includes("manager");
}

function userIsGlobalAdmin(user: { roles: { roleCode: string; scopeType: string; scopeId: string }[] } | null) {
  if (!user) {
    return false;
  }
  return user.roles.some((r) => r.roleCode === "admin" && r.scopeType === "global" && r.scopeId === "");
}

function UserRowActions({
  row,
  currentUserId,
  isAdmin,
  onPassword,
  onDelete,
  passwordBusy,
  deleteBusy,
}: {
  row: AdminUserRow;
  currentUserId: string;
  isAdmin: boolean;
  onPassword: (userId: string, password: string) => void;
  onDelete: (userId: string) => void;
  passwordBusy: boolean;
  deleteBusy: boolean;
}) {
  const [pw, setPw] = useState("");
  const canPwd = rowMayChangePassword(isAdmin, currentUserId, row);
  const canDel = rowMayDelete(isAdmin, currentUserId, row);

  return (
    <tr>
      <td style={thtd}>
        <strong>{row.login}</strong>
        {row.id === currentUserId ? (
          <span style={{ ...muted, fontSize: "0.82rem", display: "block" }}>это вы</span>
        ) : null}
      </td>
      <td style={thtd}>
        {row.roleCodes.length === 0 ? "—" : row.roleCodes.map((c) => ROLE_LABEL[c] ?? c).join(", ")}
      </td>
      <td style={thtd}>{row.isActive ? "да" : "нет"}</td>
      <td style={{ ...thtd, minWidth: "14rem" }}>
        {canPwd ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", alignItems: "center", marginBottom: canDel ? "0.45rem" : 0 }}>
            <input
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder="Новый пароль"
              style={{ ...fieldStyle, maxWidth: "11rem", fontSize: "0.85rem" }}
              autoComplete="new-password"
            />
            <button
              type="button"
              style={btnStyleInline}
              disabled={passwordBusy || pw.length < 10}
              onClick={() => {
                onPassword(row.id, pw);
                setPw("");
              }}
            >
              Сохранить пароль
            </button>
          </div>
        ) : (
          <span style={muted}>—</span>
        )}
        {canDel ? (
          <button
            type="button"
            style={{ ...btnStyleInline, color: "#b91c1c", borderColor: "#fecaca" }}
            disabled={deleteBusy}
            onClick={() => {
              if (!window.confirm(`Удалить учётную запись «${row.login}»? Действие необратимо.`)) {
                return;
              }
              onDelete(row.id);
            }}
          >
            Удалить
          </button>
        ) : null}
      </td>
    </tr>
  );
}

/**
 * Создание логинов и ролей сотрудников (только admin/manager; зам не выдаёт admin/manager).
 */
export function AdminUsersPanel() {
  const { meta, user } = useAuth();
  const queryClient = useQueryClient();
  const showApi = meta?.adminUsersApi === "enabled" && user != null;
  const isAdmin = userIsGlobalAdmin(user);

  const roleOptions = useMemo(() => (isAdmin ? ALL_ROLE_CODES : MANAGER_ASSIGNABLE), [isAdmin]);

  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [roleCode, setRoleCode] = useState<string>("seller");

  useEffect(() => {
    const allowed = new Set(roleOptions);
    if (!allowed.has(roleCode)) {
      setRoleCode(roleOptions[0] ?? "seller");
    }
  }, [roleOptions, roleCode]);
  const [formError, setFormError] = useState<string | null>(null);
  const [formOk, setFormOk] = useState<string | null>(null);

  const listQ = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const res = await apiFetch("/api/admin/users");
      await assertOkResponse(res, "GET /api/admin/users");
      return (await res.json()) as { users: AdminUserRow[] };
    },
    enabled: showApi,
  });

  const createM = useMutation({
    mutationFn: async (body: { login: string; password: string; roleCode: string }) => {
      const res = await apiFetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status === 409) {
        throw new Error("Пользователь с таким логином уже есть.");
      }
      if (res.status === 403) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        if (j.error === "forbidden_role_assignment") {
          throw new Error("Недостаточно прав: роль «Админ» / «Руководитель» может выдать только администратор.");
        }
        throw new Error("Недостаточно прав (нужен admin или manager).");
      }
      await assertOkResponse(res, "POST /api/admin/users");
      return res.json() as Promise<{ user: AdminUserRow }>;
    },
    onSuccess: () => {
      setFormOk("Пользователь создан. Передайте логин и пароль только сотруднику.");
      setFormError(null);
      setPassword("");
      setLogin("");
      void queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (e: Error) => {
      setFormOk(null);
      setFormError(e.message);
    },
  });

  const passwordM = useMutation({
    mutationFn: async ({ userId, password }: { userId: string; password: string }) => {
      const res = await apiFetch(`/api/admin/users/${encodeURIComponent(userId)}/password`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.status === 403) {
        throw new Error("Недостаточно прав для смены пароля этой учётной записи.");
      }
      await assertOkResponse(res, "PATCH password");
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
  });

  const deleteM = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiFetch(`/api/admin/users/${encodeURIComponent(userId)}`, { method: "DELETE" });
      if (res.status === 403) {
        throw new Error("Недостаточно прав для удаления.");
      }
      if (res.status === 409) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        if (j.error === "cannot_remove_last_admin") {
          throw new Error("Нельзя удалить последнего администратора в системе.");
        }
        throw new Error("Удаление отклонено сервером.");
      }
      if (res.status === 400) {
        throw new Error("Нельзя удалить свою учётную запись.");
      }
      await assertOkResponse(res, "DELETE user");
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
  });

  if (!showApi) {
    return (
      <section className="birzha-home-premium" aria-labelledby="admin-users-heading">
        <header className="birzha-home-hero">
          <div>
            <p className="birzha-home-hero__eyebrow">Доступ</p>
            <h2 id="admin-users-heading" className="birzha-home-hero__title">
              Сотрудники
            </h2>
          </div>
          <nav className="birzha-home-actions no-print" aria-label="Действия">
            <Link to={adminRoutes.operations} className="birzha-home-action">
              <span>Кабинет</span>
              <strong>Перейти к операциям</strong>
            </Link>
            <Link to={adminRoutes.home} className="birzha-home-action">
              <span>Админка</span>
              <strong>Сводка</strong>
            </Link>
          </nav>
        </header>
      </section>
    );
  }

  return (
    <section className="birzha-home-premium" aria-labelledby="admin-users-heading">
      <header className="birzha-home-hero">
        <div>
          <p className="birzha-home-hero__eyebrow">Команда</p>
          <h2 id="admin-users-heading" className="birzha-home-hero__title">
            Сотрудники
          </h2>
        </div>
        <div className="birzha-home-actions no-print" aria-label="Правила доступа">
          <div className="birzha-home-action" role="note">
            <span>Роль manager</span>
            <strong>Без admin/manager</strong>
          </div>
          <div className="birzha-home-action" role="note">
            <span>Пароль</span>
            <strong>От 10 символов</strong>
          </div>
        </div>
      </header>

      <div className="birzha-home-work-card">
        <div className="birzha-section-heading">
          <div>
            <p className="birzha-section-heading__eyebrow">Создание</p>
            <h3 className="birzha-section-title birzha-section-title--sm">Новый пользователь</h3>
          </div>
        </div>
        <div className="birzha-form-grid birzha-form-grid--actions">
          <label style={{ fontSize: "0.88rem" }}>
            Логин
            <input
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              style={{ ...fieldStyle, display: "block", minWidth: "12rem", marginTop: "0.25rem" }}
              autoComplete="off"
            />
          </label>
          <label style={{ fontSize: "0.88rem" }}>
            Пароль (не короче 10 символов)
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ ...fieldStyle, display: "block", minWidth: "12rem", marginTop: "0.25rem" }}
              autoComplete="new-password"
            />
          </label>
          <label style={{ fontSize: "0.88rem" }}>
            Роль
            <select
              value={roleCode}
              onChange={(e) => setRoleCode(e.target.value)}
              style={{ ...fieldStyle, display: "block", minWidth: "14rem", marginTop: "0.25rem" }}
            >
              {roleOptions.map((code) => (
                <option key={code} value={code}>
                  {ROLE_LABEL[code] ?? code}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            style={btnStyle}
            disabled={createM.isPending || !login.trim() || password.length < 10}
            onClick={() => {
              setFormOk(null);
              setFormError(null);
              createM.mutate({ login: login.trim(), password, roleCode });
            }}
          >
            {createM.isPending ? "Создание…" : "Создать"}
          </button>
        </div>
        {formError && (
          <p role="alert" style={{ ...errorText, marginTop: "0.65rem", marginBottom: 0 }}>
            {formError}
          </p>
        )}
        {formOk && (
          <p role="status" style={{ ...muted, marginTop: "0.65rem", marginBottom: 0 }}>
            {formOk}
          </p>
        )}
      </div>

      <div className="birzha-home-work-card">
        <div className="birzha-section-heading">
          <div>
            <p className="birzha-section-heading__eyebrow">Учётные записи</p>
            <h3 className="birzha-section-title birzha-section-title--sm">Список пользователей</h3>
          </div>
          <p className="birzha-section-heading__note">Пароли и удаление — в строке сотрудника</p>
        </div>
        {listQ.isPending && <LoadingBlock label="Загрузка списка…" minHeight={72} />}
        {listQ.isError && (
          <p role="alert" style={errorText}>
            Не удалось загрузить список. Проверьте вход и повторите.
          </p>
        )}
        {listQ.data && user && (
          <div className="birzha-table-scroll">
            <table style={{ ...tableStyle, minWidth: 720 }} aria-label="Пользователи">
              <thead>
                <tr>
                  <th scope="col" style={thHead}>
                    Логин
                  </th>
                  <th scope="col" style={thHead}>
                    Роли
                  </th>
                  <th scope="col" style={thHead}>
                    Активен
                  </th>
                  <th scope="col" style={thHead}>
                    Действия
                  </th>
                </tr>
              </thead>
              <tbody>
                {listQ.data.users.map((u) => (
                  <UserRowActions
                    key={u.id}
                    row={u}
                    currentUserId={user.id}
                    isAdmin={isAdmin}
                    passwordBusy={passwordM.isPending}
                    deleteBusy={deleteM.isPending}
                    onPassword={(userId, password) => passwordM.mutate({ userId, password })}
                    onDelete={(userId) => deleteM.mutate(userId)}
                  />
                ))}
              </tbody>
            </table>
            {(passwordM.error || deleteM.error) && (
              <p role="alert" style={{ ...errorText, marginTop: "0.75rem", marginBottom: 0 }}>
                {passwordM.error?.message ?? deleteM.error?.message}
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

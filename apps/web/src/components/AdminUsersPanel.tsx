import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { apiFetch, assertOkResponse } from "../api/fetch-api.js";
import { useAuth } from "../auth/auth-context.js";
import { BirzhaDisclosure } from "../ui/BirzhaDisclosure.js";
import { LoadingBlock } from "../ui/LoadingIndicator.js";
import { ErrorAlert, WarningAlert } from "../ui/ErrorAlerts.js";
import { btnStyle, btnStyleInline, fieldStyle, tableStyle, thHead, thtd } from "../ui/styles.js";

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

/** Маскировка по умолчанию; админ может временно показать символы, чтобы сверить новый пароль перед сохранением. */
function PasswordFieldWithToggle({
  id,
  value,
  onChange,
  placeholder,
  disabled,
  autoComplete,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  autoComplete?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="birzha-password-field-row">
      <input
        id={id}
        type={visible ? "text" : "password"}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ ...fieldStyle, fontSize: "0.85rem" }}
        autoComplete={autoComplete}
      />
      <button
        type="button"
        style={{ ...btnStyleInline, fontSize: "0.78rem", padding: "0.2rem 0.45rem" }}
        aria-pressed={visible}
        aria-label={visible ? "Скрыть пароль" : "Показать пароль"}
        disabled={disabled}
        onClick={() => setVisible((x) => !x)}
      >
        {visible ? "Скрыть" : "Показать"}
      </button>
    </div>
  );
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
          <span className="birzha-text-muted birzha-text-muted--md" style={{ display: "block" }}>
            это вы
          </span>
        ) : null}
      </td>
      <td style={thtd}>
        {row.roleCodes.length === 0 ? "—" : row.roleCodes.map((c) => ROLE_LABEL[c] ?? c).join(", ")}
      </td>
      <td style={thtd}>{row.isActive ? "да" : "нет"}</td>
      <td style={{ ...thtd, minWidth: "14rem" }}>
        {canPwd ? (
          <div style={{ marginBottom: canDel ? "0.45rem" : 0 }}>
            <span className="birzha-text-muted birzha-text-muted--micro" style={{ display: "block", marginBottom: 2 }}>
              Новый пароль (текущий на сервере не показывается — хранится только хэш)
            </span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", alignItems: "center" }}>
              <PasswordFieldWithToggle
                value={pw}
                onChange={setPw}
                placeholder="мин. 10 символов"
                disabled={passwordBusy}
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
          </div>
        ) : (
          <span className="birzha-text-muted">—</span>
        )}
        {canDel ? (
          <button
            type="button"
            className="birzha-btn-danger-outline birzha-btn-danger-outline--compact"
            style={{ marginTop: "0.35rem" }}
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
type AdminUsersPanelProps = {
  embedded?: boolean;
};

export function AdminUsersPanel({ embedded = false }: AdminUsersPanelProps = {}) {
  const { meta, user } = useAuth();
  const queryClient = useQueryClient();
  const showApi = meta?.adminUsersApi === "enabled" && user != null;
  const isAdmin = userIsGlobalAdmin(user);

  const roleOptions = useMemo(() => (isAdmin ? ALL_ROLE_CODES : MANAGER_ASSIGNABLE), [isAdmin]);

  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [passwordAgain, setPasswordAgain] = useState("");
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
      setPasswordAgain("");
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
    const unavailable = (
      <p className="birzha-callout-warning" role="status">
        Управление сотрудниками недоступно (нужен PostgreSQL и авторизация на API).
      </p>
    );
    if (embedded) {
      return <div className="birzha-settings-admin__embedded">{unavailable}</div>;
    }
    return (
      <section className="birzha-home-premium" aria-labelledby="admin-users-heading">
        <header className="birzha-home-hero">
          <div>
            <p className="birzha-home-hero__eyebrow">Доступ</p>
            <h2 id="admin-users-heading" className="birzha-home-hero__title">
              Сотрудники
            </h2>
          </div>
        </header>
        {unavailable}
      </section>
    );
  }

  const body = (
    <>
      <div className="birzha-home-work-card">
        <BirzhaDisclosure
          nested
          defaultOpen
          title={
            <div className="birzha-section-heading">
              <div>
                <p className="birzha-section-heading__eyebrow">Создание</p>
                <h3 className="birzha-section-title birzha-section-title--sm">Новый пользователь</h3>
              </div>
            </div>
          }
        >
        <p className="birzha-callout-info" style={{ fontSize: "0.82rem", marginTop: 0, marginBottom: "0.75rem", lineHeight: 1.45 }}>
          Ввод по умолчанию скрыт звёздочками; кнопка «Показать» нужна, чтобы сверить символы перед сохранением. Ранее
          заданный пароль из базы не отображается — хранится только хэш.
        </p>
        <div className="birzha-admin-user-create-row">
          <label className="birzha-form-label birzha-form-label--block">
            Логин
            <input
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              style={fieldStyle}
              autoComplete="off"
            />
          </label>
          <label className="birzha-form-label birzha-form-label--block">
            Новый пароль (≥ 10 символов)
            <PasswordFieldWithToggle
              value={password}
              onChange={setPassword}
              disabled={createM.isPending}
              autoComplete="new-password"
            />
          </label>
          <label className="birzha-form-label birzha-form-label--block">
            Повтор нового пароля
            <PasswordFieldWithToggle
              value={passwordAgain}
              onChange={setPasswordAgain}
              disabled={createM.isPending}
              autoComplete="new-password"
            />
          </label>
          <label className="birzha-form-label birzha-form-label--block">
            Роль
            <select value={roleCode} onChange={(e) => setRoleCode(e.target.value)} style={fieldStyle}>
              {roleOptions.map((code) => (
                <option key={code} value={code}>
                  {ROLE_LABEL[code] ?? code}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="birzha-admin-user-create-row__submit"
            style={btnStyle}
            disabled={
              createM.isPending ||
              !login.trim() ||
              password.length < 10 ||
              password !== passwordAgain
            }
            onClick={() => {
              setFormOk(null);
              setFormError(null);
              if (password !== passwordAgain) {
                setFormError("Новый пароль и повтор не совпадают.");
                return;
              }
              createM.mutate({ login: login.trim(), password, roleCode });
            }}
          >
            {createM.isPending ? "Создание…" : "Создать"}
          </button>
        </div>
        {password.length >= 10 && passwordAgain.length > 0 && password !== passwordAgain ? (
          <WarningAlert title="Пароль">Поля «новый пароль» и «повтор» должны совпадать.</WarningAlert>
        ) : null}
        {formError ? <ErrorAlert message={formError} title="Пользователь" /> : null}
        {formOk && (
          <p role="status" className="birzha-callout-info" style={{ marginTop: "0.65rem", marginBottom: 0 }}>
            {formOk}
          </p>
        )}
        </BirzhaDisclosure>
      </div>

      <div className="birzha-home-work-card">
        <BirzhaDisclosure
          nested
          defaultOpen
          title={
            <div className="birzha-section-heading">
              <div>
                <p className="birzha-section-heading__eyebrow">Учётные записи</p>
                <h3 className="birzha-section-title birzha-section-title--sm">Список пользователей</h3>
              </div>
              <p className="birzha-section-heading__note">Пароли и удаление — в строке сотрудника</p>
            </div>
          }
        >
        {listQ.isPending && (
          <LoadingBlock label="Загрузка списка…" minHeight={72} skeleton skeletonRows={6} />
        )}
        {listQ.isError ? (
          <ErrorAlert message="Не удалось загрузить список. Проверьте вход и повторите." title="Пользователи" />
        ) : null}
        {listQ.data && user && (
          <div className="birzha-table-scroll birzha-table-scroll--sticky-head">
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
            {passwordM.error ? <ErrorAlert error={passwordM.error} title="Пароль" /> : null}
            {deleteM.error ? <ErrorAlert error={deleteM.error} title="Удаление" /> : null}
          </div>
        )}
        </BirzhaDisclosure>
      </div>
    </>
  );

  if (embedded) {
    return (
      <div className="birzha-settings-admin__embedded" aria-label="Сотрудники">
        <p className="birzha-text-muted birzha-ui-sm" style={{ margin: "0 0 0.75rem" }}>
          Роль «руководитель» не может выдавать admin/manager. Пароль — не менее 10 символов.
        </p>
        {body}
      </div>
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
      {body}
    </section>
  );
}

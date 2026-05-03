import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import type { SyncRequestBody } from "../application/sync/sync-request.schema.js";
import { hasAnyGlobalRole, MVP_ROLE_CODES } from "../auth/global-roles.js";
import type { AuthRoleGrant } from "../auth/role-grant.js";
import type { AppEnv } from "../config.js";

/** Общее чтение списков/карточек (GET /batches, GET /trips, GET /trips/:id). */
const READ_ROLES = MVP_ROLE_CODES;

/** Отчёт по рейсу — все роли MVP (в т.ч. бухгалтер). */
const REPORT_READ_ROLES = MVP_ROLE_CODES;

/** Создание/закрытие рейса — логист + руководство. */
const TRIP_WRITE_ROLES = ["admin", "manager", "logistics"] as const;

/** Закрепить рейс за продавцом: узкое право без создания/закрытия рейсов. */
const TRIP_ASSIGN_SELLER_ROLES = ["admin", "manager", "purchaser", "logistics"] as const;

/** Создание партии (закупка) — закуп + склад + руководство. */
const BATCH_CREATE_ROLES = ["admin", "manager", "purchaser", "warehouse"] as const;

/** POST/DELETE /warehouses, /product-grades — админ-кабинет (как в `canManageInventoryCatalog` на вебе). */
const INVENTORY_CATALOG_ROLES = ["admin", "manager"] as const;

/** Оприходование на склад. */
const RECEIVE_ROLES = ["admin", "manager", "warehouse"] as const;

/** Отгрузка в рейс. */
const SHIP_ROLES = ["admin", "manager", "warehouse", "logistics"] as const;

/** Продажа с рейса. */
const SELL_ROLES = ["admin", "manager", "seller"] as const;

/** Недостача по рейсу. */
const SHORTAGE_ROLES = ["admin", "manager", "warehouse", "receiver"] as const;

/** Офлайн POST /sync — любая роль MVP для прохода JWT; тип действия дополнительно сверяется с `userMayPerformSyncAction`. */
const SYNC_ROLES = MVP_ROLE_CODES;

/** GET /counterparties — все роли MVP (нужны продавцу, бухгалтеру и т.д.). */
const CATALOG_READ_ROLES = MVP_ROLE_CODES;

/** POST /counterparties — ведение справочника (см. матрицу «Справочники» в `roles-and-permissions.md`). */
const CATALOG_WRITE_ROLES = ["admin", "manager", "accountant"] as const;

/** Тот же смысл, что цепочки REST для соответствующих операций (продавец — только продажа с рейса и т.д.). */
const SYNC_ACTION_ROLES: Record<SyncRequestBody["actionType"], readonly string[]> = {
  sell_from_trip: SELL_ROLES,
  ship_to_trip: SHIP_ROLES,
  record_trip_shortage: SHORTAGE_ROLES,
  receive_on_warehouse: RECEIVE_ROLES,
  create_trip: TRIP_WRITE_ROLES,
};

/** Проверка прав на конкретное офлайн-действие (после успешной аутентификации). */
export function userMayPerformSyncAction(
  user: { roles: AuthRoleGrant[] },
  actionType: SyncRequestBody["actionType"],
): boolean {
  return hasAnyGlobalRole(user, SYNC_ACTION_ROLES[actionType]);
}

export type AuthPreHandler = (request: FastifyRequest, reply: FastifyReply) => void | Promise<void>;

/** Управление учётными записями (`GET/POST /admin/users`) — только admin/manager. */
const USER_MANAGEMENT_ROLES = ["admin", "manager"] as const;

export type BusinessRouteAuth = {
  dataRead: AuthPreHandler[];
  tripReportRead: AuthPreHandler[];
  tripWrite: AuthPreHandler[];
  tripAssignSeller: AuthPreHandler[];
  batchCreate: AuthPreHandler[];
  receive: AuthPreHandler[];
  ship: AuthPreHandler[];
  sell: AuthPreHandler[];
  shortage: AuthPreHandler[];
  sync: AuthPreHandler[];
  catalogRead: AuthPreHandler[];
  catalogWrite: AuthPreHandler[];
  /** POST/DELETE /warehouses, /product-grades — только admin/manager. */
  inventoryCatalogWrite: AuthPreHandler[];
  /** Список и создание пользователей — только admin/manager (зам не выдаёт роли admin/manager без самого admin). */
  userManagement: AuthPreHandler[];
};

const EMPTY_AUTH: BusinessRouteAuth = {
  dataRead: [],
  tripReportRead: [],
  tripWrite: [],
  tripAssignSeller: [],
  batchCreate: [],
  receive: [],
  ship: [],
  sell: [],
  shortage: [],
  sync: [],
  catalogRead: [],
  catalogWrite: [],
  inventoryCatalogWrite: [],
  userManagement: [],
};

function requireGlobalRoles(allowed: readonly string[]): AuthPreHandler {
  return async function roleGuard(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user as { roles: { roleCode: string; scopeType: string; scopeId: string }[] };
    if (!hasAnyGlobalRole(user, allowed)) {
      return reply.code(403).send({ error: "forbidden" });
    }
  };
}

/**
 * Цепочки `preHandler` для бизнес-маршрутов. Без `REQUIRE_API_AUTH` — пустые массивы.
 * Требует заранее зарегистрированного `registerAuthRoutes` (`app.authenticate`).
 */
export function createBusinessRouteAuth(app: FastifyInstance, env: AppEnv): BusinessRouteAuth {
  if (!env.REQUIRE_API_AUTH) {
    return EMPTY_AUTH;
  }
  if (typeof app.authenticate !== "function") {
    throw new Error("REQUIRE_API_AUTH: ожидается JWT (DATABASE_URL + JWT_SECRET) и registerAuthRoutes");
  }
  const a = app.authenticate.bind(app) as AuthPreHandler;
  return {
    dataRead: [a, requireGlobalRoles(READ_ROLES)],
    tripReportRead: [a, requireGlobalRoles(REPORT_READ_ROLES)],
    tripWrite: [a, requireGlobalRoles(TRIP_WRITE_ROLES)],
    tripAssignSeller: [a, requireGlobalRoles(TRIP_ASSIGN_SELLER_ROLES)],
    batchCreate: [a, requireGlobalRoles(BATCH_CREATE_ROLES)],
    receive: [a, requireGlobalRoles(RECEIVE_ROLES)],
    ship: [a, requireGlobalRoles(SHIP_ROLES)],
    sell: [a, requireGlobalRoles(SELL_ROLES)],
    shortage: [a, requireGlobalRoles(SHORTAGE_ROLES)],
    sync: [a, requireGlobalRoles(SYNC_ROLES)],
    catalogRead: [a, requireGlobalRoles(CATALOG_READ_ROLES)],
    catalogWrite: [a, requireGlobalRoles(CATALOG_WRITE_ROLES)],
    inventoryCatalogWrite: [a, requireGlobalRoles(INVENTORY_CATALOG_ROLES)],
    userManagement: [a, requireGlobalRoles(USER_MANAGEMENT_ROLES)],
  };
}

/** Опции маршрута Fastify: пустой объект, если проверок нет. */
export function withPreHandlers(hooks: AuthPreHandler[]): { preHandler?: AuthPreHandler[] } {
  return hooks.length > 0 ? { preHandler: hooks } : {};
}

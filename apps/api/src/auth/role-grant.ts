/** Запись из `user_roles` для JWT и `/auth/me`. */
export type AuthRoleGrant = {
  roleCode: string;
  scopeType: string;
  scopeId: string;
};

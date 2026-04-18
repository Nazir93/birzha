import type { AuthRoleGrant } from "../auth/role-grant.js";

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: {
      sub: string;
      login: string;
      roles: AuthRoleGrant[];
    };
  }
}

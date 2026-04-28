import type { FastifyInstance } from "fastify";

import {
  filterPurchaseSummariesForPurchaserScope,
  purchaseDocumentReadableByPurchaser,
} from "../auth/purchase-scope.js";
import type { AuthRoleGrant } from "../auth/role-grant.js";
import { warehouseReadScopeIds } from "../auth/warehouse-scope.js";
import {
  createProductGradeBodySchema,
  createPurchaseDocumentBodySchema,
  createWarehouseBodySchema,
} from "@birzha/contracts";
import { z } from "zod";

import type { ProductGradeRepository } from "../application/ports/product-grade-repository.port.js";
import type { PurchaseDocumentRepository } from "../application/ports/purchase-document-repository.port.js";
import type { WarehouseRepository } from "../application/ports/warehouse-repository.port.js";
import { CreatePurchaseDocumentUseCase } from "../application/purchase/create-purchase-document.use-case.js";
import { DeleteProductGradeUseCase } from "../application/purchase/delete-product-grade.use-case.js";
import { DeletePurchaseDocumentUseCase } from "../application/purchase/delete-purchase-document.use-case.js";
import { DeleteWarehouseUseCase } from "../application/warehouse/delete-warehouse.use-case.js";

import { sendMappedError } from "./map-http-error.js";
import { type BusinessRouteAuth, withPreHandlers } from "./route-auth.js";

type JwtUser = { sub: string; roles: AuthRoleGrant[] };

export function registerPurchaseDocumentRoutes(
  app: FastifyInstance,
  deps: {
    warehouses: WarehouseRepository;
    grades: ProductGradeRepository;
    purchaseDocuments: PurchaseDocumentRepository;
    createPurchaseDocument: CreatePurchaseDocumentUseCase;
    deletePurchaseDocument: DeletePurchaseDocumentUseCase;
    deleteWarehouse: DeleteWarehouseUseCase;
    deleteProductGrade: DeleteProductGradeUseCase;
  },
  routeAuth: BusinessRouteAuth,
): void {
  const {
    warehouses,
    grades,
    purchaseDocuments,
    createPurchaseDocument,
    deletePurchaseDocument,
    deleteWarehouse,
    deleteProductGrade,
  } = deps;

  app.get("/warehouses", { ...withPreHandlers(routeAuth.catalogRead) }, async (_req, reply) => {
    try {
      const list = await warehouses.list();
      return reply.send({ warehouses: list });
    } catch (error) {
      return sendMappedError(reply, error);
    }
  });

  app.delete(
    "/warehouses/:warehouseId",
    { ...withPreHandlers(routeAuth.inventoryCatalogWrite) },
    async (req, reply) => {
      try {
        const params = z.object({ warehouseId: z.string().min(1) }).parse(req.params);
        await deleteWarehouse.execute(params.warehouseId);
        return reply.code(204).send();
      } catch (error) {
        return sendMappedError(reply, error);
      }
    },
  );

  app.post("/warehouses", { ...withPreHandlers(routeAuth.inventoryCatalogWrite) }, async (req, reply) => {
    try {
      const body = createWarehouseBodySchema.parse(req.body);
      const warehouse = await warehouses.create({ name: body.name, code: body.code });
      return reply.code(201).send({ warehouse });
    } catch (error) {
      return sendMappedError(reply, error);
    }
  });

  app.get("/product-grades", { ...withPreHandlers(routeAuth.catalogRead) }, async (_req, reply) => {
    try {
      const list = await grades.list();
      return reply.send({ productGrades: list });
    } catch (error) {
      return sendMappedError(reply, error);
    }
  });

  app.delete(
    "/product-grades/:productGradeId",
    { ...withPreHandlers(routeAuth.inventoryCatalogWrite) },
    async (req, reply) => {
      try {
        const params = z.object({ productGradeId: z.string().min(1) }).parse(req.params);
        await deleteProductGrade.execute(params.productGradeId);
        return reply.code(204).send();
      } catch (error) {
        return sendMappedError(reply, error);
      }
    },
  );

  app.post("/product-grades", { ...withPreHandlers(routeAuth.inventoryCatalogWrite) }, async (req, reply) => {
    try {
      const body = createProductGradeBodySchema.parse(req.body);
      const productGrade = await grades.create({
        code: body.code,
        displayName: body.displayName,
        sortOrder: body.sortOrder,
        productGroup: body.productGroup,
      });
      return reply.code(201).send({ productGrade });
    } catch (error) {
      return sendMappedError(reply, error);
    }
  });

  app.get("/purchase-documents", { ...withPreHandlers(routeAuth.dataRead) }, async (req, reply) => {
    try {
      const documents = await purchaseDocuments.listSummaries();
      const user = req.user as JwtUser | undefined;
      const scope = user ? warehouseReadScopeIds(user) : null;
      let filtered =
        scope && scope.size > 0 ? documents.filter((d) => scope.has(d.warehouseId.trim())) : documents;
      filtered = filterPurchaseSummariesForPurchaserScope(filtered, user, user?.sub);
      return reply.send({ purchaseDocuments: filtered });
    } catch (error) {
      return sendMappedError(reply, error);
    }
  });

  app.get("/purchase-documents/:documentId", { ...withPreHandlers(routeAuth.dataRead) }, async (req, reply) => {
    try {
      const params = z.object({ documentId: z.string().min(1) }).parse(req.params);
      const doc = await purchaseDocuments.findByIdWithLines(params.documentId);
      if (!doc) {
        return reply.code(404).send({ error: "purchase_document_not_found", documentId: params.documentId });
      }
      const user = req.user as JwtUser | undefined;
      const scope = user ? warehouseReadScopeIds(user) : null;
      if (scope && scope.size > 0 && !scope.has(doc.warehouseId.trim())) {
        return reply.code(403).send({ error: "forbidden" });
      }
      if (user?.sub && !purchaseDocumentReadableByPurchaser(doc, user, user.sub)) {
        return reply.code(403).send({ error: "forbidden" });
      }
      return reply.send(doc);
    } catch (error) {
      return sendMappedError(reply, error);
    }
  });

  app.post("/purchase-documents", { ...withPreHandlers(routeAuth.batchCreate) }, async (req, reply) => {
    try {
      const body = createPurchaseDocumentBodySchema.parse(req.body);
      const user = req.user as JwtUser | undefined;
      const result = await createPurchaseDocument.execute(body, { createdByUserId: user?.sub });
      return reply.code(201).send(result);
    } catch (error) {
      return sendMappedError(reply, error);
    }
  });

  app.delete(
    "/purchase-documents/:documentId",
    { ...withPreHandlers(routeAuth.inventoryCatalogWrite) },
    async (req, reply) => {
      try {
        const params = z.object({ documentId: z.string().min(1) }).parse(req.params);
        await deletePurchaseDocument.execute(params.documentId);
        return reply.code(204).send();
      } catch (error) {
        return sendMappedError(reply, error);
      }
    },
  );
}

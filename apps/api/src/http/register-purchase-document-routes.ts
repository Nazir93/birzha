import type { FastifyInstance } from "fastify";

import {
  filterPurchaseSummariesForPurchaserScope,
  purchaseDocumentReadableByPurchaser,
} from "../auth/purchase-scope.js";
import type { AuthRoleGrant } from "../auth/role-grant.js";
import { globalRoleCodes } from "../auth/global-roles.js";
import { warehouseReadScopeIds } from "../auth/warehouse-scope.js";
import {
  createProductGradeBodySchema,
  createPurchaseDocumentBodySchema,
  createWarehouseBodySchema,
  replacePurchaseDocumentLinesBodySchema,
  updatePurchaseDocumentHeaderBodySchema,
} from "@birzha/contracts";
import { z } from "zod";

import type { ProductGradeRepository } from "../application/ports/product-grade-repository.port.js";
import type { PurchaseDocumentRepository } from "../application/ports/purchase-document-repository.port.js";
import type { BatchRepository } from "../application/ports/batch-repository.port.js";
import type { WarehouseRepository } from "../application/ports/warehouse-repository.port.js";
import type { DbClient } from "../db/client.js";
import { CreatePurchaseDocumentUseCase } from "../application/purchase/create-purchase-document.use-case.js";
import { DeleteProductGradeUseCase } from "../application/purchase/delete-product-grade.use-case.js";
import { DeletePurchaseDocumentUseCase } from "../application/purchase/delete-purchase-document.use-case.js";
import {
  evaluatePurchaseDocumentLinesEditability,
  type PurchaseDocumentLinesLockChecker,
  ReplacePurchaseDocumentLinesUseCase,
} from "../application/purchase/replace-purchase-document-lines.use-case.js";
import { UpdatePurchaseDocumentHeaderUseCase } from "../application/purchase/update-purchase-document-header.use-case.js";
import { DeleteWarehouseUseCase } from "../application/warehouse/delete-warehouse.use-case.js";

import { sendMappedError } from "./map-http-error.js";
import {
  listPurchaseDocumentsForHttp,
  purchaseDocumentsListQuerySchema,
} from "./purchase-document-list-http.js";
import { type BusinessRouteAuth, withPreHandlers } from "./route-auth.js";

type JwtUser = { sub: string; roles: AuthRoleGrant[] };

function purchaseListScopeForUser(user: JwtUser | undefined): {
  warehouseIds?: string[];
  purchaserUserId?: string;
} {
  if (!user) {
    return {};
  }
  const scope = warehouseReadScopeIds(user);
  const warehouseIds = scope && scope.size > 0 ? [...scope] : undefined;
  const globals = globalRoleCodes(user);
  const purchaserUserId =
    !globals.includes("admin") && !globals.includes("manager") && globals.includes("purchaser")
      ? user.sub
      : undefined;
  return { warehouseIds, purchaserUserId };
}

export function registerPurchaseDocumentRoutes(
  app: FastifyInstance,
  deps: {
    db?: DbClient | null;
    warehouses: WarehouseRepository;
    grades: ProductGradeRepository;
    purchaseDocuments: PurchaseDocumentRepository;
    batches: BatchRepository;
    linesLockChecker: PurchaseDocumentLinesLockChecker;
    createPurchaseDocument: CreatePurchaseDocumentUseCase;
    deletePurchaseDocument: DeletePurchaseDocumentUseCase;
    updatePurchaseDocumentHeader: UpdatePurchaseDocumentHeaderUseCase;
    replacePurchaseDocumentLines: ReplacePurchaseDocumentLinesUseCase;
    deleteWarehouse: DeleteWarehouseUseCase;
    deleteProductGrade: DeleteProductGradeUseCase;
  },
  routeAuth: BusinessRouteAuth,
): void {
  const {
    db,
    warehouses,
    grades,
    purchaseDocuments,
    batches,
    linesLockChecker,
    createPurchaseDocument,
    deletePurchaseDocument,
    updatePurchaseDocumentHeader,
    replacePurchaseDocumentLines,
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
      const parsed = purchaseDocumentsListQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid_query", issues: parsed.error.flatten() });
      }
      const limit = parsed.data.limit ?? 100;
      const offset = parsed.data.offset ?? 0;
      const user = req.user as JwtUser | undefined;
      const scopeOpts = purchaseListScopeForUser(user);

      let purchaseDocumentsOut;
      let listMeta: { limit: number; offset: number; hasMore: boolean; totalCount: number };

      if (db) {
        const payload = await listPurchaseDocumentsForHttp(db, {
          search: parsed.data.search,
          limit,
          offset,
          scope: parsed.data.scope,
          warehouseIds: scopeOpts.warehouseIds,
          purchaserUserId: scopeOpts.purchaserUserId,
        });
        purchaseDocumentsOut = payload.purchaseDocuments;
        listMeta = payload.listMeta;
      } else {
        let documents = await purchaseDocuments.listSummaries();
        if (scopeOpts.warehouseIds && scopeOpts.warehouseIds.length > 0) {
          const allowed = new Set(scopeOpts.warehouseIds);
          documents = documents.filter((d) => allowed.has(d.warehouseId.trim()));
        }
        documents = filterPurchaseSummariesForPurchaserScope(documents, user, user?.sub);
        const totalCount = documents.length;
        purchaseDocumentsOut = documents.slice(offset, offset + limit);
        listMeta = {
          limit,
          offset,
          hasMore: offset + purchaseDocumentsOut.length < totalCount,
          totalCount,
        };
      }

      return reply.send({ purchaseDocuments: purchaseDocumentsOut, listMeta });
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
      const editability = await evaluatePurchaseDocumentLinesEditability(
        doc.id,
        doc.lines.map((l) => l.batchId),
        batches,
        linesLockChecker,
      );
      return reply.send({
        ...doc,
        linesEditable: editability.editable,
        linesEditLockReason: editability.editable ? null : editability.reason,
      });
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

  app.put(
    "/purchase-documents/:documentId/lines",
    { ...withPreHandlers(routeAuth.inventoryCatalogWrite) },
    async (req, reply) => {
      try {
        const params = z.object({ documentId: z.string().min(1) }).parse(req.params);
        const body = replacePurchaseDocumentLinesBodySchema.parse(req.body);
        await replacePurchaseDocumentLines.execute(params.documentId, body);
        return reply.code(204).send();
      } catch (error) {
        return sendMappedError(reply, error);
      }
    },
  );

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

  app.patch(
    "/purchase-documents/:documentId",
    { ...withPreHandlers(routeAuth.inventoryCatalogWrite) },
    async (req, reply) => {
      try {
        const params = z.object({ documentId: z.string().min(1) }).parse(req.params);
        const body = updatePurchaseDocumentHeaderBodySchema.parse(req.body);
        await updatePurchaseDocumentHeader.execute(params.documentId, body);
        return reply.code(204).send();
      } catch (error) {
        return sendMappedError(reply, error);
      }
    },
  );
}

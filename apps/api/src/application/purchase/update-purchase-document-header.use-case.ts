import { PurchaseDocumentNotFoundError } from "../errors.js";
import type { PurchaseDocumentRepository } from "../ports/purchase-document-repository.port.js";

export type UpdatePurchaseDocumentHeaderInput = {
  documentNumber?: string;
  docDate?: string;
};

export class UpdatePurchaseDocumentHeaderUseCase {
  constructor(private readonly purchaseDocuments: PurchaseDocumentRepository) {}

  async execute(documentId: string, input: UpdatePurchaseDocumentHeaderInput): Promise<void> {
    const id = documentId.trim();
    const existing = await this.purchaseDocuments.findByIdWithLines(id);
    if (!existing) {
      throw new PurchaseDocumentNotFoundError(id);
    }
    await this.purchaseDocuments.updateHeader(id, {
      documentNumber: input.documentNumber,
      docDate: input.docDate ? parseIsoDateOnly(input.docDate) : undefined,
    });
  }
}

function parseIsoDateOnly(iso: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    return new Date(iso);
  }
  return new Date(`${iso}T12:00:00.000Z`);
}

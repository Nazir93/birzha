import type { PurchaseDocumentRepository } from "../ports/purchase-document-repository.port.js";

/** Удаление накладной: партии и движения рейса по `batch_id` в одной транзакции (Drizzle) или согласовано в памяти. */
export class DeletePurchaseDocumentUseCase {
  constructor(private readonly purchaseDocuments: PurchaseDocumentRepository) {}

  async execute(documentId: string): Promise<void> {
    await this.purchaseDocuments.deleteById(documentId);
  }
}

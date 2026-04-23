import { ProductGradeNotFoundError, ResourceInUseError } from "../errors.js";
import type { ProductGradeRepository } from "../ports/product-grade-repository.port.js";
import type { PurchaseDocumentRepository } from "../ports/purchase-document-repository.port.js";

export class DeleteProductGradeUseCase {
  constructor(
    private readonly grades: ProductGradeRepository,
    private readonly purchaseDocuments: PurchaseDocumentRepository,
  ) {}

  async execute(productGradeId: string): Promise<void> {
    if (!(await this.grades.findById(productGradeId))) {
      throw new ProductGradeNotFoundError(productGradeId);
    }
    if (await this.purchaseDocuments.hasProductGradeInAnyLine(productGradeId)) {
      throw new ResourceInUseError("product_grade", "Калибр используется в строках накладных; сначала удалите эти накладные.");
    }
    await this.grades.deleteById(productGradeId);
  }
}

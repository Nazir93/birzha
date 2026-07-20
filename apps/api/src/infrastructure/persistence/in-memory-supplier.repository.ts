import { randomUUID } from "node:crypto";

import type { SupplierRecord, SupplierRepository } from "../../application/ports/supplier-repository.port.js";

export class InMemorySupplierRepository implements SupplierRepository {
  private readonly rows = new Map<string, { name: string; sortOrder: number; isActive: boolean }>();

  async findActiveById(id: string): Promise<SupplierRecord | null> {
    const r = this.rows.get(id.trim());
    if (!r?.isActive) {
      return null;
    }
    return { id: id.trim(), name: r.name, sortOrder: r.sortOrder, isActive: true };
  }

  async findById(id: string): Promise<SupplierRecord | null> {
    const r = this.rows.get(id.trim());
    if (!r) {
      return null;
    }
    return { id: id.trim(), name: r.name, sortOrder: r.sortOrder, isActive: r.isActive };
  }

  async findActiveByName(name: string): Promise<SupplierRecord | null> {
    const n = name.trim().toLowerCase();
    if (!n) {
      return null;
    }
    for (const [id, r] of this.rows) {
      if (r.isActive && r.name.toLowerCase() === n) {
        return { id, name: r.name, sortOrder: r.sortOrder, isActive: true };
      }
    }
    return null;
  }

  async listAll(): Promise<SupplierRecord[]> {
    const out: SupplierRecord[] = [];
    for (const [id, r] of this.rows) {
      out.push({ id, name: r.name, sortOrder: r.sortOrder, isActive: r.isActive });
    }
    out.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "ru"));
    return out;
  }

  async create(name: string, sortOrder = 0): Promise<SupplierRecord> {
    const id = randomUUID();
    const n = name.trim();
    this.rows.set(id, { name: n, sortOrder, isActive: true });
    return { id, name: n, sortOrder, isActive: true };
  }

  async setActive(id: string, isActive: boolean): Promise<void> {
    const r = this.rows.get(id.trim());
    if (r) {
      r.isActive = isActive;
    }
  }
}

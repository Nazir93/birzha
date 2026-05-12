import { randomUUID } from "node:crypto";

import type { WholesalerRecord, WholesalerRepository } from "../../application/ports/wholesaler-repository.port.js";

export class InMemoryWholesalerRepository implements WholesalerRepository {
  private readonly rows = new Map<string, { name: string; sortOrder: number; isActive: boolean }>();

  async findActiveById(id: string): Promise<WholesalerRecord | null> {
    const r = this.rows.get(id.trim());
    if (!r?.isActive) {
      return null;
    }
    return { id: id.trim(), name: r.name, sortOrder: r.sortOrder, isActive: true };
  }

  async findById(id: string): Promise<WholesalerRecord | null> {
    const r = this.rows.get(id.trim());
    if (!r) {
      return null;
    }
    return { id: id.trim(), name: r.name, sortOrder: r.sortOrder, isActive: r.isActive };
  }

  async listAll(): Promise<WholesalerRecord[]> {
    const out: WholesalerRecord[] = [];
    for (const [id, r] of this.rows) {
      out.push({ id, name: r.name, sortOrder: r.sortOrder, isActive: r.isActive });
    }
    out.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "ru"));
    return out;
  }

  async create(name: string, sortOrder = 0): Promise<WholesalerRecord> {
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

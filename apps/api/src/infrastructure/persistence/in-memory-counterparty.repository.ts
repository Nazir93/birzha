import { randomUUID } from "node:crypto";

import type { CounterpartyRecord, CounterpartyRepository } from "../../application/ports/counterparty-repository.port.js";

export class InMemoryCounterpartyRepository implements CounterpartyRepository {
  private readonly rows = new Map<string, { displayName: string; isActive: boolean }>();

  async findActiveById(id: string): Promise<CounterpartyRecord | null> {
    const r = this.rows.get(id);
    if (!r?.isActive) {
      return null;
    }
    return { id, displayName: r.displayName };
  }

  async listActive(): Promise<CounterpartyRecord[]> {
    const out: CounterpartyRecord[] = [];
    for (const [id, r] of this.rows) {
      if (r.isActive) {
        out.push({ id, displayName: r.displayName });
      }
    }
    out.sort((a, b) => a.displayName.localeCompare(b.displayName, "ru"));
    return out;
  }

  async create(displayName: string): Promise<CounterpartyRecord> {
    const id = randomUUID();
    const name = displayName.trim();
    this.rows.set(id, { displayName: name, isActive: true });
    return { id, displayName: name };
  }
}

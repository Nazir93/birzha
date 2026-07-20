import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const drizzleDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../drizzle");

describe("drizzle migrations journal", () => {
  it("каждый *.sql в journal, и наоборот", () => {
    const sqlTags = fs
      .readdirSync(drizzleDir)
      .filter((f) => f.endsWith(".sql"))
      .map((f) => f.replace(/\.sql$/, ""))
      .sort();
    const journal = JSON.parse(fs.readFileSync(path.join(drizzleDir, "meta/_journal.json"), "utf8")) as {
      entries: { tag: string }[];
    };
    const journalTags = journal.entries.map((e) => e.tag).sort();
    expect(journalTags).toEqual(sqlTags);
  });
});

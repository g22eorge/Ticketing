import { prisma } from "@/lib/prisma";

/**
 * Get column names for a table — works on both local SQLite and Turso/libSQL.
 * Uses sqlite_master (not PRAGMA table_info) because Turso does not support PRAGMA.
 */
export async function getTableColumns(tableName: string): Promise<Set<string>> {
  try {
    const rows = await prisma.$queryRaw<Array<{ sql: string }>>`
      SELECT sql FROM sqlite_master WHERE type='table' AND name=${tableName}
    `;
    if (!rows[0]?.sql) return new Set();
    const sql = rows[0].sql;
    const match = sql.match(/\(([\s\S]+)\)/);
    if (!match) return new Set();
    const body = match[1];
    const cols = new Set<string>();
    for (const part of body.split(",")) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      const colName = trimmed.split(/\s+/)[0].replace(/^"|"$/g, "");
      if (colName) cols.add(colName);
    }
    return cols;
  } catch {
    return new Set();
  }
}

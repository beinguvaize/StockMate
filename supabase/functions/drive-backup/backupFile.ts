// Mirror of buildBackup / backupFileName / checksum in src/lib/backupFile.js.
// The edge bundler only takes this directory, so the file is copied rather
// than imported. src/lib/driveBackup.test.js fails if the two ever differ.

export const BACKUP_FORMAT = 2;

export function checksum(tables: Record<string, any[]> = {}): string {
  let h = 5381;
  for (const name of Object.keys(tables).sort()) {
    const rows = tables[name] || [];
    const piece = `${name}:${rows.length}:${rows.map((r) => r?.id ?? "").join(",")}`;
    for (let i = 0; i < piece.length; i += 1) {
      h = ((h << 5) + h + piece.charCodeAt(i)) >>> 0;
    }
  }
  return h.toString(16);
}

export function buildBackup(
  { tenantId, tenantName, tables, manifest = [], appVersion = "" }:
  { tenantId: string; tenantName: string; tables: Record<string, any[]>; manifest?: any[]; appVersion?: string },
) {
  const counts: Record<string, number> = {};
  for (const [name, rows] of Object.entries(tables)) counts[name] = (rows || []).length;
  return {
    format: BACKUP_FORMAT,
    takenAt: new Date().toISOString(),
    tenantId,
    tenantName,
    appVersion,
    manifest: manifest.map(({ table, mode }) => ({ table, mode })),
    counts,
    checksum: checksum(tables),
    tables,
  };
}

export function backupFileName(tenantName = "shop", at = new Date()): string {
  const slug = String(tenantName).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "shop";
  const stamp = at.toISOString().slice(0, 16).replace(/[:T]/g, "-");
  return `stockmate-${slug}-${stamp}.json`;
}

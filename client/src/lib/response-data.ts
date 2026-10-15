/** Reject malformed successful responses before React Query caches them as data. */
export function responseRecord(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function requireResponseRecord(value: unknown): Record<string, any> {
  if (!responseRecord(value)) throw new Error("Invalid object response");
  return value;
}

export function responseRows(value: unknown): Record<string, any>[] {
  if (!Array.isArray(value) || !value.every(row => responseRecord(row) &&
    ((typeof row.id === "number" && Number.isInteger(row.id) && row.id > 0) || (typeof row.id === "string" && row.id.length > 0)))) {
    throw new Error("Invalid list response");
  }
  return value;
}

export function retailResponse(path: string, value: unknown): any {
  if (path.endsWith("/profile")) {
    if (!responseRecord(value)) throw new Error("Invalid business response");
    return value;
  }
  const rows = responseRows(value);
  if (path.endsWith("/transactions") && !rows.every(row =>
    typeof row.status === "string" && row.status.length > 0 &&
    typeof row.createdAt === "string" && Number.isFinite(Date.parse(row.createdAt)) &&
    (typeof row.price === "string" || typeof row.price === "number") &&
    String(row.price).trim() !== "" && Number.isFinite(Number(row.price)))) {
    throw new Error("Invalid sales response");
  }
  return rows;
}

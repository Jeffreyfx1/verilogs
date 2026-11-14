export const IMPORT_BATCH = 10_000;

export function importBatchCount(total: number, size = IMPORT_BATCH) {
  if (total <= 0) return 0;
  return Math.ceil(total / size);
}

export function sliceImport<T>(items: T[], size = IMPORT_BATCH): T[][] {
  const out: T[][] = [];
  const step = size > 0 ? size : IMPORT_BATCH;
  for (let i = 0; i < items.length; i += step) out.push(items.slice(i, i + step));
  return out;
}

export function batchWindow(total: number, index: number, size = IMPORT_BATCH) {
  const start = Math.max(0, index) * size;
  const end = Math.min(total, start + size);
  return { start, end, count: Math.max(0, end - start) };
}

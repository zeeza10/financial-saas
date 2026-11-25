const FORMULA_PREFIX_RE = /^\s*[=+\-@\t\r]/;

/**
 * Neutralizes spreadsheet formula injection in exported CSV cells (T-19, ST-19).
 */
export function neutralizeCsvCell(raw: string | number | bigint | boolean | null | undefined): string {
  if (raw === null || raw === undefined) {
    return '';
  }
  const str = String(raw);
  const safe = FORMULA_PREFIX_RE.test(str) ? `'${str}` : str;
  if (/[",\r\n]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

export function serializeCsv(
  headers: readonly string[],
  rows: readonly (readonly (string | number | bigint | boolean | null | undefined)[])[]
): string {
  const lines: string[] = [headers.map((h) => neutralizeCsvCell(h)).join(',')];
  for (const row of rows) {
    lines.push(row.map((cell) => neutralizeCsvCell(cell)).join(','));
  }
  return lines.join('\r\n');
}

/**
 * Normalizes descriptions for duplicate fingerprint matching (BR-013, UNIT_TESTING.md).
 */
export function normalizeTransactionDescription(description: string): string {
  return description.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Computes a deterministic SHA-256 hex fingerprint over
 * (accountId, isoDate, amountMinor, normalizedDescription) using Web Crypto (BR-013).
 */
export async function computeTransactionFingerprint(params: {
  accountId: string;
  isoDate: string;
  amountMinor: bigint;
  description: string;
}): Promise<string> {
  const canonical = [
    params.accountId.trim().toLowerCase(),
    params.isoDate.trim(),
    params.amountMinor.toString(),
    normalizeTransactionDescription(params.description),
  ].join('|');

  const bytes = new TextEncoder().encode(canonical);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

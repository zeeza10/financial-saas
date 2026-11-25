import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  MoneySchema,
  generatePermissionCatalogSql,
} from '@financial-saas/contracts';
import {
  DomainMoneyError,
  JournalValidationError,
  allocateByBasisPoints,
  buildReversalLines,
  computeTransactionFingerprint,
  formatMinorUnits,
  isAccountCompatible,
  money,
  parseMajorUnits,
  sumMoney,
  validateJournalEntryForPost,
  type JournalLineInput,
} from '@financial-saas/ledger-core';

describe('BR-002 Money representation & precision', () => {
  it('FT-32 handles amounts above Number.MAX_SAFE_INTEGER exactly as bigint and string', () => {
    const bigAmount = '9007199254740993';
    const m = money(bigAmount, 'USD');
    expect(m.amountMinor).toBe(9007199254740993n);
    expect(formatMinorUnits(m)).toBe('90071992547409.93');

    const dto = MoneySchema.parse({ amount_minor: m.amountMinor.toString(), currency: 'USD' });
    expect(dto.amount_minor).toBe(bigAmount);
  });

  it('BR-002 parses major units for 0, 2, and 3 decimal currencies without floats', () => {
    expect(parseMajorUnits('100.50', 'USD').amountMinor).toBe(10050n);
    expect(parseMajorUnits('1500', 'JPY').amountMinor).toBe(1500n);
    expect(parseMajorUnits('12.345', 'KWD').amountMinor).toBe(12345n);
    expect(() => parseMajorUnits('10.123', 'USD')).toThrow(DomainMoneyError);
  });
});

describe('BR-001, BR-003, BR-004, BR-008 Journal validation', () => {
  it('FT-01 posts a balanced two-line entry', () => {
    expect(() =>
      validateJournalEntryForPost({
        kind: 'standard',
        baseCurrency: 'USD',
        periodStatus: 'open',
        lines: [
          { accountId: 'bank', accountType: 'asset', side: 'debit', amountMinor: 10000n, currency: 'USD' },
          { accountId: 'sales', accountType: 'income', side: 'credit', amountMinor: 10000n, currency: 'USD' },
        ],
      })
    ).not.toThrow();
  });

  it('FT-02 rejects unbalanced entries (BR-001)', () => {
    expect(() =>
      validateJournalEntryForPost({
        kind: 'standard',
        baseCurrency: 'USD',
        periodStatus: 'open',
        lines: [
          { accountId: 'bank', accountType: 'asset', side: 'debit', amountMinor: 10000n, currency: 'USD' },
          { accountId: 'sales', accountType: 'income', side: 'credit', amountMinor: 9999n, currency: 'USD' },
        ],
      })
    ).toThrow(JournalValidationError);
  });

  it('FT-03 & FT-04 reject single-line and zero/negative-amount lines (BR-001)', () => {
    expect(() =>
      validateJournalEntryForPost({
        kind: 'standard',
        baseCurrency: 'USD',
        periodStatus: 'open',
        lines: [
          { accountId: 'bank', accountType: 'asset', side: 'debit', amountMinor: 10000n, currency: 'USD' },
        ],
      })
    ).toThrow(/at least two lines/);

    expect(() =>
      validateJournalEntryForPost({
        kind: 'standard',
        baseCurrency: 'USD',
        periodStatus: 'open',
        lines: [
          { accountId: 'bank', accountType: 'asset', side: 'debit', amountMinor: 0n, currency: 'USD' },
          { accountId: 'sales', accountType: 'income', side: 'credit', amountMinor: 0n, currency: 'USD' },
        ],
      })
    ).toThrow(/strictly positive/);
  });

  it('FT-08 enforces account-type compatibility for capital and transfers (BR-005, BR-008)', () => {
    expect(isAccountCompatible('investor_capital', 'income')).toBe(false);
    expect(isAccountCompatible('transfer', 'income')).toBe(false);
    expect(isAccountCompatible('transfer', 'expense')).toBe(false);
    expect(isAccountCompatible('investor_capital', 'equity')).toBe(true);

    expect(() =>
      validateJournalEntryForPost({
        kind: 'investor_capital',
        baseCurrency: 'USD',
        periodStatus: 'open',
        lines: [
          { accountId: 'bank', accountType: 'asset', side: 'debit', amountMinor: 500000n, currency: 'USD' },
          { accountId: 'sales', accountType: 'income', side: 'credit', amountMinor: 500000n, currency: 'USD' },
        ],
      })
    ).toThrow(/BR-008/);
  });

  it('FT-23 rejects posting into closed or locked periods (BR-004)', () => {
    for (const periodStatus of ['closed', 'locked'] as const) {
      expect(() =>
        validateJournalEntryForPost({
          kind: 'standard',
          baseCurrency: 'USD',
          periodStatus,
          lines: [
            { accountId: 'bank', accountType: 'asset', side: 'debit', amountMinor: 100n, currency: 'USD' },
            { accountId: 'sales', accountType: 'income', side: 'credit', amountMinor: 100n, currency: 'USD' },
          ],
        })
      ).toThrow(/BR-004/);
    }
  });

  it('FT-21 builds a reversal entry that nets original lines to zero without mutating them (BR-003)', () => {
    const original: JournalLineInput[] = [
      { accountId: 'bank', accountType: 'asset', side: 'debit', amountMinor: 25000n, currency: 'USD' },
      { accountId: 'sales', accountType: 'income', side: 'credit', amountMinor: 25000n, currency: 'USD' },
    ];
    const reversal = buildReversalLines(original);
    expect(original[0]!.side).toBe('debit');
    expect(reversal[0]!.side).toBe('credit');
    expect(reversal[1]!.side).toBe('debit');

    validateJournalEntryForPost({
      kind: 'reversal',
      baseCurrency: 'USD',
      periodStatus: 'open',
      lines: reversal,
    });
  });

  it('FT-05 property test: arbitrary valid entries and their reversals keep Trial Balance balanced', () => {
    fc.assert(
      fc.property(
        fc.array(fc.bigInt({ min: 1n, max: 10_000_000n }), { minLength: 1, maxLength: 10 }),
        (amounts) => {
          const total = amounts.reduce((acc, n) => acc + n, 0n);
          const lines: JournalLineInput[] = [
            ...amounts.map((amt, i) => ({
              accountId: `exp-${i}`,
              accountType: 'expense' as const,
              side: 'debit' as const,
              amountMinor: amt,
              currency: 'USD',
            })),
            {
              accountId: 'bank',
              accountType: 'asset',
              side: 'credit',
              amountMinor: total,
              currency: 'USD',
            },
          ];

          validateJournalEntryForPost({
            kind: 'standard',
            baseCurrency: 'USD',
            periodStatus: 'open',
            lines,
          });

          const reversal = buildReversalLines(lines);
          let netDebits = 0n;
          let netCredits = 0n;
          for (const l of [...lines, ...reversal]) {
            if (l.side === 'debit') netDebits += l.amountMinor;
            else netCredits += l.amountMinor;
          }
          expect(netDebits).toBe(netCredits);
        }
      ),
      { numRuns: 200 }
    );
  });
});

describe('BR-010, OQ-027 Profit-share largest-remainder allocation', () => {
  it('FT-13 rejects weights not summing to 100.00% (10000 bps)', () => {
    expect(() => allocateByBasisPoints(money(10000n, 'USD'), [6000n, 3900n])).toThrow(DomainMoneyError);
  });

  it('FT-14 allocates $100.01 across 33.33% / 33.33% / 33.34% summing to exact total', () => {
    const shares = allocateByBasisPoints(money(10001n, 'USD'), [3333n, 3333n, 3334n]);
    expect(shares.map((s) => s.amountMinor)).toEqual([3333n, 3333n, 3335n]);
    expect(sumMoney(shares, 'USD').amountMinor).toBe(10001n);
  });

  it('property test: largest-remainder allocation never creates or loses a minor unit', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 0n, max: 1_000_000_000n }),
        fc.integer({ min: 0, max: 10_000 }),
        fc.integer({ min: 0, max: 10_000 }),
        (totalMinor, a, b) => {
          const first = Math.min(a, b);
          const second = Math.max(a, b) - first;
          const third = 10_000 - first - second;
          const shares = allocateByBasisPoints(money(totalMinor, 'USD'), [
            BigInt(first),
            BigInt(second),
            BigInt(third),
          ]);
          expect(sumMoney(shares, 'USD').amountMinor).toBe(totalMinor);
        }
      ),
      { numRuns: 300 }
    );
  });
});

describe('BR-013 Duplicate fingerprint normalization', () => {
  it('produces identical SHA-256 fingerprints across whitespace and case differences', async () => {
    const a = await computeTransactionFingerprint({
      accountId: 'ACC-1',
      isoDate: '2026-11-26',
      amountMinor: 4999n,
      description: '  eBay   Managed   Payout  ',
    });
    const b = await computeTransactionFingerprint({
      accountId: 'acc-1',
      isoDate: '2026-11-26',
      amountMinor: 4999n,
      description: 'ebay managed payout',
    });
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });
});

describe('AUTHORIZATION_RBAC_RLS Permission catalog parity', () => {
  it('matches SQL permission seed in migration 0001', () => {
    const sqlPath = path.resolve(
      process.cwd(),
      'supabase/migrations/0001_foundation_tenancy_rbac_audit.sql'
    );
    const migrationSql = fs.readFileSync(sqlPath, 'utf8');
    const expectedBlock = generatePermissionCatalogSql();
    for (const line of expectedBlock.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.startsWith('(')) {
        expect(migrationSql).toContain(trimmed.replace(/,$/, ''));
      }
    }
  });
});

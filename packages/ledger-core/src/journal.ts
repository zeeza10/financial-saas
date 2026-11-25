import type { CurrencyCode } from '@financial-saas/contracts';

export type AccountType = 'asset' | 'liability' | 'equity' | 'income' | 'expense';
export type AccountOwnershipType = 'business' | 'personal';
export type PeriodStatus = 'open' | 'closed' | 'locked';
export type LineSide = 'debit' | 'credit';

export type JournalEntryKind =
  | 'standard'
  | 'transfer'
  | 'investor_capital'
  | 'loan_proceeds'
  | 'owner_contribution'
  | 'owner_draw'
  | 'reversal'
  | 'distribution';

export interface JournalLineInput {
  readonly accountId: string;
  readonly accountType: AccountType;
  readonly side: LineSide;
  readonly amountMinor: bigint;
  readonly currency: CurrencyCode;
  readonly partyId?: string | null;
}

export interface JournalEntryValidationInput {
  readonly kind: JournalEntryKind;
  readonly baseCurrency: CurrencyCode;
  readonly periodStatus: PeriodStatus;
  readonly lines: readonly JournalLineInput[];
}

export class JournalValidationError extends Error {
  readonly ruleId: string;

  constructor(ruleId: string, message: string) {
    super(`${ruleId}: ${message}`);
    this.name = 'JournalValidationError';
    this.ruleId = ruleId;
  }
}

/**
 * Account-type compatibility matrix (BR-005, BR-007, BR-008, FT-08).
 * Prevents transfers, investor capital, loan proceeds, and owner contributions
 * from touching income accounts (and prevents internal transfers from hitting expenses).
 */
export function isAccountCompatible(kind: JournalEntryKind, accountType: AccountType): boolean {
  switch (kind) {
    case 'standard':
    case 'reversal':
      return true;
    case 'transfer':
      return accountType === 'asset' || accountType === 'liability';
    case 'investor_capital':
      return accountType === 'asset' || accountType === 'equity' || accountType === 'liability' || accountType === 'expense';
    case 'loan_proceeds':
    case 'owner_contribution':
      return accountType === 'asset' || accountType === 'liability' || accountType === 'equity';
    case 'owner_draw':
      return accountType === 'asset' || accountType === 'equity';
    case 'distribution':
      return accountType === 'equity' || accountType === 'liability' || accountType === 'asset';
  }
}

/**
 * Validates double-entry invariants before posting (BR-001, BR-004, BR-008).
 */
export function validateJournalEntryForPost(input: JournalEntryValidationInput): void {
  if (input.periodStatus !== 'open') {
    throw new JournalValidationError(
      'BR-004',
      `Cannot post into a ${input.periodStatus} accounting period`
    );
  }

  if (input.lines.length < 2) {
    throw new JournalValidationError(
      'BR-001',
      'A journal entry must have at least two lines'
    );
  }

  let debitTotal = 0n;
  let creditTotal = 0n;

  for (let i = 0; i < input.lines.length; i++) {
    const line = input.lines[i]!;
    if (line.amountMinor <= 0n) {
      throw new JournalValidationError(
        'BR-001',
        `Line ${i + 1} amount must be strictly positive`
      );
    }
    if (line.currency !== input.baseCurrency) {
      throw new JournalValidationError(
        'BR-001',
        `Line ${i + 1} currency ${line.currency} does not match organization base currency ${input.baseCurrency}`
      );
    }
    if (!isAccountCompatible(input.kind, line.accountType)) {
      throw new JournalValidationError(
        'BR-008',
        `Account type "${line.accountType}" is not allowed for entry kind "${input.kind}"`
      );
    }
    if (line.side === 'debit') {
      debitTotal += line.amountMinor;
    } else {
      creditTotal += line.amountMinor;
    }
  }

  if (debitTotal !== creditTotal) {
    throw new JournalValidationError(
      'BR-001',
      `Entry is unbalanced: debits=${debitTotal.toString()}, credits=${creditTotal.toString()}`
    );
  }
}

/**
 * Creates reversing lines by swapping debit and credit without mutating the original (BR-003, FT-21).
 */
export function buildReversalLines(
  originalLines: readonly JournalLineInput[]
): readonly JournalLineInput[] {
  return originalLines.map((line) => ({
    ...line,
    side: line.side === 'debit' ? 'credit' : 'debit',
  }));
}

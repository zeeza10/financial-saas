import type {
  AccountDto,
  AccountOwnershipTypeDto,
  AccountTypeDto,
  JournalEntryDto,
  TrialBalanceReportDto,
  TrialBalanceRowDto,
} from '@financial-saas/contracts';
import { parseMajorUnits } from './money.js';

export interface DefaultAccountTemplate {
  readonly code: string;
  readonly name: string;
  readonly account_type: AccountTypeDto;
  readonly ownership_type: AccountOwnershipTypeDto;
  readonly is_system: boolean;
}

/**
 * Standard double-entry Chart of Accounts template seeded per organization (FR-002, F1, ACCOUNTING_MODEL.md).
 */
export const DEFAULT_COA_TEMPLATE: readonly DefaultAccountTemplate[] = [
  { code: '1000', name: 'Business Bank Account', account_type: 'asset', ownership_type: 'business', is_system: true },
  { code: '1010', name: 'Cash on Hand', account_type: 'asset', ownership_type: 'business', is_system: false },
  { code: '1050', name: 'Marketplace Clearing', account_type: 'asset', ownership_type: 'business', is_system: true },
  { code: '1100', name: 'Accounts Receivable', account_type: 'asset', ownership_type: 'business', is_system: true },
  { code: '1200', name: 'Due from Owner', account_type: 'asset', ownership_type: 'business', is_system: true },
  { code: '1500', name: 'Fixed Assets & Equipment', account_type: 'asset', ownership_type: 'business', is_system: true },
  { code: '1510', name: 'Accumulated Depreciation', account_type: 'asset', ownership_type: 'business', is_system: true },
  { code: '1900', name: 'Personal Bank Account (Excluded)', account_type: 'asset', ownership_type: 'personal', is_system: false },
  { code: '2000', name: 'Accounts Payable', account_type: 'liability', ownership_type: 'business', is_system: true },
  { code: '2100', name: 'Salaries Payable', account_type: 'liability', ownership_type: 'business', is_system: true },
  { code: '2200', name: 'Investor Loans', account_type: 'liability', ownership_type: 'business', is_system: true },
  { code: '2300', name: 'Due to Owner / Partner', account_type: 'liability', ownership_type: 'business', is_system: true },
  { code: '2400', name: 'Loans Payable', account_type: 'liability', ownership_type: 'business', is_system: true },
  { code: '3000', name: 'Investor Capital', account_type: 'equity', ownership_type: 'business', is_system: true },
  { code: '3100', name: 'Retained Earnings', account_type: 'equity', ownership_type: 'business', is_system: true },
  { code: '3200', name: 'Owner Draws', account_type: 'equity', ownership_type: 'business', is_system: true },
  { code: '4000', name: 'Sales Revenue', account_type: 'income', ownership_type: 'business', is_system: true },
  { code: '4050', name: 'Sales Refunds & Returns', account_type: 'income', ownership_type: 'business', is_system: true },
  { code: '4100', name: 'Shipping Income', account_type: 'income', ownership_type: 'business', is_system: false },
  { code: '5000', name: 'Cost of Goods Sold', account_type: 'expense', ownership_type: 'business', is_system: true },
  { code: '5100', name: 'Marketplace Fees', account_type: 'expense', ownership_type: 'business', is_system: true },
  { code: '5200', name: 'Shipping Expense', account_type: 'expense', ownership_type: 'business', is_system: false },
  { code: '5300', name: 'Bank & Wire Fees', account_type: 'expense', ownership_type: 'business', is_system: true },
  { code: '5400', name: 'Software & Subscriptions', account_type: 'expense', ownership_type: 'business', is_system: false },
  { code: '5500', name: 'Salaries & Compensation', account_type: 'expense', ownership_type: 'business', is_system: true },
];

/**
 * Computes Trial Balance from posted entries only (BR-018, FT-19).
 * Excludes accounts with ownership_type = 'personal' from company statements (BR-006, FT-11).
 */
export function computeTrialBalance(params: {
  organizationId: string;
  baseCurrency: string;
  asOfDate: string;
  accounts: readonly AccountDto[];
  entries: readonly JournalEntryDto[];
  includePersonal?: boolean;
}): TrialBalanceReportDto {
  const includePersonal = params.includePersonal ?? false;
  const accountMap = new Map<string, AccountDto>();
  const debits = new Map<string, bigint>();
  const credits = new Map<string, bigint>();

  for (const acc of params.accounts) {
    if (!includePersonal && acc.ownership_type === 'personal') {
      continue;
    }
    accountMap.set(acc.id, acc);
    debits.set(acc.id, 0n);
    credits.set(acc.id, 0n);
  }

  for (const entry of params.entries) {
    if (entry.status !== 'posted') continue;
    if (entry.entry_date > params.asOfDate) continue;
    for (const line of entry.lines) {
      if (!accountMap.has(line.account_id)) continue;
      const amt = BigInt(line.amount_minor);
      if (line.side === 'debit') {
        debits.set(line.account_id, (debits.get(line.account_id) ?? 0n) + amt);
      } else {
        credits.set(line.account_id, (credits.get(line.account_id) ?? 0n) + amt);
      }
    }
  }

  let totalDebits = 0n;
  let totalCredits = 0n;
  const rows: TrialBalanceRowDto[] = [];

  const sortedAccounts = Array.from(accountMap.values()).sort((a, b) =>
    a.code.localeCompare(b.code)
  );

  for (const acc of sortedAccounts) {
    const d = debits.get(acc.id) ?? 0n;
    const c = credits.get(acc.id) ?? 0n;
    totalDebits += d;
    totalCredits += c;
    const isDebitNormal = acc.account_type === 'asset' || acc.account_type === 'expense';
    const net = isDebitNormal ? d - c : c - d;
    rows.push({
      account_id: acc.id,
      code: acc.code,
      name: acc.name,
      account_type: acc.account_type,
      ownership_type: acc.ownership_type,
      debit_total_minor: d.toString(),
      credit_total_minor: c.toString(),
      net_balance_minor: net.toString(),
    });
  }

  return {
    organization_id: params.organizationId,
    currency: params.baseCurrency,
    as_of_date: params.asOfDate,
    rows,
    total_debits_minor: totalDebits.toString(),
    total_credits_minor: totalCredits.toString(),
    is_balanced: totalDebits === totalCredits,
  };
}

export interface ParsedBankCsvRow {
  readonly lineNumber: number;
  readonly txDate: string;
  readonly description: string;
  readonly amountMinor: bigint;
  readonly externalId: string | null;
}

export interface CsvParseError {
  readonly lineNumber: number;
  readonly message: string;
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      cells.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (inQuotes) {
    throw new Error('Unterminated quoted field');
  }
  cells.push(current.trim());
  return cells;
}

/**
 * Strict, line-level CSV parser for bank statements (F2: malformed file returns line-level errors; no partial import).
 * Expected header: date,description,amount[,external_id]
 */
export function parseBankStatementCsv(
  csvText: string,
  currency: string
): { rows: ParsedBankCsvRow[]; errors: CsvParseError[] } {
  const lines = csvText
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter((l) => l.trim().length > 0);

  if (lines.length < 2) {
    return {
      rows: [],
      errors: [{ lineNumber: 1, message: 'CSV must include header and at least one transaction row' }],
    };
  }

  const header = splitCsvLine(lines[0]!).map((h) => h.toLowerCase());
  const dateIdx = header.indexOf('date');
  const descIdx = header.indexOf('description');
  const amtIdx = header.indexOf('amount');
  const extIdx = header.indexOf('external_id');

  if (dateIdx === -1 || descIdx === -1 || amtIdx === -1) {
    return {
      rows: [],
      errors: [
        {
          lineNumber: 1,
          message: 'Header must contain columns: date, description, amount (optional: external_id)',
        },
      ],
    };
  }

  const rows: ParsedBankCsvRow[] = [];
  const errors: CsvParseError[] = [];

  for (let i = 1; i < lines.length; i++) {
    const lineNumber = i + 1;
    let cells: string[];
    try {
      cells = splitCsvLine(lines[i]!);
    } catch (err) {
      errors.push({ lineNumber, message: err instanceof Error ? err.message : 'Malformed CSV line' });
      continue;
    }

    const txDate = cells[dateIdx] ?? '';
    const description = cells[descIdx] ?? '';
    const rawAmt = cells[amtIdx] ?? '';
    const externalId = extIdx >= 0 && cells[extIdx] ? cells[extIdx]! : null;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(txDate)) {
      errors.push({ lineNumber, message: `Invalid YYYY-MM-DD date "${txDate}"` });
      continue;
    }
    if (!description) {
      errors.push({ lineNumber, message: 'Description is required' });
      continue;
    }
    try {
      const parsed = parseMajorUnits(rawAmt, currency);
      if (parsed.amountMinor === 0n) {
        errors.push({ lineNumber, message: 'Amount cannot be zero' });
        continue;
      }
      rows.push({
        lineNumber,
        txDate,
        description,
        amountMinor: parsed.amountMinor,
        externalId,
      });
    } catch (err) {
      errors.push({ lineNumber, message: err instanceof Error ? err.message : 'Invalid amount' });
    }
  }

  return { rows: errors.length > 0 ? [] : rows, errors };
}

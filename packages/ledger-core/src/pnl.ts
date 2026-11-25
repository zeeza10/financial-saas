import type { AccountDto, JournalEntryDto } from '@financial-saas/contracts';

export interface ProfitAndLossLine {
  readonly account_id: string;
  readonly code: string;
  readonly name: string;
  readonly account_type: 'income' | 'expense';
  readonly net_minor: string;
}

export interface ProfitAndLossSummary {
  readonly organization_id: string;
  readonly currency: string;
  readonly start_date: string;
  readonly end_date: string;
  readonly total_income_minor: string;
  readonly total_expense_minor: string;
  readonly net_profit_minor: string;
  readonly lines: ProfitAndLossLine[];
}

/**
 * Computes accrual Profit & Loss from posted business income & expense lines only
 * (BR-006, BR-011, OQ-001, FT-18). Excludes personal accounts, transfers, capital,
 * loan proceeds, and owner draws.
 */
export function computeProfitAndLoss(params: {
  organizationId: string;
  baseCurrency: string;
  startDate: string;
  endDate: string;
  accounts: readonly AccountDto[];
  entries: readonly JournalEntryDto[];
}): ProfitAndLossSummary {
  const pnlAccounts = new Map<string, AccountDto>();
  const totals = new Map<string, bigint>();

  for (const acc of params.accounts) {
    if (acc.ownership_type !== 'business') continue;
    if (acc.account_type !== 'income' && acc.account_type !== 'expense') continue;
    pnlAccounts.set(acc.id, acc);
    totals.set(acc.id, 0n);
  }

  for (const entry of params.entries) {
    if (entry.status !== 'posted') continue;
    if (entry.entry_date < params.startDate || entry.entry_date > params.endDate) continue;
    for (const line of entry.lines) {
      const acc = pnlAccounts.get(line.account_id);
      if (!acc) continue;
      const amt = BigInt(line.amount_minor);
      const prev = totals.get(acc.id) ?? 0n;
      if (acc.account_type === 'income') {
        // Income normal balance is credit (debit reduces income, e.g. refunds/reversals)
        totals.set(acc.id, prev + (line.side === 'credit' ? amt : -amt));
      } else {
        // Expense normal balance is debit
        totals.set(acc.id, prev + (line.side === 'debit' ? amt : -amt));
      }
    }
  }

  let totalIncome = 0n;
  let totalExpense = 0n;
  const lines: ProfitAndLossLine[] = [];

  for (const acc of Array.from(pnlAccounts.values()).sort((a, b) => a.code.localeCompare(b.code))) {
    const net = totals.get(acc.id) ?? 0n;
    if (acc.account_type === 'income') totalIncome += net;
    else totalExpense += net;
    lines.push({
      account_id: acc.id,
      code: acc.code,
      name: acc.name,
      account_type: acc.account_type as 'income' | 'expense',
      net_minor: net.toString(),
    });
  }

  return {
    organization_id: params.organizationId,
    currency: params.baseCurrency,
    start_date: params.startDate,
    end_date: params.endDate,
    total_income_minor: totalIncome.toString(),
    total_expense_minor: totalExpense.toString(),
    net_profit_minor: (totalIncome - totalExpense).toString(),
    lines,
  };
}

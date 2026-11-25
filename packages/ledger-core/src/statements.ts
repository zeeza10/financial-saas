import type {
  AccountDto,
  BalanceSheetReportDto,
  CashFlowReportDto,
  DashboardSummaryDto,
  JournalEntryDto,
  MonthlyComparisonPointDto,
  StatementAccountLineDto,
  YearlyComparisonPointDto,
} from '@financial-saas/contracts';
import { computeProfitAndLoss } from './pnl.js';

function isCashOrBankAccount(acc: AccountDto): boolean {
  if (acc.ownership_type !== 'business' || acc.account_type !== 'asset') return false;
  return acc.code.startsWith('10') && Number(acc.code.slice(0, 4)) < 1050;
}

function isFixedAssetAccount(acc: AccountDto): boolean {
  const num = Number(acc.code.slice(0, 4));
  return acc.account_type === 'asset' && Number.isFinite(num) && num >= 1500 && num < 1900;
}

function isCurrentAssetAccount(acc: AccountDto): boolean {
  return acc.ownership_type === 'business' && acc.account_type === 'asset' && !isFixedAssetAccount(acc);
}

function isLongTermLiabilityAccount(acc: AccountDto): boolean {
  const num = Number(acc.code.slice(0, 4));
  return acc.account_type === 'liability' && Number.isFinite(num) && (num === 2200 || num >= 2400);
}

function isCurrentLiabilityAccount(acc: AccountDto): boolean {
  return acc.ownership_type === 'business' && acc.account_type === 'liability' && !isLongTermLiabilityAccount(acc);
}

function filterEntriesByScope(
  entries: readonly JournalEntryDto[],
  filters?: { accountId?: string | undefined; partyId?: string | undefined }
): JournalEntryDto[] {
  if (!filters?.accountId && !filters?.partyId) {
    return entries.filter((e) => e.status === 'posted');
  }
  return entries.filter((e) => {
    if (e.status !== 'posted') return false;
    return e.lines.some(
      (l) =>
        (!filters.accountId || l.account_id === filters.accountId) &&
        (!filters.partyId || l.party_id === filters.partyId)
    );
  });
}

/**
 * Computes Balance Sheet from posted business lines only (BR-006, BR-018, FT-11, FT-19).
 * Includes unclosed net income (Income - Expense) in Equity so Assets = Liabilities + Equity holds at all dates.
 */
export function computeBalanceSheet(params: {
  organizationId: string;
  baseCurrency: string;
  asOfDate: string;
  accounts: readonly AccountDto[];
  entries: readonly JournalEntryDto[];
}): BalanceSheetReportDto {
  const balances = new Map<string, bigint>();
  const businessAccounts = params.accounts.filter((a) => a.ownership_type === 'business');
  const accMap = new Map(businessAccounts.map((a) => [a.id, a]));

  for (const acc of businessAccounts) {
    balances.set(acc.id, 0n);
  }

  let totalIncome = 0n;
  let totalExpense = 0n;

  for (const entry of params.entries) {
    if (entry.status !== 'posted' || entry.entry_date > params.asOfDate) continue;
    for (const line of entry.lines) {
      const acc = accMap.get(line.account_id);
      if (!acc) continue;
      const amt = BigInt(line.amount_minor);
      const cur = balances.get(acc.id) ?? 0n;
      const isDebitNormal = acc.account_type === 'asset' || acc.account_type === 'expense';
      const delta = isDebitNormal
        ? line.side === 'debit' ? amt : -amt
        : line.side === 'credit' ? amt : -amt;
      balances.set(acc.id, cur + delta);

      if (acc.account_type === 'income') totalIncome += delta;
      if (acc.account_type === 'expense') totalExpense += delta;
    }
  }

  const assets: StatementAccountLineDto[] = [];
  const liabilities: StatementAccountLineDto[] = [];
  const equity: StatementAccountLineDto[] = [];

  let totalAssets = 0n;
  let totalLiabilities = 0n;
  let totalEquityAccounts = 0n;

  for (const acc of businessAccounts.sort((a, b) => a.code.localeCompare(b.code))) {
    const bal = balances.get(acc.id) ?? 0n;
    if (acc.account_type === 'asset') {
      totalAssets += bal;
      assets.push({ account_id: acc.id, code: acc.code, name: acc.name, account_type: acc.account_type, balance_minor: bal.toString() });
    } else if (acc.account_type === 'liability') {
      totalLiabilities += bal;
      liabilities.push({ account_id: acc.id, code: acc.code, name: acc.name, account_type: acc.account_type, balance_minor: bal.toString() });
    } else if (acc.account_type === 'equity') {
      // Contra equity accounts like 3200 Owner Draws have debit balances -> credit-normal representation is negative
      totalEquityAccounts += bal;
      equity.push({ account_id: acc.id, code: acc.code, name: acc.name, account_type: acc.account_type, balance_minor: bal.toString() });
    }
  }

  const currentNetIncome = totalIncome - totalExpense;
  const totalEquity = totalEquityAccounts + currentNetIncome;

  return {
    organization_id: params.organizationId,
    currency: params.baseCurrency,
    as_of_date: params.asOfDate,
    assets,
    liabilities,
    equity,
    current_net_income_minor: currentNetIncome.toString(),
    total_assets_minor: totalAssets.toString(),
    total_liabilities_minor: totalLiabilities.toString(),
    total_equity_minor: totalEquity.toString(),
    is_balanced: totalAssets === totalLiabilities + totalEquity,
  };
}

/**
 * Computes Cash Flow Statement over [startDate, endDate] for business cash & bank accounts.
 */
export function computeCashFlowStatement(params: {
  organizationId: string;
  baseCurrency: string;
  startDate: string;
  endDate: string;
  accounts: readonly AccountDto[];
  entries: readonly JournalEntryDto[];
}): CashFlowReportDto {
  const accMap = new Map(params.accounts.map((a) => [a.id, a]));
  const cashAccountIds = new Set(
    params.accounts.filter((a) => isCashOrBankAccount(a)).map((a) => a.id)
  );

  let openingCash = 0n;
  let operating = 0n;
  let investing = 0n;
  let financing = 0n;

  const groupedLabels = new Map<string, { activity: 'operating' | 'investing' | 'financing'; amount: bigint }>();

  for (const entry of params.entries) {
    if (entry.status !== 'posted') continue;
    if (entry.entry_date > params.endDate) continue;

    let cashDelta = 0n;
    const counterAccounts: AccountDto[] = [];
    for (const line of entry.lines) {
      const amt = BigInt(line.amount_minor);
      if (cashAccountIds.has(line.account_id)) {
        cashDelta += line.side === 'debit' ? amt : -amt;
      } else {
        const acc = accMap.get(line.account_id);
        if (acc) counterAccounts.push(acc);
      }
    }

    if (cashDelta === 0n) continue;

    if (entry.entry_date < params.startDate) {
      openingCash += cashDelta;
      continue;
    }

    // Internal transfer between two business cash accounts nets to cashDelta = 0 above.
    // Classify cash movement by counter-account nature:
    let activity: 'operating' | 'investing' | 'financing' = 'operating';
    if (
      entry.kind === 'investor_capital' ||
      entry.kind === 'loan_proceeds' ||
      entry.kind === 'owner_contribution' ||
      entry.kind === 'owner_draw' ||
      counterAccounts.some((a) => a.account_type === 'equity' || isLongTermLiabilityAccount(a) || a.code === '2300')
    ) {
      activity = 'financing';
    } else if (counterAccounts.some((a) => isFixedAssetAccount(a))) {
      activity = 'investing';
    }

    if (activity === 'operating') operating += cashDelta;
    else if (activity === 'investing') investing += cashDelta;
    else financing += cashDelta;

    const label = counterAccounts[0] ? `${counterAccounts[0].code} ${counterAccounts[0].name}` : entry.description;
    const key = `${activity}|${label}`;
    const prev = groupedLabels.get(key);
    groupedLabels.set(key, { activity, amount: (prev?.amount ?? 0n) + cashDelta });
  }

  const netChange = operating + investing + financing;
  const closingCash = openingCash + netChange;

  return {
    organization_id: params.organizationId,
    currency: params.baseCurrency,
    start_date: params.startDate,
    end_date: params.endDate,
    opening_cash_minor: openingCash.toString(),
    operating_minor: operating.toString(),
    investing_minor: investing.toString(),
    financing_minor: financing.toString(),
    net_cash_change_minor: netChange.toString(),
    closing_cash_minor: closingCash.toString(),
    is_reconciled: openingCash + netChange === closingCash,
    items: Array.from(groupedLabels.entries()).map(([k, v]) => ({
      activity: v.activity,
      label: k.split('|')[1] ?? k,
      amount_minor: v.amount.toString(),
    })),
  };
}

/**
 * Computes live Dashboard KPIs, monthly comparisons, and yearly comparisons from posted records.
 */
export function computeDashboardSummary(params: {
  organizationId: string;
  baseCurrency: string;
  startDate: string;
  endDate: string;
  accounts: readonly AccountDto[];
  entries: readonly JournalEntryDto[];
  accountId?: string | undefined;
  partyId?: string | undefined;
}): DashboardSummaryDto {
  const scopedEntries = filterEntriesByScope(params.entries, {
    accountId: params.accountId,
    partyId: params.partyId,
  });

  const pnl = computeProfitAndLoss({
    organizationId: params.organizationId,
    baseCurrency: params.baseCurrency,
    startDate: params.startDate,
    endDate: params.endDate,
    accounts: params.accounts,
    entries: scopedEntries,
  });

  const bs = computeBalanceSheet({
    organizationId: params.organizationId,
    baseCurrency: params.baseCurrency,
    asOfDate: params.endDate,
    accounts: params.accounts,
    entries: scopedEntries,
  });

  const accMap = new Map(params.accounts.map((a) => [a.id, a]));

  // Compute specific KPI buckets as of endDate
  const balById = new Map<string, bigint>();
  for (const a of [...bs.assets, ...bs.liabilities, ...bs.equity]) {
    balById.set(a.account_id, BigInt(a.balance_minor));
  }

  let bankBalance = 0n;
  let cashBalance = 0n;
  let personalBalance = 0n;
  let receivables = 0n;
  let payables = 0n;
  let investments = 0n;
  let currentAssets = 0n;
  let currentLiabilities = 0n;

  for (const acc of params.accounts) {
    if (acc.ownership_type === 'personal') continue;
    const bal = balById.get(acc.id) ?? 0n;
    if (acc.code === '1010') cashBalance += bal;
    else if (isCashOrBankAccount(acc)) bankBalance += bal;

    if (acc.code === '1100' || acc.code === '1200') receivables += bal;
    if (acc.code === '2000' || acc.code === '2100' || acc.code === '2300') payables += bal;
    if (acc.code === '3000' || acc.code === '2200') investments += bal;
    if (isCurrentAssetAccount(acc)) currentAssets += bal;
    if (isCurrentLiabilityAccount(acc)) currentLiabilities += bal;
  }

  // Personal asset accounts tracked strictly separately (BR-006, FT-11)
  for (const entry of scopedEntries) {
    if (entry.entry_date > params.endDate) continue;
    for (const line of entry.lines) {
      const acc = accMap.get(line.account_id);
      if (!acc || acc.ownership_type !== 'personal' || acc.account_type !== 'asset') continue;
      const amt = BigInt(line.amount_minor);
      personalBalance += line.side === 'debit' ? amt : -amt;
    }
  }

  // Monthly & Yearly comparisons across all posted entries up to endDate
  const months = new Map<string, { income: bigint; expense: bigint; cashDelta: bigint }>();
  const years = new Map<string, { income: bigint; expense: bigint }>();
  const cashAccountIds = new Set(params.accounts.filter((a) => isCashOrBankAccount(a)).map((a) => a.id));

  for (const entry of scopedEntries) {
    if (entry.entry_date > params.endDate) continue;
    const monthKey = entry.entry_date.slice(0, 7);
    const yearKey = entry.entry_date.slice(0, 4);
    const m = months.get(monthKey) ?? { income: 0n, expense: 0n, cashDelta: 0n };
    const y = years.get(yearKey) ?? { income: 0n, expense: 0n };

    for (const line of entry.lines) {
      const acc = accMap.get(line.account_id);
      if (!acc || acc.ownership_type !== 'business') continue;
      const amt = BigInt(line.amount_minor);
      if (acc.account_type === 'income') {
        const delta = line.side === 'credit' ? amt : -amt;
        m.income += delta;
        y.income += delta;
      } else if (acc.account_type === 'expense') {
        const delta = line.side === 'debit' ? amt : -amt;
        m.expense += delta;
        y.expense += delta;
      }
      if (cashAccountIds.has(acc.id)) {
        m.cashDelta += line.side === 'debit' ? amt : -amt;
      }
    }

    months.set(monthKey, m);
    years.set(yearKey, y);
  }

  const monthly_series: MonthlyComparisonPointDto[] = Array.from(months.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({
      month,
      income_minor: v.income.toString(),
      expenses_minor: v.expense.toString(),
      net_profit_minor: (v.income - v.expense).toString(),
      cash_net_change_minor: v.cashDelta.toString(),
    }));

  const yearly_series: YearlyComparisonPointDto[] = Array.from(years.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([year, v]) => ({
      year,
      income_minor: v.income.toString(),
      expenses_minor: v.expense.toString(),
      net_profit_minor: (v.income - v.expense).toString(),
    }));

  return {
    organization_id: params.organizationId,
    currency: params.baseCurrency,
    start_date: params.startDate,
    end_date: params.endDate,
    kpis: {
      total_income_minor: pnl.total_income_minor,
      total_expenses_minor: pnl.total_expense_minor,
      net_profit_minor: pnl.net_profit_minor,
      bank_balance_minor: bankBalance.toString(),
      cash_balance_minor: cashBalance.toString(),
      personal_accounts_balance_minor: personalBalance.toString(),
      total_assets_minor: bs.total_assets_minor,
      total_liabilities_minor: bs.total_liabilities_minor,
      receivables_minor: receivables.toString(),
      payables_minor: payables.toString(),
      total_investments_minor: investments.toString(),
      working_capital_minor: (currentAssets - currentLiabilities).toString(),
    },
    monthly_series,
    yearly_series,
  };
}

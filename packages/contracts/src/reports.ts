import { z } from 'zod';
import type { AccountTypeDto } from './ledger.js';

export const DateRangeFilterSchema = z
  .object({
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    account_id: z.string().uuid().optional(),
    party_id: z.string().uuid().optional(),
  })
  .strict();

export type DateRangeFilter = z.infer<typeof DateRangeFilterSchema>;

export const ExportReportQuerySchema = z
  .object({
    report: z.enum(['pnl', 'balance-sheet', 'trial-balance', 'cash-flow', 'expenses']),
    format: z.enum(['csv', 'xlsx', 'pdf']),
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .strict();

export type ExportReportQuery = z.infer<typeof ExportReportQuerySchema>;

export interface StatementAccountLineDto {
  account_id: string;
  code: string;
  name: string;
  account_type: AccountTypeDto;
  balance_minor: string;
}

export interface BalanceSheetReportDto {
  organization_id: string;
  currency: string;
  as_of_date: string;
  assets: StatementAccountLineDto[];
  liabilities: StatementAccountLineDto[];
  equity: StatementAccountLineDto[];
  current_net_income_minor: string;
  total_assets_minor: string;
  total_liabilities_minor: string;
  total_equity_minor: string;
  is_balanced: boolean;
}

export interface CashFlowReportDto {
  organization_id: string;
  currency: string;
  start_date: string;
  end_date: string;
  opening_cash_minor: string;
  operating_minor: string;
  investing_minor: string;
  financing_minor: string;
  net_cash_change_minor: string;
  closing_cash_minor: string;
  is_reconciled: boolean;
  items: Array<{
    activity: 'operating' | 'investing' | 'financing';
    label: string;
    amount_minor: string;
  }>;
}

export interface MonthlyComparisonPointDto {
  month: string; // YYYY-MM
  income_minor: string;
  expenses_minor: string;
  net_profit_minor: string;
  cash_net_change_minor: string;
}

export interface YearlyComparisonPointDto {
  year: string; // YYYY
  income_minor: string;
  expenses_minor: string;
  net_profit_minor: string;
}

export interface DashboardSummaryDto {
  organization_id: string;
  currency: string;
  start_date: string;
  end_date: string;
  kpis: {
    total_income_minor: string;
    total_expenses_minor: string;
    net_profit_minor: string;
    bank_balance_minor: string;
    cash_balance_minor: string;
    personal_accounts_balance_minor: string;
    total_assets_minor: string;
    total_liabilities_minor: string;
    receivables_minor: string;
    payables_minor: string;
    total_investments_minor: string;
    working_capital_minor: string;
  };
  monthly_series: MonthlyComparisonPointDto[];
  yearly_series: YearlyComparisonPointDto[];
}

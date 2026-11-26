import { useMemo, useState } from 'react';
import {
  Activity,
  ArrowRight,
  BarChart3,
  Briefcase,
  Building2,
  Calendar,
  CreditCard,
  DollarSign,
  Landmark,
  Layers,
  PiggyBank,
  Receipt,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import type {
  AccountDto,
  AuditEventDto,
  BalanceSheetReportDto,
  BankAccountDto,
  CashFlowReportDto,
  DashboardSummaryDto,
  InvoiceBillDto,
  JournalEntryDto,
  OrganizationDto,
  PartyDto,
  ProfitShareAgreementDto,
} from '@financial-saas/contracts';
import {
  formatMinorUnits,
  getCurrencyDecimals,
  money,
  type ProfitAndLossSummary,
} from '@financial-saas/ledger-core';
import {
  AreaLineChart,
  DonutChart,
  GroupedBarChart,
  HorizontalBarList,
  pickSliceColor,
  type ChartDataPoint,
} from './charts/InteractiveCharts.js';
import {
  ChartCard,
  DashboardSkeleton,
  EmptyState,
  KpiCard,
  StatusBadge,
  badgeToneForStatus,
  calcPctChange,
} from './ui/DesignSystem.js';

type Granularity = 'monthly' | 'quarterly' | 'yearly';

export interface DashboardPanelProps {
  org: OrganizationDto;
  summary: DashboardSummaryDto | null;
  pnl: ProfitAndLossSummary | null;
  balanceSheet: BalanceSheetReportDto | null;
  cashFlow: CashFlowReportDto | null;
  accounts: AccountDto[];
  bankAccounts: BankAccountDto[];
  parties: PartyDto[];
  entries: JournalEntryDto[];
  invoicesBills: InvoiceBillDto[];
  agreements: ProfitShareAgreementDto[];
  auditEvents: AuditEventDto[];
  loading?: boolean;
  startDate: string;
  endDate: string;
  filterAccountId: string;
  filterPartyId: string;
  onFilterChange: (next: {
    startDate: string;
    endDate: string;
    accountId: string;
    partyId: string;
  }) => void;
  onNavigateTab: (
    tab:
      | 'dashboard'
      | 'overview'
      | 'coa'
      | 'journals'
      | 'banking'
      | 'operations'
      | 'investors'
      | 'reports'
      | 'periods'
      | 'members'
      | 'audit'
  ) => void;
}

export function DashboardPanel({
  org,
  summary,
  pnl,
  balanceSheet,
  cashFlow,
  accounts,
  bankAccounts,
  parties,
  entries,
  invoicesBills,
  agreements,
  auditEvents,
  loading = false,
  startDate,
  endDate,
  filterAccountId,
  filterPartyId,
  onFilterChange,
  onNavigateTab,
}: DashboardPanelProps) {
  const [granularity, setGranularity] = useState<Granularity>('monthly');
  const decimals = getCurrencyDecimals(org.base_currency);
  const divisor = 10 ** decimals;

  const fmt = (minor: string) =>
    `${formatMinorUnits(money(minor, org.base_currency))} ${org.base_currency}`;
  const fmtMajor = (major: number) =>
    `${major.toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })} ${org.base_currency}`;
  const toMajor = (minor: string) => Number(minor) / divisor;

  const partyName = (id: string | null) => {
    if (!id) return '—';
    return parties.find((p) => p.id === id)?.display_name ?? id.slice(0, 8);
  };

  function applyPreset(preset: 'month' | 'quarter' | 'ytd' | 'year') {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const today = now.toISOString().slice(0, 10);
    let nextStart = `${y}-01-01`;
    let nextEnd = today;

    if (preset === 'month') {
      nextStart = `${y}-${String(m + 1).padStart(2, '0')}-01`;
    } else if (preset === 'quarter') {
      const qStartMonth = Math.floor(m / 3) * 3;
      nextStart = `${y}-${String(qStartMonth + 1).padStart(2, '0')}-01`;
    } else if (preset === 'year') {
      nextStart = `${y}-01-01`;
      nextEnd = `${y}-12-31`;
    }
    onFilterChange({
      startDate: nextStart,
      endDate: nextEnd,
      accountId: filterAccountId,
      partyId: filterPartyId,
    });
  }

  const periodicData = useMemo<ChartDataPoint[]>(() => {
    if (!summary) return [];
    if (granularity === 'yearly') {
      return summary.yearly_series.map((y) => ({
        label: y.year,
        income: toMajor(y.income_minor),
        expenses: toMajor(y.expenses_minor),
        profit: toMajor(y.net_profit_minor),
        cashChange: 0,
      }));
    }
    if (granularity === 'quarterly') {
      const byQ = new Map<
        string,
        { income: number; expenses: number; profit: number; cashChange: number }
      >();
      for (const m of summary.monthly_series) {
        const [yr, mo] = m.month.split('-');
        const q = Math.floor((Number(mo) - 1) / 3) + 1;
        const key = `${yr}-Q${q}`;
        const prev = byQ.get(key) ?? { income: 0, expenses: 0, profit: 0, cashChange: 0 };
        byQ.set(key, {
          income: prev.income + toMajor(m.income_minor),
          expenses: prev.expenses + toMajor(m.expenses_minor),
          profit: prev.profit + toMajor(m.net_profit_minor),
          cashChange: prev.cashChange + toMajor(m.cash_net_change_minor),
        });
      }
      return Array.from(byQ.entries()).map(([label, v]) => ({ label, ...v }));
    }
    return summary.monthly_series.map((m) => ({
      label: m.month,
      income: toMajor(m.income_minor),
      expenses: toMajor(m.expenses_minor),
      profit: toMajor(m.net_profit_minor),
      cashChange: toMajor(m.cash_net_change_minor),
    }));
  }, [summary, granularity, divisor]);

  const cashFlowSeries = useMemo<ChartDataPoint[]>(() => {
    if (summary && summary.monthly_series.length > 0 && granularity !== 'yearly') {
      return summary.monthly_series.map((m) => ({
        label: m.month,
        operating: Math.max(0, toMajor(m.income_minor)),
        outflow: Math.max(0, toMajor(m.expenses_minor)),
        netCash: toMajor(m.cash_net_change_minor),
      }));
    }
    if (!cashFlow) return [];
    return [
      { label: 'Operating', amount: toMajor(cashFlow.operating_minor) },
      { label: 'Investing', amount: toMajor(cashFlow.investing_minor) },
      { label: 'Financing', amount: toMajor(cashFlow.financing_minor) },
      { label: 'Net Change', amount: toMajor(cashFlow.net_cash_change_minor) },
    ];
  }, [summary, cashFlow, granularity, divisor]);

  const expenseSlices = useMemo(() => {
    if (!pnl) return [];
    return pnl.lines
      .filter((l) => l.account_type === 'expense' && BigInt(l.net_minor) !== 0n)
      .map((l, idx) => ({
        label: `${l.code} ${l.name}`,
        value: Math.abs(toMajor(l.net_minor)),
        color: pickSliceColor(idx),
      }))
      .sort((a, b) => b.value - a.value);
  }, [pnl, divisor]);

  const revenueSlices = useMemo(() => {
    if (!pnl) return [];
    return pnl.lines
      .filter((l) => l.account_type === 'income' && BigInt(l.net_minor) !== 0n)
      .map((l, idx) => ({
        label: `${l.code} ${l.name}`,
        value: Math.abs(toMajor(l.net_minor)),
        color: pickSliceColor(idx + 2),
      }))
      .sort((a, b) => b.value - a.value);
  }, [pnl, divisor]);

  const accountBalanceBars = useMemo(() => {
    if (bankAccounts.length > 0 && !balanceSheet) {
      return bankAccounts.map((b, idx) => ({
        label: `${b.institution} (•••• ${b.last4})`,
        sublabel: b.ownership_type,
        value: toMajor(b.current_balance_minor),
        color: pickSliceColor(idx),
      }));
    }
    if (!balanceSheet) return [];
    const merged = [
      ...balanceSheet.assets.map((a) => ({
        label: `${a.code} ${a.name}`,
        sublabel: 'Asset',
        value: toMajor(a.balance_minor),
        color: '#4f46e5',
      })),
      ...balanceSheet.liabilities.map((l) => ({
        label: `${l.code} ${l.name}`,
        sublabel: 'Liability',
        value: toMajor(l.balance_minor),
        color: '#e11d48',
      })),
    ].filter((x) => Math.abs(x.value) > 0);
    return merged.slice(0, 7);
  }, [bankAccounts, balanceSheet, divisor]);

  const investmentSlices = useMemo(() => {
    const shareholderSlices = parties
      .filter((p) => p.shareholding_bps > 0)
      .map((p, idx) => ({
        label: `${p.display_name} (${p.party_type})`,
        value: p.shareholding_bps / 100,
        color: pickSliceColor(idx),
      }));
    if (shareholderSlices.length > 0) {
      return { kind: 'share' as const, slices: shareholderSlices };
    }
    if (!balanceSheet) return { kind: 'capital' as const, slices: [] };
    const capLines = balanceSheet.equity
      .concat(balanceSheet.liabilities.filter((l) => l.code === '2200'))
      .filter((a) => BigInt(a.balance_minor) > 0n)
      .map((a, idx) => ({
        label: `${a.code} ${a.name}`,
        value: toMajor(a.balance_minor),
        color: pickSliceColor(idx + 1),
      }));
    return { kind: 'capital' as const, slices: capLines };
  }, [parties, balanceSheet, divisor]);

  const kpiStats = useMemo(() => {
    if (!summary) return null;
    const series = summary.monthly_series;
    const revSpark = series.map((m) => toMajor(m.income_minor));
    const expSpark = series.map((m) => toMajor(m.expenses_minor));
    const profSpark = series.map((m) => toMajor(m.net_profit_minor));
    const cashSpark = series.map((m) => toMajor(m.cash_net_change_minor));

    const last = series.length >= 2 ? series[series.length - 1] : null;
    const prev = series.length >= 2 ? series[series.length - 2] : null;

    const revDelta = last && prev ? calcPctChange(Number(last.income_minor), Number(prev.income_minor)) : null;
    const expDelta = last && prev ? calcPctChange(Number(last.expenses_minor), Number(prev.expenses_minor)) : null;
    const profDelta = last && prev ? calcPctChange(Number(last.net_profit_minor), Number(prev.net_profit_minor)) : null;

    const cashAndBankMinor = (
      BigInt(summary.kpis.bank_balance_minor) + BigInt(summary.kpis.cash_balance_minor)
    ).toString();

    return {
      revSpark,
      expSpark,
      profSpark,
      cashSpark,
      revDelta,
      expDelta,
      profDelta,
      cashAndBankMinor,
      netPositive: BigInt(summary.kpis.net_profit_minor) >= 0n,
    };
  }, [summary, divisor]);

  const recentEntries = entries.slice(0, 6);
  const openDocs = invoicesBills.filter((d) => d.status !== 'settled').slice(0, 6);
  const recentAudit = auditEvents.slice(0, 6);

  return (
    <div className="lc-stack-lg">
      {/* Header + Filter Toolbar */}
      <section className="lc-card lc-filter-panel">
        <div className="lc-page-head">
          <div>
            <div className="lc-eyebrow">
              <span>Live Financial Overview</span>
              <span className="lc-dot-sep" />
              <span>Accrual Ledger · {org.base_currency}</span>
            </div>
            <h1 className="lc-page-title">{org.name}</h1>
            <p className="muted" style={{ margin: '0.2rem 0 0' }}>
              Verified double-entry analytics — personal accounts remain segregated from company profit &amp; balance sheet.
            </p>
          </div>
          <div className="lc-preset-pills" role="group" aria-label="Quick date presets">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => applyPreset('month')}>
              This Month
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => applyPreset('quarter')}>
              This Quarter
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => applyPreset('ytd')}>
              YTD
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => applyPreset('year')}>
              Full Year
            </button>
          </div>
        </div>

        <div className="lc-filter-grid">
          <label>
            From Date
            <input
              type="date"
              value={startDate}
              onChange={(e) =>
                onFilterChange({
                  startDate: e.target.value,
                  endDate,
                  accountId: filterAccountId,
                  partyId: filterPartyId,
                })
              }
            />
          </label>
          <label>
            To Date
            <input
              type="date"
              value={endDate}
              onChange={(e) =>
                onFilterChange({
                  startDate,
                  endDate: e.target.value,
                  accountId: filterAccountId,
                  partyId: filterPartyId,
                })
              }
            />
          </label>
          <label>
            Account Filter
            <select
              value={filterAccountId}
              onChange={(e) =>
                onFilterChange({
                  startDate,
                  endDate,
                  accountId: e.target.value,
                  partyId: filterPartyId,
                })
              }
            >
              <option value="">All Accounts</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} — {a.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Person / Counterparty
            <select
              value={filterPartyId}
              onChange={(e) =>
                onFilterChange({
                  startDate,
                  endDate,
                  accountId: filterAccountId,
                  partyId: e.target.value,
                })
              }
            >
              <option value="">All Parties</option>
              {parties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name} ({p.party_type})
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {loading && !summary ? (
        <DashboardSkeleton />
      ) : summary && kpiStats ? (
        <>
          {/* Primary 8 KPI Cards (2 structured rows of 4) */}
          <section className="lc-kpi-grid-4" aria-label="Primary Financial KPIs">
            <KpiCard
              featured
              label="Total Revenue"
              value={fmt(summary.kpis.total_income_minor)}
              icon={<TrendingUp size={18} />}
              accent="emerald"
              deltaPct={kpiStats.revDelta}
              sparkValues={kpiStats.revSpark}
              sublabel="Posted accrual revenue"
            />
            <KpiCard
              featured
              label="Total Expenses"
              value={fmt(summary.kpis.total_expenses_minor)}
              icon={<TrendingDown size={18} />}
              accent="rose"
              deltaPct={kpiStats.expDelta}
              invertDeltaColor
              sparkValues={kpiStats.expSpark}
              sublabel="Company operating costs"
            />
            <KpiCard
              featured
              label="Net Profit"
              value={fmt(summary.kpis.net_profit_minor)}
              icon={<DollarSign size={18} />}
              accent={kpiStats.netPositive ? 'indigo' : 'rose'}
              deltaPct={kpiStats.profDelta}
              sparkValues={kpiStats.profSpark}
              sublabel="Accrual income − expenses"
            />
            <KpiCard
              featured
              label="Cash & Bank Balance"
              value={fmt(kpiStats.cashAndBankMinor)}
              icon={<Landmark size={18} />}
              accent="indigo"
              sparkValues={kpiStats.cashSpark}
              sublabel={`Bank ${fmt(summary.kpis.bank_balance_minor)} · Cash ${fmt(summary.kpis.cash_balance_minor)}`}
            />

            <KpiCard
              label="Accounts Receivable"
              value={fmt(summary.kpis.receivables_minor)}
              icon={<Receipt size={17} />}
              accent="indigo"
              sublabel="AR + Due from Owner"
            />
            <KpiCard
              label="Accounts Payable"
              value={fmt(summary.kpis.payables_minor)}
              icon={<CreditCard size={17} />}
              accent="amber"
              sublabel="AP + Salaries + Partner Due"
            />
            <KpiCard
              label="Total Investments"
              value={fmt(summary.kpis.total_investments_minor)}
              icon={<PiggyBank size={17} />}
              accent="emerald"
              sublabel="Equity Capital + Investor Loans"
            />
            <KpiCard
              label="Business Assets"
              value={fmt(summary.kpis.total_assets_minor)}
              icon={<Building2 size={17} />}
              accent="slate"
              sublabel="Company balance sheet assets"
            />
          </section>

          {/* Compact Position Strip */}
          <section className="lc-position-strip" aria-label="Additional Financial Position">
            <div className="lc-strip-item">
              <span className="muted">Working Capital</span>
              <strong className="mono-num">{fmt(summary.kpis.working_capital_minor)}</strong>
            </div>
            <div className="lc-strip-item">
              <span className="muted">Total Liabilities</span>
              <strong className="mono-num">{fmt(summary.kpis.total_liabilities_minor)}</strong>
            </div>
            <div className="lc-strip-item">
              <span className="muted">Personal Accounts (Excluded)</span>
              <strong className="mono-num">{fmt(summary.kpis.personal_accounts_balance_minor)}</strong>
            </div>
            <div className="lc-strip-item">
              <span className="muted">Balance Sheet Check</span>
              {balanceSheet ? (
                <StatusBadge tone={balanceSheet.is_balanced ? 'success' : 'danger'}>
                  {balanceSheet.is_balanced ? 'A = L + E Balanced' : 'Out of Balance'}
                </StatusBadge>
              ) : (
                <StatusBadge tone="neutral">Pending</StatusBadge>
              )}
            </div>
          </section>

          {/* Charts Row 1: Revenue vs Expenses + Net Profit Trend */}
          <div className="lc-charts-grid-2">
            <ChartCard
              title="Revenue vs. Expenses"
              subtitle="Posted double-entry performance across periods"
              rightSlot={
                <div className="lc-segmented" role="group" aria-label="Chart granularity">
                  {(['monthly', 'quarterly', 'yearly'] as const).map((g) => (
                    <button
                      key={g}
                      type="button"
                      className={`lc-seg-btn ${granularity === g ? 'active' : ''}`}
                      onClick={() => setGranularity(g)}
                    >
                      {g === 'monthly' ? 'Monthly' : g === 'quarterly' ? 'Quarterly' : 'Yearly'}
                    </button>
                  ))}
                </div>
              }
            >
              {periodicData.length === 0 ? (
                <EmptyState
                  icon={<BarChart3 size={20} />}
                  title="No posted income or expense periods"
                  description="Post a journal entry or record a sale/expense to visualize revenue and expenses."
                  actionLabel="Open Journal & Ledger"
                  onAction={() => onNavigateTab('journals')}
                />
              ) : (
                <AreaLineChart
                  data={periodicData}
                  currency={org.base_currency}
                  formatValue={fmtMajor}
                  series={[
                    { key: 'income', label: 'Revenue', color: '#10b981' },
                    { key: 'expenses', label: 'Expenses', color: '#f43f5e' },
                  ]}
                />
              )}
            </ChartCard>

            <ChartCard
              title="Net Profit Trend"
              subtitle={`Accrual net profit trajectory (${granularity})`}
            >
              {periodicData.length === 0 ? (
                <EmptyState
                  icon={<TrendingUp size={20} />}
                  title="No net profit data in range"
                  description="Adjust your date range or post transactions to track net profit over time."
                  actionLabel="Record Expense / Sale"
                  onAction={() => onNavigateTab('operations')}
                />
              ) : (
                <AreaLineChart
                  data={periodicData}
                  currency={org.base_currency}
                  formatValue={fmtMajor}
                  series={[{ key: 'profit', label: 'Net Profit', color: '#4f46e5' }]}
                />
              )}
            </ChartCard>
          </div>

          {/* Charts Row 2: Monthly Financial Performance + Cash Flow */}
          <div className="lc-charts-grid-2">
            <ChartCard
              title="Periodic Financial Performance"
              subtitle="Side-by-side Revenue, Expenses, and Net Profit"
            >
              {periodicData.length === 0 ? (
                <EmptyState
                  icon={<Calendar size={20} />}
                  title="No periodic comparison available"
                  description="Post entries across dates to compare monthly, quarterly, or annual performance."
                  actionLabel="Go to Ledger"
                  onAction={() => onNavigateTab('journals')}
                />
              ) : (
                <GroupedBarChart
                  data={periodicData}
                  currency={org.base_currency}
                  formatValue={fmtMajor}
                  series={[
                    { key: 'income', label: 'Revenue', color: '#10b981' },
                    { key: 'expenses', label: 'Expenses', color: '#f43f5e' },
                    { key: 'profit', label: 'Net Profit', color: '#4f46e5' },
                  ]}
                />
              )}
            </ChartCard>

            <ChartCard
              title="Cash Flow (Inflow vs. Outflow)"
              subtitle={
                cashFlow
                  ? `Closing Cash: ${fmt(cashFlow.closing_cash_minor)}`
                  : 'Operating cash inflows & outflows'
              }
            >
              {cashFlowSeries.length === 0 ? (
                <EmptyState
                  icon={<Wallet size={20} />}
                  title="No cash movement recorded"
                  description="Record bank deposits, expenses, or eBay payouts to view cash flow activity."
                  actionLabel="Open Banking"
                  onAction={() => onNavigateTab('banking')}
                />
              ) : summary.monthly_series.length > 0 && granularity !== 'yearly' ? (
                <GroupedBarChart
                  data={cashFlowSeries}
                  currency={org.base_currency}
                  formatValue={fmtMajor}
                  series={[
                    { key: 'operating', label: 'Inflow', color: '#0ea5e9' },
                    { key: 'outflow', label: 'Outflow', color: '#f59e0b' },
                    { key: 'netCash', label: 'Net Cash Change', color: '#4f46e5' },
                  ]}
                />
              ) : (
                <GroupedBarChart
                  data={cashFlowSeries}
                  currency={org.base_currency}
                  formatValue={fmtMajor}
                  series={[{ key: 'amount', label: 'Cash Impact', color: '#0ea5e9' }]}
                />
              )}
            </ChartCard>
          </div>

          {/* Charts Row 3: Expense Breakdown + Revenue Sources */}
          <div className="lc-charts-grid-2">
            <ChartCard
              title="Expense Breakdown"
              subtitle="Distribution across active expense accounts"
            >
              {expenseSlices.length === 0 ? (
                <EmptyState
                  icon={<TrendingDown size={20} />}
                  title="No posted expenses yet"
                  description="Record vendor bills, COGS, or marketplace fees to inspect cost allocation."
                  actionLabel="Record Expense"
                  onAction={() => onNavigateTab('operations')}
                />
              ) : (
                <DonutChart
                  slices={expenseSlices}
                  centerLabel="Expenses"
                  centerValue={fmt(summary.kpis.total_expenses_minor)}
                  formatValue={fmtMajor}
                />
              )}
            </ChartCard>

            <ChartCard
              title="Revenue Sources"
              subtitle="Breakdown by posted income ledger accounts"
            >
              {revenueSlices.length === 0 ? (
                <EmptyState
                  icon={<TrendingUp size={20} />}
                  title="No posted revenue accounts"
                  description="Record eBay payouts, invoices, or sales journals to visualize revenue streams."
                  actionLabel="Post eBay Payout"
                  onAction={() => onNavigateTab('operations')}
                />
              ) : (
                <DonutChart
                  slices={revenueSlices}
                  centerLabel="Revenue"
                  centerValue={fmt(summary.kpis.total_income_minor)}
                  formatValue={fmtMajor}
                />
              )}
            </ChartCard>
          </div>

          {/* Charts Row 4: Account Balances + Investment Distribution */}
          <div className="lc-charts-grid-2">
            <ChartCard
              title="Account Balances Comparison"
              subtitle="Bank accounts & core balance sheet positions"
            >
              {accountBalanceBars.length === 0 ? (
                <EmptyState
                  icon={<Layers size={20} />}
                  title="No active account balances"
                  description="Seed your Chart of Accounts or connect a bank account to view balances."
                  actionLabel="Manage Accounts"
                  onAction={() => onNavigateTab('banking')}
                />
              ) : (
                <HorizontalBarList items={accountBalanceBars} formatValue={fmtMajor} />
              )}
            </ChartCard>

            <ChartCard
              title="Investment & Equity Distribution"
              subtitle={
                investmentSlices.kind === 'share'
                  ? `Active investor shareholding (${agreements.length} agreement version(s))`
                  : 'Investor capital & equity structure'
              }
            >
              {investmentSlices.slices.length === 0 ? (
                <EmptyState
                  icon={<PiggyBank size={20} />}
                  title="No investor equity or agreements yet"
                  description="Add investors with shareholding % or post an equity contribution to track distribution."
                  actionLabel="Open Investors & Payroll"
                  onAction={() => onNavigateTab('investors')}
                />
              ) : (
                <DonutChart
                  slices={investmentSlices.slices}
                  centerLabel={investmentSlices.kind === 'share' ? 'Ownership' : 'Invested'}
                  centerValue={
                    investmentSlices.kind === 'share'
                      ? `${investmentSlices.slices.reduce((s, x) => s + x.value, 0).toFixed(0)}%`
                      : fmt(summary.kpis.total_investments_minor)
                  }
                  formatValue={(val) =>
                    investmentSlices.kind === 'share' ? `${val.toFixed(1)}%` : fmtMajor(val)
                  }
                />
              )}
            </ChartCard>
          </div>

          {/* Activity & Operations Row: Recent Transactions + Outstanding Invoices/Bills + Audit Activities */}
          <div className="lc-charts-grid-3">
            <section className="lc-card">
              <header className="lc-card-head">
                <div>
                  <h3 className="lc-card-title">Recent Transactions</h3>
                  <p className="lc-card-sub">Latest ledger entries</p>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => onNavigateTab('journals')}
                >
                  View all <ArrowRight size={13} />
                </button>
              </header>
              {recentEntries.length === 0 ? (
                <EmptyState
                  title="No journal entries yet"
                  description="Create and post a journal entry to build your ledger history."
                />
              ) : (
                <div className="lc-activity-list">
                  {recentEntries.map((entry) => {
                    const totalDebit = entry.lines
                      .filter((l) => l.side === 'debit')
                      .reduce((s, l) => s + BigInt(l.amount_minor), 0n);
                    return (
                      <div key={entry.id} className="lc-activity-row">
                        <div className="lc-activity-main">
                          <div className="lc-activity-title">
                            <span className="mono">{entry.entry_no ? `#${entry.entry_no}` : 'Draft'}</span>{' '}
                            {entry.description}
                          </div>
                          <div className="muted">{entry.entry_date}</div>
                        </div>
                        <div className="lc-activity-right">
                          <strong className="mono-num">{fmt(totalDebit.toString())}</strong>
                          <StatusBadge tone={badgeToneForStatus(entry.status)}>
                            {entry.status}
                          </StatusBadge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="lc-card">
              <header className="lc-card-head">
                <div>
                  <h3 className="lc-card-title">Open Invoices &amp; Bills</h3>
                  <p className="lc-card-sub">Upcoming receivables &amp; payables</p>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => onNavigateTab('operations')}
                >
                  Manage <ArrowRight size={13} />
                </button>
              </header>
              {openDocs.length === 0 ? (
                <EmptyState
                  icon={<Briefcase size={18} />}
                  title="No open bills or invoices"
                  description="Supplier bills and customer invoices awaiting settlement will appear here."
                />
              ) : (
                <div className="lc-activity-list">
                  {openDocs.map((doc) => (
                    <div key={doc.id} className="lc-activity-row">
                      <div className="lc-activity-main">
                        <div className="lc-activity-title">
                          <span className="mono">{doc.doc_number}</span> · {partyName(doc.party_id)}
                        </div>
                        <div className="muted">
                          {doc.kind.toUpperCase()} · Due {doc.due_date ?? doc.issue_date}
                        </div>
                      </div>
                      <div className="lc-activity-right">
                        <strong className="mono-num">{fmt(doc.remaining_minor)}</strong>
                        <StatusBadge tone={badgeToneForStatus(doc.status)}>
                          {doc.status}
                        </StatusBadge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="lc-card">
              <header className="lc-card-head">
                <div>
                  <h3 className="lc-card-title">Recent Financial Activity</h3>
                  <p className="lc-card-sub">Tamper-evident audit stream</p>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => onNavigateTab('audit')}
                >
                  Audit log <ArrowRight size={13} />
                </button>
              </header>
              {recentAudit.length === 0 ? (
                <EmptyState
                  icon={<Activity size={18} />}
                  title="No audit events yet"
                  description="All financial mutations generate hash-chained audit events."
                />
              ) : (
                <div className="lc-activity-list">
                  {recentAudit.map((ev) => (
                    <div key={ev.id} className="lc-activity-row">
                      <div className="lc-activity-main">
                        <div className="lc-activity-title">{ev.action}</div>
                        <div className="muted">
                          {ev.entity_type} · {ev.created_at.slice(0, 16).replace('T', ' ')}
                        </div>
                      </div>
                      <div className="lc-activity-right">
                        <span className="mono muted">{ev.row_hash.slice(0, 10)}…</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </>
      ) : (
        <section className="lc-card">
          <EmptyState
            icon={<BarChart3 size={22} />}
            title="Unable to load financial summary"
            description="Verify your organization permissions or refresh the workspace."
          />
        </section>
      )}
    </div>
  );
}

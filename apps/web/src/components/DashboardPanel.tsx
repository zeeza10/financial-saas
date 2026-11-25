import type {
  AccountDto,
  DashboardSummaryDto,
  OrganizationDto,
  PartyDto,
} from '@financial-saas/contracts';
import { formatMinorUnits, money } from '@financial-saas/ledger-core';

interface DashboardPanelProps {
  org: OrganizationDto;
  summary: DashboardSummaryDto | null;
  accounts: AccountDto[];
  parties: PartyDto[];
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
}

export function DashboardPanel({
  org,
  summary,
  accounts,
  parties,
  startDate,
  endDate,
  filterAccountId,
  filterPartyId,
  onFilterChange,
}: DashboardPanelProps) {
  const fmt = (minor: string) => `${formatMinorUnits(money(minor, org.base_currency))} ${org.base_currency}`;

  const kpiCards = summary
    ? [
        { label: 'Total Income (Accrual)', value: fmt(summary.kpis.total_income_minor), tone: 'ok' },
        { label: 'Total Expenses', value: fmt(summary.kpis.total_expenses_minor), tone: 'neutral' },
        { label: 'Net Profit', value: fmt(summary.kpis.net_profit_minor), tone: BigInt(summary.kpis.net_profit_minor) >= 0n ? 'ok' : 'warn' },
        { label: 'Business Bank Balances', value: fmt(summary.kpis.bank_balance_minor), tone: 'neutral' },
        { label: 'Business Cash Balances', value: fmt(summary.kpis.cash_balance_minor), tone: 'neutral' },
        { label: 'Available Working Capital', value: fmt(summary.kpis.working_capital_minor), tone: 'neutral' },
        { label: 'Total Assets', value: fmt(summary.kpis.total_assets_minor), tone: 'neutral' },
        { label: 'Total Liabilities', value: fmt(summary.kpis.total_liabilities_minor), tone: 'neutral' },
        { label: 'Receivables (AR + Due from Owner)', value: fmt(summary.kpis.receivables_minor), tone: 'neutral' },
        { label: 'Payables (AP + Salaries + Due to Partner)', value: fmt(summary.kpis.payables_minor), tone: 'neutral' },
        { label: 'Total Investments (Capital + Loans)', value: fmt(summary.kpis.total_investments_minor), tone: 'neutral' },
        { label: 'Personal Accounts (Excluded from Company)', value: fmt(summary.kpis.personal_accounts_balance_minor), tone: 'warn' },
      ]
    : [];

  const maxMonthlyVal = summary
    ? summary.monthly_series.reduce((max, pt) => {
        const inc = Math.abs(Number(pt.income_minor));
        const exp = Math.abs(Number(pt.expenses_minor));
        return Math.max(max, inc, exp);
      }, 1)
    : 1;

  return (
    <>
      <section className="card">
        <h2 style={{ marginTop: 0 }}>Financial Dashboard — {org.name}</h2>
        <p className="muted">
          All KPIs are calculated live from posted, balanced double-entry records (personal accounts excluded from company profit & assets).
        </p>
        <div className="grid-3">
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
            Filter by Account
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
                <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
              ))}
            </select>
          </label>
          <label>
            Filter by Person / Party
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
                <option key={p.id} value={p.id}>{p.display_name} ({p.party_type})</option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {summary && (
        <>
          <section className="grid-3" style={{ marginBottom: '1rem' }}>
            {kpiCards.map((k) => (
              <article key={k.label} className="card" style={{ marginBottom: 0 }}>
                <div className="muted">{k.label}</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, marginTop: '0.35rem', fontVariantNumeric: 'tabular-nums' }}>
                  {k.value}
                </div>
              </article>
            ))}
          </section>

          <section className="card">
            <h3 style={{ marginTop: 0 }}>Monthly Income vs. Expenses & Cash Flow</h3>
            {summary.monthly_series.length === 0 ? (
              <p className="muted">No posted transactions in this date range yet.</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Month</th>
                      <th>Income</th>
                      <th>Expenses</th>
                      <th>Net Profit</th>
                      <th>Cash Net Change</th>
                      <th>Visual</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.monthly_series.map((m) => {
                      const incPct = Math.round((Math.abs(Number(m.income_minor)) / maxMonthlyVal) * 100);
                      const expPct = Math.round((Math.abs(Number(m.expenses_minor)) / maxMonthlyVal) * 100);
                      return (
                        <tr key={m.month}>
                          <td className="mono">{m.month}</td>
                          <td>{fmt(m.income_minor)}</td>
                          <td>{fmt(m.expenses_minor)}</td>
                          <td><strong>{fmt(m.net_profit_minor)}</strong></td>
                          <td>{fmt(m.cash_net_change_minor)}</td>
                          <td style={{ minWidth: '140px' }}>
                            <div style={{ display: 'grid', gap: '4px' }}>
                              <div style={{ height: '6px', width: `${incPct}%`, background: '#15803d', borderRadius: '3px' }} />
                              <div style={{ height: '6px', width: `${expPct}%`, background: '#0f4c81', borderRadius: '3px' }} />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="card">
            <h3 style={{ marginTop: 0 }}>Yearly Comparison</h3>
            {summary.yearly_series.length === 0 ? (
              <p className="muted">No yearly posted activity yet.</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Year</th>
                      <th>Income</th>
                      <th>Expenses</th>
                      <th>Net Profit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.yearly_series.map((y) => (
                      <tr key={y.year}>
                        <td className="mono">{y.year}</td>
                        <td>{fmt(y.income_minor)}</td>
                        <td>{fmt(y.expenses_minor)}</td>
                        <td><strong>{fmt(y.net_profit_minor)}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}

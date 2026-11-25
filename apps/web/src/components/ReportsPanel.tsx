import { useState } from 'react';
import {
  hasRolePermission,
  type BalanceSheetReportDto,
  type CashFlowReportDto,
  type IndividualLedgerDto,
  type OrganizationDto,
  type PartyDto,
  type TrialBalanceReportDto,
} from '@financial-saas/contracts';
import { formatMinorUnits, money, type ProfitAndLossSummary } from '@financial-saas/ledger-core';
import { apiClient } from '../apiClient.js';

interface ReportsPanelProps {
  org: OrganizationDto;
  startDate: string;
  endDate: string;
  pnl: ProfitAndLossSummary | null;
  balanceSheet: BalanceSheetReportDto | null;
  cashFlow: CashFlowReportDto | null;
  trialBalance: TrialBalanceReportDto | null;
  parties: PartyDto[];
  onError: (msg: string | null) => void;
}

type StatementView = 'pnl' | 'balance-sheet' | 'cash-flow' | 'trial-balance' | 'party-ledger';

export function ReportsPanel({
  org,
  startDate,
  endDate,
  pnl,
  balanceSheet,
  cashFlow,
  trialBalance,
  parties,
  onError,
}: ReportsPanelProps) {
  const [view, setView] = useState<StatementView>('pnl');
  const [selectedPartyId, setSelectedPartyId] = useState('');
  const [partyLedger, setPartyLedger] = useState<IndividualLedgerDto | null>(null);

  const canExport = hasRolePermission(org.role, 'data:export');
  const fmt = (minor: string) => `${formatMinorUnits(money(minor, org.base_currency))} ${org.base_currency}`;

  async function handleExport(
    report: 'pnl' | 'balance-sheet' | 'trial-balance' | 'cash-flow' | 'expenses',
    format: 'csv' | 'xlsx' | 'pdf'
  ) {
    onError(null);
    try {
      const { blob, filename } = await apiClient.downloadExport(org.id, {
        report,
        format,
        startDate,
        endDate,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Export failed');
    }
  }

  async function handleLoadPartyLedger(partyId: string) {
    setSelectedPartyId(partyId);
    setPartyLedger(null);
    if (!partyId) return;
    onError(null);
    try {
      const ledger = await apiClient.getIndividualLedger(org.id, partyId);
      setPartyLedger(ledger);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Unable to load individual ledger');
    }
  }

  return (
    <>
      <section className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {(
              [
                ['pnl', 'Profit & Loss'],
                ['balance-sheet', 'Balance Sheet'],
                ['cash-flow', 'Cash Flow'],
                ['trial-balance', 'Trial Balance'],
                ['party-ledger', 'Individual Ledgers'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={`btn ${view === id ? '' : 'btn-secondary'}`}
                onClick={() => setView(id)}
              >
                {label}
              </button>
            ))}
          </div>

          {canExport && view !== 'party-ledger' && (
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-secondary" onClick={() => handleExport(view, 'csv')}>
                Export CSV
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => handleExport(view, 'xlsx')}>
                Export Excel (.xlsx)
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => handleExport(view, 'pdf')}>
                Export PDF
              </button>
            </div>
          )}
        </div>
      </section>

      {view === 'pnl' && pnl && (
        <section className="card">
          <h2 style={{ marginTop: 0 }}>Profit & Loss ({pnl.start_date} to {pnl.end_date})</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Account</th>
                  <th>Category</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {pnl.lines.map((l) => (
                  <tr key={l.account_id}>
                    <td className="mono">{l.code}</td>
                    <td>{l.name}</td>
                    <td>{l.account_type}</td>
                    <td>{fmt(l.net_minor)}</td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={3}><strong>Total Income</strong></td>
                  <td><strong>{fmt(pnl.total_income_minor)}</strong></td>
                </tr>
                <tr>
                  <td colSpan={3}><strong>Total Expenses</strong></td>
                  <td><strong>{fmt(pnl.total_expense_minor)}</strong></td>
                </tr>
                <tr>
                  <td colSpan={3}><strong>Net Profit (Accrual)</strong></td>
                  <td><strong>{fmt(pnl.net_profit_minor)}</strong></td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      )}

      {view === 'balance-sheet' && balanceSheet && (
        <section className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0 }}>Balance Sheet (as of {balanceSheet.as_of_date})</h2>
            <span className={`badge ${balanceSheet.is_balanced ? 'badge-ok' : 'badge-warn'}`}>
              {balanceSheet.is_balanced ? 'Assets = Liabilities + Equity' : 'OUT OF BALANCE'}
            </span>
          </div>
          <div className="table-wrap" style={{ marginTop: '0.75rem' }}>
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Account</th>
                  <th>Section</th>
                  <th>Balance</th>
                </tr>
              </thead>
              <tbody>
                {balanceSheet.assets.map((a) => (
                  <tr key={a.account_id}>
                    <td className="mono">{a.code}</td>
                    <td>{a.name}</td>
                    <td>Asset</td>
                    <td>{fmt(a.balance_minor)}</td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={3}><strong>Total Assets</strong></td>
                  <td><strong>{fmt(balanceSheet.total_assets_minor)}</strong></td>
                </tr>
                {balanceSheet.liabilities.map((l) => (
                  <tr key={l.account_id}>
                    <td className="mono">{l.code}</td>
                    <td>{l.name}</td>
                    <td>Liability</td>
                    <td>{fmt(l.balance_minor)}</td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={3}><strong>Total Liabilities</strong></td>
                  <td><strong>{fmt(balanceSheet.total_liabilities_minor)}</strong></td>
                </tr>
                {balanceSheet.equity.map((e) => (
                  <tr key={e.account_id}>
                    <td className="mono">{e.code}</td>
                    <td>{e.name}</td>
                    <td>Equity</td>
                    <td>{fmt(e.balance_minor)}</td>
                  </tr>
                ))}
                <tr>
                  <td className="mono">—</td>
                  <td>Current Period Net Income</td>
                  <td>Equity</td>
                  <td>{fmt(balanceSheet.current_net_income_minor)}</td>
                </tr>
                <tr>
                  <td colSpan={3}><strong>Total Equity</strong></td>
                  <td><strong>{fmt(balanceSheet.total_equity_minor)}</strong></td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      )}

      {view === 'cash-flow' && cashFlow && (
        <section className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0 }}>Cash Flow Statement ({cashFlow.start_date} to {cashFlow.end_date})</h2>
            <span className={`badge ${cashFlow.is_reconciled ? 'badge-ok' : 'badge-warn'}`}>
              {cashFlow.is_reconciled ? 'Opening + Net = Closing' : 'UNRECONCILED'}
            </span>
          </div>
          <div className="grid-3" style={{ margin: '1rem 0' }}>
            <div><div className="muted">Opening Cash</div><strong>{fmt(cashFlow.opening_cash_minor)}</strong></div>
            <div><div className="muted">Operating Cash Flow</div><strong>{fmt(cashFlow.operating_minor)}</strong></div>
            <div><div className="muted">Investing Cash Flow</div><strong>{fmt(cashFlow.investing_minor)}</strong></div>
            <div><div className="muted">Financing Cash Flow</div><strong>{fmt(cashFlow.financing_minor)}</strong></div>
            <div><div className="muted">Net Cash Change</div><strong>{fmt(cashFlow.net_cash_change_minor)}</strong></div>
            <div><div className="muted">Closing Cash</div><strong>{fmt(cashFlow.closing_cash_minor)}</strong></div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Activity</th>
                  <th>Counterparty / Category</th>
                  <th>Cash Impact</th>
                </tr>
              </thead>
              <tbody>
                {cashFlow.items.map((item, idx) => (
                  <tr key={`${item.activity}-${idx}`}>
                    <td><span className="badge">{item.activity}</span></td>
                    <td>{item.label}</td>
                    <td>{fmt(item.amount_minor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {view === 'trial-balance' && trialBalance && (
        <section className="card">
          <h2 style={{ marginTop: 0 }}>Trial Balance (as of {trialBalance.as_of_date})</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Account</th>
                  <th>Debits</th>
                  <th>Credits</th>
                </tr>
              </thead>
              <tbody>
                {trialBalance.rows.map((r) => (
                  <tr key={r.account_id}>
                    <td className="mono">{r.code}</td>
                    <td>{r.name}</td>
                    <td>{fmt(r.debit_total_minor)}</td>
                    <td>{fmt(r.credit_total_minor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {view === 'party-ledger' && (
        <section className="card">
          <h2 style={{ marginTop: 0 }}>Individual / Investor / Employee / Supplier Ledger (BR-017)</h2>
          <label style={{ maxWidth: '380px', marginBottom: '1rem' }}>
            Select Person or Counterparty
            <select value={selectedPartyId} onChange={(e) => void handleLoadPartyLedger(e.target.value)}>
              <option value="">Choose party...</option>
              {parties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name} ({p.party_type})
                </option>
              ))}
            </select>
          </label>

          {partyLedger && (
            <>
              <div className="grid-3" style={{ marginBottom: '1rem' }}>
                <div><div className="muted">Total Debits</div><strong>{fmt(partyLedger.total_debits_minor)}</strong></div>
                <div><div className="muted">Total Credits</div><strong>{fmt(partyLedger.total_credits_minor)}</strong></div>
                <div><div className="muted">Net Balance</div><strong>{fmt(partyLedger.net_balance_minor)}</strong></div>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Entry #</th>
                      <th>Date</th>
                      <th>Description</th>
                      <th>Side</th>
                      <th>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {partyLedger.lines.map((l, idx) => (
                      <tr key={`${l.entry_id}-${idx}`}>
                        <td className="mono">{l.entry_no ? `#${l.entry_no}` : '—'}</td>
                        <td>{l.entry_date}</td>
                        <td>{l.description}</td>
                        <td>{l.side.toUpperCase()}</td>
                        <td>{fmt(l.amount_minor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      )}
    </>
  );
}

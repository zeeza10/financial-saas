import { useState } from 'react';
import { Download, FileSpreadsheet, FileText } from 'lucide-react';
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
import { EmptyState, StatusBadge } from './ui/DesignSystem.js';

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
  onNotify?: (title: string, detail?: string) => void;
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
  onNotify,
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
      onNotify?.('Statement exported', filename);
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
    <div className="lc-stack-lg">
      <section className="lc-card">
        <div className="lc-page-head">
          <div>
            <div className="lc-eyebrow">Audit-Ready Statements · {startDate} → {endDate}</div>
            <h1 className="lc-page-title">Financial Statements &amp; Exports</h1>
            <p className="muted" style={{ margin: '0.2rem 0 0' }}>
              Accrual P&amp;L, Balance Sheet, Cash Flow, Trial Balance, and Individual Counterparty Ledgers (`BR-017`).
            </p>
          </div>
          {canExport && view !== 'party-ledger' && (
            <div className="lc-btn-group">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleExport(view, 'csv')}>
                <Download size={14} /> CSV
              </button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleExport(view, 'xlsx')}>
                <FileSpreadsheet size={14} /> Excel (.xlsx)
              </button>
              <button type="button" className="btn btn-sm" onClick={() => handleExport(view, 'pdf')}>
                <FileText size={14} /> PDF Statement
              </button>
            </div>
          )}
        </div>

        <div className="lc-segmented" style={{ marginTop: '0.9rem' }} role="tablist" aria-label="Financial statement selector">
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
              className={`lc-seg-btn ${view === id ? 'active' : ''}`}
              onClick={() => setView(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {view === 'pnl' && pnl && (
        <section className="lc-card">
          <header className="lc-card-head">
            <div>
              <h3 className="lc-card-title">Profit &amp; Loss Statement (Accrual)</h3>
              <p className="lc-card-sub">{pnl.start_date} to {pnl.end_date}</p>
            </div>
            <StatusBadge tone={BigInt(pnl.net_profit_minor) >= 0n ? 'success' : 'warning'}>
              Net Profit: {fmt(pnl.net_profit_minor)}
            </StatusBadge>
          </header>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Account</th>
                  <th>Category</th>
                  <th className="num-col">Amount</th>
                </tr>
              </thead>
              <tbody>
                {pnl.lines.map((l) => (
                  <tr key={l.account_id}>
                    <td className="mono">{l.code}</td>
                    <td>{l.name}</td>
                    <td style={{ textTransform: 'capitalize' }}>{l.account_type}</td>
                    <td className="num-col mono-num">{fmt(l.net_minor)}</td>
                  </tr>
                ))}
                <tr className="lc-subtotal-row">
                  <td colSpan={3}><strong>Total Income</strong></td>
                  <td className="num-col mono-num"><strong>{fmt(pnl.total_income_minor)}</strong></td>
                </tr>
                <tr className="lc-subtotal-row">
                  <td colSpan={3}><strong>Total Expenses</strong></td>
                  <td className="num-col mono-num"><strong>{fmt(pnl.total_expense_minor)}</strong></td>
                </tr>
                <tr className="lc-total-row">
                  <td colSpan={3}><strong>Net Profit (Accrual)</strong></td>
                  <td className="num-col mono-num"><strong>{fmt(pnl.net_profit_minor)}</strong></td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      )}

      {view === 'balance-sheet' && balanceSheet && (
        <section className="lc-card">
          <header className="lc-card-head">
            <div>
              <h3 className="lc-card-title">Balance Sheet</h3>
              <p className="lc-card-sub">As of {balanceSheet.as_of_date}</p>
            </div>
            <StatusBadge tone={balanceSheet.is_balanced ? 'success' : 'danger'}>
              {balanceSheet.is_balanced ? 'Assets = Liabilities + Equity' : 'OUT OF BALANCE'}
            </StatusBadge>
          </header>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Account</th>
                  <th>Section</th>
                  <th className="num-col">Balance</th>
                </tr>
              </thead>
              <tbody>
                {balanceSheet.assets.map((a) => (
                  <tr key={a.account_id}>
                    <td className="mono">{a.code}</td>
                    <td>{a.name}</td>
                    <td>Asset</td>
                    <td className="num-col mono-num">{fmt(a.balance_minor)}</td>
                  </tr>
                ))}
                <tr className="lc-subtotal-row">
                  <td colSpan={3}><strong>Total Assets</strong></td>
                  <td className="num-col mono-num"><strong>{fmt(balanceSheet.total_assets_minor)}</strong></td>
                </tr>
                {balanceSheet.liabilities.map((l) => (
                  <tr key={l.account_id}>
                    <td className="mono">{l.code}</td>
                    <td>{l.name}</td>
                    <td>Liability</td>
                    <td className="num-col mono-num">{fmt(l.balance_minor)}</td>
                  </tr>
                ))}
                <tr className="lc-subtotal-row">
                  <td colSpan={3}><strong>Total Liabilities</strong></td>
                  <td className="num-col mono-num"><strong>{fmt(balanceSheet.total_liabilities_minor)}</strong></td>
                </tr>
                {balanceSheet.equity.map((e) => (
                  <tr key={e.account_id}>
                    <td className="mono">{e.code}</td>
                    <td>{e.name}</td>
                    <td>Equity</td>
                    <td className="num-col mono-num">{fmt(e.balance_minor)}</td>
                  </tr>
                ))}
                <tr>
                  <td className="mono">—</td>
                  <td>Current Period Net Income</td>
                  <td>Equity</td>
                  <td className="num-col mono-num">{fmt(balanceSheet.current_net_income_minor)}</td>
                </tr>
                <tr className="lc-total-row">
                  <td colSpan={3}><strong>Total Equity</strong></td>
                  <td className="num-col mono-num"><strong>{fmt(balanceSheet.total_equity_minor)}</strong></td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      )}

      {view === 'cash-flow' && cashFlow && (
        <section className="lc-card">
          <header className="lc-card-head">
            <div>
              <h3 className="lc-card-title">Cash Flow Statement</h3>
              <p className="lc-card-sub">{cashFlow.start_date} to {cashFlow.end_date}</p>
            </div>
            <StatusBadge tone={cashFlow.is_reconciled ? 'success' : 'danger'}>
              {cashFlow.is_reconciled ? 'Opening + Net = Closing' : 'UNRECONCILED'}
            </StatusBadge>
          </header>
          <div className="lc-position-strip" style={{ marginBottom: '1rem' }}>
            <div className="lc-strip-item"><span className="muted">Opening Cash</span><strong className="mono-num">{fmt(cashFlow.opening_cash_minor)}</strong></div>
            <div className="lc-strip-item"><span className="muted">Operating</span><strong className="mono-num">{fmt(cashFlow.operating_minor)}</strong></div>
            <div className="lc-strip-item"><span className="muted">Investing</span><strong className="mono-num">{fmt(cashFlow.investing_minor)}</strong></div>
            <div className="lc-strip-item"><span className="muted">Financing</span><strong className="mono-num">{fmt(cashFlow.financing_minor)}</strong></div>
            <div className="lc-strip-item"><span className="muted">Closing Cash</span><strong className="mono-num">{fmt(cashFlow.closing_cash_minor)}</strong></div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Activity</th>
                  <th>Counterparty / Category</th>
                  <th className="num-col">Cash Impact</th>
                </tr>
              </thead>
              <tbody>
                {cashFlow.items.map((item, idx) => (
                  <tr key={`${item.activity}-${idx}`}>
                    <td><StatusBadge tone="neutral">{item.activity}</StatusBadge></td>
                    <td>{item.label}</td>
                    <td className="num-col mono-num">{fmt(item.amount_minor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {view === 'trial-balance' && trialBalance && (
        <section className="lc-card">
          <header className="lc-card-head">
            <div>
              <h3 className="lc-card-title">Trial Balance</h3>
              <p className="lc-card-sub">As of {trialBalance.as_of_date}</p>
            </div>
            <StatusBadge tone={trialBalance.is_balanced ? 'success' : 'danger'}>
              {trialBalance.is_balanced ? 'Balanced' : 'Out of Balance'}
            </StatusBadge>
          </header>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Account</th>
                  <th className="num-col">Debits</th>
                  <th className="num-col">Credits</th>
                </tr>
              </thead>
              <tbody>
                {trialBalance.rows.map((r) => (
                  <tr key={r.account_id}>
                    <td className="mono">{r.code}</td>
                    <td>{r.name}</td>
                    <td className="num-col mono-num">{fmt(r.debit_total_minor)}</td>
                    <td className="num-col mono-num">{fmt(r.credit_total_minor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {view === 'party-ledger' && (
        <section className="lc-card">
          <header className="lc-card-head">
            <div>
              <h3 className="lc-card-title">Individual / Investor / Employee / Supplier Ledger (BR-017)</h3>
              <p className="lc-card-sub">Inspect every debit and credit linked to a specific person or counterparty.</p>
            </div>
          </header>
          <label style={{ maxWidth: '380px', marginBottom: '1rem' }}>
            Select Person or Counterparty
            <select value={selectedPartyId} onChange={(e) => void handleLoadPartyLedger(e.target.value)}>
              <option value="">Choose party…</option>
              {parties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name} ({p.party_type})
                </option>
              ))}
            </select>
          </label>

          {!partyLedger ? (
            <EmptyState
              title="Select a person or counterparty"
              description="Choose any supplier, customer, investor, employee, or manager to inspect their complete running ledger."
            />
          ) : (
            <>
              <div className="lc-position-strip" style={{ marginBottom: '1rem' }}>
                <div className="lc-strip-item"><span className="muted">Total Debits</span><strong className="mono-num">{fmt(partyLedger.total_debits_minor)}</strong></div>
                <div className="lc-strip-item"><span className="muted">Total Credits</span><strong className="mono-num">{fmt(partyLedger.total_credits_minor)}</strong></div>
                <div className="lc-strip-item"><span className="muted">Net Balance</span><strong className="mono-num">{fmt(partyLedger.net_balance_minor)}</strong></div>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Entry #</th>
                      <th>Date</th>
                      <th>Description</th>
                      <th>Side</th>
                      <th className="num-col">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {partyLedger.lines.map((l, idx) => (
                      <tr key={`${l.entry_id}-${idx}`}>
                        <td className="mono">{l.entry_no ? `#${l.entry_no}` : '—'}</td>
                        <td>{l.entry_date}</td>
                        <td>{l.description}</td>
                        <td><StatusBadge tone={l.side === 'debit' ? 'accent' : 'neutral'}>{l.side.toUpperCase()}</StatusBadge></td>
                        <td className="num-col mono-num">{fmt(l.amount_minor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}

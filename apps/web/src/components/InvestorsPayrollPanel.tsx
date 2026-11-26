import { useState, type FormEvent } from 'react';
import { PieChart, PiggyBank, Users } from 'lucide-react';
import {
  hasRolePermission,
  type AccountDto,
  type OrganizationDto,
  type PartyDto,
  type PeriodDto,
  type ProfitDistributionDto,
  type ProfitShareAgreementDto,
  type SalaryRunDto,
} from '@financial-saas/contracts';
import { formatMinorUnits, money, parseMajorUnits } from '@financial-saas/ledger-core';
import { apiClient } from '../apiClient.js';
import { EmptyState, StatusBadge, badgeToneForStatus } from './ui/DesignSystem.js';

interface InvestorsPayrollPanelProps {
  org: OrganizationDto;
  accounts: AccountDto[];
  parties: PartyDto[];
  periods: PeriodDto[];
  agreements: ProfitShareAgreementDto[];
  distributions: ProfitDistributionDto[];
  salaryRuns: SalaryRunDto[];
  onRefresh: () => Promise<void>;
  onError: (msg: string | null) => void;
  onNotify?: (title: string, detail?: string) => void;
}

type CapitalSubTab = 'investors' | 'profit_share' | 'payroll';

export function InvestorsPayrollPanel({
  org,
  accounts,
  parties,
  periods,
  agreements,
  distributions,
  salaryRuns,
  onRefresh,
  onError,
  onNotify,
}: InvestorsPayrollPanelProps) {
  const [subTab, setSubTab] = useState<CapitalSubTab>('investors');

  // Investor contribution
  const [invPartyId, setInvPartyId] = useState('');
  const [treatment, setTreatment] = useState<'equity' | 'loan'>('equity');
  const [grossAmt, setGrossAmt] = useState('');
  const [wireFee, setWireFee] = useState('0.00');
  const [bankAccId, setBankAccId] = useState('');
  const [capAccId, setCapAccId] = useState('');
  const [feeAccId, setFeeAccId] = useState('');

  // Profit sharing agreement
  const [agrName, setAgrName] = useState('');
  const [agrEffective, setAgrEffective] = useState(new Date().toISOString().slice(0, 10));
  const [partyAId, setPartyAId] = useState('');
  const [pctA, setPctA] = useState('50');
  const [partyBId, setPartyBId] = useState('');
  const [pctB, setPctB] = useState('50');

  // Run distribution
  const [distPeriodId, setDistPeriodId] = useState('');
  const [retEarnAccId, setRetEarnAccId] = useState('');
  const [duePartnerAccId, setDuePartnerAccId] = useState('');

  // Salary accrual
  const [salPartyId, setSalPartyId] = useState('');
  const [salAmt, setSalAmt] = useState('');
  const [salExpAccId, setSalExpAccId] = useState('');
  const [salPayAccId, setSalPayAccId] = useState('');

  const canPost = hasRolePermission(org.role, 'ledger:post');
  const canWritePs = hasRolePermission(org.role, 'profit_sharing:write');
  const canRunPs = hasRolePermission(org.role, 'profit_sharing:run');
  const closedPeriods = periods.filter((p) => p.status === 'closed');
  const investors = parties.filter((p) => p.party_type === 'investor' || p.party_type === 'owner');
  const staff = parties.filter((p) => p.party_type === 'employee' || p.party_type === 'manager');

  const partyName = (id: string) =>
    parties.find((p) => p.id === id)?.display_name ?? id.slice(0, 8);
  const periodLabel = (id: string) =>
    periods.find((p) => p.id === id)?.name ?? id.slice(0, 8);

  const agreementPctTotal = partyBId ? Number(pctA || 0) + Number(pctB || 0) : Number(pctA || 0);

  async function handleContribution(e: FormEvent) {
    e.preventDefault();
    onError(null);
    try {
      const gross = parseMajorUnits(grossAmt, org.base_currency);
      const fee = parseMajorUnits(wireFee || '0', org.base_currency);
      await apiClient.recordInvestorContribution(org.id, {
        party_id: invPartyId,
        treatment,
        contribution_date: new Date().toISOString().slice(0, 10),
        gross_amount_minor: gross.amountMinor.toString(),
        wire_fee_minor: fee.amountMinor.toString(),
        currency: org.base_currency,
        bank_account_id: bankAccId,
        capital_or_loan_account_id: capAccId,
        ...(fee.amountMinor > 0n && feeAccId ? { fee_account_id: feeAccId } : {}),
        description: `Investor ${treatment} contribution`,
      });
      setGrossAmt('');
      await onRefresh();
      onNotify?.('Contribution posted', `Recorded as ${treatment}`);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Contribution failed');
    }
  }

  async function handleCreateAgreement(e: FormEvent) {
    e.preventDefault();
    onError(null);
    try {
      const lines = [
        { party_id: partyAId, share_bps: Math.round(Number(pctA) * 100) },
        ...(partyBId ? [{ party_id: partyBId, share_bps: Math.round(Number(pctB) * 100) }] : []),
      ];
      await apiClient.createProfitShareAgreement(org.id, {
        name: agrName,
        effective_from: agrEffective,
        lines,
      });
      setAgrName('');
      await onRefresh();
      onNotify?.('Agreement saved', agrName);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Agreement failed');
    }
  }

  async function handleRunDistribution(e: FormEvent) {
    e.preventDefault();
    onError(null);
    try {
      await apiClient.runProfitDistribution(org.id, {
        period_id: distPeriodId,
        distribution_date: new Date().toISOString().slice(0, 10),
        retained_earnings_account_id: retEarnAccId,
        due_to_partner_account_id: duePartnerAccId,
      });
      await onRefresh();
      onNotify?.('Profit distribution posted', 'Allocated using largest-remainder method (BR-010)');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Distribution failed');
    }
  }

  async function handleAccrueSalary(e: FormEvent) {
    e.preventDefault();
    onError(null);
    try {
      const amt = parseMajorUnits(salAmt, org.base_currency);
      await apiClient.accrueSalary(org.id, {
        party_id: salPartyId,
        accrual_date: new Date().toISOString().slice(0, 10),
        amount_minor: amt.amountMinor.toString(),
        currency: org.base_currency,
        salary_expense_account_id: salExpAccId,
        salaries_payable_account_id: salPayAccId,
        description: 'Monthly salary accrual',
      });
      setSalAmt('');
      await onRefresh();
      onNotify?.('Salary accrued', 'Credited to Salaries Payable (BR-014)');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Salary accrual failed');
    }
  }

  return (
    <div className="lc-stack-lg">
      <section className="lc-card">
        <div className="lc-page-head">
          <div>
            <div className="lc-eyebrow">Ownership, Governance &amp; Compensation</div>
            <h1 className="lc-page-title">Investors, Profit Sharing &amp; Payroll</h1>
            <p className="muted" style={{ margin: '0.2rem 0 0' }}>
              Keep investor equity/loans segregated from revenue (`BR-007`), version profit-sharing rules (`BR-010`), and accrue payroll (`BR-014`).
            </p>
          </div>
        </div>

        <div className="lc-segmented" style={{ marginTop: '0.9rem' }} role="tablist" aria-label="Investors and Payroll module">
          <button
            type="button"
            className={`lc-seg-btn ${subTab === 'investors' ? 'active' : ''}`}
            onClick={() => setSubTab('investors')}
          >
            Investor Capital ({investors.length})
          </button>
          <button
            type="button"
            className={`lc-seg-btn ${subTab === 'profit_share' ? 'active' : ''}`}
            onClick={() => setSubTab('profit_share')}
          >
            Profit Distribution ({distributions.length})
          </button>
          <button
            type="button"
            className={`lc-seg-btn ${subTab === 'payroll' ? 'active' : ''}`}
            onClick={() => setSubTab('payroll')}
          >
            Salaries &amp; Payroll ({salaryRuns.length})
          </button>
        </div>
      </section>

      {subTab === 'investors' && (
        <div className="lc-stack-lg">
          <section className="lc-kpi-grid-3">
            {investors.length === 0 ? (
              <div className="lc-card" style={{ gridColumn: '1 / -1' }}>
                <EmptyState
                  icon={<PiggyBank size={20} />}
                  title="No investors or owners registered"
                  description="Add investors or owners in People & Parties to track shareholding percentages and capital contributions."
                />
              </div>
            ) : (
              investors.map((inv) => (
                <article key={inv.id} className="lc-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong>{inv.display_name}</strong>
                    <StatusBadge tone="accent">{inv.party_type}</StatusBadge>
                  </div>
                  <div style={{ fontSize: '1.35rem', fontWeight: 700, marginTop: '0.5rem' }} className="mono-num">
                    {(inv.shareholding_bps / 100).toFixed(2)}%
                  </div>
                  <div className="muted">Configured equity share</div>
                </article>
              ))
            )}
          </section>

          {canPost && (
            <section className="lc-card">
              <header className="lc-card-head">
                <div>
                  <h3 className="lc-card-title">Post Investor Contribution (BR-007 — Equity or Loan)</h3>
                  <p className="lc-card-sub">Supports optional wire fees and selects between Investor Capital (Equity) or Investor Loans (Liability).</p>
                </div>
              </header>
              <form className="lc-grid-form" onSubmit={handleContribution}>
                <label>
                  Investor
                  <select required value={invPartyId} onChange={(e) => setInvPartyId(e.target.value)}>
                    <option value="">Select investor…</option>
                    {parties.map((p) => (
                      <option key={p.id} value={p.id}>{p.display_name} ({p.party_type})</option>
                    ))}
                  </select>
                </label>
                <label>
                  Treatment (OQ-003)
                  <select value={treatment} onChange={(e) => setTreatment(e.target.value as 'equity' | 'loan')}>
                    <option value="equity">Equity (Investor Capital)</option>
                    <option value="loan">Loan (Investor Loans Liability)</option>
                  </select>
                </label>
                <label>
                  Gross Amount ({org.base_currency})
                  <input required value={grossAmt} onChange={(e) => setGrossAmt(e.target.value)} placeholder="10000.00" />
                </label>
                <label>
                  Wire Fee
                  <input value={wireFee} onChange={(e) => setWireFee(e.target.value)} />
                </label>
                <label>
                  Receiving Bank Account
                  <select required value={bankAccId} onChange={(e) => setBankAccId(e.target.value)}>
                    <option value="">Select bank…</option>
                    {accounts.filter((a) => a.account_type === 'asset').map((a) => (
                      <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Capital / Loan Account
                  <select required value={capAccId} onChange={(e) => setCapAccId(e.target.value)}>
                    <option value="">Select equity/loan…</option>
                    {accounts.filter((a) => a.account_type === 'equity' || a.account_type === 'liability').map((a) => (
                      <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Fee Expense Account (if fee &gt; 0)
                  <select value={feeAccId} onChange={(e) => setFeeAccId(e.target.value)}>
                    <option value="">Optional…</option>
                    {accounts.filter((a) => a.account_type === 'expense').map((a) => (
                      <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                    ))}
                  </select>
                </label>
                <div className="lc-form-action">
                  <button type="submit" className="btn">Post Contribution</button>
                </div>
              </form>
            </section>
          )}
        </div>
      )}

      {subTab === 'profit_share' && (
        <div className="lc-stack-lg">
          {canWritePs && (
            <section className="lc-card">
              <header className="lc-card-head">
                <div>
                  <h3 className="lc-card-title">Versioned Profit-Sharing Agreement (BR-010, BR-012)</h3>
                  <p className="lc-card-sub">Rules apply prospectively by effective date; past distributions are unaffected.</p>
                </div>
                <StatusBadge tone={Math.abs(agreementPctTotal - 100) < 0.01 ? 'success' : 'warning'}>
                  Total Allocation: {agreementPctTotal.toFixed(2)}%
                </StatusBadge>
              </header>
              <form className="lc-grid-form" onSubmit={handleCreateAgreement}>
                <label>
                  Agreement Name
                  <input required value={agrName} onChange={(e) => setAgrName(e.target.value)} placeholder="2026 Partner Agreement v1" />
                </label>
                <label>
                  Effective From
                  <input type="date" required value={agrEffective} onChange={(e) => setAgrEffective(e.target.value)} />
                </label>
                <label>
                  Partner A
                  <select required value={partyAId} onChange={(e) => setPartyAId(e.target.value)}>
                    <option value="">Select party…</option>
                    {parties.map((p) => (
                      <option key={p.id} value={p.id}>{p.display_name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Partner A %
                  <input required value={pctA} onChange={(e) => setPctA(e.target.value)} />
                </label>
                <label>
                  Partner B (Optional)
                  <select value={partyBId} onChange={(e) => setPartyBId(e.target.value)}>
                    <option value="">None (100% Partner A)</option>
                    {parties.map((p) => (
                      <option key={p.id} value={p.id}>{p.display_name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Partner B %
                  <input value={pctB} onChange={(e) => setPctB(e.target.value)} />
                </label>
                <div className="lc-form-action">
                  <button type="submit" className="btn">Save Agreement Version</button>
                </div>
              </form>
            </section>
          )}

          {canRunPs && (
            <section className="lc-card">
              <header className="lc-card-head">
                <div>
                  <h3 className="lc-card-title">Run Closed-Period Profit Distribution</h3>
                  <p className="lc-card-sub">Only closed periods are eligible (`BR-010`); minor-unit remainders are balanced deterministically (`OQ-027`).</p>
                </div>
              </header>
              <form className="lc-grid-form" onSubmit={handleRunDistribution}>
                <label>
                  Closed Period
                  <select required value={distPeriodId} onChange={(e) => setDistPeriodId(e.target.value)}>
                    <option value="">Select closed period…</option>
                    {closedPeriods.map((p) => (
                      <option key={p.id} value={p.id}>{p.name} ({p.start_date}..{p.end_date})</option>
                    ))}
                  </select>
                </label>
                <label>
                  Retained Earnings Account
                  <select required value={retEarnAccId} onChange={(e) => setRetEarnAccId(e.target.value)}>
                    <option value="">Select equity…</option>
                    {accounts.filter((a) => a.account_type === 'equity').map((a) => (
                      <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Due to Partner Account
                  <select required value={duePartnerAccId} onChange={(e) => setDuePartnerAccId(e.target.value)}>
                    <option value="">Select liability…</option>
                    {accounts.filter((a) => a.account_type === 'liability').map((a) => (
                      <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                    ))}
                  </select>
                </label>
                <div className="lc-form-action">
                  <button type="submit" className="btn">Run Profit Distribution</button>
                </div>
              </form>
            </section>
          )}

          <section className="lc-card">
            <header className="lc-card-head">
              <div>
                <h3 className="lc-card-title">Distribution History</h3>
                <p className="lc-card-sub">
                  Agreements saved: {agreements.length} · Closed distributions: {distributions.length}
                </p>
              </div>
            </header>
            {distributions.length === 0 ? (
              <EmptyState
                icon={<PieChart size={20} />}
                title="No profit distributions posted yet"
                description="Close an accounting period and run a profit distribution against a saved agreement."
              />
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Period</th>
                      <th className="num-col">Net Profit</th>
                      <th>Allocations</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {distributions.map((d) => (
                      <tr key={d.id}>
                        <td><strong>{periodLabel(d.period_id)}</strong></td>
                        <td className="num-col mono-num">{formatMinorUnits(money(d.net_profit_minor, d.currency))} {d.currency}</td>
                        <td>
                          <div className="lc-lines-stack">
                            {d.lines.map((l) => (
                              <div key={l.party_id} className="lc-line-pill">
                                <span>{partyName(l.party_id)}</span>
                                <span className="muted">{(l.share_bps / 100).toFixed(2)}%</span>
                                <strong className="mono-num">{formatMinorUnits(money(l.amount_minor, d.currency))}</strong>
                              </div>
                            ))}
                          </div>
                        </td>
                        <td><StatusBadge tone={badgeToneForStatus(d.status)}>{d.status}</StatusBadge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {subTab === 'payroll' && (
        <div className="lc-stack-lg">
          {canPost && (
            <section className="lc-card">
              <header className="lc-card-head">
                <div>
                  <h3 className="lc-card-title">Accrue Salary (BR-014 — Accrue Then Pay)</h3>
                  <p className="lc-card-sub">Recognizes salary expense immediately upon accrual before cash settlement.</p>
                </div>
              </header>
              <form className="lc-grid-form" onSubmit={handleAccrueSalary}>
                <label>
                  Employee / Manager
                  <select required value={salPartyId} onChange={(e) => setSalPartyId(e.target.value)}>
                    <option value="">Select person…</option>
                    {(staff.length > 0 ? staff : parties).map((p) => (
                      <option key={p.id} value={p.id}>{p.display_name} ({p.party_type})</option>
                    ))}
                  </select>
                </label>
                <label>
                  Amount ({org.base_currency})
                  <input required value={salAmt} onChange={(e) => setSalAmt(e.target.value)} placeholder="1500.00" />
                </label>
                <label>
                  Salary Expense Account
                  <select required value={salExpAccId} onChange={(e) => setSalExpAccId(e.target.value)}>
                    <option value="">Select expense…</option>
                    {accounts.filter((a) => a.account_type === 'expense').map((a) => (
                      <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Salaries Payable Account
                  <select required value={salPayAccId} onChange={(e) => setSalPayAccId(e.target.value)}>
                    <option value="">Select payable…</option>
                    {accounts.filter((a) => a.account_type === 'liability').map((a) => (
                      <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                    ))}
                  </select>
                </label>
                <div className="lc-form-action">
                  <button type="submit" className="btn">Accrue Salary</button>
                </div>
              </form>
            </section>
          )}

          <section className="lc-card">
            <header className="lc-card-head">
              <div>
                <h3 className="lc-card-title">Salary Runs</h3>
                <p className="lc-card-sub">{salaryRuns.length} payroll accrual(s)</p>
              </div>
            </header>
            {salaryRuns.length === 0 ? (
              <EmptyState
                icon={<Users size={20} />}
                title="No salary runs accrued yet"
                description="Accrue monthly compensation for employees or managers above."
              />
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Accrual Date</th>
                      <th>Employee / Manager</th>
                      <th className="num-col">Amount</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {salaryRuns.map((s) => (
                      <tr key={s.id}>
                        <td>{s.accrual_date}</td>
                        <td><strong>{partyName(s.party_id)}</strong></td>
                        <td className="num-col mono-num">{formatMinorUnits(money(s.amount_minor, s.currency))} {s.currency}</td>
                        <td><StatusBadge tone={badgeToneForStatus(s.status)}>{s.status}</StatusBadge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

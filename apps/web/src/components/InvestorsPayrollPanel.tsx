import { useState, type FormEvent } from 'react';
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
}

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
}: InvestorsPayrollPanelProps) {
  // Investor contribution
  const [invPartyId, setInvPartyId] = useState('');
  const [treatment, setTreatment] = useState<'equity' | 'loan'>('equity');
  const [grossAmt, setGrossAmt] = useState('');
  const [wireFee, setWireFee] = useState('0.00');
  const [bankAccId, setBankAccId] = useState('');
  const [capAccId, setCapAccId] = useState('');
  const [feeAccId, setFeeAccId] = useState('');

  // Profit sharing agreement (2-party quick builder summing to 100%)
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
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Salary accrual failed');
    }
  }

  return (
    <>
      {canPost && (
        <section className="card">
          <h2 style={{ marginTop: 0 }}>Investor Capital Contribution (BR-007 — Equity or Loan, Never Revenue)</h2>
          <form className="grid-3" onSubmit={handleContribution}>
            <label>
              Investor
              <select required value={invPartyId} onChange={(e) => setInvPartyId(e.target.value)}>
                <option value="">Select investor...</option>
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
                <option value="">Select bank...</option>
                {accounts.filter((a) => a.account_type === 'asset').map((a) => (
                  <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                ))}
              </select>
            </label>
            <label>
              Capital / Loan Account
              <select required value={capAccId} onChange={(e) => setCapAccId(e.target.value)}>
                <option value="">Select equity/loan...</option>
                {accounts.filter((a) => a.account_type === 'equity' || a.account_type === 'liability').map((a) => (
                  <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                ))}
              </select>
            </label>
            <label>
              Fee Expense Account (if fee &gt; 0)
              <select value={feeAccId} onChange={(e) => setFeeAccId(e.target.value)}>
                <option value="">Optional...</option>
                {accounts.filter((a) => a.account_type === 'expense').map((a) => (
                  <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                ))}
              </select>
            </label>
            <div style={{ alignSelf: 'end' }}>
              <button type="submit" className="btn">Post Contribution</button>
            </div>
          </form>
        </section>
      )}

      <section className="card">
        <h2 style={{ marginTop: 0 }}>Versioned Profit-Sharing Agreements & Distributions (BR-010, BR-012)</h2>
        {canWritePs && (
          <form className="grid-3" onSubmit={handleCreateAgreement} style={{ marginBottom: '1rem' }}>
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
                <option value="">Select party...</option>
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
            <div>
              <button type="submit" className="btn">Save Agreement Version</button>
            </div>
          </form>
        )}

        {canRunPs && (
          <form className="grid-3" onSubmit={handleRunDistribution} style={{ marginBottom: '1rem' }}>
            <label>
              Closed Period
              <select required value={distPeriodId} onChange={(e) => setDistPeriodId(e.target.value)}>
                <option value="">Select closed period...</option>
                {closedPeriods.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} ({p.start_date}..{p.end_date})</option>
                ))}
              </select>
            </label>
            <label>
              Retained Earnings Account
              <select required value={retEarnAccId} onChange={(e) => setRetEarnAccId(e.target.value)}>
                <option value="">Select equity...</option>
                {accounts.filter((a) => a.account_type === 'equity').map((a) => (
                  <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                ))}
              </select>
            </label>
            <label>
              Due to Partner Account
              <select required value={duePartnerAccId} onChange={(e) => setDuePartnerAccId(e.target.value)}>
                <option value="">Select liability...</option>
                {accounts.filter((a) => a.account_type === 'liability').map((a) => (
                  <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                ))}
              </select>
            </label>
            <div>
              <button type="submit" className="btn">Run Profit Distribution</button>
            </div>
          </form>
        )}

        <p className="muted">Agreements saved: {agreements.length} · Closed distributions: {distributions.length}</p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Period</th>
                <th>Net Profit</th>
                <th>Allocations</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {distributions.map((d) => (
                <tr key={d.id}>
                  <td className="mono">{d.period_id.slice(0, 8)}</td>
                  <td>{formatMinorUnits(money(d.net_profit_minor, d.currency))} {d.currency}</td>
                  <td>
                    {d.lines.map((l) => (
                      <div key={l.party_id} className="muted">
                        Party {l.party_id.slice(0, 8)}: {(l.share_bps / 100).toFixed(2)}% ={' '}
                        {formatMinorUnits(money(l.amount_minor, d.currency))}
                      </div>
                    ))}
                  </td>
                  <td><span className="badge">{d.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>Salaries & Compensation (BR-014 — Accrue Then Pay)</h2>
        {canPost && (
          <form className="grid-3" onSubmit={handleAccrueSalary} style={{ marginBottom: '1rem' }}>
            <label>
              Employee / Manager
              <select required value={salPartyId} onChange={(e) => setSalPartyId(e.target.value)}>
                <option value="">Select person...</option>
                {parties.map((p) => (
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
                <option value="">Select expense...</option>
                {accounts.filter((a) => a.account_type === 'expense').map((a) => (
                  <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                ))}
              </select>
            </label>
            <label>
              Salaries Payable Account
              <select required value={salPayAccId} onChange={(e) => setSalPayAccId(e.target.value)}>
                <option value="">Select payable...</option>
                {accounts.filter((a) => a.account_type === 'liability').map((a) => (
                  <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                ))}
              </select>
            </label>
            <div style={{ alignSelf: 'end' }}>
              <button type="submit" className="btn">Accrue Salary</button>
            </div>
          </form>
        )}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Party</th>
                <th>Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {salaryRuns.map((s) => (
                <tr key={s.id}>
                  <td>{s.accrual_date}</td>
                  <td className="mono">{s.party_id.slice(0, 8)}</td>
                  <td>{formatMinorUnits(money(s.amount_minor, s.currency))} {s.currency}</td>
                  <td><span className={`badge ${s.status === 'paid' ? 'badge-ok' : 'badge-warn'}`}>{s.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

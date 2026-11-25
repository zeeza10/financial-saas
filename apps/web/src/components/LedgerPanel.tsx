import { useState, type FormEvent } from 'react';
import {
  hasRolePermission,
  type AccountDto,
  type AccountOwnershipTypeDto,
  type AccountTypeDto,
  type JournalEntryDto,
  type OrganizationDto,
  type PeriodDto,
  type TrialBalanceReportDto,
} from '@financial-saas/contracts';
import { formatMinorUnits, money, parseMajorUnits } from '@financial-saas/ledger-core';
import { apiClient } from '../apiClient.js';

interface LedgerPanelProps {
  org: OrganizationDto;
  mode: 'coa' | 'journals' | 'periods';
  accounts: AccountDto[];
  entries: JournalEntryDto[];
  periods: PeriodDto[];
  trialBalance: TrialBalanceReportDto | null;
  onRefresh: () => Promise<void>;
  onError: (msg: string | null) => void;
}

export function LedgerPanel({
  org,
  mode,
  accounts,
  entries,
  periods,
  trialBalance,
  onRefresh,
  onError,
}: LedgerPanelProps) {
  // Create account
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [accountType, setAccountType] = useState<AccountTypeDto>('expense');
  const [ownershipType, setOwnershipType] = useState<AccountOwnershipTypeDto>('business');

  // Create journal draft (simple 2-line UI)
  const [entryDate, setEntryDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState('');
  const [debitAccountId, setDebitAccountId] = useState('');
  const [creditAccountId, setCreditAccountId] = useState('');
  const [amountDecimal, setAmountDecimal] = useState('');
  const [reverseTargetId, setReverseTargetId] = useState<string | null>(null);
  const [reverseReason, setReverseReason] = useState('');

  // Periods
  const [periodName, setPeriodName] = useState('');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [reopenTargetId, setReopenTargetId] = useState<string | null>(null);
  const [reopenReason, setReopenReason] = useState('');

  const canWriteAccounts = hasRolePermission(org.role, 'accounts:write');
  const canDraft = hasRolePermission(org.role, 'ledger:draft');
  const canPost = hasRolePermission(org.role, 'ledger:post');
  const canClose = hasRolePermission(org.role, 'period:close');
  const canReopen = hasRolePermission(org.role, 'period:reopen');

  async function handleSeedCoa() {
    onError(null);
    try {
      await apiClient.seedCoaTemplate(org.id);
      await onRefresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to seed Chart of Accounts');
    }
  }

  async function handleCreateAccount(e: FormEvent) {
    e.preventDefault();
    onError(null);
    try {
      await apiClient.createAccount(org.id, {
        code,
        name,
        account_type: accountType,
        ownership_type: ownershipType,
      });
      setCode('');
      setName('');
      await onRefresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to create account');
    }
  }

  async function handleCreateDraft(e: FormEvent) {
    e.preventDefault();
    onError(null);
    try {
      const parsed = parseMajorUnits(amountDecimal, org.base_currency);
      if (parsed.amountMinor <= 0n) {
        onError('Amount must be greater than zero');
        return;
      }
      const amtStr = parsed.amountMinor.toString();
      await apiClient.createJournalDraft(org.id, {
        entry_date: entryDate,
        description,
        kind: 'standard',
        source: 'manual',
        lines: [
          { account_id: debitAccountId, side: 'debit', amount_minor: amtStr, currency: org.base_currency },
          { account_id: creditAccountId, side: 'credit', amount_minor: amtStr, currency: org.base_currency },
        ],
      });
      setDescription('');
      setAmountDecimal('');
      await onRefresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to create journal draft');
    }
  }

  async function handlePost(entryId: string) {
    onError(null);
    try {
      await apiClient.postJournalEntry(org.id, entryId);
      await onRefresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to post entry');
    }
  }

  async function handleConfirmReverse(e: FormEvent) {
    e.preventDefault();
    if (!reverseTargetId) return;
    onError(null);
    try {
      await apiClient.reverseJournalEntry(org.id, reverseTargetId, reverseReason);
      setReverseTargetId(null);
      setReverseReason('');
      await onRefresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to reverse entry');
    }
  }

  async function handleCreatePeriod(e: FormEvent) {
    e.preventDefault();
    onError(null);
    try {
      await apiClient.createPeriod(org.id, {
        name: periodName,
        start_date: periodStart,
        end_date: periodEnd,
      });
      setPeriodName('');
      setPeriodStart('');
      setPeriodEnd('');
      await onRefresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to create period');
    }
  }

  async function handleClosePeriod(periodId: string) {
    onError(null);
    try {
      await apiClient.closePeriod(org.id, periodId);
      await onRefresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to close period');
    }
  }

  async function handleConfirmReopen(e: FormEvent) {
    e.preventDefault();
    if (!reopenTargetId) return;
    onError(null);
    try {
      await apiClient.reopenPeriod(org.id, reopenTargetId, reopenReason);
      setReopenTargetId(null);
      setReopenReason('');
      await onRefresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to reopen period');
    }
  }

  const accountLabel = (id: string) => {
    const a = accounts.find((acc) => acc.id === id);
    return a ? `${a.code} ${a.name}` : id;
  };

  if (mode === 'coa') {
    return (
      <>
        <section className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <div>
              <h2 style={{ margin: 0 }}>Chart of Accounts</h2>
              <p className="muted" style={{ margin: '0.25rem 0 0' }}>
                Personal accounts are tagged separately and excluded from company financial statements (BR-006).
              </p>
            </div>
            {canWriteAccounts && (
              <button type="button" className="btn" onClick={handleSeedCoa}>
                Seed Standard CoA Template
              </button>
            )}
          </div>
        </section>

        {canWriteAccounts && (
          <section className="card">
            <h3 style={{ marginTop: 0 }}>Add Account</h3>
            <form className="grid-3" onSubmit={handleCreateAccount}>
              <label>
                Code
                <input required value={code} onChange={(e) => setCode(e.target.value)} placeholder="5600" />
              </label>
              <label>
                Account name
                <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Warehouse Rent" />
              </label>
              <label>
                Type
                <select value={accountType} onChange={(e) => setAccountType(e.target.value as AccountTypeDto)}>
                  <option value="asset">Asset</option>
                  <option value="liability">Liability</option>
                  <option value="equity">Equity</option>
                  <option value="income">Income</option>
                  <option value="expense">Expense</option>
                </select>
              </label>
              <label>
                Ownership
                <select value={ownershipType} onChange={(e) => setOwnershipType(e.target.value as AccountOwnershipTypeDto)}>
                  <option value="business">Business</option>
                  <option value="personal">Personal (Excluded)</option>
                </select>
              </label>
              <div style={{ alignSelf: 'end' }}>
                <button type="submit" className="btn">Create Account</button>
              </div>
            </form>
          </section>
        )}

        <section className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Ownership</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => (
                  <tr key={a.id}>
                    <td className="mono">{a.code}</td>
                    <td>{a.name}</td>
                    <td>{a.account_type}</td>
                    <td>
                      <span className={`badge ${a.ownership_type === 'personal' ? 'badge-warn' : 'badge-ok'}`}>
                        {a.ownership_type}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </>
    );
  }

  if (mode === 'journals') {
    return (
      <>
        {canDraft && (
          <section className="card">
            <h2 style={{ marginTop: 0 }}>New Balanced Journal Draft</h2>
            <form className="grid-3" onSubmit={handleCreateDraft}>
              <label>
                Date
                <input type="date" required value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
              </label>
              <label>
                Description
                <input required value={description} onChange={(e) => setDescription(e.target.value)} placeholder="eBay order payout" />
              </label>
              <label>
                Amount ({org.base_currency})
                <input required value={amountDecimal} onChange={(e) => setAmountDecimal(e.target.value)} placeholder="100.00" />
              </label>
              <label>
                Debit Account
                <select required value={debitAccountId} onChange={(e) => setDebitAccountId(e.target.value)}>
                  <option value="">Select debit account...</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                  ))}
                </select>
              </label>
              <label>
                Credit Account
                <select required value={creditAccountId} onChange={(e) => setCreditAccountId(e.target.value)}>
                  <option value="">Select credit account...</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                  ))}
                </select>
              </label>
              <div style={{ alignSelf: 'end' }}>
                <button type="submit" className="btn">Save Draft</button>
              </div>
            </form>
          </section>
        )}

        {reverseTargetId && (
          <section className="card">
            <h3 style={{ marginTop: 0 }}>Reverse Posted Entry (BR-003)</h3>
            <form className="grid-3" onSubmit={handleConfirmReverse}>
              <label>
                Reversal reason
                <input
                  required
                  minLength={5}
                  value={reverseReason}
                  onChange={(e) => setReverseReason(e.target.value)}
                  placeholder="Wrong expense category"
                />
              </label>
              <div style={{ alignSelf: 'end', display: 'flex', gap: '0.5rem' }}>
                <button type="submit" className="btn">Confirm Reversal</button>
                <button type="button" className="btn btn-secondary" onClick={() => setReverseTargetId(null)}>
                  Cancel
                </button>
              </div>
            </form>
          </section>
        )}

        <section className="card">
          <h2 style={{ marginTop: 0 }}>General Ledger & Journal Entries</h2>
          <p className="muted">Posted entries receive gapless entry numbers and are strictly immutable.</p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Entry #</th>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Lines</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id}>
                    <td className="mono">{entry.entry_no ? `#${entry.entry_no}` : 'Draft'}</td>
                    <td>{entry.entry_date}</td>
                    <td>{entry.description}</td>
                    <td>
                      {entry.lines.map((l) => (
                        <div key={l.id} className="muted">
                          {l.side.toUpperCase()} {accountLabel(l.account_id)}:{' '}
                          {formatMinorUnits(money(l.amount_minor, l.currency))} {l.currency}
                        </div>
                      ))}
                    </td>
                    <td>
                      <span className={`badge ${entry.status === 'posted' ? 'badge-ok' : 'badge-warn'}`}>
                        {entry.status}
                      </span>
                    </td>
                    <td>
                      {entry.status === 'draft' && canPost && (
                        <button type="button" className="btn" onClick={() => handlePost(entry.id)}>
                          Post
                        </button>
                      )}
                      {entry.status === 'posted' && canPost && !entry.reverses_entry_id && (
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => setReverseTargetId(entry.id)}
                        >
                          Reverse
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </>
    );
  }

  return (
    <>
      {canClose && (
        <section className="card">
          <h2 style={{ marginTop: 0 }}>Accounting Periods</h2>
          <form className="grid-3" onSubmit={handleCreatePeriod}>
            <label>
              Period name
              <input required value={periodName} onChange={(e) => setPeriodName(e.target.value)} placeholder="Nov 2026" />
            </label>
            <label>
              Start date
              <input type="date" required value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
            </label>
            <label>
              End date
              <input type="date" required value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
            </label>
            <div>
              <button type="submit" className="btn">Open Period</button>
            </div>
          </form>
        </section>
      )}

      {reopenTargetId && (
        <section className="card">
          <h3 style={{ marginTop: 0 }}>Reopen Closed Period (Owner Only, BR-004)</h3>
          <form className="grid-3" onSubmit={handleConfirmReopen}>
            <label>
              Written audit reason (min 10 chars)
              <input
                required
                minLength={10}
                value={reopenReason}
                onChange={(e) => setReopenReason(e.target.value)}
                placeholder="Late bank fee adjustment approved by auditor"
              />
            </label>
            <div style={{ alignSelf: 'end', display: 'flex', gap: '0.5rem' }}>
              <button type="submit" className="btn">Confirm Reopen</button>
              <button type="button" className="btn btn-secondary" onClick={() => setReopenTargetId(null)}>
                Cancel
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Period</th>
                <th>Range</th>
                <th>Status</th>
                <th>TB Hash</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {periods.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>{p.start_date} to {p.end_date}</td>
                  <td>
                    <span className={`badge ${p.status === 'open' ? 'badge-ok' : 'badge-warn'}`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="mono">{p.tb_hash ? `${p.tb_hash.slice(0, 14)}...` : '—'}</td>
                  <td>
                    {p.status === 'open' && canClose && (
                      <button type="button" className="btn" onClick={() => handleClosePeriod(p.id)}>
                        Close Period
                      </button>
                    )}
                    {p.status === 'closed' && canReopen && (
                      <button type="button" className="btn btn-secondary" onClick={() => setReopenTargetId(p.id)}>
                        Reopen
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {trialBalance && (
        <section className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0 }}>Company Trial Balance (as of {trialBalance.as_of_date})</h2>
            <span className={`badge ${trialBalance.is_balanced ? 'badge-ok' : 'badge-warn'}`}>
              {trialBalance.is_balanced ? 'Balanced (Debits = Credits)' : 'UNBALANCED'}
            </span>
          </div>
          <p className="muted">Computed from posted business lines only (personal accounts excluded).</p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Account</th>
                  <th>Type</th>
                  <th>Debits</th>
                  <th>Credits</th>
                </tr>
              </thead>
              <tbody>
                {trialBalance.rows.map((r) => (
                  <tr key={r.account_id}>
                    <td className="mono">{r.code}</td>
                    <td>{r.name}</td>
                    <td>{r.account_type}</td>
                    <td>{formatMinorUnits(money(r.debit_total_minor, trialBalance.currency))}</td>
                    <td>{formatMinorUnits(money(r.credit_total_minor, trialBalance.currency))}</td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={3}><strong>Totals ({trialBalance.currency})</strong></td>
                  <td><strong>{formatMinorUnits(money(trialBalance.total_debits_minor, trialBalance.currency))}</strong></td>
                  <td><strong>{formatMinorUnits(money(trialBalance.total_credits_minor, trialBalance.currency))}</strong></td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}

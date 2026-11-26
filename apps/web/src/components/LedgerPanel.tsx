import { useMemo, useState, type FormEvent } from 'react';
import {
  BookOpen,
  CalendarClock,
  Layers,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
} from 'lucide-react';
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
import {
  ConfirmModal,
  EmptyState,
  StatusBadge,
  badgeToneForStatus,
} from './ui/DesignSystem.js';

interface LedgerPanelProps {
  org: OrganizationDto;
  mode: 'coa' | 'journals' | 'periods';
  accounts: AccountDto[];
  entries: JournalEntryDto[];
  periods: PeriodDto[];
  trialBalance: TrialBalanceReportDto | null;
  onRefresh: () => Promise<void>;
  onError: (msg: string | null) => void;
  onNotify?: (title: string, detail?: string) => void;
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
  onNotify,
}: LedgerPanelProps) {
  // CoA
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [coaSearch, setCoaSearch] = useState('');
  const [coaTypeFilter, setCoaTypeFilter] = useState<'all' | AccountTypeDto>('all');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [accountType, setAccountType] = useState<AccountTypeDto>('expense');
  const [ownershipType, setOwnershipType] = useState<AccountOwnershipTypeDto>('business');

  // Journal Drafts
  const [showDraftForm, setShowDraftForm] = useState(false);
  const [journalSearch, setJournalSearch] = useState('');
  const [journalStatus, setJournalStatus] = useState<'all' | 'posted' | 'draft'>('all');
  const [entryDate, setEntryDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState('');
  const [debitAccountId, setDebitAccountId] = useState('');
  const [creditAccountId, setCreditAccountId] = useState('');
  const [amountDecimal, setAmountDecimal] = useState('');
  const [reverseTargetId, setReverseTargetId] = useState<string | null>(null);
  const [reverseReason, setReverseReason] = useState('');

  // Periods
  const [showPeriodForm, setShowPeriodForm] = useState(false);
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

  const filteredAccounts = useMemo(() => {
    const q = coaSearch.trim().toLowerCase();
    return accounts.filter((a) => {
      if (coaTypeFilter !== 'all' && a.account_type !== coaTypeFilter) return false;
      if (!q) return true;
      return a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q);
    });
  }, [accounts, coaSearch, coaTypeFilter]);

  const filteredEntries = useMemo(() => {
    const q = journalSearch.trim().toLowerCase();
    return entries.filter((entry) => {
      if (journalStatus !== 'all' && entry.status !== journalStatus) return false;
      if (!q) return true;
      return (
        entry.description.toLowerCase().includes(q) ||
        (entry.entry_no ?? '').toLowerCase().includes(q) ||
        entry.entry_date.includes(q)
      );
    });
  }, [entries, journalSearch, journalStatus]);

  async function handleSeedCoa() {
    onError(null);
    try {
      await apiClient.seedCoaTemplate(org.id);
      await onRefresh();
      onNotify?.('Chart of Accounts seeded', 'Standard accounting template added');
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
      setShowAddAccount(false);
      await onRefresh();
      onNotify?.('Account created', `${code} ${name}`);
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
      setShowDraftForm(false);
      await onRefresh();
      onNotify?.('Journal draft saved', 'Review and post when ready');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to create journal draft');
    }
  }

  async function handlePost(entryId: string) {
    onError(null);
    try {
      await apiClient.postJournalEntry(org.id, entryId);
      await onRefresh();
      onNotify?.('Entry posted', 'Assigned gapless entry number');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to post entry');
    }
  }

  async function handleConfirmReverse() {
    if (!reverseTargetId) return;
    if (reverseReason.trim().length < 5) {
      onError('Reversal reason must be at least 5 characters');
      return;
    }
    onError(null);
    try {
      await apiClient.reverseJournalEntry(org.id, reverseTargetId, reverseReason.trim());
      setReverseTargetId(null);
      setReverseReason('');
      await onRefresh();
      onNotify?.('Reversal posted', 'Counter-entry created cleanly');
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
      setShowPeriodForm(false);
      await onRefresh();
      onNotify?.('Accounting period opened');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to create period');
    }
  }

  async function handleClosePeriod(periodId: string) {
    onError(null);
    try {
      await apiClient.closePeriod(org.id, periodId);
      await onRefresh();
      onNotify?.('Period closed & locked', 'Trial balance hash recorded');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to close period');
    }
  }

  async function handleConfirmReopen() {
    if (!reopenTargetId) return;
    if (reopenReason.trim().length < 10) {
      onError('Written audit reason must be at least 10 characters');
      return;
    }
    onError(null);
    try {
      await apiClient.reopenPeriod(org.id, reopenTargetId, reopenReason.trim());
      setReopenTargetId(null);
      setReopenReason('');
      await onRefresh();
      onNotify?.('Period reopened', 'Audit trail updated with reason');
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
      <div className="lc-stack-lg">
        <section className="lc-card">
          <div className="lc-page-head">
            <div>
              <div className="lc-eyebrow">Accounting Foundation · {org.base_currency}</div>
              <h1 className="lc-page-title">Chart of Accounts</h1>
              <p className="muted" style={{ margin: '0.2rem 0 0' }}>
                Personal accounts are isolated (`BR-006`) and never contaminate company P&amp;L or Balance Sheet.
              </p>
            </div>
            {canWriteAccounts && (
              <div className="lc-btn-group">
                <button type="button" className="btn btn-secondary" onClick={handleSeedCoa}>
                  <Sparkles size={15} /> Seed Standard CoA
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setShowAddAccount((v) => !v)}
                >
                  <Plus size={15} /> {showAddAccount ? 'Close Form' : 'New Account'}
                </button>
              </div>
            )}
          </div>

          {canWriteAccounts && showAddAccount && (
            <form className="lc-subpanel lc-grid-form" onSubmit={handleCreateAccount}>
              <label>
                Code
                <input required value={code} onChange={(e) => setCode(e.target.value)} placeholder="5600" />
              </label>
              <label>
                Account Name
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
              <div className="lc-form-action">
                <button type="submit" className="btn">Create Account</button>
              </div>
            </form>
          )}
        </section>

        <section className="lc-card">
          <div className="lc-toolbar">
            <div className="lc-segmented" role="tablist" aria-label="Account type filter">
              {(['all', 'asset', 'liability', 'equity', 'income', 'expense'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`lc-seg-btn ${coaTypeFilter === t ? 'active' : ''}`}
                  onClick={() => setCoaTypeFilter(t)}
                >
                  {t === 'all' ? `All (${accounts.length})` : t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
            <div className="lc-search-box">
              <Search size={15} aria-hidden="true" />
              <input
                type="search"
                aria-label="Search accounts"
                placeholder="Search code or account name…"
                value={coaSearch}
                onChange={(e) => setCoaSearch(e.target.value)}
              />
            </div>
          </div>

          {filteredAccounts.length === 0 ? (
            <EmptyState
              icon={<Layers size={20} />}
              title="No matching accounts"
              description="Seed the standard Chart of Accounts or adjust your filter criteria."
              {...(canWriteAccounts && accounts.length === 0
                ? { actionLabel: 'Seed Standard CoA', onAction: () => void handleSeedCoa() }
                : {})}
            />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Account Name</th>
                    <th>Classification</th>
                    <th>Ownership Scope</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAccounts.map((a) => (
                    <tr key={a.id}>
                      <td className="mono">{a.code}</td>
                      <td><strong>{a.name}</strong></td>
                      <td style={{ textTransform: 'capitalize' }}>{a.account_type}</td>
                      <td>
                        <StatusBadge tone={badgeToneForStatus(a.ownership_type)}>
                          {a.ownership_type === 'personal' ? 'Personal (Excluded)' : 'Business'}
                        </StatusBadge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    );
  }

  if (mode === 'journals') {
    return (
      <div className="lc-stack-lg">
        <section className="lc-card">
          <div className="lc-page-head">
            <div>
              <div className="lc-eyebrow">Immutable Double-Entry Ledger</div>
              <h1 className="lc-page-title">General Ledger &amp; Journal Entries</h1>
              <p className="muted" style={{ margin: '0.2rem 0 0' }}>
                Posted entries receive gapless per-organization numbers and can only be corrected by reversal (`BR-003`).
              </p>
            </div>
            {canDraft && (
              <button
                type="button"
                className="btn"
                onClick={() => setShowDraftForm((v) => !v)}
              >
                <Plus size={15} /> {showDraftForm ? 'Close Form' : 'New Journal Draft'}
              </button>
            )}
          </div>

          {canDraft && showDraftForm && (
            <form className="lc-subpanel lc-grid-form" onSubmit={handleCreateDraft}>
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
                  <option value="">Select debit account…</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                  ))}
                </select>
              </label>
              <label>
                Credit Account
                <select required value={creditAccountId} onChange={(e) => setCreditAccountId(e.target.value)}>
                  <option value="">Select credit account…</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                  ))}
                </select>
              </label>
              <div className="lc-form-action">
                <button type="submit" className="btn">Save Draft</button>
              </div>
            </form>
          )}
        </section>

        <section className="lc-card">
          <div className="lc-toolbar">
            <div className="lc-segmented" role="tablist" aria-label="Entry status filter">
              {(['all', 'posted', 'draft'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  className={`lc-seg-btn ${journalStatus === st ? 'active' : ''}`}
                  onClick={() => setJournalStatus(st)}
                >
                  {st === 'all' ? `All (${entries.length})` : st.charAt(0).toUpperCase() + st.slice(1)}
                </button>
              ))}
            </div>
            <div className="lc-search-box">
              <Search size={15} aria-hidden="true" />
              <input
                type="search"
                aria-label="Search journal entries"
                placeholder="Search #entry, description, or date…"
                value={journalSearch}
                onChange={(e) => setJournalSearch(e.target.value)}
              />
            </div>
          </div>

          {filteredEntries.length === 0 ? (
            <EmptyState
              icon={<BookOpen size={20} />}
              title="No journal entries found"
              description="Create a balanced draft or adjust your search filter."
              {...(canDraft
                ? { actionLabel: 'New Journal Draft', onAction: () => setShowDraftForm(true) }
                : {})}
            />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Entry #</th>
                    <th>Date</th>
                    <th>Description</th>
                    <th>Double-Entry Lines</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEntries.map((entry) => (
                    <tr key={entry.id}>
                      <td className="mono">{entry.entry_no ? `#${entry.entry_no}` : 'Draft'}</td>
                      <td>{entry.entry_date}</td>
                      <td><strong>{entry.description}</strong></td>
                      <td>
                        <div className="lc-lines-stack">
                          {entry.lines.map((l) => (
                            <div key={l.id} className="lc-line-pill">
                              <span className={`lc-side-tag ${l.side === 'debit' ? 'dr' : 'cr'}`}>
                                {l.side === 'debit' ? 'DR' : 'CR'}
                              </span>
                              <span>{accountLabel(l.account_id)}</span>
                              <strong className="mono-num">
                                {formatMinorUnits(money(l.amount_minor, l.currency))} {l.currency}
                              </strong>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td>
                        <StatusBadge tone={badgeToneForStatus(entry.status)}>{entry.status}</StatusBadge>
                      </td>
                      <td>
                        {entry.status === 'draft' && canPost && (
                          <button type="button" className="btn btn-sm" onClick={() => handlePost(entry.id)}>
                            Post
                          </button>
                        )}
                        {entry.status === 'posted' && canPost && !entry.reverses_entry_id && (
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => setReverseTargetId(entry.id)}
                          >
                            <RotateCcw size={13} /> Reverse
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <ConfirmModal
          open={reverseTargetId !== null}
          title="Reverse Posted Journal Entry (BR-003)"
          description="Posted entries are immutable. Confirming will post a balancing opposite counter-entry."
          confirmLabel="Post Reversal"
          onConfirm={() => void handleConfirmReverse()}
          onCancel={() => {
            setReverseTargetId(null);
            setReverseReason('');
          }}
        >
          <label style={{ marginTop: '0.75rem' }}>
            Audit reason (min 5 characters)
            <input
              required
              minLength={5}
              value={reverseReason}
              onChange={(e) => setReverseReason(e.target.value)}
              placeholder="e.g. Duplicate fee categorization"
            />
          </label>
        </ConfirmModal>
      </div>
    );
  }

  return (
    <div className="lc-stack-lg">
      <section className="lc-card">
        <div className="lc-page-head">
          <div>
            <div className="lc-eyebrow">Fiscal Governance &amp; Closing</div>
            <h1 className="lc-page-title">Accounting Periods &amp; Trial Balance</h1>
            <p className="muted" style={{ margin: '0.2rem 0 0' }}>
              Closing a period locks postings inside the date range and stamps a deterministic Trial Balance hash (`BR-004`).
            </p>
          </div>
          {canClose && (
            <button type="button" className="btn" onClick={() => setShowPeriodForm((v) => !v)}>
              <Plus size={15} /> {showPeriodForm ? 'Close Form' : 'Open New Period'}
            </button>
          )}
        </div>

        {canClose && showPeriodForm && (
          <form className="lc-subpanel lc-grid-form" onSubmit={handleCreatePeriod}>
            <label>
              Period Name
              <input required value={periodName} onChange={(e) => setPeriodName(e.target.value)} placeholder="Dec 2026" />
            </label>
            <label>
              Start Date
              <input type="date" required value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
            </label>
            <label>
              End Date
              <input type="date" required value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
            </label>
            <div className="lc-form-action">
              <button type="submit" className="btn">Open Period</button>
            </div>
          </form>
        )}
      </section>

      <section className="lc-card">
        <header className="lc-card-head">
          <div>
            <h3 className="lc-card-title">Fiscal Periods</h3>
            <p className="lc-card-sub">{periods.length} configured period(s)</p>
          </div>
        </header>
        {periods.length === 0 ? (
          <EmptyState
            icon={<CalendarClock size={20} />}
            title="No accounting periods defined"
            description="Create a period to track open/closed posting windows."
          />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Period</th>
                  <th>Date Range</th>
                  <th>Status</th>
                  <th>Trial Balance Hash</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {periods.map((p) => (
                  <tr key={p.id}>
                    <td><strong>{p.name}</strong></td>
                    <td className="mono">{p.start_date} → {p.end_date}</td>
                    <td>
                      <StatusBadge tone={badgeToneForStatus(p.status)}>{p.status}</StatusBadge>
                    </td>
                    <td className="mono">{p.tb_hash ? `${p.tb_hash.slice(0, 16)}…` : '—'}</td>
                    <td>
                      {p.status === 'open' && canClose && (
                        <button type="button" className="btn btn-sm" onClick={() => handleClosePeriod(p.id)}>
                          Close Period
                        </button>
                      )}
                      {p.status === 'closed' && canReopen && (
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setReopenTargetId(p.id)}>
                          Reopen
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {trialBalance && (
        <section className="lc-card">
          <header className="lc-card-head">
            <div>
              <h3 className="lc-card-title">Company Trial Balance (as of {trialBalance.as_of_date})</h3>
              <p className="lc-card-sub">Computed strictly from posted business ledger lines (personal accounts excluded).</p>
            </div>
            <StatusBadge tone={trialBalance.is_balanced ? 'success' : 'danger'}>
              {trialBalance.is_balanced ? 'Balanced (Debits = Credits)' : 'UNBALANCED'}
            </StatusBadge>
          </header>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Account</th>
                  <th>Type</th>
                  <th className="num-col">Debits</th>
                  <th className="num-col">Credits</th>
                </tr>
              </thead>
              <tbody>
                {trialBalance.rows.map((r) => (
                  <tr key={r.account_id}>
                    <td className="mono">{r.code}</td>
                    <td>{r.name}</td>
                    <td style={{ textTransform: 'capitalize' }}>{r.account_type}</td>
                    <td className="num-col mono-num">
                      {formatMinorUnits(money(r.debit_total_minor, trialBalance.currency))}
                    </td>
                    <td className="num-col mono-num">
                      {formatMinorUnits(money(r.credit_total_minor, trialBalance.currency))}
                    </td>
                  </tr>
                ))}
                <tr className="lc-total-row">
                  <td colSpan={3}><strong>Totals ({trialBalance.currency})</strong></td>
                  <td className="num-col mono-num">
                    <strong>{formatMinorUnits(money(trialBalance.total_debits_minor, trialBalance.currency))}</strong>
                  </td>
                  <td className="num-col mono-num">
                    <strong>{formatMinorUnits(money(trialBalance.total_credits_minor, trialBalance.currency))}</strong>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      )}

      <ConfirmModal
        open={reopenTargetId !== null}
        title="Reopen Closed Period (Owner Only, BR-004)"
        description="Reopening a closed period is logged permanently in the immutable audit chain."
        confirmLabel="Confirm Reopen"
        onConfirm={() => void handleConfirmReopen()}
        onCancel={() => {
          setReopenTargetId(null);
          setReopenReason('');
        }}
      >
        <label style={{ marginTop: '0.75rem' }}>
          Written audit reason (min 10 characters)
          <input
            required
            minLength={10}
            value={reopenReason}
            onChange={(e) => setReopenReason(e.target.value)}
            placeholder="Late bank fee adjustment approved by auditor"
          />
        </label>
      </ConfirmModal>
    </div>
  );
}

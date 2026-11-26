import { useMemo, useState, type FormEvent } from 'react';
import {
  ArrowLeftRight,
  CheckSquare,
  Landmark,
  Plus,
  Search,
  Upload,
} from 'lucide-react';
import {
  hasRolePermission,
  type AccountDto,
  type AccountOwnershipTypeDto,
  type BankAccountDto,
  type BankTransactionDto,
  type JournalEntryDto,
  type OrganizationDto,
  type ReconciliationDto,
} from '@financial-saas/contracts';
import { formatMinorUnits, money, parseMajorUnits } from '@financial-saas/ledger-core';
import { apiClient } from '../apiClient.js';
import { EmptyState, StatusBadge, badgeToneForStatus } from './ui/DesignSystem.js';

interface BankingPanelProps {
  org: OrganizationDto;
  accounts: AccountDto[];
  bankAccounts: BankAccountDto[];
  transactions: BankTransactionDto[];
  entries: JournalEntryDto[];
  reconciliations: ReconciliationDto[];
  onRefresh: () => Promise<void>;
  onError: (msg: string | null) => void;
  onNotify?: (title: string, detail?: string) => void;
}

type BankActionMode = 'none' | 'add_account' | 'transfer' | 'csv' | 'reconcile';

export function BankingPanel({
  org,
  accounts,
  bankAccounts,
  transactions,
  entries,
  reconciliations,
  onRefresh,
  onError,
  onNotify,
}: BankingPanelProps) {
  const [actionMode, setActionMode] = useState<BankActionMode>('none');
  const [txSearch, setTxSearch] = useState('');

  // Bank account form
  const [linkedAccountId, setLinkedAccountId] = useState('');
  const [institution, setInstitution] = useState('');
  const [last4, setLast4] = useState('');
  const [ownershipType, setOwnershipType] = useState<AccountOwnershipTypeDto>('business');
  const [openingDecimal, setOpeningDecimal] = useState('0.00');

  // Transfer form
  const [fromAccountId, setFromAccountId] = useState('');
  const [toAccountId, setToAccountId] = useState('');
  const [transferDecimal, setTransferDecimal] = useState('');
  const [feeDecimal, setFeeDecimal] = useState('0.00');
  const [feeAccountId, setFeeAccountId] = useState('');
  const [transferDate, setTransferDate] = useState(new Date().toISOString().slice(0, 10));

  // CSV Import
  const [importBankId, setImportBankId] = useState('');
  const [csvText, setCsvText] = useState(
    'date,description,amount,external_id\n2026-11-26,eBay Payout,87.00,ebay-001'
  );
  const [importSummary, setImportSummary] = useState<string | null>(null);
  const [postOffsetByTx, setPostOffsetByTx] = useState<Record<string, string>>({});

  // Reconciliation
  const [recBankId, setRecBankId] = useState('');
  const [recDate, setRecDate] = useState(new Date().toISOString().slice(0, 10));
  const [recEndingDecimal, setRecEndingDecimal] = useState('0.00');
  const [matchEntryByTx, setMatchEntryByTx] = useState<Record<string, string>>({});

  const canWriteBank = hasRolePermission(org.role, 'banking:write');
  const canPost = hasRolePermission(org.role, 'ledger:post');
  const canImport = hasRolePermission(org.role, 'transactions:import');

  const assetAccounts = accounts.filter((a) => a.account_type === 'asset');
  const expenseAccounts = accounts.filter((a) => a.account_type === 'expense');
  const postedEntries = entries.filter((e) => e.status === 'posted');

  const filteredTransactions = useMemo(() => {
    const q = txSearch.trim().toLowerCase();
    if (!q) return transactions;
    return transactions.filter(
      (tx) =>
        tx.description.toLowerCase().includes(q) ||
        tx.tx_date.includes(q) ||
        tx.status.toLowerCase().includes(q)
    );
  }, [transactions, txSearch]);

  async function handleCreateBankAccount(e: FormEvent) {
    e.preventDefault();
    onError(null);
    try {
      const opening = parseMajorUnits(openingDecimal, org.base_currency);
      await apiClient.createBankAccount(org.id, {
        account_id: linkedAccountId,
        institution,
        last4,
        ownership_type: ownershipType,
        opening_balance_minor: opening.amountMinor.toString(),
        currency: org.base_currency,
      });
      setInstitution('');
      setLast4('');
      setActionMode('none');
      await onRefresh();
      onNotify?.('Bank account added', institution);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to add bank account');
    }
  }

  async function handleTransfer(e: FormEvent) {
    e.preventDefault();
    onError(null);
    try {
      const amt = parseMajorUnits(transferDecimal, org.base_currency);
      const fee = parseMajorUnits(feeDecimal || '0', org.base_currency);
      await apiClient.createTransfer(org.id, {
        from_account_id: fromAccountId,
        to_account_id: toAccountId,
        amount_minor: amt.amountMinor.toString(),
        fee_amount_minor: fee.amountMinor.toString(),
        ...(fee.amountMinor > 0n && feeAccountId ? { fee_account_id: feeAccountId } : {}),
        currency: org.base_currency,
        transfer_date: transferDate,
        description: 'Internal transfer',
      });
      setTransferDecimal('');
      setActionMode('none');
      await onRefresh();
      onNotify?.('Internal transfer posted', 'Recorded without distorting P&L (BR-005)');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Transfer failed');
    }
  }

  async function handleImportCsv(e: FormEvent) {
    e.preventDefault();
    onError(null);
    setImportSummary(null);
    try {
      const res = await apiClient.importCsv(org.id, {
        bank_account_id: importBankId,
        source: 'csv_import',
        csv_text: csvText,
      });
      const msg = `Imported ${res.imported} row(s); ${res.duplicate_held} held as duplicate.`;
      setImportSummary(msg);
      await onRefresh();
      onNotify?.('CSV import finished', msg);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'CSV import failed');
    }
  }

  async function handlePostBankTx(txId: string) {
    const offsetId = postOffsetByTx[txId];
    if (!offsetId) {
      onError('Select an offset category account first');
      return;
    }
    onError(null);
    try {
      await apiClient.postBankTransaction(org.id, txId, {
        offset_account_id: offsetId,
        ownership_classification: 'business',
        kind: 'standard',
      });
      await onRefresh();
      onNotify?.('Transaction posted to ledger');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to post bank transaction');
    }
  }

  async function handleStartRec(e: FormEvent) {
    e.preventDefault();
    onError(null);
    try {
      const endBal = parseMajorUnits(recEndingDecimal, org.base_currency);
      await apiClient.startReconciliation(org.id, {
        bank_account_id: recBankId,
        statement_date: recDate,
        statement_ending_balance_minor: endBal.amountMinor.toString(),
      });
      setActionMode('none');
      await onRefresh();
      onNotify?.('Reconciliation session started');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to start reconciliation');
    }
  }

  const toggleMode = (next: BankActionMode) =>
    setActionMode((prev) => (prev === next ? 'none' : next));

  return (
    <div className="lc-stack-lg">
      <section className="lc-card">
        <div className="lc-page-head">
          <div>
            <div className="lc-eyebrow">Treasury &amp; Cash Control</div>
            <h1 className="lc-page-title">Banking, Transfers &amp; Reconciliation</h1>
            <p className="muted" style={{ margin: '0.2rem 0 0' }}>
              Manage business &amp; personal bank accounts, execute internal transfers (`BR-005`), import CSV statements (`BR-013`), and lock reconciliations (`BR-020`).
            </p>
          </div>
          <div className="lc-btn-group">
            {canWriteBank && (
              <button type="button" className="btn" onClick={() => toggleMode('add_account')}>
                <Plus size={15} /> Add Bank Account
              </button>
            )}
            {canPost && (
              <button type="button" className="btn btn-secondary" onClick={() => toggleMode('transfer')}>
                <ArrowLeftRight size={15} /> Transfer
              </button>
            )}
            {canImport && (
              <button type="button" className="btn btn-secondary" onClick={() => toggleMode('csv')}>
                <Upload size={15} /> Import CSV
              </button>
            )}
            {canWriteBank && (
              <button type="button" className="btn btn-secondary" onClick={() => toggleMode('reconcile')}>
                <CheckSquare size={15} /> Reconcile
              </button>
            )}
          </div>
        </div>

        {canWriteBank && actionMode === 'add_account' && (
          <form className="lc-subpanel lc-grid-form" onSubmit={handleCreateBankAccount}>
            <label>
              Ledger Asset Account
              <select required value={linkedAccountId} onChange={(e) => setLinkedAccountId(e.target.value)}>
                <option value="">Select asset account…</option>
                {assetAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} — {a.name} ({a.ownership_type})
                  </option>
                ))}
              </select>
            </label>
            <label>
              Institution
              <input required value={institution} onChange={(e) => setInstitution(e.target.value)} placeholder="Mercury Bank" />
            </label>
            <label>
              Last 4 Digits
              <input required pattern="\d{4}" maxLength={4} value={last4} onChange={(e) => setLast4(e.target.value)} placeholder="4821" />
            </label>
            <label>
              Ownership
              <select value={ownershipType} onChange={(e) => setOwnershipType(e.target.value as AccountOwnershipTypeDto)}>
                <option value="business">Business</option>
                <option value="personal">Personal</option>
              </select>
            </label>
            <label>
              Opening Balance ({org.base_currency})
              <input required value={openingDecimal} onChange={(e) => setOpeningDecimal(e.target.value)} />
            </label>
            <div className="lc-form-action">
              <button type="submit" className="btn">Save Bank Account</button>
            </div>
          </form>
        )}

        {canPost && actionMode === 'transfer' && (
          <form className="lc-subpanel lc-grid-form" onSubmit={handleTransfer}>
            <label>
              From Account
              <select required value={fromAccountId} onChange={(e) => setFromAccountId(e.target.value)}>
                <option value="">Select source…</option>
                {assetAccounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                ))}
              </select>
            </label>
            <label>
              To Account
              <select required value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}>
                <option value="">Select destination…</option>
                {assetAccounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                ))}
              </select>
            </label>
            <label>
              Transfer Amount ({org.base_currency})
              <input required value={transferDecimal} onChange={(e) => setTransferDecimal(e.target.value)} placeholder="2000.00" />
            </label>
            <label>
              Optional Wire Fee
              <input value={feeDecimal} onChange={(e) => setFeeDecimal(e.target.value)} placeholder="0.00" />
            </label>
            <label>
              Fee Expense Account
              <select value={feeAccountId} onChange={(e) => setFeeAccountId(e.target.value)}>
                <option value="">None / Select expense…</option>
                {expenseAccounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                ))}
              </select>
            </label>
            <label>
              Date
              <input type="date" required value={transferDate} onChange={(e) => setTransferDate(e.target.value)} />
            </label>
            <div className="lc-form-action">
              <button type="submit" className="btn">Post Transfer</button>
            </div>
          </form>
        )}

        {canImport && actionMode === 'csv' && (
          <form className="lc-subpanel form-grid" onSubmit={handleImportCsv}>
            {importSummary && <StatusBadge tone="success">{importSummary}</StatusBadge>}
            <label>
              Target Bank Account
              <select required value={importBankId} onChange={(e) => setImportBankId(e.target.value)}>
                <option value="">Select bank account…</option>
                {bankAccounts.map((b) => (
                  <option key={b.id} value={b.id}>{b.institution} (•••• {b.last4})</option>
                ))}
              </select>
            </label>
            <label>
              CSV Statement Rows (date,description,amount,external_id)
              <textarea
                rows={4}
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
              />
            </label>
            <div>
              <button type="submit" className="btn">Run Duplicate-Protected CSV Import</button>
            </div>
          </form>
        )}

        {canWriteBank && actionMode === 'reconcile' && (
          <form className="lc-subpanel lc-grid-form" onSubmit={handleStartRec}>
            <label>
              Bank Account
              <select required value={recBankId} onChange={(e) => setRecBankId(e.target.value)}>
                <option value="">Select bank account…</option>
                {bankAccounts.map((b) => (
                  <option key={b.id} value={b.id}>{b.institution} (•••• {b.last4})</option>
                ))}
              </select>
            </label>
            <label>
              Statement Date
              <input type="date" required value={recDate} onChange={(e) => setRecDate(e.target.value)} />
            </label>
            <label>
              Statement Ending Balance ({org.base_currency})
              <input required value={recEndingDecimal} onChange={(e) => setRecEndingDecimal(e.target.value)} />
            </label>
            <div className="lc-form-action">
              <button type="submit" className="btn">Start Reconciliation</button>
            </div>
          </form>
        )}
      </section>

      {/* Bank Account Summary Cards */}
      <section className="lc-kpi-grid-3">
        {bankAccounts.length === 0 ? (
          <div className="lc-card" style={{ gridColumn: '1 / -1' }}>
            <EmptyState
              icon={<Landmark size={20} />}
              title="No bank or cash accounts linked"
              description="Link a bank account to your Chart of Accounts to import CSV statements and track balances."
              {...(canWriteBank
                ? { actionLabel: 'Add Bank Account', onAction: () => setActionMode('add_account') }
                : {})}
            />
          </div>
        ) : (
          bankAccounts.map((b) => (
            <article key={b.id} className="lc-card lc-bank-card">
              <div className="lc-bank-top">
                <div>
                  <div className="lc-bank-name">{b.institution}</div>
                  <div className="mono muted">•••• {b.last4}</div>
                </div>
                <StatusBadge tone={badgeToneForStatus(b.ownership_type)}>{b.ownership_type}</StatusBadge>
              </div>
              <div className="lc-bank-bal mono-num">
                {formatMinorUnits(money(b.current_balance_minor, b.currency))} {b.currency}
              </div>
              <div className="muted">
                Opening: {formatMinorUnits(money(b.opening_balance_minor, b.currency))} {b.currency}
              </div>
            </article>
          ))
        )}
      </section>

      {/* Bank Transactions */}
      <section className="lc-card">
        <div className="lc-toolbar">
          <div>
            <h3 className="lc-card-title">Imported &amp; Recorded Bank Transactions</h3>
            <p className="lc-card-sub">{transactions.length} row(s)</p>
          </div>
          <div className="lc-search-box">
            <Search size={15} aria-hidden="true" />
            <input
              type="search"
              aria-label="Search bank transactions"
              placeholder="Search description, date, or status…"
              value={txSearch}
              onChange={(e) => setTxSearch(e.target.value)}
            />
          </div>
        </div>

        {filteredTransactions.length === 0 ? (
          <EmptyState
            icon={<Upload size={20} />}
            title="No bank transactions yet"
            description="Import a CSV bank statement above to classify, deduplicate, and post entries to the ledger."
          />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th className="num-col">Amount</th>
                  <th>Status</th>
                  <th>Post to Ledger</th>
                </tr>
              </thead>
              <tbody>
                {filteredTransactions.map((tx) => (
                  <tr key={tx.id}>
                    <td>{tx.tx_date}</td>
                    <td><strong>{tx.description}</strong></td>
                    <td className="num-col mono-num">
                      {formatMinorUnits(money(tx.amount_minor, tx.currency))} {tx.currency}
                    </td>
                    <td>
                      <StatusBadge tone={badgeToneForStatus(tx.status)}>{tx.status}</StatusBadge>
                    </td>
                    <td>
                      {tx.status === 'ready' && canPost ? (
                        <div className="lc-inline-action">
                          <select
                            aria-label="Category account"
                            value={postOffsetByTx[tx.id] ?? ''}
                            onChange={(e) =>
                              setPostOffsetByTx((prev) => ({ ...prev, [tx.id]: e.target.value }))
                            }
                          >
                            <option value="">Category…</option>
                            {accounts.map((a) => (
                              <option key={a.id} value={a.id}>{a.code} {a.name}</option>
                            ))}
                          </select>
                          <button type="button" className="btn btn-sm" onClick={() => handlePostBankTx(tx.id)}>
                            Post
                          </button>
                        </div>
                      ) : (
                        <span className="muted">{tx.linked_entry_id ? 'Linked' : '—'}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {reconciliations.length > 0 && (
        <section className="lc-card">
          <header className="lc-card-head">
            <div>
              <h3 className="lc-card-title">Reconciliations (BR-020)</h3>
              <p className="lc-card-sub">Match cleared bank rows to posted journal entries</p>
            </div>
          </header>
          <div className="lc-stack-md">
            {reconciliations.map((rec) => (
              <div key={rec.id} className="lc-subpanel">
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <strong>Statement {rec.statement_date}</strong>
                  <StatusBadge tone={badgeToneForStatus(rec.status)}>
                    {rec.status} · Diff: {formatMinorUnits(money(rec.difference_minor, org.base_currency))} {org.base_currency}
                  </StatusBadge>
                </div>
                {rec.status === 'in_progress' && canWriteBank && (
                  <div className="lc-stack-sm" style={{ marginTop: '0.75rem' }}>
                    {transactions
                      .filter((t) => t.bank_account_id === rec.bank_account_id && t.status === 'posted')
                      .map((t) => (
                        <div key={t.id} className="lc-inline-action">
                          <span>
                            {t.tx_date} — {t.description} ({formatMinorUnits(money(t.amount_minor, t.currency))})
                          </span>
                          <select
                            value={matchEntryByTx[t.id] ?? (t.linked_entry_id ?? '')}
                            onChange={(e) =>
                              setMatchEntryByTx((prev) => ({ ...prev, [t.id]: e.target.value }))
                            }
                          >
                            <option value="">Select posted entry…</option>
                            {postedEntries.map((e) => (
                              <option key={e.id} value={e.id}>
                                #{e.entry_no} — {e.description}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => {
                              const entryId = matchEntryByTx[t.id] ?? t.linked_entry_id;
                              if (!entryId) return;
                              void apiClient
                                .matchReconciliation(org.id, rec.id, {
                                  bank_transaction_id: t.id,
                                  journal_entry_id: entryId,
                                })
                                .then(onRefresh)
                                .catch((err) => onError(err.message));
                            }}
                          >
                            Match
                          </button>
                        </div>
                      ))}
                    <div>
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => {
                          void apiClient
                            .completeReconciliation(org.id, rec.id)
                            .then(() => {
                              onNotify?.('Reconciliation locked');
                              return onRefresh();
                            })
                            .catch((err) => onError(err.message));
                        }}
                      >
                        Complete &amp; Lock Reconciliation
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

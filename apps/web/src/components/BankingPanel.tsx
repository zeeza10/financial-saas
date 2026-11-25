import { useState, type FormEvent } from 'react';
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

interface BankingPanelProps {
  org: OrganizationDto;
  accounts: AccountDto[];
  bankAccounts: BankAccountDto[];
  transactions: BankTransactionDto[];
  entries: JournalEntryDto[];
  reconciliations: ReconciliationDto[];
  onRefresh: () => Promise<void>;
  onError: (msg: string | null) => void;
}

export function BankingPanel({
  org,
  accounts,
  bankAccounts,
  transactions,
  entries,
  reconciliations,
  onRefresh,
  onError,
}: BankingPanelProps) {
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
  const [csvText, setCsvText] = useState('date,description,amount,external_id\n2026-11-26,eBay Payout,87.00,ebay-001');
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
      await onRefresh();
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
      await onRefresh();
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
      setImportSummary(`Imported ${res.imported} row(s); ${res.duplicate_held} held as duplicate.`);
      await onRefresh();
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
      await onRefresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to start reconciliation');
    }
  }

  return (
    <>
      <section className="card">
        <h2 style={{ marginTop: 0 }}>Bank & Cash Accounts</h2>
        {canWriteBank && (
          <form className="grid-3" onSubmit={handleCreateBankAccount} style={{ marginBottom: '1rem' }}>
            <label>
              Ledger Asset Account
              <select required value={linkedAccountId} onChange={(e) => setLinkedAccountId(e.target.value)}>
                <option value="">Select asset account...</option>
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
              Last 4 digits only
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
            <div style={{ alignSelf: 'end' }}>
              <button type="submit" className="btn">Add Bank Account</button>
            </div>
          </form>
        )}

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Institution</th>
                <th>Last 4</th>
                <th>Ownership</th>
                <th>Current Balance</th>
              </tr>
            </thead>
            <tbody>
              {bankAccounts.map((b) => (
                <tr key={b.id}>
                  <td>{b.institution}</td>
                  <td className="mono">•••• {b.last4}</td>
                  <td>
                    <span className={`badge ${b.ownership_type === 'personal' ? 'badge-warn' : 'badge-ok'}`}>
                      {b.ownership_type}
                    </span>
                  </td>
                  <td>{formatMinorUnits(money(b.current_balance_minor, b.currency))} {b.currency}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {canPost && (
        <section className="card">
          <h2 style={{ marginTop: 0 }}>Internal Transfer (BR-005 — No Income/Expense)</h2>
          <form className="grid-3" onSubmit={handleTransfer}>
            <label>
              From Account
              <select required value={fromAccountId} onChange={(e) => setFromAccountId(e.target.value)}>
                <option value="">Select source...</option>
                {assetAccounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                ))}
              </select>
            </label>
            <label>
              To Account
              <select required value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}>
                <option value="">Select destination...</option>
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
                <option value="">None / Select expense...</option>
                {expenseAccounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                ))}
              </select>
            </label>
            <label>
              Date
              <input type="date" required value={transferDate} onChange={(e) => setTransferDate(e.target.value)} />
            </label>
            <div>
              <button type="submit" className="btn">Post Transfer</button>
            </div>
          </form>
        </section>
      )}

      {canImport && (
        <section className="card">
          <h2 style={{ marginTop: 0 }}>Import CSV Bank Statement (BR-013 Duplicate Protection)</h2>
          {importSummary && <p className="badge badge-ok">{importSummary}</p>}
          <form className="form-grid" onSubmit={handleImportCsv}>
            <label>
              Target Bank Account
              <select required value={importBankId} onChange={(e) => setImportBankId(e.target.value)}>
                <option value="">Select bank account...</option>
                {bankAccounts.map((b) => (
                  <option key={b.id} value={b.id}>{b.institution} (•••• {b.last4})</option>
                ))}
              </select>
            </label>
            <label>
              CSV Data (date,description,amount,external_id)
              <textarea
                rows={4}
                style={{ fontFamily: 'monospace', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border)' }}
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
              />
            </label>
            <div>
              <button type="submit" className="btn">Import CSV</button>
            </div>
          </form>
        </section>
      )}

      <section className="card">
        <h2 style={{ marginTop: 0 }}>Bank Transactions</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Post to Ledger</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx) => (
                <tr key={tx.id}>
                  <td>{tx.tx_date}</td>
                  <td>{tx.description}</td>
                  <td>{formatMinorUnits(money(tx.amount_minor, tx.currency))} {tx.currency}</td>
                  <td>
                    <span className={`badge ${tx.status === 'duplicate_held' ? 'badge-warn' : 'badge-ok'}`}>
                      {tx.status}
                    </span>
                  </td>
                  <td>
                    {tx.status === 'ready' && canPost && (
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <select
                          aria-label="Category account"
                          value={postOffsetByTx[tx.id] ?? ''}
                          onChange={(e) =>
                            setPostOffsetByTx((prev) => ({ ...prev, [tx.id]: e.target.value }))
                          }
                        >
                          <option value="">Category...</option>
                          {accounts.map((a) => (
                            <option key={a.id} value={a.id}>{a.code} {a.name}</option>
                          ))}
                        </select>
                        <button type="button" className="btn" onClick={() => handlePostBankTx(tx.id)}>
                          Post
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>Bank Reconciliation (BR-020)</h2>
        {canWriteBank && (
          <form className="grid-3" onSubmit={handleStartRec} style={{ marginBottom: '1rem' }}>
            <label>
              Bank Account
              <select required value={recBankId} onChange={(e) => setRecBankId(e.target.value)}>
                <option value="">Select bank account...</option>
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
              Ending Balance ({org.base_currency})
              <input required value={recEndingDecimal} onChange={(e) => setRecEndingDecimal(e.target.value)} />
            </label>
            <div>
              <button type="submit" className="btn">Start Reconciliation</button>
            </div>
          </form>
        )}

        {reconciliations.map((rec) => (
          <div key={rec.id} className="card" style={{ background: 'var(--surface-alt)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
              <strong>Statement {rec.statement_date}</strong>
              <span className={`badge ${rec.status === 'completed' ? 'badge-ok' : 'badge-warn'}`}>
                {rec.status} | Diff: {formatMinorUnits(money(rec.difference_minor, org.base_currency))}
              </span>
            </div>
            {rec.status === 'in_progress' && canWriteBank && (
              <div style={{ marginTop: '0.75rem', display: 'grid', gap: '0.5rem' }}>
                {transactions
                  .filter((t) => t.bank_account_id === rec.bank_account_id && t.status === 'posted')
                  .map((t) => (
                    <div key={t.id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                      <span>{t.tx_date} — {t.description} ({formatMinorUnits(money(t.amount_minor, t.currency))})</span>
                      <select
                        value={matchEntryByTx[t.id] ?? (t.linked_entry_id ?? '')}
                        onChange={(e) =>
                          setMatchEntryByTx((prev) => ({ ...prev, [t.id]: e.target.value }))
                        }
                      >
                        <option value="">Select posted entry...</option>
                        {postedEntries.map((e) => (
                          <option key={e.id} value={e.id}>
                            #{e.entry_no} — {e.description}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="btn btn-secondary"
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
                    className="btn"
                    onClick={() => {
                      void apiClient
                        .completeReconciliation(org.id, rec.id)
                        .then(onRefresh)
                        .catch((err) => onError(err.message));
                    }}
                  >
                    Complete & Lock Reconciliation
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </section>
    </>
  );
}

import { useMemo, useState, type FormEvent } from 'react';
import {
  Briefcase,
  Building2,
  Receipt,
  Search,
  ShoppingBag,
  Users,
} from 'lucide-react';
import {
  hasRolePermission,
  type AccountDto,
  type AssetDto,
  type InvoiceBillDto,
  type LiabilityDto,
  type OrganizationDto,
  type PartyDto,
  type PartyTypeDto,
} from '@financial-saas/contracts';
import { formatMinorUnits, money, parseMajorUnits } from '@financial-saas/ledger-core';
import { apiClient } from '../apiClient.js';
import { EmptyState, StatusBadge, badgeToneForStatus } from './ui/DesignSystem.js';

interface OperationsPanelProps {
  org: OrganizationDto;
  accounts: AccountDto[];
  parties: PartyDto[];
  invoicesBills: InvoiceBillDto[];
  assets: AssetDto[];
  liabilities: LiabilityDto[];
  onRefresh: () => Promise<void>;
  onError: (msg: string | null) => void;
  onNotify?: (title: string, detail?: string) => void;
}

type OpsSubTab = 'invoices' | 'expenses' | 'ebay' | 'people' | 'assets';

export function OperationsPanel({
  org,
  accounts,
  parties,
  invoicesBills,
  assets,
  liabilities,
  onRefresh,
  onError,
  onNotify,
}: OperationsPanelProps) {
  const [subTab, setSubTab] = useState<OpsSubTab>('invoices');
  const [docSearch, setDocSearch] = useState('');
  const [partySearch, setPartySearch] = useState('');

  // Party form
  const [partyName, setPartyName] = useState('');
  const [partyType, setPartyType] = useState<PartyTypeDto>('supplier');
  const [shareholdingPct, setShareholdingPct] = useState('0');

  // Expense form (BR-009)
  const [expDate, setExpDate] = useState(new Date().toISOString().slice(0, 10));
  const [expDesc, setExpDesc] = useState('');
  const [expAmt, setExpAmt] = useState('');
  const [ownerScope, setOwnerScope] = useState<'company' | 'personal'>('company');
  const [paidFrom, setPaidFrom] = useState<'business_bank' | 'personal_funds'>('business_bank');
  const [expAccountId, setExpAccountId] = useState('');
  const [payAccountId, setPayAccountId] = useState('');
  const [expPartyId, setExpPartyId] = useState('');

  // Invoice / Bill form (BR-015)
  const [docKind, setDocKind] = useState<'bill' | 'invoice' | 'subscription'>('bill');
  const [docNumber, setDocNumber] = useState('');
  const [docPartyId, setDocPartyId] = useState('');
  const [docAmt, setDocAmt] = useState('');
  const [docCatAccId, setDocCatAccId] = useState('');
  const [docCtrlAccId, setDocCtrlAccId] = useState('');
  const [docPurpose, setDocPurpose] = useState('');

  // eBay Payout form
  const [ebayRef, setEbayRef] = useState('');
  const [ebayGross, setEbayGross] = useState('');
  const [ebayFees, setEbayFees] = useState('');
  const [ebayClearingId, setEbayClearingId] = useState('');
  const [ebaySalesId, setEbaySalesId] = useState('');
  const [ebayFeesId, setEbayFeesId] = useState('');
  const [ebayBankId, setEbayBankId] = useState('');

  // Asset form
  const [assetName, setAssetName] = useState('');
  const [assetCost, setAssetCost] = useState('');
  const [assetAccId, setAssetAccId] = useState('');
  const [assetPayAccId, setAssetPayAccId] = useState('');

  const canPost = hasRolePermission(org.role, 'ledger:post');
  const canManageParties = hasRolePermission(org.role, 'members:write');

  const partyNameById = (id: string) =>
    parties.find((p) => p.id === id)?.display_name ?? id.slice(0, 8);

  const filteredDocs = useMemo(() => {
    const q = docSearch.trim().toLowerCase();
    if (!q) return invoicesBills;
    return invoicesBills.filter(
      (d) =>
        d.doc_number.toLowerCase().includes(q) ||
        d.kind.toLowerCase().includes(q) ||
        partyNameById(d.party_id).toLowerCase().includes(q)
    );
  }, [invoicesBills, docSearch, parties]);

  const filteredParties = useMemo(() => {
    const q = partySearch.trim().toLowerCase();
    if (!q) return parties;
    return parties.filter(
      (p) =>
        p.display_name.toLowerCase().includes(q) ||
        p.party_type.toLowerCase().includes(q)
    );
  }, [parties, partySearch]);

  async function handleCreateParty(e: FormEvent) {
    e.preventDefault();
    onError(null);
    try {
      const bps = Math.round(Number(shareholdingPct) * 100);
      await apiClient.createParty(org.id, {
        party_type: partyType,
        display_name: partyName,
        shareholding_bps: bps,
      });
      onNotify?.('Party added', `${partyName} (${partyType})`);
      setPartyName('');
      await onRefresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to create party');
    }
  }

  async function handleRecordExpense(e: FormEvent) {
    e.preventDefault();
    onError(null);
    try {
      const amt = parseMajorUnits(expAmt, org.base_currency);
      await apiClient.recordExpense(org.id, {
        expense_date: expDate,
        description: expDesc,
        amount_minor: amt.amountMinor.toString(),
        currency: org.base_currency,
        owner_scope: ownerScope,
        paid_from: paidFrom,
        expense_account_id: expAccountId,
        payment_account_id: payAccountId,
        party_id: expPartyId || null,
      });
      onNotify?.('Expense recorded', expDesc);
      setExpDesc('');
      setExpAmt('');
      await onRefresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to record expense');
    }
  }

  async function handleCreateDoc(e: FormEvent) {
    e.preventDefault();
    onError(null);
    try {
      const amt = parseMajorUnits(docAmt, org.base_currency);
      const today = new Date().toISOString().slice(0, 10);
      await apiClient.createInvoiceBill(org.id, {
        kind: docKind,
        doc_number: docNumber,
        party_id: docPartyId,
        issue_date: today,
        due_date: today,
        total_minor: amt.amountMinor.toString(),
        currency: org.base_currency,
        category_account_id: docCatAccId,
        control_account_id: docCtrlAccId,
        purpose: docPurpose,
      });
      onNotify?.('Document created', `${docKind.toUpperCase()} ${docNumber}`);
      setDocNumber('');
      setDocAmt('');
      setDocPurpose('');
      await onRefresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to create document');
    }
  }

  async function handleEbayPayout(e: FormEvent) {
    e.preventDefault();
    onError(null);
    try {
      const gross = parseMajorUnits(ebayGross, org.base_currency);
      const fees = parseMajorUnits(ebayFees || '0', org.base_currency);
      await apiClient.recordEbayPayout(org.id, {
        payout_date: new Date().toISOString().slice(0, 10),
        payout_ref: ebayRef,
        gross_sales_minor: gross.amountMinor.toString(),
        marketplace_fees_minor: fees.amountMinor.toString(),
        shipping_expense_minor: '0',
        refunds_minor: '0',
        currency: org.base_currency,
        clearing_account_id: ebayClearingId,
        sales_account_id: ebaySalesId,
        fees_account_id: ebayFeesId,
        ...(ebayBankId ? { bank_account_id: ebayBankId } : {}),
      });
      onNotify?.('eBay payout posted', ebayRef);
      setEbayRef('');
      setEbayGross('');
      setEbayFees('');
      await onRefresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to record eBay payout');
    }
  }

  async function handleCreateAsset(e: FormEvent) {
    e.preventDefault();
    onError(null);
    try {
      const cost = parseMajorUnits(assetCost, org.base_currency);
      await apiClient.createAsset(org.id, {
        name: assetName,
        category: 'equipment',
        purchase_date: new Date().toISOString().slice(0, 10),
        purchase_cost_minor: cost.amountMinor.toString(),
        currency: org.base_currency,
        asset_account_id: assetAccId,
        payment_account_id: assetPayAccId,
      });
      onNotify?.('Fixed asset capitalized', assetName);
      setAssetName('');
      setAssetCost('');
      await onRefresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to record asset');
    }
  }

  return (
    <div className="lc-stack-lg">
      <section className="lc-card">
        <div className="lc-page-head">
          <div>
            <div className="lc-eyebrow">Commercial Workflows</div>
            <h1 className="lc-page-title">Expenses, AP/AR, People, Assets &amp; eBay</h1>
            <p className="muted" style={{ margin: '0.2rem 0 0' }}>
              Record company vs. personal expenses (`BR-009`), manage open-item invoices &amp; bills (`BR-015`), settle eBay payouts, and maintain your counterparty &amp; asset registers.
            </p>
          </div>
        </div>

        <div className="lc-segmented" style={{ marginTop: '0.9rem' }} role="tablist" aria-label="Operations module">
          {(
            [
              ['invoices', `Invoices & Bills (${invoicesBills.length})`],
              ['expenses', 'Record Expense'],
              ['ebay', 'eBay Payouts'],
              ['people', `People & Parties (${parties.length})`],
              ['assets', `Assets & Liabilities (${assets.length + liabilities.length})`],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`lc-seg-btn ${subTab === id ? 'active' : ''}`}
              onClick={() => setSubTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {subTab === 'invoices' && (
        <div className="lc-stack-lg">
          {canPost && (
            <section className="lc-card">
              <header className="lc-card-head">
                <div>
                  <h3 className="lc-card-title">New Invoice, Supplier Bill or Subscription (BR-015)</h3>
                  <p className="lc-card-sub">Posts automatically to AP/AR control accounts and tracks open balances.</p>
                </div>
              </header>
              <form className="lc-grid-form" onSubmit={handleCreateDoc}>
                <label>
                  Type
                  <select value={docKind} onChange={(e) => setDocKind(e.target.value as 'bill' | 'invoice' | 'subscription')}>
                    <option value="bill">Supplier Bill (Payable)</option>
                    <option value="invoice">Customer Invoice (Receivable)</option>
                    <option value="subscription">Subscription</option>
                  </select>
                </label>
                <label>
                  Document #
                  <input required value={docNumber} onChange={(e) => setDocNumber(e.target.value)} placeholder="INV-1001" />
                </label>
                <label>
                  Party
                  <select required value={docPartyId} onChange={(e) => setDocPartyId(e.target.value)}>
                    <option value="">Select party…</option>
                    {parties.map((p) => (
                      <option key={p.id} value={p.id}>{p.display_name} ({p.party_type})</option>
                    ))}
                  </select>
                </label>
                <label>
                  Amount ({org.base_currency})
                  <input required value={docAmt} onChange={(e) => setDocAmt(e.target.value)} placeholder="250.00" />
                </label>
                <label>
                  Category Account (Expense/Asset/Income)
                  <select required value={docCatAccId} onChange={(e) => setDocCatAccId(e.target.value)}>
                    <option value="">Select category…</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  AP/AR Control Account
                  <select required value={docCtrlAccId} onChange={(e) => setDocCtrlAccId(e.target.value)}>
                    <option value="">Select control…</option>
                    {accounts.filter((a) => a.account_type === 'asset' || a.account_type === 'liability').map((a) => (
                      <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Purpose
                  <input required value={docPurpose} onChange={(e) => setDocPurpose(e.target.value)} placeholder="Inventory / software" />
                </label>
                <div className="lc-form-action">
                  <button type="submit" className="btn">Record Document</button>
                </div>
              </form>
            </section>
          )}

          <section className="lc-card">
            <div className="lc-toolbar">
              <div>
                <h3 className="lc-card-title">Open-Item AP &amp; AR Register</h3>
                <p className="lc-card-sub">{invoicesBills.length} document(s)</p>
              </div>
              <div className="lc-search-box">
                <Search size={15} aria-hidden="true" />
                <input
                  type="search"
                  placeholder="Search doc #, party, or kind…"
                  value={docSearch}
                  onChange={(e) => setDocSearch(e.target.value)}
                />
              </div>
            </div>
            {filteredDocs.length === 0 ? (
              <EmptyState
                icon={<Receipt size={20} />}
                title="No invoices or bills recorded"
                description="Create a supplier bill or customer invoice above to track receivables and payables."
              />
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Doc #</th>
                      <th>Type</th>
                      <th>Counterparty</th>
                      <th>Due Date</th>
                      <th className="num-col">Total</th>
                      <th className="num-col">Remaining</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDocs.map((d) => (
                      <tr key={d.id}>
                        <td className="mono">{d.doc_number}</td>
                        <td style={{ textTransform: 'capitalize' }}>{d.kind}</td>
                        <td><strong>{partyNameById(d.party_id)}</strong></td>
                        <td>{d.due_date ?? d.issue_date}</td>
                        <td className="num-col mono-num">{formatMinorUnits(money(d.total_minor, d.currency))} {d.currency}</td>
                        <td className="num-col mono-num">{formatMinorUnits(money(d.remaining_minor, d.currency))} {d.currency}</td>
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

      {subTab === 'expenses' && (
        <section className="lc-card">
          <header className="lc-card-head">
            <div>
              <h3 className="lc-card-title">Record Expense (Company vs. Personal, BR-009)</h3>
              <p className="lc-card-sub">Supports company spend, owner draws, and personal-card reimbursements with Due-to-Owner tracking.</p>
            </div>
          </header>
          {!canPost ? (
            <EmptyState
              icon={<Briefcase size={20} />}
              title="Read-only role"
              description="Your organization role cannot post ledger expenses."
            />
          ) : (
            <form className="lc-grid-form" onSubmit={handleRecordExpense}>
              <label>
                Date
                <input type="date" required value={expDate} onChange={(e) => setExpDate(e.target.value)} />
              </label>
              <label>
                Description
                <input required value={expDesc} onChange={(e) => setExpDesc(e.target.value)} placeholder="Cloud hosting / Owner personal spend" />
              </label>
              <label>
                Amount ({org.base_currency})
                <input required value={expAmt} onChange={(e) => setExpAmt(e.target.value)} placeholder="50.00" />
              </label>
              <label>
                Belongs To
                <select value={ownerScope} onChange={(e) => setOwnerScope(e.target.value as 'company' | 'personal')}>
                  <option value="company">Company</option>
                  <option value="personal">Personal (Owner Draw / Due from Owner)</option>
                </select>
              </label>
              <label>
                Paid From
                <select value={paidFrom} onChange={(e) => setPaidFrom(e.target.value as 'business_bank' | 'personal_funds')}>
                  <option value="business_bank">Business Bank</option>
                  <option value="personal_funds">Personal Funds (Due to Owner)</option>
                </select>
              </label>
              <label>
                Debit Account (Expense or Owner Draws)
                <select required value={expAccountId} onChange={(e) => setExpAccountId(e.target.value)}>
                  <option value="">Select account…</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.code} — {a.name} ({a.account_type})</option>
                  ))}
                </select>
              </label>
              <label>
                Credit Account (Bank or Due to Owner)
                <select required value={payAccountId} onChange={(e) => setPayAccountId(e.target.value)}>
                  <option value="">Select account…</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.code} — {a.name} ({a.account_type})</option>
                  ))}
                </select>
              </label>
              <label>
                Responsible Person (Optional)
                <select value={expPartyId} onChange={(e) => setExpPartyId(e.target.value)}>
                  <option value="">None</option>
                  {parties.map((p) => (
                    <option key={p.id} value={p.id}>{p.display_name}</option>
                  ))}
                </select>
              </label>
              <div className="lc-form-action">
                <button type="submit" className="btn">Post Expense</button>
              </div>
            </form>
          )}
        </section>
      )}

      {subTab === 'ebay' && (
        <section className="lc-card">
          <header className="lc-card-head">
            <div>
              <h3 className="lc-card-title">eBay Financial Payout Posting (FT-33)</h3>
              <p className="lc-card-sub">Splits gross marketplace sales, marketplace fees, and net clearing settlement cleanly in one atomic entry.</p>
            </div>
          </header>
          {!canPost ? (
            <EmptyState
              icon={<ShoppingBag size={20} />}
              title="Read-only role"
              description="Posting marketplace payouts requires `ledger:post` permission."
            />
          ) : (
            <form className="lc-grid-form" onSubmit={handleEbayPayout}>
              <label>
                Payout Ref
                <input required value={ebayRef} onChange={(e) => setEbayRef(e.target.value)} placeholder="EBAY-PAY-2026-11" />
              </label>
              <label>
                Gross Sales ({org.base_currency})
                <input required value={ebayGross} onChange={(e) => setEbayGross(e.target.value)} placeholder="100.00" />
              </label>
              <label>
                Marketplace Fees
                <input value={ebayFees} onChange={(e) => setEbayFees(e.target.value)} placeholder="13.00" />
              </label>
              <label>
                Clearing Account
                <select required value={ebayClearingId} onChange={(e) => setEbayClearingId(e.target.value)}>
                  <option value="">Select clearing…</option>
                  {accounts.filter((a) => a.account_type === 'asset').map((a) => (
                    <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                  ))}
                </select>
              </label>
              <label>
                Sales Account
                <select required value={ebaySalesId} onChange={(e) => setEbaySalesId(e.target.value)}>
                  <option value="">Select sales…</option>
                  {accounts.filter((a) => a.account_type === 'income').map((a) => (
                    <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                  ))}
                </select>
              </label>
              <label>
                Fees Expense Account
                <select required value={ebayFeesId} onChange={(e) => setEbayFeesId(e.target.value)}>
                  <option value="">Select fees…</option>
                  {accounts.filter((a) => a.account_type === 'expense').map((a) => (
                    <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                  ))}
                </select>
              </label>
              <label>
                Settle to Bank (Optional)
                <select value={ebayBankId} onChange={(e) => setEbayBankId(e.target.value)}>
                  <option value="">Leave in Clearing</option>
                  {accounts.filter((a) => a.account_type === 'asset').map((a) => (
                    <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                  ))}
                </select>
              </label>
              <div className="lc-form-action">
                <button type="submit" className="btn">Post eBay Payout</button>
              </div>
            </form>
          )}
        </section>
      )}

      {subTab === 'people' && (
        <div className="lc-stack-lg">
          {canManageParties && (
            <section className="lc-card">
              <header className="lc-card-head">
                <div>
                  <h3 className="lc-card-title">Add Person or Counterparty (BR-017)</h3>
                  <p className="lc-card-sub">Maintain unified suppliers, customers, investors, managers, employees, and owners.</p>
                </div>
              </header>
              <form className="lc-grid-form" onSubmit={handleCreateParty}>
                <label>
                  Name
                  <input required value={partyName} onChange={(e) => setPartyName(e.target.value)} placeholder="Acme Supplier / Ali Investor" />
                </label>
                <label>
                  Type
                  <select value={partyType} onChange={(e) => setPartyType(e.target.value as PartyTypeDto)}>
                    <option value="supplier">Supplier</option>
                    <option value="customer">Customer</option>
                    <option value="investor">Investor</option>
                    <option value="manager">Manager</option>
                    <option value="employee">Employee</option>
                    <option value="owner">Owner</option>
                  </select>
                </label>
                <label>
                  Shareholding % (if investor/owner)
                  <input value={shareholdingPct} onChange={(e) => setShareholdingPct(e.target.value)} />
                </label>
                <div className="lc-form-action">
                  <button type="submit" className="btn">Add Party</button>
                </div>
              </form>
            </section>
          )}

          <section className="lc-card">
            <div className="lc-toolbar">
              <div>
                <h3 className="lc-card-title">People &amp; Counterparties Directory</h3>
                <p className="lc-card-sub">{parties.length} active record(s)</p>
              </div>
              <div className="lc-search-box">
                <Search size={15} aria-hidden="true" />
                <input
                  type="search"
                  placeholder="Search name or type…"
                  value={partySearch}
                  onChange={(e) => setPartySearch(e.target.value)}
                />
              </div>
            </div>
            {filteredParties.length === 0 ? (
              <EmptyState
                icon={<Users size={20} />}
                title="No people or counterparties yet"
                description="Add investors, suppliers, customers, or team members above."
              />
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Type</th>
                      <th className="num-col">Shareholding</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredParties.map((p) => (
                      <tr key={p.id}>
                        <td><strong>{p.display_name}</strong></td>
                        <td><StatusBadge tone="accent">{p.party_type}</StatusBadge></td>
                        <td className="num-col mono-num">{(p.shareholding_bps / 100).toFixed(2)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {subTab === 'assets' && (
        <div className="lc-stack-lg">
          {canPost && (
            <section className="lc-card">
              <header className="lc-card-head">
                <div>
                  <h3 className="lc-card-title">Capitalize Fixed Asset</h3>
                  <p className="lc-card-sub">Adds equipment to the asset register and posts acquisition entries cleanly.</p>
                </div>
              </header>
              <form className="lc-grid-form" onSubmit={handleCreateAsset}>
                <label>
                  Asset Name
                  <input required value={assetName} onChange={(e) => setAssetName(e.target.value)} placeholder="Warehouse Barcode Printer" />
                </label>
                <label>
                  Cost ({org.base_currency})
                  <input required value={assetCost} onChange={(e) => setAssetCost(e.target.value)} />
                </label>
                <label>
                  Fixed Asset Account
                  <select required value={assetAccId} onChange={(e) => setAssetAccId(e.target.value)}>
                    <option value="">Select asset account…</option>
                    {accounts.filter((a) => a.account_type === 'asset').map((a) => (
                      <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Payment Account
                  <select required value={assetPayAccId} onChange={(e) => setAssetPayAccId(e.target.value)}>
                    <option value="">Select bank/payable…</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                    ))}
                  </select>
                </label>
                <div className="lc-form-action">
                  <button type="submit" className="btn">Capitalize Asset</button>
                </div>
              </form>
            </section>
          )}

          <section className="lc-card">
            <header className="lc-card-head">
              <div>
                <h3 className="lc-card-title">Fixed Assets &amp; Liabilities Registers</h3>
                <p className="lc-card-sub">Combined company property and outstanding loan schedules</p>
              </div>
            </header>
            {assets.length === 0 && liabilities.length === 0 ? (
              <EmptyState
                icon={<Building2 size={20} />}
                title="No assets or loans recorded"
                description="Capitalize equipment above or record investor/business loans."
              />
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Asset / Liability</th>
                      <th>Date</th>
                      <th className="num-col">Book / Outstanding</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assets.map((a) => (
                      <tr key={a.id}>
                        <td><strong>{a.name}</strong> <span className="muted">({a.category})</span></td>
                        <td>{a.purchase_date}</td>
                        <td className="num-col mono-num">{formatMinorUnits(money(a.book_value_minor, a.currency))} {a.currency}</td>
                        <td><StatusBadge tone="success">{a.status}</StatusBadge></td>
                      </tr>
                    ))}
                    {liabilities.map((l) => (
                      <tr key={l.id}>
                        <td><strong>Loan: {l.lender_name}</strong></td>
                        <td>{l.origination_date}</td>
                        <td className="num-col mono-num">{formatMinorUnits(money(l.outstanding_minor, l.currency))} {l.currency}</td>
                        <td><StatusBadge tone="warning">{l.status}</StatusBadge></td>
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

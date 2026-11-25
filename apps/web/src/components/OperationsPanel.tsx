import { useState, type FormEvent } from 'react';
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

interface OperationsPanelProps {
  org: OrganizationDto;
  accounts: AccountDto[];
  parties: PartyDto[];
  invoicesBills: InvoiceBillDto[];
  assets: AssetDto[];
  liabilities: LiabilityDto[];
  onRefresh: () => Promise<void>;
  onError: (msg: string | null) => void;
}

export function OperationsPanel({
  org,
  accounts,
  parties,
  invoicesBills,
  assets,
  liabilities,
  onRefresh,
  onError,
}: OperationsPanelProps) {
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
      setAssetName('');
      setAssetCost('');
      await onRefresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to record asset');
    }
  }

  return (
    <>
      <section className="card">
        <h2 style={{ marginTop: 0 }}>People & Parties Directory (BR-017)</h2>
        {canManageParties && (
          <form className="grid-3" onSubmit={handleCreateParty} style={{ marginBottom: '1rem' }}>
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
            <div>
              <button type="submit" className="btn">Add Party</button>
            </div>
          </form>
        )}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Shareholding</th>
              </tr>
            </thead>
            <tbody>
              {parties.map((p) => (
                <tr key={p.id}>
                  <td>{p.display_name}</td>
                  <td><span className="badge">{p.party_type}</span></td>
                  <td>{(p.shareholding_bps / 100).toFixed(2)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {canPost && (
        <section className="card">
          <h2 style={{ marginTop: 0 }}>Record Expense (Company vs Personal, BR-009)</h2>
          <form className="grid-3" onSubmit={handleRecordExpense}>
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
              Belongs to
              <select value={ownerScope} onChange={(e) => setOwnerScope(e.target.value as 'company' | 'personal')}>
                <option value="company">Company</option>
                <option value="personal">Personal (Owner Draw / Due from Owner)</option>
              </select>
            </label>
            <label>
              Paid from
              <select value={paidFrom} onChange={(e) => setPaidFrom(e.target.value as 'business_bank' | 'personal_funds')}>
                <option value="business_bank">Business Bank</option>
                <option value="personal_funds">Personal Funds (Due to Owner)</option>
              </select>
            </label>
            <label>
              Debit Account (Expense or Owner Draws)
              <select required value={expAccountId} onChange={(e) => setExpAccountId(e.target.value)}>
                <option value="">Select account...</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.code} — {a.name} ({a.account_type})</option>
                ))}
              </select>
            </label>
            <label>
              Credit Account (Bank or Due to Owner)
              <select required value={payAccountId} onChange={(e) => setPayAccountId(e.target.value)}>
                <option value="">Select account...</option>
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
            <div style={{ alignSelf: 'end' }}>
              <button type="submit" className="btn">Post Expense</button>
            </div>
          </form>
        </section>
      )}

      <section className="card">
        <h2 style={{ marginTop: 0 }}>Invoices, Bills & Open-Item AP/AR (BR-015)</h2>
        {canPost && (
          <form className="grid-3" onSubmit={handleCreateDoc} style={{ marginBottom: '1rem' }}>
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
                <option value="">Select party...</option>
                {parties.map((p) => (
                  <option key={p.id} value={p.id}>{p.display_name} ({p.party_type})</option>
                ))}
              </select>
            </label>
            <label>
              Amount ({org.base_currency})
              <input required value={docAmt} onChange={(e) => setDocAmt(e.target.value)} />
            </label>
            <label>
              Category Account (Expense/Asset/Income)
              <select required value={docCatAccId} onChange={(e) => setDocCatAccId(e.target.value)}>
                <option value="">Select category...</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                ))}
              </select>
            </label>
            <label>
              AP/AR Control Account
              <select required value={docCtrlAccId} onChange={(e) => setDocCtrlAccId(e.target.value)}>
                <option value="">Select control...</option>
                {accounts.filter((a) => a.account_type === 'asset' || a.account_type === 'liability').map((a) => (
                  <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                ))}
              </select>
            </label>
            <label>
              Purpose
              <input required value={docPurpose} onChange={(e) => setDocPurpose(e.target.value)} placeholder="Inventory / software" />
            </label>
            <div style={{ alignSelf: 'end' }}>
              <button type="submit" className="btn">Record Document</button>
            </div>
          </form>
        )}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Doc #</th>
                <th>Type</th>
                <th>Total</th>
                <th>Remaining</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {invoicesBills.map((d) => (
                <tr key={d.id}>
                  <td className="mono">{d.doc_number}</td>
                  <td>{d.kind}</td>
                  <td>{formatMinorUnits(money(d.total_minor, d.currency))}</td>
                  <td>{formatMinorUnits(money(d.remaining_minor, d.currency))}</td>
                  <td><span className="badge">{d.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {canPost && (
        <section className="card">
          <h2 style={{ marginTop: 0 }}>eBay Financial Payout Posting (FT-33)</h2>
          <form className="grid-3" onSubmit={handleEbayPayout}>
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
                <option value="">Select clearing...</option>
                {accounts.filter((a) => a.account_type === 'asset').map((a) => (
                  <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                ))}
              </select>
            </label>
            <label>
              Sales Account
              <select required value={ebaySalesId} onChange={(e) => setEbaySalesId(e.target.value)}>
                <option value="">Select sales...</option>
                {accounts.filter((a) => a.account_type === 'income').map((a) => (
                  <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                ))}
              </select>
            </label>
            <label>
              Fees Expense Account
              <select required value={ebayFeesId} onChange={(e) => setEbayFeesId(e.target.value)}>
                <option value="">Select fees...</option>
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
            <div style={{ alignSelf: 'end' }}>
              <button type="submit" className="btn">Post eBay Payout</button>
            </div>
          </form>
        </section>
      )}

      <section className="card">
        <h2 style={{ marginTop: 0 }}>Fixed Assets & Liabilities Registers</h2>
        {canPost && (
          <form className="grid-3" onSubmit={handleCreateAsset} style={{ marginBottom: '1rem' }}>
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
                <option value="">Select asset account...</option>
                {accounts.filter((a) => a.account_type === 'asset').map((a) => (
                  <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                ))}
              </select>
            </label>
            <label>
              Payment Account
              <select required value={assetPayAccId} onChange={(e) => setAssetPayAccId(e.target.value)}>
                <option value="">Select bank/payable...</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                ))}
              </select>
            </label>
            <div style={{ alignSelf: 'end' }}>
              <button type="submit" className="btn">Capitalize Asset</button>
            </div>
          </form>
        )}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Asset / Liability</th>
                <th>Date</th>
                <th>Book / Outstanding</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {assets.map((a) => (
                <tr key={a.id}>
                  <td>{a.name} ({a.category})</td>
                  <td>{a.purchase_date}</td>
                  <td>{formatMinorUnits(money(a.book_value_minor, a.currency))}</td>
                  <td><span className="badge badge-ok">{a.status}</span></td>
                </tr>
              ))}
              {liabilities.map((l) => (
                <tr key={l.id}>
                  <td>Loan: {l.lender_name}</td>
                  <td>{l.origination_date}</td>
                  <td>{formatMinorUnits(money(l.outstanding_minor, l.currency))}</td>
                  <td><span className="badge badge-warn">{l.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

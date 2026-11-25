import { z } from 'zod';
import {
  AmountMinorStringSchema,
  CurrencyCodeSchema,
  PositiveAmountMinorStringSchema,
} from './money.js';

export const PartyTypeSchema = z.enum([
  'investor',
  'manager',
  'employee',
  'supplier',
  'customer',
  'owner',
]);
export type PartyTypeDto = z.infer<typeof PartyTypeSchema>;

export const CreatePartyRequestSchema = z
  .object({
    party_type: PartyTypeSchema,
    display_name: z.string().trim().min(1).max(120),
    email: z.string().trim().email().max(320).optional(),
    shareholding_bps: z.number().int().min(0).max(10_000).default(0),
  })
  .strict();

export type CreatePartyRequest = z.infer<typeof CreatePartyRequestSchema>;

export interface PartyDto {
  id: string;
  organization_id: string;
  party_type: PartyTypeDto;
  display_name: string;
  email_redacted: string | null;
  shareholding_bps: number;
  pseudonymized_at: string | null;
  created_at: string;
}

export interface IndividualLedgerLineDto {
  entry_id: string;
  entry_no: string | null;
  entry_date: string;
  description: string;
  account_id: string;
  side: 'debit' | 'credit';
  amount_minor: string;
  currency: string;
  memo: string | null;
}

export interface IndividualLedgerDto {
  party: PartyDto;
  currency: string;
  total_debits_minor: string;
  total_credits_minor: string;
  net_balance_minor: string;
  lines: IndividualLedgerLineDto[];
}

export const RecordExpenseRequestSchema = z
  .object({
    expense_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    description: z.string().trim().min(2).max(300),
    amount_minor: PositiveAmountMinorStringSchema,
    currency: CurrencyCodeSchema,
    owner_scope: z.enum(['company', 'personal']),
    paid_from: z.enum(['business_bank', 'personal_funds']),
    expense_account_id: z.string().uuid(),
    payment_account_id: z.string().uuid(),
    party_id: z.string().uuid().nullable().optional(),
    attachment_key: z.string().max(256).nullable().optional(),
  })
  .strict();

export type RecordExpenseRequest = z.infer<typeof RecordExpenseRequestSchema>;

export const InvoiceBillKindSchema = z.enum(['bill', 'invoice', 'subscription']);

export const CreateInvoiceBillRequestSchema = z
  .object({
    kind: InvoiceBillKindSchema,
    doc_number: z.string().trim().min(1).max(64),
    party_id: z.string().uuid(),
    issue_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    total_minor: PositiveAmountMinorStringSchema,
    currency: CurrencyCodeSchema,
    category_account_id: z.string().uuid(),
    control_account_id: z.string().uuid(),
    purpose: z.string().trim().min(2).max(300),
    attachment_key: z.string().max(256).nullable().optional(),
  })
  .strict();

export type CreateInvoiceBillRequest = z.infer<typeof CreateInvoiceBillRequestSchema>;

export interface InvoiceBillDto {
  id: string;
  organization_id: string;
  kind: z.infer<typeof InvoiceBillKindSchema>;
  doc_number: string;
  party_id: string;
  issue_date: string;
  due_date: string;
  total_minor: string;
  allocated_minor: string;
  remaining_minor: string;
  currency: string;
  status: 'open' | 'partially_settled' | 'settled';
  ledger_entry_id: string;
  purpose: string;
  created_at: string;
}

export const AllocatePaymentRequestSchema = z
  .object({
    payment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    amount_minor: PositiveAmountMinorStringSchema,
    currency: CurrencyCodeSchema,
    bank_account_ledger_id: z.string().uuid(),
    control_account_id: z.string().uuid(),
  })
  .strict();

export type AllocatePaymentRequest = z.infer<typeof AllocatePaymentRequestSchema>;

export const InvestorContributionRequestSchema = z
  .object({
    party_id: z.string().uuid(),
    treatment: z.enum(['equity', 'loan']),
    contribution_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    gross_amount_minor: PositiveAmountMinorStringSchema,
    wire_fee_minor: AmountMinorStringSchema.default('0'),
    currency: CurrencyCodeSchema,
    bank_account_id: z.string().uuid(),
    capital_or_loan_account_id: z.string().uuid(),
    fee_account_id: z.string().uuid().optional(),
    description: z.string().trim().min(2).max(300).default('Investor capital contribution'),
  })
  .strict();

export type InvestorContributionRequest = z.infer<typeof InvestorContributionRequestSchema>;

export const ProfitShareAgreementLineSchema = z
  .object({
    party_id: z.string().uuid(),
    share_bps: z.number().int().min(0).max(10_000),
  })
  .strict();

export const CreateProfitShareAgreementRequestSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    effective_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    effective_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    lines: z.array(ProfitShareAgreementLineSchema).min(1),
  })
  .strict();

export type CreateProfitShareAgreementRequest = z.infer<
  typeof CreateProfitShareAgreementRequestSchema
>;

export interface ProfitShareAgreementDto {
  id: string;
  organization_id: string;
  name: string;
  effective_from: string;
  effective_to: string | null;
  lines: Array<{ party_id: string; share_bps: number }>;
  created_at: string;
}

export const RunProfitDistributionRequestSchema = z
  .object({
    period_id: z.string().uuid(),
    distribution_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    retained_earnings_account_id: z.string().uuid(),
    due_to_partner_account_id: z.string().uuid(),
  })
  .strict();

export type RunProfitDistributionRequest = z.infer<typeof RunProfitDistributionRequestSchema>;

export interface ProfitDistributionDto {
  id: string;
  organization_id: string;
  period_id: string;
  agreement_id: string;
  net_profit_minor: string;
  currency: string;
  ledger_entry_id: string;
  status: 'approved_unpaid' | 'paid';
  lines: Array<{
    party_id: string;
    share_bps: number;
    amount_minor: string;
  }>;
  created_at: string;
}

export const PayDistributionRequestSchema = z
  .object({
    payment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    bank_account_id: z.string().uuid(),
    due_to_partner_account_id: z.string().uuid(),
  })
  .strict();

export type PayDistributionRequest = z.infer<typeof PayDistributionRequestSchema>;

export const CreateCompensationArrangementRequestSchema = z
  .object({
    party_id: z.string().uuid(),
    effective_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    fixed_salary_minor: AmountMinorStringSchema.default('0'),
    commission_bps: z.number().int().min(0).max(10_000).default(0),
    currency: CurrencyCodeSchema,
  })
  .strict();

export type CreateCompensationArrangementRequest = z.infer<
  typeof CreateCompensationArrangementRequestSchema
>;

export interface CompensationArrangementDto {
  id: string;
  organization_id: string;
  party_id: string;
  effective_from: string;
  fixed_salary_minor: string;
  commission_bps: number;
  currency: string;
}

export const AccrueSalaryRequestSchema = z
  .object({
    party_id: z.string().uuid(),
    accrual_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    amount_minor: PositiveAmountMinorStringSchema,
    currency: CurrencyCodeSchema,
    salary_expense_account_id: z.string().uuid(),
    salaries_payable_account_id: z.string().uuid(),
    description: z.string().trim().min(2).max(300).default('Monthly salary accrual'),
  })
  .strict();

export type AccrueSalaryRequest = z.infer<typeof AccrueSalaryRequestSchema>;

export interface SalaryRunDto {
  id: string;
  organization_id: string;
  party_id: string;
  accrual_date: string;
  amount_minor: string;
  currency: string;
  accrual_entry_id: string;
  payment_entry_id: string | null;
  status: 'accrued' | 'paid';
}

export const PaySalaryRunRequestSchema = z
  .object({
    payment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    bank_account_id: z.string().uuid(),
    salaries_payable_account_id: z.string().uuid(),
  })
  .strict();

export type PaySalaryRunRequest = z.infer<typeof PaySalaryRunRequestSchema>;

export const CreateAssetRequestSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    category: z.enum(['computer', 'laptop', 'equipment', 'furniture', 'other']),
    purchase_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    purchase_cost_minor: PositiveAmountMinorStringSchema,
    currency: CurrencyCodeSchema,
    asset_account_id: z.string().uuid(),
    payment_account_id: z.string().uuid(),
    assigned_party_id: z.string().uuid().nullable().optional(),
    location: z.string().trim().max(120).optional(),
  })
  .strict();

export type CreateAssetRequest = z.infer<typeof CreateAssetRequestSchema>;

export interface AssetDto {
  id: string;
  organization_id: string;
  name: string;
  category: string;
  purchase_date: string;
  purchase_cost_minor: string;
  book_value_minor: string;
  currency: string;
  assigned_party_id: string | null;
  location: string | null;
  status: 'active' | 'disposed';
  ledger_entry_id: string;
}

export const CreateLiabilityRequestSchema = z
  .object({
    lender_name: z.string().trim().min(2).max(120),
    origination_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    principal_minor: PositiveAmountMinorStringSchema,
    currency: CurrencyCodeSchema,
    bank_account_id: z.string().uuid(),
    liability_account_id: z.string().uuid(),
    party_id: z.string().uuid().nullable().optional(),
  })
  .strict();

export type CreateLiabilityRequest = z.infer<typeof CreateLiabilityRequestSchema>;

export interface LiabilityDto {
  id: string;
  organization_id: string;
  lender_name: string;
  origination_date: string;
  principal_minor: string;
  outstanding_minor: string;
  currency: string;
  status: 'open' | 'settled';
  ledger_entry_id: string;
}

export const RecordEbayPayoutRequestSchema = z
  .object({
    payout_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    payout_ref: z.string().trim().min(2).max(64),
    gross_sales_minor: PositiveAmountMinorStringSchema,
    marketplace_fees_minor: AmountMinorStringSchema.default('0'),
    shipping_expense_minor: AmountMinorStringSchema.default('0'),
    refunds_minor: AmountMinorStringSchema.default('0'),
    currency: CurrencyCodeSchema,
    clearing_account_id: z.string().uuid(),
    sales_account_id: z.string().uuid(),
    fees_account_id: z.string().uuid(),
    shipping_account_id: z.string().uuid().optional(),
    refunds_account_id: z.string().uuid().optional(),
    bank_account_id: z.string().uuid().optional(),
  })
  .strict();

export type RecordEbayPayoutRequest = z.infer<typeof RecordEbayPayoutRequestSchema>;

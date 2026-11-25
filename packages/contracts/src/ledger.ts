import { z } from 'zod';
import { CurrencyCodeSchema, PositiveAmountMinorStringSchema, AmountMinorStringSchema } from './money.js';

export const AccountTypeSchema = z.enum(['asset', 'liability', 'equity', 'income', 'expense']);
export type AccountTypeDto = z.infer<typeof AccountTypeSchema>;

export const AccountOwnershipTypeSchema = z.enum(['business', 'personal']);
export type AccountOwnershipTypeDto = z.infer<typeof AccountOwnershipTypeSchema>;

export const PeriodStatusSchema = z.enum(['open', 'closed', 'locked']);
export type PeriodStatusDto = z.infer<typeof PeriodStatusSchema>;

export const JournalEntryKindSchema = z.enum([
  'standard',
  'transfer',
  'investor_capital',
  'loan_proceeds',
  'owner_contribution',
  'owner_draw',
  'reversal',
  'distribution',
]);
export type JournalEntryKindDto = z.infer<typeof JournalEntryKindSchema>;

export const LineSideSchema = z.enum(['debit', 'credit']);

export const CreateAccountRequestSchema = z
  .object({
    code: z.string().trim().min(2).max(20).regex(/^[A-Za-z0-9_-]+$/),
    name: z.string().trim().min(2).max(120),
    account_type: AccountTypeSchema,
    ownership_type: AccountOwnershipTypeSchema.default('business'),
    parent_id: z.string().uuid().nullable().optional(),
  })
  .strict();

export type CreateAccountRequest = z.infer<typeof CreateAccountRequestSchema>;

export interface AccountDto {
  id: string;
  organization_id: string;
  code: string;
  name: string;
  account_type: AccountTypeDto;
  ownership_type: AccountOwnershipTypeDto;
  is_system: boolean;
  is_active: boolean;
  parent_id: string | null;
  created_at: string;
}

export const CreatePeriodRequestSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .strict();

export type CreatePeriodRequest = z.infer<typeof CreatePeriodRequestSchema>;

export const ReopenPeriodRequestSchema = z
  .object({
    reason: z.string().trim().min(10, 'Written reason of at least 10 characters is required (BR-004)').max(500),
  })
  .strict();

export type ReopenPeriodRequest = z.infer<typeof ReopenPeriodRequestSchema>;

export interface PeriodDto {
  id: string;
  organization_id: string;
  name: string;
  start_date: string;
  end_date: string;
  status: PeriodStatusDto;
  tb_hash: string | null;
  closed_at: string | null;
  reopened_reason: string | null;
}

export const JournalLineDraftSchema = z
  .object({
    account_id: z.string().uuid(),
    side: LineSideSchema,
    amount_minor: PositiveAmountMinorStringSchema,
    currency: CurrencyCodeSchema,
    party_id: z.string().uuid().nullable().optional(),
    memo: z.string().trim().max(300).optional(),
  })
  .strict();

export const CreateJournalDraftRequestSchema = z
  .object({
    entry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    description: z.string().trim().min(2).max(300),
    kind: JournalEntryKindSchema.default('standard'),
    source: z.string().trim().min(1).max(64).default('manual'),
    external_id: z.string().trim().min(1).max(128).nullable().optional(),
    lines: z.array(JournalLineDraftSchema).min(2),
  })
  .strict();

export type CreateJournalDraftRequest = z.infer<typeof CreateJournalDraftRequestSchema>;

export const ReverseJournalEntryRequestSchema = z
  .object({
    reason: z.string().trim().min(5).max(300),
    reversal_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .strict();

export type ReverseJournalEntryRequest = z.infer<typeof ReverseJournalEntryRequestSchema>;

export interface JournalLineDto {
  id: string;
  organization_id: string;
  entry_id: string;
  line_no: number;
  account_id: string;
  party_id: string | null;
  side: 'debit' | 'credit';
  amount_minor: string;
  currency: string;
  memo: string | null;
}

export interface JournalEntryDto {
  id: string;
  organization_id: string;
  entry_no: string | null;
  entry_date: string;
  description: string;
  kind: JournalEntryKindDto;
  status: 'draft' | 'posted';
  reverses_entry_id: string | null;
  source: string;
  external_id: string | null;
  posted_by: string | null;
  posted_at: string | null;
  created_at: string;
  lines: JournalLineDto[];
}

export const CreateBankAccountRequestSchema = z
  .object({
    account_id: z.string().uuid(),
    institution: z.string().trim().min(2).max(120),
    last4: z.string().regex(/^\d{4}$/, 'Store last 4 digits only (DATA_PROTECTION.md)'),
    ownership_type: AccountOwnershipTypeSchema,
    opening_balance_minor: AmountMinorStringSchema.default('0'),
    currency: CurrencyCodeSchema,
  })
  .strict();

export type CreateBankAccountRequest = z.infer<typeof CreateBankAccountRequestSchema>;

export interface BankAccountDto {
  id: string;
  organization_id: string;
  account_id: string;
  institution: string;
  last4: string;
  ownership_type: AccountOwnershipTypeDto;
  opening_balance_minor: string;
  current_balance_minor: string;
  currency: string;
  is_active: boolean;
  created_at: string;
}

export const CreateTransferRequestSchema = z
  .object({
    from_account_id: z.string().uuid(),
    to_account_id: z.string().uuid(),
    amount_minor: PositiveAmountMinorStringSchema,
    fee_amount_minor: AmountMinorStringSchema.default('0'),
    fee_account_id: z.string().uuid().optional(),
    currency: CurrencyCodeSchema,
    transfer_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    description: z.string().trim().min(2).max(300).default('Internal account transfer'),
  })
  .strict();

export type CreateTransferRequest = z.infer<typeof CreateTransferRequestSchema>;

export const ImportCsvTransactionsRequestSchema = z
  .object({
    bank_account_id: z.string().uuid(),
    source: z.string().trim().min(1).max(64).default('csv_import'),
    csv_text: z.string().min(1).max(1_000_000),
  })
  .strict();

export type ImportCsvTransactionsRequest = z.infer<typeof ImportCsvTransactionsRequestSchema>;

export const PostBankTransactionRequestSchema = z
  .object({
    offset_account_id: z.string().uuid(),
    ownership_classification: AccountOwnershipTypeSchema.default('business'),
    kind: JournalEntryKindSchema.default('standard'),
    party_id: z.string().uuid().nullable().optional(),
  })
  .strict();

export type PostBankTransactionRequest = z.infer<typeof PostBankTransactionRequestSchema>;

export interface BankTransactionDto {
  id: string;
  organization_id: string;
  bank_account_id: string;
  tx_date: string;
  amount_minor: string;
  currency: string;
  description: string;
  source: string;
  external_id: string | null;
  fingerprint: string;
  status: 'pending_review' | 'ready' | 'duplicate_held' | 'posted' | 'reconciled';
  linked_entry_id: string | null;
  created_at: string;
}

export const StartReconciliationRequestSchema = z
  .object({
    bank_account_id: z.string().uuid(),
    statement_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    statement_ending_balance_minor: AmountMinorStringSchema,
  })
  .strict();

export type StartReconciliationRequest = z.infer<typeof StartReconciliationRequestSchema>;

export const MatchReconciliationRequestSchema = z
  .object({
    bank_transaction_id: z.string().uuid(),
    journal_entry_id: z.string().uuid(),
  })
  .strict();

export type MatchReconciliationRequest = z.infer<typeof MatchReconciliationRequestSchema>;

export interface ReconciliationDto {
  id: string;
  organization_id: string;
  bank_account_id: string;
  statement_date: string;
  statement_ending_balance_minor: string;
  matched_total_minor: string;
  difference_minor: string;
  status: 'in_progress' | 'completed';
  locked_at: string | null;
  matches: Array<{
    id: string;
    bank_transaction_id: string;
    journal_entry_id: string;
  }>;
}

export interface TrialBalanceRowDto {
  account_id: string;
  code: string;
  name: string;
  account_type: AccountTypeDto;
  ownership_type: AccountOwnershipTypeDto;
  debit_total_minor: string;
  credit_total_minor: string;
  net_balance_minor: string;
}

export interface TrialBalanceReportDto {
  organization_id: string;
  currency: string;
  as_of_date: string;
  rows: TrialBalanceRowDto[];
  total_debits_minor: string;
  total_credits_minor: string;
  is_balanced: boolean;
}

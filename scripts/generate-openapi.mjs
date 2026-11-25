import fs from 'node:fs';
import path from 'node:path';

/**
 * Generates OpenAPI 3.1.0 specification matching packages/contracts and /v1 API routes
 * (API_SPECIFICATION.md §6, ADR-0006).
 */
const spec = {
  openapi: '3.1.0',
  info: {
    title: 'Financial Management SaaS API',
    version: '1.0.0',
    description:
      'Multi-tenant, double-entry immutable ledger Financial Management SaaS API (/v1).',
  },
  servers: [{ url: '/v1', description: 'API v1 base path' }],
  components: {
    securitySchemes: {
      cookieSession: {
        type: 'apiKey',
        in: 'cookie',
        name: '__Host-fs_session',
        description: 'BFF httpOnly signed session cookie (ADR-0004)',
      },
      csrfToken: {
        type: 'apiKey',
        in: 'header',
        name: 'X-CSRF-Token',
      },
      organizationHeader: {
        type: 'apiKey',
        in: 'header',
        name: 'X-Organization-Id',
      },
    },
    schemas: {
      Money: {
        type: 'object',
        required: ['amount_minor', 'currency'],
        additionalProperties: false,
        properties: {
          amount_minor: { type: 'string', pattern: '^-?(0|[1-9][0-9]*)$' },
          currency: { type: 'string', pattern: '^[A-Z]{3}$' },
        },
      },
      ProblemDetails: {
        type: 'object',
        required: ['type', 'title', 'status', 'request_id'],
        additionalProperties: false,
        properties: {
          type: { type: 'string' },
          title: { type: 'string' },
          status: { type: 'integer', minimum: 400, maximum: 599 },
          detail: { type: 'string' },
          instance: { type: 'string' },
          request_id: { type: 'string' },
        },
      },
    },
  },
  paths: {
    '/health': { get: { summary: 'Health check', responses: { '200': { description: 'OK' } } } },
    '/auth/signup': { post: { summary: 'Register account (min 12-char password)', responses: { '202': { description: 'Verification sent' } } } },
    '/auth/login': { post: { summary: 'Sign in and issue BFF httpOnly session + CSRF cookies', responses: { '200': { description: 'Authenticated' } } } },
    '/auth/logout': { post: { summary: 'Clear session and CSRF cookies', responses: { '200': { description: 'Signed out' } } } },
    '/auth/session': { get: { summary: 'Verify current cookie session', responses: { '200': { description: 'Active session' } } } },
    '/organizations': {
      get: { summary: 'List member organizations', responses: { '200': { description: 'Organization list' } } },
      post: { summary: 'Create organization (creator becomes Owner)', responses: { '201': { description: 'Created' } } },
    },
    '/members': { get: { summary: 'List organization members', responses: { '200': { description: 'Members' } } } },
    '/members/invite': { post: { summary: 'Invite member with assigned role', responses: { '201': { description: 'Invited' } } } },
    '/members/{memberId}': {
      patch: { summary: 'Update member role (last Owner protected)', responses: { '200': { description: 'Updated' } } },
      delete: { summary: 'Remove member (last Owner protected)', responses: { '200': { description: 'Removed' } } },
    },
    '/audit-events': { get: { summary: 'List hash-chained audit events', responses: { '200': { description: 'Audit events' } } } },
    '/audit-events/verify': { post: { summary: 'Verify per-organization audit SHA-256 chain', responses: { '200': { description: 'Verification result' } } } },
    '/accounts': {
      get: { summary: 'List Chart of Accounts', responses: { '200': { description: 'Accounts' } } },
      post: { summary: 'Create account (business or personal)', responses: { '201': { description: 'Created' } } },
    },
    '/accounts/seed-template': { post: { summary: 'Seed default Chart of Accounts template', responses: { '201': { description: 'Seeded' } } } },
    '/periods': {
      get: { summary: 'List accounting periods', responses: { '200': { description: 'Periods' } } },
      post: { summary: 'Open accounting period', responses: { '201': { description: 'Created' } } },
    },
    '/periods/{periodId}/close': { post: { summary: 'Close period and store Trial Balance hash', responses: { '200': { description: 'Closed' } } } },
    '/periods/{periodId}/reopen': { post: { summary: 'Reopen closed period (Owner + written reason)', responses: { '200': { description: 'Reopened' } } } },
    '/journal-entries': {
      get: { summary: 'List journal entries', responses: { '200': { description: 'Entries' } } },
      post: { summary: 'Create journal draft', responses: { '201': { description: 'Draft created' } } },
    },
    '/journal-entries/{entryId}/post': { post: { summary: 'Atomically post balanced draft with gapless entry_no', responses: { '200': { description: 'Posted' } } } },
    '/journal-entries/{entryId}/reverse': { post: { summary: 'Post reversing entry linked to original (BR-003)', responses: { '201': { description: 'Reversed' } } } },
    '/ledger': { get: { summary: 'General Ledger (posted entries only)', responses: { '200': { description: 'Posted entries' } } } },
    '/trial-balance': { get: { summary: 'Company Trial Balance (business accounts)', responses: { '200': { description: 'Trial Balance' } } } },
    '/bank-accounts': {
      get: { summary: 'List bank and cash accounts', responses: { '200': { description: 'Bank accounts' } } },
      post: { summary: 'Create bank/cash account (last4 only)', responses: { '201': { description: 'Created' } } },
    },
    '/transfers': { post: { summary: 'Post internal transfer without income/expense (BR-005)', responses: { '201': { description: 'Posted' } } } },
    '/bank-transactions': { get: { summary: 'List imported bank transactions', responses: { '200': { description: 'Transactions' } } } },
    '/imports': { post: { summary: 'Import CSV bank statement with duplicate detection', responses: { '201': { description: 'Imported' } } } },
    '/bank-transactions/{txId}/post': { post: { summary: 'Classify and post imported bank transaction', responses: { '200': { description: 'Posted' } } } },
    '/reconciliations': {
      get: { summary: 'List bank reconciliations', responses: { '200': { description: 'Reconciliations' } } },
      post: { summary: 'Start bank reconciliation', responses: { '201': { description: 'Started' } } },
    },
    '/reconciliations/{recId}/match': { post: { summary: 'Match bank line 1:1 to posted journal entry', responses: { '200': { description: 'Matched' } } } },
    '/reconciliations/{recId}/complete': { post: { summary: 'Complete and lock zero-difference reconciliation', responses: { '200': { description: 'Completed' } } } },
    '/parties': {
      get: { summary: 'List parties', responses: { '200': { description: 'Parties' } } },
      post: { summary: 'Create party record', responses: { '201': { description: 'Created' } } },
    },
    '/parties/{partyId}/ledger': { get: { summary: 'Filtered individual ledger for party (BR-017)', responses: { '200': { description: 'Individual ledger' } } } },
    '/parties/{partyId}/pseudonymize': { post: { summary: 'GDPR pseudonymize party without altering ledger (BR-019)', responses: { '200': { description: 'Pseudonymized' } } } },
    '/expenses': { post: { summary: 'Record company vs personal expense (BR-009)', responses: { '201': { description: 'Posted' } } } },
    '/invoices-bills': {
      get: { summary: 'List open-item invoices, bills, subscriptions', responses: { '200': { description: 'Documents' } } },
      post: { summary: 'Create invoice, bill, or subscription', responses: { '201': { description: 'Created' } } },
    },
    '/invoices-bills/{docId}/allocate': { post: { summary: 'Allocate payment toward open AP/AR balance (BR-015)', responses: { '200': { description: 'Allocated' } } } },
    '/investors/contributions': { post: { summary: 'Record investor equity or loan contribution (BR-007)', responses: { '201': { description: 'Posted' } } } },
    '/profit-sharing/agreements': {
      get: { summary: 'List versioned profit-sharing agreements', responses: { '200': { description: 'Agreements' } } },
      post: { summary: 'Create effective-dated agreement summing to 100%', responses: { '201': { description: 'Created' } } },
    },
    '/profit-sharing/distributions': {
      get: { summary: 'List profit distributions', responses: { '200': { description: 'Distributions' } } },
      post: { summary: 'Run closed-period profit distribution (BR-010/011)', responses: { '201': { description: 'Executed' } } },
    },
    '/profit-sharing/distributions/{distId}/pay': { post: { summary: 'Record payout of distribution entitlements', responses: { '200': { description: 'Paid' } } } },
    '/compensation/arrangements': {
      get: { summary: 'List compensation arrangements', responses: { '200': { description: 'Arrangements' } } },
      post: { summary: 'Create effective-dated compensation arrangement', responses: { '201': { description: 'Created' } } },
    },
    '/salary-runs': {
      get: { summary: 'List salary accruals and runs', responses: { '200': { description: 'Salary runs' } } },
      post: { summary: 'Accrue salary expense and payable (BR-014)', responses: { '201': { description: 'Accrued' } } },
    },
    '/salary-runs/{runId}/pay': { post: { summary: 'Pay accrued salary run', responses: { '200': { description: 'Paid' } } } },
    '/assets': {
      get: { summary: 'List fixed assets register', responses: { '200': { description: 'Assets' } } },
      post: { summary: 'Capitalize fixed asset purchase', responses: { '201': { description: 'Created' } } },
    },
    '/liabilities': {
      get: { summary: 'List liabilities register', responses: { '200': { description: 'Liabilities' } } },
      post: { summary: 'Record loan liability origination', responses: { '201': { description: 'Created' } } },
    },
    '/ebay/payouts': { post: { summary: 'Post eBay sales, fees, shipping, refunds, and clearing settlement', responses: { '201': { description: 'Posted' } } } },
    '/dashboard': { get: { summary: 'Live KPI dashboard, monthly and yearly comparisons', responses: { '200': { description: 'Dashboard summary' } } } },
    '/reports/pnl': { get: { summary: 'Profit & Loss statement', responses: { '200': { description: 'P&L' } } } },
    '/reports/balance-sheet': { get: { summary: 'Balance Sheet statement', responses: { '200': { description: 'Balance Sheet' } } } },
    '/reports/cash-flow': { get: { summary: 'Cash Flow statement', responses: { '200': { description: 'Cash Flow' } } } },
    '/reports/export': { get: { summary: 'Audited CSV, XLSX, or PDF report export', responses: { '200': { description: 'Export attachment' } } } },
  },
};

const outPath = path.join(process.cwd(), 'docs', 'architecture', 'openapi.v1.json');
fs.writeFileSync(outPath, `${JSON.stringify(spec, null, 2)}\n`, 'utf8');
console.log(`Generated ${path.relative(process.cwd(), outPath)} with ${Object.keys(spec.paths).length} paths.`);

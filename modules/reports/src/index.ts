import {
  ApiDomainError,
  hasRolePermission,
  type AuthUser,
  type BalanceSheetReportDto,
  type CashFlowReportDto,
  type DashboardSummaryDto,
  type DateRangeFilter,
  type ExportReportQuery,
  type PlatformContext,
} from '@financial-saas/contracts';
import {
  buildFinancialPdf,
  buildXlsxWorkbook,
  computeBalanceSheet,
  computeCashFlowStatement,
  computeDashboardSummary,
  computeProfitAndLoss,
  formatMinorUnits,
  money,
  serializeCsv,
  type ProfitAndLossSummary,
} from '@financial-saas/ledger-core';
import type { LedgerModule } from '@financial-saas/ledger';

export interface ExportedReportFile {
  filename: string;
  contentType: string;
  bytes: Uint8Array;
}

/**
 * Public interface of modules/reports (Phase 6).
 * Reads exclusively through LedgerModule public interface and pure ledger-core calculators.
 */
export class ReportsModule {
  constructor(
    private readonly ctx: PlatformContext,
    private readonly ledger: LedgerModule
  ) {}

  private async requireReportsRead(user: AuthUser, orgId: string): Promise<void> {
    const { role } = await this.ctx.requirePermission(user, orgId, 'organizations:read');
    if (
      !hasRolePermission(role, 'reports:read') &&
      !hasRolePermission(role, 'reports:read_scoped')
    ) {
      throw new ApiDomainError(403, 'Insufficient permissions');
    }
  }

  async getDashboardSummary(
    user: AuthUser,
    orgId: string,
    filter: DateRangeFilter
  ): Promise<DashboardSummaryDto> {
    await this.requireReportsRead(user, orgId);
    const [baseCurrency, accounts, entries] = await Promise.all([
      this.ctx.getOrganizationBaseCurrency(user, orgId),
      this.ledger.listAccounts(user, orgId),
      this.ledger.listEntriesForReports(user, orgId),
    ]);

    return computeDashboardSummary({
      organizationId: orgId,
      baseCurrency,
      startDate: filter.start_date,
      endDate: filter.end_date,
      accounts,
      entries,
      accountId: filter.account_id,
      partyId: filter.party_id,
    });
  }

  async getProfitAndLoss(
    user: AuthUser,
    orgId: string,
    filter: DateRangeFilter
  ): Promise<ProfitAndLossSummary> {
    await this.requireReportsRead(user, orgId);
    const [baseCurrency, accounts, entries] = await Promise.all([
      this.ctx.getOrganizationBaseCurrency(user, orgId),
      this.ledger.listAccounts(user, orgId),
      this.ledger.listEntriesForReports(user, orgId),
    ]);

    const scopedEntries = entries.filter((e) => {
      if (e.status !== 'posted') return false;
      if (!filter.account_id && !filter.party_id) return true;
      return e.lines.some(
        (l) =>
          (!filter.account_id || l.account_id === filter.account_id) &&
          (!filter.party_id || l.party_id === filter.party_id)
      );
    });

    return computeProfitAndLoss({
      organizationId: orgId,
      baseCurrency,
      startDate: filter.start_date,
      endDate: filter.end_date,
      accounts,
      entries: scopedEntries,
    });
  }

  async getBalanceSheet(
    user: AuthUser,
    orgId: string,
    asOfDate: string
  ): Promise<BalanceSheetReportDto> {
    await this.requireReportsRead(user, orgId);
    const [baseCurrency, accounts, entries] = await Promise.all([
      this.ctx.getOrganizationBaseCurrency(user, orgId),
      this.ledger.listAccounts(user, orgId),
      this.ledger.listEntriesForReports(user, orgId),
    ]);

    return computeBalanceSheet({
      organizationId: orgId,
      baseCurrency,
      asOfDate,
      accounts,
      entries,
    });
  }

  async getCashFlow(
    user: AuthUser,
    orgId: string,
    startDate: string,
    endDate: string
  ): Promise<CashFlowReportDto> {
    await this.requireReportsRead(user, orgId);
    const [baseCurrency, accounts, entries] = await Promise.all([
      this.ctx.getOrganizationBaseCurrency(user, orgId),
      this.ledger.listAccounts(user, orgId),
      this.ledger.listEntriesForReports(user, orgId),
    ]);

    return computeCashFlowStatement({
      organizationId: orgId,
      baseCurrency,
      startDate,
      endDate,
      accounts,
      entries,
    });
  }

  /**
   * BR-021 / T-19 / DATA_PROTECTION §7: Permission-checked, formula-neutralized, audited exports.
   */
  async exportReport(
    user: AuthUser,
    orgId: string,
    query: ExportReportQuery,
    requestId: string
  ): Promise<ExportedReportFile> {
    await this.ctx.requirePermission(user, orgId, 'data:export');

    let title = '';
    let headers: string[] = [];
    let rows: string[][] = [];

    if (query.report === 'pnl') {
      const pnl = await this.getProfitAndLoss(user, orgId, {
        start_date: query.start_date,
        end_date: query.end_date,
      });
      title = `Profit & Loss (${query.start_date} to ${query.end_date})`;
      headers = ['Code', 'Account', 'Category', `Amount (${pnl.currency})`];
      rows = pnl.lines.map((l) => [
        l.code,
        l.name,
        l.account_type,
        formatMinorUnits(money(l.net_minor, pnl.currency)),
      ]);
      rows.push(['', 'Net Profit', 'summary', formatMinorUnits(money(pnl.net_profit_minor, pnl.currency))]);
    } else if (query.report === 'balance-sheet') {
      const bs = await this.getBalanceSheet(user, orgId, query.end_date);
      title = `Balance Sheet (as of ${query.end_date})`;
      headers = ['Code', 'Account', 'Section', `Balance (${bs.currency})`];
      rows = [
        ...bs.assets.map((a) => [a.code, a.name, 'asset', formatMinorUnits(money(a.balance_minor, bs.currency))]),
        ...bs.liabilities.map((l) => [l.code, l.name, 'liability', formatMinorUnits(money(l.balance_minor, bs.currency))]),
        ...bs.equity.map((e) => [e.code, e.name, 'equity', formatMinorUnits(money(e.balance_minor, bs.currency))]),
        ['', 'Current Period Net Income', 'equity', formatMinorUnits(money(bs.current_net_income_minor, bs.currency))],
      ];
    } else if (query.report === 'trial-balance') {
      const tb = await this.ledger.getTrialBalance(user, orgId, query.end_date);
      title = `Trial Balance (as of ${query.end_date})`;
      headers = ['Code', 'Account', 'Type', `Debits (${tb.currency})`, `Credits (${tb.currency})`];
      rows = tb.rows.map((r) => [
        r.code,
        r.name,
        r.account_type,
        formatMinorUnits(money(r.debit_total_minor, tb.currency)),
        formatMinorUnits(money(r.credit_total_minor, tb.currency)),
      ]);
    } else if (query.report === 'cash-flow') {
      const cf = await this.getCashFlow(user, orgId, query.start_date, query.end_date);
      title = `Cash Flow Statement (${query.start_date} to ${query.end_date})`;
      headers = ['Activity', 'Item', `Amount (${cf.currency})`];
      rows = [
        ...cf.items.map((i) => [i.activity, i.label, formatMinorUnits(money(i.amount_minor, cf.currency))]),
        ['summary', 'Net Cash Change', formatMinorUnits(money(cf.net_cash_change_minor, cf.currency))],
        ['summary', 'Closing Cash', formatMinorUnits(money(cf.closing_cash_minor, cf.currency))],
      ];
    } else {
      const pnl = await this.getProfitAndLoss(user, orgId, {
        start_date: query.start_date,
        end_date: query.end_date,
      });
      title = `Expense Report (${query.start_date} to ${query.end_date})`;
      headers = ['Code', 'Expense Account', `Amount (${pnl.currency})`];
      rows = pnl.lines
        .filter((l) => l.account_type === 'expense')
        .map((l) => [l.code, l.name, formatMinorUnits(money(l.net_minor, pnl.currency))]);
    }

    await this.ctx.appendAudit({
      organizationId: orgId,
      actorId: user.userId,
      actorType: 'user',
      action: 'report.exported',
      entityType: 'report',
      entityId: query.report,
      payload: { format: query.format, start_date: query.start_date, end_date: query.end_date },
      requestId,
    });

    const baseName = `${query.report}-${query.start_date}-to-${query.end_date}`;
    if (query.format === 'csv') {
      const csvText = serializeCsv(headers, rows);
      return {
        filename: `${baseName}.csv`,
        contentType: 'text/csv; charset=utf-8',
        bytes: new TextEncoder().encode(csvText),
      };
    }
    if (query.format === 'xlsx') {
      return {
        filename: `${baseName}.xlsx`,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        bytes: buildXlsxWorkbook({ sheetName: query.report, headers, rows }),
      };
    }
    const pdfLines = [
      headers.join(' | '),
      '-'.repeat(72),
      ...rows.map((r) => r.join(' | ')),
    ];
    return {
      filename: `${baseName}.pdf`,
      contentType: 'application/pdf',
      bytes: buildFinancialPdf({
        title,
        subtitle: `Organization ${orgId}`,
        lines: pdfLines,
      }),
    };
  }
}

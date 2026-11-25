# Competitor Analysis

| Field | Value |
|---|---|
| Version | 0.1.0 (Draft) |
| Last updated | 2026-11-26 |
| Status | Draft - pending human review |

**Purpose:** Record publicly available features of reference products, our sources and research date, and the opportunities and gaps they suggest. No proprietary design or code is copied.

**Related:** `PRD.md`, `ROADMAP.md`, `OPEN_QUESTIONS.md`

**Research date:** 2026-11-26. **Method:** public web pages and public articles only; no hands-on testing, no trials. Vendor pages are marketing and third-party blogs may be biased or dated. Treat all findings as leads to verify before product decisions.

## 1. Findings by product
### A2X (ecommerce-to-accounting connector)
- Posts summarized journals into Xero as invoices so payouts reconcile to the bank feed; supports eBay Managed Payments payout reconciliation, COGS posting, historical load of up to a year, multi-currency, and mapping to the chart of accounts. Source: A2X listing on Xero App Store, https://apps.xero.com/app/a2x (and regional pages).
- It is a connector, so the user still needs a separate accounting package (Xero or QuickBooks).

### Seller Ledger
- Bookkeeping built for marketplace sellers (eBay, Etsy, Amazon and others), created by the founder of Outright/GoDaddy Bookkeeping. Adds inventory-to-COGS tracking, a shipping profit report, transaction splitting; intentionally omits invoicing and time tracking. Sources: EcommerceBytes (2023-03-09 and 2023-10-23), https://www.ecommercebytes.com/2023/03/09/seller-ledger-picks-up-where-godaddy-bookkeeping-left-off/ ; eSeller365 articles; PR Newswire release.
- Pricing figures differ by source and date (launch article cited $50/month; Shopify listing shows from $10/month). Do not rely on either. A GetApp page states no public API (may be outdated).

### QuickBooks Online
- eBay connector, financial and inventory reports, multi-currency and payment reconciliation per Intuit's eBay page, https://quickbooks.intuit.com/au/industry/ecommerce/ebay/ . Third-party sync tools (Webgility, Synder, ConnectBooks) add per-transaction or summary sync, fee capture and multi-store handling. Synder describes a "Summary Sync" that rolls a period into one journal entry (https://synder.com/integrations/quickbooks/ebay). A vendor blog claims QuickBooks reports lack ecommerce-specific insight (biased source).

### Xero
- Bank feeds from 21,000+ institutions and reconciliation automation, multi-currency (160+ currencies), reporting, large app ecosystem. Sources: https://xero.com/uk/accounting-software/all-features/ and https://www.xero.com/us/small-businesses/xero-for-medium-sized-business/ . A 2026 review (aspireapp.com) says multi-currency sits on the highest of three plans. Some Capterra reviewers report multi-currency limits.

### Zoho Books
- Bank feeds, rules-based categorization, reconciliation (AI-assisted per Zoho blog), audit trail, multi-company, multi-currency (reported on higher plans by Geekflare). Sources: https://www.zoho.com/books/accounting-software-features/ ; https://www.zoho.com/blog/index.php/books/banking-enhancements.html ; Capterra listing.

## 2. Useful features to adopt (our own design)
1. Marketplace clearing account with payout-level reconciliation (the core eBay pain; see `ACCOUNTING_MODEL.md`).
2. Fee and shipping profit visibility per order.
3. Bank rules and suggested matches; duplicate flags.
4. Summary vs detail posting choice for high-volume sellers (open design question).
5. Multi-store, multi-currency from day one.

## 3. Gaps and opportunities
In the sources reviewed we did not find prominent support for: separating personal and business money in one workspace, investor capital with historical profit-sharing percentages, or per-party individual ledgers. This is an absence in the pages we read, not proof the products lack it; verify with trials before building marketing claims on it.
- Immutable, tamper-evident ledger with visible audit trail as a selling point.
- A simpler all-in-one for sellers (no separate connector plus accounting package).
- Tight eBay Dashboard integration via versioned API.

## 4. Risks
Established vendors have large ecosystems, bank feeds and compliance coverage that take years to match. Tax compliance by country is a major scope risk (OQ-011).

## 5. Next research steps
Run hands-on trials, review each vendor's published API and terms, check eBay API terms for data use, and re-date this file.

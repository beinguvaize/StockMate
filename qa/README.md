# QA Test Suite

Playwright e2e tests for StockMate / Ledger ERP.

## Setup

```bash
cd qa
npm install   # uses playwright.package.json → rename to package.json if needed
npx playwright install chromium
```

## Run

```bash
# Against local dev server
npx playwright test --project=chromium

# Against Vercel / staging
BASE_URL=https://your-app.vercel.app npx playwright test --project=chromium

# Specific module
npx playwright test tests/04-sales.spec.ts

# View report
npx playwright show-report
```

## Structure

| File | Module | Tests |
|------|--------|-------|
| 01-login.spec.ts | Auth | 6 |
| 02-dashboard.spec.ts | Dashboard | 4 |
| 03-inventory.spec.ts | Inventory | 8 |
| 04-sales.spec.ts | Sales / POS | 7 |
| 05-clients.spec.ts | Clients | 6 |
| 06-expenses.spec.ts | Expenses | 5 |
| 07-daybook.spec.ts | Day Book | 3 |
| 08-invoices.spec.ts | Invoices | 4 |
| 09-purchases.spec.ts | Purchases | 4 |
| 10-suppliers.spec.ts | Suppliers | 4 |
| 11-vehicles.spec.ts | Vehicles | 5 |
| 12-orders.spec.ts | Orders | 3 |
| 13-payroll.spec.ts | Payroll | 5 |
| 14-reports.spec.ts | Reports | 6 |
| 15-users.spec.ts | Users | 5 |
| 16-settings.spec.ts | Settings | 4 |
| 17-security.spec.ts | Security | 9 |
| 18-navigation.spec.ts | Navigation | 7 |

**Last run:** 109 pass / 3 skip / 0 fail

See `BUG_REPORT.md` for all findings.

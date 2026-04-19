# StockMate Knowledge Wiki Index

This wiki provides a modular breakdown of the StockMate ERP features, their architectural components, and associated database entities.

## [Module] Core & Tenancy
*Master orchestration and multi-tenant isolation.*
- **Context**: [TenantContext.jsx], [AuthContext.jsx]
- **Database**: `tenants`, `users`
- **Key Files**: `src/lib/tenancy.js`, `src/App.jsx`

## [Module] Sales & CRM
*Order management, client ledger, and revenue tracking.*
- **Context**: [SalesContext.jsx]
- **Database**: `sales`, `clients`, `client_payments`, `invoices`
- **Key Files**: `src/pages/Sales.jsx`, `src/pages/ClientSettlement.jsx`

## [Module] Inventory & Logistics
*Multi-location stock tracking and fleet management.*
- **Context**: [InventoryContext.jsx]
- **Database**: `products`, `inventory_balances`, `movement_log`, `vehicles`, `routes`
- **Key Files**: `src/pages/Inventory.jsx`, `src/pages/Vehicles.jsx`

## [Module] Finance (General Ledger)
*Double-entry bookkeeping and financial reporting.*
- **Context**: [FinanceContext.jsx]
- **Database**: `gl_accounts`, `gl_journals`, `gl_lines`, `expenses`, `day_book`
- **Key Files**: `src/pages/DayBook.jsx`, `src/pages/Reports.jsx`

## [Module] Human Resources
*Employee records and payroll processing.*
- **Context**: [HRContext.jsx]
- **Database**: `employees`, `payroll`
- **Key Files**: `src/pages/Payroll.jsx`, `src/pages/Users.jsx`

---

> [!TIP]
> Each module is government by its own **Context Provider** to ensure that data remains encapsulated and side-effects (like GL updates) are handled consistently throughout the app.

> [!IMPORTANT]
> **Plan-Gate Enforcement**: Access to modules like `purchases`, `payroll`, and `vehicles` is gated both in the UI and at the database layer (via `has_module_access` RLS functions).

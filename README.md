# Nova Scotia Immigration Tracker

## Environments

| Environment | Purpose | Database | Access |
| :--- | :--- | :--- | :--- |
| **Local Dev** | Workspace for development and testing | `ledgrpro-dev` | `.env` |
| **Staging** | Pre-production testing | `ledgrpro-test` | `.env.staging` (push to `develop` branch) |
| **Production** | Live site | `ledgrpro-prd` | Vercel (push to `main` branch) |

## ✅ Development Rules

- **Always work on the `develop` branch.**
- **Always test on `ledgrpro-test` (Local Dev) first.**
- **Always create a backup before making schema changes.**
- **Only push to Staging by merging to the `develop` branch.**
- **Only push to Production by merging `develop` into `main`.**

## 🗄️ Database Change Rules

### Before ANY schema change (ALTER, DROP, CREATE TABLE):
- 🔒 **Always create a backup first:**

- 🧪 **Always make changes on `ledgrpro-dev` ONLY.**
- ❌ **Never touch `ircc` (production) directly.**

### Guidelines by Change Type:
- **Adding a new column:**
  - Use `ALTER TABLE ... ADD COLUMN` ✅
  - Never `DROP` and recreate the table ❌
- **Modifying a column:**
  - Create new table → copy data → drop old → rename ✅
  - Always wrap in `BEGIN TRANSACTION` and `COMMIT`
  - Always verify row count before and after
- **Foreign keys:**
  - Always use `ON DELETE RESTRICT` ✅
  - Never use `ON DELETE CASCADE` ❌

### After ANY change:
- Run `SELECT COUNT(*) FROM [table]` to verify data.
- Test on dev before pushing to staging.
- **Never merge to `main` without USER approval.**

## ❌ Critical Restrictions

- **Never** commit directly to the `main` branch.
- **Never** modify the production `.env` on Vercel.
- **Never** perform `DROP` or `ALTER` table operations directly in Production.

---
*Note: Ensure `.env` and `.env.staging` are never committed to the repository.*

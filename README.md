# Ledgr ERP — Enterprise Operations Framework

Ledgr is a high-fidelity, high-performance ERP system designed for digital asset management, inventory synchronization, and real-time business telemetry.

## ⚠️ STRICT OPERATIONAL SAFEGUARDS (MANDATORY)

These rules are FINAL and LOCKED. No modifications are permitted to the design system or production status without explicit organizational override.

### 1. UI Theme & Design System (LOCKED)
The UI/UX architecture of Ledgr is finalized. Do **NOT** modify, adjust, or "improve" any of the following under any circumstances:
- **Color Palette**: All backgrounds, gradients, and brand-specific accent-signature colors.
- **Glassmorphism**: Existing `backdrop-blur`, `bg-opacity`, and glass-panel border styles.
- **Typography**: All font sizes, families (`Sora`, `Inter`, `Bebas Neue`), and weights.
- **Spacing System**: All vertical and horizontal padding, margin, and gap values.
- **Interactive Elements**: All button styles (Signature, Primary, Secondary), hover scales, and transitions.
- **Reporting Intelligence (Gilded Glass)**: The `ReportShell` and `ReportTable` architecture. This includes the precise `backdrop-blur-20px`, `bg-white/70`, and `shadow-premium` combinations that define the "Gilded Glass" report aesthetic.
- **Consistency Rule**: Any new components must **CLONE** any exact `className` structures from the most similar existing component in the codebase.

### 2. Production Database Integrity (LOCKED)
The **LedgeproProd** environment is the live system of record.
- **ZERO Table Deletion**: No `DROP TABLE` operations are ever permitted on the production database.
- **Non-Destructive Migrations**: Schema updates must be additive (new columns/tables) or safe modifications that preserve existing business records.
- **MCP Verification**: All database operations via AI agents must be audited to ensure zero risk to data persistence.

---

## Technical Stack
- **Frontend**: React + Vite + Tailwind CSS
- **Backend / DB**: Supabase (Postgres)
- **Design Methodology**: High-density Glassmorphism
- **Iconography**: Lucide React

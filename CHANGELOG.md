# Changelog

## 1.0.1

- Fixed broken logo and image assets in the desktop app (Windows + macOS).

## 1.0.0

First desktop release of StockMate — inventory, sales and logistics management.

### Desktop app
- Native desktop builds for Windows and macOS (Electron wrapper).
- Auto-update from GitHub Releases — new versions download in the
  background and install on quit.
- App icon and branded installer.

### Reports
- Unified single-page **Business Report**: revenue trend, KPIs,
  payment split, top products, client leaderboard, daily summary,
  purchases by supplier — no sub-tabs.
- **Daily Sales Detail**: per-day breakdown of every sale with
  client, products, payment method and a POS / Van source badge.
- Data-accuracy fixes across Logistics, Client Outstanding,
  Product Profitability and Financial reports.

### Van sales
- Van sale now opens as a full page with the same POS layout.
- Van sale invoicing records the customer name and correct item
  pricing, so van sales appear properly in all reports.

### Notes
- Requires an internet connection (cloud-backed).
- Installers are currently unsigned; Windows SmartScreen and macOS
  Gatekeeper will warn on first launch.

# AI chat: mobile checks and plan

Status: plan only, for sign-off with the Senior Developer. No code has been written.
Author: Mobile App Developer. Read against `origin/main` at `87dd91f`, `docs/ai-chat-v1.md` at `d91c56e`, and prod (`lmviftlynuhopzmvaxeu`), read-only.

Prod figures below are from SQL I wrote to mirror what each screen does. I did not run the app. Shops are numbered, not named, and nothing was written.

---

## 1. Result in brief

| Check | Result |
|---|---|
| `ClientAgingScreen` total ties to `outstanding_balance` | **Fails, in both directions** |
| `SalesSummaryScreen` shows the same profit as `get_pl_ranged` | **Fails.** It shows no rupee profit, and its margin is on a different basis |
| Reports hub net profit (the mobile profit figure that does exist) | **Fails when a shop has GST, returns or voids.** On Demo Kirana Store the sign is wrong |
| `DashboardScreen` expiry view | **Partly.** Counts and value only, with no tenant or soft-delete filter |
| `CRMScreen` total | **Ties.** It sums `outstanding_balance` |

The spec's definition of done needs every figure to tie to its linked screen on mobile. That cannot be met for `dues_age` or `profit_month` until §2 is settled.

---

## 2. Checks

### 2.1 `ClientAgingScreen` against `dues_age` and `top_dues`

The screen (`client_aging_screen.dart:43-145`) does not read `outstanding_balance` or `paidAmount`. It works out dues itself:

- it takes sales where `paymentMethod == 'CREDIT'`, from the newest 500 sales (`recentSalesProvider`, `sales_provider.dart:40`);
- it subtracts all payments, from the newest 500 payments (`clientPaymentsProvider`), oldest sale first;
- voided sales are not excluded;
- a client with no credit sale in those 500 rows is left out.

| | `outstanding_balance` | Aging screen total (my mirror) | Unpaid sales | Clients owing | Owing but missing from the screen |
|---|---|---|---|---|---|
| Shop 1 | ₹73,818.54 | **₹3,941.00** | ₹73,910.54 | 21 | 8 |
| Demo Kirana Store | ₹35,462.00 | **₹48,666.00** | ₹35,462.00 | 5 | 0 |

Why it fails:
- **Shop 1** has 1,496 live sales, so the 500-row limit cuts off older sales while payments still subtract.
- **Demo** reads too high because money taken at the sale is in `paidAmount`, not in `client_payments`, and the screen ignores `paidAmount`.
- **Across prod, ₹20,131.50 is owed on sales marked CASH** (25 part-paid sales), and the `CREDIT` filter drops all of it.

The bucket edges match (`<=30`, `<=60`, `<=90`, above). The screen also names its fields `overdue*`, and the spec's rule is "unpaid for". I did not confirm what the labels show on screen.

**Decision needed:**
- For v1, link `dues_age` to `CRMScreen`, the same as the web's `/clients`. This is a spec change.
- Log a separate fix: `ClientAgingScreen` should read unpaid sales by the same rule as `ai_dues_ageing`. It needs per-client buckets, so it should come from the server, not a second copy in Dart.

`ar_aging_screen.dart` is already ruled out by the spec. I did not re-check it.

### 2.2 `SalesSummaryScreen` against `profit_month`

**The screen has no profit figure.** It shows revenue, orders, average order value and "Gross Margin %". Other problems as a link target:

- It opens on the last 30 days, not month to date, and takes no range argument (`sales_summary_screen.dart:22`).
- Margin is `(totalAmount - totalCogs) / totalAmount` (`:119-123`), so GST is inside revenue.
- `fetchSales` filters only `deleted_at` (`reports_data_service.dart:12`). Voided, cancelled and refunded sales count.
- Returns are ignored.

The only rupee profit on mobile is the Reports hub (`reports_screen.dart`, `netProfit: totalSales - totalCogs - totalExpenses`). **Mobile never calls `get_pl_ranged`.**

Results for 1 Jan to 4 Nov 2026:

| | `get_pl_ranged` net profit | Reports hub (my mirror) | Gap | Explained by |
|---|---|---|---|---|
| Shop 1 | -₹42,074.54 | -₹39,609.80 | ₹2,464.74 | ₹14,608 of returns and 2 excluded sales. Not broken down further |
| Demo Kirana Store | **-₹32,929.41** | **+₹1,236.47** | ₹34,165.88 | Exactly the output GST |
| Shop 3 | ₹14,657.63 | ₹14,817.80 | ₹160.17 | Exactly the output GST |

Demo's margin reads 22.2% on `SalesSummaryScreen`, against 16.0% from `get_pl_ranged` (₹68,003.59 on ₹425,073.59).

Shop 1 for October alone ties exactly (-₹14,714.34), but only because that month had no GST, returns, voids or excluded expenses.

Also, the hub does not apply `exclude_from_pl`. Expenses matched in these three shops, but nothing stops them differing.

**Decision needed:**
- Mobile's profit should read `get_pl_ranged`. That changes a number owners already see, and the hub's comment deliberately leaves returns out. Profit is frozen, so this needs the owner's approval even though it changes no COGS logic.
- Recommended: the hub and `SalesSummaryScreen` both read `get_pl_ranged`, and `SalesSummaryScreen` accepts a range.
- If that is not ready for launch, `profit_month` on mobile shows the card with no link. A link to a screen showing a different profit is worse than no link.

### 2.3 `DashboardScreen` expiry view

`ExpiryAlertCard` shows counts of expired and soon-to-expire batches plus a value. There is no list, as the spec expected.

- **The query has no `tenant_id` filter** (`expiry_alert_card.dart:18-23`), so it breaks the CLAUDE.md rule and a global admin's card would total every shop.
- **It has no `deleted_at` filter**, and `product_batches` has that column.
- "Today" is the device date, not the shop's.

Follow-up: a small fix to the card. Separately, the dashboard is the app's home, so a link should return there, not push a second copy (§4).

### 2.4 The other deep links

| Question | Mobile screen | Finding |
|---|---|---|
| `sales_today` | `SalesSummaryScreen` | Opens on 30 days, includes voided sales. Needs a range argument and the countable-sale rule |
| `top_items` | `SalesSummaryScreen` | **No item view at all.** It lists sales. Link will not show the figure |
| `low_stock` | `InventoryReportScreen` | Uses `products.stock` only. The spec uses balances, with that as a fallback. Differs on up to 20 products (§12 #8) |
| `dead_stock` | `InventoryReportScreen`, Dead Stock tab | I found no RAW or SERVICE exclusion, so counts can differ by design. Tab cannot be opened directly |
| `top_dues` | `CRMScreen` | Ties (`crm_screen.dart:530`) |
| `collections_week` | `ClientPaymentsScreen` | No weekly total, and limited to the newest 500 receipts |
| `cash_bank` | `AccountsScreen` | Same rule as the spec, excludes LOAN (`:71`). Plan `accounts` is PRO, so the fallback is needed |
| `gst_collected` | `Gstr3bScreen` | Reads `invoices`, not `get_pl_ranged`. Include in the spec's ship check |
| `gst_gaps` | `PurchasesReportScreen` | Shows no bill number, GSTIN or HSN gaps, so the link does not show the figure |

---

## 3. Contract changes needed before building

These need the Senior Developer's agreement. Items 1-4 change the spec.

1. **Function name.** The spec says `ai-ask`; my brief says `ask-books`. I need one name. This plan uses `ai-ask`.

2. **Shared question list.** The spec keeps the registry in the function, and clients render `action: "list"`. My brief asks for a `shared/` JSON with fixtures. Both work together:
   - `shared/ai_chat/questions.json` is the one source of ids, categories, labels, `screen_key`, roles and modules.
   - The function bundles a copy, since it deploys from its own folder. A test fails if the two differ.
   - Clients still render the live `list` response. Dart holds no question list.
   - `shared/fixtures/ai_chat/` holds recorded `list` and `ask` responses, one per question and state. vitest and `flutter test` read the same files, and a Deno test checks the function produces them. Without that last test, fixtures can drift from the server.

3. **A card the client can draw without per-question code.** `figures` differs per question, so clients would need 12 hand-built layouts in JS and again in Dart, which is the copying TEAM.md forbids. Add a `card` block to the response:
   ```json
   {
     "title": "Sales today",
     "headline": {"label": "Sales", "value": 12450.5, "kind": "money"},
     "rows": [{"label": "Bills", "value": 31, "kind": "count"}],
     "table": {"columns": [{"label": "Item", "kind": "text"}], "rows": [["…"]]},
     "note": "GST on your sales, from your books."
   }
   ```
   `kind` is one of `money, count, qty, percent, date, days, text`. Labels arrive in the chosen language. Clients only format values.

4. **Link target with a period.** Replace `screen` with `{"key", "fallback_key", "params": {"from", "to"}}`, and let a question have no mobile target. Without the period, screens open on their own default range and will not match.

5. **Turn-on.** The spec stores this in `tenants.settings` and defines no write path. Mobile needs an owner-only RPC such as `ai_set_enabled(boolean)`, and `list` must report the state (`on`, `off`, `not_configured`). Otherwise a phone-only owner cannot turn it on.

6. **Screen text in Hindi.** The app has no i18n, and the chat's own text needs translating too. `list` should return a `strings` block. A small bundled copy from `shared/ai_chat/strings.json` covers first run and offline, when no list is cached.

7. **Refusals as data.** The `reason` list covers model failures only. Add `not_owner`, `suspended`, `module_locked`, `lang_unsupported` and `read_failed`, returned as JSON. In Flutter a non-2xx response throws `FunctionException`, so the body shape must be fixed for those too.

8. **Additive changes only.** Old APKs stay installed for a long time. Include a `contract_version`, and new keys and kinds must be safe to ignore. Mobile treats an unknown `screen_key` as no link, and an unknown `kind` as plain text.

No SQL change is asked for here beyond item 5. `ai_dues_ageing` per-client buckets are a later request (§2.1).

---

## 4. Flutter plan

### Files

New, under `lib/features/ai_chat/`:

| File | Purpose |
|---|---|
| `data/ai_chat_models.dart` | `AiQuestion`, `AiAnswer`, `AiCard`, `AiReason`. Parse the contract, ignore unknown keys |
| `data/ai_chat_client.dart` | The two calls and error mapping |
| `data/ai_chat_local.dart` | Language and cached list |
| `presentation/providers/ai_chat_provider.dart` | List, answers and language state |
| `presentation/ai_chat_screen.dart` | Category tabs, question cards, answer view |
| `presentation/widgets/ai_figures_card.dart` | Draws `card`, using `Money` for rupees |
| `presentation/widgets/ai_turn_on_sheet.dart` | First-use notice |
| `presentation/widgets/ai_language_picker.dart` | English / हिन्दी |
| `presentation/ai_screen_routes.dart` | `screen_key` to mobile screen |

Changed: `menu_screen.dart` (entry). Later, and separately: `SalesSummaryScreen` gains a range argument, `InventoryReportScreen` gains an initial tab.

### Calling the function

```dart
final session = supabase.auth.currentSession;
if (session == null) throw const AiSignedOut();
final res = await supabase.functions.invoke('ai-ask',
    headers: {'Authorization': 'Bearer ${session.accessToken}'},
    body: {'action': 'ask', 'question_id': id, 'lang': lang},
).timeout(const Duration(seconds: 25));
```

- The header is explicit, and a missing session stops the call, so a request never goes out on the anon key.
- On 401, refresh the session once and retry once.
- The body only ever holds `action`, `question_id` and `lang`.
- Asks never go through the `sync_mutations` outbox. They are reads, and nothing is queued.
- The app holds no API key.
- Reasons are logged with `debugPrint`. Figures and answer text are not.

### Offline

- `connectivityProvider` decides "Needs internet". While it is still loading, show nothing rather than a false offline message.
- It only knows about the network interface. A failed call with a connection shows a separate "Couldn't reach the server, try again" state.
- A cached list shows disabled while offline. Otherwise only the message shows.
- Nothing reads Drift for an answer, and answers are not stored on the phone.

### Owner-only gating

- The menu entry shows when `ctx.isOwner` or the roles include `GLOBAL_ADMIN`. `isOwner` alone would hide it from a global admin, whom `is_tenant_admin()` allows.
- This only hides the entry. The server decides, and `not_owner` shows a plain message.
- Plan is not checked in Dart: `list` already returns what this user may see. `ai_chat` needs no `featureMinPlan` entry.
- STARTER: mobile already resolves it to FREE, matching SQL, so spec §12 #4 is a web difference only.

### Language

- Default is `PlatformDispatcher.instance.locale`: Hindi if `hi`, otherwise English.
- The choice is stored per user in `flutter_secure_storage`, already a dependency, under `ai_chat_lang_<userId>`. The cached list goes under `ai_chat_list_<userId>_<tenantId>_<lang>`. This needs no Drift migration.
- Both are safe to lose, so a failed read falls back to the default.
- Public Sans and Manrope have no Devanagari, so Hindi relies on the Android system font. Check on a real device.
- Changing language re-asks only when the owner taps.

### Links

- `ai_screen_routes.dart` maps each key to a `Navigator.push`. It reads `params` where the screen supports them.
- `home` pops to the first route rather than pushing a second dashboard.
- If the plan blocks the target, use `fallback_key`.
- Going back returns to the chat with the answer still on screen. Answers live in memory for that visit.
- The text is drawn as plain `Text`, with no Markdown and no tappable links from model output.

### Tests (`flutter test`)

- Conformance over `shared/fixtures/ai_chat/`: every response parses, every `screen_key` has a route or is marked as having none, every `kind` draws, every `reason` has a state.
- A guard that no `screen_key` or question id is hard-coded in Dart outside the routes file.
- Client: session missing, 401 then retry, timeout, non-2xx body mapped to a reason.
- Widget tests for each state: first use, loading, no data, offline with and without a list, quota reached, AI off, not configured, text dropped.
- Widget tests need font loading solved first. `google_fonts` fails a plain widget test, so a small clean `test/helpers/` font setup comes first.
- Tests must be able to fail: change one fixture value and confirm red.

### Steps and effort

| Step | Work | Depends on | Effort |
|---|---|---|---|
| M0 | Sign the contract (§3) | Senior Developer | 0.5 day |
| M1 | Models, client, fixtures, conformance tests | M0 | 1 day |
| M2 | Screen, list, language, offline, gating | M1, Director | 1.5 days |
| M3 | Figures card and all states | M2, Director | 1 day |
| M4 | Turn-on sheet | §3 item 5 | 0.5 day |
| M5 | Links, device check, parity check against web | M3, server live | 1 day |
| M6 | Tie-out on Demo Kirana Store, prerelease on the Lead's go-ahead | All | 0.5 day |

That is about 6 days, in line with the spec's week.

Screen fixes, as separate PRs: expiry card filters (0.5 day), `ClientAgingScreen` (1 day after server support), mobile profit from `get_pl_ranged` (1 day, owner approval first), range arguments and initial tab (0.5 day).

---

## 5. Sign-offs

- **Senior Developer:** §3, and how the function bundles the shared registry.
- **Director:** the mobile screen and every state, Hindi rendering, and links for `top_items`, `gst_gaps` and `collections_week`, where the target does not show the answer.
- **Owner:** moving mobile profit to `get_pl_ranged`. The headline figure changes for shops with GST or returns, and on Demo it changes sign.
- **Lead:** whether these screen fixes block launch, because the definition of done says every figure ties.

---

## 6. Not checked

- Nothing was run in the app or on a device. Prod comparisons mirror each screen's logic in SQL, and the aging mirror compares totals, not buckets.
- `get_pl_ranged` was called read-only on prod for these three shops.
- `Gstr3bScreen` against `output_gst` was not measured. `InventoryReportScreen` and `ClientPaymentsScreen` totals were read in code, not measured.
- `supabase.functions.invoke` was read about, not tried. Confirm the 401 path once the function exists.

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:mobile_app/core/widgets/app_button.dart' show AppTappable;
import 'package:mobile_app/features/clients_suppliers/data/models/client.dart';
import 'package:mobile_app/features/clients_suppliers/data/models/supplier.dart';
import 'package:mobile_app/features/clients_suppliers/presentation/add_client_screen.dart';
import 'package:mobile_app/features/clients_suppliers/presentation/add_supplier_screen.dart';
import 'package:mobile_app/features/clients_suppliers/presentation/providers/crm_provider.dart';
import 'package:mobile_app/features/sales/presentation/providers/sales_provider.dart';
import 'package:mobile_app/features/clients_suppliers/presentation/supplier_detail_screen.dart';
import 'package:mobile_app/features/clients_suppliers/presentation/client_aging_screen.dart';
import 'package:mobile_app/features/clients_suppliers/presentation/client_payments_screen.dart';
import 'package:mobile_app/features/clients_suppliers/presentation/client_statement_sheet.dart';
import 'package:mobile_app/features/clients_suppliers/presentation/client_settlement_screen.dart';

// ─── Helpers ─────────────────────────────────────────────────────────────────
const _kHeaderBg = Color(0xFFB35210);
const _kSupplierGreen = Color(0xFF1A7A3C);
const _kSupplierGreenBg = Color(0xFFE6F4EC);
const _kClientOrangeBg = Color(0xFFFEEDE4);
const _kClientOrange = Color(0xFFA03A0A);
const _kDanger = Color(0xFFC0320A);

/// Indian-grouped rupee amount: 12000 → ₹12,000.
String _rupees(num v) {
  final whole = v.abs().truncate();
  final str = whole.toString();
  if (str.length <= 3) return '₹$str';
  final last3 = str.substring(str.length - 3);
  final rest = str.substring(0, str.length - 3);
  final grouped = rest.replaceAllMapped(RegExp(r'(\d)(?=(\d{2})+$)'), (m) => '${m[1]},');
  return '₹$grouped,$last3';
}
const _kDangerBg = Color(0xFFFEEDE4);

Color _avatarBg(String? name, {bool supplier = false}) {
  if (supplier) return _kSupplierGreenBg;
  const palette = [
    Color(0xFFFEEDE4), Color(0xFFE6F4EC), Color(0xFFE8EFFE),
    Color(0xFFF3EDFD), Color(0xFFFDF3D3), Color(0xFFE0F5EE),
  ];
  if (name == null || name.isEmpty) return palette[0];
  return palette[name.codeUnitAt(0) % palette.length];
}

Color _avatarFg(String? name, {bool supplier = false}) {
  if (supplier) return _kSupplierGreen;
  const palette = [
    Color(0xFFA03A0A), Color(0xFF1A5C2E), Color(0xFF1D4ED8),
    Color(0xFF5B21B6), Color(0xFF7B5D0A), Color(0xFF0F6E56),
  ];
  if (name == null || name.isEmpty) return palette[0];
  return palette[name.codeUnitAt(0) % palette.length];
}

String _initials(String? name) {
  if (name == null || name.trim().isEmpty) return '?';
  final parts = name.trim().split(RegExp(r'\s+'));
  if (parts.length >= 2) return '${parts[0][0]}${parts[1][0]}'.toUpperCase();
  return parts[0][0].toUpperCase();
}

String _compact(double v) {
  final whole = v.round();
  final s = whole.abs().toString();
  final grouped = s.length <= 3
      ? s
      : '${s.substring(0, s.length - 3).replaceAllMapped(RegExp(r'(\d)(?=(\d{2})+$)'), (m) => '${m[1]},')},${s.substring(s.length - 3)}';
  return '${whole < 0 ? '-' : ''}₹$grouped';
}

// ─── Main screen ─────────────────────────────────────────────────────────────
class CRMScreen extends ConsumerStatefulWidget {
  const CRMScreen({super.key});

  @override
  ConsumerState<CRMScreen> createState() => _CRMScreenState();
}

class _CRMScreenState extends ConsumerState<CRMScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  final _searchController = TextEditingController();
  String _query = '';

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _tabController.addListener(() => setState(() {}));
    _searchController.addListener(
        () => setState(() => _query = _searchController.text));
  }

  @override
  void dispose() {
    _tabController.dispose();
    _searchController.dispose();
    super.dispose();
  }

  void _openAdd() {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => _tabController.index == 0
            ? const AddClientScreen()
            : const AddSupplierScreen(),
      ),
    ).then((_) {
      ref.invalidate(clientsProvider);
      ref.invalidate(suppliersProvider);
    });
  }

  @override
  Widget build(BuildContext context) {
    final clientsAsync   = ref.watch(clientsProvider);
    final suppliersAsync = ref.watch(suppliersProvider);
    final salesAsync     = ref.watch(recentSalesProvider);

    final clients   = clientsAsync.valueOrNull   ?? const [];
    final suppliers = suppliersAsync.valueOrNull ?? const [];
    final sales     = salesAsync.valueOrNull     ?? const [];

    // Client KPIs
    final perClientSales = <String, double>{};
    for (final s in sales) {
      final id = s.shopId;
      if (id == null) continue;
      perClientSales[id] = (perClientSales[id] ?? 0) + (s.totalAmount ?? 0);
    }
    double totalReceivables = 0;
    String topDebtorName = '—';
    double topDebtorAmt  = 0;
    String topBuyerName  = '—';
    double topBuyerAmt   = 0;
    for (final c in clients) {
      final out = c.outstandingBalance ?? 0;
      final sl  = perClientSales[c.id] ?? 0;
      totalReceivables += out;
      if (out > topDebtorAmt) { topDebtorAmt = out; topDebtorName = c.name ?? '—'; }
      if (sl  > topBuyerAmt)  { topBuyerAmt  = sl;  topBuyerName  = c.name ?? '—'; }
    }

    // Supplier KPIs
    double totalPayable = 0;
    String topPayableName = '—';
    double topPayableAmt  = 0;
    for (final s in suppliers) {
      final bal = s.balance ?? 0;
      totalPayable += bal;
      if (bal > topPayableAmt) { topPayableAmt = bal; topPayableName = s.name ?? '—'; }
    }

    final isClient = _tabController.index == 0;

    return Scaffold(
      backgroundColor: AppColors.canvas,
      appBar: AppBar(
        backgroundColor: AppColors.canvas,
        elevation: 0,
        scrolledUnderElevation: 0,
        toolbarHeight: 0,
      ),
      floatingActionButton: FloatingActionButton.extended(
        heroTag: 'crm_fab',
        onPressed: _openAdd,
        backgroundColor: _kHeaderBg,
        foregroundColor: Colors.white,
        elevation: 2,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
        icon: Icon(isClient ? LucideIcons.userPlus : LucideIcons.building2, size: 17),
        label: AnimatedBuilder(
          animation: _tabController,
          builder: (_, __) => Text(
            isClient ? 'New client' : 'New supplier',
            style: GoogleFonts.manrope(fontWeight: FontWeight.w600, fontSize: 13),
          ),
        ),
      ),
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // ── Header (tab-aware) ──────────────────────────────────────────
            _CRMHeader(
              tabIndex: _tabController.index,
              clientCount: clients.length,
              totalReceivables: totalReceivables,
              topDebtorName: topDebtorName,
              topDebtorAmt: topDebtorAmt,
              topBuyerName: topBuyerName,
              topBuyerAmt: topBuyerAmt,
              supplierCount: suppliers.length,
              totalPayable: totalPayable,
              topPayableName: topPayableName,
              topPayableAmt: topPayableAmt,
            ),

            // ── Search ──────────────────────────────────────────────────────
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 12, 14, 0),
              child: _SearchBar(
                controller: _searchController,
                hint: isClient ? 'Search clients…' : 'Search suppliers…',
              ),
            ),

            // ── Pill tab bar ────────────────────────────────────────────────
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 10, 14, 0),
              child: _PillTabBar(controller: _tabController),
            ),

            // ── Content ─────────────────────────────────────────────────────
            Expanded(
              child: TabBarView(
                controller: _tabController,
                children: [
                  _ClientsTab(query: _query),
                  _SuppliersTab(query: _query),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ─── Header ──────────────────────────────────────────────────────────────────
class _CRMHeader extends StatelessWidget {
  final int    tabIndex;
  final int    clientCount;
  final double totalReceivables;
  final String topDebtorName;
  final double topDebtorAmt;
  final String topBuyerName;
  final double topBuyerAmt;
  final int    supplierCount;
  final double totalPayable;
  final String topPayableName;
  final double topPayableAmt;

  const _CRMHeader({
    required this.tabIndex,
    required this.clientCount,
    required this.totalReceivables,
    required this.topDebtorName,
    required this.topDebtorAmt,
    required this.topBuyerName,
    required this.topBuyerAmt,
    required this.supplierCount,
    required this.totalPayable,
    required this.topPayableName,
    required this.topPayableAmt,
  });

  @override
  Widget build(BuildContext context) {
    final isClient = tabIndex == 0;
    final stats = isClient
        ? [
            _Stat('Total clients', LucideIcons.users,
                clientCount.toString(), 'Active accounts'),
            _Stat('To collect', LucideIcons.receipt,
                _compact(totalReceivables), 'From clients'),
            _Stat('Owes you most', LucideIcons.alertCircle,
                topDebtorAmt > 0 ? _compact(topDebtorAmt) : '—', topDebtorName),
            _Stat('Top buyer', LucideIcons.trendingUp,
                topBuyerAmt > 0 ? _compact(topBuyerAmt) : '—', topBuyerName),
          ]
        : [
            _Stat('Total suppliers', LucideIcons.truck,
                supplierCount.toString(), 'Active vendors'),
            _Stat('To pay', LucideIcons.receipt,
                _compact(totalPayable), 'To suppliers'),
            _Stat('You owe most', LucideIcons.alertCircle,
                topPayableAmt > 0 ? _compact(topPayableAmt) : '—', topPayableName),
            _Stat('On-time rate', LucideIcons.checkCircle2,
                '—', 'Last 90 days'),
          ];

    return AnimatedContainer(
      duration: const Duration(milliseconds: 200),
      // Was a solid amber block. Every piece of text on it failed WCAG AA —
      // title 3.19:1, the "CRM" eyebrow and stat labels 2.43:1, stat values
      // inside the translucent tiles 2.76:1. A light surface fixes all three
      // and gives the list back roughly a third of the screen.
      decoration: const BoxDecoration(
        color: Colors.white,
        border: Border(bottom: BorderSide(color: AppColors.outlineVariant)),
      ),
      padding: const EdgeInsets.fromLTRB(14, 14, 14, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'CRM',
                      style: GoogleFonts.manrope(
                        fontSize: 10,
                        fontWeight: FontWeight.w600,
                        color: AppColors.inkTertiary,
                        letterSpacing: 0.08 * 10,
                      ),
                    ),
                    const SizedBox(height: 2),
                    AnimatedSwitcher(
                      duration: const Duration(milliseconds: 180),
                      child: Text(
                        isClient ? 'Clients' : 'Suppliers',
                        key: ValueKey(isClient),
                        style: GoogleFonts.manrope(
                          fontSize: 20,
                          fontWeight: FontWeight.w600,
                          color: AppColors.inkPrimary,
                          letterSpacing: -0.3,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.all(9),
                decoration: BoxDecoration(
                  color: AppColors.surfaceContainer,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(
                  isClient ? LucideIcons.building : LucideIcons.truck,
                  color: AppColors.inkSecondary,
                  size: 18,
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Row(children: [
            Expanded(child: _StatTile(stats[0])),
            const SizedBox(width: 8),
            Expanded(child: _StatTile(stats[1])),
          ]),
          const SizedBox(height: 8),
          Row(children: [
            Expanded(child: _StatTile(stats[2])),
            const SizedBox(width: 8),
            Expanded(child: _StatTile(stats[3])),
          ]),
        ],
      ),
    );
  }
}

class _Stat {
  final String label;
  final IconData icon;
  final String value;
  final String hint;
  const _Stat(this.label, this.icon, this.value, this.hint);
}

class _StatTile extends StatelessWidget {
  final _Stat s;
  const _StatTile(this.s, {super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: AppColors.surfaceContainer,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppColors.outlineVariant),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Icon(s.icon, size: 11, color: AppColors.inkTertiary),
            const SizedBox(width: 4),
            Expanded(
              child: Text(
                s.label,
                style: GoogleFonts.manrope(
                  fontSize: 10,
                  fontWeight: FontWeight.w500,
                  color: AppColors.inkSecondary,
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ]),
          const SizedBox(height: 4),
          Text(
            s.value,
            style: GoogleFonts.manrope(
              fontSize: 17,
              fontWeight: FontWeight.w600,
              color: AppColors.inkPrimary,
              letterSpacing: -0.3,
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: 1),
          Text(
            s.hint,
            style: GoogleFonts.manrope(
              fontSize: 10,
              color: AppColors.inkTertiary,
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ),
    );
  }
}

// ─── Search bar ───────────────────────────────────────────────────────────────
class _SearchBar extends StatelessWidget {
  final TextEditingController controller;
  final String hint;
  const _SearchBar({required this.controller, required this.hint});

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      style: GoogleFonts.manrope(fontSize: 14, color: AppColors.inkPrimary),
      decoration: InputDecoration(
        hintText: hint,
        hintStyle: GoogleFonts.manrope(fontSize: 13, color: AppColors.inkTertiary),
        prefixIcon: const Icon(LucideIcons.search, size: 16, color: AppColors.inkTertiary),
        suffixIcon: controller.text.isNotEmpty
            ? IconButton(
                icon: const Icon(LucideIcons.x, size: 15, color: AppColors.inkTertiary),
                onPressed: controller.clear,
              )
            : null,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: AppColors.outlineVariant),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: AppColors.outlineVariant),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: AppColors.primary, width: 1.5),
        ),
        filled: true,
        fillColor: Colors.white,
        contentPadding: const EdgeInsets.symmetric(vertical: 12),
        isDense: true,
      ),
    );
  }
}

// ─── Pill tab bar ─────────────────────────────────────────────────────────────
class _PillTabBar extends StatelessWidget {
  final TabController controller;
  const _PillTabBar({required this.controller});

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 40,
      padding: const EdgeInsets.all(3),
      decoration: BoxDecoration(
        color: AppColors.surfaceContainer,
        borderRadius: BorderRadius.circular(10),
      ),
      child: TabBar(
        controller: controller,
        indicatorSize: TabBarIndicatorSize.tab,
        indicator: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: AppColors.outlineVariant),
        ),
        labelColor: AppColors.inkPrimary,
        unselectedLabelColor: AppColors.inkTertiary,
        labelStyle: GoogleFonts.manrope(fontWeight: FontWeight.w600, fontSize: 13),
        unselectedLabelStyle: GoogleFonts.manrope(fontWeight: FontWeight.w500, fontSize: 13),
        dividerColor: Colors.transparent,
        splashBorderRadius: BorderRadius.circular(8),
        tabs: const [Tab(text: 'Clients'), Tab(text: 'Supplier directory')],
      ),
    );
  }
}

// ─── CLIENTS TAB ─────────────────────────────────────────────────────────────
class _ClientsTab extends ConsumerWidget {
  final String query;
  const _ClientsTab({required this.query});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return ref.watch(clientsProvider).when(
      data: (clients) {
        final filtered = query.isEmpty
            ? clients
            : clients.where((c) {
                final q = query.toLowerCase();
                return (c.name ?? '').toLowerCase().contains(q) ||
                    (c.phone ?? '').contains(q) ||
                    (c.email ?? '').toLowerCase().contains(q);
              }).toList();

        if (filtered.isEmpty) {
          return _EmptyState(
            icon: LucideIcons.users,
            message: query.isEmpty ? 'No clients yet' : 'No results for "$query"',
          );
        }

        final totalBalance =
            filtered.fold(0.0, (s, c) => s + (c.outstandingBalance ?? 0));

        return Column(
          children: [
            // ── Toolbar ────────────────────────────────────────────────────
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 10, 14, 0),
              child: Row(children: [
                _ToolbarBtn(
                  icon: LucideIcons.calendarClock,
                  label: 'Overdue report',
                  onTap: () => Navigator.push(context,
                      MaterialPageRoute(builder: (_) => const ClientAgingScreen())),
                ),
                const SizedBox(width: 7),
                _ToolbarBtn(
                  icon: LucideIcons.creditCard,
                  label: 'Payments',
                  onTap: () => Navigator.push(context,
                      MaterialPageRoute(builder: (_) => const ClientPaymentsScreen())),
                ),
              ]),
            ),

            // ── Meta row ───────────────────────────────────────────────────
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 8, 14, 4),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    '${filtered.length} client${filtered.length == 1 ? '' : 's'}',
                    style: GoogleFonts.manrope(fontSize: 12, color: AppColors.inkTertiary),
                  ),
                  if (totalBalance > 0)
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
                      decoration: BoxDecoration(
                        color: _kDangerBg,
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(color: const Color(0xFFF5C09A)),
                      ),
                      child: Text(
                        '₹${totalBalance.toStringAsFixed(0)} outstanding',
                        style: GoogleFonts.manrope(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          color: _kClientOrange,
                        ),
                      ),
                    )
                  else
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
                      decoration: BoxDecoration(
                        color: const Color(0xFFE6F4EC),
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Text(
                        'All clear',
                        style: GoogleFonts.manrope(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          color: _kSupplierGreen,
                        ),
                      ),
                    ),
                ],
              ),
            ),

            // ── List ───────────────────────────────────────────────────────
            Expanded(
              child: ListView.separated(
                padding: const EdgeInsets.fromLTRB(14, 4, 14, 100),
                itemCount: filtered.length,
                separatorBuilder: (_, __) => const Divider(height: 1, indent: 52),
                itemBuilder: (ctx, i) => _ClientRow(
                  client: filtered[i],
                  onTap: () => _showClientDetail(ctx, filtered[i], ref),
                ),
              ),
            ),
          ],
        );
      },
      loading: () => const Center(child: CircularProgressIndicator(color: AppColors.primary)),
      error: (e, _) => _ErrorState(message: e.toString()),
    );
  }

  void _showClientDetail(BuildContext context, Client client, WidgetRef ref) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _ClientDetailSheet(client: client, ref: ref),
    );
  }
}

// ─── Client row (flat list item) ──────────────────────────────────────────────
class _ClientRow extends StatelessWidget {
  final Client client;
  final VoidCallback onTap;
  const _ClientRow({required this.client, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final balance  = client.outstandingBalance ?? 0;
    final hasGstin = (client.gstNo ?? client.gstin) != null;
    final fg = _avatarFg(client.name);
    final bg = _avatarBg(client.name);

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(4),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 11),
        child: Row(
          children: [
            // Avatar
            Container(
              width: 38,
              height: 38,
              decoration: BoxDecoration(color: bg, shape: BoxShape.circle),
              alignment: Alignment.center,
              child: Text(
                _initials(client.name),
                style: GoogleFonts.manrope(fontSize: 13, fontWeight: FontWeight.w600, color: fg),
              ),
            ),
            const SizedBox(width: 11),

            // Info
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    client.name ?? 'Unknown',
                    style: GoogleFonts.manrope(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: AppColors.inkPrimary,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 2),
                  Row(children: [
                    if (client.phone != null && client.phone!.isNotEmpty) ...[
                      const Icon(LucideIcons.phone, size: 11, color: AppColors.inkTertiary),
                      const SizedBox(width: 3),
                      Text(client.phone!,
                          style: GoogleFonts.manrope(fontSize: 11, color: AppColors.inkTertiary)),
                      const SizedBox(width: 6),
                    ],
                    if (hasGstin)
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                        decoration: BoxDecoration(
                          color: const Color(0xFFFDF3D3),
                          border: Border.all(color: const Color(0xFFEFD98A)),
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: Text('GST',
                            style: GoogleFonts.manrope(
                                fontSize: 9, fontWeight: FontWeight.w600, color: const Color(0xFF7B5D0A))),
                      ),
                  ]),
                ],
              ),
            ),

            // Amount + chevron
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  balance > 0
                      ? _rupees(balance)
                      : balance < 0
                          ? '${_rupees(balance)} advance'
                          : 'Settled',
                  style: GoogleFonts.manrope(
                    fontSize: balance < 0 ? 11 : 13,
                    fontWeight: FontWeight.w600,
                    color: balance > 0
                        ? _kDanger
                        : balance < 0
                            ? _kSupplierGreen
                            : AppColors.inkTertiary,
                  ),
                ),
                const SizedBox(height: 3),
                const Icon(LucideIcons.chevronRight, size: 13, color: AppColors.inkTertiary),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

// ─── CLIENT DETAIL SHEET ─────────────────────────────────────────────────────
class _ClientDetailSheet extends StatelessWidget {
  final Client client;
  final WidgetRef ref;
  const _ClientDetailSheet({required this.client, required this.ref});

  static String _fmtAmount(double v) {
    final whole = v.truncate();
    final s = whole.toString();
    if (s.length <= 3) return '₹$s';
    final last3 = s.substring(s.length - 3);
    final rest  = s.substring(0, s.length - 3);
    final grouped = rest.replaceAllMapped(RegExp(r'(\d)(?=(\d{2})+$)'), (m) => '${m[1]},');
    return '₹$grouped,$last3';
  }

  String _accountTypeLabel(String? t) =>
      t == 'B2B' ? 'B2B · Business' : 'B2C · Consumer';

  String _priceTierLabel(String? t) {
    switch (t) {
      case 'WHOLESALE':   return 'Wholesale · Volume';
      case 'DISTRIBUTOR': return 'Distributor · Trade';
      default:            return 'Retail · Standard';
    }
  }

  String _creditTermLabel(int? days) =>
      (days ?? 0) == 0 ? 'Cash on delivery' : 'Net ${days!} days';

  @override
  Widget build(BuildContext context) {
    final balance     = client.outstandingBalance ?? 0;
    final fg          = _avatarFg(client.name);
    final bg          = _avatarBg(client.name);
    final clientType  = client.clientType ?? 'B2C';
    final gstinValue  = (client.gstin ?? client.gstNo ?? '').trim();
    final hasGstin    = gstinValue.isNotEmpty;
    final hasState    = (client.state ?? '').isNotEmpty;
    final salesAsync  = ref.watch(recentSalesProvider);
    final mySales     = (salesAsync.valueOrNull ?? const [])
        .where((s) => s.shopId == client.id)
        .toList();
    final totalSales  = mySales.fold(0.0, (s, sale) => s + (sale.totalAmount ?? 0));
    final orderCount  = mySales.length;

    return DraggableScrollableSheet(
      initialChildSize: 0.72,
      minChildSize: 0.4,
      maxChildSize: 0.95,
      builder: (_, scroll) => Container(
        decoration: const BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
        child: Column(
          children: [
            // Drag handle
            Container(
              margin: const EdgeInsets.only(top: 10),
              width: 36,
              height: 3,
              decoration: BoxDecoration(
                color: AppColors.outlineVariant,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            Expanded(
              child: ListView(
                controller: scroll,
                padding: const EdgeInsets.fromLTRB(20, 18, 20, 40),
                children: [
                  // ── Header ──────────────────────────────────────────────
                  Row(
                    children: [
                      Container(
                        width: 52,
                        height: 52,
                        decoration: BoxDecoration(color: bg, shape: BoxShape.circle),
                        alignment: Alignment.center,
                        child: Text(
                          _initials(client.name),
                          style: GoogleFonts.manrope(fontSize: 18, fontWeight: FontWeight.w600, color: fg),
                        ),
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              client.name ?? 'Unknown',
                              style: GoogleFonts.manrope(
                                fontSize: 18,
                                fontWeight: FontWeight.w600,
                                color: AppColors.inkPrimary,
                              ),
                            ),
                            const SizedBox(height: 3),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                              decoration: BoxDecoration(
                                color: clientType == 'B2B'
                                    ? AppColors.primary.withValues(alpha: 0.1)
                                    : AppColors.surfaceContainer,
                                borderRadius: BorderRadius.circular(5),
                              ),
                              child: Text(
                                _accountTypeLabel(client.clientType),
                                style: GoogleFonts.manrope(
                                  fontSize: 10,
                                  fontWeight: FontWeight.w600,
                                  color: clientType == 'B2B' ? AppColors.primary : AppColors.inkSecondary,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                      IconButton(
                        onPressed: () {
                          Navigator.pop(context);
                          Navigator.push(
                            context,
                            MaterialPageRoute(builder: (_) => AddClientScreen(client: client)),
                          ).then((_) => ref.invalidate(clientsProvider));
                        },
                        icon: const Icon(LucideIcons.pencil, size: 16, color: AppColors.inkTertiary),
                        style: IconButton.styleFrom(
                          backgroundColor: AppColors.surfaceContainer,
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                        ),
                      ),
                    ],
                  ),

                  const SizedBox(height: 18),

                  // ── Balance card ─────────────────────────────────────────
                  Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: balance > 0
                          ? AppColors.danger.withValues(alpha: 0.05)
                          : AppColors.success.withValues(alpha: 0.05),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: balance > 0
                            ? AppColors.danger.withValues(alpha: 0.15)
                            : AppColors.success.withValues(alpha: 0.15),
                      ),
                    ),
                    child: Row(
                      children: [
                        Icon(
                          balance > 0 ? LucideIcons.alertCircle : LucideIcons.checkCircle2,
                          size: 18,
                          color: balance > 0 ? AppColors.danger : AppColors.success,
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                balance < 0 ? 'Advance (paid extra)' : 'Outstanding balance',
                                style: GoogleFonts.manrope(fontSize: 11, color: AppColors.inkTertiary),
                              ),
                              Row(
                                crossAxisAlignment: CrossAxisAlignment.end,
                                children: [
                                  Text(
                                    _fmtAmount(balance.abs()),
                                    style: GoogleFonts.manrope(
                                      fontSize: 20,
                                      fontWeight: FontWeight.w700,
                                      color: balance > 0 ? AppColors.danger : AppColors.success,
                                      letterSpacing: -0.4,
                                    ),
                                  ),
                                  const SizedBox(width: 8),
                                  Padding(
                                    padding: const EdgeInsets.only(bottom: 3),
                                    child: Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                                      decoration: BoxDecoration(
                                        color: balance > 0
                                            ? AppColors.danger.withValues(alpha: 0.10)
                                            : AppColors.success.withValues(alpha: 0.10),
                                        borderRadius: BorderRadius.circular(20),
                                      ),
                                      child: Text(
                                        balance > 0 ? 'Unpaid' : 'Cleared',
                                        style: GoogleFonts.manrope(
                                          fontSize: 10,
                                          fontWeight: FontWeight.w600,
                                          color: balance > 0 ? AppColors.danger : AppColors.success,
                                        ),
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),

                  const SizedBox(height: 10),

                  // ── Sales summary ────────────────────────────────────────
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                    decoration: BoxDecoration(
                      color: AppColors.surfaceContainer,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Row(children: [
                      Expanded(child: _MiniStat('Total sales', _fmtAmount(totalSales))),
                      Container(width: 1, height: 28, color: AppColors.outlineVariant),
                      Expanded(child: _MiniStat('Orders', '$orderCount')),
                    ]),
                  ),

                  const SizedBox(height: 18),

                  // ── Contact info ─────────────────────────────────────────
                  if (client.phone != null || client.email != null || client.address != null)
                    _DetailSection(
                      title: 'Contact info',
                      icon: LucideIcons.phone,
                      rows: [
                        if (client.phone != null && client.phone!.isNotEmpty)
                          _InfoRow(icon: LucideIcons.phone, label: 'Phone', value: client.phone!),
                        if (client.email != null && client.email!.isNotEmpty)
                          _InfoRow(icon: LucideIcons.mail, label: 'Email', value: client.email!),
                        if (client.address != null && client.address!.isNotEmpty)
                          _InfoRow(icon: LucideIcons.mapPin, label: 'Address', value: client.address!),
                      ],
                    ),

                  if (hasGstin || hasState) ...[
                    const SizedBox(height: 14),
                    _DetailSection(
                      title: 'Tax information',
                      icon: LucideIcons.fileText,
                      rows: [
                        if (hasGstin)
                          _InfoRow(icon: LucideIcons.hash, label: 'GSTIN', value: gstinValue),
                        if (hasState)
                          _InfoRow(
                            icon: LucideIcons.mapPin,
                            label: 'State',
                            value: '${client.state}${client.stateCode != null ? ' (${client.stateCode})' : ''}',
                          ),
                      ],
                    ),
                  ],

                  const SizedBox(height: 14),
                  _DetailSection(
                    title: 'Classification',
                    icon: LucideIcons.tag,
                    rows: [
                      _InfoRow(
                        icon: clientType == 'B2B' ? LucideIcons.building2 : LucideIcons.shoppingBag,
                        label: 'Account type',
                        value: _accountTypeLabel(client.clientType),
                      ),
                      _InfoRow(icon: LucideIcons.tag, label: 'Price tier',
                          value: _priceTierLabel(client.priceTier)),
                      _InfoRow(icon: LucideIcons.clock, label: 'Credit terms',
                          value: _creditTermLabel(client.creditDays)),
                    ],
                  ),

                  if (client.createdAt != null) ...[
                    const SizedBox(height: 16),
                    Text(
                      'Added ${_formatDate(client.createdAt!)}',
                      style: GoogleFonts.manrope(fontSize: 11, color: AppColors.inkTertiary),
                      textAlign: TextAlign.center,
                    ),
                  ],

                  // ── Actions ─────────────────────────────────────────────
                  const SizedBox(height: 18),
                  Row(children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: () {
                          showModalBottomSheet(
                            context: context,
                            isScrollControlled: true,
                            backgroundColor: Colors.transparent,
                            builder: (_) => ClientStatementSheet(client: client),
                          );
                        },
                        icon: const Icon(LucideIcons.bookOpen, size: 14),
                        label: Text('View statement',
                            style: GoogleFonts.manrope(fontSize: 13, fontWeight: FontWeight.w600)),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: AppColors.primary,
                          side: const BorderSide(color: AppColors.primary, width: 1),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                          padding: const EdgeInsets.symmetric(vertical: 11),
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: ElevatedButton.icon(
                        onPressed: () {
                          Navigator.pop(context);
                          Navigator.push(
                            context,
                            MaterialPageRoute(builder: (_) => ClientSettlementScreen(client: client)),
                          );
                        },
                        icon: const Icon(LucideIcons.checkCircle2, size: 14),
                        label: Text('Collect payment',
                            style: GoogleFonts.manrope(fontSize: 13, fontWeight: FontWeight.w600)),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: _kHeaderBg,
                          foregroundColor: Colors.white,
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                          padding: const EdgeInsets.symmetric(vertical: 11),
                          elevation: 0,
                        ),
                      ),
                    ),
                  ]),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  static String _formatDate(DateTime d) =>
      '${d.day} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.month-1]} ${d.year}';
}

// ─── SUPPLIERS TAB ────────────────────────────────────────────────────────────
class _SuppliersTab extends ConsumerWidget {
  final String query;
  const _SuppliersTab({required this.query});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return ref.watch(suppliersProvider).when(
      data: (suppliers) {
        final filtered = query.isEmpty
            ? suppliers
            : suppliers.where((s) {
                final q = query.toLowerCase();
                return (s.name ?? '').toLowerCase().contains(q) ||
                    (s.contactPerson ?? '').toLowerCase().contains(q) ||
                    (s.phone ?? '').contains(q);
              }).toList();

        if (filtered.isEmpty) {
          return _EmptyState(
            icon: LucideIcons.building2,
            message: query.isEmpty ? 'No suppliers yet' : 'No results for "$query"',
          );
        }

        // Alphabetical grouping
        final Map<String, List<Supplier>> grouped = {};
        for (final s in filtered) {
          final letter = (s.name?.isNotEmpty == true) ? s.name![0].toUpperCase() : '#';
          grouped.putIfAbsent(letter, () => []).add(s);
        }
        final sortedKeys = grouped.keys.toList()..sort();

        final totalPayable = filtered.fold(0.0, (s, sup) => s + (sup.balance ?? 0));

        return Column(
          children: [
            // ── Toolbar ────────────────────────────────────────────────────
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 10, 14, 0),
              child: Row(children: [
                _ToolbarBtn(
                  icon: LucideIcons.fileText,
                  label: 'Purchase orders',
                  onTap: () {},
                ),
                const SizedBox(width: 7),
                _ToolbarBtn(
                  icon: LucideIcons.creditCard,
                  label: 'Payments',
                  onTap: () {},
                ),
              ]),
            ),

            // ── Meta row ───────────────────────────────────────────────────
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 8, 14, 4),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    '${filtered.length} supplier${filtered.length == 1 ? '' : 's'}',
                    style: GoogleFonts.manrope(fontSize: 12, color: AppColors.inkTertiary),
                  ),
                  if (totalPayable > 0)
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
                      decoration: BoxDecoration(
                        color: _kSupplierGreenBg,
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(color: const Color(0xFF9FD5B3)),
                      ),
                      child: Text(
                        '₹${totalPayable.toStringAsFixed(0)} to pay',
                        style: GoogleFonts.manrope(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          color: _kSupplierGreen,
                        ),
                      ),
                    ),
                ],
              ),
            ),

            // ── Alphabetical list ───────────────────────────────────────────
            Expanded(
              child: ListView.builder(
                padding: const EdgeInsets.fromLTRB(14, 4, 14, 100),
                itemCount: sortedKeys.fold<int>(0, (c, k) => c + 1 + (grouped[k]?.length ?? 0)),
                itemBuilder: (ctx, globalIndex) {
                  int cursor = 0;
                  for (final key in sortedKeys) {
                    if (globalIndex == cursor) return _AlphaHeader(letter: key);
                    cursor++;
                    final items = grouped[key]!;
                    if (globalIndex < cursor + items.length) {
                      final supplier = items[globalIndex - cursor];
                      return Column(children: [
                        _SupplierRow(
                          supplier: supplier,
                          onTap: () => Navigator.push(
                            ctx,
                            MaterialPageRoute(builder: (_) => SupplierDetailScreen(supplier: supplier)),
                          ).then((_) => ref.invalidate(suppliersProvider)),
                        ),
                        if (globalIndex - cursor < items.length - 1)
                          const Divider(height: 1, indent: 52),
                      ]);
                    }
                    cursor += items.length;
                  }
                  return const SizedBox.shrink();
                },
              ),
            ),
          ],
        );
      },
      loading: () => const Center(child: CircularProgressIndicator(color: AppColors.primary)),
      error: (e, _) => _ErrorState(message: e.toString()),
    );
  }
}

// ─── Supplier row (flat list item) ────────────────────────────────────────────
class _SupplierRow extends StatelessWidget {
  final Supplier supplier;
  final VoidCallback onTap;
  const _SupplierRow({required this.supplier, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final balance = supplier.balance ?? 0;

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(4),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 11),
        child: Row(
          children: [
            // Avatar — green tint for suppliers
            Container(
              width: 38,
              height: 38,
              decoration: const BoxDecoration(color: _kSupplierGreenBg, shape: BoxShape.circle),
              alignment: Alignment.center,
              child: Text(
                _initials(supplier.name),
                style: GoogleFonts.manrope(
                    fontSize: 13, fontWeight: FontWeight.w600, color: _kSupplierGreen),
              ),
            ),
            const SizedBox(width: 11),

            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    supplier.name ?? 'Unknown',
                    style: GoogleFonts.manrope(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: AppColors.inkPrimary,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 2),
                  Row(children: [
                    if (supplier.phone != null && supplier.phone!.isNotEmpty) ...[
                      const Icon(LucideIcons.phone, size: 11, color: AppColors.inkTertiary),
                      const SizedBox(width: 3),
                      Text(supplier.phone!,
                          style: GoogleFonts.manrope(fontSize: 11, color: AppColors.inkTertiary)),
                      const SizedBox(width: 6),
                    ],
                    if (supplier.contactPerson != null && supplier.contactPerson!.isNotEmpty)
                      Text(supplier.contactPerson!,
                          style: GoogleFonts.manrope(fontSize: 11, color: AppColors.inkTertiary)),
                  ]),
                ],
              ),
            ),

            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  balance == 0 ? '—' : '₹${balance.toStringAsFixed(0)}',
                  style: GoogleFonts.manrope(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: balance > 0 ? _kSupplierGreen : AppColors.inkTertiary,
                  ),
                ),
                const SizedBox(height: 3),
                const Icon(LucideIcons.chevronRight, size: 13, color: AppColors.inkTertiary),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

// ─── Alpha section header ─────────────────────────────────────────────────────
class _AlphaHeader extends StatelessWidget {
  final String letter;
  const _AlphaHeader({required this.letter});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(0, 10, 0, 4),
      child: Row(children: [
        Container(
          width: 24,
          height: 24,
          decoration: BoxDecoration(
            color: _kHeaderBg,
            borderRadius: BorderRadius.circular(6),
          ),
          alignment: Alignment.center,
          child: Text(letter,
              style: GoogleFonts.manrope(fontSize: 12, fontWeight: FontWeight.w600, color: Colors.white)),
        ),
        const SizedBox(width: 8),
        Expanded(child: Container(height: 0.5, color: AppColors.outlineVariant)),
      ]),
    );
  }
}

// ─── Toolbar button ───────────────────────────────────────────────────────────
class _ToolbarBtn extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  const _ToolbarBtn({required this.icon, required this.label, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return AppTappable(
      ripple: false,
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 7),
        decoration: BoxDecoration(
          color: Colors.white,
          border: Border.all(color: AppColors.outlineVariant),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Icon(icon, size: 14, color: AppColors.inkSecondary),
          const SizedBox(width: 5),
          Text(label,
              style: GoogleFonts.manrope(fontSize: 12, fontWeight: FontWeight.w500, color: AppColors.inkSecondary)),
        ]),
      ),
    );
  }
}

// ─── Mini stat (used in detail sheet) ────────────────────────────────────────
class _MiniStat extends StatelessWidget {
  final String label;
  final String value;
  const _MiniStat(this.label, this.value, {super.key});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 10),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(label,
            style: GoogleFonts.manrope(fontSize: 10, color: AppColors.inkTertiary)),
        const SizedBox(height: 2),
        Text(value,
            style: GoogleFonts.manrope(
                fontSize: 16, fontWeight: FontWeight.w600, color: AppColors.inkPrimary, letterSpacing: -0.3)),
      ]),
    );
  }
}

// ─── Detail section ───────────────────────────────────────────────────────────
class _DetailSection extends StatelessWidget {
  final String title;
  final IconData icon;
  final List<_InfoRow> rows;
  const _DetailSection({required this.title, required this.icon, required this.rows});

  @override
  Widget build(BuildContext context) {
    if (rows.isEmpty) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(children: [
          Icon(icon, size: 12, color: AppColors.inkTertiary),
          const SizedBox(width: 5),
          Text(title,
              style: GoogleFonts.manrope(
                  fontSize: 11, fontWeight: FontWeight.w600, color: AppColors.inkTertiary)),
        ]),
        const SizedBox(height: 8),
        Container(
          decoration: BoxDecoration(
            color: AppColors.surfaceContainer,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: AppColors.outlineVariant),
          ),
          child: Column(
            children: rows.map((row) {
              final isLast = row == rows.last;
              return Column(children: [
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Icon(row.icon, size: 14, color: AppColors.inkTertiary),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(row.label,
                                style: GoogleFonts.manrope(fontSize: 10, color: AppColors.inkTertiary)),
                            const SizedBox(height: 1),
                            Text(row.value,
                                style: GoogleFonts.manrope(
                                    fontSize: 13, fontWeight: FontWeight.w500, color: AppColors.inkPrimary)),
                          ],
                        ),
                      ),
                      AppTappable(
                        ripple: false,
                        onTap: () {
                          Clipboard.setData(ClipboardData(text: row.value));
                          ScaffoldMessenger.of(context).showSnackBar(SnackBar(
                            content: Text('Copied',
                                style: GoogleFonts.manrope(color: AppColors.inkPrimary)),
                            backgroundColor: AppColors.primaryContainer,
                            behavior: SnackBarBehavior.floating,
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                            duration: const Duration(seconds: 1),
                          ));
                        },
                        child: const Icon(LucideIcons.copy, size: 13, color: AppColors.inkTertiary),
                      ),
                    ],
                  ),
                ),
                if (!isLast)
                  const Divider(height: 1, indent: 14, endIndent: 14),
              ]);
            }).toList(),
          ),
        ),
      ],
    );
  }
}

class _InfoRow {
  final IconData icon;
  final String label;
  final String value;
  const _InfoRow({required this.icon, required this.label, required this.value});
}

// ─── Shared utility widgets ───────────────────────────────────────────────────
class _EmptyState extends StatelessWidget {
  final IconData icon;
  final String message;
  const _EmptyState({required this.icon, required this.message});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            padding: const EdgeInsets.all(18),
            decoration: const BoxDecoration(
              color: AppColors.surfaceContainer,
              shape: BoxShape.circle,
            ),
            child: Icon(icon, size: 28, color: AppColors.inkTertiary),
          ),
          const SizedBox(height: 14),
          Text(message,
              style: GoogleFonts.manrope(
                  fontSize: 15, fontWeight: FontWeight.w600, color: AppColors.inkSecondary)),
          const SizedBox(height: 3),
          Text('Tap + to add one',
              style: GoogleFonts.manrope(fontSize: 12, color: AppColors.inkTertiary)),
        ],
      ),
    );
  }
}

class _ErrorState extends StatelessWidget {
  final String message;
  const _ErrorState({required this.message});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Text('Error: $message',
            style: GoogleFonts.manrope(color: AppColors.danger, fontSize: 13),
            textAlign: TextAlign.center),
      ),
    );
  }
}

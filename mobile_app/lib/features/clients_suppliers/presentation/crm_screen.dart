import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile_app/core/database/sync_status_pill.dart';
import 'package:mobile_app/core/theme/colors.dart';
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

// ─── Avatar colour cycling ────────────────────────────────────────────────────
Color _avatarColor(String? name) {
  const palette = [
    Color(0xFF446900),
    Color(0xFF48654d),
    Color(0xFF2563EB),
    Color(0xFF7C3AED),
    Color(0xFFB45309),
    Color(0xFF0891B2),
    Color(0xFF059669),
    Color(0xFFbe185d),
  ];
  if (name == null || name.isEmpty) return palette[0];
  return palette[name.codeUnitAt(0) % palette.length];
}

Color _avatarBg(String? name) => _avatarColor(name).withValues(alpha: 0.12);

String _initials(String? name) {
  if (name == null || name.trim().isEmpty) return '?';
  final parts = name.trim().split(RegExp(r'\s+'));
  if (parts.length >= 2) return '${parts[0][0]}${parts[1][0]}'.toUpperCase();
  return parts[0][0].toUpperCase();
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
    _searchController.addListener(() => setState(() => _query = _searchController.text));
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
    final clientsAsync = ref.watch(clientsProvider);
    final salesAsync   = ref.watch(recentSalesProvider);

    final clients = clientsAsync.valueOrNull ?? const [];
    final sales   = salesAsync.valueOrNull   ?? const [];

    // Per-client sales aggregate — mirrors web clientStats reducer.
    final perClientSales = <String, double>{};
    for (final s in sales) {
      final shopId = s.shopId;
      if (shopId == null) continue;
      perClientSales[shopId] =
          (perClientSales[shopId] ?? 0) + (s.totalAmount ?? 0);
    }

    // Aggregate KPIs (web parity).
    double totalReceivables = 0;
    String topDebtorName = 'None';
    double topDebtorAmount = 0;
    String topPerformerName = 'None';
    double topPerformerAmount = 0;
    for (final c in clients) {
      final out   = c.outstandingBalance ?? 0;
      final sales = perClientSales[c.id] ?? 0;
      totalReceivables += out;
      if (out > topDebtorAmount) {
        topDebtorAmount = out;
        topDebtorName   = c.name ?? '—';
      }
      if (sales > topPerformerAmount) {
        topPerformerAmount = sales;
        topPerformerName   = c.name ?? '—';
      }
    }

    final clientCount = clients.length;

    return Scaffold(
      backgroundColor: AppColors.canvas,
      appBar: AppBar(
        backgroundColor: AppColors.canvas,
        elevation: 0,
        scrolledUnderElevation: 0,
        actions: const [SyncStatusPill()],
      ),
      floatingActionButton: FloatingActionButton.extended(
        heroTag: 'crm_fab',
        onPressed: _openAdd,
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
        elevation: 4,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        icon: const Icon(LucideIcons.userPlus, size: 18),
        label: AnimatedBuilder(
          animation: _tabController,
          builder: (context2, child2) => Text(
            _tabController.index == 0 ? 'New Client' : 'New Supplier',
            style: GoogleFonts.inter(fontWeight: FontWeight.w700, fontSize: 13),
          ),
        ),
      ),
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // ── Hero header ─────────────────────────────────────────────────
            _CRMHeader(
              clientCount: clientCount,
              totalReceivables: totalReceivables,
              topDebtorName: topDebtorName,
              topDebtorAmount: topDebtorAmount,
              topPerformerName: topPerformerName,
              topPerformerAmount: topPerformerAmount,
              onAdd: _openAdd,
            ),

            const SizedBox(height: 16),

            // ── Search ───────────────────────────────────────────────────────
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: _SearchBar(controller: _searchController),
            ),

            const SizedBox(height: 14),

            // ── Tab bar ──────────────────────────────────────────────────────
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: _PillTabBar(controller: _tabController),
            ),

            const SizedBox(height: 12),

            // ── Content ──────────────────────────────────────────────────────
            Expanded(
              child: TabBarView(
                controller: _tabController,
                children: [
                  _ClientsTab(query: _query),
                  _SuppliersDirectoryTab(query: _query),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ─── Hero header ─────────────────────────────────────────────────────────────
// Stats mirror web ClientDirectory: Total Clients · Total Receivables ·
// Top Debtor · Top Performer. Suppliers metrics live on the Suppliers screen.
class _CRMHeader extends StatelessWidget {
  final int    clientCount;
  final double totalReceivables;
  final String topDebtorName;
  final double topDebtorAmount;
  final String topPerformerName;
  final double topPerformerAmount;
  final VoidCallback onAdd;

  const _CRMHeader({
    required this.clientCount,
    required this.totalReceivables,
    required this.topDebtorName,
    required this.topDebtorAmount,
    required this.topPerformerName,
    required this.topPerformerAmount,
    required this.onAdd,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.fromLTRB(20, 20, 20, 0),
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: AppColors.primary,
        borderRadius: BorderRadius.circular(24),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'CRM',
                      style: GoogleFonts.jetBrainsMono(
                        fontSize: 10,
                        fontWeight: FontWeight.w700,
                        color: AppColors.primaryContainer,
                        letterSpacing: 2,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      'Clients & Suppliers',
                      style: GoogleFonts.hankenGrotesk(
                        fontSize: 22,
                        fontWeight: FontWeight.w800,
                        color: Colors.white,
                        letterSpacing: -0.3,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      'Manage your business network',
                      style: GoogleFonts.inter(
                        fontSize: 12,
                        color: Colors.white.withValues(alpha: 0.65),
                      ),
                    ),
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: const Icon(LucideIcons.network, color: Colors.white, size: 22),
              ),
            ],
          ),

          const SizedBox(height: 16),

          // 4 KPI chips matching web ClientDirectory.
          Row(
            children: [
              _StatChip(
                label: 'TOTAL CLIENTS',
                value: clientCount.toString(),
                icon: LucideIcons.users,
                accent: AppColors.primaryContainer,
              ),
              const SizedBox(width: 8),
              _StatChip(
                label: 'RECEIVABLES',
                value: '₹${_compact(totalReceivables)}',
                icon: LucideIcons.creditCard,
                accent: const Color(0xFFa3e635),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              _StatChip(
                label: 'TOP DEBTOR',
                value: topDebtorAmount > 0 ? '₹${_compact(topDebtorAmount)}' : '—',
                sub: topDebtorName,
                icon: LucideIcons.alertCircle,
                accent: const Color(0xFFfecaca),
              ),
              const SizedBox(width: 8),
              _StatChip(
                label: 'TOP PERFORMER',
                value: topPerformerAmount > 0 ? '₹${_compact(topPerformerAmount)}' : '—',
                sub: topPerformerName,
                icon: LucideIcons.trendingUp,
                accent: AppColors.secondaryContainer,
              ),
            ],
          ),
        ],
      ),
    );
  }

  static String _compact(double v) {
    if (v >= 100000) return '${(v / 100000).toStringAsFixed(1)}L';
    if (v >= 1000) return '${(v / 1000).toStringAsFixed(1)}K';
    return v.toStringAsFixed(0);
  }
}

class _StatChip extends StatelessWidget {
  final String label;
  final String value;
  final String? sub;
  final IconData icon;
  final Color accent;

  const _StatChip({
    required this.label,
    required this.value,
    required this.icon,
    required this.accent,
    this.sub,
  });

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.1),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: Colors.white.withValues(alpha: 0.15)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  label,
                  style: GoogleFonts.jetBrainsMono(
                    fontSize: 8.5,
                    fontWeight: FontWeight.w700,
                    color: Colors.white.withValues(alpha: 0.6),
                    letterSpacing: 1,
                  ),
                ),
                Icon(icon, size: 11, color: accent),
              ],
            ),
            const SizedBox(height: 6),
            Text(
              value,
              style: GoogleFonts.hankenGrotesk(
                fontSize: 15,
                fontWeight: FontWeight.w900,
                color: Colors.white,
                letterSpacing: -0.3,
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            if (sub != null && sub!.isNotEmpty) ...[
              const SizedBox(height: 2),
              Text(
                sub!,
                style: GoogleFonts.inter(
                  fontSize: 9,
                  fontWeight: FontWeight.w600,
                  color: Colors.white.withValues(alpha: 0.55),
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ],
          ],
        ),
      ),
    );
  }
}

// ─── Search bar ───────────────────────────────────────────────────────────────
class _SearchBar extends StatelessWidget {
  final TextEditingController controller;
  const _SearchBar({required this.controller});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [AppColors.cardShadow],
      ),
      child: TextField(
        controller: controller,
        style: GoogleFonts.inter(fontSize: 14, color: AppColors.inkPrimary),
        decoration: InputDecoration(
          hintText: 'Search by name, phone, email…',
          hintStyle: GoogleFonts.inter(fontSize: 13, color: AppColors.inkTertiary),
          prefixIcon: const Icon(LucideIcons.search, size: 18, color: AppColors.inkTertiary),
          suffixIcon: controller.text.isNotEmpty
              ? IconButton(
                  icon: const Icon(LucideIcons.x, size: 16, color: AppColors.inkTertiary),
                  onPressed: controller.clear,
                )
              : null,
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(16),
            borderSide: BorderSide.none,
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(16),
            borderSide: const BorderSide(color: AppColors.primaryContainer, width: 2),
          ),
          filled: true,
          fillColor: Colors.white,
          contentPadding: const EdgeInsets.symmetric(vertical: 14),
        ),
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
      height: 44,
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        boxShadow: [AppColors.cardShadow],
      ),
      child: TabBar(
        controller: controller,
        indicatorSize: TabBarIndicatorSize.tab,
        indicator: BoxDecoration(
          color: AppColors.primary,
          borderRadius: BorderRadius.circular(10),
        ),
        labelColor: Colors.white,
        unselectedLabelColor: AppColors.inkTertiary,
        labelStyle: GoogleFonts.inter(fontWeight: FontWeight.w700, fontSize: 13),
        unselectedLabelStyle: GoogleFonts.inter(fontWeight: FontWeight.w500, fontSize: 13),
        dividerColor: Colors.transparent,
        splashBorderRadius: BorderRadius.circular(10),
        tabs: const [
          Tab(text: 'Clients'),
          Tab(text: 'Supplier Directory'),
        ],
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
    final async = ref.watch(clientsProvider);

    return async.when(
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

        final totalBalance = filtered.fold(0.0, (s, c) => s + (c.outstandingBalance ?? 0));

        return Column(
          children: [
            // ── Quick-access AR action chips ────────────────────────────────
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 6, 20, 6),
              child: Row(
                children: [
                  OutlinedButton.icon(
                    onPressed: () => Navigator.push(
                      context,
                      MaterialPageRoute(builder: (_) => const ClientAgingScreen()),
                    ),
                    icon: const Icon(LucideIcons.calendarClock, size: 14),
                    label: Text(
                      'Aging Report',
                      style: GoogleFonts.inter(fontSize: 12, fontWeight: FontWeight.w600),
                    ),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: AppColors.primary,
                      side: const BorderSide(color: AppColors.primary, width: 1.2),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                      tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    ),
                  ),
                  const SizedBox(width: 10),
                  OutlinedButton.icon(
                    onPressed: () => Navigator.push(
                      context,
                      MaterialPageRoute(builder: (_) => const ClientPaymentsScreen()),
                    ),
                    icon: const Icon(LucideIcons.creditCard, size: 14),
                    label: Text(
                      'Payments',
                      style: GoogleFonts.inter(fontSize: 12, fontWeight: FontWeight.w600),
                    ),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: AppColors.secondary,
                      side: BorderSide(color: AppColors.secondary, width: 1.2),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                      tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    ),
                  ),
                ],
              ),
            ),
            _SummaryRow(
              leftLabel: '${filtered.length} client${filtered.length == 1 ? '' : 's'}',
              rightLabel: totalBalance == 0
                  ? 'All clear'
                  : 'Outstanding: ₹${totalBalance.toStringAsFixed(0)}',
              rightColor: totalBalance > 0 ? AppColors.danger : AppColors.success,
            ),
            Expanded(
              child: ListView.separated(
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 120),
                itemCount: filtered.length,
                separatorBuilder: (context3, i3) => const SizedBox(height: 10),
                itemBuilder: (ctx, i) => _ClientCard(
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

class _ClientCard extends StatelessWidget {
  final Client client;
  final VoidCallback onTap;
  const _ClientCard({required this.client, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final balance = client.outstandingBalance ?? 0;
    final hasGstin = (client.gstNo ?? client.gstin) != null;
    final avatarColor = _avatarColor(client.name);
    final avatarBg = _avatarBg(client.name);

    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(20),
          boxShadow: [AppColors.cardShadow],
        ),
        child: Row(
          children: [
            // Avatar
            Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(color: avatarBg, shape: BoxShape.circle),
              child: Center(
                child: Text(
                  _initials(client.name),
                  style: GoogleFonts.hankenGrotesk(
                    fontSize: 16,
                    fontWeight: FontWeight.w800,
                    color: avatarColor,
                  ),
                ),
              ),
            ),
            const SizedBox(width: 14),

            // Info
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          client.name ?? 'Unknown',
                          style: GoogleFonts.hankenGrotesk(
                            fontSize: 15,
                            fontWeight: FontWeight.w700,
                            color: AppColors.inkPrimary,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      if (hasGstin)
                        Container(
                          margin: const EdgeInsets.only(left: 6),
                          padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                          decoration: BoxDecoration(
                            color: AppColors.primaryContainer.withValues(alpha: 0.25),
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: Text(
                            'GST',
                            style: GoogleFonts.jetBrainsMono(
                              fontSize: 9,
                              fontWeight: FontWeight.w700,
                              color: AppColors.primary,
                            ),
                          ),
                        ),
                    ],
                  ),
                  const SizedBox(height: 3),
                  if (client.phone != null)
                    Row(
                      children: [
                        const Icon(LucideIcons.phone, size: 11, color: AppColors.inkTertiary),
                        const SizedBox(width: 4),
                        Text(
                          client.phone!,
                          style: GoogleFonts.inter(fontSize: 12, color: AppColors.inkTertiary),
                        ),
                      ],
                    ),
                  if (client.email != null)
                    Row(
                      children: [
                        const Icon(LucideIcons.mail, size: 11, color: AppColors.inkTertiary),
                        const SizedBox(width: 4),
                        Expanded(
                          child: Text(
                            client.email!,
                            style: GoogleFonts.inter(fontSize: 12, color: AppColors.inkTertiary),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ),
                ],
              ),
            ),

            const SizedBox(width: 12),

            // Balance + chevron
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: balance > 0
                        ? AppColors.danger.withValues(alpha: 0.08)
                        : AppColors.success.withValues(alpha: 0.08),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    balance == 0 ? 'Clear' : '₹${balance.toStringAsFixed(0)}',
                    style: GoogleFonts.hankenGrotesk(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      color: balance > 0 ? AppColors.danger : AppColors.success,
                    ),
                  ),
                ),
                const SizedBox(height: 6),
                const Icon(LucideIcons.chevronRight, size: 15, color: AppColors.inkTertiary),
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

  // Indian-format compact (parity with web/dashboard helpers).
  static String _fmtAmount(double v) {
    final whole = v.truncate();
    final s = whole.toString();
    if (s.length <= 3) return '₹$s';
    final last3 = s.substring(s.length - 3);
    final rest = s.substring(0, s.length - 3);
    final restGrouped =
        rest.replaceAllMapped(RegExp(r'(\d)(?=(\d{2})+$)'), (m) => '${m[1]},');
    return '₹$restGrouped,$last3';
  }

  String _accountTypeLabel(String? t) =>
      t == 'B2B' ? 'B2B · BUSINESS' : 'B2C · CONSUMER';

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
    final balance = client.outstandingBalance ?? 0;
    final avatarColor = _avatarColor(client.name);
    final avatarBg = _avatarBg(client.name);

    // Sales aggregate for this client (matches web clientStats).
    final salesAsync = ref.watch(recentSalesProvider);
    final mySales = (salesAsync.valueOrNull ?? const [])
        .where((s) => s.shopId == client.id)
        .toList();
    final totalSales = mySales.fold(0.0, (s, sale) => s + (sale.totalAmount ?? 0));
    final orderCount = mySales.length;

    final clientType = client.clientType ?? 'B2C';
    final gstinValue = (client.gstin ?? client.gstNo ?? '').trim();
    final hasGstin = gstinValue.isNotEmpty;
    final hasState = (client.state ?? '').isNotEmpty;

    return DraggableScrollableSheet(
      initialChildSize: 0.7,
      minChildSize: 0.4,
      maxChildSize: 0.95,
      builder: (_, scroll) => Container(
        decoration: const BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
        ),
        child: Column(
          children: [
            // Drag handle
            Container(
              margin: const EdgeInsets.only(top: 12),
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: AppColors.outlineVariant,
                borderRadius: BorderRadius.circular(2),
              ),
            ),

            Expanded(
              child: ListView(
                controller: scroll,
                padding: const EdgeInsets.fromLTRB(24, 20, 24, 40),
                children: [
                  // Header
                  Row(
                    children: [
                      Container(
                        width: 60,
                        height: 60,
                        decoration: BoxDecoration(color: avatarBg, shape: BoxShape.circle),
                        child: Center(
                          child: Text(
                            _initials(client.name),
                            style: GoogleFonts.hankenGrotesk(
                              fontSize: 22,
                              fontWeight: FontWeight.w800,
                              color: avatarColor,
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(width: 16),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              client.name ?? 'Unknown',
                              style: GoogleFonts.hankenGrotesk(
                                fontSize: 20,
                                fontWeight: FontWeight.w800,
                                color: AppColors.inkPrimary,
                              ),
                            ),
                            // Account type pill (B2B / B2C) — matches web preview chip.
                            Container(
                              margin: const EdgeInsets.only(top: 4),
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                              decoration: BoxDecoration(
                                color: clientType == 'B2B'
                                    ? AppColors.primary.withValues(alpha: 0.1)
                                    : AppColors.secondaryContainer,
                                borderRadius: BorderRadius.circular(6),
                              ),
                              child: Text(
                                _accountTypeLabel(client.clientType),
                                style: GoogleFonts.jetBrainsMono(
                                  fontSize: 9,
                                  fontWeight: FontWeight.w700,
                                  color: clientType == 'B2B'
                                      ? AppColors.primary
                                      : AppColors.secondary,
                                  letterSpacing: 1.2,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                      // Edit button
                      GestureDetector(
                        onTap: () {
                          Navigator.pop(context);
                          Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (_) => AddClientScreen(client: client),
                            ),
                          ).then((_) => ref.invalidate(clientsProvider));
                        },
                        child: Container(
                          padding: const EdgeInsets.all(10),
                          decoration: BoxDecoration(
                            color: AppColors.primaryContainer.withValues(alpha: 0.2),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: const Icon(LucideIcons.pencil, size: 18, color: AppColors.primary),
                        ),
                      ),
                    ],
                  ),

                  const SizedBox(height: 24),

                  // ── Balance card — always shows ₹ amount + Cleared/Unpaid chip ──
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: balance > 0
                          ? AppColors.danger.withValues(alpha: 0.06)
                          : AppColors.success.withValues(alpha: 0.06),
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(
                        color: balance > 0
                            ? AppColors.danger.withValues(alpha: 0.2)
                            : AppColors.success.withValues(alpha: 0.2),
                      ),
                    ),
                    child: Row(
                      children: [
                        Icon(
                          balance > 0 ? LucideIcons.alertCircle : LucideIcons.checkCircle2,
                          size: 20,
                          color: balance > 0 ? AppColors.danger : AppColors.success,
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'Outstanding Balance',
                                style: GoogleFonts.inter(
                                    fontSize: 11, color: AppColors.inkTertiary),
                              ),
                              Row(
                                crossAxisAlignment: CrossAxisAlignment.end,
                                children: [
                                  Text(
                                    _fmtAmount(balance),
                                    style: GoogleFonts.hankenGrotesk(
                                      fontSize: 22,
                                      fontWeight: FontWeight.w900,
                                      color: balance > 0 ? AppColors.danger : AppColors.success,
                                      letterSpacing: -0.5,
                                    ),
                                  ),
                                  const SizedBox(width: 10),
                                  Padding(
                                    padding: const EdgeInsets.only(bottom: 4),
                                    child: Container(
                                      padding: const EdgeInsets.symmetric(
                                          horizontal: 8, vertical: 3),
                                      decoration: BoxDecoration(
                                        color: balance > 0
                                            ? AppColors.danger.withValues(alpha: 0.12)
                                            : AppColors.success.withValues(alpha: 0.12),
                                        borderRadius: BorderRadius.circular(99),
                                      ),
                                      child: Text(
                                        balance > 0 ? 'UNPAID' : 'CLEARED',
                                        style: GoogleFonts.jetBrainsMono(
                                          fontSize: 9,
                                          fontWeight: FontWeight.w700,
                                          color: balance > 0
                                              ? AppColors.danger
                                              : AppColors.success,
                                          letterSpacing: 1.2,
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

                  const SizedBox(height: 16),

                  // ── Sales summary ─────────────────────────────────────────
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: Colors.black.withValues(alpha: 0.05)),
                      boxShadow: [AppColors.cardShadow],
                    ),
                    child: Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('TOTAL SALES',
                                  style: GoogleFonts.jetBrainsMono(
                                      fontSize: 9,
                                      fontWeight: FontWeight.w700,
                                      color: AppColors.inkTertiary,
                                      letterSpacing: 1.2)),
                              const SizedBox(height: 4),
                              Text(_fmtAmount(totalSales),
                                  style: GoogleFonts.hankenGrotesk(
                                      fontSize: 18,
                                      fontWeight: FontWeight.w900,
                                      color: AppColors.inkPrimary,
                                      letterSpacing: -0.4)),
                            ],
                          ),
                        ),
                        Container(width: 1, height: 32, color: Colors.black.withValues(alpha: 0.05)),
                        const SizedBox(width: 16),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('ORDERS',
                                  style: GoogleFonts.jetBrainsMono(
                                      fontSize: 9,
                                      fontWeight: FontWeight.w700,
                                      color: AppColors.inkTertiary,
                                      letterSpacing: 1.2)),
                              const SizedBox(height: 4),
                              Text('$orderCount',
                                  style: GoogleFonts.hankenGrotesk(
                                      fontSize: 18,
                                      fontWeight: FontWeight.w900,
                                      color: AppColors.inkPrimary,
                                      letterSpacing: -0.4)),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),

                  const SizedBox(height: 16),

                  // ── Contact Info — only render rows with data ──
                  if (client.phone != null || client.email != null || client.address != null)
                    _DetailSection(
                      title: 'CONTACT INFO',
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

                  // ── Tax info — hide entirely when both GSTIN + state empty ──
                  if (hasGstin || hasState) ...[
                    const SizedBox(height: 16),
                    _DetailSection(
                      title: 'TAX INFORMATION',
                      icon: LucideIcons.fileText,
                      rows: [
                        if (hasGstin)
                          _InfoRow(icon: LucideIcons.hash, label: 'GSTIN', value: gstinValue),
                        if (hasState)
                          _InfoRow(
                              icon: LucideIcons.mapPin,
                              label: 'State',
                              value: '${client.state}${client.stateCode != null ? ' (${client.stateCode})' : ''}'),
                      ],
                    ),
                  ],

                  // ── Classification (replaces Credit Limit row) ──
                  const SizedBox(height: 16),
                  _DetailSection(
                    title: 'CLASSIFICATION',
                    icon: LucideIcons.tag,
                    rows: [
                      _InfoRow(
                        icon: clientType == 'B2B' ? LucideIcons.building2 : LucideIcons.shoppingBag,
                        label: 'Account Type',
                        value: _accountTypeLabel(client.clientType),
                      ),
                      _InfoRow(
                        icon: LucideIcons.tag,
                        label: 'Price Tier',
                        value: _priceTierLabel(client.priceTier),
                      ),
                      _InfoRow(
                        icon: LucideIcons.clock,
                        label: 'Credit Terms',
                        value: _creditTermLabel(client.creditDays),
                      ),
                    ],
                  ),

                  if (client.createdAt != null) ...[
                    const SizedBox(height: 20),
                    Text(
                      'Added ${_formatDate(client.createdAt!)}',
                      style: GoogleFonts.inter(
                        fontSize: 11,
                        color: AppColors.inkTertiary,
                      ),
                      textAlign: TextAlign.center,
                    ),
                  ],

                  // ── AR action buttons ───────────────────────────────────
                  const SizedBox(height: 20),
                  Row(
                    children: [
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
                          icon: const Icon(LucideIcons.bookOpen, size: 15),
                          label: Text(
                            'View Statement',
                            style: GoogleFonts.inter(fontSize: 13, fontWeight: FontWeight.w600),
                          ),
                          style: OutlinedButton.styleFrom(
                            foregroundColor: AppColors.primary,
                            side: const BorderSide(color: AppColors.primary, width: 1.2),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                            padding: const EdgeInsets.symmetric(vertical: 12),
                          ),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: ElevatedButton.icon(
                          onPressed: () {
                            Navigator.pop(context);
                            Navigator.push(
                              context,
                              MaterialPageRoute(
                                builder: (_) => ClientSettlementScreen(client: client),
                              ),
                            );
                          },
                          icon: const Icon(LucideIcons.checkCircle2, size: 15),
                          label: Text(
                            'Settle Account',
                            style: GoogleFonts.inter(fontSize: 13, fontWeight: FontWeight.w600),
                          ),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: AppColors.primary,
                            foregroundColor: Colors.white,
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                            padding: const EdgeInsets.symmetric(vertical: 12),
                            elevation: 0,
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
    );
  }

  static String _formatDate(DateTime d) =>
      '${d.day} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.month - 1]} ${d.year}';
}

// ─── SUPPLIERS DIRECTORY TAB ──────────────────────────────────────────────────
class _SuppliersDirectoryTab extends ConsumerWidget {
  final String query;
  const _SuppliersDirectoryTab({required this.query});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(suppliersProvider);

    return async.when(
      data: (suppliers) {
        final filtered = query.isEmpty
            ? suppliers
            : suppliers.where((s) {
                final q = query.toLowerCase();
                return (s.name ?? '').toLowerCase().contains(q) ||
                    (s.contactPerson ?? '').toLowerCase().contains(q) ||
                    (s.phone ?? '').contains(q) ||
                    (s.email ?? '').toLowerCase().contains(q);
              }).toList();

        if (filtered.isEmpty) {
          return _EmptyState(
            icon: LucideIcons.building2,
            message: query.isEmpty ? 'No suppliers yet' : 'No results for "$query"',
          );
        }

        // Group by first letter
        final Map<String, List<Supplier>> grouped = {};
        for (final s in filtered) {
          final letter = (s.name?.isNotEmpty == true) ? s.name![0].toUpperCase() : '#';
          grouped.putIfAbsent(letter, () => []).add(s);
        }
        final sortedKeys = grouped.keys.toList()..sort();

        final totalPayable = filtered.fold(0.0, (s, sup) => s + (sup.balance ?? 0));

        return Column(
          children: [
            _SummaryRow(
              leftLabel: '${filtered.length} supplier${filtered.length == 1 ? '' : 's'}',
              rightLabel: 'Payable: ₹${totalPayable.toStringAsFixed(0)}',
              rightColor: AppColors.inkTertiary,
            ),
            Expanded(
              child: ListView.builder(
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 120),
                itemCount: sortedKeys.fold<int>(0, (count, k) => count + 1 + (grouped[k]?.length ?? 0)),
                itemBuilder: (ctx, globalIndex) {
                  // Flatten: [header, cards, header, cards, ...]
                  int cursor = 0;
                  for (final key in sortedKeys) {
                    if (globalIndex == cursor) {
                      return _DirectoryHeader(letter: key);
                    }
                    cursor++;
                    final items = grouped[key]!;
                    if (globalIndex < cursor + items.length) {
                      final supplier = items[globalIndex - cursor];
                      return Padding(
                        padding: const EdgeInsets.only(bottom: 10),
                        child: _SupplierCard(
                          supplier: supplier,
                          onTap: () => _showSupplierDetail(ctx, supplier, ref),
                        ),
                      );
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

  void _showSupplierDetail(BuildContext context, Supplier supplier, WidgetRef ref) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => SupplierDetailScreen(supplier: supplier),
      ),
    ).then((_) => ref.invalidate(suppliersProvider));
  }
}

class _DirectoryHeader extends StatelessWidget {
  final String letter;
  const _DirectoryHeader({required this.letter});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 8, bottom: 6),
      child: Row(
        children: [
          Container(
            width: 28,
            height: 28,
            decoration: BoxDecoration(
              color: AppColors.primary,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Center(
              child: Text(
                letter,
                style: GoogleFonts.hankenGrotesk(
                  fontSize: 13,
                  fontWeight: FontWeight.w800,
                  color: Colors.white,
                ),
              ),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Container(height: 1, color: AppColors.outlineVariant.withValues(alpha: 0.5)),
          ),
        ],
      ),
    );
  }
}

class _SupplierCard extends StatelessWidget {
  final Supplier supplier;
  final VoidCallback onTap;
  const _SupplierCard({required this.supplier, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final avatarColor = _avatarColor(supplier.name);
    final avatarBg = _avatarBg(supplier.name);
    final balance = supplier.balance ?? 0;

    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(20),
          boxShadow: [AppColors.cardShadow],
        ),
        child: Row(
          children: [
            // Avatar
            Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(color: avatarBg, shape: BoxShape.circle),
              child: Center(
                child: Text(
                  _initials(supplier.name),
                  style: GoogleFonts.hankenGrotesk(
                    fontSize: 16,
                    fontWeight: FontWeight.w800,
                    color: avatarColor,
                  ),
                ),
              ),
            ),
            const SizedBox(width: 14),

            // Info
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    supplier.name ?? 'Unknown',
                    style: GoogleFonts.hankenGrotesk(
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                      color: AppColors.inkPrimary,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 3),
                  if (supplier.contactPerson != null)
                    Row(
                      children: [
                        const Icon(LucideIcons.user, size: 11, color: AppColors.inkTertiary),
                        const SizedBox(width: 4),
                        Text(
                          supplier.contactPerson!,
                          style: GoogleFonts.inter(fontSize: 12, color: AppColors.inkTertiary),
                        ),
                      ],
                    ),
                  if (supplier.phone != null)
                    Row(
                      children: [
                        const Icon(LucideIcons.phone, size: 11, color: AppColors.inkTertiary),
                        const SizedBox(width: 4),
                        Text(
                          supplier.phone!,
                          style: GoogleFonts.inter(fontSize: 12, color: AppColors.inkTertiary),
                        ),
                      ],
                    ),
                ],
              ),
            ),

            const SizedBox(width: 12),

            // Balance + chevron
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                if (balance != 0)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: AppColors.warning.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      '₹${balance.toStringAsFixed(0)}',
                      style: GoogleFonts.hankenGrotesk(
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        color: AppColors.warning,
                      ),
                    ),
                  )
                else
                  Text(
                    'Clear',
                    style: GoogleFonts.hankenGrotesk(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: AppColors.success,
                    ),
                  ),
                const SizedBox(height: 6),
                const Icon(LucideIcons.chevronRight, size: 15, color: AppColors.inkTertiary),
              ],
            ),
          ],
        ),
      ),
    );
  }
}


// ─── Shared detail components ─────────────────────────────────────────────────
class _DetailSection extends StatelessWidget {
  final String title;
  final IconData icon;
  final List<_InfoRow> rows;
  const _DetailSection({
    required this.title,
    required this.icon,
    required this.rows,
  });

  @override
  Widget build(BuildContext context) {
    if (rows.isEmpty) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(icon, size: 13, color: AppColors.inkTertiary),
            const SizedBox(width: 6),
            Text(
              title,
              style: GoogleFonts.jetBrainsMono(
                fontSize: 10,
                fontWeight: FontWeight.w700,
                color: AppColors.inkTertiary,
                letterSpacing: 1.2,
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),
        Container(
          decoration: BoxDecoration(
            color: AppColors.canvas,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: AppColors.outlineVariant.withValues(alpha: 0.6)),
          ),
          child: Column(
            children: rows.map((row) {
              final isLast = row == rows.last;
              return Column(
                children: [
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Icon(row.icon, size: 15, color: AppColors.inkTertiary),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                row.label,
                                style: GoogleFonts.inter(
                                  fontSize: 10,
                                  color: AppColors.inkTertiary,
                                ),
                              ),
                              const SizedBox(height: 1),
                              Text(
                                row.value,
                                style: GoogleFonts.inter(
                                  fontSize: 14,
                                  fontWeight: FontWeight.w500,
                                  color: AppColors.inkPrimary,
                                ),
                              ),
                            ],
                          ),
                        ),
                        GestureDetector(
                          onTap: () {
                            Clipboard.setData(ClipboardData(text: row.value));
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(
                                content: Text('Copied!',
                                    style: GoogleFonts.inter(color: AppColors.inkPrimary)),
                                backgroundColor: AppColors.primaryContainer,
                                behavior: SnackBarBehavior.floating,
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                                duration: const Duration(seconds: 1),
                              ),
                            );
                          },
                          child: const Icon(LucideIcons.copy, size: 14, color: AppColors.inkTertiary),
                        ),
                      ],
                    ),
                  ),
                  if (!isLast)
                    Divider(
                      height: 1,
                      indent: 16,
                      endIndent: 16,
                      color: AppColors.outlineVariant.withValues(alpha: 0.4),
                    ),
                ],
              );
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
class _SummaryRow extends StatelessWidget {
  final String leftLabel;
  final String rightLabel;
  final Color rightColor;
  const _SummaryRow({
    required this.leftLabel,
    required this.rightLabel,
    required this.rightColor,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 4, 20, 0),
      child: Row(
        children: [
          Text(
            leftLabel,
            style: GoogleFonts.jetBrainsMono(
              fontSize: 11,
              color: AppColors.inkTertiary,
            ),
          ),
          const SizedBox(width: 14),
          Text(
            rightLabel,
            style: GoogleFonts.jetBrainsMono(
              fontSize: 11,
              color: rightColor,
            ),
          ),
        ],
      ),
    );
  }
}

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
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: AppColors.surfaceContainer,
              shape: BoxShape.circle,
            ),
            child: Icon(icon, size: 32, color: AppColors.inkTertiary),
          ),
          const SizedBox(height: 16),
          Text(
            message,
            style: GoogleFonts.hankenGrotesk(
              fontSize: 16,
              fontWeight: FontWeight.w600,
              color: AppColors.inkSecondary,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            'Tap + to add one',
            style: GoogleFonts.inter(fontSize: 13, color: AppColors.inkTertiary),
          ),
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
        child: Text(
          'Error: $message',
          style: GoogleFonts.inter(color: AppColors.danger, fontSize: 13),
          textAlign: TextAlign.center,
        ),
      ),
    );
  }
}

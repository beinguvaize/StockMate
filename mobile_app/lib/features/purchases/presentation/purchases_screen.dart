import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile_app/core/auth/feature_gate.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/core/supabase/client.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:mobile_app/features/purchases/presentation/purchase_detail_screen.dart';
import 'package:mobile_app/features/dashboard/presentation/providers/telemetry_provider.dart';
import 'package:mobile_app/main.dart' show syncServiceProvider;

// ─── Model ────────────────────────────────────────────────────────────────────

class Purchase {
  final String id;
  final String? supplierName;
  final double totalAmount;
  final String? date;
  final String? status;        // PENDING / ORDERED / RECEIVED / CANCELLED
  final String? deliveryDate;
  final String? paymentType; // CASH / CREDIT / UDHAAR

  const Purchase({
    required this.id,
    this.supplierName,
    required this.totalAmount,
    this.date,
    this.status,
    this.deliveryDate,
    this.paymentType,
  });

  factory Purchase.fromMap(Map<String, dynamic> m) => Purchase(
        id: m['id'] as String,
        supplierName: m['supplier_name'] as String?,
        totalAmount: (m['total_amount'] as num? ?? 0).toDouble(),
        date: m['date'] as String?,
        status: (m['status'] as String?)?.toUpperCase(),
        deliveryDate: m['delivery_date'] as String?,
        paymentType: m['payment_type'] as String?,
      );

  String get poNumber => 'PO-${id.substring(0, 8).toUpperCase()}';

  /// Workflow status — defaults to RECEIVED if DB row predates the column.
  String get resolvedStatus => (status ?? 'RECEIVED').toUpperCase();
}

// ─── Provider ─────────────────────────────────────────────────────────────────

final purchasesProvider =
    FutureProvider.family<List<Purchase>, String>((ref, tenantId) async {
  final data = await supabase
      .from('purchases')
      .select('id, supplier_name, total_amount, date, payment_type, status')
      .eq('tenant_id', tenantId)
      .order('date', ascending: false);

  return (data as List)
      .map((row) => Purchase.fromMap(row as Map<String, dynamic>))
      .toList();
});

// ─── Screen ───────────────────────────────────────────────────────────────────

class PurchasesScreen extends ConsumerStatefulWidget {
  const PurchasesScreen({super.key});

  @override
  ConsumerState<PurchasesScreen> createState() => _PurchasesScreenState();
}

class _PurchasesScreenState extends ConsumerState<PurchasesScreen> {
  // Web purchases has no status field — filter by payment_type instead (CASH / CREDIT)
  // For now show all orders; status-based filtering removed (web never writes status column)
  int _filterIndex = 0; // 0=All, 1=Cash, 2=Credit
  static const _filters = ['All Orders', 'Cash', 'Credit'];

  static String _compact(double v) {
    if (v >= 10000000) return '₹${(v / 10000000).toStringAsFixed(1)}Cr';
    if (v >= 100000)   return '₹${(v / 100000).toStringAsFixed(1)}L';
    if (v >= 1000)     return '₹${(v / 1000).toStringAsFixed(1)}K';
    return '₹${v.toStringAsFixed(0)}';
  }

  static String _fmtDate(String? d) {
    if (d == null) return '—';
    try {
      final dt = DateTime.parse(d);
      const m = ['Jan','Feb','Mar','Apr','May','Jun',
                  'Jul','Aug','Sep','Oct','Nov','Dec'];
      return '${dt.day} ${m[dt.month - 1]} ${dt.year}';
    } catch (_) { return d; }
  }

  void _showAddSheet(String tenantId) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _AddPurchaseSheet(
        tenantId: tenantId,
        onSaved: () {
          ref.invalidate(purchasesProvider(tenantId));
          ref.invalidate(telemetryProvider);
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final tenantAsync = ref.watch(tenantContextProvider);

    return Scaffold(
      backgroundColor: AppColors.canvas,
      appBar: AppBar(
        backgroundColor: AppColors.canvas,
        elevation: 0,
        scrolledUnderElevation: 0,
        iconTheme: const IconThemeData(color: AppColors.inkPrimary),
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Purchases',
                style: GoogleFonts.hankenGrotesk(
                    fontSize: 20, fontWeight: FontWeight.w800,
                    letterSpacing: -0.5, color: AppColors.inkPrimary)),
            Text('Manage and track your supplier purchase orders.',
                style: GoogleFonts.inter(
                    fontSize: 11, color: AppColors.inkSecondary)),
          ],
        ),
        actions: [
          tenantAsync.maybeWhen(
            data: (ctx) {
              if (ctx == null || !planMeetsRequirement('purchases', ctx.plan)) {
                return const SizedBox.shrink();
              }
              return Padding(
                padding: const EdgeInsets.only(right: 12),
                child: GestureDetector(
                  onTap: () => _showAddSheet(ctx.tenantId),
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 14, vertical: 8),
                    decoration: BoxDecoration(
                      color: AppColors.primaryContainer,
                      borderRadius: BorderRadius.circular(99),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(LucideIcons.plus,
                            size: 14, color: AppColors.inkPrimary),
                        const SizedBox(width: 6),
                        Text('New Order',
                            style: GoogleFonts.inter(
                                fontSize: 12, fontWeight: FontWeight.w700,
                                color: AppColors.inkPrimary)),
                      ],
                    ),
                  ),
                ),
              );
            },
            orElse: () => const SizedBox.shrink(),
          ),
        ],
      ),
      body: tenantAsync.when(
        data: (ctx) {
          if (ctx == null) return const Center(child: Text('No tenant.'));
          if (!planMeetsRequirement('purchases', ctx.plan)) {
            return _UpgradeBanner(feature: 'Purchases');
          }

          final purchasesAsync = ref.watch(purchasesProvider(ctx.tenantId));

          return purchasesAsync.when(
            data: (all) {
              // ── Computed stats ───────────────────────────────────────
              final now = DateTime.now();
              final monthStart = DateTime(now.year, now.month, 1);

              // Web: outstanding = purchases where payment_type is CREDIT/UDHAAR
              // Since status column doesn't exist, show all unpaid (total_amount with no paid_amount)
              final outstanding = all.fold(0.0, (s, p) => s + p.totalAmount);
              final pendingCount = all.length;
              final monthlySpend = all.where((p) {
                try {
                  final d = DateTime.parse(p.date ?? '');
                  return d.isAfter(monthStart) || d.isAtSameMomentAs(monthStart);
                } catch (_) { return false; }
              }).fold(0.0, (s, p) => s + p.totalAmount);
              final totalSpend = all.fold(0.0, (s, p) => s + p.totalAmount);
              final monthlyFrac = totalSpend > 0
                  ? (monthlySpend / totalSpend).clamp(0.0, 1.0)
                  : 0.0;

              // ── Filtered list ────────────────────────────────────────
              // Web uses payment_type for filtering (CASH/CREDIT/UDHAAR)
              // Status column is not written by web — show all as-is
              final filtered = all.where((p) {
                if (_filterIndex == 1) return p.resolvedStatus == 'CASH';
                if (_filterIndex == 2) return ['CREDIT', 'UDHAAR'].contains(p.resolvedStatus);
                return true;
              }).toList();

              return CustomScrollView(
                slivers: [
                  // ── 3-column stat cards ────────────────────────────
                  SliverToBoxAdapter(
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
                      child: Row(
                        children: [
                          // Outstanding
                          Expanded(
                            child: _StatCard(
                              label: 'TOTAL OUTSTANDING',
                              value: _compact(outstanding),
                              valueColor: AppColors.primary,
                              sub: Icon(LucideIcons.trendingUp,
                                  size: 12,
                                  color: AppColors.inkTertiary),
                              subText: '$pendingCount orders unpaid',
                            ),
                          ),
                          const SizedBox(width: 10),
                          // Pending orders
                          Expanded(
                            child: _StatCard(
                              label: 'PENDING ORDERS',
                              value: '$pendingCount',
                              valueColor: AppColors.inkPrimary,
                              sub: Icon(LucideIcons.clock,
                                  size: 12,
                                  color: AppColors.inkTertiary),
                              subText: 'awaiting delivery',
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),

                  // Monthly spend full-width card
                  SliverToBoxAdapter(
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(16, 10, 16, 0),
                      child: Container(
                        padding: const EdgeInsets.all(18),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(18),
                          border: Border.all(
                              color: Colors.black.withValues(alpha: 0.06)),
                          boxShadow: [AppColors.cardShadow],
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('MONTHLY SPEND',
                                style: GoogleFonts.jetBrainsMono(
                                    fontSize: 10, fontWeight: FontWeight.w700,
                                    letterSpacing: 1.2,
                                    color: AppColors.inkSecondary)),
                            const SizedBox(height: 4),
                            Text(_compact(monthlySpend),
                                style: GoogleFonts.hankenGrotesk(
                                    fontSize: 28, fontWeight: FontWeight.w900,
                                    color: AppColors.secondary,
                                    letterSpacing: -1)),
                            const SizedBox(height: 12),
                            ClipRRect(
                              borderRadius: BorderRadius.circular(99),
                              child: LinearProgressIndicator(
                                value: monthlyFrac,
                                minHeight: 6,
                                backgroundColor: AppColors.canvas,
                                valueColor: const AlwaysStoppedAnimation<Color>(
                                    AppColors.primary),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),

                  // ── Filter chips ─────────────────────────────────────
                  SliverToBoxAdapter(
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(16, 20, 16, 0),
                      child: SingleChildScrollView(
                        scrollDirection: Axis.horizontal,
                        child: Row(
                          children: _filters.asMap().entries.map((e) {
                            final active = _filterIndex == e.key;
                            return Padding(
                              padding: EdgeInsets.only(
                                  right: e.key < _filters.length - 1 ? 8 : 0),
                              child: GestureDetector(
                                onTap: () =>
                                    setState(() => _filterIndex = e.key),
                                child: AnimatedContainer(
                                  duration: const Duration(milliseconds: 180),
                                  padding: const EdgeInsets.symmetric(
                                      horizontal: 16, vertical: 8),
                                  decoration: BoxDecoration(
                                    color: active
                                        ? AppColors.secondaryContainer
                                        : AppColors.surface,
                                    borderRadius: BorderRadius.circular(99),
                                    border: Border.all(
                                      color: active
                                          ? AppColors.secondary
                                              .withValues(alpha: 0.3)
                                          : Colors.black
                                              .withValues(alpha: 0.08),
                                    ),
                                  ),
                                  child: Text(
                                    e.value,
                                    style: GoogleFonts.inter(
                                      fontSize: 12,
                                      fontWeight: FontWeight.w600,
                                      color: active
                                          ? AppColors.secondary
                                          : AppColors.inkSecondary,
                                    ),
                                  ),
                                ),
                              ),
                            );
                          }).toList(),
                        ),
                      ),
                    ),
                  ),

                  // ── Section label ────────────────────────────────────
                  SliverToBoxAdapter(
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(16, 20, 16, 12),
                      child: Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.all(6),
                            decoration: BoxDecoration(
                              color: AppColors.primaryContainer
                                  .withValues(alpha: 0.3),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: const Icon(LucideIcons.clipboardList,
                                size: 14, color: AppColors.primary),
                          ),
                          const SizedBox(width: 10),
                          Text('PURCHASE ORDERS',
                              style: GoogleFonts.jetBrainsMono(
                                  fontSize: 11, fontWeight: FontWeight.w700,
                                  letterSpacing: 1.5, color: AppColors.primary)),
                        ],
                      ),
                    ),
                  ),

                  // ── List ─────────────────────────────────────────────
                  if (filtered.isEmpty)
                    SliverFillRemaining(
                      child: Center(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Container(
                              padding: const EdgeInsets.all(20),
                              decoration: const BoxDecoration(
                                  color: AppColors.surface, shape: BoxShape.circle),
                              child: const Icon(LucideIcons.shoppingBag,
                                  size: 36, color: AppColors.inkSecondary),
                            ),
                            const SizedBox(height: 16),
                            Text('No orders found',
                                style: GoogleFonts.hankenGrotesk(
                                    fontSize: 16, fontWeight: FontWeight.w700,
                                    color: AppColors.inkPrimary)),
                          ],
                        ),
                      ),
                    )
                  else
                    SliverPadding(
                      padding: const EdgeInsets.fromLTRB(16, 0, 16, 100),
                      sliver: SliverList(
                        delegate: SliverChildBuilderDelegate(
                          (context, i) => Padding(
                            padding: const EdgeInsets.only(bottom: 10),
                            child: GestureDetector(
                              onTap: () => Navigator.push(
                                context,
                                MaterialPageRoute(
                                  builder: (_) => PurchaseDetailScreen(
                                      purchase: filtered[i]),
                                ),
                              ),
                              child: _PurchaseCard(
                                purchase: filtered[i],
                                fmtDate: _fmtDate,
                              ),
                            ),
                          ),
                          childCount: filtered.length,
                        ),
                      ),
                    ),
                ],
              );
            },
            loading: () =>
                const Center(child: CircularProgressIndicator(color: AppColors.primary)),
            error: (e, _) => Center(
                child: Text('Error: $e',
                    style: GoogleFonts.inter(color: AppColors.danger))),
          );
        },
        loading: () =>
            const Center(child: CircularProgressIndicator(color: AppColors.primary)),
        error: (e, _) => Center(child: Text('Error: $e')),
      ),
    );
  }
}

// ─── Status helpers ───────────────────────────────────────────────────────────

Color orderStatusColor(String status) {
  switch (status.toUpperCase()) {
    case 'RECEIVED':  return AppColors.success;
    case 'ORDERED':   return AppColors.primary;
    case 'PENDING':   return AppColors.warning;
    case 'CANCELLED': return AppColors.inkTertiary;
    default:          return AppColors.inkSecondary;
  }
}

Color orderStatusBg(String status) {
  switch (status.toUpperCase()) {
    case 'RECEIVED':  return AppColors.success.withValues(alpha: 0.12);
    case 'ORDERED':   return AppColors.primaryContainer.withValues(alpha: 0.35);
    case 'PENDING':   return AppColors.warning.withValues(alpha: 0.12);
    case 'CANCELLED': return AppColors.surfaceContainer;
    default:          return const Color(0xFFE2E8F0);
  }
}

// ─── Stat card ────────────────────────────────────────────────────────────────

class _StatCard extends StatelessWidget {
  final String label;
  final String value;
  final Color valueColor;
  final Widget sub;
  final String subText;
  const _StatCard({
    required this.label,
    required this.value,
    required this.valueColor,
    required this.sub,
    required this.subText,
  });

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(18),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: Colors.black.withValues(alpha: 0.06)),
          boxShadow: [AppColors.cardShadow],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label,
                style: GoogleFonts.jetBrainsMono(
                    fontSize: 9, fontWeight: FontWeight.w700,
                    letterSpacing: 1.2, color: AppColors.inkSecondary)),
            const SizedBox(height: 6),
            Text(value,
                style: GoogleFonts.hankenGrotesk(
                    fontSize: 26, fontWeight: FontWeight.w900,
                    color: valueColor, letterSpacing: -1)),
            const SizedBox(height: 6),
            Row(children: [
              sub,
              const SizedBox(width: 4),
              Expanded(
                child: Text(subText,
                    style: GoogleFonts.inter(
                        fontSize: 10, color: AppColors.inkTertiary),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis),
              ),
            ]),
          ],
        ),
      );
}

// ─── Purchase card ────────────────────────────────────────────────────────────

class _PurchaseCard extends StatelessWidget {
  final Purchase purchase;
  final String Function(String?) fmtDate;
  const _PurchaseCard({required this.purchase, required this.fmtDate});

  @override
  Widget build(BuildContext context) {
    final status = purchase.resolvedStatus;
    final statusColor = orderStatusColor(status);
    final statusBg = orderStatusBg(status);

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: Colors.black.withValues(alpha: 0.06)),
        boxShadow: [AppColors.cardShadow],
      ),
      child: Row(
        children: [
          // ── Circle avatar ──────────────────────────────────────────
          Container(
            width: 46,
            height: 46,
            decoration: BoxDecoration(
              color: status == 'RECEIVED'
                  ? AppColors.secondaryContainer
                  : status == 'ORDERED'
                      ? AppColors.primaryContainer.withValues(alpha: 0.4)
                      : AppColors.canvas,
              shape: BoxShape.circle,
            ),
            child: Icon(
              status == 'RECEIVED'
                  ? LucideIcons.checkCircle
                  : status == 'ORDERED'
                      ? LucideIcons.warehouse
                      : LucideIcons.clock,
              size: 20,
              color: status == 'RECEIVED'
                  ? AppColors.secondary
                  : status == 'ORDERED'
                      ? AppColors.primary
                      : AppColors.inkSecondary,
            ),
          ),
          const SizedBox(width: 12),

          // ── Supplier + PO + date ───────────────────────────────────
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  purchase.supplierName ?? 'Unknown Supplier',
                  style: GoogleFonts.hankenGrotesk(
                      fontSize: 14, fontWeight: FontWeight.w700,
                      color: AppColors.inkPrimary),
                ),
                const SizedBox(height: 2),
                Text(
                  '${purchase.poNumber} · ${fmtDate(purchase.date)}',
                  style: GoogleFonts.jetBrainsMono(
                      fontSize: 10, color: AppColors.inkTertiary),
                ),
                if (purchase.deliveryDate != null) ...[
                  const SizedBox(height: 2),
                  Row(children: [
                    const Icon(LucideIcons.truck,
                        size: 10, color: AppColors.inkTertiary),
                    const SizedBox(width: 4),
                    Text('Est. ${fmtDate(purchase.deliveryDate)}',
                        style: GoogleFonts.inter(
                            fontSize: 10, color: AppColors.inkTertiary)),
                  ]),
                ],
              ],
            ),
          ),

          // ── Amount + status ────────────────────────────────────────
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                '₹${purchase.totalAmount.toStringAsFixed(2)}',
                style: GoogleFonts.hankenGrotesk(
                    fontSize: 15, fontWeight: FontWeight.w900,
                    color: AppColors.inkPrimary, letterSpacing: -0.5),
              ),
              const SizedBox(height: 5),
              Container(
                padding: const EdgeInsets.symmetric(
                    horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: statusBg,
                  borderRadius: BorderRadius.circular(99),
                ),
                child: Text(
                  status,
                  style: GoogleFonts.jetBrainsMono(
                      fontSize: 9, fontWeight: FontWeight.w700,
                      color: statusColor),
                ),
              ),
            ],
          ),

          const SizedBox(width: 8),
          const Icon(LucideIcons.chevronRight,
              size: 16, color: AppColors.inkTertiary),
        ],
      ),
    );
  }
}

// ─── Add Purchase Sheet ───────────────────────────────────────────────────────

class _AddPurchaseSheet extends ConsumerStatefulWidget {
  final String tenantId;
  final VoidCallback onSaved;
  const _AddPurchaseSheet({required this.tenantId, required this.onSaved});

  @override
  ConsumerState<_AddPurchaseSheet> createState() => _AddPurchaseSheetState();
}

class _PurchaseLine {
  String? productId;
  final qtyCtrl       = TextEditingController();
  final unitPriceCtrl = TextEditingController();
  final totalCtrl     = TextEditingController();

  void dispose() {
    qtyCtrl.dispose();
    unitPriceCtrl.dispose();
    totalCtrl.dispose();
  }

  double get qtyVal   => double.tryParse(qtyCtrl.text) ?? 0;
  double get totalVal => double.tryParse(totalCtrl.text) ?? 0;
  double? get unitCost {
    final u = double.tryParse(unitPriceCtrl.text);
    if (u != null) return u;
    if (qtyVal > 0 && totalVal > 0) return totalVal / qtyVal;
    return null;
  }

  bool get isValid => productId != null && qtyVal > 0 && totalVal > 0;
}

class _AddPurchaseSheetState extends ConsumerState<_AddPurchaseSheet> {
  List<Map<String, dynamic>> _products = [];
  List<Map<String, dynamic>> _suppliers = [];
  bool _loadingData = true;

  // Header
  String? _supplierId;
  String _paymentType = 'CASH';
  DateTime _date = DateTime.now();
  final _notesCtrl = TextEditingController();

  // Lines
  final List<_PurchaseLine> _lines = [_PurchaseLine()];

  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _loadDropdowns();
  }

  @override
  void dispose() {
    _notesCtrl.dispose();
    for (final l in _lines) {
      l.dispose();
    }
    super.dispose();
  }

  Future<void> _loadDropdowns() async {
    final results = await Future.wait([
      supabase
          .from('products')
          .select('id, name, sku, costPrice, stock')
          .order('name')
          .then((v) => v as List)
          .catchError((_) => <dynamic>[]),
      supabase
          .from('suppliers')
          .select('id, name')
          .order('name')
          .then((v) => v as List)
          .catchError((_) => <dynamic>[]),
    ]);

    if (mounted) {
      setState(() {
        _products  = results[0].map((e) => Map<String, dynamic>.from(e as Map)).toList();
        _suppliers = results[1].map((e) => Map<String, dynamic>.from(e as Map)).toList();
        _loadingData = false;
      });
    }
  }

  // ── Bidirectional calc per line ──────────────────────────────────────────────
  void _onQtyChanged(_PurchaseLine line, String val) {
    final q = double.tryParse(val);
    final u = double.tryParse(line.unitPriceCtrl.text);
    if (q != null && q > 0 && u != null) {
      line.totalCtrl.text = (u * q).toStringAsFixed(2);
    }
    setState(() {});
  }

  void _onUnitPriceChanged(_PurchaseLine line, String val) {
    final q = double.tryParse(line.qtyCtrl.text);
    final u = double.tryParse(val);
    if (q != null && q > 0 && u != null) {
      line.totalCtrl.text = (u * q).toStringAsFixed(2);
    }
    setState(() {});
  }

  void _onTotalChanged(_PurchaseLine line, String val) {
    final q = double.tryParse(line.qtyCtrl.text);
    final t = double.tryParse(val);
    if (q != null && q > 0 && t != null) {
      line.unitPriceCtrl.text = (t / q).toStringAsFixed(4);
    }
    setState(() {});
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _date,
      firstDate: DateTime(2020),
      lastDate: DateTime.now().add(const Duration(days: 30)),
      builder: (ctx, child) => Theme(
        data: Theme.of(ctx).copyWith(
          colorScheme: const ColorScheme.light(
            primary: AppColors.primary,
            onPrimary: Colors.white,
          ),
        ),
        child: child!,
      ),
    );
    if (picked != null) setState(() => _date = picked);
  }

  Future<void> _save() async {
    final validLines = _lines.where((l) => l.isValid).toList();
    if (_supplierId == null || validLines.isEmpty) return;

    setState(() => _saving = true);
    try {
      final currentUserId = supabase.auth.currentUser?.id;
      final dateStr = '${_date.year}-${_date.month.toString().padLeft(2,'0')}-${_date.day.toString().padLeft(2,'0')}';
      final notes = _notesCtrl.text.trim();

      // One RPC call per line. Offline-first: rpcOnlineOrQueue tries the
      // network and falls back to the local queue on transient failure.
      final svc = ref.read(syncServiceProvider);
      int queuedCount = 0;
      for (int i = 0; i < validLines.length; i++) {
        final line = validLines[i];
        final id = 'PUR-${DateTime.now().millisecondsSinceEpoch}-${i.toString().padLeft(2, '0')}';
        final params = <String, dynamic>{
          'p_id':           id,
          'p_product_id':   line.productId,
          'p_quantity':     line.qtyVal,
          'p_total_amount': line.totalVal,
          'p_supplier_id':  _supplierId,
          'p_payment_type': _paymentType,
          'p_date':         dateStr,
          'p_notes':        notes,
          'p_user_id':      currentUserId,
          'p_location_id':  null,
          'p_tenant_id':    widget.tenantId,
        };
        final queued = await svc.rpcOnlineOrQueue('process_purchase', params);
        if (queued) queuedCount++;
      }

      if (mounted) {
        Navigator.pop(context);
        widget.onSaved();
        final n = validLines.length;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(queuedCount > 0
                ? '$n item${n == 1 ? '' : 's'} saved · $queuedCount queued offline'
                : '$n item${n == 1 ? '' : 's'} saved'),
            backgroundColor: AppColors.secondary,
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text('Error: $e'),
          backgroundColor: AppColors.danger,
          duration: const Duration(seconds: 6),
        ));
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  String _fmt(DateTime d) {
    const m = ['Jan','Feb','Mar','Apr','May','Jun',
                'Jul','Aug','Sep','Oct','Nov','Dec'];
    return '${d.day} ${m[d.month-1]} ${d.year}';
  }

  double get _grandTotal => _lines.fold(0.0, (s, l) => s + l.totalVal);

  @override
  Widget build(BuildContext context) {
    final canSave = _supplierId != null && _lines.any((l) => l.isValid);
    final itemCount = _lines.where((l) => l.isValid).length;

    return DraggableScrollableSheet(
      initialChildSize: 0.95,
      maxChildSize: 0.97,
      minChildSize: 0.5,
      builder: (_, ctrl) => Container(
        decoration: const BoxDecoration(
          color: AppColors.canvas,
          borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
        ),
        child: Column(
          children: [
            Center(
              child: Container(
                margin: const EdgeInsets.only(top: 12, bottom: 4),
                width: 40, height: 4,
                decoration: BoxDecoration(
                  color: AppColors.outlineVariant,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            Expanded(
              child: _loadingData
                  ? const Center(child: CircularProgressIndicator(color: AppColors.primary))
                  : SingleChildScrollView(
                      controller: ctrl,
                      padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          // Header
                          Text('Add Purchase',
                              style: GoogleFonts.hankenGrotesk(
                                  fontSize: 22, fontWeight: FontWeight.w800,
                                  letterSpacing: -0.5, color: AppColors.inkPrimary)),
                          Text('ONE SUPPLIER · MULTIPLE PRODUCTS · SINGLE SUBMIT',
                              style: GoogleFonts.jetBrainsMono(
                                  fontSize: 9, fontWeight: FontWeight.w600,
                                  color: AppColors.inkSecondary, letterSpacing: 1.2)),
                          const SizedBox(height: 20),

                          // ── HEADER CARD ──────────────────────────────
                          Container(
                            padding: const EdgeInsets.all(14),
                            decoration: BoxDecoration(
                              color: AppColors.surface,
                              borderRadius: BorderRadius.circular(18),
                              boxShadow: [AppColors.cardShadow],
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: [
                                _label('SUPPLIER *'),
                                _Dropdown(
                                  hint: 'Select a supplier...',
                                  icon: LucideIcons.building2,
                                  value: _supplierId,
                                  items: _suppliers.map((s) => DropdownMenuItem(
                                    value: s['id'] as String,
                                    child: Text(s['name'] as String? ?? '',
                                        overflow: TextOverflow.ellipsis),
                                  )).toList(),
                                  onChanged: (v) => setState(() => _supplierId = v),
                                ),
                                const SizedBox(height: 12),
                                _label('PAYMENT TYPE'),
                                Row(
                                  children: [
                                    _PayChip(label: 'Cash', active: _paymentType == 'CASH',
                                      onTap: () => setState(() => _paymentType = 'CASH')),
                                    const SizedBox(width: 8),
                                    _PayChip(label: 'Credit', active: _paymentType == 'CREDIT',
                                      onTap: () => setState(() => _paymentType = 'CREDIT')),
                                    const SizedBox(width: 8),
                                    _PayChip(label: 'Bank', active: _paymentType == 'BANK',
                                      onTap: () => setState(() => _paymentType = 'BANK')),
                                  ],
                                ),
                                const SizedBox(height: 12),
                                _label('DATE'),
                                GestureDetector(
                                  onTap: _pickDate,
                                  child: Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                                    decoration: BoxDecoration(
                                      color: AppColors.canvas,
                                      borderRadius: BorderRadius.circular(12),
                                      border: Border.all(color: Colors.black.withValues(alpha: 0.05)),
                                    ),
                                    child: Row(
                                      children: [
                                        const Icon(LucideIcons.calendar,
                                            size: 16, color: AppColors.inkSecondary),
                                        const SizedBox(width: 10),
                                        Text(_fmt(_date),
                                            style: GoogleFonts.inter(
                                                fontSize: 13, fontWeight: FontWeight.w600,
                                                color: AppColors.inkPrimary)),
                                      ],
                                    ),
                                  ),
                                ),
                                const SizedBox(height: 12),
                                _label('NOTES (OPTIONAL)'),
                                Container(
                                  decoration: BoxDecoration(
                                    color: AppColors.canvas,
                                    borderRadius: BorderRadius.circular(12),
                                    border: Border.all(color: Colors.black.withValues(alpha: 0.05)),
                                  ),
                                  child: TextField(
                                    controller: _notesCtrl,
                                    style: GoogleFonts.inter(
                                        fontSize: 13, color: AppColors.inkPrimary),
                                    decoration: InputDecoration(
                                      prefixIcon: const Icon(LucideIcons.fileText,
                                          size: 16, color: AppColors.inkSecondary),
                                      hintText: 'Invoice no., remarks...',
                                      hintStyle: GoogleFonts.inter(
                                          fontSize: 13,
                                          color: AppColors.inkSecondary.withValues(alpha: 0.5)),
                                      border: InputBorder.none,
                                      contentPadding: const EdgeInsets.symmetric(
                                          horizontal: 12, vertical: 12),
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),

                          const SizedBox(height: 18),

                          // ── LINE ITEMS ───────────────────────────────
                          Row(
                            children: [
                              _label('LINE ITEMS'),
                              const Spacer(),
                              Text('${_lines.length} ROW${_lines.length == 1 ? '' : 'S'}',
                                  style: GoogleFonts.jetBrainsMono(
                                      fontSize: 9, fontWeight: FontWeight.w700,
                                      color: AppColors.inkTertiary, letterSpacing: 1)),
                            ],
                          ),
                          const SizedBox(height: 8),

                          ..._lines.asMap().entries.map((entry) {
                            final idx = entry.key;
                            final line = entry.value;
                            return Padding(
                              padding: const EdgeInsets.only(bottom: 12),
                              child: _LineItemCard(
                                index: idx,
                                line: line,
                                products: _products,
                                canRemove: _lines.length > 1,
                                onProductChange: (id) => setState(() => line.productId = id),
                                onQtyChange: (v) => _onQtyChanged(line, v),
                                onUnitPriceChange: (v) => _onUnitPriceChanged(line, v),
                                onTotalChange: (v) => _onTotalChanged(line, v),
                                onRemove: () => setState(() {
                                  line.dispose();
                                  _lines.removeAt(idx);
                                }),
                              ),
                            );
                          }),

                          // Add row
                          OutlinedButton.icon(
                            onPressed: () => setState(() => _lines.add(_PurchaseLine())),
                            icon: const Icon(LucideIcons.plus, size: 14),
                            label: Text('ADD ROW',
                                style: GoogleFonts.jetBrainsMono(
                                    fontSize: 11, fontWeight: FontWeight.w700,
                                    letterSpacing: 1)),
                            style: OutlinedButton.styleFrom(
                              foregroundColor: AppColors.primary,
                              backgroundColor: AppColors.primaryContainer.withValues(alpha: 0.3),
                              side: BorderSide(
                                  color: AppColors.primary.withValues(alpha: 0.3)),
                              padding: const EdgeInsets.symmetric(vertical: 12),
                              shape: const StadiumBorder(),
                            ),
                          ),

                          const SizedBox(height: 18),

                          // ── GRAND TOTAL ──────────────────────────────
                          Container(
                            padding: const EdgeInsets.all(16),
                            decoration: BoxDecoration(
                              color: AppColors.inkPrimary,
                              borderRadius: BorderRadius.circular(16),
                            ),
                            child: Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Text('GRAND TOTAL',
                                    style: GoogleFonts.jetBrainsMono(
                                        fontSize: 10, fontWeight: FontWeight.w700,
                                        color: Colors.white.withValues(alpha: 0.6),
                                        letterSpacing: 1.5)),
                                Text('₹${_grandTotal.toStringAsFixed(2)}',
                                    style: GoogleFonts.hankenGrotesk(
                                        fontSize: 24, fontWeight: FontWeight.w900,
                                        color: Colors.white, letterSpacing: -0.8)),
                              ],
                            ),
                          ),

                          const SizedBox(height: 22),

                          // Save button
                          SizedBox(
                            width: double.infinity,
                            child: ElevatedButton(
                              style: ElevatedButton.styleFrom(
                                backgroundColor: canSave
                                    ? AppColors.inkPrimary
                                    : AppColors.surfaceContainer,
                                foregroundColor: canSave
                                    ? Colors.white
                                    : AppColors.inkTertiary,
                                elevation: 0,
                                padding: const EdgeInsets.symmetric(vertical: 16),
                                shape: const StadiumBorder(),
                              ),
                              onPressed: canSave && !_saving ? _save : null,
                              child: _saving
                                  ? const SizedBox(
                                      width: 20, height: 20,
                                      child: CircularProgressIndicator(
                                          strokeWidth: 2, color: Colors.white))
                                  : Row(
                                      mainAxisAlignment: MainAxisAlignment.center,
                                      children: [
                                        const Icon(LucideIcons.checkCircle, size: 16),
                                        const SizedBox(width: 8),
                                        Text(
                                          'SAVE ${itemCount > 0 ? "$itemCount ITEM${itemCount == 1 ? '' : 'S'}" : 'PURCHASE'}',
                                          style: GoogleFonts.jetBrainsMono(
                                              fontSize: 12, fontWeight: FontWeight.w700,
                                              letterSpacing: 1.5),
                                        ),
                                      ],
                                    ),
                            ),
                          ),
                        ],
                      ),
                    ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _label(String text) => Padding(
    padding: const EdgeInsets.only(bottom: 6, left: 2),
    child: Text(text,
        style: GoogleFonts.jetBrainsMono(
            fontSize: 9, fontWeight: FontWeight.w700,
            color: AppColors.inkTertiary, letterSpacing: 1.2)),
  );
}

// ─── Line item card ─────────────────────────────────────────────────────────
class _LineItemCard extends StatelessWidget {
  final int index;
  final _PurchaseLine line;
  final List<Map<String, dynamic>> products;
  final bool canRemove;
  final ValueChanged<String?> onProductChange;
  final ValueChanged<String> onQtyChange;
  final ValueChanged<String> onUnitPriceChange;
  final ValueChanged<String> onTotalChange;
  final VoidCallback onRemove;

  const _LineItemCard({
    required this.index,
    required this.line,
    required this.products,
    required this.canRemove,
    required this.onProductChange,
    required this.onQtyChange,
    required this.onUnitPriceChange,
    required this.onTotalChange,
    required this.onRemove,
  });

  @override
  Widget build(BuildContext context) {
    final selectedProduct = line.productId == null
        ? null
        : products.firstWhere((p) => p['id'] == line.productId,
            orElse: () => <String, dynamic>{});

    final lastCost = selectedProduct?['costPrice'] == null
        ? null
        : double.tryParse(selectedProduct!['costPrice'].toString());
    final unit = line.unitCost;

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.black.withValues(alpha: 0.05)),
        boxShadow: [AppColors.cardShadow],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Row index + remove
          Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: AppColors.primary.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(99),
                ),
                child: Text('#${index + 1}',
                    style: GoogleFonts.jetBrainsMono(
                        fontSize: 10, fontWeight: FontWeight.w700,
                        color: AppColors.primary)),
              ),
              const Spacer(),
              if (canRemove)
                IconButton(
                  iconSize: 16,
                  padding: EdgeInsets.zero,
                  constraints: const BoxConstraints(minWidth: 28, minHeight: 28),
                  onPressed: onRemove,
                  icon: const Icon(LucideIcons.trash2, color: AppColors.danger),
                ),
            ],
          ),
          const SizedBox(height: 6),

          // Product picker
          _Dropdown(
            hint: 'Select product...',
            icon: LucideIcons.package,
            value: line.productId,
            items: products.map((p) => DropdownMenuItem(
              value: p['id'] as String,
              child: Text(
                '${p['name']}${p['sku'] != null ? ' (${p['sku']})' : ''}',
                overflow: TextOverflow.ellipsis,
              ),
            )).toList(),
            onChanged: onProductChange,
          ),

          if (selectedProduct != null && selectedProduct.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 6, left: 4),
              child: Text(
                'Stock: ${selectedProduct['stock'] ?? 0}'
                '${lastCost != null && lastCost > 0 ? " · Last ₹${lastCost.toStringAsFixed(2)}" : ""}',
                style: GoogleFonts.jetBrainsMono(
                    fontSize: 9, fontWeight: FontWeight.w600,
                    color: AppColors.inkTertiary),
              ),
            ),

          const SizedBox(height: 10),

          // Qty + Unit price row
          Row(
            children: [
              Expanded(
                child: _MiniField(
                  label: 'QTY',
                  ctrl: line.qtyCtrl,
                  icon: LucideIcons.hash,
                  onChanged: onQtyChange,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _MiniField(
                  label: 'UNIT',
                  ctrl: line.unitPriceCtrl,
                  icon: LucideIcons.indianRupee,
                  onChanged: onUnitPriceChange,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _MiniField(
                  label: 'TOTAL',
                  ctrl: line.totalCtrl,
                  icon: LucideIcons.indianRupee,
                  onChanged: onTotalChange,
                ),
              ),
            ],
          ),

          // Cost vs last
          if (unit != null && lastCost != null && lastCost > 0)
            Padding(
              padding: const EdgeInsets.only(top: 6, left: 4),
              child: Text(
                unit > lastCost
                    ? '▲ Higher than last ₹${lastCost.toStringAsFixed(2)}'
                    : '▼ Lower than last ₹${lastCost.toStringAsFixed(2)}',
                style: GoogleFonts.jetBrainsMono(
                  fontSize: 9, fontWeight: FontWeight.w700,
                  color: unit > lastCost ? AppColors.warning : AppColors.success,
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _MiniField extends StatelessWidget {
  final String label;
  final TextEditingController ctrl;
  final IconData icon;
  final ValueChanged<String>? onChanged;
  const _MiniField({
    required this.label,
    required this.ctrl,
    required this.icon,
    this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(bottom: 4, left: 2),
          child: Text(label,
              style: GoogleFonts.jetBrainsMono(
                  fontSize: 8, fontWeight: FontWeight.w700,
                  color: AppColors.inkTertiary, letterSpacing: 1)),
        ),
        Container(
          decoration: BoxDecoration(
            color: AppColors.canvas,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: Colors.black.withValues(alpha: 0.05)),
          ),
          child: TextField(
            controller: ctrl,
            onChanged: onChanged,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            style: GoogleFonts.inter(
                fontSize: 13, fontWeight: FontWeight.w600,
                color: AppColors.inkPrimary),
            decoration: InputDecoration(
              prefixIcon: Icon(icon, size: 13, color: AppColors.inkSecondary),
              prefixIconConstraints: const BoxConstraints(minWidth: 30, minHeight: 0),
              hintText: '0',
              hintStyle: GoogleFonts.inter(
                  color: AppColors.inkSecondary.withValues(alpha: 0.4),
                  fontSize: 13),
              border: InputBorder.none,
              contentPadding: const EdgeInsets.symmetric(horizontal: 4, vertical: 10),
            ),
          ),
        ),
      ],
    );
  }
}


class _Dropdown extends StatelessWidget {
  final String hint;
  final IconData icon;
  final String? value;
  final List<DropdownMenuItem<String>> items;
  final void Function(String?) onChanged;

  const _Dropdown({
    required this.hint,
    required this.icon,
    required this.value,
    required this.items,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        boxShadow: [AppColors.cardShadow],
      ),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<String>(
          value: value,
          hint: Row(
            children: [
              Icon(icon, size: 18, color: AppColors.inkSecondary),
              const SizedBox(width: 10),
              Text(hint,
                  style: GoogleFonts.inter(
                      fontSize: 14,
                      color: AppColors.inkSecondary.withValues(alpha: 0.5))),
            ],
          ),
          icon: const Icon(LucideIcons.chevronDown,
              size: 16, color: AppColors.inkSecondary),
          isExpanded: true,
          style: GoogleFonts.inter(fontSize: 14, color: AppColors.inkPrimary),
          items: items,
          onChanged: onChanged,
        ),
      ),
    );
  }
}

class _PayChip extends StatelessWidget {
  final String label;
  final bool active;
  final VoidCallback onTap;
  const _PayChip({required this.label, required this.active, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
        decoration: BoxDecoration(
          color: active ? AppColors.primaryContainer : Colors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: active ? AppColors.primary : Colors.transparent,
          ),
          boxShadow: [AppColors.cardShadow],
        ),
        child: Text(label,
            style: GoogleFonts.inter(
                fontSize: 13, fontWeight: FontWeight.w600,
                color: active ? AppColors.primary : AppColors.inkSecondary)),
      ),
    );
  }
}

// ─── Upgrade banner ───────────────────────────────────────────────────────────

class _UpgradeBanner extends StatelessWidget {
  final String feature;
  const _UpgradeBanner({required this.feature});

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                padding: const EdgeInsets.all(24),
                decoration: BoxDecoration(
                  color: AppColors.primaryContainer.withValues(alpha: 0.2),
                  shape: BoxShape.circle,
                ),
                child: const Icon(LucideIcons.lock,
                    color: AppColors.primary, size: 40),
              ),
              const SizedBox(height: 20),
              Text('Upgrade Required',
                  style: GoogleFonts.hankenGrotesk(
                      fontSize: 22, fontWeight: FontWeight.w900,
                      letterSpacing: -0.5)),
              const SizedBox(height: 8),
              Text('$feature requires PRO plan or above.',
                  textAlign: TextAlign.center,
                  style: GoogleFonts.inter(
                      color: AppColors.inkSecondary, fontSize: 14)),
            ],
          ),
        ),
      );
}

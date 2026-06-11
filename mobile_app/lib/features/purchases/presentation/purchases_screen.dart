import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:image_picker/image_picker.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile_app/core/auth/feature_gate.dart';
import 'package:mobile_app/core/widgets/barcode_scanner_screen.dart';
import 'package:uuid/uuid.dart';
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
  final double quantity;
  final String? linkedProductId;

  const Purchase({
    required this.id,
    this.supplierName,
    required this.totalAmount,
    this.date,
    this.status,
    this.deliveryDate,
    this.paymentType,
    this.quantity = 0,
    this.linkedProductId,
  });

  factory Purchase.fromMap(Map<String, dynamic> m) => Purchase(
        id: m['id'] as String,
        supplierName: m['supplier_name'] as String?,
        totalAmount: (m['total_amount'] as num? ?? 0).toDouble(),
        date: m['date'] as String?,
        status: (m['status'] as String?)?.toUpperCase(),
        deliveryDate: m['delivery_date'] as String?,
        paymentType: m['payment_type'] as String?,
        quantity: (m['quantity'] as num? ?? 0).toDouble(),
        linkedProductId: m['linked_product_id'] as String?,
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
      .select('id, supplier_name, total_amount, date, payment_type, status, quantity, linked_product_id')
      .eq('tenant_id', tenantId)
      .isFilter('deleted_at', null)
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
                style: GoogleFonts.manrope(
                    fontSize: 20, fontWeight: FontWeight.w800,
                    letterSpacing: -0.5, color: AppColors.inkPrimary)),
            Text('Manage and track your supplier purchase orders.',
                style: GoogleFonts.manrope(
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
                            style: GoogleFonts.manrope(
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
                final pay = (p.paymentType ?? 'CASH').toUpperCase();
                if (_filterIndex == 1) return pay == 'CASH';
                if (_filterIndex == 2) return pay == 'CREDIT' || pay == 'UDHAAR';
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
                                style: GoogleFonts.manrope(
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
                                    style: GoogleFonts.manrope(
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
                                style: GoogleFonts.manrope(
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
                    style: GoogleFonts.manrope(color: AppColors.danger))),
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
                style: GoogleFonts.manrope(
                    fontSize: 26, fontWeight: FontWeight.w900,
                    color: valueColor, letterSpacing: -1)),
            const SizedBox(height: 6),
            Row(children: [
              sub,
              const SizedBox(width: 4),
              Expanded(
                child: Text(subText,
                    style: GoogleFonts.manrope(
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
                  style: GoogleFonts.manrope(
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
                        style: GoogleFonts.manrope(
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
                style: GoogleFonts.manrope(
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
  DateTime? expiryDate; // optional — creates a dated batch for expiry tracking
  String? scannedName; // item name read off a scanned bill (hint for picking)
  double? scannedTaxRate; // GST % from the bill (used by create-from-scan)
  List<Map<String, dynamic>> suggestions = []; // fuzzy candidates for chips
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
  List<Map<String, dynamic>> _aliases = [];
  bool _loadingData = true;

  // Header
  String? _supplierId;
  String _paymentType = 'CASH';
  DateTime _date = DateTime.now();
  final _notesCtrl = TextEditingController();

  // Lines
  final List<_PurchaseLine> _lines = [_PurchaseLine()];

  bool _saving = false;
  bool _scanning = false;

  @override
  void initState() {
    super.initState();
    _loadDropdowns();
  }

  // ── AI bill scan: photo → extract-bill edge fn → prefill supplier + lines ──
  Future<void> _scanBill() async {
    final picker = ImagePicker();
    final XFile? shot = await showModalBottomSheet<XFile?>(
      context: context,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (sheetCtx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(LucideIcons.camera, color: AppColors.primary),
              title: Text('Take photo',
                  style: GoogleFonts.manrope(fontWeight: FontWeight.w600)),
              onTap: () async {
                final nav = Navigator.of(sheetCtx);
                final img = await picker.pickImage(
                    source: ImageSource.camera, imageQuality: 70, maxWidth: 1600);
                nav.pop(img);
              },
            ),
            ListTile(
              leading: const Icon(LucideIcons.image, color: AppColors.primary),
              title: Text('Choose from gallery',
                  style: GoogleFonts.manrope(fontWeight: FontWeight.w600)),
              onTap: () async {
                final nav = Navigator.of(sheetCtx);
                final img = await picker.pickImage(
                    source: ImageSource.gallery, imageQuality: 70, maxWidth: 1600);
                nav.pop(img);
              },
            ),
          ],
        ),
      ),
    );
    if (shot == null) return;

    setState(() => _scanning = true);
    try {
      final bytes = await shot.readAsBytes();
      final mime = shot.mimeType ??
          (shot.name.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg');
      final res = await supabase.functions.invoke('extract-bill', body: {
        'image_base64': base64Encode(bytes),
        'mime_type': mime,
      });
      final data = (res.data?['data'] as Map?)?.cast<String, dynamic>();
      final reconcile = (res.data?['reconcile'] as Map?)?.cast<String, dynamic>();
      if (data == null) throw 'No data returned';
      _applyExtracted(data);

      if (mounted) {
        final ok = reconcile?['taxable_ok'] == true && reconcile?['total_ok'] == true;
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(ok
              ? 'Bill read — review the prefilled details below.'
              : 'Bill read, but totals didn\'t reconcile — double-check amounts.'),
          backgroundColor: ok ? AppColors.secondary : AppColors.warning,
          behavior: SnackBarBehavior.floating,
        ));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text('Scan failed: $e'),
          backgroundColor: AppColors.danger,
          behavior: SnackBarBehavior.floating,
        ));
      }
    } finally {
      if (mounted) setState(() => _scanning = false);
    }
  }

  // ── Matching helpers ────────────────────────────────────────────────────────
  static String _normTxt(String s) =>
      s.toLowerCase().replaceAll(RegExp(r'[^a-z0-9 ]'), ' ').replaceAll(RegExp(r'\s+'), ' ').trim();

  // Token-overlap similarity (0..1) with a prefix bonus — tolerant of word
  // order, pack-size noise and small typos on bill item names.
  static double _fuzzy(String a, String b) {
    final ta = _normTxt(a).split(' ').where((t) => t.isNotEmpty).toSet();
    final tb = _normTxt(b).split(' ').where((t) => t.isNotEmpty).toSet();
    if (ta.isEmpty || tb.isEmpty) return 0;
    int hit = 0;
    for (final t in ta) {
      if (tb.contains(t)) { hit++; continue; }
      // prefix tolerance: "sunflwer" ~ "sunflower"
      if (t.length >= 4 && tb.any((o) => o.startsWith(t.substring(0, 4)) || t.startsWith(o.length >= 4 ? o.substring(0, 4) : o))) {
        hit++;
      }
    }
    return (2.0 * hit) / (ta.length + tb.length);
  }

  // Rank products against a scanned name. Returns best-first list of products.
  List<Map<String, dynamic>> _rankProducts(String name, {int top = 3}) {
    final scored = _products
        .map((p) => MapEntry(p, _fuzzy(name, (p['name'] ?? '').toString())))
        .where((e) => e.value > 0.2)
        .toList()
      ..sort((a, b) => b.value.compareTo(a.value));
    return scored.take(top).map((e) => e.key).toList();
  }

  // Alias memory lookup: supplier-specific first, then any-supplier.
  String? _aliasMatch(String name) {
    final key = _normTxt(name).replaceAll(' ', '');
    Map<String, dynamic>? hit;
    for (final a in _aliases) {
      if (a['alias_norm'] != key) continue;
      if (a['supplier_id'] == _supplierId) { hit = a; break; }
      hit ??= a;
    }
    final pid = hit?['product_id'] as String?;
    // Only honour aliases that still point at a live product.
    if (pid != null && _products.any((p) => p['id'] == pid)) return pid;
    return null;
  }

  // Link a line to a product + learn the alias for future scans.
  Future<void> _selectProductForLine(_PurchaseLine line, String? productId) async {
    setState(() => line.productId = productId);
    final name = line.scannedName;
    if (productId == null || name == null || name.isEmpty) return;
    final key = _normTxt(name).replaceAll(' ', '');
    try {
      await supabase.from('product_aliases').upsert({
        'tenant_id': widget.tenantId,
        'supplier_id': _supplierId,
        'alias_norm': key,
        'alias_raw': name,
        'product_id': productId,
      }, onConflict: 'tenant_id,supplier_id,alias_norm');
      _aliases.removeWhere((a) => a['alias_norm'] == key && a['supplier_id'] == _supplierId);
      _aliases.add({'supplier_id': _supplierId, 'alias_norm': key, 'product_id': productId});
    } catch (_) {/* alias save is best-effort */}
  }

  // One-tap create product from a scanned bill line (name + cost prefilled).
  Future<void> _createFromScan(_PurchaseLine line) async {
    final name = line.scannedName;
    if (name == null || name.isEmpty) return;
    final rate = double.tryParse(line.unitPriceCtrl.text) ?? 0;
    final id = 'PROD-${DateTime.now().millisecondsSinceEpoch}-'
        '${(1000 + (DateTime.now().microsecond % 9000))}';
    try {
      await supabase.from('products').insert({
        'id': id,
        'name': name,
        'sku': '',
        'costPrice': rate,
        'sellingPrice': rate, // user adjusts margin later in Inventory
        'stock': 0,           // stock arrives via this purchase itself
        'lowStockThreshold': 10.0,
        'category': 'Other',
        'unit': 'pcs',
        'taxRate': line.scannedTaxRate ?? 0,
        'tenant_id': widget.tenantId,
      });
      _products.add({'id': id, 'name': name, 'sku': '', 'costPrice': rate, 'stock': 0});
      await _selectProductForLine(line, id);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text('Product "$name" created'),
          backgroundColor: AppColors.secondary,
          behavior: SnackBarBehavior.floating,
        ));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text('Create failed: $e'), backgroundColor: AppColors.danger));
      }
    }
  }

  // Map extracted JSON onto the form. Supplier: GSTIN first (exact), then
  // fuzzy name. Products: learned alias -> fuzzy auto-match -> top-3 chips.
  void _applyExtracted(Map<String, dynamic> d) {
    // Supplier by GSTIN (unique + printed on every GST bill).
    final gstin = (d['gstin'] as String?)?.trim().toUpperCase();
    if (gstin != null && gstin.length == 15) {
      final m = _suppliers.firstWhere(
        (s) => ((s['gstin'] ?? '') as String).toUpperCase() == gstin,
        orElse: () => <String, dynamic>{},
      );
      if (m.isNotEmpty) _supplierId = m['id'] as String?;
    }
    // Fallback: fuzzy supplier name. On a hit, learn the bill GSTIN onto the
    // supplier record so the next scan matches exactly.
    if (_supplierId == null) {
      final supName = (d['supplier_name'] as String?)?.trim();
      if (supName != null && supName.isNotEmpty && _suppliers.isNotEmpty) {
        final scored = _suppliers
            .map((s) => MapEntry(s, _fuzzy(supName, (s['name'] ?? '').toString())))
            .toList()
          ..sort((a, b) => b.value.compareTo(a.value));
        if (scored.isNotEmpty && scored.first.value >= 0.5) {
          final sup = scored.first.key;
          _supplierId = sup['id'] as String?;
          final existing = (sup['gstin'] ?? '').toString();
          if (gstin != null && gstin.length == 15 && existing.isEmpty) {
            sup['gstin'] = gstin;
            supabase.from('suppliers').update({'gstin': gstin})
                .eq('id', sup['id']).eq('tenant_id', widget.tenantId)
                .then((_) {}, onError: (_) {});
          }
        }
      }
    }

    // Date.
    final dateStr = d['date'] as String?;
    if (dateStr != null) {
      final parsed = DateTime.tryParse(dateStr);
      if (parsed != null) _date = parsed;
    }

    // Lines.
    final items = (d['items'] as List?) ?? const [];
    if (items.isNotEmpty) {
      for (final l in _lines) {
        l.dispose();
      }
      _lines.clear();
      for (final raw in items) {
        final it = (raw as Map).cast<String, dynamic>();
        final line = _PurchaseLine();
        final qty = (it['qty'] as num?)?.toDouble() ?? 0;
        final rate = (it['rate'] as num?)?.toDouble() ?? 0;
        final amount = (it['amount'] as num?)?.toDouble() ?? (qty * rate);
        if (qty > 0) line.qtyCtrl.text = qty.toString();
        if (rate > 0) line.unitPriceCtrl.text = rate.toString();
        if (amount > 0) line.totalCtrl.text = amount.toStringAsFixed(2);
        line.scannedTaxRate = (it['tax_rate'] as num?)?.toDouble();

        final name = (it['name'] as String?)?.trim();
        line.scannedName = (name != null && name.isNotEmpty) ? name : null;
        if (name != null && name.isNotEmpty && _products.isNotEmpty) {
          // 1. Learned alias (exact memory of past picks).
          final aliasPid = _aliasMatch(name);
          if (aliasPid != null) {
            line.productId = aliasPid;
          } else {
            // 2. Fuzzy auto-match when confident; 3. else top-3 suggestions.
            final ranked = _rankProducts(name);
            if (ranked.isNotEmpty &&
                _fuzzy(name, (ranked.first['name'] ?? '').toString()) >= 0.75) {
              line.productId = ranked.first['id'] as String?;
            } else {
              line.suggestions = ranked;
            }
          }
        }
        _lines.add(line);
      }
      if (_lines.isEmpty) _lines.add(_PurchaseLine());
    }
    setState(() {});
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
          .select('id, name, sku, barcode, costPrice, stock')
          .isFilter('deleted_at', null)
          .order('name')
          .then((v) => v as List)
          .catchError((_) => <dynamic>[]),
      supabase
          .from('suppliers')
          .select('id, name, gstin')
          .isFilter('deleted_at', null)
          .order('name')
          .then((v) => v as List)
          .catchError((_) => <dynamic>[]),
      // Learned bill-text -> product mappings (alias memory for bill OCR).
      supabase
          .from('product_aliases')
          .select('supplier_id, alias_norm, product_id')
          .then((v) => v as List)
          .catchError((_) => <dynamic>[]),
    ]);

    if (mounted) {
      setState(() {
        _products  = results[0].map((e) => Map<String, dynamic>.from(e as Map)).toList();
        _suppliers = results[1].map((e) => Map<String, dynamic>.from(e as Map)).toList();
        _aliases   = results[2].map((e) => Map<String, dynamic>.from(e as Map)).toList();
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

        // Expiry tracking: dated batch per line when an expiry was set.
        if (line.expiryDate != null) {
          final exp = line.expiryDate!;
          await svc.upsertOnlineOrQueue('product_batches', {
            'id': const Uuid().v4(),
            'tenant_id': widget.tenantId,
            'product_id': line.productId,
            'purchase_id': id,
            'supplier_id': _supplierId,
            'received_date': dateStr,
            'unit_cost': line.unitCost ?? 0,
            'qty_received': line.qtyVal,
            'qty_remaining': line.qtyVal,
            'expiry_date':
                '${exp.year}-${exp.month.toString().padLeft(2, '0')}-${exp.day.toString().padLeft(2, '0')}',
          });
        }
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
                              style: GoogleFonts.manrope(
                                  fontSize: 22, fontWeight: FontWeight.w800,
                                  letterSpacing: -0.5, color: AppColors.inkPrimary)),
                          Text('ONE SUPPLIER · MULTIPLE PRODUCTS · SINGLE SUBMIT',
                              style: GoogleFonts.jetBrainsMono(
                                  fontSize: 9, fontWeight: FontWeight.w600,
                                  color: AppColors.inkSecondary, letterSpacing: 1.2)),
                          const SizedBox(height: 16),

                          // ── Scan bill (AI OCR) ───────────────────────
                          GestureDetector(
                            onTap: _scanning ? null : _scanBill,
                            child: Container(
                              padding: const EdgeInsets.symmetric(vertical: 13),
                              decoration: BoxDecoration(
                                color: AppColors.primaryContainer,
                                borderRadius: BorderRadius.circular(14),
                                border: Border.all(
                                    color: AppColors.primary.withValues(alpha: 0.3)),
                              ),
                              child: Row(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  if (_scanning)
                                    const SizedBox(
                                      width: 16, height: 16,
                                      child: CircularProgressIndicator(
                                          strokeWidth: 2,
                                          color: AppColors.onPrimaryContainer),
                                    )
                                  else
                                    const Icon(LucideIcons.scanLine,
                                        size: 17, color: AppColors.onPrimaryContainer),
                                  const SizedBox(width: 8),
                                  Text(
                                    _scanning ? 'Reading bill…' : 'Scan bill with camera',
                                    style: GoogleFonts.manrope(
                                        fontSize: 13.5, fontWeight: FontWeight.w700,
                                        color: AppColors.onPrimaryContainer),
                                  ),
                                ],
                              ),
                            ),
                          ),
                          const SizedBox(height: 18),

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
                                            style: GoogleFonts.manrope(
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
                                    style: GoogleFonts.manrope(
                                        fontSize: 13, color: AppColors.inkPrimary),
                                    decoration: InputDecoration(
                                      prefixIcon: const Icon(LucideIcons.fileText,
                                          size: 16, color: AppColors.inkSecondary),
                                      hintText: 'Invoice no., remarks...',
                                      hintStyle: GoogleFonts.manrope(
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
                                onProductChange: (id) => _selectProductForLine(line, id),
                                onCreateFromScan: () => _createFromScan(line),
                                onExpiryChange: (d) => setState(() => line.expiryDate = d),
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
                                    style: GoogleFonts.manrope(
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
  final VoidCallback? onCreateFromScan;
  final ValueChanged<DateTime?>? onExpiryChange;

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
    this.onCreateFromScan,
    this.onExpiryChange,
  });

  // Searchable full-height picker — dropdowns don't scale past ~50 products.
  void _openProductSearch(BuildContext context) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _ProductSearchSheet(
        products: products,
        selectedId: line.productId,
        onSelected: (id) {
          onProductChange(id);
          Navigator.pop(context);
        },
      ),
    );
  }

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

          // Scanned-bill hint — tells the user which bill item this row is
          // when no inventory product matched automatically.
          if (line.scannedName != null && line.productId == null)
            Padding(
              padding: const EdgeInsets.only(bottom: 6, left: 2),
              child: Row(
                children: [
                  const Icon(LucideIcons.scanLine, size: 12, color: AppColors.primary),
                  const SizedBox(width: 5),
                  Expanded(
                    child: Text(
                      'On bill: ${line.scannedName}',
                      overflow: TextOverflow.ellipsis,
                      style: GoogleFonts.manrope(
                        fontSize: 11.5, fontWeight: FontWeight.w700,
                        color: AppColors.onPrimaryContainer,
                      ),
                    ),
                  ),
                ],
              ),
            ),

          // Product picker — opens a searchable sheet (type to filter).
          GestureDetector(
            onTap: () => _openProductSearch(context),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 13),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: Colors.black.withValues(alpha: 0.08)),
              ),
              child: Row(
                children: [
                  const Icon(LucideIcons.package, size: 16, color: AppColors.inkTertiary),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      (selectedProduct != null && selectedProduct.isNotEmpty)
                          ? '${selectedProduct['name']}'
                          : 'Select product...',
                      overflow: TextOverflow.ellipsis,
                      style: GoogleFonts.manrope(
                        fontSize: 13.5,
                        fontWeight: (selectedProduct != null && selectedProduct.isNotEmpty)
                            ? FontWeight.w600 : FontWeight.w400,
                        color: (selectedProduct != null && selectedProduct.isNotEmpty)
                            ? AppColors.inkPrimary : AppColors.inkTertiary,
                      ),
                    ),
                  ),
                  const Icon(LucideIcons.search, size: 14, color: AppColors.inkTertiary),
                ],
              ),
            ),
          ),

          // Suggestion chips for unmatched scanned lines: top fuzzy candidates
          // + one-tap create. Tapping a chip also teaches the alias memory.
          if (line.productId == null &&
              (line.suggestions.isNotEmpty || line.scannedName != null))
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Wrap(
                spacing: 6,
                runSpacing: 6,
                children: [
                  ...line.suggestions.map((p) => GestureDetector(
                        onTap: () => onProductChange(p['id'] as String?),
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                          decoration: BoxDecoration(
                            color: AppColors.primaryContainer,
                            borderRadius: BorderRadius.circular(99),
                          ),
                          child: Text(
                            '${p['name']}',
                            style: GoogleFonts.manrope(
                                fontSize: 11.5, fontWeight: FontWeight.w700,
                                color: AppColors.onPrimaryContainer),
                          ),
                        ),
                      )),
                  if (line.scannedName != null && onCreateFromScan != null)
                    GestureDetector(
                      onTap: onCreateFromScan,
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(99),
                          border: Border.all(color: AppColors.primary.withValues(alpha: 0.5)),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(LucideIcons.plus, size: 12, color: AppColors.primary),
                            const SizedBox(width: 4),
                            Text('Create new',
                                style: GoogleFonts.manrope(
                                    fontSize: 11.5, fontWeight: FontWeight.w700,
                                    color: AppColors.primary)),
                          ],
                        ),
                      ),
                    ),
                ],
              ),
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

          // Optional expiry — creates a dated batch for expiry tracking.
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: GestureDetector(
              onTap: () async {
                final picked = await showDatePicker(
                  context: context,
                  initialDate: line.expiryDate ?? DateTime.now().add(const Duration(days: 180)),
                  firstDate: DateTime.now(),
                  lastDate: DateTime.now().add(const Duration(days: 365 * 5)),
                );
                onExpiryChange?.call(picked);
              },
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(LucideIcons.calendarClock, size: 13,
                      color: line.expiryDate != null ? AppColors.warning : AppColors.inkTertiary),
                  const SizedBox(width: 5),
                  Text(
                    line.expiryDate != null
                        ? 'Expiry: ${line.expiryDate!.day}/${line.expiryDate!.month}/${line.expiryDate!.year}'
                        : 'Add expiry date (optional)',
                    style: GoogleFonts.manrope(
                        fontSize: 11, fontWeight: FontWeight.w600,
                        color: line.expiryDate != null ? AppColors.warning : AppColors.inkTertiary),
                  ),
                  if (line.expiryDate != null) ...[
                    const SizedBox(width: 6),
                    GestureDetector(
                      onTap: () => onExpiryChange?.call(null),
                      child: const Icon(LucideIcons.x, size: 12, color: AppColors.inkTertiary),
                    ),
                  ],
                ],
              ),
            ),
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
            style: GoogleFonts.manrope(
                fontSize: 13, fontWeight: FontWeight.w600,
                color: AppColors.inkPrimary),
            decoration: InputDecoration(
              prefixIcon: Icon(icon, size: 13, color: AppColors.inkSecondary),
              prefixIconConstraints: const BoxConstraints(minWidth: 30, minHeight: 0),
              hintText: '0',
              hintStyle: GoogleFonts.manrope(
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
                  style: GoogleFonts.manrope(
                      fontSize: 14,
                      color: AppColors.inkSecondary.withValues(alpha: 0.5))),
            ],
          ),
          icon: const Icon(LucideIcons.chevronDown,
              size: 16, color: AppColors.inkSecondary),
          isExpanded: true,
          style: GoogleFonts.manrope(fontSize: 14, color: AppColors.inkPrimary),
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
            style: GoogleFonts.manrope(
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
                  style: GoogleFonts.manrope(
                      fontSize: 22, fontWeight: FontWeight.w900,
                      letterSpacing: -0.5)),
              const SizedBox(height: 8),
              Text('$feature requires PRO plan or above.',
                  textAlign: TextAlign.center,
                  style: GoogleFonts.manrope(
                      color: AppColors.inkSecondary, fontSize: 14)),
            ],
          ),
        ),
      );
}

// ─── Product search sheet ─────────────────────────────────────────────────────
// Type-ahead picker for large catalogs (dropdowns stop working past ~50 SKUs).
class _ProductSearchSheet extends StatefulWidget {
  final List<Map<String, dynamic>> products;
  final String? selectedId;
  final ValueChanged<String?> onSelected;

  const _ProductSearchSheet({
    required this.products,
    required this.selectedId,
    required this.onSelected,
  });

  @override
  State<_ProductSearchSheet> createState() => _ProductSearchSheetState();
}

class _ProductSearchSheetState extends State<_ProductSearchSheet> {
  final _search = TextEditingController();
  late List<Map<String, dynamic>> _filtered = widget.products;

  @override
  void initState() {
    super.initState();
    _search.addListener(() {
      final q = _search.text.toLowerCase();
      setState(() {
        _filtered = q.isEmpty
            ? widget.products
            : widget.products.where((p) =>
                ('${p['name']}').toLowerCase().contains(q) ||
                ('${p['sku'] ?? ''}').toLowerCase().contains(q) ||
                ('${p['barcode'] ?? ''}').contains(q)).toList();
      });
    });
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  // Scan a physical product barcode -> match products.barcode (or SKU) ->
  // select instantly. The in-aisle way to pick from a large catalog.
  Future<void> _scanToPick() async {
    final code = await Navigator.push<String>(
      context,
      MaterialPageRoute(
          builder: (_) => const BarcodeScannerScreen(title: 'Scan product barcode')),
    );
    if (code == null || code.isEmpty || !mounted) return;
    final match = widget.products.firstWhere(
      (p) => ('${p['barcode'] ?? ''}' == code) || ('${p['sku'] ?? ''}' == code),
      orElse: () => <String, dynamic>{},
    );
    if (match.isNotEmpty) {
      widget.onSelected(match['id'] as String?);
    } else {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text('No product with barcode "$code"'),
        backgroundColor: AppColors.danger,
        behavior: SnackBarBehavior.floating,
      ));
    }
  }

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      initialChildSize: 0.85,
      maxChildSize: 0.95,
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
                margin: const EdgeInsets.only(top: 12, bottom: 8),
                width: 40, height: 4,
                decoration: BoxDecoration(
                  color: AppColors.outlineVariant,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 4, 20, 12),
              child: Row(
                children: [
                  Expanded(
                    child: Container(
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(14),
                        boxShadow: [AppColors.cardShadow],
                      ),
                      child: TextField(
                        controller: _search,
                        autofocus: true,
                        decoration: InputDecoration(
                          hintText: 'Search product or SKU...',
                          hintStyle: GoogleFonts.manrope(
                              fontSize: 13, color: AppColors.inkTertiary),
                          prefixIcon: const Icon(LucideIcons.search,
                              size: 16, color: AppColors.inkTertiary),
                          border: InputBorder.none,
                          contentPadding: const EdgeInsets.symmetric(vertical: 14),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  GestureDetector(
                    onTap: _scanToPick,
                    child: Container(
                      width: 48, height: 48,
                      decoration: BoxDecoration(
                        color: AppColors.primary,
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: const Icon(LucideIcons.scanLine,
                          size: 20, color: Colors.white),
                    ),
                  ),
                ],
              ),
            ),
            Expanded(
              child: _filtered.isEmpty
                  ? Center(
                      child: Text('No products found',
                          style: GoogleFonts.manrope(
                              fontSize: 13, color: AppColors.inkTertiary)),
                    )
                  : ListView.builder(
                      controller: ctrl,
                      padding: const EdgeInsets.fromLTRB(20, 0, 20, 40),
                      itemCount: _filtered.length,
                      itemBuilder: (context, i) {
                        final p = _filtered[i];
                        final isSelected = widget.selectedId == p['id'];
                        return GestureDetector(
                          onTap: () => widget.onSelected(p['id'] as String?),
                          child: Container(
                            margin: const EdgeInsets.only(bottom: 8),
                            padding: const EdgeInsets.all(14),
                            decoration: BoxDecoration(
                              color: isSelected
                                  ? AppColors.primaryContainer
                                  : Colors.white,
                              borderRadius: BorderRadius.circular(14),
                              border: Border.all(
                                color: isSelected
                                    ? AppColors.primary
                                    : Colors.transparent,
                              ),
                              boxShadow: [AppColors.cardShadow],
                            ),
                            child: Row(
                              children: [
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text('${p['name']}',
                                          style: GoogleFonts.manrope(
                                              fontWeight: FontWeight.w600,
                                              fontSize: 14,
                                              color: AppColors.inkPrimary)),
                                      Text(
                                        'Stock ${p['stock'] ?? 0}'
                                        '${(p['sku'] ?? '').toString().isNotEmpty ? " · ${p['sku']}" : ""}',
                                        style: GoogleFonts.jetBrainsMono(
                                            fontSize: 10,
                                            color: AppColors.inkTertiary),
                                      ),
                                    ],
                                  ),
                                ),
                                if (isSelected)
                                  const Icon(LucideIcons.checkCircle2,
                                      color: AppColors.primary, size: 18),
                              ],
                            ),
                          ),
                        );
                      },
                    ),
            ),
          ],
        ),
      ),
    );
  }
}

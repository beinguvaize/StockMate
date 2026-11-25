import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:mobile_app/core/design/bl_widgets.dart';
import 'package:mobile_app/core/utils/money.dart';
import 'package:mobile_app/features/clients_suppliers/presentation/providers/crm_provider.dart' show supplierOutstandingProvider;
import 'package:mobile_app/features/dashboard/presentation/dashboard_logic.dart' show compactRupees;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:supabase_flutter/supabase_flutter.dart' show PostgrestException, FunctionException;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:mobile_app/core/auth/feature_gate.dart';
import 'package:mobile_app/core/widgets/barcode_scanner_screen.dart';
import 'package:uuid/uuid.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/core/supabase/client.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:mobile_app/features/purchases/presentation/purchase_detail_screen.dart';
import 'package:mobile_app/features/dashboard/presentation/providers/telemetry_provider.dart';
import 'package:mobile_app/core/utils/price_check.dart';
import 'package:mobile_app/core/widgets/price_check_dialog.dart';
import 'package:mobile_app/main.dart' show syncServiceProvider, databaseProvider;

// ─── Model ────────────────────────────────────────────────────────────────────

/// A new purchase id: `PUR-` and 16 random hex digits. Made on the phone.
String newPurchaseId() =>
    'PUR-${const Uuid().v4().replaceAll('-', '').substring(0, 16).toUpperCase()}';

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
  final double paidAmount;

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
    this.paidAmount = 0,
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
        paidAmount: (m['paid_amount'] as num? ?? 0).toDouble(),
      );

  String get poNumber => 'PO-${id.substring(0, 8).toUpperCase()}';

  /// Workflow status — defaults to RECEIVED if DB row predates the column.
  String get resolvedStatus => (status ?? 'RECEIVED').toUpperCase();

  /// What is still owed on this bill.
  double get due {
    final d = totalAmount - paidAmount;
    return d > 0 ? d : 0;
  }
}

// ─── Provider ─────────────────────────────────────────────────────────────────

final purchasesProvider =
    FutureProvider.family<List<Purchase>, String>((ref, tenantId) async {
  final data = await supabase
      .from('purchases')
      .select('id, supplier_name, total_amount, paid_amount, date, payment_type, status, quantity, linked_product_id')
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

  static String _compact(double v) {
    final whole = v.round();
    final s = whole.abs().toString();
    final grouped = s.length <= 3
        ? s
        : '${s.substring(0, s.length - 3).replaceAllMapped(RegExp(r'(\d)(?=(\d{2})+$)'), (m) => '${m[1]},')},${s.substring(s.length - 3)}';
    return '${whole < 0 ? '-' : ''}₹$grouped';
  }

  void _showAddSheet(String tenantId) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => _AddPurchaseSheet(
          tenantId: tenantId,
          onSaved: () {
            ref.invalidate(purchasesProvider(tenantId));
            ref.invalidate(supplierOutstandingProvider);
            ref.invalidate(telemetryProvider);
          },
        ),
      ),
    );
  }

  static const _mon = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  /// "20 Nov"; the year only when it is not this year.
  static String _fmtShort(String? d) {
    if (d == null) return '';
    try {
      final dt = DateTime.parse(d);
      final y = dt.year == DateTime.now().year ? '' : ' ${dt.year}';
      return '${dt.day} ${_mon[dt.month - 1]}$y';
    } catch (_) {
      return d;
    }
  }

  Widget _stat(String value, String label, {Color c = Bl.ink}) => Expanded(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(value,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: Bl.tight(15, w: FontWeight.w700, c: c)),
            const SizedBox(height: 1),
            Text(label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: Bl.inter(11.5,
                    w: FontWeight.w500, c: const Color(0xFF7A8088))),
          ],
        ),
      );

  @override
  Widget build(BuildContext context) {
    final tenantAsync = ref.watch(tenantContextProvider);
    final ctx = tenantAsync.valueOrNull;
    final allowed = ctx != null && planMeetsRequirement('purchases', ctx.plan);

    return Scaffold(
      backgroundColor: Bl.white,
      body: SafeArea(
        child: Column(
          children: [
            BlBackHeader(
              title: 'Purchases',
              trailing: allowed
                  ? BlRoundButton(BlIcons.plus,
                      label: 'Add purchase',
                      onTap: () => _showAddSheet(ctx.tenantId))
                  : null,
            ),
            Expanded(
              child: tenantAsync.when(
                loading: () => const Center(
                    child: CircularProgressIndicator(
                        color: Bl.amber, strokeWidth: 2)),
                error: (e, _) => Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Text(
                        'Could not load. Check your internet and try again.',
                        textAlign: TextAlign.center,
                        style: Bl.inter(13.5, c: Bl.redDeep, h: 1.5)),
                  ),
                ),
                data: (ctx) {
                  if (ctx == null) {
                    return Center(
                        child: Text('No shop found for this sign-in.',
                            style: Bl.inter(13.5, c: Bl.mute)));
                  }
                  if (!planMeetsRequirement('purchases', ctx.plan)) {
                    return const _UpgradeBanner(feature: 'Purchases');
                  }
                  return _list(ctx.tenantId);
                },
              ),
            ),
            if (allowed)
              Padding(
                padding: const EdgeInsets.fromLTRB(14, 8, 14, 14),
                child: BlButton(
                  'Add purchase',
                  leading:
                      const BlIcon(BlIcons.plus, size: 16, color: Bl.white),
                  onTap: () => _showAddSheet(ctx.tenantId),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _list(String tenantId) {
    final purchasesAsync = ref.watch(purchasesProvider(tenantId));
    // What is owed comes from the same sum the Suppliers screen uses, so the
    // two always agree; the bills on this screen are the fallback.
    final derived = ref.watch(supplierOutstandingProvider).valueOrNull;

    return purchasesAsync.when(
      loading: () => const Center(
          child: CircularProgressIndicator(color: Bl.amber, strokeWidth: 2)),
      error: (e, _) => Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text(
              'Could not load purchases. Check your internet and try again.',
              textAlign: TextAlign.center,
              style: Bl.inter(13.5, c: Bl.redDeep, h: 1.5)),
        ),
      ),
      data: (all) {
        final now = DateTime.now();
        final monthStart = DateTime(now.year, now.month, 1);
        final live =
            all.where((p) => p.resolvedStatus != 'CANCELLED').toList();
        final owed = derived != null
            ? derived.values.fold<double>(0, (s, v) => s + (v > 0 ? v : 0))
            : live.fold<double>(0, (s, p) => s + p.due);
        final unpaid = live.where((p) => p.due > 0.5).length;
        final awaiting = live
            .where((p) =>
                p.resolvedStatus == 'ORDERED' || p.resolvedStatus == 'PENDING')
            .length;
        final monthlySpend = live.where((p) {
          try {
            return !DateTime.parse(p.date ?? '').isBefore(monthStart);
          } catch (_) {
            return false;
          }
        }).fold<double>(0, (s, p) => s + p.totalAmount);

        final filtered = all.where((p) {
          final pay = (p.paymentType ?? 'CASH').toUpperCase();
          if (_filterIndex == 1) return pay == 'CASH';
          if (_filterIndex == 2) return pay == 'CREDIT' || pay == 'UDHAAR';
          return true;
        }).toList();

        final head = <Widget>[
          Padding(
            padding: const EdgeInsets.fromLTRB(18, 8, 18, 0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('You owe suppliers',
                    style: Bl.inter(13, w: FontWeight.w500)),
                const SizedBox(height: 6),
                Text(_compact(owed),
                    style: Bl.tight(36,
                        w: FontWeight.w700, ls: -0.04, h: 1.05)),
                const SizedBox(height: 14),
                Row(
                  children: [
                    _stat('$unpaid', 'Unpaid orders',
                        c: unpaid > 0 ? Bl.amberDeep : Bl.ink),
                    const SizedBox(width: 10),
                    _stat('$awaiting', 'Awaiting delivery'),
                    const SizedBox(width: 10),
                    _stat(compactRupees(monthlySpend), 'Spent this month'),
                  ],
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
            child: BlSegmented(
              labels: const ['All orders', 'Cash', 'Credit'],
              index: _filterIndex,
              onChanged: (i) => setState(() => _filterIndex = i),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(18, 16, 18, 4),
            child: Text('PURCHASE ORDERS', style: Bl.eyebrow),
          ),
        ];

        return ListView.builder(
          padding: const EdgeInsets.only(bottom: 16),
          itemCount: head.length + (filtered.isEmpty ? 1 : filtered.length),
          itemBuilder: (context, i) {
            if (i < head.length) return head[i];
            if (filtered.isEmpty) {
              return const BlEmpty(
                  icon: BlIcons.cart, title: 'No orders found');
            }
            final p = filtered[i - head.length];
            return BlTap(
              onTap: () => Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) =>
                      PurchaseDetailScreen(purchase: p),
                ),
              ).then((_) {
                ref.invalidate(purchasesProvider(tenantId));
                ref.invalidate(supplierOutstandingProvider);
              }),
              child: _PurchaseCard(purchase: p, fmtDate: _fmtShort),
            );
          },
        );
      },
    );
  }
}

class _PurchaseCard extends StatelessWidget {
  final Purchase purchase;
  final String Function(String?) fmtDate;
  const _PurchaseCard({required this.purchase, required this.fmtDate});

  @override
  Widget build(BuildContext context) {
    final status = purchase.resolvedStatus;
    final cancelled = status == 'CANCELLED';
    final name = purchase.supplierName ?? 'Unknown Supplier';
    final pill = switch (status) {
      'RECEIVED' => const BlStatusPill.green('Received'),
      'ORDERED' => const BlStatusPill.yellow('Ordered'),
      'CANCELLED' => const BlStatusPill.red('Cancelled'),
      _ => const BlStatusPill.grey('Pending'),
    };
    final meta = [
      purchase.poNumber,
      fmtDate(purchase.date),
      if (purchase.deliveryDate != null) 'Est. ${fmtDate(purchase.deliveryDate)}',
    ].where((e) => e.isNotEmpty).join(' · ');

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 11),
      decoration: const BoxDecoration(
          border: Border(bottom: BorderSide(color: Bl.sep))),
      child: Row(
        children: [
          BlTintAvatar(name),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Bl.tight(14.5, w: FontWeight.w600)),
                const SizedBox(height: 1),
                Text(meta,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Bl.inter(12, c: const Color(0xFF7A8088))),
              ],
            ),
          ),
          const SizedBox(width: 10),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                Money.inr(purchase.totalAmount),
                style: Bl.tight(14.5,
                        w: FontWeight.w600,
                        c: cancelled ? const Color(0xFF9AA0A6) : Bl.ink)
                    .copyWith(
                        decoration:
                            cancelled ? TextDecoration.lineThrough : null,
                        decorationColor: const Color(0xFF9AA0A6)),
              ),
              const SizedBox(height: 3),
              pill,
            ],
          ),
        ],
      ),
    );
  }
}


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
  // "Change it" on the price check puts the cursor back here.
  final totalFocus    = FocusNode();

  void dispose() {
    qtyCtrl.dispose();
    unitPriceCtrl.dispose();
    totalCtrl.dispose();
    totalFocus.dispose();
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
  final _billNoCtrl = TextEditingController(); // supplier bill no — GSTR-2B match
  // Money down on a credit bill. The web form has had this since the start
  // ('Paid now'); the phone could only record a bill as wholly cash or wholly
  // credit, so a part payment at the supplier's door had nowhere to go.
  final _paidNowCtrl = TextEditingController();

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
  static const _consentStore = FlutterSecureStorage();
  // Per shop: a different shop signed in on the same phone is asked afresh.
  String get _consentKey => 'bill_scan_google_consent_v1_${widget.tenantId}';

  /// The photo goes to Google's free Gemini service, whose terms let Google
  /// use it and let human reviewers read it. A bill shows the supplier's
  /// name, GSTIN and address, so ask once before the first scan.
  Future<bool> _billScanConsent() async {
    try {
      if (await _consentStore.read(key: _consentKey) == 'yes') return true;
    } catch (_) {/* unreadable store: ask again */}
    if (!mounted) return false;
    final ok = await showBlDialog<bool>(
      context: context,
      title: 'Before you scan a bill',
      message: 'The photo is sent to Google\'s Gemini service, which reads it and '
          'fills in the bill for you.\n\n'
          'We use Google\'s free service. Google may use the photo to improve '
          'its products, and Google\'s human reviewers may read it. The photo '
          'shows what is printed on the bill, such as the supplier\'s name, '
          'GSTIN and address.\n\n'
          'If you prefer not to share bills, enter the bill by hand.',
      actions: (ctx) => [
        Row(
          children: [
            Expanded(
              child: BlButton('Enter by hand',
                  kind: BlButtonKind.soft,
                  fontSize: 14,
                  onTap: () => Navigator.of(ctx).pop(false)),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: BlButton('Send to Google',
                  fontSize: 14, onTap: () => Navigator.of(ctx).pop(true)),
            ),
          ],
        ),
      ],
    );
    if (ok != true) return false;
    try {
      await _consentStore.write(key: _consentKey, value: 'yes');
    } catch (_) {/* not saved: the notice shows again next time */}
    return true;
  }

  Future<void> _scanBill() async {
    if (!await _billScanConsent() || !mounted) return;
    final picker = ImagePicker();
    final XFile? shot = await showBlSheet<XFile?>(
      context: context,
      builder: (sheetCtx) {
        Widget row(String icon, String label, ImageSource source) => BlTap(
              label: label,
              onTap: () async {
                final nav = Navigator.of(sheetCtx);
                final img = await picker.pickImage(
                    source: source, imageQuality: 70, maxWidth: 1600);
                nav.pop(img);
              },
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 8),
                child: Row(
                  children: [
                    BlIconTile(icon,
                        size: 40, radius: 12, iconSize: 18, bg: Bl.amberSoft, fg: Bl.amberDeep),
                    const SizedBox(width: 12),
                    Expanded(
                        child: Text(label,
                            style: Bl.tight(14.5, w: FontWeight.w600))),
                    const BlIcon(BlIcons.chevronRight,
                        size: 16, color: Color(0xFFC4C8CC)),
                  ],
                ),
              ),
            );
        return Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const BlSheetTitle('Scan a bill', size: 16, divider: true),
            const SizedBox(height: 4),
            row(_camIcon, 'Take photo', ImageSource.camera),
            row('<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="1.6"/><path d="M21 16l-5-5-8 8"/>',
                'Choose from gallery', ImageSource.gallery),
          ],
        );
      },
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
      // Log the real reason; show a sentence the person can act on.
      debugPrint('[scanBill] failed: $e');
      final signedOut = e is FunctionException && e.status == 401;
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(signedOut
              ? 'Please sign in again, then scan the bill.'
              : 'Couldn\'t read the bill. Try again, or enter it by hand.'),
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
    _billNoCtrl.dispose();
    _paidNowCtrl.dispose();
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

  // ── Price check: lines far from what the item last cost ─────────────────────
  // A line against the wrong product looks like a normal line, so a price more
  // than PriceCheck.pricePct away from the last purchase is asked about once
  // before saving. Same rule and wording as the web form. It never blocks.

  /// The purchase rows for these products, newest wins in PriceCheck. Online
  /// first, like the rest of this sheet; offline, the phone's cached copy
  /// (which carries no status, so a cancelled purchase can count there).
  Future<List<Map<String, dynamic>>> _purchaseHistory(Set<String> productIds) async {
    try {
      final rows = await supabase
          .from('purchases')
          .select('id, linked_product_id, quantity, total_amount, date, created_at, status')
          .eq('tenant_id', widget.tenantId)
          .isFilter('deleted_at', null)
          .inFilter('linked_product_id', productIds.toList())
          .timeout(const Duration(seconds: 6));
      return (rows as List).map((e) => Map<String, dynamic>.from(e as Map)).toList();
    } catch (e) {
      debugPrint('[purchases] price history online read failed, using local: $e');
    }
    try {
      final db = ref.read(databaseProvider);
      final local = await db.select(db.purchases).get();
      return [
        for (final p in local)
          if (p.tenantId == widget.tenantId && productIds.contains(p.productId))
            {
              'id': p.id,
              'linked_product_id': p.productId,
              'quantity': p.quantity,
              'total_amount': p.totalAmount,
              'date': p.date,
              'created_at': p.createdAt?.toIso8601String(),
            },
      ];
    } catch (e) {
      debugPrint('[purchases] price history local read failed: $e');
      return const [];
    }
  }

  /// True to go on saving; false when the user chose "Change it".
  Future<bool> _pricesConfirmed(List<_PurchaseLine> lines) async {
    final ids = {for (final l in lines) if (l.productId != null) l.productId!};
    if (ids.isEmpty) return true;
    final history = await _purchaseHistory(ids);
    final flagged = PriceCheck.check([
      for (var i = 0; i < lines.length; i++)
        PriceCheckLine(
          index: i,
          productId: lines[i].productId,
          name: _products.firstWhere((p) => p['id'] == lines[i].productId,
                  orElse: () => const {'name': 'This item'})['name']?.toString() ?? 'This item',
          quantity: lines[i].qtyVal,
          total: lines[i].totalVal,
        ),
    ], history);
    if (flagged.isEmpty || !mounted) return true;

    final ok = await showPriceCheckDialog(context, flagged);
    if (ok) return true;
    if (mounted) lines[flagged.first.index].totalFocus.requestFocus();
    return false;
  }

  Future<void> _save() async {
    final validLines = _lines.where((l) => l.isValid).toList();
    if (_supplierId == null || validLines.isEmpty || _saving) return;

    setState(() => _saving = true);
    if (!await _pricesConfirmed(validLines)) {
      if (mounted) setState(() => _saving = false);
      return;
    }
    if (!mounted) return;
    try {
      final currentUserId = supabase.auth.currentUser?.id;
      final dateStr = '${_date.year}-${_date.month.toString().padLeft(2,'0')}-${_date.day.toString().padLeft(2,'0')}';
      final notes = _notesCtrl.text.trim();

      // One RPC call per line. Offline-first: rpcOnlineOrQueue tries the
      // network and falls back to the local queue on transient failure.
      final svc = ref.read(syncServiceProvider);
      int queuedCount = 0;

      // Money down on a credit bill, spread across the lines oldest-first --
      // the same allocation the web form uses, so a bill entered on either
      // surface settles identically. Only for CREDIT: a cash or bank bill is
      // already paid in full at entry.
      final paidNow = _paymentType == 'CREDIT'
          ? (double.tryParse(_paidNowCtrl.text.trim()) ?? 0).clamp(0, _grandTotal)
          : 0.0;
      double paidLeft = paidNow.toDouble();

      for (int i = 0; i < validLines.length; i++) {
        final line = validLines[i];
        // 16 random hex digits, like SAL-: a clock-based id can clash across
        // phones and shops, and a clash on replay is read as "already landed".
        final id = newPurchaseId();
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
          'p_bill_no':      _billNoCtrl.text.trim().isEmpty ? null : _billNoCtrl.text.trim(),
        };

        if (paidNow > 0) {
          final linePaid = paidLeft < line.totalVal ? paidLeft : line.totalVal;
          // Round to paise as it goes, so the last line cannot inherit a
          // floating-point remainder and overpay the bill by a fraction.
          params['p_paid_amount'] = (linePaid * 100).round() / 100;
          paidLeft = ((paidLeft - linePaid) * 100).round() / 100;
        }
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
        // Show the real reason — a server rejection is not an internet problem,
        // and blaming the connection hides genuine DB errors.
        debugPrint('[purchases] save failed: $e');
        final msg = e is PostgrestException
            ? 'Could not save: ${e.message}'
            : 'Could not save. Check your internet and try again.';
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(msg),
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

  static const _camIcon =
      '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.2"/>';

  int _step = 0;

  void _toast(String msg) => ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(msg), behavior: SnackBarBehavior.floating));

  void _next() {
    if (_step == 0 && _supplierId == null) {
      _toast('Choose the supplier first.');
      return;
    }
    if (_step == 1 && !_lines.any((l) => l.isValid)) {
      _toast('Add at least one product with a quantity and a total.');
      return;
    }
    if (_step < 2) {
      FocusScope.of(context).unfocus();
      setState(() => _step++);
    } else {
      _save();
    }
  }

  void _back() {
    if (_step == 0) {
      Navigator.maybePop(context);
    } else {
      setState(() => _step--);
    }
  }

  String get _supplierName {
    for (final s in _suppliers) {
      if (s['id'] == _supplierId) return (s['name'] as String?) ?? '';
    }
    return '';
  }

  Future<void> _pickSupplier() async {
    final id = await showBlSheet<String>(
      context: context,
      builder: (ctx) => Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const BlSheetTitle('Supplier', size: 16, divider: true),
          if (_suppliers.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 24),
              child: Text(
                  'No suppliers yet. Add one under Clients & Suppliers first.',
                  textAlign: TextAlign.center,
                  style: Bl.inter(13, c: Bl.mute, h: 1.5)),
            ),
          for (final sup in _suppliers)
            Semantics(
              button: true,
              selected: sup['id'] == _supplierId,
              child: BlTap(
                onTap: () => Navigator.pop(ctx, sup['id'] as String),
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 9),
                  child: Row(
                    children: [
                      BlTintAvatar((sup['name'] as String?) ?? '', size: 38),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Text((sup['name'] as String?) ?? '',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: Bl.tight(14.5, w: FontWeight.w600)),
                      ),
                      if (sup['id'] == _supplierId)
                        const BlIcon(BlIcons.check,
                            size: 16, color: Bl.amber, stroke: 2.6),
                    ],
                  ),
                ),
              ),
            ),
        ],
      ),
    );
    if (id != null && mounted) setState(() => _supplierId = id);
  }

  List<Widget> _supplierStep() => [
        // Scan a bill to fill the rest.
        Padding(
          padding: const EdgeInsets.only(top: 10),
          child: Semantics(
            button: true,
            label: 'Scan bill with camera',
            excludeSemantics: true,
            child: BlTap(
              onTap: _scanning ? null : _scanBill,
              child: CustomPaint(
                foregroundPainter: const _DashedBorder(
                    color: Bl.brand, radius: 16, width: 1.5),
                child: Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                  decoration: BoxDecoration(
                      color: const Color(0xFFFFF8EC),
                      borderRadius: BorderRadius.circular(16)),
                  child: Row(
                    children: [
                      Container(
                        width: 42,
                        height: 42,
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                            color: Bl.brand,
                            borderRadius: BorderRadius.circular(12)),
                        child: _scanning
                            ? const SizedBox(
                                width: 18,
                                height: 18,
                                child: CircularProgressIndicator(
                                    strokeWidth: 2, color: Bl.white))
                            : const BlIcon(_camIcon, size: 20, color: Bl.white),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                                _scanning
                                    ? 'Reading bill…'
                                    : 'Scan bill with camera',
                                style: Bl.tight(14.5, w: FontWeight.w600)),
                            const SizedBox(height: 2),
                            Text(
                                "Fills supplier and items for you. The photo is read by Google's free Gemini service.",
                                style: Bl.inter(12,
                                    c: const Color(0xFF7A6A4E), h: 1.35)),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
        Padding(
          padding: const EdgeInsets.only(top: 14),
          child: Row(
            children: [
              const Expanded(
                  child: ColoredBox(
                      color: Color(0xFFE9E8E6), child: SizedBox(height: 1))),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 10),
                child: Text('or fill it in',
                    style: Bl.inter(12, w: FontWeight.w500, c: Bl.mute)),
              ),
              const Expanded(
                  child: ColoredBox(
                      color: Color(0xFFE9E8E6), child: SizedBox(height: 1))),
            ],
          ),
        ),
        BlField(
          label: 'Supplier',
          hint: 'Select a supplier',
          value: _supplierId == null ? null : _supplierName,
          onTap: _pickSupplier,
        ),
        BlField(
          label: 'Date',
          value: _fmt(_date),
          onTap: _pickDate,
          trailing: const Padding(
            padding: EdgeInsets.only(right: 6),
            child: BlIcon(
                '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>',
                size: 16,
                color: Color(0xFF7A8088)),
          ),
        ),
        BlField(
          label: 'Supplier bill no (optional)',
          hint: "Supplier's invoice no. (for GSTR-2B)",
          controller: _billNoCtrl,
        ),
      ];

  List<Widget> _itemsStep() {
    final n = _lines.where((l) => l.isValid).length;
    return [
      for (final entry in _lines.asMap().entries)
        Padding(
          padding: const EdgeInsets.only(top: 12),
          child: _LineItemCard(
            index: entry.key,
            line: entry.value,
            products: _products,
            canRemove: _lines.length > 1,
            onProductChange: (id) => _selectProductForLine(entry.value, id),
            onCreateFromScan: () => _createFromScan(entry.value),
            onExpiryChange: (d) => setState(() => entry.value.expiryDate = d),
            onQtyChange: (v) => _onQtyChanged(entry.value, v),
            onUnitPriceChange: (v) => _onUnitPriceChanged(entry.value, v),
            onTotalChange: (v) => _onTotalChanged(entry.value, v),
            onRemove: () => setState(() {
              entry.value.dispose();
              _lines.removeAt(entry.key);
            }),
          ),
        ),
      Padding(
        padding: const EdgeInsets.only(top: 12),
        child: BlTap(
          label: 'Add another product',
          onTap: () => setState(() => _lines.add(_PurchaseLine())),
          child: CustomPaint(
            foregroundPainter: const _DashedBorder(
                color: Color(0xFFCFCFCF), radius: 14, width: 1.5),
            child: SizedBox(
              height: 48,
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const BlIcon(BlIcons.plus, size: 16, color: Bl.ink3),
                  const SizedBox(width: 8),
                  Text('Add another product',
                      style: Bl.tight(14, w: FontWeight.w600, c: Bl.ink3)),
                ],
              ),
            ),
          ),
        ),
      ),
      Container(
        margin: const EdgeInsets.only(top: 18),
        padding: const EdgeInsets.only(top: 14),
        decoration: const BoxDecoration(
            border: Border(top: BorderSide(color: Color(0xFFE9E8E6)))),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.baseline,
          textBaseline: TextBaseline.alphabetic,
          children: [
            Expanded(
              child: Text('$n ${n == 1 ? 'item' : 'items'} so far',
                  style: Bl.inter(13.5, w: FontWeight.w500)),
            ),
            Text(Money.inr(_grandTotal),
                style: Bl.tight(22, w: FontWeight.w700, ls: -0.03)),
          ],
        ),
      ),
    ];
  }

  Widget _payOption(String key, String icon, String title, String sub,
      {bool last = false}) {
    final on = _paymentType == key;
    final credit = key == 'CREDIT';
    final paidNow = double.tryParse(_paidNowCtrl.text.trim()) ?? 0;
    final pending = (_grandTotal - paidNow).clamp(0, double.infinity);
    return Semantics(
      button: true,
      selected: on,
      label: '$title. $sub',
      excludeSemantics: true,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: () => setState(() => _paymentType = key),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
          decoration: BoxDecoration(
            color: on ? const Color(0xFFFFF8EC) : null,
            border: last
                ? null
                : const Border(bottom: BorderSide(color: Bl.sep)),
          ),
          child: Row(
            children: [
              BlIconTile(icon,
                  size: 36,
                  radius: 10,
                  iconSize: 18,
                  bg: on ? Bl.brand : Bl.wellSoft,
                  fg: on ? Bl.white : Bl.ink3),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: Bl.tight(14.5, w: FontWeight.w600)),
                    const SizedBox(height: 1),
                    Text(sub, style: Bl.inter(12, c: const Color(0xFF7A8088))),
                  ],
                ),
              ),
              if (on && credit && pending > 0)
                Padding(
                  padding: const EdgeInsets.only(right: 10),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text(Money.inr(pending.toDouble()),
                          style: Bl.tight(14.5,
                              w: FontWeight.w700, c: const Color(0xFFB86A0A))),
                      Text('pending',
                          style: Bl.inter(11,
                              w: FontWeight.w500, c: const Color(0xFFB86A0A))),
                    ],
                  ),
                ),
              Container(
                width: 22,
                height: 22,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: on ? Bl.brand : null,
                  shape: BoxShape.circle,
                  border: on
                      ? null
                      : Border.all(width: 1.5, color: const Color(0xFFCFCFCF)),
                ),
                child: on
                    ? const BlIcon(BlIcons.check,
                        size: 13, color: Bl.white, stroke: 3)
                    : null,
              ),
            ],
          ),
        ),
      ),
    );
  }

  List<Widget> _paymentStep() {
    final n = _lines.where((l) => l.isValid).length;
    final credit = _paymentType == 'CREDIT';
    final total = _grandTotal;
    final paidNow = credit
        ? (double.tryParse(_paidNowCtrl.text.trim()) ?? 0).clamp(0, total)
        : total;
    final pending = (total - paidNow).clamp(0, double.infinity);

    Widget line(String k, String v, {Color? c, bool strong = false}) => Row(
          children: [
            Expanded(
              child: Text(k,
                  style: Bl.inter(13,
                      w: strong ? FontWeight.w600 : FontWeight.w500,
                      c: c ?? Bl.body)),
            ),
            Text(v,
                style: Bl.inter(13, w: FontWeight.w600, c: c ?? Bl.ink)),
          ],
        );

    return [
      Container(
        margin: const EdgeInsets.only(top: 12),
        clipBehavior: Clip.antiAlias,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: const Color(0xFFE6E5E3)),
        ),
        child: Column(
          children: [
            _payOption('CASH', BlIcons.cash, 'Cash', 'Paid from the cash drawer'),
            _payOption('CREDIT',
                '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
                'Credit', 'Pay the supplier later'),
            _payOption('BANK', BlIcons.bank, 'Bank', 'UPI, transfer or cheque',
                last: true),
          ],
        ),
      ),
      if (credit)
        BlField(
          label: 'Paid now (optional)',
          hint: 'Leave blank if nothing paid yet',
          prefix: '₹',
          controller: _paidNowCtrl,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          onChanged: (_) => setState(() {}),
        ),
      BlField(
        label: 'Notes (optional)',
        hint: 'Remarks',
        controller: _notesCtrl,
        capitalization: TextCapitalization.sentences,
      ),
      Container(
        margin: const EdgeInsets.only(top: 18),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: const Color(0xFFECEBE9)),
        ),
        child: Column(
          children: [
            line(_supplierName, '$n ${n == 1 ? 'item' : 'items'}'),
            const SizedBox(height: 8),
            Row(
              crossAxisAlignment: CrossAxisAlignment.baseline,
              textBaseline: TextBaseline.alphabetic,
              children: [
                Expanded(
                    child: Text('Grand total',
                        style: Bl.tight(14, w: FontWeight.w600))),
                Text(Money.inr(total),
                    style: Bl.tight(24, w: FontWeight.w700, ls: -0.03)),
              ],
            ),
            const SizedBox(height: 10),
            const Divider(height: 1, thickness: 1, color: Bl.sep),
            const SizedBox(height: 10),
            line('Paid now', Money.inr(paidNow.toDouble())),
            if (pending > 0) ...[
              const SizedBox(height: 6),
              line('Pending to supplier', Money.inr(pending.toDouble()),
                  c: const Color(0xFFB86A0A), strong: true),
            ],
          ],
        ),
      ),
    ];
  }

  @override
  Widget build(BuildContext context) {
    final itemCount = _lines.where((l) => l.isValid).length;
    if (_loadingData) {
      return const Scaffold(
        backgroundColor: Bl.white,
        body: Center(
            child: CircularProgressIndicator(color: Bl.amber, strokeWidth: 2)),
      );
    }
    return PopScope(
      canPop: _step == 0,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _back();
      },
      child: BlStepFrame(
        title: 'Add Purchase',
        step: _step,
        stepNames: const ['Supplier', 'Items', 'Payment'],
        question: const [
          'Who did you buy from?',
          'What did you buy?',
          'How did you pay?',
        ][_step],
        onBack: _back,
        loading: _saving,
        onNext: _saving ? null : _next,
        buttonLabel: switch (_step) {
          0 => 'Next: items',
          1 => 'Next: payment',
          _ => 'Save $itemCount item purchase',
        },
        children: switch (_step) {
          0 => _supplierStep(),
          1 => _itemsStep(),
          _ => _paymentStep(),
        },
      ),
    );
  }
}

/// Dashed rounded outline (the "scan a bill" and "add another" boxes).
class _DashedBorder extends CustomPainter {
  final Color color;
  final double radius;
  final double width;
  const _DashedBorder(
      {required this.color, required this.radius, required this.width});

  @override
  void paint(Canvas canvas, Size size) {
    final rr = RRect.fromRectAndRadius(
        (Offset.zero & size).deflate(width / 2), Radius.circular(radius));
    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = width;
    for (final m in (Path()..addRRect(rr)).computeMetrics()) {
      var d = 0.0;
      while (d < m.length) {
        canvas.drawPath(m.extractPath(d, d + 5), paint);
        d += 9;
      }
    }
  }

  @override
  bool shouldRepaint(_DashedBorder old) =>
      old.color != color || old.radius != radius || old.width != width;
}

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
    showBlSheet(
      context: context,
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

  Widget _box(String label, TextEditingController ctrl,
          ValueChanged<String> onChanged,
          {int flex = 10, FocusNode? focusNode, String? prefix}) =>
      Expanded(
        flex: flex,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          decoration: BoxDecoration(
            color: Bl.white,
            borderRadius: BorderRadius.circular(11),
            border: Border.all(color: const Color(0xFFE6E5E3)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label,
                  style: Bl.inter(11,
                      w: FontWeight.w500, c: const Color(0xFF7A8088))),
              Row(
                children: [
                  if (prefix != null)
                    Text(prefix, style: Bl.tight(14.5, w: FontWeight.w600)),
                  Expanded(
                    child: TextField(
                      controller: ctrl,
                      focusNode: focusNode,
                      onChanged: onChanged,
                      keyboardType: const TextInputType.numberWithOptions(
                          decimal: true),
                      cursorColor: Bl.brand,
                      style: Bl.tight(14.5, w: FontWeight.w600),
                      decoration: InputDecoration(
                        isDense: true,
                        filled: false,
                        contentPadding: EdgeInsets.zero,
                        border: InputBorder.none,
                        enabledBorder: InputBorder.none,
                        focusedBorder: InputBorder.none,
                        hintText: '0',
                        hintStyle: Bl.tight(14.5,
                            w: FontWeight.w500, c: Bl.faint),
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      );

  static const _mon = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  Future<void> _pickExpiry(BuildContext context) async {
    final picked = await showDatePicker(
      context: context,
      initialDate:
          line.expiryDate ?? DateTime.now().add(const Duration(days: 180)),
      firstDate: DateTime.now().subtract(const Duration(days: 1)),
      lastDate: DateTime.now().add(const Duration(days: 365 * 10)),
    );
    if (picked != null) onExpiryChange?.call(picked);
  }

  @override
  Widget build(BuildContext context) {
    final selectedProduct = line.productId == null
        ? null
        : products.firstWhere((p) => p['id'] == line.productId,
            orElse: () => <String, dynamic>{});
    final hasProduct = selectedProduct != null && selectedProduct.isNotEmpty;
    final lastCost = selectedProduct?['costPrice'] == null
        ? null
        : double.tryParse(selectedProduct!['costPrice'].toString());
    final unit = line.unitCost;
    final exp = line.expiryDate;

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
          color: Bl.wellSoft, borderRadius: BorderRadius.circular(16)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Semantics(
                      button: true,
                      label: hasProduct
                          ? 'Product ${selectedProduct['name']}. Change'
                          : 'Select product',
                      excludeSemantics: true,
                      child: BlTap(
                        onTap: () => _openProductSearch(context),
                        child: Padding(
                          padding: const EdgeInsets.symmetric(vertical: 4),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Flexible(
                                child: Text(
                                    hasProduct
                                        ? '${selectedProduct['name']}'
                                        : 'Select product',
                                    maxLines: 2,
                                    overflow: TextOverflow.ellipsis,
                                    style: Bl.tight(14.5,
                                        w: FontWeight.w600,
                                        c: hasProduct
                                            ? Bl.ink
                                            : Bl.amberDeep)),
                              ),
                              const SizedBox(width: 4),
                              BlIcon(BlIcons.chevronDown,
                                  size: 14,
                                  color:
                                      hasProduct ? Bl.mute : Bl.amberDeep),
                            ],
                          ),
                        ),
                      ),
                    ),
                    if (line.scannedName != null && line.productId == null)
                      Text('On bill: ${line.scannedName}',
                          style: Bl.inter(12, c: const Color(0xFF7A8088))),
                    if (hasProduct)
                      Row(
                        children: [
                          Text('In stock: ${selectedProduct['stock'] ?? 0} · ',
                              style: Bl.inter(12,
                                  c: const Color(0xFF7A8088))),
                          BlTap(
                            label: exp == null
                                ? 'Add expiry date'
                                : 'Change expiry date',
                            onTap: () => _pickExpiry(context),
                            child: Padding(
                              padding:
                                  const EdgeInsets.symmetric(vertical: 4),
                              child: Text(
                                  exp == null
                                      ? 'Add expiry date'
                                      : 'Expiry: ${exp.day} ${_mon[exp.month - 1]} ${exp.year}',
                                  style: Bl.inter(12,
                                      w: FontWeight.w500,
                                      c: exp == null
                                          ? Bl.amberDeep
                                          : const Color(0xFF7A8088))),
                            ),
                          ),
                          if (exp != null)
                            BlTap(
                              label: 'Remove expiry date',
                              onTap: () => onExpiryChange?.call(null),
                              child: const Padding(
                                padding: EdgeInsets.all(6),
                                child: BlIcon(BlIcons.close,
                                    size: 12, color: Color(0xFFA0A5AC)),
                              ),
                            ),
                        ],
                      ),
                  ],
                ),
              ),
              if (canRemove)
                BlTap(
                  label: 'Remove this product',
                  onTap: onRemove,
                  child: const Padding(
                    padding: EdgeInsets.fromLTRB(12, 4, 0, 12),
                    child: BlIcon(BlIcons.close,
                        size: 16, color: Color(0xFFA0A5AC)),
                  ),
                ),
            ],
          ),
          if (line.productId == null &&
              (line.suggestions.isNotEmpty || line.scannedName != null))
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Wrap(
                spacing: 6,
                runSpacing: 6,
                children: [
                  for (final p in line.suggestions)
                    BlTap(
                      onTap: () => onProductChange(p['id'] as String?),
                      child: Container(
                        height: 32,
                        padding: const EdgeInsets.symmetric(horizontal: 12),
                        decoration: BoxDecoration(
                            color: Bl.white,
                            borderRadius: BorderRadius.circular(999)),
                        child: Row(mainAxisSize: MainAxisSize.min, children: [
                          Text('${p['name']}',
                              style: Bl.tight(12.5,
                                  w: FontWeight.w600, ls: 0)),
                        ]),
                      ),
                    ),
                  if (line.scannedName != null && onCreateFromScan != null)
                    BlTap(
                      onTap: onCreateFromScan,
                      child: Container(
                        height: 32,
                        padding: const EdgeInsets.symmetric(horizontal: 12),
                        decoration: BoxDecoration(
                            color: Bl.amber,
                            borderRadius: BorderRadius.circular(999)),
                        child: Row(mainAxisSize: MainAxisSize.min, children: [
                          Text('+ Create new',
                              style: Bl.tight(12.5,
                                  w: FontWeight.w600, ls: 0, c: Bl.white)),
                        ]),
                      ),
                    ),
                ],
              ),
            ),
          const SizedBox(height: 10),
          Row(
            children: [
              _box('Qty', line.qtyCtrl, onQtyChange),
              const SizedBox(width: 6),
              _box('Unit price', line.unitPriceCtrl, onUnitPriceChange,
                  prefix: '₹ '),
              const SizedBox(width: 6),
              _box('Total', line.totalCtrl, onTotalChange,
                  flex: 14, focusNode: line.totalFocus, prefix: '₹ '),
            ],
          ),
          if (unit != null && lastCost != null && lastCost > 0)
            Padding(
              padding: const EdgeInsets.only(top: 6, left: 2),
              child: Text(
                unit > lastCost
                    ? '▲ Higher than last ₹${lastCost.toStringAsFixed(2)}'
                    : '▼ Lower than last ₹${lastCost.toStringAsFixed(2)}',
                style: Bl.inter(11.5,
                    w: FontWeight.w600,
                    c: unit > lastCost ? Bl.amberDeep : Bl.green),
              ),
            ),
        ],
      ),
    );
  }
}

class _UpgradeBanner extends StatelessWidget {
  final String feature;
  const _UpgradeBanner({required this.feature});

  @override
  Widget build(BuildContext context) => Center(
        child: BlEmpty(
          icon: BlIcons.lock,
          title: 'Upgrade required',
          message: '$feature needs the PRO plan or above.',
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
        behavior: SnackBarBehavior.floating,
      ));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const BlSheetTitle('Select product', size: 16, divider: true),
        Container(
          height: 44,
          margin: const EdgeInsets.only(top: 12, bottom: 6),
          padding: const EdgeInsets.only(left: 14, right: 5),
          decoration: BoxDecoration(
              color: Bl.well, borderRadius: BorderRadius.circular(999)),
          child: Row(
            children: [
              const BlIcon(BlIcons.search, size: 20, color: Bl.mute),
              const SizedBox(width: 10),
              Expanded(
                child: TextField(
                  controller: _search,
                  cursorColor: Bl.brand,
                  style: Bl.inter(14, w: FontWeight.w500, c: Bl.ink),
                  decoration: InputDecoration(
                    isCollapsed: true,
                    filled: false,
                    border: InputBorder.none,
                    enabledBorder: InputBorder.none,
                    focusedBorder: InputBorder.none,
                    hintText: 'Search product or SKU',
                    hintStyle: Bl.inter(14, w: FontWeight.w500, c: Bl.mute),
                  ),
                ),
              ),
              BlTap(
                label: 'Scan barcode',
                onTap: _scanToPick,
                child: Container(
                  width: 34,
                  height: 34,
                  alignment: Alignment.center,
                  decoration: const BoxDecoration(
                      color: Bl.white, shape: BoxShape.circle),
                  child: const BlIcon(BlIcons.scan, size: 20),
                ),
              ),
            ],
          ),
        ),
        if (_filtered.isEmpty)
          const BlEmpty(icon: BlIcons.box, title: 'No products found.'),
        for (final p in _filtered)
          Semantics(
            button: true,
            selected: p['id'] == widget.selectedId,
            child: BlTap(
              onTap: () => widget.onSelected(p['id'] as String?),
              child: Container(
                padding: const EdgeInsets.symmetric(vertical: 9),
                decoration: const BoxDecoration(
                    border: Border(bottom: BorderSide(color: Bl.sep))),
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('${p['name']}',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: Bl.tight(14.5, w: FontWeight.w600)),
                          const SizedBox(height: 1),
                          Text(
                              [
                                'Stock ${p['stock'] ?? 0}',
                                if ('${p['sku'] ?? ''}'.isNotEmpty)
                                  '${p['sku']}',
                              ].join(' · '),
                              style: Bl.inter(12,
                                  c: const Color(0xFF7A8088))),
                        ],
                      ),
                    ),
                    if (p['id'] == widget.selectedId)
                      const BlIcon(BlIcons.check,
                          size: 16, color: Bl.amber, stroke: 2.6),
                  ],
                ),
              ),
            ),
          ),
      ],
    );
  }
}

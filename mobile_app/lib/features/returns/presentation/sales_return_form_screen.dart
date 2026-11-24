import 'package:flutter/material.dart';
import 'package:mobile_app/core/design/bl_widgets.dart';
import 'package:mobile_app/core/utils/units.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_app/core/utils/money.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:mobile_app/features/invoices/data/models/invoice.dart';
import 'package:mobile_app/features/invoices/presentation/invoices_screen.dart';
import 'package:mobile_app/features/returns/presentation/providers/returns_provider.dart';
import 'package:mobile_app/features/sales/presentation/providers/sales_provider.dart';

// ─── Item parse helper (mirrors _parseItems in invoice_detail_screen.dart) ────

class _ParsedItem {
  final String name;
  final num quantity;
  final double rate;
  /// Needed to decide whether a fractional return quantity is meaningful —
  /// 0.25 KG is, 0.25 carry bags is not.
  final String? unit;
  final Map<String, dynamic> raw;

  const _ParsedItem({
    required this.name,
    required this.quantity,
    required this.rate,
    this.unit,
    required this.raw,
  });
}

List<_ParsedItem> _parseItems(Invoice invoice) {
  final raw = invoice.items;
  if (raw == null || raw.isEmpty) return [];

  // We need total qty for proportional rate fallback.
  num totalAllQty = 0;
  for (final item in raw) {
    final m = item as Map<String, dynamic>? ?? {};
    totalAllQty += num.tryParse(
            (m['quantity'] ?? m['qty'])?.toString() ?? '1') ??
        1;
  }

  return raw.map((item) {
    final m = item as Map<String, dynamic>? ?? {};

    final name = m['name']?.toString() ??
        m['productName']?.toString() ??
        m['product_name']?.toString() ??
        'Item';

    final itemQty =
        num.tryParse((m['quantity'] ?? m['qty'])?.toString() ?? '1') ?? 1;

    final itemUnit = m['unit']?.toString();

    double rate = double.tryParse(
          (m['rate'] ??
                  m['price'] ??
                  m['unit_price'] ??
                  m['unitPrice'] ??
                  m['sellingPrice'])
              ?.toString() ??
              '0',
        ) ??
        0.0;

    // Proportional fallback when no rate is recorded.
    if (rate == 0 && invoice.grandTotal > 0 && totalAllQty > 0) {
      rate = invoice.grandTotal * (itemQty / totalAllQty) / itemQty;
    }

    return _ParsedItem(
      name: name,
      unit: itemUnit,
      quantity: itemQty,
      rate: rate,
      raw: m,
    );
  }).toList();
}

// ─── Screen ───────────────────────────────────────────────────────────────────

class SalesReturnFormScreen extends ConsumerStatefulWidget {
  final Invoice invoice;

  const SalesReturnFormScreen({super.key, required this.invoice});

  @override
  ConsumerState<SalesReturnFormScreen> createState() =>
      _SalesReturnFormScreenState();
}

class _SalesReturnFormScreenState
    extends ConsumerState<SalesReturnFormScreen> {
  // index → return quantity chosen by user
  final Map<int, double> _returnQtys = {};

  // Selected return date (defaults to today)
  late String _date;

  final TextEditingController _reason = TextEditingController();
  bool _isLoading = false;

  // Parsed items cached once on build
  late final List<_ParsedItem> _parsedItems;

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    _date =
        '${now.year}-${now.month.toString().padLeft(2, '0')}-${now.day.toString().padLeft(2, '0')}';
    _parsedItems = _parseItems(widget.invoice);
  }

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  // ── Computed return total ──────────────────────────────────────────────────

  double get _returnTotal {
    double total = 0;
    for (int i = 0; i < _parsedItems.length; i++) {
      final qty = _returnQtys[i] ?? 0;
      total += _parsedItems[i].rate * qty;
    }
    return total;
  }

  // ── Date picker ───────────────────────────────────────────────────────────

  Future<void> _pickDate() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: DateTime.tryParse(_date) ?? now,
      firstDate: DateTime(now.year - 2),
      lastDate: now,
      builder: (ctx, child) => Theme(
        data: Theme.of(ctx).copyWith(
          colorScheme: ColorScheme.light(
            primary: AppColors.primary,
            onPrimary: AppColors.onPrimary,
            surface: AppColors.surface,
          ),
        ),
        child: child!,
      ),
    );
    if (picked != null && mounted) {
      setState(() {
        _date =
            '${picked.year}-${picked.month.toString().padLeft(2, '0')}-${picked.day.toString().padLeft(2, '0')}';
      });
    }
  }

  // ── Submit ─────────────────────────────────────────────────────────────────

  Future<void> _submit() async {
    final ctx = ref.read(tenantContextProvider).valueOrNull;
    if (ctx == null) return;

    setState(() => _isLoading = true);
    try {
      final items = <Map<String, dynamic>>[];
      for (int i = 0; i < _parsedItems.length; i++) {
        final qty = _returnQtys[i] ?? 0;
        if (qty <= 0) continue;
        final item = _parsedItems[i];
        items.add({
          'id': item.raw['id'] ?? item.raw['product_id'] ?? '',
          'name': item.raw['name'] ?? item.raw['product_name'] ?? '',
          'quantity': qty,
          'rate': item.rate,
        });
      }

      final repo = ref.read(returnsRepositoryProvider);
      await repo.processSalesReturn(
        tenantId: ctx.tenantId,
        saleId: widget.invoice.saleId,
        invoiceId:
            widget.invoice.isSaleSource ? null : widget.invoice.id,
        clientId: widget.invoice.clientId,
        clientName: widget.invoice.clientName,
        items: items,
        totalAmount: _returnTotal,
        reason: _reason.text.trim().isEmpty ? null : _reason.text.trim(),
        date: _date,
      );

      // Invalidate returns provider so list refreshes.
      ref.invalidate(salesReturnsProvider(ctx.tenantId));
      // Invalidate sales and invoices so parent lists stay current.
      try {
        ref.invalidate(recentSalesProvider);
      } catch (_) {}
      try {
        ref.invalidate(invoicesProvider);
      } catch (_) {}

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(
            'Return processed. Stock restored.'),
          behavior: SnackBarBehavior.floating,
        ));
        Navigator.pop(context);
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(
            'Return may not have gone through. Check Returns before trying again. ($e)'),
          backgroundColor: Bl.redDeep,
          behavior: SnackBarBehavior.floating,
          duration: const Duration(seconds: 8),
        ));
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  String _fmtDateDisplay(String iso) {
    try {
      final d = DateTime.parse(iso);
      const months = [
        'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
      ];
      return '${d.day} ${months[d.month - 1]} ${d.year}';
    } catch (_) {
      return iso;
    }
  }

  // ── Build ──────────────────────────────────────────────────────────────────

  void _setQty(int i, double v) {
    final max = _parsedItems[i].quantity.toDouble();
    setState(() => _returnQtys[i] = v.clamp(0, max).toDouble());
  }

  Widget _stepBtn(String icon, String label, bool primary, VoidCallback? onTap) =>
      BlTap(
        label: label,
        onTap: onTap,
        child: Container(
          width: 30,
          height: 30,
          alignment: Alignment.center,
          decoration: BoxDecoration(
              color: primary && onTap != null ? Bl.brand : Bl.white,
              shape: BoxShape.circle),
          child: BlIcon(icon,
              size: 14,
              stroke: 2.4,
              color: onTap == null
                  ? Bl.faint
                  : primary
                      ? Bl.white
                      : Bl.ink3),
        ),
      );

  Widget _field(String label, Widget child, {VoidCallback? onTap}) => Padding(
        padding: const EdgeInsets.fromLTRB(18, 12, 18, 0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label,
                style: Bl.tight(13, w: FontWeight.w600, ls: 0, c: Bl.ink3)),
            const SizedBox(height: 6),
            BlTap(
              onTap: onTap,
              child: Container(
                height: 50,
                padding: const EdgeInsets.symmetric(horizontal: 14),
                alignment: Alignment.centerLeft,
                decoration: BoxDecoration(
                    color: Bl.wellSoft,
                    borderRadius: BorderRadius.circular(14)),
                child: child,
              ),
            ),
          ],
        ),
      );

  @override
  Widget build(BuildContext context) {
    final inv = widget.invoice;
    final name = inv.displayClientName;
    final initials = BlPartyAvatar.initials(name);
    final picked = _returnQtys.values.where((q) => q > 0).length;
    final units = _returnQtys.values.fold<double>(0, (a, q) => a + q);
    final unitsText =
        units == units.roundToDouble() ? units.toStringAsFixed(0) : '$units';
    final unitWord = units == 1 ? 'unit' : 'units';

    return Scaffold(
      backgroundColor: Bl.white,
      body: SafeArea(
        child: Column(
          children: [
            const BlBackHeader(title: 'Process Return'),
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.only(bottom: 16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: BlEntrance.all([
                    // ── Which bill ───────────────────────────────────────
                    Container(
                      margin: const EdgeInsets.fromLTRB(16, 6, 16, 0),
                      padding: const EdgeInsets.symmetric(
                          horizontal: 14, vertical: 12),
                      decoration: BoxDecoration(
                          color: Bl.tile,
                          borderRadius: BorderRadius.circular(16)),
                      child: Row(
                        children: [
                          Container(
                            width: 40,
                            height: 40,
                            alignment: Alignment.center,
                            decoration: const BoxDecoration(
                                color: Color(0xFFFFF3D6),
                                shape: BoxShape.circle),
                            child: initials.isEmpty
                                ? const BlIcon(BlIcons.person,
                                    size: 16, color: Bl.ink3)
                                : Text(initials,
                                    style: Bl.tight(13,
                                        w: FontWeight.w700,
                                        ls: 0,
                                        c: Bl.ink3)),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(name,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style:
                                        Bl.tight(14.5, w: FontWeight.w600)),
                                const SizedBox(height: 1),
                                Text(
                                    [
                                      inv.displayNumber,
                                      if (inv.invoiceDate != null)
                                        _fmtDateDisplay(inv.invoiceDate!),
                                      'credit note',
                                    ].join(' · '),
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: Bl.inter(12,
                                        c: const Color(0xFF7A8088))),
                              ],
                            ),
                          ),
                          const SizedBox(width: 8),
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.end,
                            children: [
                              Text(Money.inr(inv.grandTotal),
                                  style: Bl.tight(15, w: FontWeight.w700)),
                              Text('sale total',
                                  style: Bl.inter(11.5,
                                      c: const Color(0xFF7A8088))),
                            ],
                          ),
                        ],
                      ),
                    ),
                    Padding(
                      padding: const EdgeInsets.fromLTRB(18, 16, 18, 4),
                      child: Row(
                        children: [
                          Expanded(
                              child: Text('WHAT IS COMING BACK?',
                                  style: Bl.eyebrow)),
                          Text('$picked of ${_parsedItems.length}',
                              style: Bl.eyebrow),
                        ],
                      ),
                    ),

                    // ── Items: tick to return, then set how many ─────────
                    if (_parsedItems.isEmpty)
                      Padding(
                        padding: const EdgeInsets.fromLTRB(18, 8, 18, 8),
                        child: Text('No item details available',
                            style: Bl.inter(13, c: Bl.mute)),
                      )
                    else
                      Column(
                        children: [
                          for (var i = 0; i < _parsedItems.length; i++)
                            () {
                              final item = _parsedItems[i];
                              final qty = _returnQtys[i] ?? 0;
                              final max = item.quantity.toDouble();
                              final on = qty > 0;
                              return Container(
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 18, vertical: 8),
                                decoration: BoxDecoration(
                                  color:
                                      on ? const Color(0xFFFFFBF3) : null,
                                  border: const Border(
                                      bottom: BorderSide(color: Bl.sep)),
                                ),
                                child: Row(
                                  children: [
                                    Expanded(
                                      child: Semantics(
                                        checked: on,
                                        label: item.name,
                                        child: GestureDetector(
                                          behavior: HitTestBehavior.opaque,
                                          onTap: () => _setQty(
                                              i, on ? 0 : (max < 1 ? max : 1)),
                                          child: Padding(
                                            padding:
                                                const EdgeInsets.symmetric(
                                                    vertical: 3),
                                            child: Row(
                                              children: [
                                                Container(
                                                  width: 24,
                                                  height: 24,
                                                  alignment: Alignment.center,
                                                  decoration: BoxDecoration(
                                                    color: on
                                                        ? Bl.brand
                                                        : null,
                                                    shape: BoxShape.circle,
                                                    border: on
                                                        ? null
                                                        : Border.all(
                                                            width: 1.5,
                                                            color: const Color(
                                                                0xFFCFCFCF)),
                                                  ),
                                                  child: on
                                                      ? const BlIcon(
                                                          BlIcons.check,
                                                          size: 13,
                                                          color: Bl.white,
                                                          stroke: 3)
                                                      : null,
                                                ),
                                                const SizedBox(width: 12),
                                                Expanded(
                                                  child: Column(
                                                    crossAxisAlignment:
                                                        CrossAxisAlignment
                                                            .start,
                                                    children: [
                                                      Text(item.name,
                                                          maxLines: 2,
                                                          overflow: TextOverflow
                                                              .ellipsis,
                                                          style: Bl.tight(14.5,
                                                              w: FontWeight
                                                                  .w600)),
                                                      const SizedBox(height: 1),
                                                      Text(
                                                          '${Money.inr(item.rate)} each · up to ${formatQty(max, item.unit)}',
                                                          style: Bl.inter(12,
                                                              c: const Color(
                                                                  0xFF7A8088))),
                                                    ],
                                                  ),
                                                ),
                                              ],
                                            ),
                                          ),
                                        ),
                                      ),
                                    ),
                                    if (on)
                                      Container(
                                        margin: const EdgeInsets.only(left: 8),
                                        padding: const EdgeInsets.all(3),
                                        decoration: BoxDecoration(
                                            color: const Color(0xFFFFF3DC),
                                            borderRadius:
                                                BorderRadius.circular(999)),
                                        child: Row(
                                          mainAxisSize: MainAxisSize.min,
                                          children: [
                                            _stepBtn(BlIcons.minus, 'One less',
                                                false, () => _setQty(i, qty - 1)),
                                            ConstrainedBox(
                                              constraints: const BoxConstraints(
                                                  minWidth: 34),
                                              child: Text(
                                                  formatQty(qty, item.unit),
                                                  textAlign: TextAlign.center,
                                                  style: Bl.tight(14.5,
                                                      w: FontWeight.w700,
                                                      ls: 0)),
                                            ),
                                            _stepBtn(
                                                BlIcons.plus,
                                                'One more',
                                                true,
                                                qty < max
                                                    ? () => _setQty(i, qty + 1)
                                                    : null),
                                          ],
                                        ),
                                      ),
                                  ],
                                ),
                              );
                            }(),
                        ],
                      ),

                    _field(
                      'Return date',
                      Row(
                        children: [
                          Expanded(
                            child: Text(_fmtDateDisplay(_date),
                                style: Bl.tight(15.5,
                                    w: FontWeight.w600, ls: 0)),
                          ),
                          const BlIcon(
                              '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
                              size: 16,
                              color: Color(0xFF7A8088)),
                        ],
                      ),
                      onTap: _pickDate,
                    ),
                    _field(
                      'Reason (optional)',
                      TextField(
                        controller: _reason,
                        cursorColor: Bl.brand,
                        textCapitalization: TextCapitalization.sentences,
                        style: Bl.tight(15.5, w: FontWeight.w600, ls: 0),
                        decoration: InputDecoration(
                          isCollapsed: true,
                          filled: false,
                          border: InputBorder.none,
                          enabledBorder: InputBorder.none,
                          focusedBorder: InputBorder.none,
                          hintText: 'e.g. damaged pack',
                          hintStyle: Bl.tight(15.5,
                              w: FontWeight.w500,
                              ls: 0,
                              c: const Color(0xFFA8ADB4)),
                        ),
                      ),
                    ),
                  ]),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 8, 14, 14),
              child: Column(
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(4, 0, 4, 8),
                    child: Row(
                      children: [
                        Expanded(
                          child: Text('Return total · $unitsText $unitWord',
                              style: Bl.tight(12.5,
                                  w: FontWeight.w500, c: Bl.mute)),
                        ),
                        Text(Money.inr(_returnTotal),
                            style:
                                Bl.tight(18, w: FontWeight.w800, ls: -0.03)),
                      ],
                    ),
                  ),
                  BlSlide(
                    _isLoading
                        ? 'Processing'
                        : units > 0
                            ? 'Slide to return $unitsText $unitWord'
                            : 'Pick what is coming back',
                    enabled: units > 0 && !_isLoading,
                    onConfirmed: _submit,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

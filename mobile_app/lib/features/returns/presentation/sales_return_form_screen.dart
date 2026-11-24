import 'package:flutter/material.dart';
import 'package:mobile_app/core/utils/units.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:mobile_app/features/invoices/data/models/invoice.dart';
import 'package:mobile_app/features/invoices/presentation/invoices_screen.dart';
import 'package:mobile_app/features/returns/presentation/providers/returns_provider.dart';
import 'package:mobile_app/features/sales/presentation/providers/sales_provider.dart';
import 'package:mobile_app/core/utils/money.dart';
import 'package:mobile_app/features/dashboard/presentation/widgets/dash_common.dart';
import 'package:mobile_app/widgets/motion/save_button.dart';
import 'package:mobile_app/widgets/motion/slide_to_confirm.dart';

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
            'Return processed — stock restored',
            style: GoogleFonts.manrope(
                color: Colors.white, fontWeight: FontWeight.w600),
          ),
          backgroundColor: AppColors.success,
          behavior: SnackBarBehavior.floating,
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ));
        Navigator.pop(context);
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(
            'Return failed: $e',
            style: GoogleFonts.manrope(
                color: Colors.white, fontWeight: FontWeight.w600),
          ),
          backgroundColor: AppColors.danger,
          behavior: SnackBarBehavior.floating,
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
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

  // Laid out to the approved board "Sales return" (sales-16).
  @override
  Widget build(BuildContext context) {
    final invoice = widget.invoice;
    final returnTotal = _returnTotal;
    final bottomInset = MediaQuery.of(context).padding.bottom;
    final picked = _returnQtys.values.where((q) => q > 0).length;
    final units = _returnQtys.values.fold<double>(0, (s, q) => s + q);
    final unitsText = units % 1 == 0
        ? units.toInt().toString()
        : units.toStringAsFixed(2);
    final unitWord = units == 1 ? 'unit' : 'units';
    const line = Color(0xFFF0EFED);
    const grey = Color(0xFF7A8088);

    Widget fieldLabel(String t) => Padding(
          padding: const EdgeInsets.only(bottom: 6),
          child: Text(t,
              style: DashText.tight(13,
                  w: FontWeight.w600, c: const Color(0xFF30343A), ls: 0)),
        );

    return Scaffold(
      backgroundColor: DashColors.card,
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            // ── Top bar ─────────────────────────────────────────────
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
              child: Row(
                children: [
                  GestureDetector(
                    behavior: HitTestBehavior.opaque,
                    onTap: () => Navigator.pop(context),
                    child: SizedBox(
                      width: 44,
                      height: 44,
                      child: Center(
                        child: Container(
                          width: 40,
                          height: 40,
                          decoration: const BoxDecoration(
                              color: Color(0xFFF1F1F1),
                              shape: BoxShape.circle),
                          child: const Icon(LucideIcons.chevronLeft,
                              size: 20, color: DashColors.ink),
                        ),
                      ),
                    ),
                  ),
                  Expanded(
                    child: Text('Process Return',
                        textAlign: TextAlign.center,
                        style: DashText.tight(17, w: FontWeight.w600)),
                  ),
                  const SizedBox(width: 44),
                ],
              ),
            ),
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.only(bottom: 16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    // ── The sale being returned ─────────────────────
                    Container(
                      margin: const EdgeInsets.fromLTRB(16, 6, 16, 0),
                      padding: const EdgeInsets.symmetric(
                          horizontal: 14, vertical: 12),
                      decoration: BoxDecoration(
                        color: const Color(0xFFF7F7F6),
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: Row(
                        children: [
                          Container(
                            width: 40,
                            height: 40,
                            alignment: Alignment.center,
                            decoration: const BoxDecoration(
                                color: Color(0xFFFFF3D6),
                                shape: BoxShape.circle),
                            child: Text(
                                _initialsOf(invoice.displayClientName),
                                style: DashText.tight(13,
                                    c: const Color(0xFF30343A), ls: 0)),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(invoice.displayClientName,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: DashText.tight(14.5,
                                        w: FontWeight.w600)),
                                const SizedBox(height: 1),
                                Text(
                                  '${invoice.displayNumber} · ${_fmtDateDisplay(invoice.invoiceDate ?? '')} · credit note',
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: DashText.inter(12,
                                      w: FontWeight.w400, c: grey),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(width: 8),
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.end,
                            children: [
                              Text(Money.inr(invoice.grandTotal),
                                  style: DashText.tight(15, ls: 0)),
                              Text('sale total',
                                  style: DashText.inter(11.5,
                                      w: FontWeight.w400, c: grey)),
                            ],
                          ),
                        ],
                      ),
                    ),

                    // ── What is coming back? ────────────────────────
                    Padding(
                      padding: const EdgeInsets.fromLTRB(18, 16, 18, 4),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text('WHAT IS COMING BACK?', style: _eyebrow),
                          Text('$picked of ${_parsedItems.length}',
                              style: _eyebrow),
                        ],
                      ),
                    ),
                    if (_parsedItems.isEmpty)
                      Padding(
                        padding: const EdgeInsets.fromLTRB(18, 12, 18, 12),
                        child: Text('No item details on this bill.',
                            style: DashText.inter(13)),
                      ),
                    for (int i = 0; i < _parsedItems.length; i++)
                      Builder(builder: (_) {
                        final item = _parsedItems[i];
                        final qty = _returnQtys[i] ?? 0;
                        final maxQty = item.quantity.toDouble();
                        final isSelected = qty > 0;
                        return GestureDetector(
                          behavior: HitTestBehavior.opaque,
                          // Tapping the row ticks it at one unit, or unticks it.
                          onTap: () => setState(() => _returnQtys[i] =
                              isSelected ? 0 : (maxQty >= 1 ? 1 : maxQty)),
                          child: Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 18, vertical: 11),
                            decoration: BoxDecoration(
                              color: isSelected
                                  ? const Color(0xFFFFFBF3)
                                  : DashColors.card,
                              border: const Border(
                                  bottom: BorderSide(color: line)),
                            ),
                            child: Row(
                              children: [
                                Container(
                                  width: 24,
                                  height: 24,
                                  decoration: BoxDecoration(
                                    shape: BoxShape.circle,
                                    color: isSelected
                                        ? const Color(0xFFF09935)
                                        : null,
                                    border: isSelected
                                        ? null
                                        : Border.all(
                                            color: const Color(0xFFCFCFCF),
                                            width: 1.5),
                                  ),
                                  child: isSelected
                                      ? const Icon(LucideIcons.check,
                                          size: 14, color: Colors.white)
                                      : null,
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(item.name,
                                          maxLines: 2,
                                          overflow: TextOverflow.ellipsis,
                                          style: DashText.tight(14.5,
                                              w: FontWeight.w600)),
                                      const SizedBox(height: 1),
                                      Text(
                                        item.rate > 0
                                            ? '${Money.inrExact(item.rate)} each · up to ${formatQty(maxQty, item.unit)}'
                                            : 'up to ${formatQty(maxQty, item.unit)}',
                                        style: DashText.inter(12,
                                            w: FontWeight.w400, c: grey),
                                      ),
                                    ],
                                  ),
                                ),
                                if (isSelected)
                                  Container(
                                    padding: const EdgeInsets.all(3),
                                    decoration: BoxDecoration(
                                      color: const Color(0xFFFFF3DC),
                                      borderRadius: BorderRadius.circular(999),
                                    ),
                                    child: Row(
                                      mainAxisSize: MainAxisSize.min,
                                      children: [
                                        _StepBtn(
                                          icon: LucideIcons.minus,
                                          filled: false,
                                          onTap: () => setState(
                                              () => _returnQtys[i] = qty - 1 < 0 ? 0 : qty - 1),
                                        ),
                                        ConstrainedBox(
                                          constraints: const BoxConstraints(
                                              minWidth: 30),
                                          child: Text(
                                            formatQty(qty, item.unit),
                                            textAlign: TextAlign.center,
                                            style: DashText.tight(14.5, ls: 0),
                                          ),
                                        ),
                                        _StepBtn(
                                          icon: LucideIcons.plus,
                                          filled: true,
                                          onTap: qty < maxQty
                                              ? () => setState(() =>
                                                  _returnQtys[i] =
                                                      qty + 1 > maxQty
                                                          ? maxQty
                                                          : qty + 1)
                                              : null,
                                        ),
                                      ],
                                    ),
                                  ),
                              ],
                            ),
                          ),
                        );
                      }),

                    // ── Return date ─────────────────────────────────
                    Padding(
                      padding: const EdgeInsets.fromLTRB(18, 12, 18, 0),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          fieldLabel('Return date'),
                          GestureDetector(
                            behavior: HitTestBehavior.opaque,
                            onTap: _pickDate,
                            child: Container(
                              height: 50,
                              padding:
                                  const EdgeInsets.symmetric(horizontal: 14),
                              decoration: BoxDecoration(
                                color: const Color(0xFFF4F4F3),
                                borderRadius: BorderRadius.circular(14),
                              ),
                              child: Row(
                                children: [
                                  Expanded(
                                    child: Text(_fmtDateDisplay(_date),
                                        style: DashText.tight(15.5,
                                            w: FontWeight.w600, ls: 0)),
                                  ),
                                  const Icon(LucideIcons.calendar,
                                      size: 16, color: grey),
                                ],
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),

                    // ── Reason ──────────────────────────────────────
                    Padding(
                      padding: const EdgeInsets.fromLTRB(18, 12, 18, 0),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          fieldLabel('Reason (optional)'),
                          Container(
                            constraints: const BoxConstraints(minHeight: 50),
                            alignment: Alignment.centerLeft,
                            padding:
                                const EdgeInsets.symmetric(horizontal: 14),
                            decoration: BoxDecoration(
                              color: const Color(0xFFF4F4F3),
                              borderRadius: BorderRadius.circular(14),
                            ),
                            child: TextField(
                              controller: _reason,
                              minLines: 1,
                              maxLines: 3,
                              style: DashText.tight(15.5,
                                  w: FontWeight.w600, ls: 0),
                              cursorColor: DashColors.amber,
                              decoration: InputDecoration(
                                isCollapsed: true,
                                hintText: 'e.g. damaged pack',
                                hintStyle: DashText.tight(15.5,
                                    w: FontWeight.w500,
                                    c: const Color(0xFF8A9099),
                                    ls: 0),
                                border: InputBorder.none,
                                enabledBorder: InputBorder.none,
                                focusedBorder: InputBorder.none,
                                filled: false,
                                contentPadding:
                                    const EdgeInsets.symmetric(vertical: 14),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),

            // ── Dock: total and the slide ───────────────────────────
            Container(
              padding: EdgeInsets.fromLTRB(16, 10, 16, 18 + bottomInset),
              decoration: const BoxDecoration(
                color: DashColors.card,
                border: Border(top: BorderSide(color: line)),
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(4, 0, 4, 10),
                    child: Row(
                      children: [
                        Expanded(
                          child: Text(
                              'Return total · $unitsText $unitWord',
                              style: DashText.tight(13.5,
                                  w: FontWeight.w500,
                                  c: DashColors.mute,
                                  ls: 0)),
                        ),
                        Text(Money.inrExact(returnTotal),
                            style: DashText.tight(21,
                                w: FontWeight.w800, ls: -0.03)),
                      ],
                    ),
                  ),
                  SlideToConfirm(
                    label: units > 0
                        ? 'Slide to return $unitsText $unitWord'
                        : 'Pick what is coming back',
                    semanticsLabel: 'Process return',
                    enabled: returnTotal > 0,
                    status: _isLoading ? SaveStatus.saving : SaveStatus.idle,
                    errorText: null,
                    onComplete: _submit,
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

final _eyebrow = DashText.tight(11,
    w: FontWeight.w600, c: const Color(0xFF8A9099), ls: 0.07);

String _initialsOf(String name) {
  final w = name.trim().split(RegExp(r'\s+')).where((s) => s.isNotEmpty).toList();
  if (w.isEmpty) return '?';
  if (w.length == 1) return w.first.characters.take(2).toString().toUpperCase();
  return (w[0].characters.first + w[1].characters.first).toUpperCase();
}

/// Round − / + inside the quantity pill. Drawn 30px; the pill pads it out.
class _StepBtn extends StatelessWidget {
  final IconData icon;
  final bool filled;
  final VoidCallback? onTap;
  const _StepBtn({required this.icon, required this.filled, this.onTap});

  @override
  Widget build(BuildContext context) {
    final on = onTap != null;
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: onTap,
      child: SizedBox(
        width: 38,
        height: 38,
        child: Center(
          child: Container(
            width: 30,
            height: 30,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: filled
                  ? (on ? const Color(0xFFF09935) : const Color(0xFFE6E5E3))
                  : DashColors.card,
            ),
            child: Icon(icon,
                size: 15,
                color: filled ? Colors.white : const Color(0xFF30343A)),
          ),
        ),
      ),
    );
  }
}

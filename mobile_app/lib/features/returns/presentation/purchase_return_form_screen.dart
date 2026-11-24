import 'package:flutter/material.dart';
import 'package:mobile_app/core/design/bl_widgets.dart';
import 'package:mobile_app/core/utils/money.dart';
import 'package:mobile_app/features/inventory/presentation/providers/inventory_provider.dart' show productsProvider;
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:mobile_app/features/purchases/presentation/purchases_screen.dart';
import 'package:mobile_app/features/returns/presentation/providers/returns_provider.dart';

class PurchaseReturnFormScreen extends ConsumerStatefulWidget {
  final Purchase purchase;
  const PurchaseReturnFormScreen({super.key, required this.purchase});

  @override
  ConsumerState<PurchaseReturnFormScreen> createState() =>
      _PurchaseReturnFormScreenState();
}

class _PurchaseReturnFormScreenState
    extends ConsumerState<PurchaseReturnFormScreen> {
  late final TextEditingController _qtyController;
  late final TextEditingController _reason;
  double _returnQty = 0;
  String _date = _todayStr();
  bool _isLoading = false;

  // ── Derived ────────────────────────────────────────────────────────────────
  double get unitPrice =>
      widget.purchase.quantity > 0
          ? widget.purchase.totalAmount / widget.purchase.quantity
          : 0.0;

  double get maxQty => widget.purchase.quantity;

  /// Step size: 1 for whole quantities, 0.01 for fractional.
  double get _step =>
      (maxQty == maxQty.roundToDouble()) ? 1.0 : 0.01;

  // ── Lifecycle ──────────────────────────────────────────────────────────────
  @override
  void initState() {
    super.initState();
    _qtyController = TextEditingController(text: '0');
    _reason = TextEditingController();
  }

  @override
  void dispose() {
    _qtyController.dispose();
    _reason.dispose();
    super.dispose();
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  static String _todayStr() {
    final n = DateTime.now();
    return '${n.year}-${n.month.toString().padLeft(2, '0')}-${n.day.toString().padLeft(2, '0')}';
  }

  static String _fmtDate(String? d) {
    if (d == null || d.isEmpty) return '—';
    try {
      final dt = DateTime.parse(d);
      const m = [
        'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
      ];
      return '${dt.day} ${m[dt.month - 1]} ${dt.year}';
    } catch (_) {
      return d;
    }
  }

  void _setQty(double newQty) {
    final clamped = newQty.clamp(0, maxQty).toDouble();
    setState(() {
      _returnQty = clamped;
      // Avoid cursor jump when the value hasn't changed
      final text = _step == 1.0
          ? clamped.toStringAsFixed(0)
          : clamped.toStringAsFixed(2);
      if (_qtyController.text != text) {
        _qtyController.text = text;
        _qtyController.selection =
            TextSelection.collapsed(offset: text.length);
      }
    });
  }

  void _onQtyTextChanged(String raw) {
    final val = double.tryParse(raw) ?? 0;
    final clamped = val.clamp(0, maxQty).toDouble();
    setState(() => _returnQty = clamped);
  }

  Future<void> _pickDate() async {
    final current = DateTime.tryParse(_date) ?? DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: current,
      firstDate: DateTime(2020),
      lastDate: DateTime.now(),
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
    if (picked != null) {
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
    if (_returnQty <= 0 || _returnQty > maxQty) return;

    setState(() => _isLoading = true);
    try {
      final totalAmt = _returnQty * unitPrice;
      final repo = ref.read(returnsRepositoryProvider);
      await repo.processPurchaseReturn(
        tenantId: ctx.tenantId,
        purchaseId: widget.purchase.id,
        supplierId: null,
        supplierName: widget.purchase.supplierName,
        productId: widget.purchase.linkedProductId ?? '',
        productName: null,
        quantity: _returnQty,
        unitPrice: unitPrice,
        totalAmount: totalAmt,
        reason: _reason.text.trim().isEmpty ? null : _reason.text.trim(),
        date: _date,
        locationId: null,
      );

      ref.invalidate(purchaseReturnsProvider(ctx.tenantId));

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text('Return processed. Stock updated.'),
          behavior: SnackBarBehavior.floating,
        ));
        Navigator.pop(context);
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(
              'Return may not have gone through. Check the order before trying again. ($e)'),
          backgroundColor: Bl.redDeep,
          behavior: SnackBarBehavior.floating,
          duration: const Duration(seconds: 6),
        ));
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  // ── Build ──────────────────────────────────────────────────────────────────
  static const _reasons = ['Damaged goods', 'Wrong item', 'Over-delivery', 'Other'];
  String? _reasonChoice;

  String get _qtyText => _step == 1.0
      ? _returnQty.toStringAsFixed(0)
      : _returnQty.toStringAsFixed(2);

  Widget _round(String icon, String label, bool dark, VoidCallback? onTap) =>
      BlTap(
        label: label,
        onTap: onTap,
        child: Container(
          width: 52,
          height: 52,
          alignment: Alignment.center,
          decoration: BoxDecoration(
              color: dark && onTap != null ? Bl.ink : Bl.well,
              shape: BoxShape.circle),
          child: BlIcon(icon,
              size: 22,
              stroke: 2.2,
              color: onTap == null
                  ? Bl.faint
                  : dark
                      ? Bl.white
                      : Bl.ink),
        ),
      );

  @override
  Widget build(BuildContext context) {
    final pur = widget.purchase;
    final supplier = pur.supplierName ?? 'Unknown Supplier';
    // The bill stores the product's id; show its name when we have it.
    String? productName;
    final pid = pur.linkedProductId;
    if (pid != null && pid.isNotEmpty) {
      for (final p in ref.watch(productsProvider).valueOrNull ?? const []) {
        if (p.id == pid) {
          productName = p.name;
          break;
        }
      }
    }
    final title = productName ?? supplier;
    final maxText = _step == 1.0
        ? maxQty.toStringAsFixed(0)
        : maxQty.toStringAsFixed(2);
    final unitWord = _returnQty == 1 ? 'unit' : 'units';
    final canReturn = _returnQty > 0 && _returnQty <= maxQty && !_isLoading;

    return Scaffold(
      backgroundColor: Bl.white,
      body: SafeArea(
        child: Column(
          children: [
            const BlBackHeader(title: 'Process Return'),
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(18, 6, 18, 16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: BlEntrance.all([
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Debit note',
                            style: Bl.inter(12.5,
                                w: FontWeight.w500,
                                c: const Color(0xFF7A8088))),
                        const SizedBox(height: 4),
                        Text('How many are going back?',
                            style: Bl.tight(24,
                                w: FontWeight.w700, ls: -0.03)),
                      ],
                    ),
                    Container(
                      margin: const EdgeInsets.only(top: 14),
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                          color: Bl.tile,
                          borderRadius: BorderRadius.circular(16)),
                      child: Row(
                        children: [
                          Container(
                            width: 44,
                            height: 44,
                            alignment: Alignment.center,
                            decoration: BoxDecoration(
                                color: const Color(0xFFFFF3D6),
                                borderRadius: BorderRadius.circular(11)),
                            child: Text(BlPartyAvatar.initials(title),
                                style: Bl.tight(13,
                                    w: FontWeight.w700,
                                    ls: 0,
                                    c: const Color(0xFF8A5A00))),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(title,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: Bl.tight(14.5,
                                        w: FontWeight.w600)),
                                const SizedBox(height: 1),
                                Text(
                                    [
                                      if (productName != null) supplier,
                                      _fmtDate(pur.date),
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
                              Text(Money.inr(pur.totalAmount),
                                  style: Bl.tight(14.5,
                                      w: FontWeight.w600)),
                              const SizedBox(height: 1),
                              Text('$maxText × ${Money.inr(unitPrice)}',
                                  style: Bl.inter(12,
                                      c: const Color(0xFF7A8088))),
                            ],
                          ),
                        ],
                      ),
                    ),
                    Padding(
                      padding: const EdgeInsets.only(top: 24),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          _round(BlIcons.minus, 'One less', false,
                              _returnQty > 0
                                  ? () => _setQty(_returnQty - _step)
                                  : null),
                          const SizedBox(width: 26),
                          SizedBox(
                            width: 130,
                            child: Column(
                              children: [
                                TextField(
                                  controller: _qtyController,
                                  textAlign: TextAlign.center,
                                  keyboardType: _step == 1.0
                                      ? TextInputType.number
                                      : const TextInputType
                                          .numberWithOptions(decimal: true),
                                  inputFormatters: [
                                    FilteringTextInputFormatter.allow(
                                        RegExp(r'^\d*\.?\d{0,2}')),
                                  ],
                                  cursorColor: Bl.brand,
                                  onChanged: _onQtyTextChanged,
                                  style: Bl.tight(52,
                                      w: FontWeight.w700, ls: -0.04, h: 1),
                                  decoration: const InputDecoration(
                                    isDense: true,
                                    filled: false,
                                    contentPadding: EdgeInsets.zero,
                                    border: InputBorder.none,
                                    enabledBorder: InputBorder.none,
                                    focusedBorder: InputBorder.none,
                                  ),
                                ),
                                const SizedBox(height: 4),
                                Text('of $maxText returnable',
                                    style: Bl.inter(12.5,
                                        w: FontWeight.w500,
                                        c: const Color(0xFF7A8088))),
                              ],
                            ),
                          ),
                          const SizedBox(width: 26),
                          _round(BlIcons.plus, 'One more', true,
                              _returnQty < maxQty
                                  ? () => _setQty(_returnQty + _step)
                                  : null),
                        ],
                      ),
                    ),
                    Container(
                      margin: const EdgeInsets.only(top: 18),
                      padding: const EdgeInsets.symmetric(
                          horizontal: 14, vertical: 11),
                      decoration: BoxDecoration(
                          color: const Color(0xFFFFF8EC),
                          borderRadius: BorderRadius.circular(12)),
                      child: Row(
                        children: [
                          Expanded(
                            child: Text('Debit note value',
                                style: Bl.inter(13,
                                    w: FontWeight.w500,
                                    c: const Color(0xFF7A6A4E))),
                          ),
                          Text(Money.inr(_returnQty * unitPrice),
                              style: Bl.tight(14.5,
                                  w: FontWeight.w700,
                                  c: const Color(0xFFB86A0A))),
                        ],
                      ),
                    ),
                    BlField(
                      label: 'Return date',
                      value: _fmtDate(_date),
                      onTap: _pickDate,
                      trailing: const Padding(
                        padding: EdgeInsets.only(right: 6),
                        child: BlIcon(
                            '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>',
                            size: 16,
                            color: Color(0xFF7A8088)),
                      ),
                    ),
                    Padding(
                      padding: const EdgeInsets.only(top: 14, bottom: 8),
                      child: Text('Reason (optional)',
                          style: Bl.tight(13,
                              w: FontWeight.w600, ls: 0, c: Bl.ink3)),
                    ),
                    BlChoicePills(
                      options: _reasons,
                      selected: _reasonChoice ?? '',
                      onChanged: (v) => setState(() {
                        // A second tap on the chosen reason clears it.
                        if (_reasonChoice == v) {
                          _reasonChoice = null;
                          _reason.clear();
                        } else {
                          _reasonChoice = v;
                          _reason.text = v == 'Other' ? '' : v;
                        }
                      }),
                    ),
                    if (_reasonChoice == 'Other')
                      BlField(
                        label: 'What happened?',
                        hint: 'Type the reason',
                        controller: _reason,
                        capitalization: TextCapitalization.sentences,
                      ),
                  ]),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 8, 14, 14),
              child: BlSlide(
                _isLoading
                    ? 'Processing'
                    : _returnQty > 0
                        ? 'Slide to return $_qtyText $unitWord'
                        : 'Set how many are going back',
                enabled: canReturn,
                onConfirmed: _submit,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

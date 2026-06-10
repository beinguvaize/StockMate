import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
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
          content: Text('Return processed — stock updated'),
          backgroundColor: AppColors.success,
          behavior: SnackBarBehavior.floating,
        ));
        Navigator.pop(context);
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text('Return failed: $e'),
          backgroundColor: AppColors.danger,
          behavior: SnackBarBehavior.floating,
          duration: const Duration(seconds: 6),
        ));
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  // ── Build ──────────────────────────────────────────────────────────────────
  @override
  Widget build(BuildContext context) {
    final returnValue = _returnQty * unitPrice;
    final canSubmit = _returnQty > 0 && _returnQty <= maxQty;

    return Scaffold(
      backgroundColor: AppColors.canvas,
      // ── AppBar ─────────────────────────────────────────────────────────────
      appBar: AppBar(
        backgroundColor: AppColors.canvas,
        elevation: 0,
        scrolledUnderElevation: 0,
        surfaceTintColor: Colors.transparent,
        leading: Padding(
          padding: const EdgeInsets.all(8),
          child: GestureDetector(
            onTap: () => Navigator.pop(context),
            child: Container(
              decoration: BoxDecoration(
                color: Colors.white,
                shape: BoxShape.circle,
                boxShadow: [AppColors.cardShadow],
              ),
              child: const Icon(LucideIcons.arrowLeft,
                  size: 20, color: AppColors.inkPrimary),
            ),
          ),
        ),
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Process Return',
              style: GoogleFonts.manrope(
                fontSize: 16,
                fontWeight: FontWeight.w800,
                color: AppColors.inkPrimary,
                letterSpacing: -0.3,
              ),
            ),
            Text(
              'DEBIT NOTE',
              style: GoogleFonts.jetBrainsMono(
                fontSize: 9,
                fontWeight: FontWeight.w700,
                color: AppColors.inkTertiary,
                letterSpacing: 1.5,
              ),
            ),
          ],
        ),
      ),

      // ── Body ───────────────────────────────────────────────────────────────
      body: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 120),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // ── Section 1: Original purchase header ─────────────────────────
            _SectionLabel(
              title: 'ORIGINAL PURCHASE',
              icon: LucideIcons.clipboardList,
            ),
            const SizedBox(height: 10),
            _OriginalPurchaseCard(
              purchase: widget.purchase,
              unitPrice: unitPrice,
              fmtDate: _fmtDate,
            ),

            const SizedBox(height: 24),

            // ── Section 2: Return quantity ──────────────────────────────────
            _SectionLabel(
              title: 'RETURN QUANTITY',
              icon: LucideIcons.rotateCcw,
            ),
            const SizedBox(height: 10),
            _ReturnQtyCard(
              returnQty: _returnQty,
              maxQty: maxQty,
              step: _step,
              returnValue: returnValue,
              controller: _qtyController,
              onDecrement: () => _setQty(_returnQty - _step),
              onIncrement: () => _setQty(_returnQty + _step),
              onTextChanged: _onQtyTextChanged,
            ),

            const SizedBox(height: 24),

            // ── Section 3: Details ──────────────────────────────────────────
            _SectionLabel(
              title: 'DETAILS',
              icon: LucideIcons.fileText,
            ),
            const SizedBox(height: 10),
            _DetailsCard(
              date: _date,
              fmtDate: _fmtDate,
              reasonController: _reason,
              onDateTap: _pickDate,
            ),

            const SizedBox(height: 28),

            // ── Section 4: Submit button ────────────────────────────────────
            SizedBox(
              height: 56,
              child: ElevatedButton(
                style: ElevatedButton.styleFrom(
                  backgroundColor:
                      canSubmit ? AppColors.danger : AppColors.surfaceContainer,
                  foregroundColor:
                      canSubmit ? Colors.white : AppColors.inkTertiary,
                  elevation: 0,
                  shape: const StadiumBorder(),
                ),
                onPressed: canSubmit && !_isLoading ? _submit : null,
                child: _isLoading
                    ? const SizedBox(
                        width: 22,
                        height: 22,
                        child: CircularProgressIndicator(
                            strokeWidth: 2.5, color: Colors.white),
                      )
                    : Text(
                        'RETURN ${_step == 1.0 ? _returnQty.toStringAsFixed(0) : _returnQty.toStringAsFixed(2)} UNITS'
                        ' · ₹${returnValue.toStringAsFixed(2)}',
                        style: GoogleFonts.jetBrainsMono(
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                          letterSpacing: 1,
                        ),
                      ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ─── Section label (matches purchase_detail_screen.dart) ──────────────────────
class _SectionLabel extends StatelessWidget {
  final String title;
  final IconData icon;
  const _SectionLabel({required this.title, required this.icon});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, size: 13, color: AppColors.inkTertiary),
        const SizedBox(width: 6),
        Text(
          title,
          style: GoogleFonts.jetBrainsMono(
            fontSize: 10,
            fontWeight: FontWeight.w700,
            color: AppColors.inkTertiary,
            letterSpacing: 1.3,
          ),
        ),
      ],
    );
  }
}

// ─── Section 1: Original purchase card ───────────────────────────────────────
class _OriginalPurchaseCard extends StatelessWidget {
  final Purchase purchase;
  final double unitPrice;
  final String Function(String?) fmtDate;

  const _OriginalPurchaseCard({
    required this.purchase,
    required this.unitPrice,
    required this.fmtDate,
  });

  @override
  Widget build(BuildContext context) {
    final productLabel = purchase.linkedProductId != null
        ? 'Product #${purchase.id.substring(0, 6).toUpperCase()}'
        : 'Product #${purchase.id.substring(0, 6).toUpperCase()}';

    final rows = <_InfoRow>[
      _InfoRow(
        icon: LucideIcons.package,
        label: 'Product',
        value: productLabel,
      ),
      _InfoRow(
        icon: LucideIcons.building2,
        label: 'Supplier',
        value: purchase.supplierName ?? 'Unknown Supplier',
      ),
      _InfoRow(
        icon: LucideIcons.calendar,
        label: 'Purchase Date',
        value: fmtDate(purchase.date),
      ),
      _InfoRow(
        icon: LucideIcons.indianRupee,
        label: 'Total Amount',
        value: '₹${purchase.totalAmount.toStringAsFixed(2)}',
      ),
      _InfoRow(
        icon: LucideIcons.tag,
        label: 'Unit Price',
        value: '₹${unitPrice.toStringAsFixed(2)} / unit',
      ),
      _InfoRow(
        icon: LucideIcons.hash,
        label: 'Quantity',
        value: '${purchase.quantity % 1 == 0 ? purchase.quantity.toStringAsFixed(0) : purchase.quantity.toString()} units',
      ),
    ];

    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        boxShadow: [AppColors.cardShadow],
      ),
      child: Column(
        children: rows.asMap().entries.map((entry) {
          final i = entry.key;
          final row = entry.value;
          return Column(
            children: [
              row,
              if (i < rows.length - 1)
                Divider(
                  height: 1,
                  indent: 52,
                  endIndent: 16,
                  color: AppColors.outlineVariant.withValues(alpha: 0.5),
                ),
            ],
          );
        }).toList(),
      ),
    );
  }
}

// ─── Section 2: Return quantity card ─────────────────────────────────────────
class _ReturnQtyCard extends StatelessWidget {
  final double returnQty;
  final double maxQty;
  final double step;
  final double returnValue;
  final TextEditingController controller;
  final VoidCallback onDecrement;
  final VoidCallback onIncrement;
  final ValueChanged<String> onTextChanged;

  const _ReturnQtyCard({
    required this.returnQty,
    required this.maxQty,
    required this.step,
    required this.returnValue,
    required this.controller,
    required this.onDecrement,
    required this.onIncrement,
    required this.onTextChanged,
  });

  @override
  Widget build(BuildContext context) {
    final atMin = returnQty <= 0;
    final atMax = returnQty >= maxQty;
    final maxLabel = maxQty % 1 == 0
        ? maxQty.toStringAsFixed(0)
        : maxQty.toString();

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        boxShadow: [AppColors.cardShadow],
      ),
      child: Column(
        children: [
          // ── Large stepper row ─────────────────────────────────────────────
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              // Decrement
              _StepButton(
                icon: LucideIcons.minus,
                onTap: atMin ? null : onDecrement,
                active: !atMin,
              ),
              const SizedBox(width: 20),
              // Quantity display
              Column(
                children: [
                  Text(
                    step == 1.0
                        ? returnQty.toStringAsFixed(0)
                        : returnQty.toStringAsFixed(2),
                    style: GoogleFonts.manrope(
                      fontSize: 48,
                      fontWeight: FontWeight.w900,
                      color: returnQty > 0
                          ? AppColors.danger
                          : AppColors.inkTertiary,
                      letterSpacing: -2,
                    ),
                  ),
                  Text(
                    'UNITS',
                    style: GoogleFonts.jetBrainsMono(
                      fontSize: 9,
                      fontWeight: FontWeight.w700,
                      color: AppColors.inkTertiary,
                      letterSpacing: 1.5,
                    ),
                  ),
                ],
              ),
              const SizedBox(width: 20),
              // Increment
              _StepButton(
                icon: LucideIcons.plus,
                onTap: atMax ? null : onIncrement,
                active: !atMax,
              ),
            ],
          ),

          const SizedBox(height: 16),

          // ── Text field (typed input) ──────────────────────────────────────
          Container(
            decoration: BoxDecoration(
              color: AppColors.canvas,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                  color: AppColors.outlineVariant.withValues(alpha: 0.5)),
            ),
            child: TextField(
              controller: controller,
              onChanged: onTextChanged,
              textAlign: TextAlign.center,
              keyboardType:
                  const TextInputType.numberWithOptions(decimal: true),
              inputFormatters: [
                FilteringTextInputFormatter.allow(RegExp(r'^\d*\.?\d*')),
              ],
              style: GoogleFonts.jetBrainsMono(
                fontSize: 16,
                fontWeight: FontWeight.w600,
                color: AppColors.inkPrimary,
              ),
              decoration: InputDecoration(
                hintText: '0',
                hintStyle: GoogleFonts.jetBrainsMono(
                    fontSize: 16, color: AppColors.inkTertiary),
                border: InputBorder.none,
                contentPadding: const EdgeInsets.symmetric(
                    horizontal: 16, vertical: 12),
              ),
            ),
          ),

          const SizedBox(height: 16),

          // ── Return value ──────────────────────────────────────────────────
          if (returnQty > 0)
            Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              decoration: BoxDecoration(
                color: AppColors.danger.withValues(alpha: 0.06),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                    color: AppColors.danger.withValues(alpha: 0.2)),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(LucideIcons.indianRupee,
                      size: 14, color: AppColors.danger),
                  const SizedBox(width: 6),
                  Text(
                    'Return Value: ₹${returnValue.toStringAsFixed(2)}',
                    style: GoogleFonts.manrope(
                      fontSize: 15,
                      fontWeight: FontWeight.w800,
                      color: AppColors.danger,
                    ),
                  ),
                ],
              ),
            ),

          const SizedBox(height: 10),

          // ── Max returnable hint ───────────────────────────────────────────
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(LucideIcons.info,
                  size: 12, color: AppColors.inkTertiary),
              const SizedBox(width: 5),
              Text(
                'Max returnable: $maxLabel units',
                style: GoogleFonts.manrope(
                  fontSize: 12,
                  color: AppColors.inkTertiary,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

// ─── Stepper button ───────────────────────────────────────────────────────────
class _StepButton extends StatelessWidget {
  final IconData icon;
  final VoidCallback? onTap;
  final bool active;

  const _StepButton({
    required this.icon,
    required this.onTap,
    required this.active,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () {
        if (onTap != null) {
          HapticFeedback.lightImpact();
          onTap!();
        }
      },
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 140),
        width: 48,
        height: 48,
        decoration: BoxDecoration(
          color: active
              ? AppColors.danger.withValues(alpha: 0.1)
              : AppColors.surfaceContainer,
          shape: BoxShape.circle,
          border: active
              ? Border.all(color: AppColors.danger.withValues(alpha: 0.3))
              : null,
        ),
        child: Icon(
          icon,
          size: 20,
          color: active ? AppColors.danger : AppColors.inkTertiary,
        ),
      ),
    );
  }
}

// ─── Section 3: Details card ──────────────────────────────────────────────────
class _DetailsCard extends StatelessWidget {
  final String date;
  final String Function(String?) fmtDate;
  final TextEditingController reasonController;
  final VoidCallback onDateTap;

  const _DetailsCard({
    required this.date,
    required this.fmtDate,
    required this.reasonController,
    required this.onDateTap,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        boxShadow: [AppColors.cardShadow],
      ),
      child: Column(
        children: [
          // ── Date row ──────────────────────────────────────────────────────
          GestureDetector(
            onTap: onDateTap,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
              child: Row(
                children: [
                  Container(
                    width: 36,
                    height: 36,
                    decoration: BoxDecoration(
                      color: AppColors.surfaceContainer,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: const Icon(LucideIcons.calendar,
                        size: 16, color: AppColors.inkSecondary),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Return Date',
                            style: GoogleFonts.manrope(
                                fontSize: 11, color: AppColors.inkTertiary)),
                        const SizedBox(height: 2),
                        Text(
                          fmtDate(date),
                          style: GoogleFonts.manrope(
                            fontSize: 14,
                            fontWeight: FontWeight.w500,
                            color: AppColors.inkPrimary,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const Icon(LucideIcons.chevronRight,
                      size: 16, color: AppColors.inkTertiary),
                ],
              ),
            ),
          ),

          Divider(
            height: 1,
            indent: 52,
            endIndent: 16,
            color: AppColors.outlineVariant.withValues(alpha: 0.5),
          ),

          // ── Reason field ──────────────────────────────────────────────────
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 36,
                  height: 36,
                  decoration: BoxDecoration(
                    color: AppColors.surfaceContainer,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: const Icon(LucideIcons.messageSquare,
                      size: 16, color: AppColors.inkSecondary),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Reason (optional)',
                          style: GoogleFonts.manrope(
                              fontSize: 11, color: AppColors.inkTertiary)),
                      const SizedBox(height: 4),
                      TextField(
                        controller: reasonController,
                        maxLines: 3,
                        minLines: 1,
                        style: GoogleFonts.manrope(
                          fontSize: 14,
                          fontWeight: FontWeight.w400,
                          color: AppColors.inkPrimary,
                        ),
                        decoration: InputDecoration(
                          hintText:
                              'Damaged goods, wrong item, over-delivery...',
                          hintStyle: GoogleFonts.manrope(
                            fontSize: 13,
                            color: AppColors.inkTertiary.withValues(alpha: 0.5),
                          ),
                          border: InputBorder.none,
                          isDense: true,
                          contentPadding: EdgeInsets.zero,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Shared info row (same pattern as purchase_detail_screen.dart) ─────────────
class _InfoRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;

  const _InfoRow({
    required this.icon,
    required this.label,
    required this.value,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      child: Row(
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: AppColors.surfaceContainer,
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icon, size: 16, color: AppColors.inkSecondary),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label,
                    style: GoogleFonts.manrope(
                        fontSize: 11, color: AppColors.inkTertiary)),
                const SizedBox(height: 2),
                Text(
                  value,
                  style: GoogleFonts.manrope(
                    fontSize: 14,
                    fontWeight: FontWeight.w500,
                    color: AppColors.inkPrimary,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

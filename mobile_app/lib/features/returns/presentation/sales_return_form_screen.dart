import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
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
  final Map<String, dynamic> raw;

  const _ParsedItem({
    required this.name,
    required this.quantity,
    required this.rate,
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
            style: GoogleFonts.inter(
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
            style: GoogleFonts.inter(
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

  @override
  Widget build(BuildContext context) {
    final invoice = widget.invoice;
    final returnTotal = _returnTotal;

    return Scaffold(
      backgroundColor: AppColors.canvas,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        scrolledUnderElevation: 0,
        leading: IconButton(
          icon: const Icon(LucideIcons.arrowLeft,
              size: 20, color: Color(0xFF1E293B)),
          onPressed: () => Navigator.pop(context),
        ),
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Process Return',
              style: GoogleFonts.hankenGrotesk(
                color: const Color(0xFF1E293B),
                fontSize: 18,
                fontWeight: FontWeight.w800,
                letterSpacing: -0.3,
              ),
            ),
            Text(
              'Credit Note',
              style: GoogleFonts.jetBrainsMono(
                color: const Color(0xFF94A3B8),
                fontSize: 10,
              ),
            ),
          ],
        ),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 120),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // ── Section 1: Original Sale header ─────────────────────────
            _SectionLabel('ORIGINAL SALE'),
            const SizedBox(height: 8),
            _card(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    invoice.displayNumber,
                    style: GoogleFonts.jetBrainsMono(
                      fontSize: 20,
                      fontWeight: FontWeight.w800,
                      color: AppColors.inkPrimary,
                      letterSpacing: -0.5,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Row(
                    children: [
                      const Icon(LucideIcons.user,
                          size: 13, color: Color(0xFF94A3B8)),
                      const SizedBox(width: 6),
                      Text(
                        invoice.displayClientName,
                        style: GoogleFonts.inter(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            color: AppColors.inkSecondary),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      const Icon(LucideIcons.calendar,
                          size: 13, color: Color(0xFF94A3B8)),
                      const SizedBox(width: 6),
                      Text(
                        _fmtDateDisplay(invoice.invoiceDate ?? ''),
                        style: GoogleFonts.inter(
                            fontSize: 13, color: AppColors.inkTertiary),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  const Divider(color: Color(0xFFE2E8F0)),
                  const SizedBox(height: 8),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        'Total',
                        style: GoogleFonts.inter(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            color: AppColors.inkSecondary),
                      ),
                      Text(
                        '₹${invoice.grandTotal.toStringAsFixed(2)}',
                        style: GoogleFonts.hankenGrotesk(
                          fontSize: 18,
                          fontWeight: FontWeight.w800,
                          color: AppColors.primary,
                          letterSpacing: -0.5,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),

            const SizedBox(height: 20),

            // ── Section 2: Return Items ──────────────────────────────────
            _SectionLabel('SELECT ITEMS TO RETURN'),
            const SizedBox(height: 8),
            _card(
              child: _parsedItems.isEmpty
                  ? Padding(
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      child: Text(
                        'No item details available',
                        style: GoogleFonts.inter(
                            fontSize: 13, color: AppColors.inkTertiary),
                      ),
                    )
                  : Column(
                      children: [
                        ...List.generate(_parsedItems.length, (i) {
                          final item = _parsedItems[i];
                          final qty = _returnQtys[i] ?? 0;
                          final maxQty = item.quantity.toDouble();
                          final isSelected = qty > 0;

                          return AnimatedContainer(
                            duration: const Duration(milliseconds: 180),
                            margin: EdgeInsets.only(
                                bottom: i < _parsedItems.length - 1 ? 10 : 0),
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(
                              color: isSelected
                                  ? AppColors.primaryContainer
                                      .withValues(alpha: 0.15)
                                  : Colors.transparent,
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(
                                color: isSelected
                                    ? AppColors.primary.withValues(alpha: 0.3)
                                    : Colors.transparent,
                              ),
                            ),
                            child: Row(
                              children: [
                                // Item info
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        item.name,
                                        style: GoogleFonts.inter(
                                          fontSize: 13,
                                          fontWeight: FontWeight.w700,
                                          color: AppColors.inkPrimary,
                                        ),
                                      ),
                                      const SizedBox(height: 2),
                                      Text(
                                        'Max: ${item.quantity.toInt()}',
                                        style: GoogleFonts.inter(
                                            fontSize: 11,
                                            color: AppColors.inkTertiary),
                                      ),
                                      if (item.rate > 0)
                                        Text(
                                          '₹${item.rate.toStringAsFixed(2)}/unit',
                                          style: GoogleFonts.inter(
                                              fontSize: 11,
                                              color: AppColors.inkTertiary),
                                        ),
                                    ],
                                  ),
                                ),
                                const SizedBox(width: 8),
                                // [-] qty [+] stepper
                                Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    _StepBtn(
                                      icon: LucideIcons.minus,
                                      onTap: qty > 0
                                          ? () => setState(
                                              () => _returnQtys[i] = qty - 1)
                                          : null,
                                    ),
                                    SizedBox(
                                      width: 40,
                                      child: Text(
                                        qty.toInt().toString(),
                                        textAlign: TextAlign.center,
                                        style: GoogleFonts.jetBrainsMono(
                                          fontSize: 14,
                                          fontWeight: FontWeight.w700,
                                          color: isSelected
                                              ? AppColors.primary
                                              : AppColors.inkPrimary,
                                        ),
                                      ),
                                    ),
                                    _StepBtn(
                                      icon: LucideIcons.plus,
                                      onTap: qty < maxQty
                                          ? () => setState(
                                              () => _returnQtys[i] = qty + 1)
                                          : null,
                                    ),
                                  ],
                                ),
                              ],
                            ),
                          );
                        }),
                        // ── Live return total bar ───────────────────────
                        if (_parsedItems.isNotEmpty) ...[
                          const SizedBox(height: 12),
                          const Divider(color: Color(0xFFE2E8F0)),
                          const SizedBox(height: 10),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Text(
                                'Return Total',
                                style: GoogleFonts.inter(
                                    fontSize: 13,
                                    fontWeight: FontWeight.w600,
                                    color: AppColors.inkSecondary),
                              ),
                              Text(
                                '₹${returnTotal.toStringAsFixed(2)}',
                                style: GoogleFonts.hankenGrotesk(
                                  fontSize: 20,
                                  fontWeight: FontWeight.w800,
                                  letterSpacing: -0.5,
                                  color: returnTotal > 0
                                      ? AppColors.danger
                                      : AppColors.inkTertiary,
                                ),
                              ),
                            ],
                          ),
                        ],
                      ],
                    ),
            ),

            const SizedBox(height: 20),

            // ── Section 3: Details ───────────────────────────────────────
            _SectionLabel('RETURN DETAILS'),
            const SizedBox(height: 8),
            _card(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Date row
                  InkWell(
                    onTap: _pickDate,
                    borderRadius: BorderRadius.circular(10),
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 12, vertical: 12),
                      decoration: BoxDecoration(
                        color: AppColors.surfaceContainer,
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(
                            color: Colors.black.withValues(alpha: 0.06)),
                      ),
                      child: Row(
                        children: [
                          const Icon(LucideIcons.calendar,
                              size: 16, color: AppColors.inkSecondary),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  'Return Date',
                                  style: GoogleFonts.jetBrainsMono(
                                    fontSize: 10,
                                    fontWeight: FontWeight.w600,
                                    color: AppColors.inkTertiary,
                                    letterSpacing: 1,
                                  ),
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  _fmtDateDisplay(_date),
                                  style: GoogleFonts.inter(
                                    fontSize: 14,
                                    fontWeight: FontWeight.w600,
                                    color: AppColors.inkPrimary,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const Icon(LucideIcons.chevronRight,
                              size: 16, color: Color(0xFF94A3B8)),
                        ],
                      ),
                    ),
                  ),

                  const SizedBox(height: 12),

                  // Reason field
                  Padding(
                    padding: const EdgeInsets.only(left: 4, bottom: 6),
                    child: Text(
                      'REASON FOR RETURN',
                      style: GoogleFonts.jetBrainsMono(
                        fontSize: 10,
                        fontWeight: FontWeight.w700,
                        color: AppColors.inkTertiary,
                        letterSpacing: 1,
                      ),
                    ),
                  ),
                  Container(
                    decoration: BoxDecoration(
                      color: AppColors.surfaceContainer,
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(
                          color: Colors.black.withValues(alpha: 0.06)),
                    ),
                    child: TextField(
                      controller: _reason,
                      maxLines: 3,
                      style: GoogleFonts.inter(
                        fontSize: 14,
                        fontWeight: FontWeight.w500,
                        color: AppColors.inkPrimary,
                      ),
                      decoration: InputDecoration(
                        border: InputBorder.none,
                        contentPadding: const EdgeInsets.symmetric(
                            horizontal: 12, vertical: 12),
                        hintText: 'Reason for return (optional)',
                        hintStyle: GoogleFonts.inter(
                          color:
                              AppColors.inkTertiary.withValues(alpha: 0.6),
                          fontSize: 13,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),

      // ── Section 4: Submit button (floating bottom bar) ─────────────────
      bottomNavigationBar: Container(
        padding: EdgeInsets.fromLTRB(
          16,
          12,
          16,
          MediaQuery.of(context).padding.bottom + 16,
        ),
        decoration: BoxDecoration(
          color: Colors.white,
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.06),
              blurRadius: 16,
              offset: const Offset(0, -4),
            ),
          ],
        ),
        child: SizedBox(
          height: 56,
          child: ElevatedButton(
            onPressed: (returnTotal > 0 && !_isLoading) ? _submit : null,
            style: ElevatedButton.styleFrom(
              backgroundColor:
                  returnTotal > 0 ? AppColors.danger : const Color(0xFFCBD5E1),
              disabledBackgroundColor: const Color(0xFFCBD5E1),
              foregroundColor: Colors.white,
              disabledForegroundColor: Colors.white,
              shape: const StadiumBorder(),
              elevation: 0,
            ),
            child: _isLoading
                ? const SizedBox(
                    height: 22,
                    width: 22,
                    child: CircularProgressIndicator(
                      strokeWidth: 2.5,
                      color: Colors.white,
                    ),
                  )
                : Text(
                    'PROCESS RETURN · ₹${returnTotal.toStringAsFixed(2)}',
                    style: GoogleFonts.jetBrainsMono(
                      fontWeight: FontWeight.w700,
                      fontSize: 13,
                      letterSpacing: 0.8,
                      color: Colors.white,
                    ),
                  ),
          ),
        ),
      ),
    );
  }
}

// ─── Section label (matches invoice_detail_screen style) ──────────────────────

class _SectionLabel extends StatelessWidget {
  final String text;
  const _SectionLabel(this.text);

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: GoogleFonts.jetBrainsMono(
        fontSize: 10,
        fontWeight: FontWeight.w700,
        color: AppColors.inkTertiary,
        letterSpacing: 1.5,
      ),
    );
  }
}

// ─── Card wrapper (white, rounded-16, shadow) ─────────────────────────────────

Widget _card({required Widget child}) {
  return Container(
    width: double.infinity,
    padding: const EdgeInsets.all(16),
    decoration: BoxDecoration(
      color: Colors.white,
      borderRadius: BorderRadius.circular(16),
      boxShadow: [AppColors.cardShadow],
    ),
    child: child,
  );
}

// ─── Stepper button ───────────────────────────────────────────────────────────

class _StepBtn extends StatelessWidget {
  final IconData icon;
  final VoidCallback? onTap;

  const _StepBtn({required this.icon, this.onTap});

  @override
  Widget build(BuildContext context) {
    final enabled = onTap != null;
    return SizedBox(
      width: 32,
      height: 32,
      child: OutlinedButton(
        onPressed: onTap,
        style: OutlinedButton.styleFrom(
          padding: EdgeInsets.zero,
          shape: const CircleBorder(),
          side: BorderSide(
            color: enabled
                ? AppColors.outline.withValues(alpha: 0.5)
                : const Color(0xFFE2E8F0),
          ),
          foregroundColor: enabled
              ? AppColors.inkPrimary
              : AppColors.inkTertiary,
        ),
        child: Icon(icon, size: 14),
      ),
    );
  }
}

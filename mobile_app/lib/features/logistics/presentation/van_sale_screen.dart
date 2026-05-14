import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile_app/core/supabase/client.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:mobile_app/features/logistics/data/models/van_stock.dart';
import 'package:mobile_app/features/logistics/presentation/providers/driver_provider.dart';

class VanSaleScreen extends ConsumerStatefulWidget {
  final String? vehicleId;
  final String? routeId;
  const VanSaleScreen({super.key, this.vehicleId, this.routeId});

  @override
  ConsumerState<VanSaleScreen> createState() => _VanSaleScreenState();
}

class _VanSaleScreenState extends ConsumerState<VanSaleScreen> {
  // Cart: productId → {item, qty}
  final Map<String, _CartEntry> _cart = {};
  String _paymentMethod = 'CASH';
  bool _submitting = false;
  String? _error;

  double get _total => _cart.values.fold(0, (s, e) => s + e.lineTotal);

  void _setQty(VanStockItem item, int qty) {
    setState(() {
      if (qty <= 0) {
        _cart.remove(item.productId);
      } else {
        _cart[item.productId] = _CartEntry(item: item, qty: qty);
      }
    });
  }

  Future<void> _submit() async {
    if (_cart.isEmpty) return;
    setState(() { _submitting = true; _error = null; });

    final userId = supabase.auth.currentUser?.id;
    if (userId == null || widget.vehicleId == null) {
      setState(() { _submitting = false; _error = 'Missing user or vehicle info.'; });
      return;
    }

    // Resolve tenantId: prefer user metadata, fall back to users table
    final session = supabase.auth.currentSession;
    String? tenantId = session?.user.userMetadata?['tenant_id'] as String?;
    if (tenantId == null || tenantId.isEmpty) {
      final userRow = await supabase
          .from('users')
          .select('tenant_id')
          .eq('id', userId)
          .maybeSingle();
      tenantId = userRow?['tenant_id'] as String?;
    }
    if (tenantId == null || tenantId.isEmpty) {
      setState(() { _submitting = false; _error = 'Tenant not found for this account.'; });
      return;
    }

    final sym = ref.read(currencySymbolProvider).valueOrNull ?? '';

    final items = _cart.values.map((e) => {
      'id':       e.item.productId,
      'name':     e.item.productName,
      'quantity': e.qty,
      'price':    e.item.sellingPrice,
    }).toList();

    final result = await placeVanSale(
      userId:        userId,
      tenantId:      tenantId,
      vehicleId:     widget.vehicleId!,
      clientId:      null,          // walk-in — no client
      items:         items,
      totalAmount:   _total,
      paymentMethod: _paymentMethod,
      routeId:       widget.routeId,
    );

    if (!mounted) return;

    if (result.success) {
      await showDialog(
        context: context,
        builder: (_) => _ReceiptDialog(
          cart:           _cart.values.toList(),
          total:          _total,
          paymentMethod:  _paymentMethod,
          currencySymbol: sym,
        ),
      );
      if (mounted) Navigator.pop(context);
    } else {
      setState(() { _submitting = false; _error = result.error; });
    }
  }

  @override
  Widget build(BuildContext context) {
    final vehicleId = widget.vehicleId;
    if (vehicleId == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('VAN SALE')),
        body: const Center(child: Text('No vehicle selected')),
      );
    }

    final stockAsync = ref.watch(vanStockProvider(vehicleId));
    final sym = ref.watch(currencySymbolProvider).valueOrNull ?? '';

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
            Text(
              'Van Sale',
              style: GoogleFonts.hankenGrotesk(
                fontSize: 20,
                fontWeight: FontWeight.w800,
                letterSpacing: -0.5,
                color: AppColors.inkPrimary,
              ),
            ),
            Text(
              'ROADSIDE POS',
              style: GoogleFonts.jetBrainsMono(
                fontSize: 9,
                fontWeight: FontWeight.w600,
                color: AppColors.secondary,
                letterSpacing: 1.5,
              ),
            ),
          ],
        ),
      ),
      body: stockAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Error loading stock: $e')),
        data: (stock) {
          if (stock.isEmpty) {
            return const Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(LucideIcons.packageX, size: 40, color: AppColors.inkTertiary),
                  SizedBox(height: 12),
                  Text('Van has no stock loaded', style: TextStyle(fontWeight: FontWeight.w700, color: AppColors.inkTertiary)),
                ],
              ),
            );
          }

          return Column(
            children: [
              // Product grid
              Expanded(
                child: ListView.builder(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
                  itemCount: stock.length,
                  itemBuilder: (context, i) {
                    final item = stock[i];
                    final inCart = _cart[item.productId];
                    final qty = inCart?.qty ?? 0;
                    final maxQty = item.quantity.toInt();

                    return Container(
                      margin: const EdgeInsets.only(bottom: 10),
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                      decoration: BoxDecoration(
                        color: qty > 0 ? AppColors.inkPrimary : AppColors.surface,
                        borderRadius: BorderRadius.circular(18),
                        border: Border.all(
                          color: qty > 0 ? AppColors.inkPrimary : Colors.black.withValues(alpha: 0.06),
                        ),
                      ),
                      child: Row(
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  item.productName,
                                  style: TextStyle(
                                    fontWeight: FontWeight.w800, fontSize: 14,
                                    color: qty > 0 ? Colors.white : AppColors.inkPrimary,
                                  ),
                                ),
                                const SizedBox(height: 2),
                                Row(
                                  children: [
                                    Text(
                                      '$sym${item.sellingPrice.toStringAsFixed(2)}',
                                      style: TextStyle(
                                        fontSize: 11, fontWeight: FontWeight.w700,
                                        color: qty > 0 ? AppColors.accentSignature : AppColors.inkTertiary,
                                      ),
                                    ),
                                    Text(
                                      '  ·  $maxQty avail',
                                      style: TextStyle(
                                        fontSize: 11,
                                        color: qty > 0 ? Colors.white38 : AppColors.inkTertiary,
                                      ),
                                    ),
                                  ],
                                ),
                              ],
                            ),
                          ),
                          // Stepper
                          _Stepper(
                            qty: qty, maxQty: maxQty,
                            inverted: qty > 0,
                            onChanged: (v) => _setQty(item, v),
                          ),
                        ],
                      ),
                    );
                  },
                ),
              ),

              // Bottom checkout panel
              if (_cart.isNotEmpty)
                _CheckoutPanel(
                  cart: _cart,
                  total: _total,
                  paymentMethod: _paymentMethod,
                  submitting: _submitting,
                  error: _error,
                  currencySymbol: sym,
                  onPaymentMethodChange: (v) => setState(() => _paymentMethod = v),
                  onSubmit: _submit,
                ),
            ],
          );
        },
      ),
    );
  }
}

// ── Stepper widget ─────────────────────────────────────────────────────────────
class _Stepper extends StatelessWidget {
  final int qty, maxQty;
  final bool inverted;
  final ValueChanged<int> onChanged;
  const _Stepper({required this.qty, required this.maxQty, required this.inverted, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    final borderColor = inverted ? Colors.white24 : Colors.black12;
    final textColor   = inverted ? Colors.white   : AppColors.inkPrimary;
    final btnColor    = inverted ? Colors.white12  : AppColors.canvas;

    return Row(
      children: [
        _StepBtn(
          icon: LucideIcons.minus, color: borderColor, bg: btnColor, textColor: textColor,
          onTap: qty > 0 ? () => onChanged(qty - 1) : null,
        ),
        Container(
          width: 40,
          alignment: Alignment.center,
          child: Text('$qty', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 16, color: inverted ? AppColors.accentSignature : AppColors.inkPrimary,
            fontFeatures: const [FontFeature.tabularFigures()])),
        ),
        _StepBtn(
          icon: LucideIcons.plus, color: borderColor, bg: btnColor, textColor: textColor,
          onTap: qty < maxQty ? () => onChanged(qty + 1) : null,
        ),
      ],
    );
  }
}

class _StepBtn extends StatelessWidget {
  final IconData icon;
  final Color color, bg, textColor;
  final VoidCallback? onTap;
  const _StepBtn({required this.icon, required this.color, required this.bg, required this.textColor, this.onTap});

  @override
  Widget build(BuildContext context) => GestureDetector(
    onTap: onTap,
    child: Container(
      width: 32, height: 32,
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(9), border: Border.all(color: color)),
      child: Icon(icon, size: 14, color: onTap == null ? color : textColor),
    ),
  );
}

// ── Checkout panel ─────────────────────────────────────────────────────────────
class _CheckoutPanel extends StatelessWidget {
  final Map<String, _CartEntry> cart;
  final double total;
  final String paymentMethod;
  final bool submitting;
  final String? error;
  final String currencySymbol;
  final ValueChanged<String> onPaymentMethodChange;
  final VoidCallback onSubmit;

  const _CheckoutPanel({
    required this.cart, required this.total, required this.paymentMethod,
    required this.submitting, this.error,
    required this.currencySymbol,
    required this.onPaymentMethodChange, required this.onSubmit,
  });

  @override
  Widget build(BuildContext context) => Container(
    decoration: BoxDecoration(
      color: AppColors.surface,
      borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
      boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.08), blurRadius: 20, offset: const Offset(0, -4))],
    ),
    padding: const EdgeInsets.fromLTRB(20, 20, 20, 36),
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        // Cart summary rows
        ...cart.values.map((e) => Padding(
          padding: const EdgeInsets.only(bottom: 6),
          child: Row(
            children: [
              Expanded(child: Text(e.item.productName, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600))),
              Text('× ${e.qty}', style: const TextStyle(fontSize: 12, color: AppColors.inkTertiary)),
            ],
          ),
        )),

        const Divider(height: 20),

        // Total
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            const Text('TOTAL', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 13, letterSpacing: 0.5)),
            Text('$currencySymbol${total.toStringAsFixed(2)}', style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 22,
              fontFeatures: [FontFeature.tabularFigures()])),
          ],
        ),
        const SizedBox(height: 16),

        // Payment method
        Row(
          children: ['CASH', 'CREDIT', 'CARD'].map((m) => Expanded(
            child: GestureDetector(
              onTap: () => onPaymentMethodChange(m),
              child: Container(
                margin: const EdgeInsets.only(right: 6),
                padding: const EdgeInsets.symmetric(vertical: 10),
                decoration: BoxDecoration(
                  color: paymentMethod == m ? AppColors.inkPrimary : AppColors.canvas,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: paymentMethod == m ? AppColors.inkPrimary : Colors.black12),
                ),
                child: Text(m, textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 10, fontWeight: FontWeight.w900,
                    color: paymentMethod == m ? Colors.white : AppColors.inkPrimary)),
              ),
            ),
          )).toList(),
        ),

        if (error != null) ...[
          const SizedBox(height: 10),
          Text(error!, style: const TextStyle(color: AppColors.danger, fontSize: 12)),
        ],
        const SizedBox(height: 16),

        // Confirm button
        ElevatedButton(
          onPressed: submitting ? null : onSubmit,
          style: ElevatedButton.styleFrom(
            minimumSize: const Size(double.infinity, 56),
            backgroundColor: AppColors.accentSignature,
            foregroundColor: AppColors.inkPrimary,
            disabledBackgroundColor: AppColors.canvas,
          ),
          child: submitting
              ? const SizedBox(width: 24, height: 24, child: CircularProgressIndicator(strokeWidth: 2))
              : const Text('CONFIRM SALE', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 15)),
        ),
      ],
    ),
  );
}

// ── Receipt dialog ─────────────────────────────────────────────────────────────
class _ReceiptDialog extends StatelessWidget {
  final List<_CartEntry> cart;
  final double total;
  final String paymentMethod;
  final String currencySymbol;
  const _ReceiptDialog({required this.cart, required this.total, required this.paymentMethod, required this.currencySymbol});

  @override
  Widget build(BuildContext context) => AlertDialog(
    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
    backgroundColor: AppColors.surface,
    content: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 64, height: 64,
          decoration: BoxDecoration(color: AppColors.accentSignature, shape: BoxShape.circle),
          child: const Icon(LucideIcons.checkCircle2, color: AppColors.inkPrimary, size: 32),
        ),
        const SizedBox(height: 16),
        const Text('SALE COMPLETE', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 18, letterSpacing: -0.5)),
        const SizedBox(height: 6),
        Text('$currencySymbol${total.toStringAsFixed(2)}', style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 32,
          fontFeatures: [FontFeature.tabularFigures()])),
        Text(paymentMethod, style: const TextStyle(color: AppColors.inkTertiary, fontSize: 12)),
        const SizedBox(height: 16),
        ...cart.map((e) => Padding(
          padding: const EdgeInsets.symmetric(vertical: 2),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Expanded(child: Text(e.item.productName, style: const TextStyle(fontSize: 12))),
              Text('${e.qty} × $currencySymbol${e.item.sellingPrice.toStringAsFixed(2)}',
                style: const TextStyle(fontSize: 12, color: AppColors.inkTertiary)),
              const SizedBox(width: 8),
              Text('$currencySymbol${e.lineTotal.toStringAsFixed(2)}',
                style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700)),
            ],
          ),
        )),
        const SizedBox(height: 20),
        ElevatedButton(
          onPressed: () => Navigator.pop(context),
          style: ElevatedButton.styleFrom(minimumSize: const Size(double.infinity, 48)),
          child: const Text('DONE'),
        ),
      ],
    ),
  );
}

// ── Internal model ────────────────────────────────────────────────────────────
class _CartEntry {
  final VanStockItem item;
  final int qty;
  const _CartEntry({required this.item, required this.qty});
  double get lineTotal => qty * item.sellingPrice;
}

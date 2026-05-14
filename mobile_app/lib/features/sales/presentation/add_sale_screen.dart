import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:mobile_app/features/inventory/presentation/providers/inventory_provider.dart';
import 'package:mobile_app/features/sales/presentation/providers/sales_provider.dart';
import 'package:mobile_app/core/database/database.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:mobile_app/main.dart';
import 'package:uuid/uuid.dart';

// ─── Cart model ───────────────────────────────────────────────────────────────

class CartItem {
  final Product product;
  int quantity;
  CartItem({required this.product, required this.quantity});
  double get lineTotal => (product.sellingPrice ?? 0) * quantity;
}

// ─── POS Screen ───────────────────────────────────────────────────────────────

class AddSaleScreen extends ConsumerStatefulWidget {
  const AddSaleScreen({super.key});

  @override
  ConsumerState<AddSaleScreen> createState() => _AddSaleScreenState();
}

class _AddSaleScreenState extends ConsumerState<AddSaleScreen> {
  final _searchController = TextEditingController();
  final _customerController = TextEditingController();
  String _searchQuery = '';
  String? _selectedCategory; // null = All
  final List<CartItem> _cart = [];

  @override
  void initState() {
    super.initState();
    _searchController.addListener(() {
      setState(() => _searchQuery = _searchController.text.toLowerCase());
    });
  }

  @override
  void dispose() {
    _searchController.dispose();
    _customerController.dispose();
    super.dispose();
  }

  // ── Cart ops ────────────────────────────────────────────────────────────────

  void _addToCart(Product p) {
    setState(() {
      final i = _cart.indexWhere((c) => c.product.id == p.id);
      if (i != -1) {
        if (_cart[i].quantity < (p.stock?.toInt() ?? 0)) _cart[i].quantity++;
      } else {
        if ((p.stock ?? 0) > 0) _cart.add(CartItem(product: p, quantity: 1));
      }
    });
  }

  void _removeFromCart(Product p) {
    setState(() {
      final i = _cart.indexWhere((c) => c.product.id == p.id);
      if (i != -1) {
        if (_cart[i].quantity > 1) _cart[i].quantity--;
        else _cart.removeAt(i);
      }
    });
  }

  int _cartQty(Product p) {
    final i = _cart.indexWhere((c) => c.product.id == p.id);
    return i != -1 ? _cart[i].quantity : 0;
  }

  double get _subtotal => _cart.fold(0, (s, c) => s + c.lineTotal);
  int get _cartCount => _cart.fold(0, (s, c) => s + c.quantity);

  // ── Barcode scan ─────────────────────────────────────────────────────────────

  void _scanBarcode() async {
    final result = await Navigator.push<String>(
      context,
      MaterialPageRoute(builder: (_) => const _BarcodeScannerScreen()),
    );
    if (result != null && mounted) {
      final products = ref.read(productsProvider).asData?.value ?? [];
      try {
        final p = products.firstWhere((p) => p.sku == result);
        _addToCart(p);
      } catch (_) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('SKU "$result" not found'), backgroundColor: AppColors.danger),
          );
        }
      }
    }
  }

  // ── Checkout sheet ────────────────────────────────────────────────────────────

  void _openCheckout() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _CheckoutSheet(
        cart: _cart,
        subtotal: _subtotal,
        customerController: _customerController,
        onComplete: (paymentMethod) => _submit(paymentMethod),
      ),
    );
  }

  // ── Submit ────────────────────────────────────────────────────────────────────

  Future<void> _submit(String paymentMethod) async {
    if (_cart.isEmpty) return;
    try {
      final saleId = const Uuid().v4();
      final payloadItems = _cart.map((c) => {
        'productId': c.product.id,
        'quantity': c.quantity,
        'price': c.product.sellingPrice,
        'name': c.product.name,
      }).toList();

      final saleData = {
        'id': saleId,
        'tenant_id': 'a0000000-0000-0000-0000-000000000001',
        'customerName': _customerController.text.trim().isEmpty
            ? 'Walk-in Customer'
            : _customerController.text.trim(),
        'totalAmount': _subtotal,
        'paymentMethod': paymentMethod,
        'paymentStatus': 'PAID',
        'status': 'COMPLETED',
        'items': payloadItems,
        'date': DateTime.now().toIso8601String(),
      };

      final syncService = ref.read(syncServiceProvider);
      await syncService.queueMutation(
        targetTable: 'sales',
        action: 'upsert',
        payload: saleData,
      );

      if (mounted) {
        ref.invalidate(recentSalesProvider);
        ref.invalidate(productsProvider);
        Navigator.of(context)
          ..pop() // close checkout sheet
          ..pop(); // close POS screen
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Sale recorded!'),
            backgroundColor: AppColors.secondary,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e'), backgroundColor: AppColors.danger),
        );
      }
    }
  }

  // ── Build ──────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final productsAsync = ref.watch(productsProvider);

    return Scaffold(
      backgroundColor: AppColors.canvas,
      body: productsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator(color: AppColors.primary)),
        error: (e, _) => Center(child: Text('Error: $e')),
        data: (allProducts) {
          // Categories
          final categories = ['All', ...{
            for (final p in allProducts) if (p.category != null && p.category!.isNotEmpty) p.category!
          }];

          // Filter
          final filtered = allProducts.where((p) {
            final matchCat = _selectedCategory == null || p.category == _selectedCategory;
            final matchQ = _searchQuery.isEmpty ||
                (p.name?.toLowerCase().contains(_searchQuery) ?? false) ||
                (p.sku?.toLowerCase().contains(_searchQuery) ?? false);
            return matchCat && matchQ;
          }).toList();

          return Stack(
            children: [
              CustomScrollView(
                slivers: [
                  // ── Header ──────────────────────────────────────
                  SliverToBoxAdapter(
                    child: SafeArea(
                      bottom: false,
                      child: Padding(
                        padding: const EdgeInsets.fromLTRB(24, 16, 24, 0),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                GestureDetector(
                                  onTap: () => Navigator.pop(context),
                                  child: Container(
                                    padding: const EdgeInsets.all(8),
                                    decoration: BoxDecoration(
                                      color: Colors.white,
                                      borderRadius: BorderRadius.circular(12),
                                      boxShadow: [AppColors.cardShadow],
                                    ),
                                    child: const Icon(LucideIcons.arrowLeft, size: 18, color: AppColors.inkPrimary),
                                  ),
                                ),
                                const SizedBox(width: 16),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        'New Sale',
                                        style: GoogleFonts.hankenGrotesk(
                                          fontSize: 24,
                                          fontWeight: FontWeight.w700,
                                          color: AppColors.inkPrimary,
                                          letterSpacing: -0.3,
                                        ),
                                      ),
                                      Text(
                                        'REGISTER 01',
                                        style: GoogleFonts.jetBrainsMono(
                                          fontSize: 10,
                                          color: AppColors.inkTertiary,
                                          letterSpacing: 0.5,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                                // Guest / Customer name
                                GestureDetector(
                                  onTap: () => _showCustomerDialog(),
                                  child: Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                                    decoration: BoxDecoration(
                                      color: AppColors.secondaryContainer,
                                      borderRadius: BorderRadius.circular(99),
                                    ),
                                    child: Row(
                                      children: [
                                        const Icon(LucideIcons.user, size: 14, color: AppColors.secondary),
                                        const SizedBox(width: 6),
                                        Text(
                                          _customerController.text.isEmpty
                                              ? 'Guest Customer'
                                              : _customerController.text,
                                          style: GoogleFonts.inter(
                                            fontSize: 12,
                                            fontWeight: FontWeight.w600,
                                            color: AppColors.secondary,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                              ],
                            ),

                            const SizedBox(height: 16),

                            // ── Search bar ─────────────────────────────
                            Container(
                              decoration: BoxDecoration(
                                color: Colors.white,
                                borderRadius: BorderRadius.circular(16),
                                boxShadow: [AppColors.cardShadow],
                              ),
                              child: Row(
                                children: [
                                  Expanded(
                                    child: TextField(
                                      controller: _searchController,
                                      decoration: InputDecoration(
                                        hintText: 'Search items or scan barcode...',
                                        hintStyle: GoogleFonts.inter(
                                          fontSize: 14,
                                          color: AppColors.inkTertiary,
                                        ),
                                        prefixIcon: const Icon(
                                          LucideIcons.search,
                                          size: 18,
                                          color: AppColors.inkTertiary,
                                        ),
                                        border: InputBorder.none,
                                        contentPadding: const EdgeInsets.symmetric(vertical: 14),
                                      ),
                                    ),
                                  ),
                                  IconButton(
                                    onPressed: _scanBarcode,
                                    icon: const Icon(
                                      LucideIcons.scanLine,
                                      color: AppColors.primary,
                                      size: 22,
                                    ),
                                  ),
                                ],
                              ),
                            ),

                            const SizedBox(height: 16),

                            // ── Category chips ─────────────────────────
                            SizedBox(
                              height: 36,
                              child: ListView.separated(
                                scrollDirection: Axis.horizontal,
                                itemCount: categories.length,
                                separatorBuilder: (_, __) => const SizedBox(width: 8),
                                itemBuilder: (_, i) {
                                  final cat = categories[i];
                                  final isAll = cat == 'All';
                                  final isActive = isAll
                                      ? _selectedCategory == null
                                      : _selectedCategory == cat;
                                  return GestureDetector(
                                    onTap: () => setState(
                                        () => _selectedCategory = isAll ? null : cat),
                                    child: AnimatedContainer(
                                      duration: const Duration(milliseconds: 180),
                                      padding: const EdgeInsets.symmetric(
                                          horizontal: 16, vertical: 6),
                                      decoration: BoxDecoration(
                                        color: isActive
                                            ? AppColors.primaryContainer
                                            : Colors.white,
                                        borderRadius: BorderRadius.circular(99),
                                        boxShadow: [AppColors.cardShadow],
                                      ),
                                      child: Text(
                                        cat,
                                        style: GoogleFonts.inter(
                                          fontSize: 13,
                                          fontWeight: FontWeight.w600,
                                          color: isActive
                                              ? AppColors.primary
                                              : AppColors.inkTertiary,
                                        ),
                                      ),
                                    ),
                                  );
                                },
                              ),
                            ),
                            const SizedBox(height: 16),
                          ],
                        ),
                      ),
                    ),
                  ),

                  // ── Product grid ─────────────────────────────────
                  SliverPadding(
                    padding: EdgeInsets.fromLTRB(
                        24, 0, 24, _cart.isNotEmpty ? 100 : 24),
                    sliver: filtered.isEmpty
                        ? SliverToBoxAdapter(
                            child: Center(
                              child: Padding(
                                padding: const EdgeInsets.all(40),
                                child: Text(
                                  'No products found.',
                                  style: GoogleFonts.inter(
                                      color: AppColors.inkTertiary),
                                ),
                              ),
                            ),
                          )
                        : SliverGrid(
                            delegate: SliverChildBuilderDelegate(
                              (_, i) => _ProductCard(
                                product: filtered[i],
                                qty: _cartQty(filtered[i]),
                                onAdd: () => _addToCart(filtered[i]),
                                onRemove: () => _removeFromCart(filtered[i]),
                              ),
                              childCount: filtered.length,
                            ),
                            gridDelegate:
                                const SliverGridDelegateWithFixedCrossAxisCount(
                              crossAxisCount: 2,
                              crossAxisSpacing: 14,
                              mainAxisSpacing: 14,
                              childAspectRatio: 0.78,
                            ),
                          ),
                  ),
                ],
              ),

              // ── Sticky checkout bar ──────────────────────────────
              if (_cart.isNotEmpty)
                Positioned(
                  left: 0,
                  right: 0,
                  bottom: 0,
                  child: Container(
                    padding: EdgeInsets.fromLTRB(
                        20,
                        16,
                        20,
                        16 + MediaQuery.of(context).padding.bottom),
                    decoration: const BoxDecoration(
                      color: AppColors.secondary,
                      borderRadius:
                          BorderRadius.vertical(top: Radius.circular(24)),
                    ),
                    child: Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.all(10),
                          decoration: BoxDecoration(
                            color: Colors.white.withValues(alpha: 0.15),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Icon(LucideIcons.shoppingBag,
                              color: Colors.white, size: 20),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'BASKET TOTAL',
                                style: GoogleFonts.jetBrainsMono(
                                  fontSize: 10,
                                  color: Colors.white60,
                                  letterSpacing: 0.5,
                                ),
                              ),
                              Text(
                                '₹${_subtotal.toStringAsFixed(2)}',
                                style: GoogleFonts.hankenGrotesk(
                                  fontSize: 20,
                                  fontWeight: FontWeight.w700,
                                  color: Colors.white,
                                ),
                              ),
                            ],
                          ),
                        ),
                        GestureDetector(
                          onTap: _openCheckout,
                          child: Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 20, vertical: 14),
                            decoration: BoxDecoration(
                              color: AppColors.primaryContainer,
                              borderRadius: BorderRadius.circular(99),
                            ),
                            child: Row(
                              children: [
                                Text(
                                  'Checkout',
                                  style: GoogleFonts.inter(
                                    fontSize: 14,
                                    fontWeight: FontWeight.w700,
                                    color: AppColors.primary,
                                  ),
                                ),
                                const SizedBox(width: 6),
                                const Icon(LucideIcons.arrowRight,
                                    size: 16, color: AppColors.primary),
                              ],
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
            ],
          );
        },
      ),
    );
  }

  void _showCustomerDialog() {
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
        title: Text(
          'Customer Name',
          style: GoogleFonts.hankenGrotesk(fontWeight: FontWeight.w700),
        ),
        content: TextField(
          controller: _customerController,
          autofocus: true,
          decoration: InputDecoration(
            hintText: 'e.g. Sarah Lane',
            hintStyle: GoogleFonts.inter(color: AppColors.inkTertiary),
            filled: true,
            fillColor: AppColors.surfaceContainer,
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(16),
              borderSide: BorderSide.none,
            ),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () {
              setState(() {});
              Navigator.pop(context);
            },
            child: Text(
              'Done',
              style: GoogleFonts.inter(
                  fontWeight: FontWeight.w700, color: AppColors.primary),
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Product Card ─────────────────────────────────────────────────────────────

class _ProductCard extends StatelessWidget {
  final Product product;
  final int qty;
  final VoidCallback onAdd;
  final VoidCallback onRemove;

  const _ProductCard({
    required this.product,
    required this.qty,
    required this.onAdd,
    required this.onRemove,
  });

  @override
  Widget build(BuildContext context) {
    final isLow = (product.stock ?? 0) > 0 && (product.stock ?? 0) <= 10;
    final isOut = (product.stock ?? 0) <= 0;

    return GestureDetector(
      onTap: isOut ? null : onAdd,
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(20),
          boxShadow: [AppColors.cardShadow],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Icon area + LOW STOCK badge
            Stack(
              children: [
                Container(
                  height: 80,
                  width: double.infinity,
                  decoration: BoxDecoration(
                    color: AppColors.surfaceContainer,
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Icon(
                    LucideIcons.package,
                    color: isOut
                        ? AppColors.inkTertiary
                        : AppColors.primary,
                    size: 32,
                  ),
                ),
                if (isLow)
                  Positioned(
                    top: 6,
                    right: 6,
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 6, vertical: 3),
                      decoration: BoxDecoration(
                        color: AppColors.warning,
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(
                        'LOW',
                        style: GoogleFonts.jetBrainsMono(
                          fontSize: 8,
                          fontWeight: FontWeight.w800,
                          color: Colors.white,
                          letterSpacing: 0.5,
                        ),
                      ),
                    ),
                  ),
                if (isOut)
                  Positioned(
                    top: 6,
                    right: 6,
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 6, vertical: 3),
                      decoration: BoxDecoration(
                        color: AppColors.danger,
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(
                        'OUT',
                        style: GoogleFonts.jetBrainsMono(
                          fontSize: 8,
                          fontWeight: FontWeight.w800,
                          color: Colors.white,
                          letterSpacing: 0.5,
                        ),
                      ),
                    ),
                  ),
              ],
            ),

            const SizedBox(height: 10),

            Text(
              product.name ?? 'Product',
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: GoogleFonts.hankenGrotesk(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: isOut ? AppColors.inkTertiary : AppColors.inkPrimary,
              ),
            ),
            if (product.category != null)
              Text(
                product.category!.toUpperCase(),
                style: GoogleFonts.jetBrainsMono(
                  fontSize: 9,
                  color: AppColors.inkTertiary,
                  letterSpacing: 0.3,
                ),
              ),

            const Spacer(),

            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  '₹${(product.sellingPrice ?? 0).toStringAsFixed(0)}',
                  style: GoogleFonts.hankenGrotesk(
                    fontSize: 16,
                    fontWeight: FontWeight.w800,
                    color: AppColors.primary,
                  ),
                ),
                // Qty control
                if (qty == 0)
                  GestureDetector(
                    onTap: isOut ? null : onAdd,
                    child: Container(
                      width: 30,
                      height: 30,
                      decoration: BoxDecoration(
                        color: isOut
                            ? AppColors.surfaceContainer
                            : AppColors.primaryContainer,
                        shape: BoxShape.circle,
                      ),
                      child: Icon(
                        LucideIcons.plus,
                        size: 16,
                        color: isOut ? AppColors.inkTertiary : AppColors.primary,
                      ),
                    ),
                  )
                else
                  Row(
                    children: [
                      GestureDetector(
                        onTap: onRemove,
                        child: Container(
                          width: 26,
                          height: 26,
                          decoration: BoxDecoration(
                            color: AppColors.surfaceContainer,
                            shape: BoxShape.circle,
                          ),
                          child: const Icon(LucideIcons.minus,
                              size: 13, color: AppColors.inkSecondary),
                        ),
                      ),
                      Padding(
                        padding:
                            const EdgeInsets.symmetric(horizontal: 8),
                        child: Text(
                          '$qty',
                          style: GoogleFonts.hankenGrotesk(
                            fontSize: 15,
                            fontWeight: FontWeight.w800,
                            color: AppColors.inkPrimary,
                          ),
                        ),
                      ),
                      GestureDetector(
                        onTap: onAdd,
                        child: Container(
                          width: 26,
                          height: 26,
                          decoration: BoxDecoration(
                            color: AppColors.primaryContainer,
                            shape: BoxShape.circle,
                          ),
                          child: const Icon(LucideIcons.plus,
                              size: 13, color: AppColors.primary),
                        ),
                      ),
                    ],
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

// ─── Checkout Sheet ───────────────────────────────────────────────────────────

class _CheckoutSheet extends StatefulWidget {
  final List<CartItem> cart;
  final double subtotal;
  final TextEditingController customerController;
  final Future<void> Function(String paymentMethod) onComplete;

  const _CheckoutSheet({
    required this.cart,
    required this.subtotal,
    required this.customerController,
    required this.onComplete,
  });

  @override
  State<_CheckoutSheet> createState() => _CheckoutSheetState();
}

class _CheckoutSheetState extends State<_CheckoutSheet> {
  String _paymentMethod = 'CASH';
  bool _isLoading = false;

  static const _taxRate = 0.0; // 0% by default; adjust if needed
  double get _tax => widget.subtotal * _taxRate;
  double get _total => widget.subtotal + _tax;

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      initialChildSize: 0.92,
      maxChildSize: 0.95,
      minChildSize: 0.5,
      builder: (_, ctrl) => Container(
        decoration: const BoxDecoration(
          color: AppColors.canvas,
          borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
        ),
        child: Column(
          children: [
            // Handle
            Center(
              child: Container(
                margin: const EdgeInsets.only(top: 12, bottom: 8),
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: AppColors.outlineVariant,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),

            Expanded(
              child: SingleChildScrollView(
                controller: ctrl,
                padding: const EdgeInsets.fromLTRB(24, 8, 24, 24),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // ── Header ───────────────────────────────────
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          'Checkout',
                          style: GoogleFonts.hankenGrotesk(
                            fontSize: 24,
                            fontWeight: FontWeight.w700,
                            color: AppColors.inkPrimary,
                            letterSpacing: -0.3,
                          ),
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 12, vertical: 6),
                          decoration: BoxDecoration(
                            color: AppColors.surfaceContainer,
                            borderRadius: BorderRadius.circular(99),
                          ),
                          child: Text(
                            '${widget.cart.fold(0, (s, c) => s + c.quantity)} ITEMS',
                            style: GoogleFonts.jetBrainsMono(
                              fontSize: 11,
                              fontWeight: FontWeight.w700,
                              color: AppColors.inkSecondary,
                              letterSpacing: 0.3,
                            ),
                          ),
                        ),
                      ],
                    ),

                    const SizedBox(height: 24),

                    // ── Basket summary ────────────────────────────
                    Text(
                      'Basket Summary',
                      style: GoogleFonts.hankenGrotesk(
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                        color: AppColors.inkPrimary,
                      ),
                    ),
                    const SizedBox(height: 12),
                    Container(
                      padding: const EdgeInsets.all(20),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(20),
                        boxShadow: [AppColors.cardShadow],
                      ),
                      child: Column(
                        children: widget.cart.map((item) {
                          return Padding(
                            padding: const EdgeInsets.only(bottom: 12),
                            child: Row(
                              children: [
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        '${item.product.name ?? "Product"} ×${item.quantity}',
                                        style: GoogleFonts.inter(
                                          fontSize: 14,
                                          fontWeight: FontWeight.w600,
                                          color: AppColors.inkPrimary,
                                        ),
                                      ),
                                      Text(
                                        '₹${(item.product.sellingPrice ?? 0).toStringAsFixed(2)} each',
                                        style: GoogleFonts.inter(
                                          fontSize: 12,
                                          color: AppColors.inkTertiary,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                                Text(
                                  '₹${item.lineTotal.toStringAsFixed(2)}',
                                  style: GoogleFonts.hankenGrotesk(
                                    fontSize: 15,
                                    fontWeight: FontWeight.w700,
                                    color: AppColors.inkPrimary,
                                  ),
                                ),
                              ],
                            ),
                          );
                        }).toList(),
                      ),
                    ),

                    const SizedBox(height: 24),

                    // ── Payment method ────────────────────────────
                    Text(
                      'Payment Method',
                      style: GoogleFonts.hankenGrotesk(
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                        color: AppColors.inkPrimary,
                      ),
                    ),
                    const SizedBox(height: 12),
                    ...[
                      _PayMethod(
                        'CASH',
                        'Cash',
                        'Pay at counter',
                        LucideIcons.banknote,
                      ),
                      _PayMethod(
                        'CREDIT',
                        'Credit Card',
                        'Swipe or tap card',
                        LucideIcons.creditCard,
                      ),
                      _PayMethod(
                        'BANK',
                        'Bank Transfer',
                        'UPI / NEFT / RTGS',
                        LucideIcons.building,
                      ),
                    ].map((m) => _buildPaymentOption(m)),

                    const SizedBox(height: 24),

                    // ── Bill details ──────────────────────────────
                    Text(
                      'Bill Details',
                      style: GoogleFonts.hankenGrotesk(
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                        color: AppColors.inkPrimary,
                      ),
                    ),
                    const SizedBox(height: 12),
                    Container(
                      padding: const EdgeInsets.all(20),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(20),
                        boxShadow: [AppColors.cardShadow],
                      ),
                      child: Column(
                        children: [
                          _BillRow('Subtotal',
                              '₹${widget.subtotal.toStringAsFixed(2)}'),
                          const SizedBox(height: 10),
                          _BillRow(
                              'Tax (${(_taxRate * 100).toStringAsFixed(0)}%)',
                              '₹${_tax.toStringAsFixed(2)}'),
                          const Padding(
                            padding: EdgeInsets.symmetric(vertical: 10),
                            child: Divider(color: AppColors.outlineVariant),
                          ),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Text(
                                'Grand Total',
                                style: GoogleFonts.hankenGrotesk(
                                  fontSize: 16,
                                  fontWeight: FontWeight.w700,
                                  color: AppColors.inkPrimary,
                                ),
                              ),
                              Text(
                                '₹${_total.toStringAsFixed(2)}',
                                style: GoogleFonts.hankenGrotesk(
                                  fontSize: 22,
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

                    const SizedBox(height: 32),

                    // ── Complete Transaction ───────────────────────
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton.icon(
                        onPressed: _isLoading
                            ? null
                            : () async {
                                setState(() => _isLoading = true);
                                await widget.onComplete(_paymentMethod);
                                if (mounted)
                                  setState(() => _isLoading = false);
                              },
                        icon: _isLoading
                            ? const SizedBox(
                                width: 18,
                                height: 18,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: AppColors.primary,
                                ),
                              )
                            : const Icon(LucideIcons.arrowRight, size: 18),
                        label: Text(
                          _isLoading
                              ? 'Processing...'
                              : 'Complete Transaction',
                          style: GoogleFonts.inter(
                            fontSize: 15,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppColors.secondary,
                          foregroundColor: AppColors.primaryContainer,
                          padding:
                              const EdgeInsets.symmetric(vertical: 18),
                          shape: const StadiumBorder(),
                          elevation: 0,
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

  Widget _buildPaymentOption(_PayMethod m) {
    final isActive = _paymentMethod == m.key;
    return GestureDetector(
      onTap: () => setState(() => _paymentMethod = m.key),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: isActive ? AppColors.primaryContainer : Colors.white,
          borderRadius: BorderRadius.circular(16),
          boxShadow: [AppColors.cardShadow],
          border: Border.all(
            color: isActive ? AppColors.primary : Colors.transparent,
          ),
        ),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: isActive
                    ? AppColors.primary.withValues(alpha: 0.15)
                    : AppColors.surfaceContainer,
                shape: BoxShape.circle,
              ),
              child:
                  Icon(m.icon, size: 18, color: isActive ? AppColors.primary : AppColors.inkSecondary),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    m.label,
                    style: GoogleFonts.inter(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      color: isActive
                          ? AppColors.primary
                          : AppColors.inkPrimary,
                    ),
                  ),
                  Text(
                    m.subtitle,
                    style: GoogleFonts.inter(
                        fontSize: 12,
                        color: isActive
                            ? AppColors.primary.withValues(alpha: 0.7)
                            : AppColors.inkTertiary),
                  ),
                ],
              ),
            ),
            if (isActive)
              const Icon(LucideIcons.checkCircle2,
                  color: AppColors.primary, size: 20),
          ],
        ),
      ),
    );
  }
}

class _PayMethod {
  final String key;
  final String label;
  final String subtitle;
  final IconData icon;
  const _PayMethod(this.key, this.label, this.subtitle, this.icon);
}

Widget _BillRow(String label, String value) {
  return Row(
    mainAxisAlignment: MainAxisAlignment.spaceBetween,
    children: [
      Text(label,
          style: GoogleFonts.inter(
              fontSize: 13, color: AppColors.inkSecondary)),
      Text(value,
          style: GoogleFonts.inter(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: AppColors.inkPrimary)),
    ],
  );
}

// ─── Barcode Scanner ──────────────────────────────────────────────────────────

class _BarcodeScannerScreen extends StatelessWidget {
  const _BarcodeScannerScreen();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        foregroundColor: Colors.white,
        title: Text('Scan Barcode',
            style: GoogleFonts.hankenGrotesk(
                color: Colors.white, fontWeight: FontWeight.w700)),
      ),
      body: MobileScanner(
        onDetect: (capture) {
          final barcodes = capture.barcodes;
          if (barcodes.isNotEmpty) {
            Navigator.pop(context, barcodes.first.rawValue);
          }
        },
      ),
    );
  }
}

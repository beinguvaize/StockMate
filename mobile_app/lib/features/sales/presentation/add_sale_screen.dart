import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:mobile_app/features/inventory/presentation/providers/inventory_provider.dart';
import 'package:mobile_app/features/logistics/presentation/providers/driver_provider.dart';
import 'package:mobile_app/features/sales/presentation/providers/sales_provider.dart';
import 'package:mobile_app/core/database/database.dart' hide Client, Sale, Invoice;
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:uuid/uuid.dart';
import 'package:mobile_app/features/clients_suppliers/data/models/client.dart';
import 'package:mobile_app/features/clients_suppliers/presentation/add_client_screen.dart';
import 'package:mobile_app/core/supabase/client.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/core/widgets/upi_qr_sheet.dart';
import 'package:mobile_app/features/dashboard/presentation/providers/telemetry_provider.dart';
import 'package:mobile_app/main.dart' show syncServiceProvider;
import 'package:mobile_app/features/accounts/presentation/providers/accounts_provider.dart';
import 'package:mobile_app/core/print/web_print_service.dart';
import 'package:mobile_app/core/print/pos_receipt_pdf.dart' as pos_pdf;
import 'package:mobile_app/features/invoices/data/models/invoice.dart';
import 'package:mobile_app/features/sales/data/models/sale.dart';
import 'package:mobile_app/features/settings/data/models/business_profile.dart';
import 'package:printing/printing.dart';

// POS stores (non-vehicle inventory locations) for the multi-store
// store picker. Cached per session.
final posStoresProvider = FutureProvider<List<Map<String, dynamic>>>((ref) async {
  final ctx = await ref.watch(tenantContextProvider.future);
  if (ctx == null) return [];
  final res = await supabase
      .from('inventory_locations')
      .select('id, name, type')
      .eq('tenant_id', ctx.tenantId)
      .isFilter('deleted_at', null)
      .order('created_at');
  return (res as List)
      .cast<Map<String, dynamic>>()
      .where((l) => (l['type'] ?? 'WAREHOUSE') != 'VEHICLE')
      .toList();
});

// ─── Cart model ───────────────────────────────────────────────────────────────

class CartItem {
  final Product product;
  int quantity;
  double unitPrice; // supports price override per item
  CartItem({required this.product, required this.quantity, double? unitPrice})
      : unitPrice = unitPrice ?? product.sellingPrice;
  double get lineTotal => unitPrice * quantity;
}

// ─── POS Screen ───────────────────────────────────────────────────────────────

class AddSaleScreen extends ConsumerStatefulWidget {
  /// When set, stock is sourced from this vehicle's inventory location (Van Sale).
  /// When null, stock is sourced from warehouse (POS Sale).
  final String? vehicleId;
  final String? locationId;
  final String? routeId;

  const AddSaleScreen({super.key, this.vehicleId, this.locationId, this.routeId});

  bool get isVanSale => vehicleId != null && locationId != null;

  @override
  ConsumerState<AddSaleScreen> createState() => _AddSaleScreenState();
}

class _AddSaleScreenState extends ConsumerState<AddSaleScreen> {
  final _searchController = TextEditingController();
  Client? _selectedClient;
  String _searchQuery = '';
  String? _selectedCategory;
  final List<CartItem> _cart = [];
  // Store the POS sale is rung at (multi-store). Null = let process_sale
  // resolve the default warehouse. Only used for non-van POS sales.
  String? _posStoreId;

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
    super.dispose();
  }

  // ── Cart ops ────────────────────────────────────────────────────────────────

  /// Called from product detail sheet — sets qty + price for a product.
  void _setCartItem(Product p, int qty, double price) {
    setState(() {
      if (qty <= 0) {
        _cart.removeWhere((c) => c.product.id == p.id);
        return;
      }
      final i = _cart.indexWhere((c) => c.product.id == p.id);
      if (i != -1) {
        _cart[i].quantity = qty;
        _cart[i].unitPrice = price;
      } else {
        _cart.add(CartItem(product: p, quantity: qty, unitPrice: price));
      }
    });
  }

  /// Quick +1 from card (uses default price).
  void _addToCart(Product p) {
    setState(() {
      final i = _cart.indexWhere((c) => c.product.id == p.id);
      if (i != -1) {
        if (_cart[i].quantity < p.stock.toInt()) _cart[i].quantity++;
      } else {
        if (p.stock > 0) _cart.add(CartItem(product: p, quantity: 1));
      }
    });
  }

  /// Quick -1 from card.
  void _removeFromCart(Product p) {
    setState(() {
      final i = _cart.indexWhere((c) => c.product.id == p.id);
      if (i != -1) {
        if (_cart[i].quantity > 1) {
          _cart[i].quantity--;
        } else {
          _cart.removeAt(i);
        }
      }
    });
  }

  void _deleteFromCart(Product p) {
    setState(() => _cart.removeWhere((c) => c.product.id == p.id));
  }

  int _cartQty(Product p) {
    final i = _cart.indexWhere((c) => c.product.id == p.id);
    return i != -1 ? _cart[i].quantity : 0;
  }

  double get _subtotal => _cart.fold(0, (s, c) => s + c.lineTotal);

  // ── Product detail sheet ──────────────────────────────────────────────────

  void _showProductDetail(Product p) {
    final currentItem = _cart.where((c) => c.product.id == p.id).firstOrNull;
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _ProductDetailSheet(
        product: p,
        initialQty: currentItem?.quantity ?? 1,
        initialPrice: currentItem?.unitPrice ?? p.sellingPrice,
        onConfirm: (qty, price) => _setCartItem(p, qty, price),
      ),
    );
  }

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
        _showProductDetail(p);
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
        selectedClient: _selectedClient,
        onComplete: (paymentMethod, paidAmount, discount) => _submit(paymentMethod, paidAmount, discount),
        onRemove: _deleteFromCart,
        ref: ref,
      ),
    );
  }

  // ── Submit (mirrors web placeSale → process_sale RPC) ────────────────────────

  void _showError(String msg) {
    debugPrint('[SALE ERROR] $msg');
    if (!mounted) return;
    // AlertDialog guaranteed visible — survives modal sheets, RPC errors etc
    showDialog<void>(
      context: context,
      useRootNavigator: true,
      builder: (ctx) => AlertDialog(
        backgroundColor: Colors.white,
        title: const Text('Sale Failed', style: TextStyle(color: AppColors.danger)),
        content: SingleChildScrollView(child: Text(msg)),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('OK'),
          ),
        ],
      ),
    );
  }

  Future<void> _submit(String paymentMethod, double? paidAmountOverride, [double discount = 0]) async {
    if (_cart.isEmpty) {
      _showError('Cart is empty');
      return;
    }
    try {
      // Bill total net of any discount — this is what's charged / owed / receipted.
      final discountAmt = discount.clamp(0, _subtotal).toDouble();
      final netTotal = (_subtotal - discountAmt).clamp(0, double.infinity).toDouble();
      final saleId = 'SAL-${const Uuid().v4().substring(0, 8).toUpperCase()}';

      // Items format mirrors web: { id, quantity, name, rate, taxRate }
      // taxRate snapshot at sale-time so invoice GST stays correct even
      // if the product master is edited later.
      final payloadItems = _cart.map((c) => {
        'id':       c.product.id,
        'quantity': c.quantity,
        'name':     c.product.name,
        'rate':     c.unitPrice,
        'taxRate':  c.product.taxRate,
        'cess':     c.product.cessRate,
        'hsn':      c.product.hsnCode,
      }).toList();

      final now = DateTime.now();
      final dateStr = '${now.year}-${now.month.toString().padLeft(2,'0')}-${now.day.toString().padLeft(2,'0')}';

      final pm = paymentMethod == 'CREDIT_SALE' ? 'CREDIT' : paymentMethod;
      // UPI sales start as PENDING — the QR sheet's "Payment Received"
      // button flips them to PAID once the cashier confirms.
      final ps = paymentMethod == 'CREDIT_SALE'
          ? 'UNPAID'
          : paymentMethod == 'UPI'
              ? 'PENDING'
              : 'PAID';

      final tenantCtx = ref.read(tenantContextProvider).valueOrNull;
      final tenantId = tenantCtx?.tenantId;
      final userId = supabase.auth.currentUser?.id;

      if (userId == null) {
        _showError('Not signed in — please log in again');
        return;
      }

      debugPrint('[SALE] calling process_sale id=$saleId user=$userId tenant=$tenantId items=${payloadItems.length} total=$_subtotal');

      // If the cashier entered a specific amount paid, ship it. The RPC
      // recomputes paymentStatus and pushes any unpaid balance to the
      // client's outstanding ledger. Cash > total is treated as "change
      // given" by the RPC (caps at total, doesn't store change).
      final paidAmt = paidAmountOverride;

      final rpcParams = <String, dynamic>{
        'p_id':              saleId,
        'p_shop_id':         _selectedClient?.id,
        'p_items':           payloadItems,
        'p_total_amount':    netTotal,
        'p_discount':        discountAmt,
        'p_payment_method':  pm,
        'p_payment_status':  ps,
        'p_date':            dateStr,
        'p_user_id':         userId,
        // Van sale → vehicle location; POS → cashier-picked store (or null
        // for the default warehouse when single-store).
        'p_location_id':     widget.locationId ?? _posStoreId,
        'p_route_id':        widget.routeId,
        'p_tenant_id':       tenantId,
        'p_delivery_method': 'PICKUP',
        'p_source_app':      'MOBILE',
        if (paidAmt != null) 'p_paid_amount': paidAmt,
      };

      // Offline-first: try direct RPC, on network/transient failure queue it.
      final queued = await ref.read(syncServiceProvider)
          .rpcOnlineOrQueue('process_sale', rpcParams);
      debugPrint(queued ? '[SALE] queued for offline sync' : '[SALE] RPC success');

      // NOTE: do NOT touch clients.outstanding_balance here. A DB trigger
      // (_trg_sales_recalc_outstanding) recomputes it from the client's
      // unpaid sales whenever process_sale inserts the sale. A manual write
      // races/overwrites that canonical value and drifts the balance.

      // Optimistic local stock decrement so the inventory tab + cart
      // limits reflect the new balance immediately. The next provider
      // re-run pulls the authoritative server value and overwrites this.
      try {
        final repo = ref.read(productRepositoryProvider);
        await repo.decrementLocalStock(
          payloadItems.map((it) => (
            productId: it['id'] as String,
            qty: (it['quantity'] as num).toDouble(),
          )).toList(),
        );
      } catch (_) {/* best-effort */}

      // Refresh providers first, then navigate
      ref.invalidate(recentSalesProvider);
      ref.invalidate(productsProvider);
      try { ref.invalidate(telemetryProvider); } catch (_) {}

      if (!mounted) return;

      // UPI selected → show QR sheet so the customer can scan, then wait
      // for the cashier to confirm whether the payment landed. The sale
      // was inserted as PENDING; we flip it to PAID only on confirmation.
      bool? upiConfirmed;
      if (paymentMethod == 'UPI') {
        try {
          final profile = await ref.read(tenantProfileProvider.future);
          final upiId    = profile?['upi_id'] as String?;
          final merchant = (profile?['businessName'] as String?) ??
                           (profile?['name'] as String?) ?? 'Merchant';
          final symbol   = (profile?['currencySymbol'] as String?) ?? '₹';
          if (upiId != null && upiId.isNotEmpty) {
            upiConfirmed = await UpiQrSheet.show(
              context,
              upiId: upiId,
              merchantName: merchant,
              amount: netTotal,
              invoiceNo: saleId,
              currencySymbol: symbol,
            );
          } else if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(
                content: Text('Add a UPI ID in Settings to show a payment QR.'),
                backgroundColor: Colors.orange,
                behavior: SnackBarBehavior.floating,
              ),
            );
          }
        } catch (e) {
          debugPrint('[SALE] UPI sheet failed: $e');
        }
      }

      // Resolve the PENDING UPI sale.
      //   Received → flip to PAID + paidAmount = total.
      //   Not Received → fire void_sale RPC: rolls back stock, FIFO batches,
      //     credit balance, marks the row VOIDED so it drops out of reports.
      //     The cashier can immediately ring a fresh sale if the customer
      //     wants to retry.
      if (paymentMethod == 'UPI') {
        if (upiConfirmed == true) {
          try {
            await supabase.from('sales').update({
              'paymentStatus': 'PAID',
              'paidAmount': netTotal,
            }).eq('id', saleId);
          } catch (e) {
            debugPrint('[SALE] mark PAID failed: $e');
          }
        } else {
          // Not received OR dismissed → void everything.
          try {
            await supabase.rpc('void_sale', params: {
              'p_id': saleId,
              'p_reason': 'UPI payment not received',
              'p_user_id': userId,
            });
          } catch (e) {
            debugPrint('[SALE] void_sale failed: $e');
          }
        }
      }

      if (!mounted) return;
      final tendered    = paidAmountOverride ?? netTotal;
      final excessAmt   = (tendered - netTotal).clamp(0.0, double.infinity);
      final outstanding = (_selectedClient?.outstandingBalance ?? 0.0);
      await _SaleSuccessSheet.show(
        context,
        saleId:        saleId,
        total:         netTotal,
        client:        _selectedClient,
        excess:        (excessAmt > 0 && outstanding > 0) ? excessAmt.clamp(0.0, outstanding) : 0,
        outstanding:   outstanding,
        paymentMethod: paymentMethod,
      );
      if (!mounted) return;
      Navigator.of(context, rootNavigator: true).popUntil((r) => r.isFirst);
    } catch (e, stack) {
      debugPrint('[SALE] FAILED: $e\n$stack');
      _showError('Sale failed: $e');
    }
  }

  // ── Build ──────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final productsAsync = ref.watch(productsProvider);
    // Van sale: also watch live van stock for quantity limits
    final vanStockAsync = widget.isVanSale
        ? ref.watch(vanStockProvider(widget.vehicleId!))
        : null;

    // Multi-store POS: load stores + default the picker to the first one.
    final stores = widget.isVanSale
        ? const <Map<String, dynamic>>[]
        : (ref.watch(posStoresProvider).valueOrNull ?? const []);
    if (stores.length > 1 && _posStoreId == null) {
      _posStoreId = stores.first['id'] as String?;
    }

    return Scaffold(
      backgroundColor: AppColors.canvas,
      body: productsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator(color: AppColors.primary)),
        error: (e, _) => Center(child: Text('Error: $e')),
        data: (allProducts) {
          // ── Van mode: filter to van stock only, override qty with van qty ──
          List<Product> displayProducts;
          if (widget.isVanSale) {
            final vanStock = vanStockAsync?.valueOrNull ?? [];
            final vanQtyMap = {for (final v in vanStock) v.productId: v.quantity};
            displayProducts = allProducts
                .where((p) => vanQtyMap.containsKey(p.id) && (vanQtyMap[p.id] ?? 0) > 0)
                .map((p) => p.copyWith(stock: vanQtyMap[p.id]!))
                .toList();
          } else {
            displayProducts = [...allProducts];
          }

          // Best-sellers first (by total qty sold), then the rest in place.
          final topQty = ref.watch(topSellingQtyProvider).valueOrNull ?? const {};
          displayProducts.sort((a, b) => (topQty[b.id] ?? 0).compareTo(topQty[a.id] ?? 0));

          final categories = ['All', ...{
            for (final p in displayProducts) if (p.category != null && p.category!.isNotEmpty) p.category!
          }];

          final filtered = displayProducts.where((p) {
            final matchCat = _selectedCategory == null || p.category == _selectedCategory;
            final matchQ = _searchQuery.isEmpty ||
                p.name.toLowerCase().contains(_searchQuery) ||
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
                                        widget.isVanSale ? 'Van Sale' : 'New Sale',
                                        style: GoogleFonts.manrope(
                                          fontSize: 24,
                                          fontWeight: FontWeight.w700,
                                          color: AppColors.inkPrimary,
                                          letterSpacing: -0.3,
                                        ),
                                      ),
                                      if (!widget.isVanSale && stores.length > 1)
                                        PopupMenuButton<String>(
                                          initialValue: _posStoreId,
                                          onSelected: (v) => setState(() => _posStoreId = v),
                                          itemBuilder: (_) => [
                                            for (final s in stores)
                                              PopupMenuItem(value: s['id'] as String, child: Text(s['name'] ?? 'Store')),
                                          ],
                                          child: Row(mainAxisSize: MainAxisSize.min, children: [
                                            Text(
                                              (stores.firstWhere((s) => s['id'] == _posStoreId, orElse: () => stores.first)['name'] ?? 'Store').toString().toUpperCase(),
                                              style: GoogleFonts.jetBrainsMono(fontSize: 10, color: AppColors.primary, letterSpacing: 0.5, fontWeight: FontWeight.w700),
                                            ),
                                            const Icon(LucideIcons.chevronDown, size: 12, color: AppColors.primary),
                                          ]),
                                        )
                                      else
                                        Text(
                                          widget.isVanSale ? 'ROADSIDE POS' : 'REGISTER 01',
                                          style: GoogleFonts.jetBrainsMono(
                                            fontSize: 10,
                                            color: widget.isVanSale ? AppColors.secondary : AppColors.inkTertiary,
                                            letterSpacing: 0.5,
                                          ),
                                        ),
                                    ],
                                  ),
                                ),
                                GestureDetector(
                                  onTap: () => _showClientPicker(),
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
                                          _selectedClient == null ? 'Walk-in' : (_selectedClient!.name ?? 'Client'),
                                          style: GoogleFonts.manrope(
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
                                        hintStyle: GoogleFonts.manrope(
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
                                separatorBuilder: (_, _) => const SizedBox(width: 8),
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
                                        style: GoogleFonts.manrope(
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
                                  style: GoogleFonts.manrope(
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
                                onTap: () => _showProductDetail(filtered[i]),
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
                          child: const Icon(LucideIcons.shoppingBag,
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
                                style: GoogleFonts.manrope(
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
                                  style: GoogleFonts.manrope(
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

  void _showClientPicker() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _ClientPickerSheet(
        selectedClient: _selectedClient,
        onSelected: (client) {
          setState(() => _selectedClient = client);
          Navigator.pop(context);
        },
      ),
    );
  }
}

// ─── Product Card ─────────────────────────────────────────────────────────────

class _ProductCard extends StatelessWidget {
  final Product product;
  final int qty;
  final VoidCallback onTap;   // opens detail sheet
  final VoidCallback onAdd;   // quick +1
  final VoidCallback onRemove;

  const _ProductCard({
    required this.product,
    required this.qty,
    required this.onTap,
    required this.onAdd,
    required this.onRemove,
  });

  @override
  Widget build(BuildContext context) {
    final isLow = product.stock > 0 && product.stock <= 10;
    final isOut = product.stock <= 0;

    return GestureDetector(
      onTap: isOut ? null : onTap,
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
            // Icon area + badge
            Stack(
              children: [
                Container(
                  height: 80,
                  width: double.infinity,
                  decoration: BoxDecoration(
                    color: qty > 0
                        ? AppColors.primaryContainer.withValues(alpha: 0.4)
                        : AppColors.surfaceContainer,
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Icon(
                    LucideIcons.package,
                    color: isOut
                        ? AppColors.inkTertiary
                        : qty > 0
                            ? AppColors.primary
                            : AppColors.primary,
                    size: 32,
                  ),
                ),
                if (qty > 0)
                  Positioned(
                    top: 6,
                    left: 6,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                      decoration: BoxDecoration(
                        color: AppColors.secondary,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        '×$qty',
                        style: GoogleFonts.jetBrainsMono(
                          fontSize: 9,
                          fontWeight: FontWeight.w800,
                          color: Colors.white,
                        ),
                      ),
                    ),
                  ),
                if (isLow && qty == 0)
                  Positioned(
                    top: 6,
                    right: 6,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
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
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
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
              product.name,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: GoogleFonts.manrope(
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

            const SizedBox(height: 4),

            // Stock indicator — inline tiny pill
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  LucideIcons.layers,
                  size: 9,
                  color: isOut
                      ? AppColors.danger
                      : isLow
                          ? AppColors.warning
                          : AppColors.inkSecondary,
                ),
                const SizedBox(width: 3),
                Text(
                  '${product.stock.toStringAsFixed(product.stock % 1 == 0 ? 0 : 1)} in stock',
                  style: GoogleFonts.jetBrainsMono(
                    fontSize: 9,
                    fontWeight: FontWeight.w700,
                    color: isOut
                        ? AppColors.danger
                        : isLow
                            ? AppColors.warning
                            : AppColors.inkSecondary,
                    letterSpacing: 0.2,
                  ),
                ),
              ],
            ),

            const Spacer(),

            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  '₹${product.sellingPrice.toStringAsFixed(0)}',
                  style: GoogleFonts.manrope(
                    fontSize: 16,
                    fontWeight: FontWeight.w800,
                    color: AppColors.primary,
                  ),
                ),
                // Qty quick controls
                if (qty == 0)
                  GestureDetector(
                    onTap: isOut ? null : onTap,
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
                      GestureDetector(
                        onTap: onTap,
                        child: Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 8),
                          child: Text(
                            '$qty',
                            style: GoogleFonts.manrope(
                              fontSize: 15,
                              fontWeight: FontWeight.w800,
                              color: AppColors.primary,
                            ),
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

// ─── Product Detail Sheet ─────────────────────────────────────────────────────

class _ProductDetailSheet extends StatefulWidget {
  final Product product;
  final int initialQty;
  final double initialPrice;
  final void Function(int qty, double price) onConfirm;

  const _ProductDetailSheet({
    required this.product,
    required this.initialQty,
    required this.initialPrice,
    required this.onConfirm,
  });

  @override
  State<_ProductDetailSheet> createState() => _ProductDetailSheetState();
}

class _ProductDetailSheetState extends State<_ProductDetailSheet> {
  late int _qty;
  late TextEditingController _priceController;
  late TextEditingController _qtyController;
  double _price = 0;

  @override
  void initState() {
    super.initState();
    _qty = widget.initialQty;
    _price = widget.initialPrice;
    _priceController = TextEditingController(text: _price.toStringAsFixed(2));
    _priceController.addListener(() {
      final v = double.tryParse(_priceController.text);
      if (v != null) setState(() => _price = v);
    });
    _qtyController = TextEditingController(text: '$_qty');
    _qtyController.addListener(() {
      final v = int.tryParse(_qtyController.text);
      if (v != null && v > 0 && v <= _maxStock) {
        setState(() => _qty = v);
      }
    });
  }

  @override
  void dispose() {
    _priceController.dispose();
    _qtyController.dispose();
    super.dispose();
  }

  double get _total => _qty * _price;
  int get _maxStock => widget.product.stock.toInt();

  void _increment() {
    if (_qty < _maxStock) {
      setState(() => _qty++);
      _qtyController.text = '$_qty';
    }
  }

  void _decrement() {
    if (_qty > 1) {
      setState(() => _qty--);
      _qtyController.text = '$_qty';
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = widget.product;
    final isLow = p.stock > 0 && p.stock <= 10;

    return Container(
      decoration: const BoxDecoration(
        color: AppColors.canvas,
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
      ),
      child: SafeArea(
        top: false,
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(24, 0, 24, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // ── Handle + header ─────────────────────────────────
              Center(
                child: Container(
                  margin: const EdgeInsets.only(top: 12, bottom: 20),
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: AppColors.outlineVariant,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),

              Row(
                children: [
                  GestureDetector(
                    onTap: () => Navigator.pop(context),
                    child: Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: AppColors.surfaceContainer,
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(LucideIcons.x, size: 18, color: AppColors.inkSecondary),
                    ),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          p.name,
                          style: GoogleFonts.manrope(
                            fontSize: 20,
                            fontWeight: FontWeight.w700,
                            color: AppColors.inkPrimary,
                            letterSpacing: -0.3,
                          ),
                        ),
                        if (p.sku != null)
                          Text(
                            'SKU: ${p.sku}',
                            style: GoogleFonts.jetBrainsMono(
                              fontSize: 10,
                              color: AppColors.inkTertiary,
                              letterSpacing: 0.3,
                            ),
                          ),
                      ],
                    ),
                  ),
                  // Stock badge
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                    decoration: BoxDecoration(
                      color: isLow
                          ? AppColors.warning.withValues(alpha: 0.12)
                          : AppColors.primaryContainer.withValues(alpha: 0.4),
                      borderRadius: BorderRadius.circular(99),
                    ),
                    child: Row(
                      children: [
                        Icon(
                          LucideIcons.checkCircle2,
                          size: 12,
                          color: isLow ? AppColors.warning : AppColors.primary,
                        ),
                        const SizedBox(width: 4),
                        Text(
                          isLow ? 'Low (${p.stock.toInt()})' : 'In Stock',
                          style: GoogleFonts.jetBrainsMono(
                            fontSize: 10,
                            fontWeight: FontWeight.w600,
                            color: isLow ? AppColors.warning : AppColors.primary,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),

              const SizedBox(height: 32),

              // ── Quantity stepper ──────────────────────────────────
              Text(
                'ADJUST QUANTITY',
                textAlign: TextAlign.center,
                style: GoogleFonts.jetBrainsMono(
                  fontSize: 10,
                  fontWeight: FontWeight.w700,
                  color: AppColors.inkTertiary,
                  letterSpacing: 1.5,
                ),
              ),
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: AppColors.surfaceContainer,
                  borderRadius: BorderRadius.circular(99),
                  border: Border.all(color: AppColors.outlineVariant),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    // Decrement
                    GestureDetector(
                      onTap: _decrement,
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 120),
                        width: 56,
                        height: 56,
                        decoration: BoxDecoration(
                          color: _qty > 1
                              ? AppColors.surfaceContainer
                              : AppColors.outlineVariant.withValues(alpha: 0.3),
                          shape: BoxShape.circle,
                          border: Border.all(color: AppColors.outlineVariant),
                        ),
                        child: Icon(
                          LucideIcons.minus,
                          size: 22,
                          color: _qty > 1 ? AppColors.inkPrimary : AppColors.inkTertiary,
                        ),
                      ),
                    ),

                    // Quantity — editable field
                    SizedBox(
                      width: 120,
                      child: TextField(
                        controller: _qtyController,
                        keyboardType: TextInputType.number,
                        textAlign: TextAlign.center,
                        inputFormatters: [
                          FilteringTextInputFormatter.digitsOnly,
                        ],
                        style: GoogleFonts.manrope(
                          fontSize: 48,
                          fontWeight: FontWeight.w700,
                          color: AppColors.inkPrimary,
                          height: 1,
                        ),
                        decoration: const InputDecoration(
                          border: InputBorder.none,
                          contentPadding: EdgeInsets.zero,
                          isDense: true,
                        ),
                        onTap: () => _qtyController.selection = TextSelection(
                          baseOffset: 0,
                          extentOffset: _qtyController.text.length,
                        ),
                      ),
                    ),

                    // Increment
                    GestureDetector(
                      onTap: _increment,
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 120),
                        width: 56,
                        height: 56,
                        decoration: BoxDecoration(
                          color: _qty < _maxStock
                              ? AppColors.primaryContainer
                              : AppColors.outlineVariant.withValues(alpha: 0.3),
                          shape: BoxShape.circle,
                        ),
                        child: Icon(
                          LucideIcons.plus,
                          size: 22,
                          color: _qty < _maxStock ? AppColors.primary : AppColors.inkTertiary,
                        ),
                      ),
                    ),
                  ],
                ),
              ),

              const SizedBox(height: 28),

              // ── Unit price field ──────────────────────────────────
              Container(
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(18),
                  border: Border.all(color: AppColors.outlineVariant),
                  boxShadow: [AppColors.cardShadow],
                ),
                child: TextField(
                  controller: _priceController,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  inputFormatters: [
                    FilteringTextInputFormatter.allow(RegExp(r'^\d*\.?\d{0,2}')),
                  ],
                  style: GoogleFonts.manrope(
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                    color: AppColors.inkPrimary,
                  ),
                  decoration: InputDecoration(
                    labelText: 'UNIT PRICE',
                    labelStyle: GoogleFonts.jetBrainsMono(
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                      color: AppColors.inkTertiary,
                      letterSpacing: 1,
                    ),
                    floatingLabelBehavior: FloatingLabelBehavior.always,
                    prefixIcon: Padding(
                      padding: const EdgeInsets.only(left: 16, right: 8, top: 4),
                      child: Text(
                        '₹',
                        style: GoogleFonts.manrope(
                          fontSize: 18,
                          fontWeight: FontWeight.w700,
                          color: AppColors.inkSecondary,
                        ),
                      ),
                    ),
                    prefixIconConstraints: const BoxConstraints(minWidth: 0, minHeight: 0),
                    suffixIcon: const Padding(
                      padding: EdgeInsets.only(right: 16),
                      child: Icon(LucideIcons.pencil, size: 16, color: AppColors.inkTertiary),
                    ),
                    suffixIconConstraints: const BoxConstraints(minWidth: 0, minHeight: 0),
                    border: InputBorder.none,
                    contentPadding: const EdgeInsets.fromLTRB(16, 18, 16, 14),
                    focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(18),
                      borderSide: const BorderSide(color: AppColors.primaryContainer, width: 2),
                    ),
                    enabledBorder: InputBorder.none,
                  ),
                ),
              ),

              const SizedBox(height: 28),

              // ── Estimated total ───────────────────────────────────
              Column(
                children: [
                  Text(
                    'ESTIMATED TOTAL',
                    style: GoogleFonts.jetBrainsMono(
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                      color: AppColors.inkTertiary,
                      letterSpacing: 1.5,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: Text(
                          '₹',
                          style: GoogleFonts.manrope(
                            fontSize: 22,
                            fontWeight: FontWeight.w700,
                            color: AppColors.inkSecondary,
                          ),
                        ),
                      ),
                      const SizedBox(width: 2),
                      Text(
                        _total.toStringAsFixed(2),
                        style: GoogleFonts.manrope(
                          fontSize: 52,
                          fontWeight: FontWeight.w800,
                          color: AppColors.inkPrimary,
                          height: 1,
                          letterSpacing: -1,
                        ),
                      ),
                    ],
                  ),
                ],
              ),

              const SizedBox(height: 28),

              // ── Add to Basket ─────────────────────────────────────
              SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  onPressed: () {
                    widget.onConfirm(_qty, _price);
                    Navigator.pop(context);
                  },
                  icon: const Icon(LucideIcons.shoppingBag, size: 20),
                  label: Text(
                    'Add to Basket',
                    style: GoogleFonts.manrope(
                      fontSize: 17,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.secondary,
                    foregroundColor: AppColors.primaryContainer,
                    padding: const EdgeInsets.symmetric(vertical: 18),
                    shape: const StadiumBorder(),
                    elevation: 0,
                  ),
                ),
              ),

              const SizedBox(height: 8),

              Text(
                'Tap quantity number on card to reopen this screen',
                textAlign: TextAlign.center,
                style: GoogleFonts.manrope(
                  fontSize: 11,
                  color: AppColors.inkTertiary,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ─── Checkout Sheet ───────────────────────────────────────────────────────────

class _CheckoutSheet extends StatefulWidget {
  final List<CartItem> cart;
  final double subtotal;
  final Client? selectedClient;
  // onComplete now receives an optional paidAmount. NULL means "use the
  // method default" (CASH/UPI/BANK → full pay; CREDIT_SALE → 0).
  final Future<void> Function(String paymentMethod, double? paidAmount, double discount) onComplete;
  final void Function(Product) onRemove;
  // Pulled from parent so the checkout sheet can read business profile
  // (tax_mode) without spinning up its own ConsumerStatefulWidget.
  final WidgetRef ref;

  const _CheckoutSheet({
    required this.cart,
    required this.subtotal,
    required this.selectedClient,
    required this.onComplete,
    required this.onRemove,
    required this.ref,
  });

  @override
  State<_CheckoutSheet> createState() => _CheckoutSheetState();
}

class _CheckoutSheetState extends State<_CheckoutSheet> {
  // Accounts from DB — loaded async. Drives dynamic payment method list.
  // Falls back to static CASH/UPI/BANK list until loaded.
  List<AccountModel> _accounts = [];
  // account.id of selected method, or 'CREDIT_SALE' sentinel.
  String _paymentMethod = 'CASH';
  bool _isLoading = false;
  late List<CartItem> _localCart;
  // Optional cashier-entered "Amount paid now". Empty/null → full pay
  // for CASH/UPI/BANK, or 0 for CREDIT_SALE. When less than the bill
  // total + client selected, balance lands in clients.outstanding_balance.
  late TextEditingController _amountPaidCtrl;
  // Optional bill-level discount. Mode toggles between flat ₹ and %.
  late TextEditingController _discountCtrl;
  String _discountMode = 'AMOUNT'; // 'AMOUNT' | 'PERCENT'

  /// Derives the payment type (CASH/UPI/BANK/CREDIT_SALE) from the selected
  /// account id. Falls through to the raw value when accounts not yet loaded.
  String get _selectedPayType {
    if (_paymentMethod == 'CREDIT_SALE') return 'CREDIT_SALE';
    if (_accounts.isEmpty) return _paymentMethod;
    final idx = _accounts.indexWhere((a) => a.id == _paymentMethod);
    return idx >= 0 ? _accounts[idx].type : _paymentMethod;
  }

  /// Payment method tiles built dynamically from accounts, ordered
  /// CASH → UPI → BANK (mirrors web buildPaymentMethods ordering).
  List<_PayMethod> get _payMethods {
    if (_accounts.isEmpty) {
      // Fallback while accounts are loading.
      return const [
        _PayMethod('CASH', 'Cash', 'Pay at counter', LucideIcons.banknote, 'CASH'),
        _PayMethod('UPI', 'UPI', 'Customer scans to pay', LucideIcons.qrCode, 'UPI'),
        _PayMethod('BANK', 'Bank', 'NEFT / RTGS', LucideIcons.building, 'BANK'),
      ];
    }
    // One tile per payment TYPE — the default account of that type (or the
    // first one when none is flagged default). Cashiers pick a method, not
    // an account; listing every account cluttered the sheet.
    const typeOrder = ['CASH', 'UPI', 'BANK', 'CARD'];
    final methods = <_PayMethod>[];
    for (final t in typeOrder) {
      final ofType = _accounts.where((a) => a.type == t).toList();
      if (ofType.isEmpty) continue;
      final acc = ofType.firstWhere((a) => a.isDefault, orElse: () => ofType.first);
      final icon = t == 'CASH' ? LucideIcons.banknote
          : t == 'UPI' ? LucideIcons.qrCode
          : LucideIcons.building;
      final sub = t == 'CASH' ? 'Pay at counter'
          : t == 'UPI' ? 'Customer scans to pay'
          : 'NEFT / RTGS';
      methods.add(_PayMethod(acc.id, acc.name, sub, icon, t));
    }
    if (widget.selectedClient != null) {
      methods.add(_PayMethod(
        'CREDIT_SALE', 'Credit Sale',
        'Bill to ${widget.selectedClient!.name ?? "Client"}',
        LucideIcons.clock, 'CREDIT_SALE',
      ));
    }
    return methods;
  }

  @override
  void initState() {
    super.initState();
    _localCart = List.from(widget.cart);
    _amountPaidCtrl = TextEditingController();
    _discountCtrl = TextEditingController();
    // Load accounts and auto-select the default (or first) account.
    widget.ref.read(accountsProvider.future).then((accounts) {
      if (!mounted) return;
      setState(() {
        _accounts = accounts;
        if (accounts.isNotEmpty) {
          // Mirror _payMethods: first tile is the default CASH account (or
          // first account of the first type present in CASH→UPI→BANK→CARD).
          const typeOrder = ['CASH', 'UPI', 'BANK', 'CARD'];
          AccountModel? pick;
          for (final t in typeOrder) {
            final ofType = accounts.where((a) => a.type == t).toList();
            if (ofType.isEmpty) continue;
            pick = ofType.firstWhere((a) => a.isDefault, orElse: () => ofType.first);
            break;
          }
          _paymentMethod = (pick ?? accounts.first).id;
        }
      });
    });
  }

  @override
  void dispose() {
    _amountPaidCtrl.dispose();
    _discountCtrl.dispose();
    super.dispose();
  }

  /// Effective paid amount considering payment method + cashier input.
  double? get _effectivePaid {
    final raw = _amountPaidCtrl.text.trim();
    if (raw.isEmpty) return null;        // null → server picks default
    final v = double.tryParse(raw);
    if (v == null) return null;
    return v;
  }

  double get _changeOrBalance =>
      ((_effectivePaid ?? _netTotal) - _netTotal);

  // Tax math respects tenant tax_mode + per-product taxRate. INCLUSIVE
  // means rate already contains tax — back it out for the Tax line.
  // EXCLUSIVE means rate is base — add tax on top.
  String get _taxMode {
    final p = widget.ref.read(tenantProfileProvider).valueOrNull;
    return (p?['tax_mode'] as String?)?.toUpperCase() ?? 'EXCLUSIVE';
  }

  double get _subtotal {
    // NONE: no tax split — line as-is. INCLUSIVE: backed-out taxable.
    // EXCLUSIVE: lineTotal as-is.
    if (_taxMode == 'NONE') return _localCart.fold(0.0, (s, c) => s + c.lineTotal);
    final inclusive = _taxMode == 'INCLUSIVE';
    return _localCart.fold(0.0, (s, c) {
      final r = (c.product.taxRate).toDouble();
      final line = c.lineTotal;
      return s + (inclusive ? line / (1 + r / 100) : line);
    });
  }

  double get _tax {
    // NONE (not filing GST) = no tax computed at all.
    if (_taxMode == 'NONE') return 0;
    final inclusive = _taxMode == 'INCLUSIVE';
    return _localCart.fold(0.0, (s, c) {
      final r = (c.product.taxRate).toDouble();
      final line = c.lineTotal;
      return s + (inclusive ? line - (line / (1 + r / 100)) : line * r / 100);
    });
  }

  double get _total {
    // NONE / INCLUSIVE: grand total = sum of line totals (no tax added on top).
    // EXCLUSIVE: grand total = subtotal + tax.
    if (_taxMode == 'NONE' || _taxMode == 'INCLUSIVE') {
      return _localCart.fold(0.0, (s, c) => s + c.lineTotal);
    }
    return _subtotal + _tax;
  }

  // Bill-level discount in ₹ (flat amount or computed from %), capped at total.
  double get _discountAmount {
    final v = double.tryParse(_discountCtrl.text.trim()) ?? 0;
    if (v <= 0) return 0;
    final amt = _discountMode == 'PERCENT' ? _total * v / 100 : v;
    return amt.clamp(0, _total).toDouble();
  }

  // Grand total the customer actually pays.
  double get _netTotal => (_total - _discountAmount).clamp(0, double.infinity).toDouble();

  // Average effective tax rate (for display label) — weighted by line total.
  double get _avgTaxRate {
    final totalLine = _localCart.fold(0.0, (s, c) => s + c.lineTotal);
    if (totalLine <= 0) return 0;
    final weighted = _localCart.fold(0.0, (s, c) =>
        s + c.lineTotal * (c.product.taxRate).toDouble());
    return weighted / totalLine;
  }

  void _removeItem(CartItem item) {
    setState(() => _localCart.removeWhere((c) => c.product.id == item.product.id));
    widget.onRemove(item.product);
    if (_localCart.isEmpty && mounted) Navigator.pop(context);
  }

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
                          style: GoogleFonts.manrope(
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
                            '${_localCart.fold(0, (s, c) => s + c.quantity)} ITEMS',
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
                      style: GoogleFonts.manrope(
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
                        children: _localCart.map((item) {
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
                                        '${item.product.name} ×${item.quantity}',
                                        style: GoogleFonts.manrope(
                                          fontSize: 14,
                                          fontWeight: FontWeight.w600,
                                          color: AppColors.inkPrimary,
                                        ),
                                      ),
                                      Text(
                                        '₹${item.unitPrice.toStringAsFixed(2)} each',
                                        style: GoogleFonts.manrope(
                                          fontSize: 12,
                                          color: AppColors.inkTertiary,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                                Text(
                                  '₹${item.lineTotal.toStringAsFixed(2)}',
                                  style: GoogleFonts.manrope(
                                    fontSize: 15,
                                    fontWeight: FontWeight.w700,
                                    color: AppColors.inkPrimary,
                                  ),
                                ),
                                const SizedBox(width: 8),
                                GestureDetector(
                                  onTap: () => _removeItem(item),
                                  child: Container(
                                    width: 24,
                                    height: 24,
                                    decoration: BoxDecoration(
                                      color: AppColors.danger.withValues(alpha: 0.1),
                                      borderRadius: BorderRadius.circular(8),
                                    ),
                                    child: const Icon(
                                      LucideIcons.x,
                                      size: 12,
                                      color: AppColors.danger,
                                    ),
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
                      style: GoogleFonts.manrope(
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                        color: AppColors.inkPrimary,
                      ),
                    ),
                    const SizedBox(height: 12),
                    ..._payMethods.map((m) => _buildPaymentOption(m)),

                    const SizedBox(height: 16),

                    // ── Amount paid now ──────────────────────────
                    // Optional. Empty = full pay for CASH/UPI/BANK, 0 for CREDIT.
                    // < total + client present → balance to client outstanding.
                    // > total (cash) → show change due.
                    if (_selectedPayType != 'CREDIT_SALE') ...[
                      Text(
                        'Amount Received (optional)',
                        style: GoogleFonts.manrope(
                          fontSize: 14, fontWeight: FontWeight.w700,
                          color: AppColors.inkPrimary,
                        ),
                      ),
                      const SizedBox(height: 8),
                      TextField(
                        controller: _amountPaidCtrl,
                        keyboardType: const TextInputType.numberWithOptions(decimal: true),
                        onChanged: (_) => setState(() {}),
                        decoration: InputDecoration(
                          hintText: 'Leave blank if customer paid in full',
                          prefixText: '₹ ',
                          filled: true,
                          fillColor: AppColors.surfaceContainer,
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                            borderSide: BorderSide.none,
                          ),
                        ),
                      ),
                      if (_effectivePaid != null) ...[
                        const SizedBox(height: 8),
                        _buildBalanceChip(),
                      ],
                      const SizedBox(height: 16),
                    ] else ...[
                      // Credit sale: cashier may collect a part-payment now.
                      Text(
                        'Part Payment Now (optional)',
                        style: GoogleFonts.manrope(
                          fontSize: 14, fontWeight: FontWeight.w700,
                          color: AppColors.inkPrimary,
                        ),
                      ),
                      const SizedBox(height: 8),
                      TextField(
                        controller: _amountPaidCtrl,
                        keyboardType: const TextInputType.numberWithOptions(decimal: true),
                        onChanged: (_) => setState(() {}),
                        decoration: InputDecoration(
                          hintText: 'e.g. 100 — rest goes to client credit',
                          prefixText: '₹ ',
                          filled: true,
                          fillColor: AppColors.surfaceContainer,
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                            borderSide: BorderSide.none,
                          ),
                        ),
                      ),
                      if (_effectivePaid != null) ...[
                        const SizedBox(height: 8),
                        _buildBalanceChip(),
                      ],
                      const SizedBox(height: 16),
                    ],

                    const SizedBox(height: 8),

                    // ── Bill details ──────────────────────────────
                    Text(
                      'Bill Details',
                      style: GoogleFonts.manrope(
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
                          _billRow(
                              _taxMode == 'INCLUSIVE' ? 'Taxable' : 'Subtotal',
                              '₹${_subtotal.toStringAsFixed(2)}'),
                          const SizedBox(height: 10),
                          _billRow(
                              'Tax (${_avgTaxRate.toStringAsFixed(_avgTaxRate % 1 == 0 ? 0 : 1)}%${_taxMode == 'INCLUSIVE' ? ' incl' : ''})',
                              '₹${_tax.toStringAsFixed(2)}'),
                          const SizedBox(height: 14),
                          // ── Discount input (flat ₹ or %) ──────────
                          Row(
                            children: [
                              Text(
                                'Discount',
                                style: GoogleFonts.manrope(
                                  fontSize: 14,
                                  fontWeight: FontWeight.w600,
                                  color: AppColors.inkSecondary,
                                ),
                              ),
                              const Spacer(),
                              // ₹ / % toggle
                              _discountModeChip('AMOUNT', '₹'),
                              const SizedBox(width: 6),
                              _discountModeChip('PERCENT', '%'),
                              const SizedBox(width: 10),
                              SizedBox(
                                width: 76,
                                child: TextField(
                                  controller: _discountCtrl,
                                  textAlign: TextAlign.right,
                                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                                  style: GoogleFonts.manrope(
                                    fontSize: 15,
                                    fontWeight: FontWeight.w700,
                                    color: AppColors.inkPrimary,
                                  ),
                                  decoration: InputDecoration(
                                    hintText: '0',
                                    isDense: true,
                                    contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                                    enabledBorder: OutlineInputBorder(
                                      borderRadius: BorderRadius.circular(10),
                                      borderSide: const BorderSide(color: AppColors.outlineVariant),
                                    ),
                                    focusedBorder: OutlineInputBorder(
                                      borderRadius: BorderRadius.circular(10),
                                      borderSide: const BorderSide(color: AppColors.primary),
                                    ),
                                  ),
                                  onChanged: (_) => setState(() {}),
                                ),
                              ),
                            ],
                          ),
                          if (_discountAmount > 0) ...[
                            const SizedBox(height: 10),
                            _billRow('Discount', '- ₹${_discountAmount.toStringAsFixed(2)}'),
                          ],
                          const Padding(
                            padding: EdgeInsets.symmetric(vertical: 10),
                            child: Divider(color: AppColors.outlineVariant),
                          ),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Text(
                                'Grand Total',
                                style: GoogleFonts.manrope(
                                  fontSize: 16,
                                  fontWeight: FontWeight.w700,
                                  color: AppColors.inkPrimary,
                                ),
                              ),
                              Text(
                                '₹${_netTotal.toStringAsFixed(2)}',
                                style: GoogleFonts.manrope(
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
                                await widget.onComplete(_selectedPayType, _effectivePaid, _discountAmount);
                                if (mounted) setState(() => _isLoading = false);
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
                          _isLoading ? 'Processing...' : 'Complete Transaction',
                          style: GoogleFonts.manrope(
                            fontSize: 15,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppColors.secondary,
                          foregroundColor: AppColors.primaryContainer,
                          padding: const EdgeInsets.symmetric(vertical: 18),
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

  // Renders Change due (paid > total) or Balance (paid < total).
  // ₹ / % toggle chip for the discount input.
  Widget _discountModeChip(String mode, String label) {
    final active = _discountMode == mode;
    return GestureDetector(
      onTap: () => setState(() => _discountMode = mode),
      child: Container(
        width: 30,
        height: 30,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: active ? AppColors.primary : Colors.transparent,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: active ? AppColors.primary : AppColors.outlineVariant),
        ),
        child: Text(
          label,
          style: GoogleFonts.manrope(
            fontSize: 14,
            fontWeight: FontWeight.w800,
            color: active ? Colors.white : AppColors.inkSecondary,
          ),
        ),
      ),
    );
  }

  Widget _buildBalanceChip() {
    final diff = _changeOrBalance; // > 0 = change, < 0 = balance
    if (diff == 0) return const SizedBox.shrink();
    final isChange = diff > 0;
    final label = isChange ? 'Change due' : 'Balance to credit';
    final colour = isChange ? AppColors.secondary : AppColors.danger;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: colour.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: colour.withValues(alpha: 0.25)),
      ),
      child: Row(
        children: [
          Icon(isChange ? LucideIcons.coins : LucideIcons.alertCircle,
              size: 16, color: colour),
          const SizedBox(width: 8),
          Text(label, style: GoogleFonts.manrope(
              fontSize: 12, fontWeight: FontWeight.w700, color: colour)),
          const Spacer(),
          Text('₹${diff.abs().toStringAsFixed(2)}',
              style: GoogleFonts.jetBrainsMono(
                  fontSize: 14, fontWeight: FontWeight.w700, color: colour)),
        ],
      ),
    );
  }

  // Show the UPI QR immediately when the cashier taps the UPI/QR tile,
  // using the current bill total, so the customer can scan and pay
  // before the sale is completed. This is preview-only — it does not
  // create or resolve the sale. The post-Complete confirm flow in
  // _submit still runs and is what actually marks the sale PAID.
  Future<void> _showUpiPreview() async {
    try {
      final profile  = await widget.ref.read(tenantProfileProvider.future);
      final upiId    = profile?['upi_id'] as String?;
      final merchant = (profile?['businessName'] as String?) ??
                       (profile?['name'] as String?) ?? 'Merchant';
      if (!mounted) return;
      if (upiId == null || upiId.isEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('Add a UPI ID in Settings to show a payment QR.'),
        ));
        return;
      }
      await UpiQrSheet.show(
        context,
        upiId: upiId,
        merchantName: merchant,
        amount: _total,
        invoiceNo: 'PREVIEW',
        // Preview only — hide the "Payment Received" confirm button so
        // staff don't mistake this for completing the sale.
        confirmable: false,
      );
    } catch (e) {
      debugPrint('[SALE] UPI preview failed: $e');
    }
  }

  Widget _buildPaymentOption(_PayMethod m) {
    final isActive = _paymentMethod == m.key;
    return GestureDetector(
      onTap: () {
        setState(() => _paymentMethod = m.key);
        if (m.type == 'UPI') _showUpiPreview();
      },
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
              child: Icon(m.icon, size: 18, color: isActive ? AppColors.primary : AppColors.inkSecondary),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    m.label,
                    style: GoogleFonts.manrope(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      color: isActive ? AppColors.primary : AppColors.inkPrimary,
                    ),
                  ),
                  Text(
                    m.subtitle,
                    style: GoogleFonts.manrope(
                        fontSize: 12,
                        color: isActive
                            ? AppColors.primary.withValues(alpha: 0.7)
                            : AppColors.inkTertiary),
                  ),
                ],
              ),
            ),
            if (isActive)
              const Icon(LucideIcons.checkCircle2, color: AppColors.primary, size: 20),
          ],
        ),
      ),
    );
  }
}

class _PayMethod {
  final String key;     // account.id or 'CREDIT_SALE'
  final String label;   // account.name or 'Credit Sale'
  final String subtitle;
  final IconData icon;
  final String type;    // CASH | UPI | BANK | CREDIT_SALE
  const _PayMethod(this.key, this.label, this.subtitle, this.icon, this.type);
}

Widget _billRow(String label, String value) {
  return Row(
    mainAxisAlignment: MainAxisAlignment.spaceBetween,
    children: [
      Text(label,
          style: GoogleFonts.manrope(fontSize: 13, color: AppColors.inkSecondary)),
      Text(value,
          style: GoogleFonts.manrope(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: AppColors.inkPrimary)),
    ],
  );
}

// ─── Client Picker Sheet ──────────────────────────────────────────────────────

class _ClientPickerSheet extends StatefulWidget {
  final Client? selectedClient;
  final void Function(Client?) onSelected;

  const _ClientPickerSheet({
    required this.selectedClient,
    required this.onSelected,
  });

  @override
  State<_ClientPickerSheet> createState() => _ClientPickerSheetState();
}

class _ClientPickerSheetState extends State<_ClientPickerSheet> {
  final _search = TextEditingController();
  List<Client> _clients = [];
  List<Client> _filtered = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _loadClients();
    _search.addListener(() {
      final q = _search.text.toLowerCase();
      setState(() {
        _filtered = q.isEmpty
            ? _clients
            : _clients.where((c) =>
                (c.name?.toLowerCase().contains(q) ?? false) ||
                (c.phone?.contains(q) ?? false)).toList();
      });
    });
  }

  bool _loadFailed = false;

  Future<void> _loadClients() async {
    setState(() { _loading = true; _loadFailed = false; });
    try {
      // Bounded: a flaky network must not leave the picker spinning forever
      // (reported as "customer is not selecting on POS").
      final data = await supabase
          .from('clients')
          .select('id, name, phone, outstanding_balance')
          .isFilter('deleted_at', null)
          .order('name')
          .timeout(const Duration(seconds: 8));
      if (!mounted) return;
      setState(() {
        _clients = (data as List).map((d) => Client.fromJson(d as Map<String, dynamic>)).toList();
        _filtered = _clients;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() { _loading = false; _loadFailed = true; });
    }
  }

  Future<void> _openAddClient() async {
    final before = _clients.map((c) => c.id).toSet();
    await Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => const AddClientScreen()),
    );
    if (!mounted) return;
    await _loadClients();
    // Auto-select the newly created client + close picker.
    final added = _clients.where((c) => !before.contains(c.id)).toList();
    if (added.isNotEmpty) widget.onSelected(added.first);
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
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
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          'Select Client',
                          style: GoogleFonts.manrope(
                            fontSize: 20,
                            fontWeight: FontWeight.w700,
                            color: AppColors.inkPrimary,
                            letterSpacing: -0.3,
                          ),
                        ),
                      ),
                      GestureDetector(
                        onTap: _openAddClient,
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 14, vertical: 8),
                          decoration: BoxDecoration(
                            color: AppColors.primary,
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const Icon(LucideIcons.userPlus,
                                  size: 15, color: Colors.white),
                              const SizedBox(width: 6),
                              Text(
                                'New',
                                style: GoogleFonts.manrope(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w700,
                                  color: Colors.white,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Container(
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(14),
                      boxShadow: [AppColors.cardShadow],
                    ),
                    child: TextField(
                      controller: _search,
                      decoration: InputDecoration(
                        hintText: 'Search by name or phone...',
                        hintStyle: GoogleFonts.manrope(
                          fontSize: 13,
                          color: AppColors.inkTertiary,
                        ),
                        prefixIcon: const Icon(LucideIcons.search,
                            size: 16, color: AppColors.inkTertiary),
                        border: InputBorder.none,
                        contentPadding: const EdgeInsets.symmetric(vertical: 14),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            Expanded(
              child: _loading
                  ? const Center(child: CircularProgressIndicator())
                  : _loadFailed
                  ? Center(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text('Couldn\'t load clients — check connection',
                              style: GoogleFonts.manrope(fontSize: 13, color: AppColors.inkTertiary)),
                          const SizedBox(height: 10),
                          TextButton(onPressed: _loadClients, child: const Text('Retry')),
                        ],
                      ),
                    )
                  : ListView.builder(
                      controller: ctrl,
                      padding: const EdgeInsets.fromLTRB(20, 0, 20, 40),
                      itemCount: _filtered.length + 1,
                      itemBuilder: (context, index) {
                        if (index == 0) {
                          // Walk-in option
                          final isSelected = widget.selectedClient == null;
                          return GestureDetector(
                            onTap: () => widget.onSelected(null),
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
                                  Container(
                                    width: 40, height: 40,
                                    decoration: BoxDecoration(
                                      color: AppColors.surfaceContainer,
                                      shape: BoxShape.circle,
                                    ),
                                    child: const Icon(LucideIcons.userX,
                                        size: 18, color: AppColors.inkSecondary),
                                  ),
                                  const SizedBox(width: 12),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          'Walk-in Customer',
                                          style: GoogleFonts.manrope(
                                            fontWeight: FontWeight.w600,
                                            fontSize: 14,
                                            color: AppColors.inkPrimary,
                                          ),
                                        ),
                                        Text(
                                          'No credit option',
                                          style: GoogleFonts.manrope(
                                            fontSize: 11,
                                            color: AppColors.inkTertiary,
                                          ),
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
                        }

                        final client = _filtered[index - 1];
                        final isSelected = widget.selectedClient?.id == client.id;
                        final outstanding = client.outstandingBalance ?? 0;
                        final initial = (client.name?.isNotEmpty == true)
                            ? client.name![0].toUpperCase()
                            : 'C';
                        const palette = [
                          Color(0xFF2E7D32), Color(0xFF1565C0),
                          Color(0xFF6A1B9A), Color(0xFFE65100),
                        ];
                        final avatarColor =
                            palette[(client.name ?? 'C').codeUnitAt(0) % palette.length];

                        return GestureDetector(
                          onTap: () => widget.onSelected(client),
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
                                Container(
                                  width: 40, height: 40,
                                  decoration: BoxDecoration(
                                    color: avatarColor,
                                    shape: BoxShape.circle,
                                  ),
                                  child: Center(
                                    child: Text(
                                      initial,
                                      style: const TextStyle(
                                        color: Colors.white,
                                        fontWeight: FontWeight.w700,
                                        fontSize: 16,
                                      ),
                                    ),
                                  ),
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        client.name ?? 'Unknown',
                                        style: GoogleFonts.manrope(
                                          fontWeight: FontWeight.w600,
                                          fontSize: 14,
                                          color: AppColors.inkPrimary,
                                        ),
                                      ),
                                      if (client.phone != null)
                                        Text(
                                          client.phone!,
                                          style: GoogleFonts.manrope(
                                            fontSize: 11,
                                            color: AppColors.inkTertiary,
                                          ),
                                        ),
                                    ],
                                  ),
                                ),
                                if (outstanding > 0)
                                  Container(
                                    padding: const EdgeInsets.symmetric(
                                        horizontal: 8, vertical: 3),
                                    decoration: BoxDecoration(
                                      color: AppColors.danger.withValues(alpha: 0.1),
                                      borderRadius: BorderRadius.circular(8),
                                    ),
                                    child: Text(
                                      '₹${outstanding.toStringAsFixed(0)} due',
                                      style: GoogleFonts.jetBrainsMono(
                                        fontSize: 10,
                                        fontWeight: FontWeight.w700,
                                        color: AppColors.danger,
                                      ),
                                    ),
                                  ),
                                const SizedBox(width: 8),
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
            style: GoogleFonts.manrope(
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

// ── Post-sale success sheet ────────────────────────────────────────────────────

class _SaleSuccessSheet extends StatefulWidget {
  final String  saleId;
  final double  total;
  final Client? client;
  final double  outstanding;   // client's pre-sale outstanding balance
  final double  excess;        // amount already paid beyond this bill (capped at outstanding)
  final String  paymentMethod;

  const _SaleSuccessSheet({
    required this.saleId,
    required this.total,
    this.client,
    this.outstanding = 0,
    this.excess      = 0,
    this.paymentMethod = 'CASH',
  });

  static Future<void> show(
    BuildContext context, {
    required String  saleId,
    required double  total,
    Client?          client,
    double           outstanding   = 0,
    double           excess        = 0,
    String           paymentMethod = 'CASH',
  }) {
    return showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _SaleSuccessSheet(
        saleId:        saleId,
        total:         total,
        client:        client,
        outstanding:   outstanding,
        excess:        excess,
        paymentMethod: paymentMethod,
      ),
    );
  }

  @override
  State<_SaleSuccessSheet> createState() => _SaleSuccessSheetState();
}

class _SaleSuccessSheetState extends State<_SaleSuccessSheet> {
  bool _printing  = false;
  bool _sharing   = false;
  bool _collecting = false;
  // For the "collect now" sub-form (no-excess path)
  late TextEditingController _collectCtrl;
  String _collectMethod = 'CASH';

  @override
  void initState() {
    super.initState();
    _collectCtrl = TextEditingController(
      text: widget.outstanding > 0 ? widget.outstanding.toStringAsFixed(2) : '',
    );
    if (widget.paymentMethod != 'CREDIT') _collectMethod = widget.paymentMethod;
  }

  @override
  void dispose() {
    _collectCtrl.dispose();
    super.dispose();
  }

  // Web-rendered receipt first (pixel-parity with the desktop layout); if
  // that fails or times out (flaky network right after checkout is common
  // on mobile data), build the same slip locally instead of hard-failing —
  // see core/print/pos_receipt_pdf.dart, shared with invoice_detail_screen.
  Future<Uint8List> _receiptBytes() async {
    try {
      final bytes = await WebPrintService.renderReceiptPdf(widget.saleId);
      if (bytes == null || bytes.isEmpty) throw Exception('Empty PDF');
      return bytes;
    } catch (e) {
      debugPrint('[print] web render failed, fallback to local: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('Printed using standard layout (offline-friendly).'),
          backgroundColor: AppColors.secondary,
          behavior: SnackBarBehavior.floating,
          duration: Duration(seconds: 3),
        ));
      }
      final row = await supabase.from('sales').select('*').eq('id', widget.saleId).maybeSingle();
      if (row == null) rethrow;
      final sale = Sale.fromJson(row);
      final invoice = Invoice.fromSale(sale);
      final tenantId = row['tenant_id'] as String?;
      BusinessProfile? biz;
      if (tenantId != null) {
        final bizRow = await supabase
            .from('business_profile')
            .select('*')
            .eq('tenant_id', tenantId)
            .maybeSingle();
        if (bizRow != null) biz = BusinessProfile.fromJson(bizRow);
      }
      return pos_pdf.buildPosReceiptPdf(invoice, biz);
    }
  }

  Future<void> _print() async {
    setState(() => _printing = true);
    try {
      final bytes = await _receiptBytes();
      await Printing.layoutPdf(onLayout: (_) async => bytes);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Print failed: $e'), backgroundColor: AppColors.danger),
        );
      }
    } finally {
      if (mounted) setState(() => _printing = false);
    }
  }

  Future<void> _share() async {
    setState(() => _sharing = true);
    try {
      final bytes = await _receiptBytes();
      await Printing.sharePdf(
        bytes: bytes,
        filename: 'receipt_${widget.saleId}.pdf',
      );
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Share failed: $e'), backgroundColor: AppColors.danger),
        );
      }
    } finally {
      if (mounted) setState(() => _sharing = false);
    }
  }

  Future<void> _recordPayment(double amount) async {
    if (widget.client == null || amount <= 0) return;
    setState(() => _collecting = true);
    try {
      final ctx = await ProviderScope.containerOf(context).read(tenantContextProvider.future);
      if (ctx == null) return;
      final today = DateTime.now().toIso8601String().substring(0, 10);
      final paymentId = 'CP-${DateTime.now().millisecondsSinceEpoch}';
      // FIFO across unpaid CREDIT sales first.
      final unpaidSales = await supabase
          .from('sales')
          .select('id, "totalAmount", "paidAmount", "paymentStatus"')
          .eq('tenant_id', ctx.tenantId)
          .eq('shopId', widget.client!.id)
          .inFilter('"paymentStatus"', ['UNPAID', 'PARTIAL'])
          .eq('"paymentMethod"', 'CREDIT')
          .isFilter('deleted_at', null)
          .order('date', ascending: true);
      double remaining = amount;
      for (final sale in (unpaidSales as List)) {
        if (remaining <= 0) break;
        final alreadyPaid = ((sale['paidAmount'] as num?)?.toDouble() ?? 0);
        final total       = (sale['totalAmount'] as num).toDouble();
        final owed        = total - alreadyPaid;
        if (owed <= 0) continue;
        final allocating  = remaining < owed ? remaining : owed;
        final newPaid     = alreadyPaid + allocating;
        final status      = newPaid >= total ? 'PAID' : 'PARTIAL';
        await supabase.from('sales').update({'paidAmount': newPaid, 'paymentStatus': status})
            .eq('id', sale['id'] as String).eq('tenant_id', ctx.tenantId);
        await supabase.from('invoices').update({'paid_amount': newPaid, 'payment_status': status})
            .eq('id', 'INV-${sale['id']}');
        remaining -= allocating;
      }
      await supabase.from('client_payments').insert({
        'id':             paymentId,
        'client_id':      widget.client!.id,
        'tenant_id':      ctx.tenantId,
        'date':           today,
        'amount':         amount,
        'payment_method': _collectMethod,
        'notes':          null,
      });
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Payment record failed: $e'), backgroundColor: AppColors.danger),
        );
      }
    } finally {
      if (mounted) setState(() => _collecting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final hasOutstanding = widget.outstanding > 0 && widget.client != null;
    final hasExcess      = widget.excess > 0;

    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
      padding: EdgeInsets.fromLTRB(24, 20, 24, MediaQuery.of(context).viewInsets.bottom + 32),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Handle
          Container(width: 40, height: 4,
            decoration: BoxDecoration(color: Colors.black12, borderRadius: BorderRadius.circular(2))),
          const SizedBox(height: 24),
          // Success icon
          Container(
            width: 64, height: 64,
            decoration: BoxDecoration(
              color: AppColors.secondary.withValues(alpha: 0.12),
              shape: BoxShape.circle,
            ),
            child: const Icon(LucideIcons.checkCircle2, color: AppColors.secondary, size: 32),
          ),
          const SizedBox(height: 16),
          Text('Sale recorded!',
            style: GoogleFonts.manrope(fontSize: 20, fontWeight: FontWeight.w800, color: AppColors.inkPrimary)),
          const SizedBox(height: 4),
          Text('₹${widget.total.toStringAsFixed(2)}',
            style: GoogleFonts.manrope(fontSize: 28, fontWeight: FontWeight.w900, color: AppColors.inkPrimary)),
          Text(widget.saleId,
            style: GoogleFonts.manrope(fontSize: 11, color: AppColors.inkSecondary)),
          const SizedBox(height: 24),
          // Print + Share row
          Row(children: [
            Expanded(child: _ActionBtn(icon: LucideIcons.printer, label: 'Print', loading: _printing, onTap: _print)),
            const SizedBox(width: 12),
            Expanded(child: _ActionBtn(icon: LucideIcons.share2,  label: 'Share', loading: _sharing, onTap: _share)),
          ]),
          const SizedBox(height: 12),

          // ── Outstanding balance prompt ──────────────────────────────────
          if (hasOutstanding) ...[
            Container(
              margin: const EdgeInsets.only(bottom: 12),
              decoration: BoxDecoration(
                color: AppColors.canvas,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: Colors.black.withValues(alpha: 0.07)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Header
                  Padding(
                    padding: const EdgeInsets.fromLTRB(14, 12, 14, 8),
                    child: Row(
                      children: [
                        const Icon(LucideIcons.alertCircle, size: 14, color: AppColors.danger),
                        const SizedBox(width: 6),
                        Text(
                          '${widget.client!.name ?? "Client"} — ₹${widget.outstanding.toStringAsFixed(2)} outstanding',
                          style: GoogleFonts.manrope(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.inkPrimary),
                        ),
                      ],
                    ),
                  ),
                  const Divider(height: 1, thickness: 1, color: Color(0x0F000000)),

                  if (hasExcess) ...[
                    // Excess path — two action tiles
                    _OutstandingTile(
                      icon: LucideIcons.checkCircle,
                      iconColor: AppColors.secondary,
                      title: 'Apply ₹${widget.excess.toStringAsFixed(2)} to outstanding',
                      subtitle: 'Balance: ₹${widget.outstanding.toStringAsFixed(2)} → ₹${(widget.outstanding - widget.excess).toStringAsFixed(2)} · Change: ₹0',
                      loading: _collecting,
                      onTap: () async {
                        await _recordPayment(widget.excess);
                        if (mounted) Navigator.of(context).pop();
                      },
                    ),
                    const Divider(height: 1, thickness: 1, color: Color(0x0F000000)),
                    _OutstandingTile(
                      icon: LucideIcons.banknote,
                      iconColor: AppColors.inkSecondary,
                      title: 'Give ₹${widget.excess.toStringAsFixed(2)} as change',
                      subtitle: 'Outstanding stays ₹${widget.outstanding.toStringAsFixed(2)}',
                      loading: false,
                      onTap: () => Navigator.of(context).pop(),
                    ),
                  ] else ...[
                    // Collect now path — amount input + method chips
                    Padding(
                      padding: const EdgeInsets.fromLTRB(14, 10, 14, 4),
                      child: Row(
                        children: [
                          Expanded(
                            child: Container(
                              decoration: BoxDecoration(
                                color: Colors.white,
                                borderRadius: BorderRadius.circular(10),
                                border: Border.all(color: Colors.black.withValues(alpha: 0.08)),
                              ),
                              child: TextField(
                                controller: _collectCtrl,
                                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                                style: GoogleFonts.manrope(fontSize: 14, fontWeight: FontWeight.w700, color: AppColors.inkPrimary),
                                decoration: InputDecoration(
                                  border: InputBorder.none,
                                  contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
                                  prefixText: '₹ ',
                                  prefixStyle: GoogleFonts.manrope(fontSize: 14, fontWeight: FontWeight.w700, color: AppColors.primary),
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                          ...['CASH', 'UPI', 'BANK'].map((m) => Padding(
                            padding: const EdgeInsets.only(left: 4),
                            child: GestureDetector(
                              onTap: () => setState(() => _collectMethod = m),
                              child: AnimatedContainer(
                                duration: const Duration(milliseconds: 120),
                                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                                decoration: BoxDecoration(
                                  color: _collectMethod == m ? AppColors.primaryContainer : Colors.white,
                                  borderRadius: BorderRadius.circular(8),
                                  border: Border.all(color: _collectMethod == m ? AppColors.primaryContainer : Colors.black.withValues(alpha: 0.1)),
                                ),
                                child: Text(m, style: GoogleFonts.jetBrainsMono(fontSize: 9, fontWeight: FontWeight.w800, color: AppColors.inkPrimary)),
                              ),
                            ),
                          )),
                        ],
                      ),
                    ),
                    Padding(
                      padding: const EdgeInsets.fromLTRB(14, 6, 14, 12),
                      child: Row(
                        children: [
                          Expanded(
                            child: OutlinedButton(
                              onPressed: () => Navigator.of(context).pop(),
                              style: OutlinedButton.styleFrom(
                                side: const BorderSide(color: Color(0x18000000)),
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                                padding: const EdgeInsets.symmetric(vertical: 10),
                              ),
                              child: Text('Skip', style: GoogleFonts.manrope(fontSize: 13, fontWeight: FontWeight.w700, color: AppColors.inkSecondary)),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            flex: 2,
                            child: ElevatedButton(
                              onPressed: _collecting ? null : () async {
                                final amt = (double.tryParse(_collectCtrl.text) ?? 0).clamp(0.0, widget.outstanding);
                                await _recordPayment(amt);
                                if (mounted) Navigator.of(context).pop();
                              },
                              style: ElevatedButton.styleFrom(
                                backgroundColor: AppColors.primaryContainer,
                                foregroundColor: AppColors.inkPrimary,
                                elevation: 0,
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                                padding: const EdgeInsets.symmetric(vertical: 10),
                              ),
                              child: _collecting
                                  ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.inkPrimary))
                                  : Text('Collect', style: GoogleFonts.manrope(fontSize: 13, fontWeight: FontWeight.w700)),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ],

          // Done
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: () => Navigator.of(context).pop(),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.primary,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 16),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                elevation: 0,
              ),
              child: Text('Done', style: GoogleFonts.manrope(fontWeight: FontWeight.w800, fontSize: 15)),
            ),
          ),
        ],
      ),
    );
  }
}

// Tappable tile inside the outstanding prompt.
class _OutstandingTile extends StatelessWidget {
  final IconData icon;
  final Color    iconColor;
  final String   title;
  final String   subtitle;
  final bool     loading;
  final VoidCallback onTap;
  const _OutstandingTile({required this.icon, required this.iconColor, required this.title, required this.subtitle, required this.loading, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: loading ? null : onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        child: Row(
          children: [
            Icon(icon, size: 18, color: iconColor),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: GoogleFonts.manrope(fontSize: 13, fontWeight: FontWeight.w700, color: AppColors.inkPrimary)),
                  const SizedBox(height: 1),
                  Text(subtitle, style: GoogleFonts.manrope(fontSize: 11, color: AppColors.inkSecondary)),
                ],
              ),
            ),
            if (loading)
              const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.primary))
            else
              const Icon(LucideIcons.chevronRight, size: 16, color: AppColors.inkTertiary),
          ],
        ),
      ),
    );
  }
}

class _ActionBtn extends StatelessWidget {
  final IconData icon;
  final String label;
  final bool loading;
  final VoidCallback onTap;
  const _ActionBtn({required this.icon, required this.label, required this.loading, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: loading ? null : onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 14),
        decoration: BoxDecoration(
          border: Border.all(color: AppColors.outline),
          borderRadius: BorderRadius.circular(14),
          color: loading ? AppColors.surfaceContainer : Colors.white,
        ),
        child: loading
          ? const Center(child: SizedBox(width: 20, height: 20,
              child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.primary)))
          : Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(icon, size: 18, color: AppColors.inkPrimary),
                const SizedBox(width: 8),
                Text(label, style: GoogleFonts.manrope(fontWeight: FontWeight.w700,
                  fontSize: 14, color: AppColors.inkPrimary)),
              ],
            ),
      ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:mobile_app/core/utils/units.dart';
import 'package:flutter/foundation.dart' show ValueListenable;
import 'package:flutter/semantics.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:mobile_app/widgets/motion/motion_curves.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:mobile_app/core/design/bl_widgets.dart';
import 'package:mobile_app/core/utils/money.dart';
import 'package:mobile_app/features/inventory/presentation/widgets/product_photo.dart';
import 'package:mobile_app/features/inventory/presentation/providers/inventory_provider.dart';
import 'package:mobile_app/features/logistics/presentation/providers/driver_provider.dart';
import 'package:mobile_app/features/sales/presentation/providers/sales_provider.dart';
import 'package:mobile_app/features/sales/presentation/sales_view.dart' show methodLabel;
import 'package:mobile_app/core/database/database.dart' hide Client, Sale, Invoice;
import 'package:mobile_app/core/widgets/barcode_scanner_screen.dart';
import 'package:uuid/uuid.dart';
import 'package:drift/drift.dart' show OrderingTerm;
import 'package:mobile_app/features/clients_suppliers/data/models/client.dart';
import 'package:mobile_app/features/clients_suppliers/presentation/add_client_screen.dart';
import 'package:mobile_app/core/database/offline_reads.dart';
import 'package:mobile_app/core/supabase/client.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/core/widgets/upi_qr_sheet.dart';
import 'package:mobile_app/features/dashboard/presentation/providers/telemetry_provider.dart';
import 'package:mobile_app/main.dart' show syncServiceProvider, databaseProvider;
import 'package:mobile_app/features/accounts/presentation/providers/accounts_provider.dart';
import 'package:mobile_app/core/print/web_print_service.dart';
import 'package:mobile_app/core/print/pos_receipt_pdf.dart' as pos_pdf;
import 'package:mobile_app/features/invoices/data/models/invoice.dart';
import 'package:mobile_app/features/sales/data/models/sale.dart';
import 'package:mobile_app/features/settings/data/models/business_profile.dart';
import 'package:printing/printing.dart';
import 'package:mobile_app/core/database/sync_errors.dart' show describeRefusal;
import 'package:mobile_app/core/database/offline_sales_ui.dart' show OfflineSalesBanner, nudgeSync;
import 'package:mobile_app/core/auth/offline_context_cache.dart';
import 'package:mobile_app/widgets/motion/motion_sheet.dart';
import 'package:mobile_app/widgets/motion/motion_toast.dart';
import 'package:mobile_app/widgets/motion/rolling_number.dart';
import 'package:mobile_app/widgets/motion/save_button.dart';

// POS stores (non-vehicle inventory locations) for the multi-store
// store picker. Cached per session.
final posStoresProvider = FutureProvider<List<Map<String, dynamic>>>((ref) async {
  final ctx = await ref.watch(tenantContextProvider.future);
  if (ctx == null) return [];
  try {
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
  } catch (e) {
    // Without this the store picker came up empty offline, which on a
    // multi-store tenant means the cashier cannot choose where the sale happens.
    debugPrint('[posStoresProvider] online failed, using Drift cache: $e');
    final rows = await cachedInventoryLocations(ref.read(databaseProvider), ctx.tenantId);
    return rows.where((l) => (l['type'] ?? 'WAREHOUSE') != 'VEHICLE').toList();
  }
});

/// A new bill number: `SAL-` and 16 random hex digits. Made on the phone and
/// final (see _submit for why 16).
String newSaleId() =>
    'SAL-${const Uuid().v4().replaceAll('-', '').substring(0, 16).toUpperCase()}';

/// The customers cached on this phone for [tenantId], as the picker reads
/// them. No tenant known means nobody: the cache can hold other shops' rows and
/// they must never be offered.
Future<List<Map<String, dynamic>>> cachedPickerClients(
    AppDatabase db, String? tenantId) async {
  if (tenantId == null) return const [];
  final rows = await (db.select(db.clients)
        ..where((t) => t.tenantId.equals(tenantId))
        ..orderBy([(t) => OrderingTerm(expression: t.name)]))
      .get();
  return [
    for (final r in rows)
      {
        'id': r.id,
        'name': r.name,
        'phone': r.phone,
        'outstanding_balance': r.outstandingBalance,
      }
  ];
}

/// What the customer is charged before any discount, by the shop's tax_mode.
/// The checkout sheet and _submit both use this, so the figure shown is the
/// figure recorded (web InvoiceBuilder: grossTotal).
///   NONE / INCLUSIVE  the lines are the price (tax already inside, or none).
///   EXCLUSIVE         lines plus tax on top, at each product's own rate.
double saleGrossTotal(Iterable<CartItem> cart, String? taxMode) {
  final mode = (taxMode ?? 'EXCLUSIVE').toUpperCase();
  final lines = cart.fold(0.0, (s, c) => s + c.lineTotal);
  if (mode == 'NONE' || mode == 'INCLUSIVE') return lines;
  final tax = cart.fold(0.0, (s, c) => s + c.lineTotal * c.product.taxRate.toDouble() / 100);
  return lines + tax;
}

/// The amounts _submit records: gross (see [saleGrossTotal]), the discount
/// capped at it, and the net that goes to process_sale as p_total_amount.
({double gross, double discount, double net}) saleTotals(
    Iterable<CartItem> cart, String? taxMode, double discount) {
  final gross = saleGrossTotal(cart, taxMode);
  final d = discount.clamp(0, gross).toDouble();
  return (gross: gross, discount: d, net: (gross - d).clamp(0, double.infinity).toDouble());
}

// ─── Cart model ───────────────────────────────────────────────────────────────

class CartItem {
  final Product product;
  /// double, not int: loose goods sell by weight (0.25 KG). Whether fractions
  /// are actually accepted is decided per product by allowsFraction(unit).
  double quantity;
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
    // Opening the till is a good moment to push anything still owed.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) nudgeSync(ref);
    });
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
  void _setCartItem(Product p, double qty, double price) {
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
        // stock.toInt() truncated 0.75 KG to 0 and made the item unsellable.
        final step = qtyStepButton(p.unit);
        final next = clampQty(_cart[i].quantity + step, p.unit);
        if (!exceedsStock(next, p.stock)) _cart[i].quantity = next;
      } else {
        if (p.stock > 0) {
          _cart.add(CartItem(product: p, quantity: clampQty(qtyStepButton(p.unit), p.unit)));
        }
      }
    });
  }

  /// Quick -1 from card.
  void _removeFromCart(Product p) {
    setState(() {
      final i = _cart.indexWhere((c) => c.product.id == p.id);
      if (i != -1) {
        final step = qtyStepButton(_cart[i].product.unit);
        final next = clampQty(_cart[i].quantity - step, _cart[i].product.unit);
        if (next > 0) {
          _cart[i].quantity = next;
        } else {
          _cart.removeAt(i);
        }
      }
    });
  }

  void _deleteFromCart(Product p) {
    setState(() => _cart.removeWhere((c) => c.product.id == p.id));
  }

  double _cartQty(Product p) {
    final i = _cart.indexWhere((c) => c.product.id == p.id);
    return i != -1 ? _cart[i].quantity : 0;
  }

  double get _subtotal => _cart.fold(0, (s, c) => s + c.lineTotal);

  // ── Product detail sheet ──────────────────────────────────────────────────

  void _showProductDetail(Product p) {
    final currentItem = _cart.where((c) => c.product.id == p.id).firstOrNull;
    showBlSheet(
      context: context,
      builder: (_) => _ProductDetailSheet(
        product: p,
        // A product bought by weight and sold in packets opens at ONE PACKET.
        // Without this a new line started at one whole base unit — a kilo, or
        // four 250 g packets — and the cashier had to correct it every time.
        // Editing an existing line keeps whatever it already holds.
        initialQty: currentItem?.quantity
            ?? (((p.secondaryUnit ?? '').isNotEmpty && (p.conversionFactor ?? 0) > 0)
                ? p.conversionFactor!
                : qtyStepButton(p.unit)),
        initialPrice: currentItem?.unitPrice ?? p.sellingPrice,
        onConfirm: (qty, price) => _setCartItem(p, qty, price),
        isOwner: ref.read(tenantContextProvider).valueOrNull?.isOwner ?? false,
      ),
    );
  }

  // ── Barcode scan ─────────────────────────────────────────────────────────────

  void _scanBarcode() async {
    final result = await Navigator.push<String>(
      context,
      MaterialPageRoute(builder: (_) => const BarcodeScannerScreen()),
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

  /// Asks the cashier whether a UPI payment arrived when no QR sheet could
  /// be shown. The bill is voided only on an explicit "Not received".
  Future<bool?> _askUpiReceived(String why) {
    return showBlDialog<bool>(
      context: context,
      dismissible: false,
      title: 'Did the UPI payment arrive?',
      message: '$why\n\nNot received will void this bill and return the stock.',
      actions: (dCtx) => [
        Row(
          children: [
            Expanded(
              child: BlButton('Not received',
                  kind: BlButtonKind.danger,
                  onTap: () => Navigator.pop(dCtx, false)),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: BlButton('Payment received',
                  fontSize: 13.5, onTap: () => Navigator.pop(dCtx, true)),
            ),
          ],
        ),
      ],
    );
  }

  // ── Checkout sheet ────────────────────────────────────────────────────────────

  void _openCheckout() {
    showBlSheet(
      context: context,
      builder: (_) => _CheckoutSheet(
        cart: _cart,
        subtotal: _subtotal,
        selectedClient: _selectedClient,
        saveState: _saveState,
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
    // A dialog on the root navigator, so it shows above any open sheet.
    showBlDialog<void>(
      context: context,
      title: 'Sale failed',
      message: msg,
      actions: (ctx) => [
        BlButton('OK',
            kind: BlButtonKind.soft, onTap: () => Navigator.of(ctx).pop()),
      ],
    );
  }

  /// A write that follows a recorded sale. It is not the sale, so its failure
  /// must not report "Sale failed" -- but it is not swallowed either: a
  /// refusal is shown with its reason.
  Future<void> _followUp(Future<bool> Function() write, String what) async {
    try {
      await write();
    } catch (e) {
      debugPrint('[SALE] follow-up "$what" refused: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text('Sale saved, but could not $what: ${describeRefusal(e.toString()).reason}'),
          backgroundColor: AppColors.danger,
          duration: const Duration(seconds: 6),
        ));
      }
    }
  }

  // Item 2: the checkout Save button mirrors this REAL state.
  final ValueNotifier<(SaveStatus, String?)> _saveState =
      ValueNotifier((SaveStatus.idle, null));
  bool _lastOk = false;
  String? _lastErr;

  Future<void> _submit(String paymentMethod, double? paidAmountOverride, [double discount = 0]) async {
    _lastOk = false;
    _lastErr = null;
    _saveState.value = (SaveStatus.saving, null);
    await _submitInner(paymentMethod, paidAmountOverride, discount);
    if (!mounted) return;
    if (_lastOk) {
      HapticFeedback.lightImpact();
      _saveState.value = (SaveStatus.saved, null);
      final reduce = MediaQuery.maybeDisableAnimationsOf(context) == true;
      await Future<void>.delayed(Duration(milliseconds: reduce ? 0 : 700));
      if (!mounted) return;
      Navigator.of(context, rootNavigator: true).popUntil((r) => r.isFirst);
      _saveState.value = (SaveStatus.idle, null);
    } else {
      _saveState.value = (SaveStatus.error, _lastErr ?? 'Not saved');
      await Future<void>.delayed(const Duration(milliseconds: 1800));
      if (mounted) _saveState.value = (SaveStatus.idle, null);
    }
  }

  Future<void> _submitInner(String paymentMethod, double? paidAmountOverride, [double discount = 0]) async {
    if (_cart.isEmpty) {
      _showError('Cart is empty');
      return;
    }
    try {
      // Bill total net of any discount — this is what's charged / owed / receipted.
      // The same total the checkout sheet showed: tax on top for EXCLUSIVE
      // shops, with the discount taken off that total (as checkout and web do).
      final taxMode = (ref.read(tenantProfileProvider).valueOrNull?['tax_mode'] as String?);
      final totals = saleTotals(_cart, taxMode, discount);
      final discountAmt = totals.discount;
      final netTotal = totals.net;
      // The bill number is made here, on the phone, and it is final: the
      // server keeps the id it is given (and a GST invoice for a credit bill
      // takes its own number server-side). Sixteen hex digits, not eight:
      // with phones billing offline there is no server to catch a clash, and
      // process_sale's replay guard treats "this id already exists" as "this
      // sale already landed" -- so two devices drawing the same id would
      // silently drop the second sale. 64 random bits put that out of reach:
      // by the birthday bound (n^2 / 2^65) a million bills in one tenant
      // collide with odds of about 1 in 36 million.
      final saleId = newSaleId();

      // Items format mirrors web: { id, quantity, name, rate, taxRate }
      // taxRate snapshot at sale-time so invoice GST stays correct even
      // if the product master is edited later.
      final payloadItems = _cart.map((c) {
        final m = <String, dynamic>{
          'id':       c.product.id,
          'quantity': c.quantity,
          'name':     c.product.name,
          'rate':     c.unitPrice,
          'taxRate':  c.product.taxRate,
          'cess':     c.product.cessRate,
          'hsn':      c.product.hsnCode,
        };
        // Snapshot the packet view, exactly as the web does. quantity and rate
        // stay in the BASE unit so stock, COGS and the money are untouched —
        // these three fields exist only so a receipt can say "2 PACK @ Rs 30"
        // instead of "0.5 KG @ Rs 120", which is what the customer was handed.
        final conv = c.product.conversionFactor ?? 0;
        final sec = c.product.secondaryUnit ?? '';
        if (sec.isNotEmpty && conv > 0) {
          m['sellUnitName']  = sec;
          m['sellQty']       = double.parse((c.quantity / conv).toStringAsFixed(3));
          m['sellUnitPrice'] = double.parse((c.unitPrice * conv).toStringAsFixed(2));
        }
        return m;
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

      debugPrint('[SALE] calling process_sale id=$saleId user=$userId tenant=$tenantId items=${payloadItems.length} total=$netTotal');

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

      // Offline-first: try direct RPC; on a transport failure (or while older
      // jobs are still owed) queue the SAME call with the same p_id. A
      // timeout may already have committed -- the replay guard makes the
      // resend a no-op -- so a queued sale is "saved on this phone", never
      // "not saved". A server refusal is thrown and shown below.
      final sync = ref.read(syncServiceProvider);
      final queued = await sync.rpcOnlineOrQueue('process_sale', rpcParams);
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
            // No QR can be shown, but the customer may still have paid by
            // UPI. Ask, rather than treating silence as "not received" and
            // voiding a bill the screen then reports as recorded.
            upiConfirmed = await _askUpiReceived(
                'This shop has no UPI ID yet, so no QR could be shown. '
                'Add one in Settings.');
          }
        } catch (e) {
          debugPrint('[SALE] UPI sheet failed: $e');
          if (mounted) {
            upiConfirmed = await _askUpiReceived(
                'The payment QR could not be shown.');
          }
        }
      }

      // Resolve the PENDING UPI sale.
      //   Received → PAID, paidAmount = total.
      //   Not received → the sale must not count.
      // When the sale is still sitting in the outbox unsent, the cleanest
      // fix is to edit that job before it goes: mark it PAID, or withdraw it
      // so it is never sent at all. If the worker already took it, the
      // follow-up goes through the outbox behind it (FIFO), so it can never
      // reach the server before the sale it changes. Both follow-ups are
      // safe to replay: an absolute column write, and void_sale returns
      // early on a sale already voided.
      bool upiVoided = false;
      if (paymentMethod == 'UPI') {
        final job = queued ? await sync.findPendingRpc('process_sale', saleId) : null;
        if (upiConfirmed == true) {
          final amended = job != null &&
              await sync.amendPendingJob(job.id, {
                'p_payment_status': 'PAID',
                'p_paid_amount': netTotal,
              });
          if (!amended) {
            await _followUp(() => sync.updateOnlineOrQueue('sales', saleId, {
                  'paymentStatus': 'PAID',
                  'paidAmount': netTotal,
                }), 'mark UPI bill paid');
          }
        } else {
          upiVoided = true;
          final withdrawn = job != null &&
              await sync.withdrawPendingJob(job.id, 'UPI payment not received');
          if (!withdrawn) {
            await _followUp(() => sync.rpcOnlineOrQueue('void_sale', {
                  'p_id': saleId,
                  'p_reason': 'UPI payment not received',
                  'p_user_id': userId,
                }), 'void the unpaid UPI bill');
          }
        }
      }

      // Persist the real amount the customer handed over (may exceed the bill
      // → change, or applied to previous dues). p_paid_amount is capped at the
      // bill by the RPC, so this keeps the true tender for the receipt. Credit
      // tenders nothing at the till; UPI only once confirmed; anything else is
      // paid in full. Queued behind the sale when offline (it used to be
      // dropped), so it lands after the row it updates.
      if (!upiVoided) {
        final tendered = paidAmountOverride ??
            (paymentMethod == 'CREDIT_SALE' ||
                    (paymentMethod == 'UPI' && upiConfirmed != true)
                ? 0.0
                : netTotal);
        await _followUp(() => sync.updateOnlineOrQueue(
            'sales', saleId, {'amount_received': tendered}), 'save the amount received');
      }

      if (!mounted) return;
      final tendered    = paidAmountOverride ?? netTotal;
      final excessAmt   = (tendered - netTotal).clamp(0.0, double.infinity);
      final outstanding = (_selectedClient?.outstandingBalance ?? 0.0);
      await _SaleSuccessSheet.show(
        context,
        queued:        queued,
        localSale: {
          'id': saleId,
          'tenant_id': tenantId,
          'shopId': _selectedClient?.id,
          if (_selectedClient != null) 'customerInfo': {'name': _selectedClient!.name},
          'paymentMethod': pm,
          'paymentStatus': paymentMethod == 'UPI' && upiConfirmed == true ? 'PAID' : ps,
          'totalAmount': netTotal,
          'discount': discountAmt,
          'paidAmount': paymentMethod == 'CREDIT_SALE'
              ? (paidAmt ?? 0.0).clamp(0.0, netTotal)
              : (paymentMethod == 'UPI' && upiConfirmed != true ? 0.0 : netTotal),
          'amount_received': paidAmountOverride,
          'date': dateStr,
          'items': payloadItems,
          'created_at': now.toUtc().toIso8601String(),
        },
        saleId:        saleId,
        total:         netTotal,
        client:        _selectedClient,
        // Not capped at the outstanding any more: anything beyond the dues is
        // a valid ADVANCE (the DB records it as a negative balance and the
        // next credit sale consumes it automatically). Clamping here silently
        // refused the extra cash at the counter.
        excess:        excessAmt > 0 ? excessAmt : 0,
        outstanding:   outstanding,
        paymentMethod: paymentMethod,
      );
      if (!mounted) return;
      _lastOk = true;
    } catch (e, stack) {
      debugPrint('[SALE] FAILED: $e\n$stack');
      // Only a server refusal reaches here (transport failures are queued).
      // Say which rule refused it, in words, as the web till does.
      final info = describeRefusal(e.toString());
      _lastErr = info.title;
      _showError('${info.title}: ${info.reason}');
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
      backgroundColor: Bl.white,
      body: productsAsync.when(
        loading: () => const Center(
            child: CircularProgressIndicator(color: Bl.amber, strokeWidth: 2)),
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

          final storeName = stores.length > 1
              ? (stores.firstWhere((s) => s['id'] == _posStoreId,
                          orElse: () => stores.first)['name'] ??
                      'Store')
                  .toString()
              : null;
          final register = widget.isVanSale ? 'Roadside POS' : 'Register 01';
          final count = _cart.length;

          return SafeArea(
            child: Column(
              children: [
                // ── Header: back, title, who the sale is for ───────────
                Padding(
                  padding: const EdgeInsets.fromLTRB(7, 1, 14, 0),
                  child: Row(
                    children: [
                      BlRoundButton(BlIcons.back,
                          label: 'Back', onTap: () => Navigator.pop(context)),
                      const SizedBox(width: 3),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(widget.isVanSale ? 'Van sale' : 'New sale',
                                style: Bl.tight(15.5, w: FontWeight.w600)),
                            if (storeName != null)
                              PopupMenuButton<String>(
                                popUpAnimationStyle: menuAnimationStyle(context),
                                initialValue: _posStoreId,
                                color: Bl.white,
                                shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(16)),
                                onSelected: (v) =>
                                    setState(() => _posStoreId = v),
                                itemBuilder: (_) => [
                                  for (final s in stores)
                                    PopupMenuItem(
                                        value: s['id'] as String,
                                        child: Text(s['name'] ?? 'Store',
                                            style: Bl.tight(14,
                                                w: FontWeight.w500))),
                                ],
                                child: Padding(
                                  padding:
                                      const EdgeInsets.symmetric(vertical: 2),
                                  child: Text('$storeName ▾ · $register',
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: Bl.inter(11,
                                          w: FontWeight.w500,
                                          c: const Color(0xFF616161))),
                                ),
                              )
                            else
                              Text(register,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: Bl.inter(11,
                                      w: FontWeight.w500,
                                      c: const Color(0xFF616161))),
                          ],
                        ),
                      ),
                      const SizedBox(width: 8),
                      BlTap(
                        label:
                            'Customer: ${_selectedClient?.name ?? 'Walk-in'}. Change',
                        onTap: _showClientPicker,
                        child: Padding(
                          padding: const EdgeInsets.symmetric(vertical: 6),
                          child: Container(
                            height: 32,
                            constraints: const BoxConstraints(maxWidth: 150),
                            padding: const EdgeInsets.symmetric(horizontal: 14),
                            decoration: BoxDecoration(
                                color: Bl.well,
                                borderRadius: BorderRadius.circular(999)),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                const BlIcon(BlIcons.person, size: 16),
                                const SizedBox(width: 6),
                                Flexible(
                                  child: Text(
                                    _selectedClient == null
                                        ? 'Walk-in'
                                        : (_selectedClient!.name ?? 'Client'),
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: Bl.tight(12.5,
                                        w: FontWeight.w600, ls: 0),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                const OfflineSalesBanner(
                  padding: EdgeInsets.fromLTRB(14, 8, 14, 0),
                ),

                // ── Search, with the scanner on the right ───────────────
                Container(
                  height: 44,
                  margin: const EdgeInsets.fromLTRB(14, 4, 14, 0),
                  padding: const EdgeInsets.only(left: 14, right: 5),
                  decoration: BoxDecoration(
                      color: Bl.well, borderRadius: BorderRadius.circular(999)),
                  child: Row(
                    children: [
                      const BlIcon(BlIcons.search, size: 20, color: Bl.mute),
                      const SizedBox(width: 10),
                      Expanded(
                        child: TextField(
                          controller: _searchController,
                          cursorColor: Bl.brand,
                          textInputAction: TextInputAction.search,
                          style: Bl.inter(14, w: FontWeight.w500, c: Bl.ink),
                          decoration: InputDecoration(
                            isCollapsed: true,
                            filled: false,
                            border: InputBorder.none,
                            enabledBorder: InputBorder.none,
                            focusedBorder: InputBorder.none,
                            hintText: 'Search items or scan barcode',
                            hintStyle: Bl.inter(14,
                                w: FontWeight.w500, c: Bl.mute),
                          ),
                        ),
                      ),
                      BlTap(
                        label: 'Scan barcode',
                        onTap: _scanBarcode,
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

                // ── Categories ──────────────────────────────────────────
                SizedBox(
                  height: 56,
                  child: ListView.separated(
                    scrollDirection: Axis.horizontal,
                    padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
                    itemCount: categories.length,
                    separatorBuilder: (_, _) => const SizedBox(width: 6),
                    itemBuilder: (_, i) {
                      final cat = categories[i];
                      final isAll = cat == 'All';
                      final on = isAll
                          ? _selectedCategory == null
                          : _selectedCategory == cat;
                      return Semantics(
                        button: true,
                        selected: on,
                        label: cat,
                        excludeSemantics: true,
                        child: BlTap(
                          onTap: () => setState(
                              () => _selectedCategory = isAll ? null : cat),
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 14),
                            alignment: Alignment.center,
                            decoration: BoxDecoration(
                              color: on ? Bl.ink : Colors.transparent,
                              borderRadius: BorderRadius.circular(999),
                              border: Border.all(
                                  color:
                                      on ? Bl.ink : const Color(0xFFD9D6D1)),
                            ),
                            child: Text(cat,
                                style: Bl.tight(12.5,
                                    w: FontWeight.w600,
                                    ls: 0,
                                    c: on
                                        ? Bl.white
                                        : const Color(0xFF55595F))),
                          ),
                        ),
                      );
                    },
                  ),
                ),

                // ── Products, two to a row ──────────────────────────────
                Expanded(
                  child: filtered.isEmpty
                      ? const BlEmpty(
                          icon: BlIcons.box, title: 'No products found.')
                      : GridView.builder(
                          padding: const EdgeInsets.fromLTRB(14, 0, 14, 14),
                          itemCount: filtered.length,
                          gridDelegate:
                              const SliverGridDelegateWithFixedCrossAxisCount(
                            crossAxisCount: 2,
                            crossAxisSpacing: 8,
                            mainAxisSpacing: 8,
                            mainAxisExtent: 160,
                          ),
                          itemBuilder: (_, i) => _ProductCard(
                            product: filtered[i],
                            qty: _cartQty(filtered[i]),
                            onTap: () => _showProductDetail(filtered[i]),
                            onAdd: () => _addToCart(filtered[i]),
                            onRemove: () => _removeFromCart(filtered[i]),
                          ),
                        ),
                ),

                // ── Checkout bar ────────────────────────────────────────
                if (_cart.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(14, 8, 14, 14),
                    child: BlTap(
                      label:
                          'Checkout, $count item${count == 1 ? '' : 's'}, ${Money.inr(_subtotal)}',
                      onTap: _openCheckout,
                      child: Container(
                        height: 52,
                        padding: const EdgeInsets.only(left: 18, right: 6),
                        decoration: BoxDecoration(
                            color: Bl.amber,
                            borderRadius: BorderRadius.circular(999)),
                        child: Row(
                          children: [
                            Container(
                              constraints: const BoxConstraints(minWidth: 24),
                              height: 24,
                              padding:
                                  const EdgeInsets.symmetric(horizontal: 6),
                              alignment: Alignment.center,
                              decoration: BoxDecoration(
                                  color: const Color(0x40FFFFFF),
                                  borderRadius: BorderRadius.circular(999)),
                              child: Text('$count',
                                  style: Bl.tight(12.5,
                                      w: FontWeight.w600, ls: 0, c: Bl.white)),
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Text('Checkout',
                                  style: Bl.tight(15,
                                      w: FontWeight.w600, c: Bl.white)),
                            ),
                            Container(
                              height: 40,
                              padding:
                                  const EdgeInsets.symmetric(horizontal: 14),
                              decoration: BoxDecoration(
                                  color: Bl.ink,
                                  borderRadius: BorderRadius.circular(999)),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Text(Money.inr(_subtotal),
                                      style: Bl.tight(15,
                                          w: FontWeight.w700, c: Bl.white)),
                                  const SizedBox(width: 6),
                                  const BlIcon(BlIcons.arrowRight,
                                      size: 16, color: Bl.white),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          );
        },
      ),
    );
  }

  void _showClientPicker() {
    showBlSheet(
      context: context,
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
  final double qty;
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

  // Soft tints for the initials tile; the same product always gets the same.
  static const _tints = [
    Color(0xFFFFF1DE),
    Color(0xFFE8EFFD),
    Color(0xFFF1F1F1),
    Color(0xFFE6F6EC),
    Color(0xFFFDECEC),
  ];

  Widget _badge(String text, Color bg, Color fg) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
        decoration:
            BoxDecoration(color: bg, borderRadius: BorderRadius.circular(999)),
        child: Text(text, style: Bl.inter(10, w: FontWeight.w700, c: fg)),
      );

  Widget _step(String icon, String label, VoidCallback onTap) => BlTap(
        label: label,
        onTap: onTap,
        child: SizedBox(
          width: 30,
          height: 30,
          child: Center(
            child: Container(
              width: 22,
              height: 22,
              alignment: Alignment.center,
              decoration: const BoxDecoration(
                  color: Color(0x29FFFFFF), shape: BoxShape.circle),
              child: BlIcon(icon, size: 12, color: Bl.white, stroke: 2.6),
            ),
          ),
        ),
      );

  @override
  Widget build(BuildContext context) {
    final isLow = product.stock > 0 && product.stock <= 10;
    final isOut = product.stock <= 0;
    final inCart = qty > 0;
    final tint = _tints[product.name.hashCode.abs() % _tints.length];

    return Opacity(
      opacity: isOut ? 0.55 : 1,
      child: BlTap(
        onTap: isOut ? null : onTap,
        child: Container(
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
                color: inCart ? Bl.ink : const Color(0xFFECEAE7)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  ProductPicture(
                      name: product.name,
                      image: product.image,
                      size: 38,
                      fontSize: 12,
                      ground: isOut ? Bl.well : tint,
                      ink: const Color(0xFF55595F)),
                  const Spacer(),
                  if (isOut)
                    _badge('Out', const Color(0xFFFEE2E2), Bl.redDeep)
                  else if (isLow)
                    _badge('Low', const Color(0xFFFFE48A),
                        const Color(0xFF4F3B00)),
                ],
              ),
              const SizedBox(height: 8),
              Text(product.name,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: Bl.tight(13.5, w: FontWeight.w600, h: 1.25)),
              const SizedBox(height: 2),
              Text(
                  '${product.stock.toStringAsFixed(product.stock % 1 == 0 ? 0 : 1)} in stock',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Bl.inter(11.5, c: const Color(0xFF7A8088))),
              const Spacer(),
              Row(
                children: [
                  Expanded(
                    child: Text(Money.inr(product.sellingPrice),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Bl.tight(16, w: FontWeight.w700)),
                  ),
                  if (isOut)
                    Text('No stock',
                        style: Bl.inter(11.5,
                            w: FontWeight.w600, c: const Color(0xFF9AA0A6)))
                  else if (!inCart)
                    BlTap(
                      label: 'Add ${product.name}',
                      onTap: onTap,
                      child: Container(
                        width: 30,
                        height: 30,
                        alignment: Alignment.center,
                        decoration: const BoxDecoration(
                            color: Bl.amber, shape: BoxShape.circle),
                        child: const BlIcon(BlIcons.plus,
                            size: 16, color: Bl.white),
                      ),
                    )
                  else
                    Container(
                      height: 30,
                      decoration: BoxDecoration(
                          color: Bl.ink,
                          borderRadius: BorderRadius.circular(999)),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          _step(BlIcons.minus, 'One less', onRemove),
                          Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 2),
                            child: Text(formatQty(qty, product.unit),
                                style: Bl.tight(13,
                                    w: FontWeight.w600, ls: 0, c: Bl.white)),
                          ),
                          _step(BlIcons.plus, 'One more', onAdd),
                        ],
                      ),
                    ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ─── Product Detail Sheet ─────────────────────────────────────────────────────

class _ProductDetailSheet extends StatefulWidget {
  final Product product;
  final double initialQty;
  final double initialPrice;
  final void Function(double qty, double price) onConfirm;
  // Owner may override a below-cost sale; staff are blocked.
  final bool isOwner;

  const _ProductDetailSheet({
    required this.product,
    required this.initialQty,
    required this.initialPrice,
    required this.onConfirm,
    required this.isOwner,
  });

  @override
  State<_ProductDetailSheet> createState() => _ProductDetailSheetState();
}

class _ProductDetailSheetState extends State<_ProductDetailSheet> {
  late double _qty;
  late TextEditingController _priceController;
  late TextEditingController _qtyController;
  double _price = 0;

  // Sell by the alternate unit (e.g. packet). _qty and _price stay in the BASE
  // unit throughout — only the fields display and accept the packet view, so
  // stock, cost and the below-cost guard never see packets. conv = base units
  // per one alt unit (e.g. 0.25 KG per packet).
  // Defaults ON for a product that has an alternate unit: if it is sold in
  // packets, the packet view is the one the cashier wants first. Set in
  // initState because it depends on the widget.
  bool _alt = false;
  double get _conv => widget.product.conversionFactor ?? 0;
  bool get _hasAlt => (widget.product.secondaryUnit ?? '').isNotEmpty && _conv > 0;
  String get _dispUnit => _alt ? widget.product.secondaryUnit! : (widget.product.unit ?? 'pcs');
  double get _dispQty => _alt ? _qty / _conv : _qty;
  double get _dispPrice => _alt ? _price * _conv : _price;

  @override
  void initState() {
    super.initState();
    _qty = widget.initialQty;
    _price = widget.initialPrice;
    _alt = _hasAlt;
    _priceController = TextEditingController(text: _dispPrice.toStringAsFixed(2));
    _priceController.addListener(() {
      final v = double.tryParse(_priceController.text);
      if (v == null) return;
      // Typed value is per display unit; a per-packet price ÷ conv is the base
      // price we store.
      setState(() => _price = _alt ? v / _conv : v);
    });
    // Seed the field in whatever unit it is about to display. Seeding it with
    // the base value showed "0.25" on a line that reads in packets.
    _qtyController = TextEditingController(
      text: _alt ? _dispQty.toStringAsFixed(3) : formatQty(_qty, widget.product.unit));
    _qtyController.addListener(() {
      // double, not int: typing 0.25 used to be ignored outright, so the field
      // showed a decimal while the cart silently kept the old whole number.
      final v = double.tryParse(_qtyController.text);
      if (v == null || v <= 0) return;
      // Typed value is in the display unit; packets × conv is the base qty.
      final base = _alt ? v * _conv : v;
      if (!exceedsStock(base, _maxStock)) {
        setState(() => _qty = clampQty(base, widget.product.unit));
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

  /// Selling under what the stock cost. The web POS already blocks this at
  /// checkout; mobile had no equivalent, so loss-making lines went straight
  /// through (RUBBER BAND at ₹60 against a ₹270 cost).
  double get _cost => widget.product.costPrice;
  bool get _belowCost => _cost > 0 && _price > 0 && _price <= _cost;
  // Was stock.toInt(), which truncated 0.75 KG of stock to 0.
  double get _maxStock => widget.product.stock.toDouble();

  // One step = one whole alt unit (a packet = conv base) when selling by packet,
  // else the product's normal step.
  double get _step => _alt ? _conv : qtyStepButton(widget.product.unit);
  void _syncQtyField() =>
      _qtyController.text = _alt ? _dispQty.toStringAsFixed(3) : formatQty(_qty, widget.product.unit);

  void _increment() {
    final next = clampQty(_qty + _step, widget.product.unit);
    if (!exceedsStock(next, _maxStock)) {
      setState(() => _qty = next);
      _syncQtyField();
    }
  }

  void _decrement() {
    final next = clampQty(_qty - _step, widget.product.unit);
    if (next > 0) {
      setState(() => _qty = next);
      _syncQtyField();
    }
  }

  // Flip between base and packet entry, reformatting both fields to the new unit.
  void _toggleAlt() {
    setState(() => _alt = !_alt);
    _syncQtyField();
    _priceController.text = _dispPrice.toStringAsFixed(2);
  }

  Future<void> _confirm() async {
    if (_belowCost) {
      final owner = widget.isOwner;
      final proceed = await showBlDialog<bool>(
        context: context,
        title: owner ? 'Selling at or below cost' : 'Blocked: at or below cost',
        message: owner
            ? 'This price is at or below what you paid for the item. '
                'It cost ₹${_cost.toStringAsFixed(2)}; you are charging ₹${_price.toStringAsFixed(2)}.'
            : '${widget.product.name} cost ₹${_cost.toStringAsFixed(2)} but the price is ₹${_price.toStringAsFixed(2)}. '
                'Only the owner can sell at or below cost.',
        actions: (dCtx) => [
          if (owner)
            Row(
              children: [
                Expanded(
                  child: BlButton('Change price',
                      kind: BlButtonKind.soft,
                      onTap: () => Navigator.pop(dCtx, false)),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: BlButton('Sell anyway',
                      onTap: () => Navigator.pop(dCtx, true)),
                ),
              ],
            )
          else
            BlButton('Change price',
                kind: BlButtonKind.soft,
                onTap: () => Navigator.pop(dCtx, false)),
        ],
      );
      if (proceed != true) return;
    }
    if (!mounted) return;
    widget.onConfirm(_qty, _price);
    Navigator.pop(context);
  }

  Widget _round(String icon, String label, bool enabled, bool primary,
          VoidCallback onTap) =>
      BlTap(
        label: label,
        onTap: onTap,
        child: Container(
          width: 46,
          height: 46,
          alignment: Alignment.center,
          decoration: BoxDecoration(
              color: primary && enabled ? Bl.amber : Bl.well,
              shape: BoxShape.circle),
          child: BlIcon(icon,
              size: 20,
              stroke: 2.4,
              color: !enabled
                  ? Bl.faint
                  : primary
                      ? Bl.white
                      : Bl.ink),
        ),
      );

  Widget _box(String label, Widget value) => Expanded(
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
          decoration: BoxDecoration(
              color: const Color(0xFFF3F2F0),
              borderRadius: BorderRadius.circular(12)),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, style: Bl.inter(10, w: FontWeight.w500, c: Bl.mute)),
              const SizedBox(height: 1),
              value,
            ],
          ),
        ),
      );

  @override
  Widget build(BuildContext context) {
    final p = widget.product;
    final isLow = p.stock > 0 && p.stock <= 10;
    final frac = allowsFraction(p.unit);
    final stockText = p.stock.toStringAsFixed(p.stock % 1 == 0 ? 0 : 1);
    final sub = !_alt ? subQtyLabel(_qty, p.unit) : null;

    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        BlSheetTitle(p.name, size: 16, divider: true),
        const SizedBox(height: 10),
        Row(
          children: [
            Expanded(
              child: Text(p.sku == null ? '' : 'SKU: ${p.sku}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Bl.inter(12.5, c: const Color(0xFF7A8088))),
            ),
            BlPill(isLow ? 'Low · $stockText' : 'In Stock · $stockText',
                tone: isLow ? BlPillTone.warn : BlPillTone.good),
          ],
        ),
        const SizedBox(height: 18),
        Text('Adjust quantity',
            textAlign: TextAlign.center,
            style: Bl.inter(12, w: FontWeight.w500, c: Bl.mute)),
        const SizedBox(height: 10),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            _round(BlIcons.minus, 'Less', _qty > qtyMin(p.unit), false,
                _decrement),
            const SizedBox(width: 18),
            SizedBox(
              width: frac ? 132 : 96,
              child: TextField(
                controller: _qtyController,
                keyboardType: frac
                    ? const TextInputType.numberWithOptions(decimal: true)
                    : TextInputType.number,
                textAlign: TextAlign.center,
                cursorColor: Bl.brand,
                inputFormatters: [
                  if (frac)
                    FilteringTextInputFormatter.allow(
                        RegExp(r'^\d*\.?\d{0,3}'))
                  else
                    FilteringTextInputFormatter.digitsOnly,
                ],
                style: Bl.tight(44, w: FontWeight.w700, ls: -0.04, h: 1.1),
                decoration: const InputDecoration(
                  border: InputBorder.none,
                  enabledBorder: InputBorder.none,
                  focusedBorder: InputBorder.none,
                  filled: false,
                  contentPadding: EdgeInsets.zero,
                  isDense: true,
                ),
                onTap: () => _qtyController.selection = TextSelection(
                  baseOffset: 0,
                  extentOffset: _qtyController.text.length,
                ),
              ),
            ),
            const SizedBox(width: 18),
            _round(BlIcons.plus, 'More', _qty < _maxStock, true, _increment),
          ],
        ),
        if (_dispUnit.trim().isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text(sub == null ? _dispUnit.trim() : '${_dispUnit.trim()} · $sub',
                textAlign: TextAlign.center,
                style: Bl.inter(12, w: FontWeight.w500, c: Bl.mute)),
          ),
        if (_hasAlt)
          Center(
            child: BlTap(
              onTap: _toggleAlt,
              child: Container(
                margin: const EdgeInsets.only(top: 8),
                padding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: BoxDecoration(
                  color: _alt ? Bl.amberSoft : Colors.transparent,
                  border: Border.all(
                      color: _alt ? Bl.amber : const Color(0xFFD9D6D1)),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(
                  _alt
                      ? 'by ${p.secondaryUnit} · ${formatQty(_qty, p.unit)} ${p.unit ?? ''}'
                      : 'Sell by ${p.secondaryUnit}?',
                  style: Bl.tight(12,
                      w: FontWeight.w600,
                      ls: 0,
                      c: _alt ? Bl.amberDeep : const Color(0xFF55595F)),
                ),
              ),
            ),
          ),
        const SizedBox(height: 16),
        Row(
          children: [
            _box(
              _alt ? 'Price / ${p.secondaryUnit}' : 'Unit price',
              Row(
                children: [
                  Text('₹', style: Bl.tight(14.5, w: FontWeight.w600)),
                  Expanded(
                    child: TextField(
                      controller: _priceController,
                      keyboardType: const TextInputType.numberWithOptions(
                          decimal: true),
                      cursorColor: Bl.brand,
                      inputFormatters: [
                        FilteringTextInputFormatter.allow(
                            RegExp(r'^\d*\.?\d{0,2}')),
                      ],
                      style: Bl.tight(14.5, w: FontWeight.w600),
                      decoration: const InputDecoration(
                        border: InputBorder.none,
                        enabledBorder: InputBorder.none,
                        focusedBorder: InputBorder.none,
                        filled: false,
                        contentPadding: EdgeInsets.zero,
                        isDense: true,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 6),
            _box('Estimated total',
                Text(Money.inr(_total), style: Bl.tight(14.5, w: FontWeight.w700))),
          ],
        ),
        if (_belowCost)
          Container(
            margin: const EdgeInsets.only(top: 10),
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
            decoration: BoxDecoration(
                color: const Color(0xFFFFF8E1),
                borderRadius: BorderRadius.circular(12)),
            child: Text(
                'Below cost. This stock cost ₹${_cost.toStringAsFixed(2)}.',
                style: Bl.inter(11.5,
                    w: FontWeight.w500, c: const Color(0xFF6B4E00))),
          ),
        const SizedBox(height: 14),
        BlButton('Add to basket · ${Money.inr(_total)}', onTap: _confirm),
        const SizedBox(height: 10),
        Text('Tap quantity number on card to reopen this screen',
            textAlign: TextAlign.center, style: Bl.inter(12, c: Bl.mute)),
      ],
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
  final ValueListenable<(SaveStatus, String?)> saveState;
  // Pulled from parent so the checkout sheet can read business profile
  // (tax_mode) without spinning up its own ConsumerStatefulWidget.
  final WidgetRef ref;

  const _CheckoutSheet({
    required this.cart,
    required this.subtotal,
    required this.selectedClient,
    required this.onComplete,
    required this.onRemove,
    required this.saveState,
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
    return saleGrossTotal(_localCart, _taxMode);
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

  // Duotone icons for the payment tiles (canvas "Checkout").
  static const _payIcon = {
    'CASH':
        '<path opacity=".45" d="M2 7a2 2 0 012-2h16a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2z"/><circle cx="12" cy="12" r="3"/><path d="M5 9h2v1.6H5zM17 13.4h2V15h-2z"/>',
    'UPI':
        '<path opacity=".45" d="M7 2h10a2 2 0 012 2v16a2 2 0 01-2 2H7a2 2 0 01-2-2V4a2 2 0 012-2z"/><path d="M8.5 7h3v3h-3zM12.5 11h3v3h-3zM8.5 11h3v1.500h-3zM10 18h4v1.400h-4z"/>',
    'BANK':
        '<path opacity=".45" d="M4 10h16v8H4z"/><path d="M12 2l10 6v2H2V8zM2 19h20v2.200H2z"/><path d="M7 11.500h2v5H7zM11 11.500h2v5h-2zM15 11.500h2v5h-2z"/>',
    'CREDIT_SALE':
        '<circle opacity=".45" cx="9" cy="8" r="4.200"/><path d="M1.500 21a7.500 7.500 0 0115 0z"/><path d="M18.200 7h1.600v2.700h2.700v1.600h-2.700V14h-1.600v-2.700h-2.700V9.700h2.700z"/>',
  };

  static const _tints = [
    Color(0xFFFFF1DE),
    Color(0xFFE8EFFD),
    Color(0xFFF1F1F1),
    Color(0xFFE6F6EC),
    Color(0xFFFDECEC),
  ];

  Widget _label(String t) => Padding(
        padding: const EdgeInsets.only(top: 14, bottom: 6),
        child: Text(t, style: Bl.tight(12.5, w: FontWeight.w600)),
      );

  Widget _kv(String k, String v) => Padding(
        padding: const EdgeInsets.only(top: 6),
        child: Row(
          children: [
            Expanded(
                child: Text(k,
                    style: Bl.inter(13, c: const Color(0xFF6E737A)))),
            Text(v, style: Bl.tight(13.5, w: FontWeight.w600)),
          ],
        ),
      );

  static const _fieldDeco = InputDecoration(
    isDense: true,
    filled: false,
    contentPadding: EdgeInsets.zero,
    border: InputBorder.none,
    enabledBorder: InputBorder.none,
    focusedBorder: InputBorder.none,
  );

  Widget _basketRow(CartItem item) {
    final name = item.product.name;
    final tint = _tints[name.hashCode.abs() % _tints.length];
    return Dismissible(
      key: ValueKey('basket-${item.product.id}'),
      direction: DismissDirection.endToStart,
      onDismissed: (_) => _removeItem(item),
      background: Container(
        alignment: Alignment.centerRight,
        padding: const EdgeInsets.only(right: 12),
        decoration: BoxDecoration(
            color: Bl.redSoft, borderRadius: BorderRadius.circular(10)),
        child: Text('Remove',
            style: Bl.tight(12.5, w: FontWeight.w600, c: Bl.redDeep)),
      ),
      child: Semantics(
        customSemanticsActions: {
          const CustomSemanticsAction(label: 'Remove from basket'): () =>
              _removeItem(item),
        },
        child: Container(
          color: Bl.white,
          padding: const EdgeInsets.symmetric(vertical: 5),
          child: Row(
            children: [
              SizedBox(
                width: 40,
                height: 40,
                child: Stack(
                  clipBehavior: Clip.none,
                  children: [
                    Positioned(
                      left: 0,
                      bottom: 0,
                      child: Container(
                        width: 34,
                        height: 34,
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                            color: tint,
                            borderRadius: BorderRadius.circular(10)),
                        child: Text(BlPartyAvatar.initials(name),
                            style: Bl.tight(11,
                                w: FontWeight.w700,
                                ls: 0,
                                c: const Color(0xFF55595F))),
                      ),
                    ),
                    Positioned(
                      right: 0,
                      top: 0,
                      child: Container(
                        constraints: const BoxConstraints(minWidth: 17),
                        height: 17,
                        padding: const EdgeInsets.symmetric(horizontal: 4),
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                            color: Bl.ink,
                            borderRadius: BorderRadius.circular(9)),
                        child: Text(formatQty(item.quantity, item.product.unit),
                            style: Bl.tight(10,
                                w: FontWeight.w700, ls: 0, c: Bl.white)),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Bl.tight(13.5, w: FontWeight.w600)),
                    Text('${Money.inrExact(item.unitPrice)} each',
                        style: Bl.inter(11.5, c: const Color(0xFF7A8088))),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Text(Money.inrExact(item.lineTotal),
                  style: Bl.tight(13.5, w: FontWeight.w600)),
            ],
          ),
        ),
      ),
    );
  }

  Widget _payTile(_PayMethod m) {
    final on = _paymentMethod == m.key;
    final svg = _payIcon[m.type] ?? _payIcon['BANK']!;
    return Expanded(
      child: Semantics(
        button: true,
        selected: on,
        label: '${m.label}. ${m.subtitle}',
        excludeSemantics: true,
        child: BlTap(
          onTap: () {
            setState(() => _paymentMethod = m.key);
            if (m.type == 'UPI') _showUpiPreview();
          },
          child: AnimatedContainer(
            duration: motionDur(context, 160),
            curve: MotionCurves.out,
            padding: const EdgeInsets.fromLTRB(4, 10, 4, 9),
            decoration: BoxDecoration(
                color: on ? Bl.amber : const Color(0xFFF6F5F3),
                borderRadius: BorderRadius.circular(16)),
            child: Column(
              children: [
                SvgPicture.string(
                  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${on ? '#ffffff' : '#6E737A'}">$svg</svg>',
                  width: 22,
                  height: 22,
                ),
                const SizedBox(height: 6),
                Text(m.short,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Bl.tight(12,
                        w: FontWeight.w600, ls: 0, c: on ? Bl.white : Bl.ink)),
              ],
            ),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final client = widget.selectedClient;
    final owes = client?.outstandingBalance ?? 0;
    final methods = _payMethods;
    final picked = methods.where((m) => m.key == _paymentMethod).firstOrNull;
    final credit = _selectedPayType == 'CREDIT_SALE';
    final n = _localCart.length;
    final diff = _changeOrBalance;

    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Container(
          padding: const EdgeInsets.only(bottom: 12),
          decoration: const BoxDecoration(
              border: Border(bottom: BorderSide(color: Bl.sep))),
          child: Row(
            children: [
              Expanded(
                  child: Text('Checkout',
                      style: Bl.tight(16, w: FontWeight.w700, ls: -0.02))),
              BlPill('$n ${n == 1 ? 'item' : 'items'}'),
              const SizedBox(width: 8),
              BlTap(
                label: 'Close',
                onTap: () => Navigator.of(context).maybePop(),
                child: Container(
                  width: 30,
                  height: 30,
                  alignment: Alignment.center,
                  decoration: const BoxDecoration(
                      color: Bl.well, shape: BoxShape.circle),
                  child: const BlIcon(BlIcons.close, size: 15),
                ),
              ),
            ],
          ),
        ),
        if (client != null && owes > 0.01)
          Container(
            margin: const EdgeInsets.only(top: 10),
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
            decoration: BoxDecoration(
                color: const Color(0xFFFFF8E1),
                borderRadius: BorderRadius.circular(12)),
            child: Text(
                '${client.name ?? 'Customer'} already owes ${Money.inr(owes)} · With this bill ${Money.inr(owes + _netTotal)}',
                style: Bl.inter(11.5,
                    w: FontWeight.w500, c: const Color(0xFF6B4E00))),
          ),
        _label('Basket summary'),
        for (final item in _localCart) _basketRow(item),
        _label('Payment method'),
        Row(
          children: [
            for (var i = 0; i < methods.length; i++) ...[
              if (i > 0) const SizedBox(width: 6),
              _payTile(methods[i]),
            ],
          ],
        ),
        if (picked != null)
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Text('${picked.label} · ${picked.subtitle}',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: Bl.inter(11.5,
                    w: FontWeight.w500, c: const Color(0xFF7A8088))),
          ),
        const SizedBox(height: 8),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              flex: 3,
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
                decoration: BoxDecoration(
                    color: const Color(0xFFF3F2F0),
                    borderRadius: BorderRadius.circular(12)),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(credit ? 'Part payment now' : 'Amount received',
                        style:
                            Bl.inter(10, w: FontWeight.w500, c: Bl.mute)),
                    const SizedBox(height: 1),
                    TextField(
                      controller: _amountPaidCtrl,
                      keyboardType: const TextInputType.numberWithOptions(
                          decimal: true),
                      cursorColor: Bl.brand,
                      onChanged: (_) => setState(() {}),
                      style: Bl.tight(13.5, w: FontWeight.w600),
                      decoration: _fieldDeco.copyWith(
                        hintText: credit
                            ? 'Optional. Rest goes on credit'
                            : 'Blank means paid in full',
                        hintStyle: Bl.inter(12.5,
                            w: FontWeight.w500, c: Bl.faint),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(width: 6),
            Expanded(
              flex: 2,
              child: Container(
                padding: const EdgeInsets.fromLTRB(12, 7, 8, 7),
                decoration: BoxDecoration(
                    color: const Color(0xFFF3F2F0),
                    borderRadius: BorderRadius.circular(12)),
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Discount',
                              style: Bl.inter(10,
                                  w: FontWeight.w500, c: Bl.mute)),
                          const SizedBox(height: 1),
                          TextField(
                            controller: _discountCtrl,
                            keyboardType:
                                const TextInputType.numberWithOptions(
                                    decimal: true),
                            cursorColor: Bl.brand,
                            onChanged: (_) => setState(() {}),
                            style: Bl.tight(13.5, w: FontWeight.w600),
                            decoration: _fieldDeco.copyWith(
                              hintText: '0',
                              hintStyle:
                                  Bl.tight(13.5, w: FontWeight.w600),
                            ),
                          ),
                        ],
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.all(2),
                      decoration: BoxDecoration(
                          color: Bl.white,
                          borderRadius: BorderRadius.circular(999)),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          _discountModeChip('AMOUNT', '₹'),
                          _discountModeChip('PERCENT', '%'),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
        if (_effectivePaid != null && diff != 0)
          Container(
            margin: const EdgeInsets.only(top: 8),
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
            decoration: BoxDecoration(
                color: diff > 0 ? Bl.greenSoft : const Color(0xFFFFF8E1),
                borderRadius: BorderRadius.circular(12)),
            child: Row(
              children: [
                Expanded(
                  child: Text(diff > 0 ? 'Change due' : 'Balance to credit',
                      style: Bl.inter(11.5,
                          w: FontWeight.w600,
                          c: diff > 0
                              ? const Color(0xFF166534)
                              : const Color(0xFF6B4E00))),
                ),
                Text(Money.inrExact(diff.abs()),
                    style: Bl.tight(13,
                        w: FontWeight.w700,
                        c: diff > 0
                            ? const Color(0xFF166534)
                            : const Color(0xFF6B4E00))),
              ],
            ),
          ),
        // Tax and discount lines only when there is something to show; a
        // plain bill goes straight to the total, as on the canvas.
        if (_tax > 0 || _discountAmount > 0) ...[
          const SizedBox(height: 6),
          _kv(_taxMode == 'INCLUSIVE' ? 'Taxable' : 'Subtotal',
              Money.inrExact(_subtotal)),
          if (_tax > 0)
            _kv(
                'Tax (${_avgTaxRate.toStringAsFixed(_avgTaxRate % 1 == 0 ? 0 : 1)}%${_taxMode == 'INCLUSIVE' ? ' incl' : ''})',
                Money.inrExact(_tax)),
          if (_discountAmount > 0)
            _kv('Discount', '- ${Money.inrExact(_discountAmount)}'),
        ],
        Container(
          margin: const EdgeInsets.only(top: 12),
          padding: const EdgeInsets.only(top: 10),
          decoration: const BoxDecoration(
              border: Border(top: BorderSide(color: Bl.sep))),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            children: [
              Expanded(
                  child: Text('Grand Total',
                      style: Bl.tight(14, w: FontWeight.w600))),
              RollingNumber(
                text: Money.inrExact(_netTotal),
                style: Bl.tight(22, w: FontWeight.w700, ls: -0.03),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        ValueListenableBuilder<(SaveStatus, String?)>(
          valueListenable: widget.saveState,
          builder: (_, st, _) => Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (st.$1 == SaveStatus.error && st.$2 != null)
                Container(
                  margin: const EdgeInsets.only(bottom: 8),
                  padding:
                      const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                  decoration: BoxDecoration(
                      color: Bl.redSoft,
                      borderRadius: BorderRadius.circular(12)),
                  child: Text(st.$2!,
                      style: Bl.inter(11.5,
                          w: FontWeight.w500, c: Bl.redDeep)),
                ),
              BlSlide(
                st.$1 == SaveStatus.saving
                    ? 'Saving'
                    : st.$1 == SaveStatus.saved
                        ? 'Saved'
                        : 'Slide to complete',
                enabled: st.$1 == SaveStatus.idle || st.$1 == SaveStatus.error,
                onConfirmed: () => widget.onComplete(
                    _selectedPayType, _effectivePaid, _discountAmount),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _discountModeChip(String mode, String label) {
    final active = _discountMode == mode;
    return Semantics(
      button: true,
      selected: active,
      label: mode == 'AMOUNT' ? 'Discount in rupees' : 'Discount in percent',
      excludeSemantics: true,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: () => setState(() => _discountMode = mode),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
          decoration: BoxDecoration(
              color: active ? Bl.ink : Colors.transparent,
              borderRadius: BorderRadius.circular(999)),
          child: Text(label,
              style: Bl.tight(12,
                  w: FontWeight.w600,
                  ls: 0,
                  c: active ? Bl.white : const Color(0xFF6E737A))),
        ),
      ),
    );
  }

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
}

class _PayMethod {
  final String key;     // account.id or 'CREDIT_SALE'
  final String label;   // account.name or 'Credit Sale'
  final String subtitle;
  final IconData icon;
  final String type;    // CASH | UPI | BANK | CREDIT_SALE
  const _PayMethod(this.key, this.label, this.subtitle, this.icon, this.type);

  /// One word for the payment tile.
  String get short => switch (type) {
        'CASH' => 'Cash',
        'UPI' => 'UPI',
        'BANK' => 'Bank',
        'CARD' => 'Card',
        'CREDIT_SALE' => 'Credit',
        _ => label,
      };
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
    } catch (e) {
      // Offline: the customers cached by the last sync, with the outstanding
      // balance as of that sync. A credit sale can still be rung against
      // them; process_sale enforces the credit limit when it replays, and a
      // refusal is shown in the sync sheet rather than lost.
      debugPrint('[clientPicker] online failed, using Drift cache: $e');
      try {
        final ref = ProviderScope.containerOf(context, listen: false);
        final db = ref.read(databaseProvider);
        final tenantId = ref.read(tenantContextProvider).valueOrNull?.tenantId;
        final rows = await cachedPickerClients(db, tenantId);
        if (!mounted) return;
        if (rows.isNotEmpty) {
          setState(() {
            _clients = rows.map((r) => Client.fromJson(r)).toList();
            _filtered = _clients;
            _loading = false;
          });
          return;
        }
      } catch (e2) {
        debugPrint('[clientPicker] cache read failed: $e2');
      }
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

  Widget _row({
    required String name,
    required String sub,
    required bool selected,
    required VoidCallback onTap,
    double owes = 0,
  }) =>
      Semantics(
        button: true,
        selected: selected,
        child: BlTap(
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 9),
            child: Row(
              children: [
                BlPartyAvatar(name == 'Walk-in Customer' ? '' : name),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: Bl.tight(14.5, w: FontWeight.w600)),
                      if (sub.isNotEmpty)
                        Text(sub,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: Bl.inter(12, c: const Color(0xFF7A8088))),
                    ],
                  ),
                ),
                if (owes > 0) ...[
                  const SizedBox(width: 8),
                  Text('Owes ${Money.inr(owes)}',
                      style: Bl.tight(13.5, w: FontWeight.w600, c: Bl.red)),
                ],
                if (selected) ...[
                  const SizedBox(width: 8),
                  Container(
                    width: 22,
                    height: 22,
                    alignment: Alignment.center,
                    decoration: const BoxDecoration(
                        color: Bl.amber, shape: BoxShape.circle),
                    child: const BlIcon(BlIcons.check,
                        size: 13, color: Bl.white, stroke: 3),
                  ),
                ],
              ],
            ),
          ),
        ),
      );

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Container(
          padding: const EdgeInsets.only(bottom: 12),
          decoration: const BoxDecoration(
              border: Border(bottom: BorderSide(color: Bl.sep))),
          child: Row(
            children: [
              Expanded(
                  child: Text('Select Client',
                      style: Bl.tight(16, w: FontWeight.w700, ls: -0.02))),
              BlTap(
                label: 'New client',
                onTap: _openAddClient,
                child: Container(
                  height: 30,
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                      color: Bl.amber,
                      borderRadius: BorderRadius.circular(999)),
                  child: Text('+ New',
                      style: Bl.tight(12.5,
                          w: FontWeight.w600, ls: 0, c: Bl.white)),
                ),
              ),
              const SizedBox(width: 8),
              BlTap(
                label: 'Close',
                onTap: () => Navigator.of(context).maybePop(),
                child: Container(
                  width: 30,
                  height: 30,
                  alignment: Alignment.center,
                  decoration: const BoxDecoration(
                      color: Bl.well, shape: BoxShape.circle),
                  child: const BlIcon(BlIcons.close, size: 15),
                ),
              ),
            ],
          ),
        ),
        Container(
          height: 42,
          margin: const EdgeInsets.only(top: 12, bottom: 6),
          padding: const EdgeInsets.symmetric(horizontal: 14),
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
                  style: Bl.inter(13.5, w: FontWeight.w500, c: Bl.ink),
                  decoration: InputDecoration(
                    isCollapsed: true,
                    filled: false,
                    border: InputBorder.none,
                    enabledBorder: InputBorder.none,
                    focusedBorder: InputBorder.none,
                    hintText: 'Search by name or phone',
                    hintStyle:
                        Bl.inter(13.5, w: FontWeight.w500, c: Bl.mute),
                  ),
                ),
              ),
            ],
          ),
        ),
        if (_loading)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 40),
            child: Center(
                child: CircularProgressIndicator(
                    color: Bl.amber, strokeWidth: 2)),
          )
        else if (_loadFailed)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 24),
            child: Column(
              children: [
                Text('Could not load clients. Check your connection.',
                    textAlign: TextAlign.center,
                    style: Bl.inter(13, c: Bl.mute)),
                const SizedBox(height: 10),
                SizedBox(
                  width: 120,
                  child: BlButton('Retry',
                      kind: BlButtonKind.soft,
                      height: 40,
                      onTap: _loadClients),
                ),
              ],
            ),
          )
        else ...[
          _row(
            name: 'Walk-in Customer',
            sub: 'No name on the bill',
            selected: widget.selectedClient == null,
            onTap: () => widget.onSelected(null),
          ),
          for (final client in _filtered)
            _row(
              name: client.name ?? 'Unknown',
              sub: client.phone ?? '',
              owes: client.outstandingBalance ?? 0,
              selected: widget.selectedClient?.id == client.id,
              onTap: () => widget.onSelected(client),
            ),
        ],
      ],
    );
  }
}

// ─── Barcode Scanner ──────────────────────────────────────────────────────────

// ── Post-sale success sheet ────────────────────────────────────────────────────

class _SaleSuccessSheet extends StatefulWidget {
  final String  saleId;
  /// True when the sale is in the outbox, not yet on the server.
  final bool    queued;
  /// The sale as rung, in Sale.fromJson columns, so a receipt can be built
  /// with no network at all.
  final Map<String, dynamic>? localSale;
  final double  total;
  final Client? client;
  final double  outstanding;   // client's pre-sale outstanding balance
  final double  excess;        // amount already paid beyond this bill (capped at outstanding)
  final String  paymentMethod;

  const _SaleSuccessSheet({
    required this.saleId,
    this.queued = false,
    this.localSale,
    required this.total,
    this.client,
    this.outstanding = 0,
    this.excess      = 0,
    this.paymentMethod = 'CASH',
  });

  static Future<void> show(
    BuildContext context, {
    required String  saleId,
    bool             queued        = false,
    Map<String, dynamic>? localSale,
    required double  total,
    Client?          client,
    double           outstanding   = 0,
    double           excess        = 0,
    String           paymentMethod = 'CASH',
  }) {
    return showBlSheet<void>(
      context: context,
      builder: (_) => _SaleSuccessSheet(
        saleId:        saleId,
        queued:        queued,
        localSale:     localSale,
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
  SaveStatus _collectStatus = SaveStatus.idle;
  String? _collectErr;
  // For the "collect now" sub-form (no-excess path)
  late TextEditingController _collectCtrl;
  String _collectMethod = 'CASH';

  @override
  void initState() {
    super.initState();
    _collectCtrl = TextEditingController(
      text: widget.outstanding > 0 ? widget.outstanding.toStringAsFixed(2) : '',
    );
    // Start from the sale's method only when it is a way money can arrive.
    // A credit sale reaches here as 'CREDIT_SALE' (the picker's sentinel), not
    // 'CREDIT', and that leaked into client_payments as a payment method: the
    // money went to a bank account and the Day Book never listed it.
    if (const {'CASH', 'UPI', 'BANK'}.contains(widget.paymentMethod)) {
      _collectMethod = widget.paymentMethod;
    }
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
    // The web layout needs the network AND the sale on the server. With
    // either missing, waiting 25s for the embed to time out only to fall
    // back anyway is dead time at the counter: print from this phone now.
    if (widget.localSale != null) {
      final svc = ProviderScope.containerOf(context).read(syncServiceProvider);
      final online = await svc.transport.isOnline();
      final stillQueued = widget.queued &&
          (await svc.findPendingRpc('process_sale', widget.saleId) != null ||
              await svc.pendingCount() > 0);
      if (!online || stillQueued) return _offlineReceipt();
    }
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
      final Map<String, dynamic>? row;
      try {
        row = await supabase.from('sales').select('*').eq('id', widget.saleId)
            .maybeSingle().timeout(const Duration(seconds: 6));
      } catch (e2) {
        // No network at all: build the slip from the bill as rung and the
        // cached shop profile. Same layout code, nothing fetched.
        debugPrint('[print] server unreachable, printing from this phone: $e2');
        return _offlineReceipt();
      }
      if (row == null) {
        // Not on the server yet (still queued): print what was rung.
        return _offlineReceipt();
      }
      final sale = Sale.fromJson(row);
      final invoice = Invoice.fromSale(sale);
      final tenantId = row['tenant_id'] as String?;
      BusinessProfile? biz;
      bool noGst = false;
      if (tenantId != null) {
        final bizRow = await supabase
            .from('business_profile')
            .select('*')
            .eq('tenant_id', tenantId)
            .maybeSingle();
        if (bizRow != null) {
          biz = BusinessProfile.fromJson(bizRow);
          noGst = (bizRow['tax_mode'] as String?)?.toUpperCase() == 'NONE';
        }
      }
      // Account context so the offline slip shows the same "YOU OWE NOW" /
      // advance summary as the web-rendered one. Null client = walk-in.
      double? clientOutstanding;
      final shopId = row['shopId'] as String?;
      if (shopId != null && shopId.isNotEmpty) {
        final cRow = await supabase
            .from('clients').select('outstanding_balance').eq('id', shopId).maybeSingle();
        clientOutstanding = (cRow?['outstanding_balance'] as num?)?.toDouble() ?? 0;
      }
      return pos_pdf.buildPosReceiptPdf(
        invoice, biz,
        clientOutstanding: clientOutstanding,
        amountReceived: (row['amount_received'] as num?)?.toDouble(),
        noGst: noGst,
        taxMode: biz?.taxMode,
      );
    }
  }

  /// The receipt from local data only: the sale as rung and the shop profile
  /// cached on this phone. Marked as not synced on the slip's terms line, so a
  /// reprint after sync is the one with the server's figures.
  Future<Uint8List> _offlineReceipt() async {
    final local = widget.localSale;
    if (local == null) throw Exception('This bill is not on this phone.');
    final container = ProviderScope.containerOf(context);
    Map<String, dynamic>? profile;
    try {
      profile = await container.read(tenantProfileProvider.future);
    } catch (_) {}
    final tenantId = local['tenant_id'] as String?;
    if (profile == null && tenantId != null) {
      profile = await OfflineContextCache.loadBusinessProfile(tenantId);
      if (profile == null) {
        final cachedBiz = await (container.read(databaseProvider).select(
                container.read(databaseProvider).businessProfileLocal)
              ..where((t) => t.tenantId.equals(tenantId)))
            .getSingleOrNull();
        if (cachedBiz != null) {
          profile = {
            'tenant_id': cachedBiz.tenantId, 'name': cachedBiz.name,
            'address': cachedBiz.address, 'phone': cachedBiz.phone,
            'gst_no': cachedBiz.gstNo, 'upi_id': cachedBiz.upiId,
            'invoice_terms': cachedBiz.invoiceTerms,
            // This table does not keep tax_mode. Unknown means NONE: print
            // no tax split rather than guess one.
            'tax_mode': 'NONE',
          };
        }
      }
    }
    final biz = profile == null
        ? null
        : BusinessProfile.fromJson({
            ...profile,
            'tenant_id': profile['tenant_id'] ?? tenantId ?? '',
            if (widget.queued)
              'footer_message': 'Bill saved offline. It syncs automatically.',
          });
    final noGst = (profile?['tax_mode'] as String?)?.toUpperCase() == 'NONE';
    final invoice = Invoice.fromSale(Sale.fromJson(local));
    return pos_pdf.buildPosReceiptPdf(
      invoice, biz,
      // The customer's balance as of the last sync plus this bill would be a
      // guess; the slip leaves the account summary out rather than print one.
      clientOutstanding: null,
      amountReceived: (local['amount_received'] as num?)?.toDouble(),
      noGst: noGst,
      // INCLUSIVE shops back the tax out of the line; EXCLUSIVE adds it on top.
      // Without the mode every offline slip was treated as EXCLUSIVE.
      taxMode: (profile?['tax_mode'] as String?) ?? biz?.taxMode ?? 'NONE',
    );
  }

  Future<void> _print() async {
    setState(() => _printing = true);
    try {
      final bytes = await _receiptBytes();
      // NOTE: do NOT pass `format: PdfPageFormat.roll80` here. roll80 is
      // defined with double.infinity height, and the printing plugin hands
      // width/height straight to Android's PrintManager, which needs finite
      // dimensions — the result was a blank page. The PDF already carries its
      // own correct page size; the paper picker in the print dialog is the
      // place to choose the roll.
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

  /// Confirm before any money is applied. Shows exactly how the amount splits
  /// between clearing dues and being kept as advance, so the cashier can't
  /// bank an overpayment by a stray tap.
  Future<bool> _confirmApply(double amount, double toDues, double advance) async {
    final name = widget.client?.name ?? 'this client';
    final ok = await showBlDialog<bool>(
      context: context,
      title: 'Receive ${Money.inrExact(amount)}?',
      message: [
        'From $name.',
        if (toDues > 0) '${Money.inrExact(toDues)} clears outstanding dues.',
        if (advance > 0)
          '${Money.inrExact(advance)} is kept as an advance and used automatically on their next credit bill.',
      ].join('\n'),
      actions: (ctx) => [
        Row(
          children: [
            Expanded(
              child: BlButton('Cancel',
                  kind: BlButtonKind.soft,
                  onTap: () => Navigator.pop(ctx, false)),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: BlButton('Confirm', onTap: () => Navigator.pop(ctx, true)),
            ),
          ],
        ),
      ],
    );
    return ok ?? false;
  }

  Future<bool> _recordPayment(double amount) async {
    if (widget.client == null || amount <= 0) return false;
    setState(() => _collecting = true);
    try {
      final container = ProviderScope.containerOf(context);
      final ctx = await container.read(tenantContextProvider.future);
      if (ctx == null) return false;
      final today = DateTime.now().toIso8601String().substring(0, 10);
      final paymentId = 'CP-${DateTime.now().millisecondsSinceEpoch}';
      // One settled path: settle_client_payment does FIFO allocation across
      // unpaid credit sales, posts Cash & Bank, and recalcs outstanding —
      // server-side. Routed through the offline queue so a flaky connection
      // QUEUES the collection instead of dropping it. The old code did direct
      // Supabase writes with no queue (lost offline) AND hand-rolled the
      // allocation, racing the DB replay trigger.
      final queued = await container.read(syncServiceProvider).rpcOnlineOrQueue(
        'settle_client_payment',
        {
          'p_id':          paymentId,
          'p_tenant_id':   ctx.tenantId,
          'p_client_id':   widget.client!.id,
          'p_amount':      amount,
          'p_date':        today,
          'p_method':      _collectMethod,
          'p_recorded_by': supabase.auth.currentUser?.id,
        },
      );
      if (mounted && queued) {
        MotionToast.show(context, 'Payment saved offline — will sync when online');
      }
      return true;
    } catch (e) {
      _collectErr = 'Payment failed';
      if (mounted) {
        MotionToast.show(context, 'Payment record failed: $e', isError: true);
      }
      return false;
    } finally {
      if (mounted) setState(() => _collecting = false);
    }
  }

  String get _subLine {
    final items = widget.localSale?['items'];
    final n = items is List ? items.length : 0;
    return [
      'Bill ${widget.saleId}',
      methodLabel(widget.paymentMethod == 'CREDIT_SALE'
          ? 'Credit'
          : widget.paymentMethod),
      if (n > 0) '$n ${n == 1 ? 'item' : 'items'}',
    ].join(' · ');
  }

  Future<void> _collect() async {
    final amt = (double.tryParse(_collectCtrl.text) ?? 0);
    if (amt <= 0) return;
    final toDues = amt <= widget.outstanding ? amt : widget.outstanding;
    final advance = amt - toDues;
    if (!await _confirmApply(amt, toDues, advance)) return;
    setState(() => _collectStatus = SaveStatus.saving);
    final ok = await _recordPayment(amt);
    if (!mounted) return;
    setState(() => _collectStatus = ok ? SaveStatus.saved : SaveStatus.error);
    if (ok) {
      HapticFeedback.lightImpact();
      await Future<void>.delayed(const Duration(milliseconds: 700));
      if (mounted) Navigator.of(context).pop();
    }
  }

  @override
  Widget build(BuildContext context) {
    final hasOutstanding = widget.outstanding > 0 && widget.client != null;
    final hasExcess      = widget.excess > 0;
    final excessToDues  = widget.excess <= widget.outstanding ? widget.excess : widget.outstanding;
    final excessAdvance = widget.excess - excessToDues;

    return BlDoneSequence(
      builder: (context, part) => Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(widget.queued ? 'Sale saved on this phone' : 'Sale recorded!',
              textAlign: TextAlign.center,
              style: Bl.tight(15.5, w: FontWeight.w600)),
          const SizedBox(height: 12),
          const Divider(height: 1, thickness: 1, color: Bl.sep),
          const SizedBox(height: 34),
          Center(
              child: BlDoneMark(
                  progress: part(0, 0.55), waiting: widget.queued)),
          const SizedBox(height: 18),
          BlRise(
            t: part(0.42, 0.72),
            scale: true,
            child: Text(Money.inrExact(widget.total),
                textAlign: TextAlign.center,
                style: Bl.tight(40, w: FontWeight.w700, ls: -0.04)),
          ),
          const SizedBox(height: 4),
          BlRise(
            t: part(0.54, 0.84),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(_subLine,
                    textAlign: TextAlign.center,
                    style: Bl.inter(12.5,
                        w: FontWeight.w500, c: const Color(0xFF7A8088))),
                if (widget.queued)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(12, 12, 12, 0),
                    child: Text(
                        'Not synced yet. It is sent automatically when the internet is back; '
                        'the bill number below stays the same.',
                        textAlign: TextAlign.center,
                        style: Bl.inter(12, c: Bl.mute, h: 1.5)),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 18),
          BlRise(
            t: part(0.66, 0.92),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(children: [
                  Expanded(
                      child: BlButton('Print',
                          kind: BlButtonKind.soft,
                          loading: _printing,
                          onTap: _print)),
                  const SizedBox(width: 8),
                  Expanded(
                      child: BlButton('Share',
                          kind: BlButtonKind.soft,
                          loading: _sharing,
                          onTap: _share)),
                ]),
                if (hasOutstanding)
                  Container(
                    margin: const EdgeInsets.only(top: 10),
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: const Color(0xFFECEAE7)),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Text(
                            '${widget.client!.name ?? 'Client'} still owes ${Money.inrExact(widget.outstanding)}',
                            style: Bl.tight(13.5, w: FontWeight.w600)),
                        if (hasExcess) ...[
                          _OutstandingTile(
                            title:
                                'Apply ${Money.inrExact(widget.excess)} to account',
                            subtitle: excessAdvance > 0
                                ? 'Clears ${Money.inrExact(excessToDues)} dues · ${Money.inrExact(excessAdvance)} kept as advance'
                                : 'Balance: ${Money.inrExact(widget.outstanding)} → ${Money.inrExact(widget.outstanding - widget.excess)}',
                            loading: _collecting,
                            onTap: () async {
                              if (!await _confirmApply(widget.excess,
                                  excessToDues, excessAdvance)) {
                                return;
                              }
                              await _recordPayment(widget.excess);
                              if (context.mounted) Navigator.of(context).pop();
                            },
                          ),
                          _OutstandingTile(
                            title:
                                'Give ${Money.inrExact(widget.excess)} as change',
                            subtitle:
                                'Outstanding stays ${Money.inrExact(widget.outstanding)}',
                            loading: false,
                            onTap: () => Navigator.of(context).pop(),
                          ),
                        ] else ...[
                          const SizedBox(height: 8),
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 12, vertical: 7),
                            decoration: BoxDecoration(
                                color: const Color(0xFFF3F2F0),
                                borderRadius: BorderRadius.circular(12)),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text('Collect now',
                                    style: Bl.inter(10,
                                        w: FontWeight.w500, c: Bl.mute)),
                                Row(
                                  children: [
                                    Text('₹',
                                        style: Bl.tight(14.5,
                                            w: FontWeight.w600)),
                                    Expanded(
                                      child: TextField(
                                        controller: _collectCtrl,
                                        keyboardType: const TextInputType
                                            .numberWithOptions(decimal: true),
                                        cursorColor: Bl.brand,
                                        style: Bl.tight(14.5,
                                            w: FontWeight.w600),
                                        decoration: const InputDecoration(
                                          isDense: true,
                                          filled: false,
                                          contentPadding: EdgeInsets.zero,
                                          border: InputBorder.none,
                                          enabledBorder: InputBorder.none,
                                          focusedBorder: InputBorder.none,
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(height: 6),
                          Row(
                            children: [
                              for (final m in const ['CASH', 'UPI', 'BANK']) ...[
                                if (m != 'CASH') const SizedBox(width: 5),
                                Expanded(
                                  child: Semantics(
                                    button: true,
                                    selected: _collectMethod == m,
                                    child: BlTap(
                                      onTap: () =>
                                          setState(() => _collectMethod = m),
                                      child: Container(
                                        height: 36,
                                        alignment: Alignment.center,
                                        decoration: BoxDecoration(
                                            color: _collectMethod == m
                                                ? Bl.amber
                                                : Bl.well,
                                            borderRadius:
                                                BorderRadius.circular(10)),
                                        child: Text(methodLabel(m),
                                            style: Bl.tight(11.5,
                                                w: FontWeight.w600,
                                                ls: 0,
                                                c: _collectMethod == m
                                                    ? Bl.white
                                                    : Bl.ink)),
                                      ),
                                    ),
                                  ),
                                ),
                              ],
                            ],
                          ),
                          if (_collectStatus == SaveStatus.error)
                            Padding(
                              padding: const EdgeInsets.only(top: 8),
                              child: Text(_collectErr ?? 'Payment failed',
                                  style: Bl.inter(11.5,
                                      w: FontWeight.w500, c: Bl.redDeep)),
                            ),
                          const SizedBox(height: 8),
                          Row(
                            children: [
                              Expanded(
                                child: BlButton('Skip',
                                    kind: BlButtonKind.soft,
                                    height: 40,
                                    fontSize: 13.5,
                                    onTap: () => Navigator.of(context).pop()),
                              ),
                              const SizedBox(width: 8),
                              Expanded(
                                flex: 2,
                                child: BlButton(
                                    _collectStatus == SaveStatus.saved
                                        ? 'Collected'
                                        : 'Collect',
                                    height: 40,
                                    fontSize: 13.5,
                                    loading: _collecting ||
                                        _collectStatus == SaveStatus.saving,
                                    onTap: _collecting ? null : _collect),
                              ),
                            ],
                          ),
                        ],
                      ],
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 8),
          BlRise(
            t: part(0.76, 1),
            child: BlButton('Done', onTap: () => Navigator.of(context).pop()),
          ),
        ],
      ),
    );
  }
}

class _OutstandingTile extends StatelessWidget {
  final String title;
  final String subtitle;
  final bool loading;
  final VoidCallback onTap;
  const _OutstandingTile(
      {required this.title,
      required this.subtitle,
      required this.loading,
      required this.onTap});

  @override
  Widget build(BuildContext context) {
    return BlTap(
      onTap: loading ? null : onTap,
      child: Padding(
        padding: const EdgeInsets.only(top: 10),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: Bl.tight(13.5, w: FontWeight.w600)),
                  const SizedBox(height: 1),
                  Text(subtitle, style: Bl.inter(12, c: Bl.mute)),
                ],
              ),
            ),
            if (loading)
              const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(
                      strokeWidth: 2, color: Bl.amber))
            else
              const BlIcon(BlIcons.chevronRight,
                  size: 16, color: Color(0xFFC4C8CC)),
          ],
        ),
      ),
    );
  }
}

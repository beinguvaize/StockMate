import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:mobile_app/core/design/bl_widgets.dart';
import 'package:mobile_app/core/widgets/barcode_scanner_screen.dart';
import 'package:mobile_app/widgets/motion/motion_curves.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/core/database/database.dart';
import 'package:mobile_app/core/database/offline_reads.dart';
import 'package:mobile_app/core/supabase/client.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:mobile_app/core/utils/money.dart';
import 'package:mobile_app/main.dart' show databaseProvider;
import 'package:mobile_app/features/inventory/presentation/add_product_screen.dart';
import 'package:mobile_app/features/inventory/presentation/providers/inventory_provider.dart';
import 'package:mobile_app/core/utils/stock_levels.dart';
import 'package:mobile_app/features/inventory/presentation/widgets/product_photo.dart';
import 'package:mobile_app/widgets/motion/motion_refresh.dart';

class InventoryScreen extends ConsumerStatefulWidget {
  /// Whether this screen supplies its own Add button.
  ///
  /// False when embedded in the phone shell. That shell draws its bottom nav as
  /// a Positioned overlay rather than Scaffold.bottomNavigationBar, so Scaffold
  /// never offsets a FAB above it -- this screen's own button rendered at the
  /// default position and sat UNDERNEATH the nav bar, invisible. The shell owns
  /// the offset, so the shell owns the button there.
  const InventoryScreen({super.key, this.showAddButton = true});

  final bool showAddButton;

  @override
  ConsumerState<InventoryScreen> createState() => _InventoryScreenState();
}

enum _Sort { top, nameAz, nameZa, stockLow, stockHigh, priceLow, priceHigh }

const _kPictureView = 'inventory.pictureView';

class _InventoryScreenState extends ConsumerState<InventoryScreen> {
  final _searchController = TextEditingController();
  int _filterIndex = 0; // 0=All, 1=Low Stock, 2=Out of Stock
  _Sort _sort = _Sort.top;
  bool _pictures = false;

  @override
  void initState() {
    super.initState();
    _searchController.addListener(() {
      ref.read(searchQueryProvider.notifier).state = _searchController.text;
    });
    // Open in whichever view was used last.
    SharedPreferences.getInstance().then((p) {
      if (mounted && (p.getBool(_kPictureView) ?? false)) {
        setState(() => _pictures = true);
      }
    }).catchError((_) {});
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  void _togglePictures() {
    setState(() => _pictures = !_pictures);
    SharedPreferences.getInstance()
        .then((p) => p.setBool(_kPictureView, _pictures))
        .catchError((_) => false);
  }

  Future<void> _scan() async {
    final code = await Navigator.push<String>(
      context,
      MaterialPageRoute(builder: (_) => const BarcodeScannerScreen()),
    );
    if (code != null && code.isNotEmpty && mounted) {
      _searchController.text = code;
    }
  }

  void _showProductSheet(BuildContext context, Product product) {
    showBlSheet(
      context: context,
      builder: (_) => _ProductDetailSheet(product: product),
    ).then((_) {
      ref.invalidate(productsProvider);
    });
  }

  static const _sortLabels = {
    _Sort.top: 'As listed',
    _Sort.nameAz: 'Name, A to Z',
    _Sort.nameZa: 'Name, Z to A',
    _Sort.stockLow: 'Stock, lowest first',
    _Sort.stockHigh: 'Stock, highest first',
    _Sort.priceLow: 'Price, lowest first',
    _Sort.priceHigh: 'Price, highest first',
  };

  void _pickSort() {
    showBlSheet(
      context: context,
      builder: (ctx) => Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const BlSheetTitle('Sort by', size: 16, divider: true),
          for (final e in _sortLabels.entries)
            Semantics(
              button: true,
              selected: _sort == e.key,
              child: BlTap(
                onTap: () {
                  setState(() => _sort = e.key);
                  Navigator.pop(ctx);
                },
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(e.value,
                            style: Bl.tight(14.5,
                                w: _sort == e.key
                                    ? FontWeight.w700
                                    : FontWeight.w500)),
                      ),
                      if (_sort == e.key)
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
  }

  List<Product> _sorted(List<Product> list) {
    if (_sort == _Sort.top) return list;
    final out = [...list];
    int by(Product a, Product b) => switch (_sort) {
          _Sort.nameAz => a.name.toLowerCase().compareTo(b.name.toLowerCase()),
          _Sort.nameZa => b.name.toLowerCase().compareTo(a.name.toLowerCase()),
          _Sort.stockLow => a.stock.compareTo(b.stock),
          _Sort.stockHigh => b.stock.compareTo(a.stock),
          _Sort.priceLow => a.sellingPrice.compareTo(b.sellingPrice),
          _Sort.priceHigh => b.sellingPrice.compareTo(a.sellingPrice),
          _Sort.top => 0,
        };
    out.sort(by);
    return out;
  }

  /// Column heading that sorts by that column, flipping on a second tap.
  Widget _colHead(String label, _Sort asc, _Sort desc,
      {double? width, TextAlign align = TextAlign.left}) {
    final on = _sort == asc || _sort == desc;
    final child = Semantics(
      button: true,
      label: 'Sort by $label',
      excludeSemantics: true,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: () => setState(() => _sort = _sort == asc ? desc : asc),
        child: Padding(
          padding: const EdgeInsets.only(top: 14, bottom: 8),
          child: Text(
              '${label.toUpperCase()} ${!on ? '↕' : _sort == asc ? '↑' : '↓'}',
              textAlign: align,
              style: Bl.tight(11,
                  w: FontWeight.w600, ls: 0.06, c: on ? Bl.ink : Bl.mute)),
        ),
      ),
    );
    return width == null
        ? Expanded(child: child)
        : SizedBox(width: width, child: child);
  }

  Widget _roundTool(String icon, String label, bool on, VoidCallback onTap) =>
      BlTap(
        label: label,
        onTap: onTap,
        child: Container(
          width: 38,
          height: 38,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: on ? Bl.ink : null,
            shape: BoxShape.circle,
            border: on ? null : Border.all(color: const Color(0xFFDADADA)),
          ),
          child: BlIcon(icon, size: 16, color: on ? Bl.white : Bl.ink),
        ),
      );

  @override
  Widget build(BuildContext context) {
    // Keep the realtime channel alive while the screen is mounted; any change
    // to products (web, another phone) refreshes the list without a manual pull.
    ref.watch(productsRealtimeSubscriberProvider);
    const filters = ['All', 'Low', 'Out'];

    final all = ref.watch(productsProvider).valueOrNull ?? const [];
    final stockValue = all.fold<double>(
      0,
      (sum, p) => sum + p.stock * p.costPrice,
    );
    final lowCount = all.where((p) => StockLevels.isLow(p.stock)).length;
    final outCount = all.where((p) => StockLevels.isOutOfStock(p.stock)).length;
    final okCount = all.length - lowCount - outCount;
    final counts = [all.length, lowCount, outCount];

    final productsAsync = ref.watch(filteredProductsProvider);
    final products =
        _sorted((productsAsync.valueOrNull ?? const <Product>[]).where((p) {
      if (_filterIndex == 1) return StockLevels.isLow(p.stock);
      if (_filterIndex == 2) return StockLevels.isOutOfStock(p.stock);
      return true;
    }).toList());

    Widget legend(Color c, String t) => Padding(
          padding: const EdgeInsets.only(right: 14),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                  width: 7,
                  height: 7,
                  decoration: BoxDecoration(color: c, shape: BoxShape.circle)),
              const SizedBox(width: 5),
              Text(t,
                  style: Bl.inter(12,
                      w: FontWeight.w500, c: const Color(0xFF5E646C))),
            ],
          ),
        );

    // A sliver of at least 2% keeps a tiny group visible on the bar.
    int flex(int n) => all.isEmpty
        ? 0
        : n == 0
            ? 0
            : (n * 1000 ~/ all.length).clamp(20, 1000);

    final header = Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 6, 16, 0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.baseline,
                textBaseline: TextBaseline.alphabetic,
                children: [
                  Expanded(
                    child: Text(Money.inr(stockValue),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Bl.tight(26,
                            w: FontWeight.w700, ls: -0.035, h: 1.1)),
                  ),
                  Text(
                      '${all.length} ${all.length == 1 ? 'item' : 'items'} · at cost',
                      style: Bl.inter(12.5,
                          w: FontWeight.w500, c: const Color(0xFF7A8088))),
                ],
              ),
              const SizedBox(height: 12),
              SizedBox(
                height: 6,
                child: all.isEmpty
                    ? const DecoratedBox(
                        decoration: BoxDecoration(
                            color: Bl.well,
                            borderRadius:
                                BorderRadius.all(Radius.circular(3))))
                    : Row(
                        children: [
                          for (final (n, c) in [
                            (okCount, const Color(0xFF1E9E5A)),
                            (lowCount, Bl.brand),
                            (outCount, Bl.red),
                          ])
                            if (n > 0)
                              Expanded(
                                flex: flex(n),
                                child: Container(
                                  margin: const EdgeInsets.only(right: 3),
                                  decoration: BoxDecoration(
                                      color: c,
                                      borderRadius: BorderRadius.circular(3)),
                                ),
                              ),
                        ],
                      ),
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  legend(const Color(0xFF1E9E5A), '$okCount in stock'),
                  legend(Bl.brand, '$lowCount low'),
                  legend(Bl.red, '$outCount out'),
                ],
              ),
            ],
          ),
        ),
        Container(
          height: 44,
          margin: const EdgeInsets.fromLTRB(14, 12, 14, 0),
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
                    hintText: 'Search products, SKU',
                    hintStyle: Bl.inter(14, w: FontWeight.w500, c: Bl.mute),
                  ),
                ),
              ),
              BlTap(
                label: 'Scan barcode',
                onTap: _scan,
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
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
          child: Row(
            children: [
              Expanded(
                child: Container(
                  padding: const EdgeInsets.all(3),
                  decoration: BoxDecoration(
                      color: Bl.well, borderRadius: BorderRadius.circular(12)),
                  child: Row(
                    children: [
                      for (var i = 0; i < filters.length; i++)
                        Expanded(
                          child: Semantics(
                            button: true,
                            selected: _filterIndex == i,
                            label: '${filters[i]}, ${counts[i]}',
                            excludeSemantics: true,
                            child: GestureDetector(
                              behavior: HitTestBehavior.opaque,
                              onTap: () => setState(() => _filterIndex = i),
                              child: AnimatedContainer(
                                duration: motionDur(context, 160),
                                curve: MotionCurves.out,
                                height: 32,
                                alignment: Alignment.center,
                                decoration: BoxDecoration(
                                  color: _filterIndex == i
                                      ? Bl.white
                                      : const Color(0x00FFFFFF),
                                  borderRadius: BorderRadius.circular(9),
                                  boxShadow: _filterIndex == i
                                      ? const [
                                          BoxShadow(
                                              color: Color(0x1F000000),
                                              blurRadius: 2,
                                              offset: Offset(0, 1)),
                                        ]
                                      : null,
                                ),
                                child: Text.rich(
                                  TextSpan(
                                    text: filters[i],
                                    children: [
                                      TextSpan(
                                          text: '  ${counts[i]}',
                                          style: Bl.tight(12,
                                              w: FontWeight.w500,
                                              ls: 0,
                                              c: (_filterIndex == i
                                                      ? Bl.ink
                                                      : Bl.body)
                                                  .withValues(alpha: 0.55))),
                                    ],
                                  ),
                                  style: Bl.tight(13,
                                      w: FontWeight.w600,
                                      ls: 0,
                                      c: _filterIndex == i ? Bl.ink : Bl.body),
                                ),
                              ),
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: 8),
              _roundTool('<path d="M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3"/>',
                  'Sort', _sort != _Sort.top, _pickSort),
              const SizedBox(width: 8),
              _roundTool(
                  '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="1.6"/><path d="M21 16l-5-5-8 8"/>',
                  _pictures ? 'Hide pictures' : 'Show pictures',
                  _pictures,
                  _togglePictures),
            ],
          ),
        ),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          decoration: const BoxDecoration(
              border: Border(bottom: BorderSide(color: Color(0xFFECEBE9)))),
          child: Row(
            children: [
              _colHead('Product', _Sort.nameAz, _Sort.nameZa),
              _colHead('Stock', _Sort.stockLow, _Sort.stockHigh,
                  width: 76, align: TextAlign.right),
              _colHead('Price', _Sort.priceLow, _Sort.priceHigh,
                  width: 70, align: TextAlign.right),
            ],
          ),
        ),
      ],
    );

    return ColoredBox(
      color: Bl.white,
      child: SafeArea(
        top: false,
        bottom: false,
        child: MotionRefresh(
          onRefresh: () async {
            ref.invalidate(productsProvider);
            await ref.read(productsProvider.future);
          },
          child: CustomScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            slivers: [
              SliverPersistentHeader(
                pinned: true,
                delegate: _InvHeaderDelegate(height: 220, child: header),
              ),
              if (productsAsync.isLoading && !productsAsync.hasValue)
                const SliverFillRemaining(
                  hasScrollBody: false,
                  child: Center(
                    child: CircularProgressIndicator(
                        color: Bl.amber, strokeWidth: 2),
                  ),
                )
              else if (productsAsync.hasError && !productsAsync.hasValue)
                SliverFillRemaining(
                  hasScrollBody: false,
                  child: Center(
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Text(
                          'Could not load inventory. Check your internet and try again.',
                          textAlign: TextAlign.center,
                          style: Bl.inter(13.5, c: Bl.redDeep, h: 1.5)),
                    ),
                  ),
                )
              else if (products.isEmpty)
                const SliverFillRemaining(
                  hasScrollBody: false,
                  child: Center(
                    child: BlEmpty(
                        icon: BlIcons.box, title: 'No products found.'),
                  ),
                )
              else
                SliverList.builder(
                  itemCount: products.length,
                  itemBuilder: (context, i) => _ProductRow(
                    product: products[i],
                    pictures: _pictures,
                    onTap: () => _showProductSheet(context, products[i]),
                  ),
                ),
              SliverToBoxAdapter(
                  child: SizedBox(
                      height: 96 + MediaQuery.of(context).viewPadding.bottom)),
            ],
          ),
        ),
      ),
    );
  }
}

class _InvHeaderDelegate extends SliverPersistentHeaderDelegate {
  final double height;
  final Widget child;
  _InvHeaderDelegate({required this.height, required this.child});

  @override
  double get minExtent => height;
  @override
  double get maxExtent => height;

  @override
  Widget build(BuildContext context, double shrinkOffset, bool overlapsContent) =>
      ColoredBox(color: Bl.white, child: child);

  @override
  bool shouldRebuild(covariant _InvHeaderDelegate old) => true;
}

/// Margin colour: only a thin margin earns a colour.
Color marginColor(double pct) => pct < 5
    ? AppColors.danger
    : pct < 15
        ? AppColors.warning
        : AppColors.onSurfaceVariant;

/// Level bar fill: qty against twice the reorder level, capped at 1.
double stockLevelFraction(double stock, {double reorder = StockLevels.defaultThreshold}) =>
    reorder <= 0 ? 1 : (stock / (reorder * 2)).clamp(0.0, 1.0);

class _ProductRow extends StatelessWidget {
  final Product product;
  final bool pictures;
  final VoidCallback onTap;
  const _ProductRow(
      {required this.product, required this.pictures, required this.onTap});


  @override
  Widget build(BuildContext context) {
    final stock = product.stock;
    final isOut = StockLevels.isOutOfStock(stock);
    final isLow = StockLevels.isLow(stock);
    final unit = (product.unit ?? '').toLowerCase();
    final double? marginPct = product.sellingPrice > 0
        ? (product.sellingPrice - product.costPrice) / product.sellingPrice * 100
        : null;
    final stockColor = isOut
        ? Bl.red
        : isLow
            ? Bl.amberDeep
            : Bl.ink;

    return BlTap(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        decoration: const BoxDecoration(
            border: Border(bottom: BorderSide(color: Bl.sep))),
        child: Row(
          children: [
            if (pictures) ...[
              ProductPicture(name: product.name, image: product.image),
              const SizedBox(width: 12),
            ],
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(product.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Bl.tight(14, w: FontWeight.w600)),
                  if ((product.category ?? '').isNotEmpty) ...[
                    const SizedBox(height: 1),
                    Text(product.category!,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Bl.inter(11.5, c: const Color(0xFF7A8088))),
                  ],
                ],
              ),
            ),
            SizedBox(
              width: 76,
              child: Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  if (isOut || isLow) ...[
                    Container(
                        width: 6,
                        height: 6,
                        decoration: BoxDecoration(
                            color: stockColor, shape: BoxShape.circle)),
                    const SizedBox(width: 6),
                  ],
                  Flexible(
                    child: Text(
                        isOut
                            ? 'Out'
                            : '${_qty(stock)}${unit.isEmpty ? '' : ' $unit'}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Bl.tight(13.5,
                            w: FontWeight.w600, ls: 0, c: stockColor)),
                  ),
                ],
              ),
            ),
            SizedBox(
              width: 70,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(Money.inr(product.sellingPrice),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Bl.tight(13.5, w: FontWeight.w600, ls: 0)),
                  if (marginPct != null)
                    Text('${marginPct.toStringAsFixed(0)}%',
                        style: Bl.inter(11,
                            c: marginPct < 5
                                ? Bl.red
                                : const Color(0xFF7A8088))),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Product detail bottom sheet ──────────────────────────────────────────────

class _ProductDetailSheet extends ConsumerStatefulWidget {
  final Product product;
  const _ProductDetailSheet({required this.product});

  @override
  ConsumerState<_ProductDetailSheet> createState() =>
      _ProductDetailSheetState();
}

class _ProductDetailSheetState extends ConsumerState<_ProductDetailSheet> {
  bool _isDeleting = false;

  // ── Delete ────────────────────────────────────────────────────────────────

  Future<void> _confirmDelete() async {
    final confirmed = await showBlDialog<bool>(
      context: context,
      title: 'Delete product?',
      message:
          'This will permanently remove "${widget.product.name}" from your inventory. This cannot be undone.',
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
              child: BlButton('Delete',
                  kind: BlButtonKind.danger,
                  onTap: () => Navigator.pop(ctx, true)),
            ),
          ],
        ),
      ],
    );
    if (confirmed != true) return;

    setState(() => _isDeleting = true);
    try {
      final repo = ref.read(productRepositoryProvider);
      await repo.deleteProduct(widget.product.id);
      if (mounted) {
        ref.invalidate(productsProvider);
        Navigator.pop(context); // close sheet
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('Product deleted'),
          behavior: SnackBarBehavior.floating,
        ));
      }
    } catch (e) {
      debugPrint('[inventory] delete failed: $e');
      if (mounted) {
        setState(() => _isDeleting = false);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text('Could not delete. $e'),
          backgroundColor: Bl.redDeep,
          behavior: SnackBarBehavior.floating,
        ));
      }
    }
  }

  Future<void> _showAdjustStock() async {
    final currentStock = widget.product.stock.toInt();

    double? lastCost;
    String? lastDate;
    String? lastRef;
    Map<String, dynamic>? lastBatch;
    try {
      final rows = await supabase
          .from('product_batches')
          .select('unit_cost, received_date, purchase_id')
          .eq('product_id', widget.product.id)
          .not('purchase_id', 'is', null)
          .order('received_date', ascending: false)
          .limit(1);
      if (rows.isNotEmpty) lastBatch = Map<String, dynamic>.from(rows.first);
    } catch (e) {
      // Offline this silently fell back to the stored average, which is the very
      // guess the last-purchase default exists to replace. The cache holds the
      // batches, so use them.
      debugPrint('[adjust] last price online failed, using Drift cache: $e');
      try {
        final ctx = await ref.read(tenantContextProvider.future);
        if (ctx != null) {
          final cached = await cachedProductBatches(
            ref.read(databaseProvider),
            ctx.tenantId,
            productId: widget.product.id,
          );
          final billed = cached.where((b) => b['purchase_id'] != null).toList();
          if (billed.isNotEmpty)
            lastBatch = billed.last; // cache is oldest-first
        }
      } catch (_) {
        /* no last price — fall back to the saved cost as before */
      }
    }
    if (lastBatch != null) {
      lastCost = (lastBatch['unit_cost'] as num?)?.toDouble();
      lastDate = lastBatch['received_date'] as String?;
      lastRef = lastBatch['purchase_id'] as String?;
    }

    // Optional purchase price for a manual stock-add (creates a cost batch),
    // pre-filled with what was last paid.

    if (!mounted) return;

    final result = await showBlCustomDialog<({double newStock, double? unitCost})>(
      context: context,
      builder: (_) => _AdjustStockDialog(
        product: widget.product,
        currentStock: currentStock,
        lastCost: lastCost,
        lastDate: lastDate,
        lastRef: lastRef,
      ),
    );
    if (result == null) return;

    try {
      final repo = ref.read(productRepositoryProvider);
      await repo.updateStock(
        widget.product.id,
        result.newStock,
        unitCost: result.unitCost,
      );
      ref.invalidate(productsProvider);
      if (mounted) {
        Navigator.pop(context); // close sheet
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text('Stock updated to ${result.newStock.toInt()}'),
          behavior: SnackBarBehavior.floating,
        ));
      }
    } catch (e) {
      debugPrint('[inventory] stock adjust failed: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(
              'Stock may not have changed. Check this product before trying again. ($e)'),
          backgroundColor: Bl.redDeep,
          behavior: SnackBarBehavior.floating,
          duration: const Duration(seconds: 8),
        ));
      }
    }
  }


  Widget _stat(String label, String value, {Color? c, bool last = false}) =>
      Expanded(
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: last
              ? null
              : const BoxDecoration(
                  border: Border(
                      right: BorderSide(color: Color(0xFFECEBE9)))),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label,
                  style: Bl.inter(11.5,
                      w: FontWeight.w500, c: const Color(0xFF7A8088))),
              const SizedBox(height: 2),
              FittedBox(
                fit: BoxFit.scaleDown,
                alignment: Alignment.centerLeft,
                child: Text(value,
                    style: Bl.tight(16, w: FontWeight.w700, c: c ?? Bl.ink)),
              ),
            ],
          ),
        ),
      );

  Widget _line(String k, String v) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 2, vertical: 10),
        decoration: const BoxDecoration(
            border: Border(bottom: BorderSide(color: Bl.sep))),
        child: Row(
          children: [
            Text(k,
                style: Bl.inter(13.5,
                    w: FontWeight.w500, c: const Color(0xFF7A8088))),
            const SizedBox(width: 12),
            Expanded(
              child: Text(v,
                  textAlign: TextAlign.right,
                  style: Bl.inter(13.5, w: FontWeight.w600, c: Bl.ink)),
            ),
          ],
        ),
      );

  @override
  Widget build(BuildContext context) {
    final p = widget.product;
    final isOut = StockLevels.isOutOfStock(p.stock);
    final isLow = StockLevels.isLow(p.stock);
    final statusColor = isOut
        ? Bl.red
        : isLow
            ? Bl.brand
            : const Color(0xFF1E9E5A);
    final statusText = isOut
        ? Bl.redDeep
        : isLow
            ? Bl.amberDeep
            : const Color(0xFF17663A);
    final statusLabel = isOut ? 'Out of stock' : (isLow ? 'Low stock' : 'In stock');
    final unit = (p.unit ?? 'pcs').toLowerCase();
    final pack = _packSuffix(p);
    final double? margin = p.sellingPrice > 0
        ? (p.sellingPrice - p.costPrice) / p.sellingPrice * 100
        : null;
    final marginColor = margin == null
        ? Bl.mute
        : margin < 0
            ? Bl.red
            : margin < 10
                ? Bl.amberDeep
                : const Color(0xFF17663A);
    final sub = [
      if ((p.category ?? '').isNotEmpty) p.category!,
      if ((p.sku ?? '').isNotEmpty) 'SKU ${p.sku}',
    ].join(' · ');

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
              Container(
                  width: 8,
                  height: 8,
                  decoration: BoxDecoration(
                      color: statusColor, shape: BoxShape.circle)),
              const SizedBox(width: 8),
              Expanded(
                child: Text(statusLabel,
                    style:
                        Bl.inter(12.5, w: FontWeight.w600, c: statusText)),
              ),
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
        const SizedBox(height: 10),
        Row(
          children: [
            ProductPicture(
                name: p.name,
                image: p.image,
                size: 64,
                radius: 16,
                fontSize: 19),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(p.name,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: Bl.tight(19, w: FontWeight.w700, ls: -0.02)),
                  if (sub.isNotEmpty) ...[
                    const SizedBox(height: 2),
                    Text(sub,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Bl.inter(12.5,
                            w: FontWeight.w500, c: const Color(0xFF7A8088))),
                  ],
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 16),
        Row(
          crossAxisAlignment: CrossAxisAlignment.baseline,
          textBaseline: TextBaseline.alphabetic,
          children: [
            Expanded(
              child: Text.rich(
                TextSpan(
                  text: '${_qty(p.stock)} ',
                  style: Bl.tight(32, w: FontWeight.w700, ls: -0.04, h: 1),
                  children: [
                    TextSpan(
                        text: '$unit in stock',
                        style: Bl.inter(14,
                            w: FontWeight.w500, c: const Color(0xFF7A8088))),
                  ],
                ),
              ),
            ),
            Text('Alert below ${StockLevels.defaultThreshold.toInt()}',
                style: Bl.inter(12.5,
                    w: FontWeight.w500, c: const Color(0xFF7A8088))),
          ],
        ),
        const SizedBox(height: 10),
        ClipRRect(
          borderRadius: BorderRadius.circular(3),
          child: LinearProgressIndicator(
            value: stockLevelFraction(p.stock),
            minHeight: 6,
            backgroundColor: const Color(0xFFEFEEEC),
            color: statusColor,
            semanticsLabel: 'Stock level',
          ),
        ),
        Container(
          margin: const EdgeInsets.only(top: 14),
          decoration: BoxDecoration(
            border: Border.all(color: const Color(0xFFECEBE9)),
            borderRadius: BorderRadius.circular(14),
          ),
          child: Row(
            children: [
              _stat('Cost', Money.inr(p.costPrice)),
              _stat('Selling', Money.inr(p.sellingPrice)),
              _stat(
                  'Margin', margin == null ? '—' : '${margin.toStringAsFixed(1)}%',
                  c: marginColor, last: true),
            ],
          ),
        ),
        const SizedBox(height: 8),
        if (pack != null)
          _line('Per $pack',
              'Cost ${Money.inr(p.costPrice * p.conversionFactor!)} · sells ${Money.inr(p.sellingPrice * p.conversionFactor!)}'),
        _line('Tax rate', 'GST ${p.taxRate.toStringAsFixed(0)}%'),
        _line('Stock value at cost', Money.inr(p.stock * p.costPrice)),
        const SizedBox(height: 14),
        Row(
          children: [
            Expanded(
              flex: 10,
              child: BlButton('Edit',
                  kind: BlButtonKind.soft,
                  onTap: () {
                    Navigator.pop(context);
                    Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) =>
                            AddProductScreen(product: widget.product),
                      ),
                    ).then((_) => ref.invalidate(productsProvider));
                  }),
            ),
            const SizedBox(width: 8),
            Expanded(
                flex: 14,
                child: BlButton('Adjust stock', onTap: _showAdjustStock)),
            const SizedBox(width: 8),
            BlTap(
              label: 'Delete product',
              onTap: _isDeleting ? null : _confirmDelete,
              child: Container(
                width: 48,
                height: 46,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                    color: const Color(0xFFFEF2F2),
                    borderRadius: BorderRadius.circular(999)),
                child: _isDeleting
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(
                            strokeWidth: 2, color: Bl.redDeep))
                    : const BlIcon(
                        '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
                        size: 20,
                        color: Bl.redDeep),
              ),
            ),
          ],
        ),
      ],
    );
  }
}

/// "Adjust Stock" (canvas): set the new count; when stock goes up, say what
/// each unit cost so profit on them is right. Returns the new count and cost,
/// or null when cancelled. It does not save anything itself.
class _AdjustStockDialog extends StatefulWidget {
  final Product product;
  final int currentStock;
  final double? lastCost;
  final String? lastDate;
  final String? lastRef;
  const _AdjustStockDialog({
    required this.product,
    required this.currentStock,
    this.lastCost,
    this.lastDate,
    this.lastRef,
  });

  @override
  State<_AdjustStockDialog> createState() => _AdjustStockDialogState();
}

class _AdjustStockDialogState extends State<_AdjustStockDialog> {
  late int _adjustment = 0;
  late final _stockCtrl = TextEditingController(text: '${widget.currentStock}');
  late final _costCtrl = TextEditingController(
    text: (widget.lastCost != null && widget.lastCost! > 0)
        ? widget.lastCost!.toStringAsFixed(2)
        : '',
  );

  int get _cur => widget.currentStock;

  @override
  void dispose() {
    _stockCtrl.dispose();
    _costCtrl.dispose();
    super.dispose();
  }

  void _step(int by) => setState(() {
        _adjustment += by;
        if (_cur + _adjustment < 0) _adjustment = -_cur;
        _stockCtrl.text = '${(_cur + _adjustment).clamp(0, 999999)}';
      });

  Widget _round(String icon, String label, bool primary, VoidCallback onTap) =>
      BlTap(
        label: label,
        onTap: onTap,
        child: Container(
          width: 44,
          height: 44,
          alignment: Alignment.center,
          decoration: BoxDecoration(
              color: primary ? Bl.amber : Bl.well, shape: BoxShape.circle),
          child: BlIcon(icon,
              size: 20, stroke: 2.4, color: primary ? Bl.white : Bl.ink),
        ),
      );

  @override
  Widget build(BuildContext context) {
    final up = _adjustment > 0;
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('Adjust Stock', style: Bl.tight(16, w: FontWeight.w700)),
        const SizedBox(height: 2),
        Text('${widget.product.name} · current stock $_cur',
            style: Bl.inter(12, w: FontWeight.w500, c: Bl.mute)),
        const SizedBox(height: 16),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            _round(BlIcons.minus, 'One less', false, () => _step(-1)),
            const SizedBox(width: 16),
            SizedBox(
              width: 120,
              child: TextField(
                controller: _stockCtrl,
                textAlign: TextAlign.center,
                keyboardType: TextInputType.number,
                cursorColor: Bl.brand,
                inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                style: Bl.tight(42, w: FontWeight.w700, ls: -0.04, h: 1.1),
                decoration: const InputDecoration(
                  isDense: true,
                  filled: false,
                  contentPadding: EdgeInsets.zero,
                  border: InputBorder.none,
                  enabledBorder: InputBorder.none,
                  focusedBorder: InputBorder.none,
                ),
                onChanged: (v) {
                  final n = int.tryParse(v.trim());
                  if (n != null) {
                    setState(() => _adjustment = n.clamp(0, 999999) - _cur);
                  }
                },
              ),
            ),
            const SizedBox(width: 16),
            _round(BlIcons.plus, 'One more', true, () => _step(1)),
          ],
        ),
        const SizedBox(height: 6),
        Text(
            _adjustment == 0
                ? 'No change'
                : '${up ? '+' : ''}$_adjustment from current ($_cur)',
            textAlign: TextAlign.center,
            style: Bl.inter(12.5,
                w: FontWeight.w600,
                c: _adjustment == 0
                    ? Bl.mute
                    : up
                        ? Bl.green
                        : Bl.red)),
        if (up) ...[
          Container(
            margin: const EdgeInsets.only(top: 14),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
                color: const Color(0xFFF3F2F0),
                borderRadius: BorderRadius.circular(12)),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                    widget.lastRef != null
                        ? 'Purchase price / unit · last paid'
                        : 'Purchase price / unit (optional)',
                    style: Bl.inter(10, w: FontWeight.w500, c: Bl.mute)),
                const SizedBox(height: 1),
                Row(
                  children: [
                    Text('₹ ', style: Bl.tight(14.5, w: FontWeight.w600)),
                    Expanded(
                      child: TextField(
                        controller: _costCtrl,
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
                          hintText:
                              'Blank uses saved ${widget.product.costPrice.toStringAsFixed(2)}',
                          hintStyle: Bl.inter(12.5,
                              w: FontWeight.w500, c: Bl.faint),
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 6),
          Text(
              widget.lastRef != null
                  ? 'Defaulted to ₹${widget.lastCost!.toStringAsFixed(2)} · last bought ${widget.lastDate ?? ''} on ${widget.lastRef}. Change it if this lot cost something else.'
                  : 'Enter what you paid so profit on these units is exact.',
              style: Bl.inter(11.5, w: FontWeight.w500, c: Bl.mute, h: 1.4)),
        ],
        const SizedBox(height: 14),
        Row(
          children: [
            Expanded(
              child: BlButton('Cancel',
                  kind: BlButtonKind.soft, onTap: () => Navigator.pop(context)),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: BlButton('Apply',
                  onTap: _adjustment == 0
                      ? null
                      : () {
                          final cost = double.tryParse(_costCtrl.text.trim());
                          Navigator.pop(context, (
                            newStock: (_cur + _adjustment)
                                .clamp(0, 999999)
                                .toDouble(),
                            unitCost: (up && cost != null && cost > 0)
                                ? cost
                                : null,
                          ));
                        }),
            ),
          ],
        ),
      ],
    );
  }
}

String? _packSuffix(dynamic p) {
  final c = p.conversionFactor as double?;
  final u = p.secondaryUnit as String?;
  return (u != null && u.isNotEmpty && c != null && c > 0) ? u : null;
}

String _qty(double v) =>
    v == v.roundToDouble() ? v.toInt().toString() : v.toStringAsFixed(2);

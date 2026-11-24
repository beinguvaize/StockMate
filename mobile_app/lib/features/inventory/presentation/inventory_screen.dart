import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:mobile_app/core/design/bl_widgets.dart';
import 'package:mobile_app/core/widgets/barcode_scanner_screen.dart';
import 'package:mobile_app/widgets/motion/motion_curves.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/core/database/database.dart';
import 'package:mobile_app/core/database/offline_reads.dart';
import 'package:mobile_app/core/supabase/client.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:mobile_app/core/utils/money.dart';
import 'package:mobile_app/core/theme/typography.dart';
import 'package:mobile_app/core/widgets/app_button.dart' show AppTappable;
import 'package:mobile_app/main.dart' show databaseProvider;
import 'package:mobile_app/features/inventory/presentation/add_product_screen.dart';
import 'package:mobile_app/features/inventory/presentation/providers/inventory_provider.dart';
import 'package:mobile_app/core/utils/stock_levels.dart';
import 'package:mobile_app/widgets/motion/motion_refresh.dart';
import 'package:mobile_app/widgets/motion/motion_sheet.dart';

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
    showMotionSheet(
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

  // Tile tints for the picture view until a product has a photo.
  static const _tints = [
    (Color(0xFFFFF3D6), Color(0xFF8A5A00)),
    (Color(0xFFE8F1FF), Color(0xFF1D4E9E)),
    (Color(0xFFE6F6EC), Color(0xFF17663A)),
    (Color(0xFFFDECEC), Color(0xFFA32A2A)),
    (Color(0xFFF1ECFF), Color(0xFF5133A8)),
  ];

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
    final (tintBg, tintFg) = _tints[product.name.hashCode.abs() % _tints.length];
    final photo = product.image;
    final hasPhoto = photo != null && photo.startsWith('http');

    return BlTap(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        decoration: const BoxDecoration(
            border: Border(bottom: BorderSide(color: Bl.sep))),
        child: Row(
          children: [
            if (pictures) ...[
              Container(
                width: 44,
                height: 44,
                alignment: Alignment.center,
                clipBehavior: Clip.antiAlias,
                decoration: BoxDecoration(
                    color: tintBg, borderRadius: BorderRadius.circular(11)),
                child: hasPhoto
                    ? Image.network(photo,
                        width: 44,
                        height: 44,
                        fit: BoxFit.cover,
                        excludeFromSemantics: true,
                        errorBuilder: (_, _, _) => Text(
                            BlPartyAvatar.initials(product.name),
                            style: Bl.tight(13,
                                w: FontWeight.w700, ls: 0, c: tintFg)))
                    : Text(BlPartyAvatar.initials(product.name),
                        style:
                            Bl.tight(13, w: FontWeight.w700, ls: 0, c: tintFg)),
              ),
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
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: Colors.white,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: Text(
          'Delete Product?',
          style: GoogleFonts.manrope(
            fontWeight: FontWeight.w700,
            color: AppColors.inkPrimary,
            fontSize: 18,
          ),
        ),
        content: Text(
          'This will permanently remove "${widget.product.name}" from your inventory. This action cannot be undone.',
          style: GoogleFonts.manrope(
            fontSize: 14,
            color: AppColors.inkSecondary,
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text(
              'Cancel',
              style: GoogleFonts.manrope(color: AppColors.inkSecondary),
            ),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.danger,
              foregroundColor: Colors.white,
              shape: const StadiumBorder(),
              elevation: 0,
            ),
            child: Text(
              'Delete',
              style: GoogleFonts.manrope(fontWeight: FontWeight.w700),
            ),
          ),
        ],
      ),
    );

    if (confirmed != true) return;

    setState(() => _isDeleting = true);
    try {
      final repo = ref.read(productRepositoryProvider);
      await repo.deleteProduct(widget.product.id);
      if (mounted) {
        ref.invalidate(productsProvider);
        Navigator.pop(context); // close sheet
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              'Product deleted',
              style: GoogleFonts.manrope(color: Colors.white),
            ),
            backgroundColor: AppColors.danger,
            behavior: SnackBarBehavior.floating,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        setState(() => _isDeleting = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              'Error: $e',
              style: GoogleFonts.manrope(color: Colors.white),
            ),
            backgroundColor: AppColors.danger,
            behavior: SnackBarBehavior.floating,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
          ),
        );
      }
    }
  }

  // ── Adjust Stock dialog ───────────────────────────────────────────────────

  Future<void> _showAdjustStock() async {
    final currentStock = widget.product.stock.toInt();
    int adjustment = 0;
    // Typeable new-stock value; +/- keep it in sync.
    final stockCtrl = TextEditingController(text: '$currentStock');

    // Last price actually PAID for this product — the newest batch tracing to a
    // purchase. Adjustments used to fall back to products.costPrice (a blend of
    // open batches, or a typed number), so stock added by hand was costed from
    // an average rather than a bill. Defaulting to the real last price makes the
    // figure answerable, and it stays editable.
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
    final costCtrl = TextEditingController(
      text: (lastCost != null && lastCost > 0)
          ? lastCost.toStringAsFixed(2)
          : '',
    );

    if (!mounted) return;

    await showDialog(
      context: context,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (ctx, setDlgState) {
            return AlertDialog(
              backgroundColor: Colors.white,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(20),
              ),
              title: Text(
                'Adjust Stock',
                style: GoogleFonts.manrope(
                  fontWeight: FontWeight.w700,
                  color: AppColors.inkPrimary,
                  fontSize: 18,
                ),
              ),
              content: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    widget.product.name,
                    style: AppText.caption.copyWith(
                      color: AppColors.inkSecondary,
                    ),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 24),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      // Minus button
                      _StockAdjustBtn(
                        icon: LucideIcons.minus,
                        onTap: () => setDlgState(() {
                          adjustment--;
                          if (currentStock + adjustment < 0)
                            adjustment = -currentStock;
                          stockCtrl.text = '${currentStock + adjustment}';
                        }),
                      ),
                      const SizedBox(width: 16),
                      // New stock — tap to type an exact value
                      Column(
                        children: [
                          SizedBox(
                            width: 120,
                            child: TextField(
                              controller: stockCtrl,
                              textAlign: TextAlign.center,
                              keyboardType: TextInputType.number,
                              style: GoogleFonts.manrope(
                                fontSize: 40,
                                fontWeight: FontWeight.w700,
                                color: AppColors.primary,
                                letterSpacing: -1,
                              ),
                              decoration: const InputDecoration(
                                border: InputBorder.none,
                                isDense: true,
                                contentPadding: EdgeInsets.zero,
                              ),
                              onChanged: (v) {
                                final n = int.tryParse(v.trim());
                                if (n != null) {
                                  setDlgState(
                                    () => adjustment =
                                        n.clamp(0, 999999) - currentStock,
                                  );
                                }
                              },
                            ),
                          ),
                          Text(
                            'new stock',
                            style: AppText.caption.copyWith(
                              color: AppColors.inkTertiary,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(width: 16),
                      // Plus button
                      _StockAdjustBtn(
                        icon: LucideIcons.plus,
                        onTap: () => setDlgState(() {
                          adjustment++;
                          stockCtrl.text =
                              '${(currentStock + adjustment).clamp(0, 999999)}';
                        }),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  if (adjustment != 0)
                    Text(
                      '${adjustment > 0 ? "+" : ""}$adjustment from current ($currentStock)',
                      style: AppText.caption.copyWith(
                        color: adjustment > 0
                            ? AppColors.success
                            : AppColors.danger,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  // Purchase price — only when adding stock. Blank = use saved cost.
                  if (adjustment > 0) ...[
                    const SizedBox(height: 16),
                    TextField(
                      controller: costCtrl,
                      keyboardType: const TextInputType.numberWithOptions(
                        decimal: true,
                      ),
                      style: GoogleFonts.manrope(
                        fontSize: 14,
                        color: AppColors.inkPrimary,
                      ),
                      decoration: InputDecoration(
                        prefixText: '₹ ',
                        labelText: lastRef != null
                            ? 'Purchase price / unit · last paid'
                            : 'Purchase price / unit (optional)',
                        labelStyle: AppText.caption.copyWith(
                          color: AppColors.inkSecondary,
                        ),
                        hintText:
                            'Cost each — blank uses saved ₹${widget.product.costPrice.toStringAsFixed(2)}',
                        hintStyle: AppText.caption.copyWith(
                          color: AppColors.inkTertiary,
                        ),
                        isDense: true,
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      lastRef != null
                          ? 'Defaulted to ₹${lastCost!.toStringAsFixed(2)} — last bought ${lastDate ?? ''} on $lastRef. Change it if this lot cost something else.'
                          : 'Enter what you paid so profit on these units is exact.',
                      style: AppText.caption.copyWith(
                        color: AppColors.inkTertiary,
                      ),
                    ),
                  ],
                ],
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.pop(ctx),
                  child: Text(
                    'Cancel',
                    style: GoogleFonts.manrope(color: AppColors.inkSecondary),
                  ),
                ),
                ElevatedButton(
                  onPressed: adjustment == 0
                      ? null
                      : () async {
                          final newStockVal = (currentStock + adjustment)
                              .clamp(0, 999999)
                              .toDouble();
                          Navigator.pop(ctx);
                          try {
                            final repo = ref.read(productRepositoryProvider);
                            final cost = double.tryParse(costCtrl.text.trim());
                            await repo.updateStock(
                              widget.product.id,
                              newStockVal,
                              unitCost:
                                  (adjustment > 0 && cost != null && cost > 0)
                                  ? cost
                                  : null,
                            );
                            ref.invalidate(productsProvider);
                            if (mounted) {
                              Navigator.pop(context); // close sheet
                              ScaffoldMessenger.of(context).showSnackBar(
                                SnackBar(
                                  content: Text(
                                    'Stock updated to ${newStockVal.toInt()}',
                                    style: GoogleFonts.manrope(
                                      color: AppColors.inkPrimary,
                                    ),
                                  ),
                                  backgroundColor: AppColors.primaryContainer,
                                  behavior: SnackBarBehavior.floating,
                                  shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(12),
                                  ),
                                ),
                              );
                            }
                          } catch (e) {
                            if (mounted) {
                              ScaffoldMessenger.of(context).showSnackBar(
                                SnackBar(
                                  content: Text(
                                    'Error: $e',
                                    style: GoogleFonts.manrope(
                                      color: Colors.white,
                                    ),
                                  ),
                                  backgroundColor: AppColors.danger,
                                  behavior: SnackBarBehavior.floating,
                                  shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(12),
                                  ),
                                ),
                              );
                            }
                          }
                        },
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.primaryContainer,
                    foregroundColor: AppColors.inkPrimary,
                    shape: const StadiumBorder(),
                    elevation: 0,
                  ),
                  child: Text(
                    'Apply',
                    style: GoogleFonts.manrope(fontWeight: FontWeight.w700),
                  ),
                ),
              ],
            );
          },
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final p = widget.product;
    final stock = p.stock.toInt();
    final isOut = stock == 0;
    final isLow = stock > 0 && stock <= 10;
    final statusColor = isOut
        ? AppColors.danger
        : (isLow ? AppColors.warning : AppColors.success);
    final statusLabel = isOut
        ? 'Out of Stock'
        : (isLow ? 'Low Stock' : 'In Stock');

    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
      padding: EdgeInsets.only(
        left: 24,
        right: 24,
        top: 16,
        bottom: MediaQuery.of(context).viewInsets.bottom + 32,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Drag handle
          Center(
            child: Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: AppColors.inkTertiary.withValues(alpha: 0.3),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          const SizedBox(height: 20),

          // Product header
          Row(
            children: [
              Container(
                width: 52,
                height: 52,
                decoration: const BoxDecoration(
                  color: AppColors.primaryContainer,
                  shape: BoxShape.circle,
                ),
                child: const Icon(
                  LucideIcons.package,
                  size: 24,
                  color: AppColors.primary,
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      p.name,
                      style: GoogleFonts.manrope(
                        fontSize: 18,
                        fontWeight: FontWeight.w700,
                        color: AppColors.inkPrimary,
                        letterSpacing: -0.3,
                      ),
                    ),
                    Text(
                      'SKU: ${p.sku ?? "N/A"}',
                      style: AppText.caption.copyWith(
                        color: AppColors.inkTertiary,
                      ),
                    ),
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 10,
                  vertical: 4,
                ),
                decoration: BoxDecoration(
                  color: statusColor.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Text(
                  statusLabel,
                  style: AppText.label.copyWith(
                    fontWeight: FontWeight.w700,
                    color: statusColor,
                  ),
                ),
              ),
            ],
          ),

          const SizedBox(height: 20),
          Divider(color: AppColors.inkTertiary.withValues(alpha: 0.12)),
          const SizedBox(height: 12),

          // Details grid
          _DetailRow(label: 'Category', value: p.category ?? 'N/A'),
          // Cost and price are held per base unit. A product bought by weight
          // and sold in packets is judged per packet, so show that too rather
          // than making the shopkeeper divide in their head. Margin is a ratio,
          // so it reads the same either way and is not duplicated.
          _DetailRow(
            label: 'Cost Price',
            value: _packSuffix(p) == null
                ? '₹${p.costPrice.toStringAsFixed(2)}'
                : '₹${p.costPrice.toStringAsFixed(2)}  ·  ₹${(p.costPrice * p.conversionFactor!).toStringAsFixed(2)}/${p.secondaryUnit}',
          ),
          _DetailRow(
            label: 'Selling Price',
            value: _packSuffix(p) == null
                ? '₹${p.sellingPrice.toStringAsFixed(2)}'
                : '₹${p.sellingPrice.toStringAsFixed(2)}  ·  ₹${(p.sellingPrice * p.conversionFactor!).toStringAsFixed(2)}/${p.secondaryUnit}',
          ),
          _DetailRow(
            label: 'Margin',
            value: p.sellingPrice > 0
                ? '${((p.sellingPrice - p.costPrice) / p.sellingPrice * 100).toStringAsFixed(1)}%'
                : '—',
            valueColor: p.sellingPrice <= 0
                ? AppColors.inkTertiary
                : (p.sellingPrice - p.costPrice) < 0
                ? AppColors.error
                : ((p.sellingPrice - p.costPrice) / p.sellingPrice * 100) < 10
                ? AppColors.warning
                : AppColors.success,
          ),
          _DetailRow(
            label: 'Stock',
            value: '${p.stock.toInt()} ${p.unit ?? "pcs"}',
          ),
          _DetailRow(
            label: 'Tax Rate',
            value: '${p.taxRate.toStringAsFixed(0)}%',
          ),

          const SizedBox(height: 24),

          // Action buttons
          Row(
            children: [
              // Edit
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () {
                    Navigator.pop(context);
                    Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) =>
                            AddProductScreen(product: widget.product),
                      ),
                    ).then((_) => ref.invalidate(productsProvider));
                  },
                  icon: const Icon(LucideIcons.pencil, size: 16),
                  label: Text(
                    'Edit',
                    style: GoogleFonts.manrope(fontWeight: FontWeight.w600),
                  ),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: AppColors.primary,
                    side: const BorderSide(
                      color: AppColors.primaryContainer,
                      width: 1.5,
                    ),
                    shape: const StadiumBorder(),
                    padding: const EdgeInsets.symmetric(vertical: 12),
                  ),
                ),
              ),
              const SizedBox(width: 10),

              // Adjust Stock
              Expanded(
                child: ElevatedButton.icon(
                  onPressed: _showAdjustStock,
                  icon: const Icon(LucideIcons.layers, size: 16),
                  label: Text(
                    'Adjust Stock',
                    style: GoogleFonts.manrope(fontWeight: FontWeight.w600),
                  ),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.primaryContainer,
                    foregroundColor: AppColors.inkPrimary,
                    elevation: 0,
                    shape: const StadiumBorder(),
                    padding: const EdgeInsets.symmetric(vertical: 12),
                  ),
                ),
              ),
              const SizedBox(width: 10),

              // Delete
              SizedBox(
                height: 44,
                width: 44,
                child: _isDeleting
                    ? const Center(
                        child: SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(
                            color: AppColors.danger,
                            strokeWidth: 2,
                          ),
                        ),
                      )
                    : IconButton(
                        onPressed: _confirmDelete,
                        icon: const Icon(LucideIcons.trash2, size: 18),
                        style: IconButton.styleFrom(
                          backgroundColor: AppColors.danger.withValues(
                            alpha: 0.1,
                          ),
                          foregroundColor: AppColors.danger,
                          shape: const CircleBorder(),
                        ),
                      ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

// ── Helper widgets ───────────────────────────────────────────────────────────

String? _packSuffix(dynamic p) {
  final c = p.conversionFactor as double?;
  final u = p.secondaryUnit as String?;
  return (u != null && u.isNotEmpty && c != null && c > 0) ? u : null;
}

class _DetailRow extends StatelessWidget {
  final String label;
  final String value;
  final Color? valueColor;
  const _DetailRow({required this.label, required this.value, this.valueColor});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: AppText.caption.copyWith(color: AppColors.inkSecondary),
          ),
          Text(
            value,
            style: AppText.label.copyWith(
              color: valueColor ?? AppColors.inkPrimary,
            ),
          ),
        ],
      ),
    );
  }
}

class _StockAdjustBtn extends StatelessWidget {
  final IconData icon;
  final VoidCallback onTap;
  const _StockAdjustBtn({required this.icon, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return AppTappable(
      ripple: false,
      onTap: () {
        HapticFeedback.lightImpact();
        onTap();
      },
      child: Container(
        width: 44,
        height: 44,
        decoration: BoxDecoration(
          color: AppColors.primaryContainer.withValues(alpha: 0.6),
          shape: BoxShape.circle,
        ),
        child: Icon(icon, size: 20, color: AppColors.primary),
      ),
    );
  }
}

/// 8.0 prints as "8" and 8.5 as "8.5". A shop that sells by the kilo has
/// fractional stock, and padding every whole number with ".0" makes the
/// common case noisier to read than the rare one.
String _qty(double v) =>
    v == v.roundToDouble() ? v.toInt().toString() : v.toStringAsFixed(2);

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile_app/core/database/database.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:mobile_app/features/inventory/presentation/add_product_screen.dart';
import 'package:mobile_app/features/inventory/presentation/providers/inventory_provider.dart';

class InventoryScreen extends ConsumerStatefulWidget {
  const InventoryScreen({super.key});

  @override
  ConsumerState<InventoryScreen> createState() => _InventoryScreenState();
}

class _InventoryScreenState extends ConsumerState<InventoryScreen> {
  final _searchController = TextEditingController();
  int _filterIndex = 0; // 0=All, 1=Low Stock, 2=Out of Stock

  @override
  void initState() {
    super.initState();
    _searchController.addListener(() {
      ref.read(searchQueryProvider.notifier).state = _searchController.text;
    });
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  // ── Bottom sheet ────────────────────────────────────────────────────────────

  void _showProductSheet(BuildContext context, Product product) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (_) => _ProductDetailSheet(product: product),
    ).then((_) {
      // Refresh list after any action taken in the sheet
      ref.invalidate(productsProvider);
    });
  }

  @override
  Widget build(BuildContext context) {
    final filters = ['All', 'Low Stock', 'Out of Stock'];

    return Scaffold(
      backgroundColor: AppColors.canvas,
      appBar: AppBar(
        backgroundColor: AppColors.canvas,
        elevation: 0,
        scrolledUnderElevation: 0,
        toolbarHeight: 0,
        actions: const [],
      ),
      floatingActionButton: FloatingActionButton(
        heroTag: null,
        onPressed: () => Navigator.push(
          context,
          MaterialPageRoute(builder: (_) => const AddProductScreen()),
        ).then((_) => ref.invalidate(productsProvider)),
        backgroundColor: AppColors.secondary,
        foregroundColor: AppColors.primaryContainer,
        elevation: 4,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
        child: const Icon(LucideIcons.plus, size: 26),
      ),
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // ── Header ─────────────────────────────────────────────
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 20, 24, 0),
              child: Text(
                'Inventory',
                style: GoogleFonts.hankenGrotesk(
                  fontSize: 28,
                  fontWeight: FontWeight.w700,
                  color: AppColors.inkPrimary,
                  letterSpacing: -0.3,
                ),
              ),
            ),

            const SizedBox(height: 16),

            // ── Search bar ──────────────────────────────────────────
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24),
              child: TextField(
                controller: _searchController,
                style: GoogleFonts.inter(fontSize: 14, color: AppColors.inkPrimary),
                decoration: InputDecoration(
                  hintText: 'Search products, SKU…',
                  hintStyle: GoogleFonts.inter(fontSize: 14, color: AppColors.inkTertiary),
                  prefixIcon: const Icon(LucideIcons.search, size: 18, color: AppColors.inkTertiary),
                  filled: true,
                  fillColor: AppColors.surfaceContainer,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(16),
                    borderSide: BorderSide.none,
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(16),
                    borderSide: BorderSide.none,
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(16),
                    borderSide: const BorderSide(color: AppColors.primaryContainer, width: 2),
                  ),
                  contentPadding: const EdgeInsets.symmetric(vertical: 14),
                ),
              ),
            ),

            const SizedBox(height: 16),

            // ── Filter chips ───────────────────────────────────────
            SizedBox(
              height: 36,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 24),
                itemCount: filters.length,
                separatorBuilder: (context, index) => const SizedBox(width: 8),
                itemBuilder: (context, i) {
                  final isActive = _filterIndex == i;
                  return GestureDetector(
                    onTap: () => setState(() => _filterIndex = i),
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 200),
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                      decoration: BoxDecoration(
                        color: isActive ? AppColors.primaryContainer : Colors.white,
                        borderRadius: BorderRadius.circular(100),
                        boxShadow: [AppColors.cardShadow],
                      ),
                      child: Text(
                        filters[i],
                        style: GoogleFonts.inter(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: isActive ? AppColors.primary : AppColors.inkTertiary,
                        ),
                      ),
                    ),
                  );
                },
              ),
            ),

            const SizedBox(height: 16),

            // ── Product list ───────────────────────────────────────
            Expanded(
              child: ref.watch(filteredProductsProvider).when(
                data: (allProducts) {
                  final products = allProducts.where((p) {
                    if (_filterIndex == 1) return p.stock > 0 && p.stock <= 10;
                    if (_filterIndex == 2) return p.stock == 0;
                    return true;
                  }).toList();

                  final lowCount = allProducts.where((p) => p.stock <= 10).length;

                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Stats row
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 24),
                        child: Row(
                          children: [
                            Expanded(
                              child: Container(
                                padding: const EdgeInsets.all(20),
                                decoration: BoxDecoration(
                                  color: Colors.white,
                                  borderRadius: BorderRadius.circular(20),
                                  boxShadow: [AppColors.cardShadow],
                                ),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      'TOTAL ITEMS',
                                      style: GoogleFonts.jetBrainsMono(
                                        fontSize: 10,
                                        color: AppColors.inkTertiary,
                                        letterSpacing: 0.5,
                                      ),
                                    ),
                                    const SizedBox(height: 4),
                                    Text(
                                      '${allProducts.length}',
                                      style: GoogleFonts.hankenGrotesk(
                                        fontSize: 28,
                                        fontWeight: FontWeight.w700,
                                        color: AppColors.primary,
                                        letterSpacing: -0.5,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Container(
                                padding: const EdgeInsets.all(20),
                                decoration: BoxDecoration(
                                  color: Colors.white,
                                  borderRadius: BorderRadius.circular(20),
                                  boxShadow: [AppColors.cardShadow],
                                ),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      'LOW STOCK',
                                      style: GoogleFonts.jetBrainsMono(
                                        fontSize: 10,
                                        color: AppColors.inkTertiary,
                                        letterSpacing: 0.5,
                                      ),
                                    ),
                                    const SizedBox(height: 4),
                                    Text(
                                      '$lowCount',
                                      style: GoogleFonts.hankenGrotesk(
                                        fontSize: 28,
                                        fontWeight: FontWeight.w700,
                                        color: AppColors.warning,
                                        letterSpacing: -0.5,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),

                      const SizedBox(height: 20),

                      // Section header
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 24),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text(
                              'Inventory Items',
                              style: GoogleFonts.hankenGrotesk(
                                fontSize: 16,
                                fontWeight: FontWeight.w700,
                                color: AppColors.inkPrimary,
                              ),
                            ),
                            TextButton(
                              onPressed: () => setState(() => _filterIndex = 0),
                              style: TextButton.styleFrom(
                                foregroundColor: AppColors.primary,
                                padding: EdgeInsets.zero,
                                minimumSize: Size.zero,
                                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                              ),
                              child: Text(
                                'VIEW ALL',
                                style: GoogleFonts.inter(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w700,
                                  color: AppColors.primary,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),

                      const SizedBox(height: 12),

                      // List
                      Expanded(
                        child: products.isEmpty
                            ? Center(
                                child: Text(
                                  'No products found.',
                                  style: GoogleFonts.inter(color: AppColors.inkTertiary),
                                ),
                              )
                            : ListView.separated(
                                padding: const EdgeInsets.fromLTRB(24, 0, 24, 100),
                                itemCount: products.length,
                                separatorBuilder: (context, index) => const SizedBox(height: 12),
                                itemBuilder: (context, index) {
                                  final product = products[index];
                                  final stock = product.stock.toInt();
                                  final isLow = stock > 0 && stock <= 10;
                                  final isOut = stock == 0;

                                  Color statusColor;
                                  String statusLabel;
                                  if (isOut) {
                                    statusColor = AppColors.danger;
                                    statusLabel = 'Out of Stock';
                                  } else if (isLow) {
                                    statusColor = AppColors.warning;
                                    statusLabel = 'Low Stock';
                                  } else {
                                    statusColor = AppColors.success;
                                    statusLabel = 'In Stock';
                                  }

                                  return GestureDetector(
                                    onTap: () => _showProductSheet(context, product),
                                    child: Container(
                                      padding: const EdgeInsets.all(16),
                                      decoration: BoxDecoration(
                                        color: Colors.white,
                                        borderRadius: BorderRadius.circular(20),
                                        boxShadow: [AppColors.cardShadow],
                                      ),
                                      child: Row(
                                        children: [
                                          // Icon circle
                                          Container(
                                            width: 44,
                                            height: 44,
                                            decoration: const BoxDecoration(
                                              color: AppColors.primaryContainer,
                                              shape: BoxShape.circle,
                                            ),
                                            child: const Icon(LucideIcons.package, size: 20, color: AppColors.primary),
                                          ),
                                          const SizedBox(width: 14),

                                          // Name + SKU
                                          Expanded(
                                            child: Column(
                                              crossAxisAlignment: CrossAxisAlignment.start,
                                              children: [
                                                Text(
                                                  product.name,
                                                  style: GoogleFonts.hankenGrotesk(
                                                    fontSize: 15,
                                                    fontWeight: FontWeight.w600,
                                                    color: AppColors.inkPrimary,
                                                  ),
                                                ),
                                                const SizedBox(height: 2),
                                                Text(
                                                  'SKU: ${product.sku ?? "N/A"}',
                                                  style: GoogleFonts.jetBrainsMono(
                                                    fontSize: 11,
                                                    color: AppColors.inkTertiary,
                                                  ),
                                                ),
                                              ],
                                            ),
                                          ),

                                          // Price + status chip
                                          Column(
                                            crossAxisAlignment: CrossAxisAlignment.end,
                                            children: [
                                              Text(
                                                '₹${product.sellingPrice.toStringAsFixed(0)}',
                                                style: GoogleFonts.hankenGrotesk(
                                                  fontSize: 15,
                                                  fontWeight: FontWeight.w700,
                                                  color: AppColors.inkPrimary,
                                                ),
                                              ),
                                              const SizedBox(height: 4),
                                              Container(
                                                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                                decoration: BoxDecoration(
                                                  color: statusColor.withValues(alpha: 0.12),
                                                  borderRadius: BorderRadius.circular(8),
                                                ),
                                                child: Text(
                                                  statusLabel,
                                                  style: GoogleFonts.inter(
                                                    fontSize: 10,
                                                    fontWeight: FontWeight.w700,
                                                    color: statusColor,
                                                  ),
                                                ),
                                              ),
                                            ],
                                          ),

                                          // Chevron hint
                                          const SizedBox(width: 8),
                                          const Icon(LucideIcons.chevronRight, size: 16, color: AppColors.inkTertiary),
                                        ],
                                      ),
                                    ),
                                  );
                                },
                              ),
                      ),
                    ],
                  );
                },
                loading: () => const Center(child: CircularProgressIndicator(color: AppColors.primary)),
                error: (error, stack) => Center(
                  child: Text('Error loading inventory', style: GoogleFonts.inter(color: AppColors.danger)),
                ),
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
  ConsumerState<_ProductDetailSheet> createState() => _ProductDetailSheetState();
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
          style: GoogleFonts.hankenGrotesk(
            fontWeight: FontWeight.w700,
            color: AppColors.inkPrimary,
            fontSize: 18,
          ),
        ),
        content: Text(
          'This will permanently remove "${widget.product.name}" from your inventory. This action cannot be undone.',
          style: GoogleFonts.inter(fontSize: 14, color: AppColors.inkSecondary),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text('Cancel', style: GoogleFonts.inter(color: AppColors.inkSecondary)),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.danger,
              foregroundColor: Colors.white,
              shape: const StadiumBorder(),
              elevation: 0,
            ),
            child: Text('Delete', style: GoogleFonts.inter(fontWeight: FontWeight.w700)),
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
            content: Text('Product deleted', style: GoogleFonts.inter(color: Colors.white)),
            backgroundColor: AppColors.danger,
            behavior: SnackBarBehavior.floating,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        setState(() => _isDeleting = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Error: $e', style: GoogleFonts.inter(color: Colors.white)),
            backgroundColor: AppColors.danger,
            behavior: SnackBarBehavior.floating,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          ),
        );
      }
    }
  }

  // ── Adjust Stock dialog ───────────────────────────────────────────────────

  Future<void> _showAdjustStock() async {
    final currentStock = widget.product.stock.toInt();
    int adjustment = 0;

    await showDialog(
      context: context,
      builder: (ctx) {
        return StatefulBuilder(builder: (ctx, setDlgState) {
          final newStock = (currentStock + adjustment).clamp(0, 999999);
          return AlertDialog(
            backgroundColor: Colors.white,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
            title: Text(
              'Adjust Stock',
              style: GoogleFonts.hankenGrotesk(
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
                  style: GoogleFonts.inter(fontSize: 13, color: AppColors.inkSecondary),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 24),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    // Minus button
                    _StockAdjustBtn(
                      icon: LucideIcons.minus,
                      onTap: () => setDlgState(() => adjustment--),
                    ),
                    const SizedBox(width: 20),
                    // New stock display
                    Column(
                      children: [
                        Text(
                          '$newStock',
                          style: GoogleFonts.hankenGrotesk(
                            fontSize: 40,
                            fontWeight: FontWeight.w700,
                            color: AppColors.primary,
                            letterSpacing: -1,
                          ),
                        ),
                        Text(
                          'new stock',
                          style: GoogleFonts.jetBrainsMono(
                            fontSize: 10,
                            color: AppColors.inkTertiary,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(width: 20),
                    // Plus button
                    _StockAdjustBtn(
                      icon: LucideIcons.plus,
                      onTap: () => setDlgState(() => adjustment++),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                if (adjustment != 0)
                  Text(
                    '${adjustment > 0 ? "+" : ""}$adjustment from current ($currentStock)',
                    style: GoogleFonts.inter(
                      fontSize: 12,
                      color: adjustment > 0 ? AppColors.success : AppColors.danger,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
              ],
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(ctx),
                child: Text('Cancel', style: GoogleFonts.inter(color: AppColors.inkSecondary)),
              ),
              ElevatedButton(
                onPressed: adjustment == 0
                    ? null
                    : () async {
                        final newStockVal = (currentStock + adjustment).clamp(0, 999999).toDouble();
                        Navigator.pop(ctx);
                        try {
                          final repo = ref.read(productRepositoryProvider);
                          await repo.updateStock(widget.product.id, newStockVal);
                          ref.invalidate(productsProvider);
                          if (mounted) {
                            Navigator.pop(context); // close sheet
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(
                                content: Text(
                                  'Stock updated to ${newStockVal.toInt()}',
                                  style: GoogleFonts.inter(color: AppColors.inkPrimary),
                                ),
                                backgroundColor: AppColors.primaryContainer,
                                behavior: SnackBarBehavior.floating,
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                              ),
                            );
                          }
                        } catch (e) {
                          if (mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(
                                content: Text('Error: $e', style: GoogleFonts.inter(color: Colors.white)),
                                backgroundColor: AppColors.danger,
                                behavior: SnackBarBehavior.floating,
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
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
                child: Text('Apply', style: GoogleFonts.inter(fontWeight: FontWeight.w700)),
              ),
            ],
          );
        });
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final p = widget.product;
    final stock = p.stock.toInt();
    final isOut = stock == 0;
    final isLow = stock > 0 && stock <= 10;
    final statusColor = isOut ? AppColors.danger : (isLow ? AppColors.warning : AppColors.success);
    final statusLabel = isOut ? 'Out of Stock' : (isLow ? 'Low Stock' : 'In Stock');

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
                child: const Icon(LucideIcons.package, size: 24, color: AppColors.primary),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      p.name,
                      style: GoogleFonts.hankenGrotesk(
                        fontSize: 18,
                        fontWeight: FontWeight.w700,
                        color: AppColors.inkPrimary,
                        letterSpacing: -0.3,
                      ),
                    ),
                    Text(
                      'SKU: ${p.sku ?? "N/A"}',
                      style: GoogleFonts.jetBrainsMono(fontSize: 11, color: AppColors.inkTertiary),
                    ),
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: statusColor.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Text(
                  statusLabel,
                  style: GoogleFonts.inter(fontSize: 11, fontWeight: FontWeight.w700, color: statusColor),
                ),
              ),
            ],
          ),

          const SizedBox(height: 20),
          Divider(color: AppColors.inkTertiary.withValues(alpha: 0.12)),
          const SizedBox(height: 12),

          // Details grid
          _DetailRow(label: 'Category', value: p.category ?? 'N/A'),
          _DetailRow(label: 'Cost Price', value: '₹${p.costPrice.toStringAsFixed(2)}'),
          _DetailRow(label: 'Selling Price', value: '₹${p.sellingPrice.toStringAsFixed(2)}'),
          _DetailRow(label: 'Stock', value: '${p.stock.toInt()} ${p.unit ?? "pcs"}'),
          _DetailRow(label: 'Tax Rate', value: '${p.taxRate.toStringAsFixed(0)}%'),

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
                        builder: (_) => AddProductScreen(product: widget.product),
                      ),
                    ).then((_) => ref.invalidate(productsProvider));
                  },
                  icon: const Icon(LucideIcons.pencil, size: 16),
                  label: Text('Edit', style: GoogleFonts.inter(fontWeight: FontWeight.w600)),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: AppColors.primary,
                    side: const BorderSide(color: AppColors.primaryContainer, width: 1.5),
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
                  label: Text('Adjust Stock', style: GoogleFonts.inter(fontWeight: FontWeight.w600)),
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
                          child: CircularProgressIndicator(color: AppColors.danger, strokeWidth: 2),
                        ),
                      )
                    : IconButton(
                        onPressed: _confirmDelete,
                        icon: const Icon(LucideIcons.trash2, size: 18),
                        style: IconButton.styleFrom(
                          backgroundColor: AppColors.danger.withValues(alpha: 0.1),
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

class _DetailRow extends StatelessWidget {
  final String label;
  final String value;
  const _DetailRow({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: GoogleFonts.inter(fontSize: 13, color: AppColors.inkSecondary),
          ),
          Text(
            value,
            style: GoogleFonts.inter(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: AppColors.inkPrimary,
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
    return GestureDetector(
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

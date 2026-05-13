import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
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

  @override
  Widget build(BuildContext context) {
    final filters = ['All', 'Low Stock', 'Out of Stock'];

    return Scaffold(
      backgroundColor: AppColors.canvas,
      floatingActionButton: FloatingActionButton(
        onPressed: () => Navigator.push(
          context,
          MaterialPageRoute(builder: (_) => const AddProductScreen()),
        ),
        backgroundColor: AppColors.primaryContainer,
        foregroundColor: AppColors.primary,
        elevation: 0,
        child: const Icon(LucideIcons.plus, size: 24),
      ),
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // ── Header ────────────────────────────────────────────
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

            // ── Search bar ────────────────────────────────────────
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24),
              child: TextField(
                controller: _searchController,
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

            // ── Filter chips ──────────────────────────────────────
            SizedBox(
              height: 36,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 24),
                itemCount: filters.length,
                separatorBuilder: (_, __) => const SizedBox(width: 8),
                itemBuilder: (context, i) {
                  final isActive = _filterIndex == i;
                  return GestureDetector(
                    onTap: () => setState(() => _filterIndex = i),
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 200),
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                      decoration: BoxDecoration(
                        color: isActive ? AppColors.primaryContainer : Colors.white,
                        borderRadius: BorderRadius.circular(12),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withValues(alpha: 0.04),
                            blurRadius: 10,
                            offset: const Offset(0, 4),
                          ),
                        ],
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

            // ── Product list ──────────────────────────────────────
            Expanded(
              child: ref.watch(filteredProductsProvider).when(
                data: (allProducts) {
                  final products = allProducts.where((p) {
                    if (_filterIndex == 1) return p.stock > 0 && p.stock <= 10;
                    if (_filterIndex == 2) return p.stock == 0;
                    return true;
                  }).toList();

                  if (products.isEmpty) {
                    return Center(
                      child: Text(
                        'No products found.',
                        style: GoogleFonts.inter(color: AppColors.inkTertiary),
                      ),
                    );
                  }

                  return ListView.separated(
                    padding: const EdgeInsets.fromLTRB(24, 8, 24, 100),
                    itemCount: products.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 12),
                    itemBuilder: (context, index) {
                      final product = products[index];
                      final stock = product.stock.toInt();
                      final isLow = stock <= 10;
                      final isOut = stock == 0;

                      return Container(
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(20),
                          boxShadow: [AppColors.cardShadow],
                        ),
                        child: Row(
                          children: [
                            // Category icon
                            Container(
                              width: 48,
                              height: 48,
                              decoration: BoxDecoration(
                                color: AppColors.primaryContainer,
                                borderRadius: BorderRadius.circular(12),
                              ),
                              child: const Icon(LucideIcons.package, size: 22, color: AppColors.primary),
                            ),
                            const SizedBox(width: 14),

                            // Product name + SKU
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

                            // Stock + price
                            Column(
                              crossAxisAlignment: CrossAxisAlignment.end,
                              children: [
                                Text(
                                  isOut ? 'Out' : '$stock units',
                                  style: GoogleFonts.hankenGrotesk(
                                    fontSize: 14,
                                    fontWeight: FontWeight.w700,
                                    color: isOut
                                        ? AppColors.danger
                                        : isLow
                                            ? AppColors.warning
                                            : AppColors.inkPrimary,
                                  ),
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  '₹${product.sellingPrice.toStringAsFixed(0)}',
                                  style: GoogleFonts.inter(
                                    fontSize: 12,
                                    color: AppColors.inkTertiary,
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                      );
                    },
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

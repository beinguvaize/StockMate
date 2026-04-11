import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:mobile_app/core/widgets/glass_panel.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile_app/features/inventory/presentation/providers/inventory_provider.dart';
import 'package:mobile_app/features/inventory/presentation/add_product_screen.dart';

class InventoryScreen extends ConsumerStatefulWidget {
  const InventoryScreen({super.key});

  @override
  ConsumerState<InventoryScreen> createState() => _InventoryScreenState();
}

class _InventoryScreenState extends ConsumerState<InventoryScreen> {
  final _searchController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _searchController.addListener(() {
      ref.read(searchQueryProvider.notifier).state = _searchController.text;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.canvas,
      body: SafeArea(
        child: Column(
          children: [
            // Header
            Padding(
              padding: const EdgeInsets.all(20),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Inventory',
                        style: TextStyle(
                          fontSize: 28,
                          fontWeight: FontWeight.w900,
                          letterSpacing: -1,
                        ),
                      ),
                      Text(
                        'Real-time Stock Tracking',
                        style: TextStyle(
                          color: AppColors.inkSecondary,
                          fontSize: 14,
                        ),
                      ),
                    ],
                  ),
                  GestureDetector(
                    onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const AddProductScreen())),
                    child: GlassPanel(
                      padding: const EdgeInsets.all(10),
                      borderRadius: 12,
                      child: const Icon(LucideIcons.plus, size: 24),
                    ),
                  ),
                ],
              ),
            ),
            
            // Search Bar
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: GlassPanel(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                borderRadius: 15,
                opacity: 0.6,
                child: TextField(
                  controller: _searchController,
                  decoration: const InputDecoration(
                    hintText: 'Search products, SKU...',
                    icon: Icon(LucideIcons.search, size: 20),
                    border: InputBorder.none,
                  ),
                ),
              ),
            ),
            
            const SizedBox(height: 20),
            
            // Stats Row
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: Row(
                children: [
                  _buildMiniStat('Total Items', '42'),
                  const SizedBox(width: 12),
                  _buildMiniStat('Low Stock', '5', isWarning: true),
                ],
              ),
            ),
            
            const SizedBox(height: 20),
            
            // Product List
            Expanded(
              child: ref.watch(filteredProductsProvider).when(
                data: (products) => ListView.builder(
                  padding: const EdgeInsets.fromLTRB(20, 0, 20, 100),
                  itemCount: products.length,
                  itemBuilder: (context, index) {
                    final product = products[index];
                    return Padding(
                    padding: const EdgeInsets.only(bottom: 16),
                    child: GlassPanel(
                      padding: const EdgeInsets.all(12),
                      borderRadius: 20,
                      child: Row(
                        children: [
                          // Product Image Placeholder
                          Container(
                            width: 80,
                            height: 80,
                            decoration: BoxDecoration(
                              color: AppColors.canvas,
                              borderRadius: BorderRadius.circular(15),
                              image: const DecorationImage(
                                image: NetworkImage('https://via.placeholder.com/80'),
                                fit: BoxFit.cover,
                              ),
                            ),
                          ),
                          const SizedBox(width: 16),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  product.name ?? 'Unnamed Product',
                                  style: const TextStyle(
                                    fontWeight: FontWeight.w800,
                                    fontSize: 16,
                                  ),
                                ),
                                Text(
                                  'SKU: ${product.sku ?? "N/A"}',
                                  style: const TextStyle(
                                    color: AppColors.inkSecondary,
                                    fontSize: 12,
                                  ),
                                ),
                                const SizedBox(height: 8),
                                Row(
                                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                  children: [
                                    Text(
                                      '₹${product.sellingPrice?.toStringAsFixed(2) ?? "0.00"}',
                                      style: const TextStyle(
                                        fontWeight: FontWeight.w900,
                                        color: AppColors.inkPrimary,
                                      ),
                                    ),
                                    Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                      decoration: BoxDecoration(
                                        color: (product.stock ?? 0) <= (product.lowStockThreshold ?? 10) 
                                            ? AppColors.danger.withOpacity(0.2)
                                            : AppColors.accentSignature.withOpacity(0.2),
                                        borderRadius: BorderRadius.circular(8),
                                      ),
                                      child: Text(
                                        '${product.stock?.toInt() ?? 0} in stock',
                                        style: TextStyle(
                                          fontSize: 10,
                                          fontWeight: FontWeight.bold,
                                          color: (product.stock ?? 0) <= (product.lowStockThreshold ?? 10) 
                                              ? AppColors.danger 
                                              : Colors.black,
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  );
                },
              ),
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (error, stack) => Center(child: Text('Error loading inventory')),
            ),
          ),
        ],
        ),
      ),
    );
  }

  Widget _buildMiniStat(String label, String value, {bool isWarning = false}) {
    return Expanded(
      child: GlassPanel(
        padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 16),
        borderRadius: 12,
        opacity: 0.5,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              label,
              style: const TextStyle(fontSize: 10, color: AppColors.inkSecondary),
            ),
            Text(
              value,
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w900,
                color: isWarning ? AppColors.danger : AppColors.inkPrimary,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

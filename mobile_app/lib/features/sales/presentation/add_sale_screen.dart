import 'package:mobile_app/features/inventory/presentation/providers/inventory_provider.dart';
import 'package:mobile_app/features/inventory/data/models/product.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:mobile_app/main.dart';
import 'package:mobile_app/core/database/database.dart' as db;
import 'package:uuid/uuid.dart';

class CartItem {
  final Product product;
  int quantity;

  CartItem({required this.product, required this.quantity});

  double get lineTotal => product.sellingPrice! * quantity;
}

class AddSaleScreen extends ConsumerStatefulWidget {
  const AddSaleScreen({super.key});

  @override
  ConsumerState<AddSaleScreen> createState() => _AddSaleScreenState();
}

class _AddSaleScreenState extends ConsumerState<AddSaleScreen> {
  final _customerController = TextEditingController();
  final List<CartItem> _cart = [];
  bool _isLoading = false;
  String _paymentMethod = 'CASH';

  void _scanBarcode() async {
    final result = await Navigator.push<String>(
      context,
      MaterialPageRoute(
        builder: (context) => const BarcodeScannerSheet(),
      ),
    );

    if (result != null && mounted) {
      final products = ref.read(productsProvider).asData?.value ?? [];
      final product = products.firstWhere(
        (p) => p.sku == result,
        orElse: () => throw 'Product with SKU $result not found',
      );
      _addToCart(product);
    }
  }

  void _addToCart(Product product) {
    setState(() {
      final existing = _cart.indexWhere((c) => c.product.id == product.id);
      if (existing != -1) {
        if (_cart[existing].quantity < (product.stock ?? 0)) {
          _cart[existing].quantity++;
        }
      } else {
        if ((product.stock ?? 0) > 0) {
          _cart.add(CartItem(product: product, quantity: 1));
        }
      }
    });
  }

  void _removeFromCart(Product product) {
    setState(() {
      final existing = _cart.indexWhere((c) => c.product.id == product.id);
      if (existing != -1) {
        if (_cart[existing].quantity > 1) {
          _cart[existing].quantity--;
        } else {
          _cart.removeAt(existing);
        }
      }
    });
  }

  double get _subtotal {
    return _cart.fold(0, (sum, item) => sum + item.lineTotal);
  }

  Future<void> _submit() async {
    if (_cart.isEmpty) return;

    setState(() => _isLoading = true);
    try {
      final total = _subtotal;
      final saleId = const Uuid().v4();
      final tenantId = 'a0000000-0000-0000-0000-000000000001'; // Default tenant for now

      final payloadItems = _cart.map((c) => {
        'productId': c.product.id,
        'quantity': c.quantity,
        'price': c.product.sellingPrice,
        'name': c.product.name,
      }).toList();

      final saleData = {
        'id': saleId,
        'tenant_id': tenantId,
        'customerName': _customerController.text.trim().isEmpty ? 'Walk-in Customer' : _customerController.text.trim(),
        'totalAmount': total,
        'paymentMethod': _paymentMethod,
        'paymentStatus': 'PAID',
        'status': 'COMPLETED',
        'items': payloadItems,
        'date': DateTime.now().toIso8601String(),
      };

      // 1. Save to Local Drift DB first
      final database = ref.read(databaseProvider);
      // Note: We need a Local Sales table or just use the sync queue
      // For now, we queue it via SyncService
      
      final syncService = ref.read(syncServiceProvider);
      await syncService.queueMutation(
        targetTable: 'sales',
        action: 'upsert',
        payload: saleData,
      );

      if (mounted) {
        ref.invalidate(recentSalesProvider);
        ref.invalidate(productsProvider);
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Sale Queued for Sync!', style: TextStyle(color: AppColors.surface)), backgroundColor: AppColors.success),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e'), backgroundColor: AppColors.danger),
        );
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final productsAsync = ref.watch(productsProvider);

    return Scaffold(
      backgroundColor: AppColors.canvas,
      appBar: AppBar(
        title: const Text('POS Terminal', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
        backgroundColor: AppColors.canvas,
        foregroundColor: AppColors.inkPrimary,
        elevation: 0,
      ),
      body: Row(
        children: [
          // Left Pane: Products Selection
          Expanded(
            flex: 2,
            child: productsAsync.when(
              data: (products) {
                return GridView.builder(
                  padding: const EdgeInsets.all(16),
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 2,
                    crossAxisSpacing: 16,
                    mainAxisSpacing: 16,
                    childAspectRatio: 0.8,
                  ),
                  itemCount: products.length,
                  itemBuilder: (context, index) {
                    final p = products[index];
                    return GestureDetector(
                      onTap: () => _addToCart(p),
                      child: Container(
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          color: AppColors.surface,
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(color: Colors.black.withValues(alpha: 0.05)),
                          boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.02), offset: const Offset(0, 4), blurRadius: 10)],
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Container(
                              height: 60,
                              width: double.infinity,
                              decoration: BoxDecoration(
                                color: AppColors.canvas,
                                borderRadius: BorderRadius.circular(12),
                              ),
                              child: const Icon(LucideIcons.package, color: AppColors.inkSecondary),
                            ),
                            const Spacer(),
                            Text(p.name ?? 'Unknown', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w800)),
                            Text('₹${p.sellingPrice?.toStringAsFixed(2)}', style: const TextStyle(fontWeight: FontWeight.w900, color: AppColors.accentSignature, fontSize: 18)),
                            const SizedBox(height: 8),
                            Text('Stock: ${p.stock?.toInt()}', style: const TextStyle(fontSize: 10, color: AppColors.inkSecondary, fontWeight: FontWeight.bold)),
                          ],
                        ),
                      ),
                    );
                  },
                );
              },
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => Center(child: Text('Error loading products: $e')),
            ),
          ),
          
          // Right Pane: Active Cart
          Container(
            width: 320,
            decoration: BoxDecoration(
              color: AppColors.surface,
              border: Border(left: BorderSide(color: Colors.black.withValues(alpha: 0.05))),
            ),
            child: Column(
              children: [
                Padding(
                  padding: const EdgeInsets.all(16),
                  child: Container(
                    decoration: BoxDecoration(
                      color: AppColors.canvas,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: Colors.black.withValues(alpha: 0.05)),
                    ),
                    child: Row(
                      children: [
                        Expanded(
                          child: TextField(
                            controller: _customerController,
                            decoration: const InputDecoration(
                              prefixIcon: Icon(LucideIcons.user, size: 20, color: AppColors.inkSecondary),
                              border: InputBorder.none,
                              contentPadding: EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                              hintText: 'Customer Name...',
                            ),
                          ),
                        ),
                        IconButton(
                          onPressed: _scanBarcode,
                          icon: const Icon(LucideIcons.scanLine, color: AppColors.accentSignature),
                          tooltip: 'Scan Item Barcode',
                        ),
                      ],
                    ),
                  ),
                ),
                
                Expanded(
                  child: _cart.isEmpty 
                  ? const Center(child: Text('Cart Empty', style: TextStyle(color: AppColors.inkSecondary, fontWeight: FontWeight.bold)))
                  : ListView.builder(
                    itemCount: _cart.length,
                    itemBuilder: (context, index) {
                      final item = _cart[index];
                      return Container(
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          border: Border(bottom: BorderSide(color: Colors.black.withValues(alpha: 0.05))),
                        ),
                        child: Row(
                          children: [
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(item.product.name ?? '', style: const TextStyle(fontWeight: FontWeight.bold)),
                                  Text('₹${item.product.sellingPrice}', style: const TextStyle(color: AppColors.inkSecondary, fontSize: 12)),
                                ],
                              ),
                            ),
                            Row(
                              children: [
                                IconButton(icon: const Icon(LucideIcons.minusCircle, size: 20), onPressed: () => _removeFromCart(item.product)),
                                Text('${item.quantity}', style: const TextStyle(fontWeight: FontWeight.w900)),
                                IconButton(icon: const Icon(LucideIcons.plusCircle, size: 20), onPressed: () => _addToCart(item.product)),
                              ],
                            ),
                          ],
                        ),
                      );
                    },
                  ),
                ),
                
                // Checkout Panel
                Container(
                  padding: const EdgeInsets.all(20),
                  decoration: BoxDecoration(
                    color: AppColors.surface,
                    border: Border(top: BorderSide(color: Colors.black.withValues(alpha: 0.05))),
                    boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.05), offset: const Offset(0, -10), blurRadius: 20)],
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const Text('Payment Method', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12, color: AppColors.inkSecondary)),
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          _buildPaymentBtn('CASH', LucideIcons.banknote),
                          const SizedBox(width: 8),
                          _buildPaymentBtn('CREDIT', LucideIcons.creditCard),
                          const SizedBox(width: 8),
                          _buildPaymentBtn('BANK', LucideIcons.building),
                        ],
                      ),
                      const SizedBox(height: 16),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          const Text('Total Due', style: TextStyle(fontWeight: FontWeight.bold, color: AppColors.inkSecondary)),
                          Text('₹${_subtotal.toStringAsFixed(2)}', style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 32)),
                        ],
                      ),
                      const SizedBox(height: 20),
                      ElevatedButton(
                        onPressed: _isLoading || _cart.isEmpty ? null : _submit,
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppColors.success,
                          padding: const EdgeInsets.symmetric(vertical: 20),
                        ),
                        child: _isLoading 
                          ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(color: AppColors.surface))
                          : const Text('CHECKOUT', style: TextStyle(fontWeight: FontWeight.w900, letterSpacing: 2)),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPaymentBtn(String method, IconData icon) {
    final isActive = _paymentMethod == method;
    return Expanded(
      child: GestureDetector(
        onTap: () => setState(() => _paymentMethod = method),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 12),
          decoration: BoxDecoration(
            color: isActive ? AppColors.accentSignature : AppColors.canvas,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: isActive ? Colors.transparent : Colors.black.withValues(alpha: 0.1)),
          ),
          child: Column(
            children: [
              Icon(icon, color: isActive ? AppColors.inkPrimary : AppColors.inkSecondary, size: 20),
              const SizedBox(height: 4),
              Text(method, style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: isActive ? AppColors.inkPrimary : AppColors.inkSecondary)),
            ],
          ),
        ),
      ),
    );
  }
}

class BarcodeScannerSheet extends StatelessWidget {
  const BarcodeScannerSheet({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Scan Product Barcode')),
      body: MobileScanner(
        onDetect: (capture) {
          final List<Barcode> barcodes = capture.barcodes;
          if (barcodes.isNotEmpty) {
            Navigator.pop(context, barcodes.first.rawValue);
          }
        },
      ),
    );
  }
}

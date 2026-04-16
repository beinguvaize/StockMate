import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:mobile_app/core/supabase/client.dart';
import 'package:mobile_app/features/inventory/presentation/providers/inventory_provider.dart';

class AddProductScreen extends ConsumerStatefulWidget {
  const AddProductScreen({super.key});

  @override
  ConsumerState<AddProductScreen> createState() => _AddProductScreenState();
}

class _AddProductScreenState extends ConsumerState<AddProductScreen> {
  final _nameController = TextEditingController();
  final _skuController = TextEditingController();
  final _costController = TextEditingController();
  final _sellingController = TextEditingController();
  final _stockController = TextEditingController();
  final _alertController = TextEditingController();
  final _categoryController = TextEditingController();
  bool _isLoading = false;

  String _selectedUnit = 'pcs';
  String _selectedTaxSlab = 'Exempt';
  double _taxRate = 0.0;

  Future<void> _submit() async {
    if (_nameController.text.isEmpty || _skuController.text.isEmpty) return;

    setState(() => _isLoading = true);
    try {
      await supabase.from('products').insert({
        'name': _nameController.text.trim(),
        'sku': _skuController.text.trim(),
        'costPrice': double.tryParse(_costController.text) ?? 0.0,
        'sellingPrice': double.tryParse(_sellingController.text) ?? 0.0,
        'stock': double.tryParse(_stockController.text) ?? 0.0,
        'lowStockThreshold': double.tryParse(_alertController.text) ?? 10.0,
        'category': _categoryController.text.trim().isEmpty ? 'Other' : _categoryController.text.trim(),
        'unit': _selectedUnit,
        'taxRate': _taxRate,
        'taxSlab': _selectedTaxSlab,
        'date': DateTime.now().toIso8601String().split('T')[0],
      });

      if (mounted) {
        ref.invalidate(productsProvider);
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Product integrated successfully!', style: TextStyle(color: AppColors.surface)), backgroundColor: AppColors.info),
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
    return Scaffold(
      backgroundColor: AppColors.canvas,
      appBar: AppBar(
        title: const Text('ADD PRODUCT.', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 20, letterSpacing: -0.5)),
        backgroundColor: AppColors.canvas,
        foregroundColor: AppColors.inkPrimary,
        elevation: 0,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _buildTextField('Product Name', _nameController, LucideIcons.package),
            const SizedBox(height: 16),
            _buildTextField('Unique SKU', _skuController, LucideIcons.scan),
            const SizedBox(height: 16),
            
            Row(
              children: [
                Expanded(child: _buildTextField('Cost Price', _costController, LucideIcons.indianRupee, isNumber: true)),
                const SizedBox(width: 16),
                Expanded(child: _buildTextField('Selling Price', _sellingController, LucideIcons.tag, isNumber: true)),
              ],
            ),
            const SizedBox(height: 16),
            
            Row(
              children: [
                Expanded(child: _buildTextField('Current Stock', _stockController, LucideIcons.layers, isNumber: true)),
                const SizedBox(width: 16),
                Expanded(child: _buildTextField('Low Alert At', _alertController, LucideIcons.alertTriangle, isNumber: true)),
              ],
            ),
            const SizedBox(height: 16),
            _buildTextField('Category', _categoryController, LucideIcons.tag),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                    decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(12), border: Border.all(color: Colors.black.withValues(alpha: 0.05))),
                    child: DropdownButtonHideUnderline(
                      child: DropdownButton<String>(
                        value: _selectedUnit,
                        isExpanded: true,
                        items: ['pcs', 'kg', 'ltr', 'box', 'set'].map((u) => DropdownMenuItem(value: u, child: Text(u))).toList(),
                        onChanged: (v) => setState(() => _selectedUnit = v!),
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                    decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(12), border: Border.all(color: Colors.black.withValues(alpha: 0.05))),
                    child: DropdownButtonHideUnderline(
                      child: DropdownButton<String>(
                        value: _selectedTaxSlab,
                        isExpanded: true,
                        items: [
                          {'label': 'Exempt', 'rate': 0.0},
                          {'label': 'VAT 5%', 'rate': 5.0},
                          {'label': 'GST 12%', 'rate': 12.0},
                          {'label': 'GST 18%', 'rate': 18.0},
                          {'label': 'GST 28%', 'rate': 28.0},
                        ].map((m) => DropdownMenuItem(value: m['label'].toString(), child: Text(m['label'].toString()))).toList(),
                        onChanged: (v) {
                          double rate = 0;
                          if (v == 'VAT 5%') rate = 5.0;
                          if (v == 'GST 12%') rate = 12.0;
                          if (v == 'GST 18%') rate = 18.0;
                          if (v == 'GST 28%') rate = 28.0;
                          setState(() {
                            _selectedTaxSlab = v!;
                            _taxRate = rate;
                          });
                        },
                      ),
                    ),
                  ),
                ),
              ],
            ),
            
            const SizedBox(height: 32),
            ElevatedButton(
              onPressed: _isLoading ? null : _submit,
              child: _isLoading 
                ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(color: AppColors.inkPrimary, strokeWidth: 2))
                : const Text('REGISTER PRODUCT'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTextField(String label, TextEditingController controller, IconData icon, {bool isNumber = false}) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.black.withValues(alpha: 0.05)),
      ),
      child: TextField(
        controller: controller,
        keyboardType: isNumber ? const TextInputType.numberWithOptions(decimal: true) : TextInputType.text,
        decoration: InputDecoration(
          prefixIcon: Icon(icon, size: 20, color: AppColors.inkSecondary),
          border: InputBorder.none,
          contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          hintText: label,
        ),
      ),
    );
  }
}

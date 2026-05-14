import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
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

  @override
  void dispose() {
    _nameController.dispose();
    _skuController.dispose();
    _costController.dispose();
    _sellingController.dispose();
    _stockController.dispose();
    _alertController.dispose();
    _categoryController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_nameController.text.isEmpty || _skuController.text.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Name and SKU required',
              style: GoogleFonts.inter(color: Colors.white)),
          backgroundColor: AppColors.danger,
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
      );
      return;
    }

    setState(() => _isLoading = true);
    try {
      await supabase.from('products').insert({
        'name': _nameController.text.trim(),
        'sku': _skuController.text.trim(),
        'costPrice': double.tryParse(_costController.text) ?? 0.0,
        'sellingPrice': double.tryParse(_sellingController.text) ?? 0.0,
        'stock': double.tryParse(_stockController.text) ?? 0.0,
        'lowStockThreshold': double.tryParse(_alertController.text) ?? 10.0,
        'category': _categoryController.text.trim().isEmpty
            ? 'Other'
            : _categoryController.text.trim(),
        'unit': _selectedUnit,
        'taxRate': _taxRate,
        'taxSlab': _selectedTaxSlab,
        'date': DateTime.now().toIso8601String().split('T')[0],
      });

      if (mounted) {
        ref.invalidate(productsProvider);
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Product added successfully',
                style: GoogleFonts.inter(color: AppColors.inkPrimary)),
            backgroundColor: AppColors.primaryContainer,
            behavior: SnackBarBehavior.floating,
            shape:
                RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Error: $e',
                style: GoogleFonts.inter(color: Colors.white)),
            backgroundColor: AppColors.danger,
            behavior: SnackBarBehavior.floating,
            shape:
                RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          ),
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
        backgroundColor: AppColors.canvas,
        elevation: 0,
        scrolledUnderElevation: 0,
        leading: IconButton(
          icon: const Icon(LucideIcons.arrowLeft,
              size: 20, color: AppColors.inkPrimary),
          onPressed: () => Navigator.pop(context),
        ),
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Add Product',
              style: GoogleFonts.hankenGrotesk(
                color: AppColors.inkPrimary,
                fontSize: 20,
                fontWeight: FontWeight.w800,
                letterSpacing: -0.5,
              ),
            ),
            Text(
              'INVENTORY MANAGEMENT',
              style: GoogleFonts.jetBrainsMono(
                color: AppColors.secondary,
                fontSize: 9,
                fontWeight: FontWeight.w600,
                letterSpacing: 1.5,
              ),
            ),
          ],
        ),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 100),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Product identity section
            _SectionHeader(title: 'PRODUCT IDENTITY', icon: LucideIcons.package),
            const SizedBox(height: 12),
            _buildField(
              label: 'Product Name',
              hint: 'e.g. Premium Basmati Rice',
              controller: _nameController,
              icon: LucideIcons.package,
            ),
            const SizedBox(height: 12),
            _buildField(
              label: 'SKU / Barcode',
              hint: 'e.g. RICE-5KG-001',
              controller: _skuController,
              icon: LucideIcons.scan,
            ),
            const SizedBox(height: 12),
            _buildField(
              label: 'Category',
              hint: 'e.g. Groceries',
              controller: _categoryController,
              icon: LucideIcons.tag,
            ),

            const SizedBox(height: 28),

            // Pricing section
            _SectionHeader(title: 'PRICING', icon: LucideIcons.indianRupee),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: _buildField(
                    label: 'Cost Price',
                    hint: '0.00',
                    controller: _costController,
                    icon: LucideIcons.indianRupee,
                    isNumber: true,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: _buildField(
                    label: 'Selling Price',
                    hint: '0.00',
                    controller: _sellingController,
                    icon: LucideIcons.indianRupee,
                    isNumber: true,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            _buildDropdownCard(
              label: 'TAX SLAB',
              icon: LucideIcons.percent,
              value: _selectedTaxSlab,
              items: [
                {'label': 'Exempt', 'rate': 0.0},
                {'label': 'VAT 5%', 'rate': 5.0},
                {'label': 'GST 12%', 'rate': 12.0},
                {'label': 'GST 18%', 'rate': 18.0},
                {'label': 'GST 28%', 'rate': 28.0},
              ].map((m) => m['label'].toString()).toList(),
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

            const SizedBox(height: 28),

            // Stock section
            _SectionHeader(title: 'STOCK & UNIT', icon: LucideIcons.layers),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: _buildField(
                    label: 'Current Stock',
                    hint: '0',
                    controller: _stockController,
                    icon: LucideIcons.layers,
                    isNumber: true,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: _buildField(
                    label: 'Low Stock Alert',
                    hint: '10',
                    controller: _alertController,
                    icon: LucideIcons.alertTriangle,
                    isNumber: true,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            _buildDropdownCard(
              label: 'UNIT OF MEASURE',
              icon: LucideIcons.ruler,
              value: _selectedUnit,
              items: ['pcs', 'kg', 'ltr', 'box', 'set', 'dozen'],
              onChanged: (v) => setState(() => _selectedUnit = v!),
            ),

            const SizedBox(height: 32),
          ],
        ),
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 16),
          child: ElevatedButton(
            onPressed: _isLoading ? null : _submit,
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.primaryContainer,
              foregroundColor: AppColors.inkPrimary,
              disabledBackgroundColor:
                  AppColors.primaryContainer.withValues(alpha: 0.4),
              elevation: 0,
              padding: const EdgeInsets.symmetric(vertical: 16),
              shape: const StadiumBorder(),
            ),
            child: _isLoading
                ? SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(
                      color: AppColors.inkPrimary,
                      strokeWidth: 2.5,
                    ),
                  )
                : Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Icon(LucideIcons.plus, size: 18),
                      const SizedBox(width: 8),
                      Text(
                        'ADD TO INVENTORY',
                        style: GoogleFonts.jetBrainsMono(
                          fontWeight: FontWeight.w700,
                          fontSize: 13,
                          letterSpacing: 1,
                        ),
                      ),
                    ],
                  ),
          ),
        ),
      ),
    );
  }

  Widget _buildField({
    required String label,
    required String hint,
    required TextEditingController controller,
    required IconData icon,
    bool isNumber = false,
  }) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.black.withValues(alpha: 0.06)),
      ),
      child: TextField(
        controller: controller,
        keyboardType: isNumber
            ? const TextInputType.numberWithOptions(decimal: true)
            : TextInputType.text,
        style: GoogleFonts.inter(
          fontSize: 14,
          color: AppColors.inkPrimary,
          fontWeight: FontWeight.w500,
        ),
        decoration: InputDecoration(
          prefixIcon: Icon(icon, size: 18, color: AppColors.inkSecondary),
          border: InputBorder.none,
          contentPadding:
              const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          hintText: hint,
          hintStyle: GoogleFonts.inter(
            color: AppColors.inkSecondary.withValues(alpha: 0.5),
            fontSize: 14,
          ),
          labelText: label,
          labelStyle: GoogleFonts.jetBrainsMono(
            color: AppColors.inkSecondary,
            fontSize: 10,
            fontWeight: FontWeight.w600,
            letterSpacing: 0.5,
          ),
          floatingLabelBehavior: FloatingLabelBehavior.always,
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(14),
            borderSide: const BorderSide(
              color: AppColors.primaryContainer,
              width: 1.5,
            ),
          ),
          enabledBorder: InputBorder.none,
        ),
      ),
    );
  }

  Widget _buildDropdownCard({
    required String label,
    required IconData icon,
    required String value,
    required List<String> items,
    required void Function(String?) onChanged,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.black.withValues(alpha: 0.06)),
      ),
      child: Row(
        children: [
          Icon(icon, size: 18, color: AppColors.inkSecondary),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: GoogleFonts.jetBrainsMono(
                    color: AppColors.inkSecondary,
                    fontSize: 10,
                    fontWeight: FontWeight.w600,
                    letterSpacing: 0.5,
                  ),
                ),
                DropdownButtonHideUnderline(
                  child: DropdownButton<String>(
                    value: value,
                    isExpanded: true,
                    isDense: true,
                    style: GoogleFonts.inter(
                      fontSize: 14,
                      color: AppColors.inkPrimary,
                      fontWeight: FontWeight.w500,
                    ),
                    items: items
                        .map((u) => DropdownMenuItem(value: u, child: Text(u)))
                        .toList(),
                    onChanged: onChanged,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  final String title;
  final IconData icon;
  const _SectionHeader({required this.title, required this.icon});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          padding: const EdgeInsets.all(6),
          decoration: BoxDecoration(
            color: AppColors.primaryContainer.withValues(alpha: 0.3),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Icon(icon, size: 14, color: AppColors.primary),
        ),
        const SizedBox(width: 10),
        Text(
          title,
          style: GoogleFonts.jetBrainsMono(
            color: AppColors.primary,
            fontSize: 11,
            fontWeight: FontWeight.w700,
            letterSpacing: 1.5,
          ),
        ),
      ],
    );
  }
}

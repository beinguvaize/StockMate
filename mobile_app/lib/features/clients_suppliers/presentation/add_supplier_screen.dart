import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:mobile_app/core/supabase/client.dart';
import 'package:mobile_app/features/clients_suppliers/presentation/providers/crm_provider.dart';

class AddSupplierScreen extends ConsumerStatefulWidget {
  const AddSupplierScreen({super.key});

  @override
  ConsumerState<AddSupplierScreen> createState() => _AddSupplierScreenState();
}

class _AddSupplierScreenState extends ConsumerState<AddSupplierScreen> {
  final _nameController = TextEditingController();
  final _contactController = TextEditingController();
  final _phoneController = TextEditingController();
  final _emailController = TextEditingController();
  final _addressController = TextEditingController();
  final _balanceController = TextEditingController();
  bool _isLoading = false;

  Future<void> _submit() async {
    if (_nameController.text.isEmpty) return;

    setState(() => _isLoading = true);
    try {
      await supabase.from('suppliers').insert({
        'name': _nameController.text.trim(),
        'contact_person': _contactController.text.trim(),
        'phone': _phoneController.text.trim(),
        'email': _emailController.text.trim(),
        'address': _addressController.text.trim(),
        'balance': double.tryParse(_balanceController.text) ?? 0.0,
      });

      if (mounted) {
        ref.invalidate(suppliersProvider);
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Supplier onboarded successfully!', style: TextStyle(color: AppColors.surface)), backgroundColor: AppColors.inkPrimary),
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
        title: const Text('PARTNER ONBOARDING.', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 18, letterSpacing: -0.5)),
        backgroundColor: AppColors.canvas,
        foregroundColor: AppColors.inkPrimary,
        elevation: 0,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text('REGISTER NEW SUPPLY VECTOR', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: AppColors.inkSecondary, letterSpacing: 1)),
            const SizedBox(height: 24),
            _buildTextField('Entity Name', _nameController, LucideIcons.building2),
            const SizedBox(height: 16),
            _buildTextField('Contact Person', _contactController, LucideIcons.user),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(child: _buildTextField('Phone', _phoneController, LucideIcons.phone)),
                const SizedBox(width: 16),
                Expanded(child: _buildTextField('Email', _emailController, LucideIcons.mail)),
              ],
            ),
            const SizedBox(height: 16),
            _buildTextField('Address', _addressController, LucideIcons.mapPin, maxLines: 2),
            const SizedBox(height: 16),
            _buildTextField('Opening Balance', _balanceController, LucideIcons.indianRupee, isNumber: true),
            
            const SizedBox(height: 32),
            ElevatedButton(
              onPressed: _isLoading ? null : _submit,
              child: _isLoading 
                ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(color: AppColors.inkPrimary, strokeWidth: 2))
                : const Text('INITIALIZE PARTNERSHIP'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTextField(String label, TextEditingController controller, IconData icon, {bool isNumber = false, int maxLines = 1}) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.black.withValues(alpha: 0.05)),
      ),
      child: TextField(
        controller: controller,
        keyboardType: isNumber ? TextInputType.number : TextInputType.text,
        maxLines: maxLines,
        decoration: InputDecoration(
          prefixIcon: Icon(icon, size: 20, color: AppColors.inkSecondary),
          border: InputBorder.none,
          contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          hintText: label,
          hintStyle: TextStyle(color: AppColors.inkSecondary.withValues(alpha: 0.5), fontWeight: FontWeight.w500),
        ),
      ),
    );
  }
}

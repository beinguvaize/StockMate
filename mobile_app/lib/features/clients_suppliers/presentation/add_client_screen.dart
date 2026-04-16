import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:mobile_app/core/supabase/client.dart';
import 'package:mobile_app/features/clients_suppliers/presentation/providers/crm_provider.dart';

class AddClientScreen extends ConsumerStatefulWidget {
  const AddClientScreen({super.key});

  @override
  ConsumerState<AddClientScreen> createState() => _AddClientScreenState();
}

class _AddClientScreenState extends ConsumerState<AddClientScreen> {
  final _nameController = TextEditingController();
  final _contactController = TextEditingController();
  final _phoneController = TextEditingController();
  final _balanceController = TextEditingController();
  String _selectedStatus = 'ACTIVE';
  bool _isLoading = false;

  Future<void> _submit() async {
    if (_nameController.text.isEmpty) return;

    setState(() => _isLoading = true);
    try {
      await supabase.from('clients').insert({
        'name': _nameController.text.trim(),
        'contact': _contactController.text.trim(),
        'phone': _phoneController.text.trim(),
        'outstanding_balance': double.tryParse(_balanceController.text) ?? 0.0,
        'status': _selectedStatus,
      });

      if (mounted) {
        ref.invalidate(clientsProvider);
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Client added successfully!', style: TextStyle(color: AppColors.surface)), backgroundColor: AppColors.inkPrimary),
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
        title: const Text('NEW CLIENT.', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 20, letterSpacing: -0.5)),
        backgroundColor: AppColors.canvas,
        foregroundColor: AppColors.inkPrimary,
        elevation: 0,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text('REGISTER BUSINESS OUTLET DETAILS', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: AppColors.inkSecondary, letterSpacing: 1)),
            const SizedBox(height: 24),
            _buildTextField('Business Name', _nameController, LucideIcons.building),
            const SizedBox(height: 16),
            _buildTextField('Primary Contact Person', _contactController, LucideIcons.userCheck),
            const SizedBox(height: 16),
            _buildTextField('Phone Number', _phoneController, LucideIcons.phone),
            const SizedBox(height: 16),
            _buildTextField('Opening Balance', _balanceController, LucideIcons.indianRupee, isNumber: true),
            const SizedBox(height: 16),

            // Status Dropdown
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
              decoration: BoxDecoration(
                color: AppColors.surface,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: Colors.black.withValues(alpha: 0.05)),
              ),
              child: DropdownButtonHideUnderline(
                child: DropdownButton<String>(
                  value: _selectedStatus,
                  isExpanded: true,
                  icon: const Icon(LucideIcons.chevronDown, color: AppColors.inkSecondary),
                  items: ['ACTIVE', 'INACTIVE'].map((String value) {
                    return DropdownMenuItem<String>(
                      value: value,
                      child: Text(value == 'ACTIVE' ? 'ACTIVE ACCOUNT' : 'INACTIVE / ON HOLD',
                        style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                    );
                  }).toList(),
                  onChanged: (v) => setState(() => _selectedStatus = v!),
                ),
              ),
            ),
            
            const SizedBox(height: 32),
            ElevatedButton(
              onPressed: _isLoading ? null : _submit,
              child: _isLoading 
                ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(color: AppColors.inkPrimary, strokeWidth: 2))
                : const Text('ADD CLIENT'),
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
        keyboardType: isNumber ? TextInputType.number : TextInputType.text,
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

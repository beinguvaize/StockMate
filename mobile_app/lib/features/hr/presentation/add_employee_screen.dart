import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:mobile_app/core/supabase/client.dart';
import 'package:mobile_app/features/hr/presentation/providers/hr_provider.dart';

class AddEmployeeScreen extends ConsumerStatefulWidget {
  const AddEmployeeScreen({super.key});

  @override
  ConsumerState<AddEmployeeScreen> createState() => _AddEmployeeScreenState();
}

class _AddEmployeeScreenState extends ConsumerState<AddEmployeeScreen> {
  final _nameController = TextEditingController();
  final _roleController = TextEditingController();
  final _salaryController = TextEditingController();
  String _selectedStatus = 'Active';
  bool _isLoading = false;

  Future<void> _submit() async {
    if (_nameController.text.isEmpty || _roleController.text.isEmpty) return;

    setState(() => _isLoading = true);
    try {
      await supabase.from('employees').insert({
        'name': _nameController.text.trim(),
        'role': _roleController.text.trim(),
        'baseSalary': double.tryParse(_salaryController.text) ?? 0.0,
        'status': _selectedStatus,
      });

      if (mounted) {
        ref.invalidate(employeesProvider);
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Employee registered successfully!', style: TextStyle(color: AppColors.surface)), backgroundColor: AppColors.inkPrimary),
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
        title: const Text('ADD EMPLOYEE.', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 20, letterSpacing: -0.5)),
        backgroundColor: AppColors.canvas,
        foregroundColor: AppColors.inkPrimary,
        elevation: 0,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _buildTextField('Full Name', _nameController, LucideIcons.user),
            const SizedBox(height: 16),
            _buildTextField('Job Role / Title', _roleController, LucideIcons.briefcase),
            const SizedBox(height: 16),
            _buildTextField('Base Salary (Monthly)', _salaryController, LucideIcons.indianRupee, isNumber: true),
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
                  items: ['Active', 'On Leave', 'Inactive'].map((String value) {
                    return DropdownMenuItem<String>(
                      value: value,
                      child: Text(value),
                    );
                  }).toList(),
                  onChanged: (newValue) {
                    if (newValue != null) {
                      setState(() => _selectedStatus = newValue);
                    }
                  },
                ),
              ),
            ),
            
            const SizedBox(height: 32),
            ElevatedButton(
              onPressed: _isLoading ? null : _submit,
              child: _isLoading 
                ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(color: AppColors.inkPrimary, strokeWidth: 2))
                : const Text('REGISTER EMPLOYEE'),
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
          contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          hintText: label,
        ),
      ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:mobile_app/core/supabase/client.dart';
import 'package:mobile_app/features/finance/presentation/providers/finance_provider.dart';

class AddExpenseScreen extends ConsumerStatefulWidget {
  const AddExpenseScreen({super.key});

  @override
  ConsumerState<AddExpenseScreen> createState() => _AddExpenseScreenState();
}

class _AddExpenseScreenState extends ConsumerState<AddExpenseScreen> {
  final _titleController = TextEditingController();
  final _amountController = TextEditingController();
  final _noteController = TextEditingController();
  DateTime _selectedDate = DateTime.now();
  String _selectedCategory = 'Other';
  String _selectedSplitType = 'Company';
  bool _isLoading = false;

  static const _categories = [
    'Other', 'Petrol', 'Food', 'Salary', 'Rent',
    'Utility', 'Purchase', 'Maintenance', 'Credit Card Payment', 'Delivery Charge',
  ];

  static const _splitTypes = ['Company', 'Akbar', 'Nadar', 'Narshik'];

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _selectedDate,
      firstDate: DateTime(2020),
      lastDate: DateTime.now().add(const Duration(days: 30)),
    );
    if (picked != null) setState(() => _selectedDate = picked);
  }

  Future<void> _submit() async {
    if (_titleController.text.isEmpty || _amountController.text.isEmpty) return;

    setState(() => _isLoading = true);
    try {
      await supabase.from('expenses').insert({
        'title': _titleController.text.trim(),
        'amount': double.tryParse(_amountController.text) ?? 0.0,
        'category': _selectedCategory,
        'date': _selectedDate.toIso8601String().split('T')[0],
        'notes': _noteController.text.trim(),
        'splitType': _selectedSplitType,
      });

      if (mounted) {
        ref.invalidate(expensesProvider);
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Expense logged successfully!', style: TextStyle(color: AppColors.surface)), backgroundColor: AppColors.success),
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
        title: const Text('NEW EXPENSE.', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 20, letterSpacing: -0.5)),
        backgroundColor: AppColors.canvas,
        foregroundColor: AppColors.inkPrimary,
        elevation: 0,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text('LOG BUSINESS EXPENDITURE DETAILS', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: AppColors.inkSecondary, letterSpacing: 1)),
            const SizedBox(height: 24),

            // Title
            _buildTextField('Expense Title (Vendor or Service)', _titleController, LucideIcons.fileText),
            const SizedBox(height: 16),

            // Amount
            _buildTextField('Amount', _amountController, LucideIcons.indianRupee, isNumber: true),
            const SizedBox(height: 16),

            // Category + Split Type Row
            Row(
              children: [
                Expanded(child: _buildDropdown('Category', _selectedCategory, _categories, (v) => setState(() => _selectedCategory = v!))),
                const SizedBox(width: 16),
                Expanded(child: _buildDropdown('Split Type', _selectedSplitType, _splitTypes, (v) => setState(() => _selectedSplitType = v!))),
              ],
            ),
            const SizedBox(height: 16),

            // Date Picker
            GestureDetector(
              onTap: _pickDate,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
                decoration: BoxDecoration(
                  color: AppColors.surface,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: Colors.black.withValues(alpha: 0.05)),
                ),
                child: Row(
                  children: [
                    const Icon(LucideIcons.calendar, size: 20, color: AppColors.inkSecondary),
                    const SizedBox(width: 12),
                    Text(
                      '${_selectedDate.day.toString().padLeft(2, '0')} / ${_selectedDate.month.toString().padLeft(2, '0')} / ${_selectedDate.year}',
                      style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
                    ),
                    const Spacer(),
                    const Text('TAP TO CHANGE', style: TextStyle(fontSize: 8, fontWeight: FontWeight.w700, color: AppColors.inkSecondary, letterSpacing: 1)),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),

            // Notes
            _buildTextField('Notes (Internal Record)', _noteController, LucideIcons.stickyNote, maxLines: 3),

            const SizedBox(height: 32),
            ElevatedButton(
              onPressed: _isLoading ? null : _submit,
              child: _isLoading 
                ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(color: AppColors.inkPrimary, strokeWidth: 2))
                : const Text('LOG EXPENSE'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildDropdown(String label, String value, List<String> items, ValueChanged<String?> onChanged) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.black.withValues(alpha: 0.05)),
      ),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<String>(
          value: value,
          isExpanded: true,
          icon: const Icon(LucideIcons.chevronDown, color: AppColors.inkSecondary, size: 16),
          items: items.map((s) => DropdownMenuItem(value: s, child: Text(s.toUpperCase(), style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 11)))).toList(),
          onChanged: onChanged,
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
        keyboardType: isNumber ? const TextInputType.numberWithOptions(decimal: true) : TextInputType.text,
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

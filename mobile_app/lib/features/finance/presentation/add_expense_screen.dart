import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:mobile_app/features/finance/presentation/providers/finance_provider.dart';
import 'package:mobile_app/main.dart' show syncServiceProvider;
import 'package:mobile_app/features/dashboard/presentation/providers/telemetry_provider.dart';

class AddExpenseScreen extends ConsumerStatefulWidget {
  const AddExpenseScreen({super.key});

  @override
  ConsumerState<AddExpenseScreen> createState() => _AddExpenseScreenState();
}

class _AddExpenseScreenState extends ConsumerState<AddExpenseScreen> {
  final _noteController = TextEditingController();
  final _amountController = TextEditingController();
  DateTime _selectedDate = DateTime.now();
  String _selectedCategory = 'Other';
  bool _isLoading = false;
  String? _formError;

  static const _categories = [
    'Other',
    'Petrol',
    'Food',
    'Salary',
    'Rent',
    'Utility',
    'Purchase',
    'Maintenance',
    'Credit Card Payment',
    'Delivery Charge',
  ];

  static const _categoryIcons = {
    'Petrol': LucideIcons.fuel,
    'Food': LucideIcons.utensils,
    'Salary': LucideIcons.users,
    'Rent': LucideIcons.home,
    'Utility': LucideIcons.zap,
    'Purchase': LucideIcons.shoppingBag,
    'Maintenance': LucideIcons.wrench,
    'Credit Card Payment': LucideIcons.creditCard,
    'Delivery Charge': LucideIcons.truck,
    'Other': LucideIcons.receipt,
  };

  @override
  void dispose() {
    _noteController.dispose();
    _amountController.dispose();
    super.dispose();
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _selectedDate,
      firstDate: DateTime(2020),
      lastDate: DateTime.now().add(const Duration(days: 30)),
      builder: (ctx, child) => Theme(
        data: Theme.of(ctx).copyWith(
          colorScheme: const ColorScheme.light(
            primary: AppColors.primary,
            onPrimary: Colors.white,
            surface: Colors.white,
          ),
        ),
        child: child!,
      ),
    );
    if (picked != null) setState(() => _selectedDate = picked);
  }

  Future<void> _submit() async {
    setState(() => _formError = null);

    final amount = double.tryParse(_amountController.text.trim()) ?? 0;
    if (amount <= 0) {
      setState(() => _formError = 'Amount must be greater than 0.');
      return;
    }

    final note = _noteController.text.trim();
    if (note.isEmpty) {
      setState(() => _formError = 'Description / Notes required.');
      return;
    }

    final tenantCtx = ref.read(tenantContextProvider).valueOrNull;
    if (tenantCtx == null) {
      setState(() => _formError = 'No tenant context — please sign out and back in.');
      return;
    }

    setState(() => _isLoading = true);
    try {
      final id = 'EXP-${DateTime.now().millisecondsSinceEpoch}-${DateTime.now().microsecond}';
      final row = {
        'id': id,
        'category': _selectedCategory,
        'amount': amount,
        'date': _selectedDate.toIso8601String().split('T')[0],
        'note': note,
        'tenant_id': tenantCtx.tenantId,
      };

      final queued = await ref.read(syncServiceProvider).upsertOnlineOrQueue('expenses', row);

      if (mounted) {
        ref.invalidate(expensesProvider);
        ref.invalidate(telemetryProvider);
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(queued
                ? 'Saved offline — will sync when online'
                : 'Expense logged'),
            backgroundColor: AppColors.secondary,
            behavior: SnackBarBehavior.floating,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        setState(() => _formError = 'Failed to save: ${e.toString()}');
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  String get _formattedDate {
    final months = ['Jan','Feb','Mar','Apr','May','Jun',
                    'Jul','Aug','Sep','Oct','Nov','Dec'];
    return '${_selectedDate.day} ${months[_selectedDate.month - 1]} ${_selectedDate.year}';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.canvas,
      appBar: AppBar(
        backgroundColor: AppColors.canvas,
        elevation: 0,
        scrolledUnderElevation: 0,
        iconTheme: const IconThemeData(color: AppColors.inkPrimary),
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'New Expense',
              style: GoogleFonts.hankenGrotesk(
                fontSize: 20,
                fontWeight: FontWeight.w800,
                letterSpacing: -0.5,
                color: AppColors.inkPrimary,
              ),
            ),
            Text(
              'LOG BUSINESS EXPENDITURE',
              style: GoogleFonts.jetBrainsMono(
                fontSize: 9,
                fontWeight: FontWeight.w600,
                color: AppColors.secondary,
                letterSpacing: 1.5,
              ),
            ),
          ],
        ),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 100),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [

            // ── Amount card (light, theme-consistent) ─────────────
            Container(
              padding: const EdgeInsets.fromLTRB(20, 18, 20, 18),
              decoration: BoxDecoration(
                color: AppColors.surface,
                borderRadius: BorderRadius.circular(20),
                boxShadow: [AppColors.cardShadow],
                border: Border.all(color: Colors.black.withValues(alpha: 0.04)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('AMOUNT',
                      style: GoogleFonts.jetBrainsMono(
                          fontSize: 10,
                          fontWeight: FontWeight.w700,
                          color: AppColors.inkTertiary,
                          letterSpacing: 1.5)),
                  const SizedBox(height: 8),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.center,
                    children: [
                      Text(
                        '₹',
                        style: GoogleFonts.hankenGrotesk(
                          fontSize: 26,
                          fontWeight: FontWeight.w700,
                          color: AppColors.inkTertiary,
                        ),
                      ),
                      const SizedBox(width: 6),
                      Expanded(
                        child: TextField(
                          controller: _amountController,
                          keyboardType: const TextInputType.numberWithOptions(decimal: true),
                          inputFormatters: [
                            FilteringTextInputFormatter.allow(RegExp(r'[0-9.]')),
                          ],
                          cursorColor: AppColors.primary,
                          style: GoogleFonts.hankenGrotesk(
                            fontSize: 38,
                            fontWeight: FontWeight.w900,
                            color: AppColors.inkPrimary,
                            letterSpacing: -1.5,
                            height: 1.05,
                          ),
                          decoration: InputDecoration(
                            isDense: true,
                            contentPadding: EdgeInsets.zero,
                            border: InputBorder.none,
                            enabledBorder: InputBorder.none,
                            focusedBorder: InputBorder.none,
                            hintText: '0.00',
                            hintStyle: GoogleFonts.hankenGrotesk(
                              fontSize: 38,
                              fontWeight: FontWeight.w900,
                              color: AppColors.inkTertiary.withValues(alpha: 0.35),
                              letterSpacing: -1.5,
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),

                  const SizedBox(height: 12),
                  Container(height: 1, color: Colors.black.withValues(alpha: 0.05)),
                  const SizedBox(height: 10),

                  // Date row
                  GestureDetector(
                    onTap: _pickDate,
                    behavior: HitTestBehavior.opaque,
                    child: Row(
                      children: [
                        const Icon(LucideIcons.calendar, size: 14, color: AppColors.inkSecondary),
                        const SizedBox(width: 8),
                        Text(
                          _formattedDate,
                          style: GoogleFonts.inter(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            color: AppColors.inkPrimary,
                          ),
                        ),
                        const Spacer(),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                          decoration: BoxDecoration(
                            color: AppColors.primaryContainer.withValues(alpha: 0.3),
                            borderRadius: BorderRadius.circular(99),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text('CHANGE',
                                  style: GoogleFonts.jetBrainsMono(
                                      fontSize: 9,
                                      fontWeight: FontWeight.w700,
                                      color: AppColors.primary,
                                      letterSpacing: 1)),
                              const SizedBox(width: 4),
                              const Icon(LucideIcons.chevronRight,
                                  size: 11, color: AppColors.primary),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 22),

            // ── Description ──────────────────────────────────────
            _SectionHeader(label: 'DESCRIPTION', icon: LucideIcons.fileText),
            const SizedBox(height: 10),
            Container(
              decoration: BoxDecoration(
                color: AppColors.surface,
                borderRadius: BorderRadius.circular(16),
                boxShadow: [AppColors.cardShadow],
                border: Border.all(color: Colors.black.withValues(alpha: 0.04)),
              ),
              child: TextField(
                controller: _noteController,
                maxLines: 3,
                cursorColor: AppColors.primary,
                style: GoogleFonts.inter(
                  fontSize: 14,
                  color: AppColors.inkPrimary,
                  fontWeight: FontWeight.w500,
                  height: 1.45,
                ),
                decoration: InputDecoration(
                  border: InputBorder.none,
                  enabledBorder: InputBorder.none,
                  focusedBorder: InputBorder.none,
                  contentPadding: const EdgeInsets.all(16),
                  hintText: 'E.g. Fuel for delivery van, rent payment, office supplies...',
                  hintStyle: GoogleFonts.inter(
                    color: AppColors.inkTertiary,
                    fontSize: 14,
                    height: 1.45,
                  ),
                ),
              ),
            ),

            const SizedBox(height: 22),

            // ── Category ─────────────────────────────────────────
            _SectionHeader(label: 'CATEGORY', icon: LucideIcons.layoutGrid),
            const SizedBox(height: 10),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: _categories.map((cat) {
                final selected = _selectedCategory == cat;
                final icon = _categoryIcons[cat] ?? LucideIcons.receipt;
                return GestureDetector(
                  onTap: () => setState(() => _selectedCategory = cat),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 160),
                    curve: Curves.easeOutCubic,
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
                    decoration: BoxDecoration(
                      color: selected
                          ? AppColors.primaryContainer
                          : AppColors.surface,
                      borderRadius: BorderRadius.circular(99),
                      border: Border.all(
                        color: selected
                            ? AppColors.primary
                            : Colors.black.withValues(alpha: 0.06),
                        width: selected ? 1.5 : 1,
                      ),
                      boxShadow: selected
                          ? null
                          : [AppColors.cardShadow],
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(icon,
                            size: 13,
                            color: selected ? AppColors.primary : AppColors.inkSecondary),
                        const SizedBox(width: 6),
                        Text(
                          cat,
                          style: GoogleFonts.inter(
                            color: selected ? AppColors.inkPrimary : AppColors.inkSecondary,
                            fontSize: 12.5,
                            fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              }).toList(),
            ),

            if (_formError != null) ...[
              const SizedBox(height: 20),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                decoration: BoxDecoration(
                  color: AppColors.danger.withValues(alpha: 0.08),
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: AppColors.danger.withValues(alpha: 0.3)),
                ),
                child: Row(
                  children: [
                    const Icon(LucideIcons.alertCircle, size: 16, color: AppColors.danger),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        _formError!,
                        style: GoogleFonts.inter(
                          fontSize: 13,
                          color: AppColors.danger,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
          child: ElevatedButton(
            onPressed: _isLoading ? null : _submit,
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.primaryContainer,
              foregroundColor: AppColors.inkPrimary,
              disabledBackgroundColor: AppColors.surfaceContainer,
              elevation: 0,
              padding: const EdgeInsets.symmetric(vertical: 16),
              shape: const StadiumBorder(),
            ),
            child: _isLoading
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(
                        color: AppColors.primary, strokeWidth: 2.5),
                  )
                : Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Icon(LucideIcons.check, size: 16),
                      const SizedBox(width: 8),
                      Text(
                        'LOG EXPENSE',
                        style: GoogleFonts.jetBrainsMono(
                          fontWeight: FontWeight.w700,
                          fontSize: 13,
                          letterSpacing: 1.5,
                        ),
                      ),
                    ],
                  ),
          ),
        ),
      ),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  final String label;
  final IconData icon;
  const _SectionHeader({required this.label, required this.icon});

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
          child: Icon(icon, size: 13, color: AppColors.primary),
        ),
        const SizedBox(width: 10),
        Text(
          label,
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

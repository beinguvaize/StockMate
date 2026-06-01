import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/core/supabase/client.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:mobile_app/features/finance/data/models/expense.dart';
import 'package:mobile_app/features/finance/presentation/providers/finance_provider.dart';
import 'package:mobile_app/main.dart' show syncServiceProvider;
import 'package:mobile_app/features/dashboard/presentation/providers/telemetry_provider.dart';

class AddExpenseScreen extends ConsumerStatefulWidget {
  final Expense? expense; // non-null = edit mode

  const AddExpenseScreen({super.key, this.expense});

  @override
  ConsumerState<AddExpenseScreen> createState() => _AddExpenseScreenState();
}

class _AddExpenseScreenState extends ConsumerState<AddExpenseScreen> {
  late final TextEditingController _noteController;
  late final TextEditingController _amountController;
  late DateTime _selectedDate;
  late String _selectedCategory;
  bool _isLoading = false;
  String? _formError;
  // Parity with web expense form.
  String _paymentMethod = 'CASH';           // CASH | UPI | BANK | CARD
  bool _gstClaimable = false;
  String _gstRate = '18';
  late final TextEditingController _gstinController;
  bool _repeatMonthly = false;

  bool get _isEditMode => widget.expense != null;

  static const _categories = [
    _Cat('Food',     LucideIcons.utensils),
    _Cat('Petrol',   LucideIcons.fuel),
    _Cat('Salary',   LucideIcons.banknote),
    _Cat('Rent',     LucideIcons.home),
    _Cat('Utility',  LucideIcons.zap),
    _Cat('Purchase', LucideIcons.shoppingBag),
    _Cat('Maint',    LucideIcons.wrench,            valueOverride: 'Maintenance'),
    _Cat('Credit',   LucideIcons.creditCard,        valueOverride: 'Credit Card Payment'),
    _Cat('Delivery', LucideIcons.truck,             valueOverride: 'Delivery Charge'),
    _Cat('Other',    LucideIcons.moreHorizontal),
  ];

  @override
  void initState() {
    super.initState();
    final e = widget.expense;
    _noteController = TextEditingController(text: e?.note ?? '');
    _amountController = TextEditingController(
      text: e?.amount != null ? e!.amount!.toStringAsFixed(0) : '',
    );
    _selectedCategory = e?.category ?? 'Other';
    _selectedDate = e?.date != null
        ? DateTime.tryParse(e!.date!) ?? DateTime.now()
        : DateTime.now();
    _gstinController = TextEditingController();
  }

  @override
  void dispose() {
    _noteController.dispose();
    _amountController.dispose();
    _gstinController.dispose();
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

  String _dateLabel() {
    final today = DateTime.now();
    final isToday = today.year == _selectedDate.year &&
        today.month == _selectedDate.month &&
        today.day == _selectedDate.day;
    final months = ['Jan','Feb','Mar','Apr','May','Jun',
                    'Jul','Aug','Sep','Oct','Nov','Dec'];
    final base = '${_selectedDate.day} ${months[_selectedDate.month - 1]} ${_selectedDate.year}';
    return isToday ? 'Today, $base' : base;
  }

  Future<void> _submit() async {
    setState(() => _formError = null);

    final amount = double.tryParse(_amountController.text.trim()) ?? 0;
    if (amount <= 0) {
      setState(() => _formError = 'Amount must be greater than 0.');
      return;
    }

    // Description optional — fall back to the category label (matches web).
    final note = _noteController.text.trim().isEmpty
        ? _selectedCategory
        : _noteController.text.trim();

    final tenantCtx = ref.read(tenantContextProvider).valueOrNull;
    if (tenantCtx == null) {
      setState(() => _formError = 'No tenant context — please sign out and back in.');
      return;
    }

    // GST input-tax-credit: back the tax out of the inclusive amount.
    double? gstRate;
    double gstAmount = 0;
    String? vendorGstin;
    if (_gstClaimable) {
      gstRate = double.tryParse(_gstRate) ?? 0;
      gstAmount = gstRate > 0
          ? double.parse((amount - amount / (1 + gstRate / 100)).toStringAsFixed(2))
          : 0;
      final g = _gstinController.text.trim().toUpperCase();
      vendorGstin = g.isEmpty ? null : g;
    }

    setState(() => _isLoading = true);
    try {
      if (_isEditMode) {
        // ── Edit mode: update existing record directly via Supabase ──
        final updateRow = {
          'category': _selectedCategory,
          'amount': amount,
          'date': _selectedDate.toIso8601String().split('T')[0],
          'note': note,
          'payment_method': _paymentMethod,
          'gst_rate': gstRate,
          'gst_amount': gstAmount,
          'vendor_gstin': vendorGstin,
        };
        await supabase
            .from('expenses')
            .update(updateRow)
            .eq('id', widget.expense!.id);

        if (mounted) {
          ref.invalidate(expensesProvider);
          ref.invalidate(telemetryProvider);
          Navigator.pop(context);
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: const Text('Expense updated'),
              backgroundColor: AppColors.secondary,
              behavior: SnackBarBehavior.floating,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
          );
        }
      } else {
        // ── Add mode: insert new record via sync service ──
        final id = 'EXP-${DateTime.now().millisecondsSinceEpoch}-${DateTime.now().microsecond}';
        final row = {
          'id': id,
          'category': _selectedCategory,
          'amount': amount,
          'date': _selectedDate.toIso8601String().split('T')[0],
          'note': note,
          'payment_method': _paymentMethod,
          'gst_rate': gstRate,
          'gst_amount': gstAmount,
          'vendor_gstin': vendorGstin,
          'tenant_id': tenantCtx.tenantId,
        };

        final queued = await ref.read(syncServiceProvider).upsertOnlineOrQueue('expenses', row);

        // Repeat monthly → create a recurring template (online best-effort;
        // the nightly job clones it each month). Mirrors the web flow.
        if (_repeatMonthly) {
          try {
            await supabase.from('recurring_expense_templates').insert({
              'id': 'RET-${DateTime.now().millisecondsSinceEpoch}',
              'tenant_id': tenantCtx.tenantId,
              'note': note,
              'amount': amount,
              'category': _selectedCategory,
              'payment_method': _paymentMethod,
              'frequency': 'MONTHLY',
              'day_of_month': _selectedDate.day.clamp(1, 28),
              'active': true,
            });
          } catch (_) {/* non-fatal — expense still saved */}
        }

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
      }
    } catch (e) {
      if (mounted) {
        setState(() => _formError = 'Failed to save: ${e.toString()}');
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF8F6F6), // warm off-white per spec
      body: SafeArea(
        child: Column(
          children: [
            // ── HEADER ──────────────────────────────────────────────
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 8),
              child: Row(
                children: [
                  _circleIconButton(
                    icon: LucideIcons.arrowLeft,
                    onTap: () => Navigator.pop(context),
                  ),
                  Expanded(
                    child: Center(
                      child: Text(
                        _isEditMode ? 'EDIT EXPENSE' : 'NEW EXPENSE',
                        style: GoogleFonts.publicSans(
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                          letterSpacing: 2.5,
                          color: AppColors.inkPrimary,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 40), // balance spacer
                ],
              ),
            ),

            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.only(bottom: 16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    // ── AMOUNT BLOCK (centered) ─────────────────────
                    Padding(
                      padding: const EdgeInsets.fromLTRB(24, 28, 24, 28),
                      child: Column(
                        children: [
                          Text(
                            'LOG BUSINESS EXPENDITURE',
                            style: GoogleFonts.publicSans(
                              fontSize: 10,
                              fontWeight: FontWeight.w700,
                              letterSpacing: 3.2,
                              color: AppColors.inkTertiary,
                            ),
                          ),
                          const SizedBox(height: 14),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Padding(
                                padding: const EdgeInsets.only(top: 12),
                                child: Text(
                                  '₹',
                                  style: GoogleFonts.publicSans(
                                    fontSize: 24,
                                    fontWeight: FontWeight.w300,
                                    color: AppColors.inkTertiary,
                                  ),
                                ),
                              ),
                              const SizedBox(width: 6),
                              ConstrainedBox(
                                constraints: const BoxConstraints(maxWidth: 280),
                                child: IntrinsicWidth(
                                  child: TextField(
                                    controller: _amountController,
                                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                                    inputFormatters: [
                                      FilteringTextInputFormatter.allow(RegExp(r'[0-9.]')),
                                    ],
                                    cursorColor: AppColors.primary,
                                    textAlign: TextAlign.center,
                                    style: GoogleFonts.publicSans(
                                      fontSize: 56,
                                      fontWeight: FontWeight.w800,
                                      color: AppColors.inkPrimary,
                                      letterSpacing: -2,
                                      height: 1,
                                    ),
                                    decoration: InputDecoration(
                                      isDense: true,
                                      contentPadding: EdgeInsets.zero,
                                      border: InputBorder.none,
                                      enabledBorder: InputBorder.none,
                                      focusedBorder: InputBorder.none,
                                      hintText: '0.00',
                                      hintStyle: GoogleFonts.publicSans(
                                        fontSize: 56,
                                        fontWeight: FontWeight.w800,
                                        color: AppColors.inkTertiary.withValues(alpha: 0.25),
                                        letterSpacing: -2,
                                      ),
                                    ),
                                  ),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 22),
                          // Decorative accent bar (h-1 w-12, primary @ 20%)
                          Container(
                            width: 48,
                            height: 4,
                            decoration: BoxDecoration(
                              color: AppColors.primary.withValues(alpha: 0.2),
                              borderRadius: BorderRadius.circular(99),
                            ),
                          ),
                        ],
                      ),
                    ),

                    // ── DESCRIPTION FIELD ───────────────────────────
                    Padding(
                      padding: const EdgeInsets.fromLTRB(20, 0, 20, 14),
                      child: _iconField(
                        label: 'DESCRIPTION',
                        icon: LucideIcons.fileEdit,
                        child: TextField(
                          controller: _noteController,
                          cursorColor: AppColors.primary,
                          style: GoogleFonts.publicSans(
                            fontSize: 14, fontWeight: FontWeight.w500,
                            color: AppColors.inkPrimary,
                          ),
                          decoration: InputDecoration(
                            border: InputBorder.none,
                            enabledBorder: InputBorder.none,
                            focusedBorder: InputBorder.none,
                            isDense: true,
                            contentPadding: const EdgeInsets.symmetric(vertical: 16),
                            hintText: 'What was this expense for?',
                            hintStyle: GoogleFonts.publicSans(
                              fontSize: 14,
                              color: AppColors.inkTertiary,
                            ),
                          ),
                        ),
                      ),
                    ),

                    // ── DATE FIELD ──────────────────────────────────
                    Padding(
                      padding: const EdgeInsets.fromLTRB(20, 0, 20, 18),
                      child: GestureDetector(
                        onTap: _pickDate,
                        behavior: HitTestBehavior.opaque,
                        child: _iconField(
                          label: 'DATE',
                          icon: LucideIcons.calendar,
                          child: Padding(
                            padding: const EdgeInsets.symmetric(vertical: 18),
                            child: Text(
                              _dateLabel(),
                              style: GoogleFonts.publicSans(
                                fontSize: 14,
                                fontWeight: FontWeight.w600,
                                color: AppColors.inkPrimary,
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),

                    // ── PAID VIA ────────────────────────────────────
                    Padding(
                      padding: const EdgeInsets.fromLTRB(20, 0, 20, 14),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('PAID VIA', style: GoogleFonts.publicSans(
                            fontSize: 11, fontWeight: FontWeight.w800,
                            letterSpacing: 1, color: AppColors.inkTertiary)),
                          const SizedBox(height: 8),
                          Row(children: [
                            for (final m in const ['CASH','UPI','BANK','CARD'])
                              Expanded(child: Padding(
                                padding: const EdgeInsets.only(right: 6),
                                child: GestureDetector(
                                  onTap: () => setState(() => _paymentMethod = m),
                                  child: Container(
                                    padding: const EdgeInsets.symmetric(vertical: 10),
                                    alignment: Alignment.center,
                                    decoration: BoxDecoration(
                                      color: _paymentMethod == m ? AppColors.primary.withValues(alpha: 0.12) : Colors.white,
                                      border: Border.all(color: _paymentMethod == m ? AppColors.primary : AppColors.outlineVariant),
                                      borderRadius: BorderRadius.circular(12),
                                    ),
                                    child: Text(m, style: GoogleFonts.publicSans(
                                      fontSize: 11, fontWeight: FontWeight.w800,
                                      color: _paymentMethod == m ? AppColors.primary : AppColors.inkSecondary)),
                                  ),
                                ),
                              )),
                          ]),
                        ],
                      ),
                    ),

                    // ── GST / ITC ───────────────────────────────────
                    Padding(
                      padding: const EdgeInsets.fromLTRB(20, 0, 20, 14),
                      child: Container(
                        decoration: BoxDecoration(
                          border: Border.all(color: AppColors.outlineVariant),
                          borderRadius: BorderRadius.circular(14),
                        ),
                        child: Column(children: [
                          SwitchListTile(
                            value: _gstClaimable,
                            onChanged: (v) => setState(() => _gstClaimable = v),
                            activeColor: AppColors.primary,
                            contentPadding: const EdgeInsets.symmetric(horizontal: 14),
                            title: Text('Claim GST (ITC)', style: GoogleFonts.publicSans(
                              fontSize: 14, fontWeight: FontWeight.w700, color: AppColors.inkPrimary)),
                            subtitle: Text('For registered vendors with a GSTIN', style: GoogleFonts.publicSans(
                              fontSize: 11, color: AppColors.inkTertiary)),
                          ),
                          if (_gstClaimable) Padding(
                            padding: const EdgeInsets.fromLTRB(14, 0, 14, 14),
                            child: Column(children: [
                              Row(children: [
                                for (final r in const ['5','12','18','28'])
                                  Expanded(child: Padding(
                                    padding: const EdgeInsets.only(right: 6),
                                    child: GestureDetector(
                                      onTap: () => setState(() => _gstRate = r),
                                      child: Container(
                                        padding: const EdgeInsets.symmetric(vertical: 8),
                                        alignment: Alignment.center,
                                        decoration: BoxDecoration(
                                          color: _gstRate == r ? AppColors.primary.withValues(alpha: 0.12) : Colors.white,
                                          border: Border.all(color: _gstRate == r ? AppColors.primary : AppColors.outlineVariant),
                                          borderRadius: BorderRadius.circular(10),
                                        ),
                                        child: Text('$r%', style: GoogleFonts.publicSans(
                                          fontSize: 12, fontWeight: FontWeight.w800,
                                          color: _gstRate == r ? AppColors.primary : AppColors.inkSecondary)),
                                      ),
                                    ),
                                  )),
                              ]),
                              const SizedBox(height: 10),
                              TextField(
                                controller: _gstinController,
                                textCapitalization: TextCapitalization.characters,
                                style: GoogleFonts.publicSans(fontSize: 13, fontWeight: FontWeight.w700, color: AppColors.inkPrimary),
                                decoration: InputDecoration(
                                  hintText: 'Vendor GSTIN',
                                  isDense: true,
                                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                                ),
                              ),
                            ]),
                          ),
                        ]),
                      ),
                    ),

                    // ── REPEAT MONTHLY (add mode only) ──────────────
                    if (!_isEditMode) Padding(
                      padding: const EdgeInsets.fromLTRB(20, 0, 20, 14),
                      child: Container(
                        decoration: BoxDecoration(
                          border: Border.all(color: AppColors.outlineVariant),
                          borderRadius: BorderRadius.circular(14),
                        ),
                        child: SwitchListTile(
                          value: _repeatMonthly,
                          onChanged: (v) => setState(() => _repeatMonthly = v),
                          activeColor: AppColors.primary,
                          contentPadding: const EdgeInsets.symmetric(horizontal: 14),
                          title: Text('Repeat monthly', style: GoogleFonts.publicSans(
                            fontSize: 14, fontWeight: FontWeight.w700, color: AppColors.inkPrimary)),
                          subtitle: Text('Auto-logs on day ${_selectedDate.day.clamp(1, 28)} every month', style: GoogleFonts.publicSans(
                            fontSize: 11, color: AppColors.inkTertiary)),
                        ),
                      ),
                    ),

                    // ── CATEGORY HEADER ─────────────────────────────
                    Padding(
                      padding: const EdgeInsets.fromLTRB(20, 6, 20, 12),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(
                            'CATEGORY',
                            style: GoogleFonts.publicSans(
                              fontSize: 11,
                              fontWeight: FontWeight.w700,
                              letterSpacing: 1.5,
                              color: AppColors.inkTertiary,
                            ),
                          ),
                          Text(
                            'SEE ALL',
                            style: GoogleFonts.publicSans(
                              fontSize: 10,
                              fontWeight: FontWeight.w700,
                              letterSpacing: 1.8,
                              color: AppColors.primary,
                            ),
                          ),
                        ],
                      ),
                    ),

                    // ── CATEGORY GRID (5 cols × 2 rows) ─────────────
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      child: GridView.builder(
                        shrinkWrap: true,
                        physics: const NeverScrollableScrollPhysics(),
                        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                          crossAxisCount: 5,
                          mainAxisSpacing: 14,
                          crossAxisSpacing: 8,
                          childAspectRatio: 0.78,
                        ),
                        itemCount: _categories.length,
                        itemBuilder: (_, i) {
                          final cat = _categories[i];
                          final value = cat.valueOverride ?? cat.label;
                          final selected = _selectedCategory == value;
                          return GestureDetector(
                            onTap: () => setState(() => _selectedCategory = value),
                            child: Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                AnimatedContainer(
                                  duration: const Duration(milliseconds: 180),
                                  width: 56,
                                  height: 56,
                                  decoration: BoxDecoration(
                                    color: selected ? AppColors.primary : Colors.white,
                                    borderRadius: BorderRadius.circular(18),
                                    border: Border.all(
                                      color: selected
                                          ? AppColors.primary
                                          : Colors.black.withValues(alpha: 0.05),
                                    ),
                                    boxShadow: [
                                      BoxShadow(
                                        color: Colors.black.withValues(alpha: 0.05),
                                        blurRadius: 20,
                                        offset: const Offset(0, 4),
                                      ),
                                    ],
                                  ),
                                  child: Icon(
                                    cat.icon,
                                    size: 22,
                                    color: selected ? Colors.white : AppColors.inkSecondary,
                                  ),
                                ),
                                const SizedBox(height: 8),
                                Text(
                                  cat.label.toUpperCase(),
                                  style: GoogleFonts.publicSans(
                                    fontSize: 10,
                                    fontWeight: FontWeight.w700,
                                    color: selected
                                        ? AppColors.primary
                                        : AppColors.inkTertiary,
                                    letterSpacing: 0.4,
                                  ),
                                ),
                              ],
                            ),
                          );
                        },
                      ),
                    ),

                    if (_formError != null) ...[
                      const SizedBox(height: 18),
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 20),
                        child: Container(
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
                                  style: GoogleFonts.publicSans(
                                    fontSize: 13,
                                    color: AppColors.danger,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],

                    const SizedBox(height: 24),
                  ],
                ),
              ),
            ),

            // ── FOOTER CTA (gradient) ───────────────────────────────
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
              child: SizedBox(
                width: double.infinity,
                height: 64,
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: [
                        AppColors.primary,
                        Color(0xFF769600),
                      ],
                    ),
                    borderRadius: BorderRadius.circular(20),
                    boxShadow: [
                      BoxShadow(
                        color: AppColors.primary.withValues(alpha: 0.25),
                        blurRadius: 16,
                        offset: const Offset(0, 6),
                      ),
                    ],
                  ),
                  child: Material(
                    color: Colors.transparent,
                    child: InkWell(
                      borderRadius: BorderRadius.circular(20),
                      onTap: _isLoading ? null : _submit,
                      child: Center(
                        child: _isLoading
                            ? const SizedBox(
                                width: 22, height: 22,
                                child: CircularProgressIndicator(
                                    color: Colors.white, strokeWidth: 2.5))
                            : Row(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  Text(
                                    _isEditMode ? 'Save Changes' : 'Log Expense',
                                    style: GoogleFonts.publicSans(
                                      fontSize: 17,
                                      fontWeight: FontWeight.w700,
                                      color: Colors.white,
                                      letterSpacing: 0.4,
                                    ),
                                  ),
                                  const SizedBox(width: 10),
                                  const Icon(LucideIcons.arrowRight, size: 20, color: Colors.white),
                                ],
                              ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  Widget _circleIconButton({required IconData icon, required VoidCallback onTap}) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(99),
      child: Container(
        width: 40,
        height: 40,
        decoration: BoxDecoration(
          color: Colors.white,
          shape: BoxShape.circle,
          border: Border.all(color: Colors.black.withValues(alpha: 0.05)),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.05),
              blurRadius: 20,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: const Icon(LucideIcons.arrowLeft, size: 18, color: AppColors.inkPrimary),
      ),
    );
  }

  Widget _iconField({
    required String label,
    required IconData icon,
    required Widget child,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(left: 4, bottom: 8),
          child: Text(
            label,
            style: GoogleFonts.publicSans(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              letterSpacing: 1.5,
              color: AppColors.inkTertiary,
            ),
          ),
        ),
        Container(
          height: 56,
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: Colors.black.withValues(alpha: 0.05)),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.05),
                blurRadius: 20,
                offset: const Offset(0, 4),
              ),
            ],
          ),
          child: Row(
            children: [
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 14),
                child: Icon(icon, size: 18, color: AppColors.inkTertiary),
              ),
              Expanded(child: child),
            ],
          ),
        ),
      ],
    );
  }
}

class _Cat {
  final String label;
  final IconData icon;
  final String? valueOverride; // when display label differs from stored category
  const _Cat(this.label, this.icon, {this.valueOverride});
}

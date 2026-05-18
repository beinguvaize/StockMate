import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile_app/core/database/sync_status_pill.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:mobile_app/features/daybook/data/daybook_models.dart';
import 'package:mobile_app/features/daybook/presentation/daybook_history_screen.dart';
import 'package:mobile_app/features/daybook/providers/daybook_providers.dart';

// ─────────────────────────────────────────────────────────────────────────────
// DayBookScreen
// ─────────────────────────────────────────────────────────────────────────────

class DayBookScreen extends ConsumerStatefulWidget {
  const DayBookScreen({super.key});

  @override
  ConsumerState<DayBookScreen> createState() => _DayBookScreenState();
}

class _DayBookScreenState extends ConsumerState<DayBookScreen> {
  final _openingController = TextEditingController();
  final _physicalCashController = TextEditingController();

  @override
  void dispose() {
    _openingController.dispose();
    _physicalCashController.dispose();
    super.dispose();
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  bool get _isFuture {
    final today = DateTime.now();
    final todayStr =
        '${today.year}-${today.month.toString().padLeft(2, '0')}-${today.day.toString().padLeft(2, '0')}';
    final selectedDate = ref.read(selectedDayBookDateProvider);
    return selectedDate.compareTo(todayStr) > 0;
  }

  bool _isFutureForDate(String selectedDate) {
    final today = DateTime.now();
    final todayStr =
        '${today.year}-${today.month.toString().padLeft(2, '0')}-${today.day.toString().padLeft(2, '0')}';
    return selectedDate.compareTo(todayStr) > 0;
  }

  bool _isTodayForDate(String selectedDate) {
    final today = DateTime.now();
    final todayStr =
        '${today.year}-${today.month.toString().padLeft(2, '0')}-${today.day.toString().padLeft(2, '0')}';
    return selectedDate == todayStr;
  }

  String _formatDate(String iso) {
    final parts = iso.split('-');
    final dt = DateTime(
        int.parse(parts[0]), int.parse(parts[1]), int.parse(parts[2]));
    const months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
    ];
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    return '${days[dt.weekday - 1]}, ${dt.day} ${months[dt.month - 1]} ${dt.year}';
  }

  String _stepDate(String iso, int days) {
    final parts = iso.split('-');
    final dt = DateTime(
        int.parse(parts[0]), int.parse(parts[1]), int.parse(parts[2]));
    final next = dt.add(Duration(days: days));
    return '${next.year}-${next.month.toString().padLeft(2, '0')}-${next.day.toString().padLeft(2, '0')}';
  }

  String _todayStr() {
    final now = DateTime.now();
    return '${now.year}-${now.month.toString().padLeft(2, '0')}-${now.day.toString().padLeft(2, '0')}';
  }

  Future<void> _pickDate(BuildContext context, String current) async {
    final parts = current.split('-');
    final initial = DateTime(
        int.parse(parts[0]), int.parse(parts[1]), int.parse(parts[2]));
    final picked = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime(2020),
      lastDate: DateTime.now(),
      builder: (ctx, child) => Theme(
        data: Theme.of(ctx).copyWith(
          colorScheme: const ColorScheme.light(
            primary: AppColors.primary,
            onPrimary: Colors.white,
          ),
        ),
        child: child!,
      ),
    );
    if (picked != null) {
      final s =
          '${picked.year}-${picked.month.toString().padLeft(2, '0')}-${picked.day.toString().padLeft(2, '0')}';
      ref.read(selectedDayBookDateProvider.notifier).state = s;
    }
  }

  // ── Build ──────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final selectedDate = ref.watch(selectedDayBookDateProvider);
    final ledgerAsync = ref.watch(dayLedgerProvider(selectedDate));
    final mutationsAsync = ref.watch(daybookMutationsProvider);
    final isLoading = mutationsAsync.isLoading;
    final isFuture = _isFutureForDate(selectedDate);
    final isToday = _isTodayForDate(selectedDate);

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
              'Day Book',
              style: GoogleFonts.hankenGrotesk(
                fontSize: 20,
                fontWeight: FontWeight.w800,
                letterSpacing: -0.5,
                color: AppColors.inkPrimary,
              ),
            ),
            Text(
              'DAILY LEDGER',
              style: GoogleFonts.jetBrainsMono(
                fontSize: 9,
                fontWeight: FontWeight.w600,
                color: AppColors.secondary,
                letterSpacing: 1.5,
              ),
            ),
          ],
        ),
        actions: [
          const SyncStatusPill(),
          IconButton(
            icon: const Icon(LucideIcons.history, size: 20),
            tooltip: 'History',
            onPressed: () => Navigator.push(
              context,
              MaterialPageRoute(
                  builder: (_) => const DayBookHistoryScreen()),
            ),
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: Column(
        children: [
          // ── Date nav strip ─────────────────────────────────────────────
          _DateNavStrip(
            selectedDate: selectedDate,
            isFuture: isFuture,
            isToday: isToday,
            formatDate: _formatDate,
            onPrev: () {
              ref.read(selectedDayBookDateProvider.notifier).state =
                  _stepDate(selectedDate, -1);
            },
            onNext: () {
              if (!isFuture) {
                final next = _stepDate(selectedDate, 1);
                if (!_isFutureForDate(next)) {
                  ref.read(selectedDayBookDateProvider.notifier).state = next;
                } else {
                  ref.read(selectedDayBookDateProvider.notifier).state = next;
                }
              }
            },
            onPickDate: () => _pickDate(context, selectedDate),
            onToday: () {
              ref.read(selectedDayBookDateProvider.notifier).state =
                  _todayStr();
            },
            ledgerLocked: ledgerAsync.valueOrNull?.isLocked,
          ),

          // ── Body ───────────────────────────────────────────────────────
          Expanded(
            child: ledgerAsync.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => Center(
                child: Text(
                  'Error: $e',
                  style: GoogleFonts.inter(color: AppColors.danger),
                ),
              ),
              data: (ledger) => _LedgerBody(
                ledger: ledger,
                selectedDate: selectedDate,
                isFuture: isFuture,
                isLoading: isLoading,
                openingController: _openingController,
                physicalCashController: _physicalCashController,
                formatDate: _formatDate,
                onSaveOpening: (amount) async {
                  await ref
                      .read(daybookMutationsProvider.notifier)
                      .saveOpening(date: selectedDate, amount: amount);
                  _openingController.clear();
                },
                onSavePhysical: (physical) async {
                  await ref
                      .read(daybookMutationsProvider.notifier)
                      .savePhysicalCash(
                        date: selectedDate,
                        physical: physical,
                        closingBal: ledger.closingBal,
                        openingBal: ledger.openingBal,
                      );
                },
                onCloseDay: () async {
                  final confirmed = await _showCloseDayDialog(
                      context, _formatDate(selectedDate));
                  if (confirmed == true) {
                    await ref
                        .read(daybookMutationsProvider.notifier)
                        .closeDay(
                          date: selectedDate,
                          ledger: ledger,
                          physicalCash: ledger.savedPhysicalCash,
                        );
                  }
                },
              ),
            ),
          ),
        ],
      ),
    );
  }

  Future<bool?> _showCloseDayDialog(
      BuildContext context, String formattedDate) {
    return showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.surface,
        shape:
            RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: Row(
          children: [
            const Icon(LucideIcons.lock,
                size: 18, color: AppColors.inkPrimary),
            const SizedBox(width: 8),
            Text(
              'Close Day',
              style: GoogleFonts.hankenGrotesk(
                fontWeight: FontWeight.w800,
                fontSize: 18,
                color: AppColors.inkPrimary,
              ),
            ),
          ],
        ),
        content: Text(
          'Close $formattedDate? This locks the ledger and cannot be undone.',
          style: GoogleFonts.inter(
              fontSize: 14, color: AppColors.inkSecondary),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text('Cancel',
                style: GoogleFonts.inter(color: AppColors.inkSecondary)),
          ),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.inkPrimary,
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(10)),
            ),
            onPressed: () => Navigator.pop(ctx, true),
            child: Text('Lock Day',
                style: GoogleFonts.inter(
                    fontWeight: FontWeight.w700, color: Colors.white)),
          ),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Date nav strip
// ─────────────────────────────────────────────────────────────────────────────

class _DateNavStrip extends StatelessWidget {
  final String selectedDate;
  final bool isFuture;
  final bool isToday;
  final String Function(String) formatDate;
  final VoidCallback onPrev;
  final VoidCallback onNext;
  final VoidCallback onPickDate;
  final VoidCallback onToday;
  final bool? ledgerLocked;

  const _DateNavStrip({
    required this.selectedDate,
    required this.isFuture,
    required this.isToday,
    required this.formatDate,
    required this.onPrev,
    required this.onNext,
    required this.onPickDate,
    required this.onToday,
    this.ledgerLocked,
  });

  @override
  Widget build(BuildContext context) {
    final isNextDisabled = isFuture;

    return Container(
      color: AppColors.canvas,
      padding: const EdgeInsets.fromLTRB(8, 4, 8, 8),
      child: Row(
        children: [
          IconButton(
            icon: const Icon(LucideIcons.chevronLeft,
                size: 18, color: AppColors.inkPrimary),
            onPressed: onPrev,
            padding: const EdgeInsets.all(6),
            constraints: const BoxConstraints(),
          ),
          Expanded(
            child: GestureDetector(
              onTap: onPickDate,
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                decoration: BoxDecoration(
                  color: AppColors.surface,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                      color: AppColors.outlineVariant.withValues(alpha: 0.6)),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(
                      formatDate(selectedDate),
                      style: GoogleFonts.jetBrainsMono(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: AppColors.inkPrimary,
                      ),
                    ),
                    const SizedBox(width: 4),
                    const Icon(LucideIcons.chevronDown,
                        size: 14, color: AppColors.inkSecondary),
                    if (ledgerLocked == true) ...[
                      const SizedBox(width: 6),
                      _StatusChip(
                          label: 'Locked',
                          color: const Color(0xFF059669),
                          icon: LucideIcons.lock),
                    ] else if (isFuture) ...[
                      const SizedBox(width: 6),
                      _StatusChip(
                          label: 'Future',
                          color: AppColors.inkTertiary,
                          icon: LucideIcons.clock),
                    ],
                  ],
                ),
              ),
            ),
          ),
          IconButton(
            icon: Icon(LucideIcons.chevronRight,
                size: 18,
                color: isNextDisabled
                    ? AppColors.inkTertiary.withValues(alpha: 0.4)
                    : AppColors.inkPrimary),
            onPressed: isNextDisabled ? null : onNext,
            padding: const EdgeInsets.all(6),
            constraints: const BoxConstraints(),
          ),
          if (!isToday)
            TextButton(
              onPressed: onToday,
              style: TextButton.styleFrom(
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                minimumSize: Size.zero,
                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              ),
              child: Text(
                'Today',
                style: GoogleFonts.inter(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: AppColors.primary,
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _StatusChip extends StatelessWidget {
  final String label;
  final Color color;
  final IconData icon;

  const _StatusChip(
      {required this.label, required this.color, required this.icon});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 9, color: color),
          const SizedBox(width: 3),
          Text(
            label,
            style: GoogleFonts.jetBrainsMono(
              fontSize: 9,
              fontWeight: FontWeight.w700,
              color: color,
              letterSpacing: 0.3,
            ),
          ),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Ledger body (scrollable)
// ─────────────────────────────────────────────────────────────────────────────

class _LedgerBody extends StatefulWidget {
  final DayBookLedger ledger;
  final String selectedDate;
  final bool isFuture;
  final bool isLoading;
  final TextEditingController openingController;
  final TextEditingController physicalCashController;
  final String Function(String) formatDate;
  final Future<void> Function(double) onSaveOpening;
  final Future<void> Function(double) onSavePhysical;
  final Future<void> Function() onCloseDay;

  const _LedgerBody({
    required this.ledger,
    required this.selectedDate,
    required this.isFuture,
    required this.isLoading,
    required this.openingController,
    required this.physicalCashController,
    required this.formatDate,
    required this.onSaveOpening,
    required this.onSavePhysical,
    required this.onCloseDay,
  });

  @override
  State<_LedgerBody> createState() => _LedgerBodyState();
}

class _LedgerBodyState extends State<_LedgerBody> {
  @override
  Widget build(BuildContext context) {
    final ledger = widget.ledger;
    final net = ledger.cashIn - ledger.cashOut;

    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // 1. KPI Grid
          _KpiGrid(ledger: ledger),
          const SizedBox(height: 16),

          // 2. Opening Balance card
          _OpeningCard(
            ledger: ledger,
            openingController: widget.openingController,
            isLoading: widget.isLoading,
            onSaveOpening: widget.onSaveOpening,
          ),
          const SizedBox(height: 12),

          // 3. Receipts breakdown (only if hasOpening)
          if (ledger.hasOpening) ...[
            _ReceiptsCard(ledger: ledger),
            const SizedBox(height: 12),
          ],

          // 4. Payments breakdown (only if hasOpening)
          if (ledger.hasOpening) ...[
            _PaymentsCard(ledger: ledger),
            const SizedBox(height: 12),
          ],

          // 5. Cash reconciliation (only if hasOpening and !isFuture)
          if (ledger.hasOpening && !widget.isFuture) ...[
            _ReconciliationCard(
              ledger: ledger,
              physicalCashController: widget.physicalCashController,
              isLoading: widget.isLoading,
              onSavePhysical: widget.onSavePhysical,
            ),
            const SizedBox(height: 12),
          ],

          // 6. Transaction log
          _TransactionsSection(ledger: ledger, net: net),
          const SizedBox(height: 12),

          // 7. Close & Lock Day button
          if (!ledger.isLocked && ledger.hasOpening && !widget.isFuture) ...[
            _CloseDayButton(
              isLoading: widget.isLoading,
              onCloseDay: widget.onCloseDay,
            ),
            const SizedBox(height: 12),
          ],

          // 8. Credit sales footnote
          if (ledger.creditSales > 0) ...[
            _CreditSalesFootnote(creditSales: ledger.creditSales),
          ],
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. KPI Grid
// ─────────────────────────────────────────────────────────────────────────────

class _KpiGrid extends StatelessWidget {
  final DayBookLedger ledger;
  const _KpiGrid({required this.ledger});

  @override
  Widget build(BuildContext context) {
    final closingColor =
        ledger.isDeficit ? AppColors.danger : AppColors.inkPrimary;

    String closingSubtitle() {
      if (ledger.isLocked) return 'Locked';
      if (ledger.isDeficit) return 'Cash deficit';
      if (!ledger.hasOpening) return 'Estimated';
      return '';
    }

    return Column(
      children: [
        Row(
          children: [
            Expanded(
              child: _KpiCard(
                label: 'OPENING',
                amount: ledger.openingBal,
                color: AppColors.inkPrimary,
                subtitle: ledger.hasOpening ? 'carried forward' : 'not set',
                subtitleColor:
                    ledger.hasOpening ? AppColors.inkTertiary : AppColors.warning,
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: _KpiCard(
                label: 'CASH IN',
                amount: ledger.cashIn,
                color: const Color(0xFF059669),
                subtitle: ledger.bankIn > 0
                    ? '₹${ledger.bankIn.toStringAsFixed(0)} via bank'
                    : null,
                subtitleColor: AppColors.inkTertiary,
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            Expanded(
              child: _KpiCard(
                label: 'CASH OUT',
                amount: ledger.cashOut,
                color: AppColors.danger,
                subtitle: ledger.bankPurchPaid > 0
                    ? '₹${ledger.bankPurchPaid.toStringAsFixed(0)} bank purch.'
                    : null,
                subtitleColor: AppColors.inkTertiary,
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: _KpiCard(
                label: 'CLOSING',
                amount: ledger.closingBal,
                color: closingColor,
                subtitle: closingSubtitle().isNotEmpty ? closingSubtitle() : null,
                subtitleColor: ledger.isDeficit ? AppColors.danger : AppColors.inkTertiary,
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class _KpiCard extends StatelessWidget {
  final String label;
  final double amount;
  final Color color;
  final String? subtitle;
  final Color? subtitleColor;

  const _KpiCard({
    required this.label,
    required this.amount,
    required this.color,
    this.subtitle,
    this.subtitleColor,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(14),
        boxShadow: [AppColors.cardShadow],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: GoogleFonts.jetBrainsMono(
              fontSize: 10,
              fontWeight: FontWeight.w700,
              color: AppColors.inkTertiary,
              letterSpacing: 1.2,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            '₹${amount.toStringAsFixed(0)}',
            style: GoogleFonts.hankenGrotesk(
              fontSize: 20,
              fontWeight: FontWeight.w800,
              color: color,
              letterSpacing: -0.5,
              height: 1.1,
            ),
          ),
          if (subtitle != null) ...[
            const SizedBox(height: 3),
            Text(
              subtitle!,
              style: GoogleFonts.inter(
                fontSize: 11,
                color: subtitleColor ?? AppColors.inkTertiary,
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Opening Balance card
// ─────────────────────────────────────────────────────────────────────────────

class _OpeningCard extends StatefulWidget {
  final DayBookLedger ledger;
  final TextEditingController openingController;
  final bool isLoading;
  final Future<void> Function(double) onSaveOpening;

  const _OpeningCard({
    required this.ledger,
    required this.openingController,
    required this.isLoading,
    required this.onSaveOpening,
  });

  @override
  State<_OpeningCard> createState() => _OpeningCardState();
}

class _OpeningCardState extends State<_OpeningCard> {
  bool _editing = false;

  @override
  Widget build(BuildContext context) {
    final ledger = widget.ledger;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [AppColors.cardShadow],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _SectionLabel(label: 'OPENING BALANCE'),
          const SizedBox(height: 14),

          if (ledger.isLocked)
            _LockedPanel(closedAt: ledger.closedAt)
          else if (ledger.hasOpening && !_editing)
            _OpeningEquation(
              ledger: ledger,
              onEdit: () => setState(() => _editing = true),
            )
          else
            _OpeningForm(
              ledger: ledger,
              controller: widget.openingController,
              isLoading: widget.isLoading,
              onSave: (amount) async {
                await widget.onSaveOpening(amount);
                if (mounted) setState(() => _editing = false);
              },
            ),
        ],
      ),
    );
  }
}

class _LockedPanel extends StatelessWidget {
  final DateTime? closedAt;
  const _LockedPanel({this.closedAt});

  String _fmt(DateTime? dt) {
    if (dt == null) return '';
    final local = dt.toLocal();
    final h = local.hour > 12 ? local.hour - 12 : (local.hour == 0 ? 12 : local.hour);
    final ampm = local.hour >= 12 ? 'PM' : 'AM';
    final mm = local.minute.toString().padLeft(2, '0');
    return '$h:$mm $ampm';
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFF059669).withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
            color: const Color(0xFF059669).withValues(alpha: 0.25)),
      ),
      child: Row(
        children: [
          const Icon(LucideIcons.shieldCheck,
              size: 20, color: Color(0xFF059669)),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Day Closed & Locked',
                  style: GoogleFonts.hankenGrotesk(
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    color: const Color(0xFF059669),
                  ),
                ),
                if (closedAt != null)
                  Text(
                    'Locked at ${_fmt(closedAt)}',
                    style: GoogleFonts.inter(
                        fontSize: 12,
                        color: const Color(0xFF059669).withValues(alpha: 0.8)),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _OpeningEquation extends StatelessWidget {
  final DayBookLedger ledger;
  final VoidCallback onEdit;

  const _OpeningEquation({required this.ledger, required this.onEdit});

  @override
  Widget build(BuildContext context) {
    final closingColor =
        ledger.isDeficit ? AppColors.danger : AppColors.inkPrimary;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _EquationRow(
            label: 'Opening Balance',
            value: ledger.openingBal,
            color: const Color(0xFF2563EB),
            prefix: ''),
        _EquationRow(
            label: '+ Cash Receipts',
            value: ledger.cashIn,
            color: const Color(0xFF059669),
            prefix: '+'),
        _EquationRow(
            label: '− Cash Payments',
            value: ledger.cashOut,
            color: AppColors.danger,
            prefix: '−'),
        const Divider(height: 16),
        _EquationRow(
          label: '= Closing Balance',
          value: ledger.closingBal,
          color: closingColor,
          prefix: '=',
          bold: true,
        ),
        const SizedBox(height: 10),
        GestureDetector(
          onTap: onEdit,
          child: Text(
            'Edit opening balance',
            style: GoogleFonts.inter(
              fontSize: 12,
              color: AppColors.primary,
              decoration: TextDecoration.underline,
            ),
          ),
        ),
      ],
    );
  }
}

class _EquationRow extends StatelessWidget {
  final String label;
  final double value;
  final Color color;
  final String prefix;
  final bool bold;

  const _EquationRow({
    required this.label,
    required this.value,
    required this.color,
    required this.prefix,
    this.bold = false,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: GoogleFonts.inter(
              fontSize: 13,
              fontWeight: bold ? FontWeight.w700 : FontWeight.w500,
              color: bold ? color : AppColors.inkSecondary,
            ),
          ),
          Text(
            '${prefix.isNotEmpty ? '$prefix ' : ''}₹${value.abs().toStringAsFixed(2)}',
            style: GoogleFonts.jetBrainsMono(
              fontSize: 13,
              fontWeight: bold ? FontWeight.w800 : FontWeight.w600,
              color: color,
            ),
          ),
        ],
      ),
    );
  }
}

class _OpeningForm extends StatelessWidget {
  final DayBookLedger ledger;
  final TextEditingController controller;
  final bool isLoading;
  final Future<void> Function(double) onSave;

  const _OpeningForm({
    required this.ledger,
    required this.controller,
    required this.isLoading,
    required this.onSave,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // Previous closing suggestion
        if (ledger.prevClosing != null) ...[
          OutlinedButton.icon(
            icon: const Icon(LucideIcons.history, size: 14),
            label: Text(
              'Use prev. closing ₹${ledger.prevClosing!.toStringAsFixed(2)}',
              style: GoogleFonts.inter(fontSize: 13, fontWeight: FontWeight.w600),
            ),
            style: OutlinedButton.styleFrom(
              foregroundColor: AppColors.primary,
              side: const BorderSide(color: AppColors.primary),
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(10)),
            ),
            onPressed: isLoading ? null : () => onSave(ledger.prevClosing!),
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                  child: Divider(
                      color: AppColors.outlineVariant.withValues(alpha: 0.5))),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 10),
                child: Text('or enter manually',
                    style: GoogleFonts.inter(
                        fontSize: 11, color: AppColors.inkTertiary)),
              ),
              Expanded(
                  child: Divider(
                      color: AppColors.outlineVariant.withValues(alpha: 0.5))),
            ],
          ),
          const SizedBox(height: 10),
        ],
        TextFormField(
          controller: controller,
          keyboardType:
              const TextInputType.numberWithOptions(decimal: true),
          inputFormatters: [
            FilteringTextInputFormatter.allow(RegExp(r'^\d*\.?\d*'))
          ],
          style: GoogleFonts.jetBrainsMono(
              fontSize: 16,
              fontWeight: FontWeight.w700,
              color: AppColors.inkPrimary),
          decoration: InputDecoration(
            hintText: 'Enter opening balance',
            hintStyle: GoogleFonts.inter(
                fontSize: 14, color: AppColors.inkTertiary),
            prefixText: '₹ ',
            prefixStyle: GoogleFonts.jetBrainsMono(
                fontSize: 16,
                fontWeight: FontWeight.w700,
                color: AppColors.inkSecondary),
            filled: true,
            fillColor: AppColors.surfaceContainer.withValues(alpha: 0.6),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: BorderSide.none,
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide:
                  const BorderSide(color: AppColors.primary, width: 1.5),
            ),
            contentPadding:
                const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
          ),
        ),
        const SizedBox(height: 12),
        FilledButton(
          style: FilledButton.styleFrom(
            backgroundColor: AppColors.primary,
            minimumSize: const Size.fromHeight(48),
            shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12)),
          ),
          onPressed: isLoading
              ? null
              : () {
                  final text = controller.text.trim();
                  final val = double.tryParse(text);
                  if (val != null) onSave(val);
                },
          child: isLoading
              ? const SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(
                      strokeWidth: 2, color: Colors.white),
                )
              : Text(
                  'SAVE OPENING',
                  style: GoogleFonts.jetBrainsMono(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 1.2,
                    color: Colors.white,
                  ),
                ),
        ),
      ],
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Receipts breakdown card
// ─────────────────────────────────────────────────────────────────────────────

class _ReceiptsCard extends StatelessWidget {
  final DayBookLedger ledger;
  const _ReceiptsCard({required this.ledger});

  @override
  Widget build(BuildContext context) {
    return _BreakdownCard(
      label: 'CASH RECEIPTS',
      children: [
        _BdRow(
            label: 'Cash Sales',
            value: ledger.cashSales,
            color: const Color(0xFF059669)),
        _BdRow(
            label: 'Bank/UPI Sales',
            value: ledger.bankSales,
            color: const Color(0xFF2563EB)),
        _BdRow(
          label: 'Credit Sales',
          value: ledger.creditSales,
          color: AppColors.inkTertiary,
          italic: true,
          suffix: '(excluded from cash)',
        ),
        _BdRow(
            label: 'Cash Collections',
            value: ledger.cashCollect,
            color: const Color(0xFF059669)),
        _BdRow(
            label: 'Bank Collections',
            value: ledger.bankCollect,
            color: const Color(0xFF2563EB)),
        const Divider(height: 16),
        _BdRow(
          label: 'Total Cash In',
          value: ledger.cashIn,
          color: const Color(0xFF059669),
          bold: true,
        ),
      ],
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Payments breakdown card
// ─────────────────────────────────────────────────────────────────────────────

class _PaymentsCard extends StatelessWidget {
  final DayBookLedger ledger;
  const _PaymentsCard({required this.ledger});

  @override
  Widget build(BuildContext context) {
    return _BreakdownCard(
      label: 'CASH PAYMENTS',
      children: [
        _BdRow(
            label: 'Expenses',
            value: ledger.totalExpenses,
            color: AppColors.danger),
        _BdRow(
            label: 'Cash Purchases',
            value: ledger.cashPurchPaid,
            color: AppColors.danger),
        _BdRow(
            label: 'Bank Purchases',
            value: ledger.bankPurchPaid,
            color: const Color(0xFF2563EB)),
        const Divider(height: 16),
        _BdRow(
          label: 'Total Cash Out',
          value: ledger.cashOut,
          color: AppColors.danger,
          bold: true,
        ),
      ],
    );
  }
}

class _BreakdownCard extends StatelessWidget {
  final String label;
  final List<Widget> children;

  const _BreakdownCard({required this.label, required this.children});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [AppColors.cardShadow],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _SectionLabel(label: label),
          const SizedBox(height: 12),
          ...children,
        ],
      ),
    );
  }
}

class _BdRow extends StatelessWidget {
  final String label;
  final double value;
  final Color color;
  final bool bold;
  final bool italic;
  final String? suffix;

  const _BdRow({
    required this.label,
    required this.value,
    required this.color,
    this.bold = false,
    this.italic = false,
    this.suffix,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        children: [
          Expanded(
            child: Text(
              suffix != null ? '$label $suffix' : label,
              style: GoogleFonts.inter(
                fontSize: 13,
                fontWeight: bold ? FontWeight.w700 : FontWeight.w500,
                fontStyle: italic ? FontStyle.italic : FontStyle.normal,
                color: bold ? AppColors.inkPrimary : AppColors.inkSecondary,
              ),
            ),
          ),
          Text(
            '₹${value.toStringAsFixed(2)}',
            style: GoogleFonts.jetBrainsMono(
              fontSize: 13,
              fontWeight: bold ? FontWeight.w800 : FontWeight.w600,
              color: color,
              fontStyle: italic ? FontStyle.italic : FontStyle.normal,
            ),
          ),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Cash reconciliation card
// ─────────────────────────────────────────────────────────────────────────────

class _ReconciliationCard extends StatefulWidget {
  final DayBookLedger ledger;
  final TextEditingController physicalCashController;
  final bool isLoading;
  final Future<void> Function(double) onSavePhysical;

  const _ReconciliationCard({
    required this.ledger,
    required this.physicalCashController,
    required this.isLoading,
    required this.onSavePhysical,
  });

  @override
  State<_ReconciliationCard> createState() => _ReconciliationCardState();
}

class _ReconciliationCardState extends State<_ReconciliationCard> {
  @override
  Widget build(BuildContext context) {
    final ledger = widget.ledger;
    final ctrl = widget.physicalCashController;
    final physical = double.tryParse(ctrl.text);
    final variance =
        physical != null ? physical - ledger.closingBal : null;

    Color varianceColor = const Color(0xFF059669);
    String varianceText = '';
    if (variance != null) {
      if (variance.abs() < 0.01) {
        varianceColor = const Color(0xFF059669);
        varianceText = '✓ Balanced';
      } else if (variance > 0) {
        varianceColor = const Color(0xFF2563EB);
        varianceText =
            'Cash Over +₹${variance.toStringAsFixed(2)}';
      } else {
        varianceColor = AppColors.danger;
        varianceText =
            'Cash Short ₹${variance.toStringAsFixed(2)}';
      }
    }

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFFFFFBEB),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
            color: AppColors.warning.withValues(alpha: 0.3)),
        boxShadow: [AppColors.cardShadow],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(LucideIcons.banknote,
                  size: 16, color: AppColors.warning),
              const SizedBox(width: 8),
              _SectionLabel(label: 'CASH RECONCILIATION'),
              if (ledger.savedPhysicalCash != null) ...[
                const Spacer(),
                Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: AppColors.warning.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(
                    'Saved: ₹${ledger.savedPhysicalCash!.toStringAsFixed(2)}',
                    style: GoogleFonts.jetBrainsMono(
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                      color: AppColors.warning,
                    ),
                  ),
                ),
              ],
            ],
          ),
          const SizedBox(height: 12),
          // Book balance row
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'Book Balance',
                style: GoogleFonts.inter(
                    fontSize: 13, color: AppColors.inkSecondary),
              ),
              Text(
                '₹${ledger.closingBal.toStringAsFixed(2)}',
                style: GoogleFonts.jetBrainsMono(
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                  color: ledger.isDeficit
                      ? AppColors.danger
                      : AppColors.inkPrimary,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          // Physical cash input
          TextFormField(
            controller: ctrl,
            keyboardType:
                const TextInputType.numberWithOptions(decimal: true),
            inputFormatters: [
              FilteringTextInputFormatter.allow(RegExp(r'^\d*\.?\d*'))
            ],
            enabled: !ledger.isLocked,
            onChanged: (_) => setState(() {}),
            style: GoogleFonts.jetBrainsMono(
                fontSize: 15,
                fontWeight: FontWeight.w700,
                color: AppColors.inkPrimary),
            decoration: InputDecoration(
              hintText: 'Physical cash count',
              hintStyle: GoogleFonts.inter(
                  fontSize: 14, color: AppColors.inkTertiary),
              prefixText: '₹ ',
              prefixStyle: GoogleFonts.jetBrainsMono(
                  fontSize: 15,
                  fontWeight: FontWeight.w700,
                  color: AppColors.inkSecondary),
              filled: true,
              fillColor: Colors.white.withValues(alpha: 0.8),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(
                    color: AppColors.warning.withValues(alpha: 0.4)),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(
                    color: AppColors.warning.withValues(alpha: 0.4)),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: const BorderSide(
                    color: AppColors.warning, width: 1.5),
              ),
              contentPadding: const EdgeInsets.symmetric(
                  horizontal: 14, vertical: 14),
            ),
          ),
          // Variance display
          if (variance != null) ...[
            const SizedBox(height: 8),
            Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: varianceColor.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    varianceText,
                    style: GoogleFonts.jetBrainsMono(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      color: varianceColor,
                    ),
                  ),
                ],
              ),
            ),
          ],
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            height: 46,
            child: FilledButton(
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.warning,
                disabledBackgroundColor:
                    AppColors.warning.withValues(alpha: 0.4),
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12)),
              ),
              onPressed: (ctrl.text.trim().isEmpty ||
                      ledger.isLocked ||
                      widget.isLoading)
                  ? null
                  : () {
                      final val = double.tryParse(ctrl.text.trim());
                      if (val != null) widget.onSavePhysical(val);
                    },
              child: widget.isLoading
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: Colors.white),
                    )
                  : Text(
                      'SAVE COUNT',
                      style: GoogleFonts.jetBrainsMono(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 1.2,
                        color: Colors.white,
                      ),
                    ),
            ),
          ),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Transaction log
// ─────────────────────────────────────────────────────────────────────────────

class _TransactionsSection extends StatelessWidget {
  final DayBookLedger ledger;
  final double net;

  const _TransactionsSection({required this.ledger, required this.net});

  @override
  Widget build(BuildContext context) {
    final entries = ledger.entries;
    final netPositive = net >= 0;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Section header
        Row(
          children: [
            Container(
              padding: const EdgeInsets.all(7),
              decoration: BoxDecoration(
                color: AppColors.surfaceContainer,
                borderRadius: BorderRadius.circular(10),
              ),
              child: const Icon(LucideIcons.listOrdered,
                  size: 14, color: AppColors.inkSecondary),
            ),
            const SizedBox(width: 10),
            Text(
              'TRANSACTIONS',
              style: GoogleFonts.jetBrainsMono(
                fontSize: 11,
                fontWeight: FontWeight.w700,
                letterSpacing: 1.5,
                color: AppColors.inkSecondary,
              ),
            ),
            const SizedBox(width: 8),
            Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(
                color: AppColors.surfaceContainer,
                borderRadius: BorderRadius.circular(20),
              ),
              child: Text(
                '${entries.length}',
                style: GoogleFonts.jetBrainsMono(
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                    color: AppColors.inkSecondary),
              ),
            ),
            const Spacer(),
            // Net pill
            Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: netPositive
                    ? const Color(0xFF059669).withValues(alpha: 0.1)
                    : AppColors.danger.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(20),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    netPositive
                        ? LucideIcons.trendingUp
                        : LucideIcons.trendingDown,
                    size: 11,
                    color: netPositive
                        ? const Color(0xFF059669)
                        : AppColors.danger,
                  ),
                  const SizedBox(width: 4),
                  Text(
                    '${netPositive ? '+' : '-'}₹${net.abs().toStringAsFixed(0)}',
                    style: GoogleFonts.jetBrainsMono(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      color: netPositive
                          ? const Color(0xFF059669)
                          : AppColors.danger,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        if (entries.isEmpty)
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(vertical: 32),
            decoration: BoxDecoration(
              color: AppColors.surface,
              borderRadius: BorderRadius.circular(16),
              boxShadow: [AppColors.cardShadow],
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(LucideIcons.bookOpen,
                    size: 32, color: AppColors.inkTertiary),
                const SizedBox(height: 10),
                Text(
                  'No transactions',
                  style: GoogleFonts.hankenGrotesk(
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                    color: AppColors.inkPrimary,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  'Nothing recorded for this day',
                  style: GoogleFonts.inter(
                      fontSize: 13, color: AppColors.inkSecondary),
                ),
              ],
            ),
          )
        else
          ...entries.map((e) => Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: _EntryCard(entry: e),
              )),
      ],
    );
  }
}

class _EntryCard extends StatelessWidget {
  final DayBookEntry entry;
  const _EntryCard({required this.entry});

  @override
  Widget build(BuildContext context) {
    Color iconBg;
    Color iconColor = Colors.white;
    IconData icon;
    Color amountColor;
    String sign;
    bool isItalic = false;

    switch (entry.type) {
      case EntryType.income:
        iconBg = const Color(0xFF059669);
        icon = LucideIcons.arrowDownLeft;
        amountColor = const Color(0xFF059669);
        sign = '+';
        break;
      case EntryType.expense:
        iconBg = AppColors.danger;
        icon = LucideIcons.arrowUpRight;
        amountColor = AppColors.danger;
        sign = '-';
        break;
      case EntryType.creditSale:
        iconBg = AppColors.inkTertiary;
        icon = LucideIcons.clock;
        amountColor = AppColors.inkTertiary;
        sign = '';
        isItalic = true;
        break;
    }

    Color categoryPillColor;
    String categoryLabel = entry.category.toUpperCase();
    switch (entry.category.toLowerCase()) {
      case 'sale':
        categoryPillColor = const Color(0xFF059669);
        break;
      case 'collection':
        categoryPillColor = const Color(0xFF2563EB);
        break;
      case 'purchase':
        categoryPillColor = const Color(0xFFD97706);
        break;
      default:
        categoryPillColor = AppColors.inkTertiary;
    }

    String methodLabel;
    Color methodColor;
    switch (entry.method) {
      case MethodKind.cash:
        methodLabel = 'CASH';
        methodColor = const Color(0xFF059669);
        break;
      case MethodKind.bank:
        methodLabel = 'BANK';
        methodColor = const Color(0xFF2563EB);
        break;
      case MethodKind.credit:
        methodLabel = 'CREDIT';
        methodColor = AppColors.inkTertiary;
        break;
      case MethodKind.other:
        methodLabel = entry.methodLabel.toUpperCase();
        methodColor = AppColors.inkTertiary;
        break;
    }

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(14),
        border:
            Border.all(color: Colors.black.withValues(alpha: 0.06)),
        boxShadow: [AppColors.cardShadow],
      ),
      child: Row(
        children: [
          // Icon circle
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: iconBg,
              shape: BoxShape.circle,
            ),
            child: Icon(icon, size: 16, color: iconColor),
          ),
          const SizedBox(width: 10),
          // Center: title, note, category pill
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  entry.title,
                  style: GoogleFonts.inter(
                    fontWeight: FontWeight.w600,
                    fontSize: 14,
                    color: AppColors.inkPrimary,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                if (entry.note != null && entry.note!.isNotEmpty) ...[
                  const SizedBox(height: 1),
                  Text(
                    entry.note!,
                    style: GoogleFonts.inter(
                      fontSize: 12,
                      color: AppColors.inkTertiary,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
                const SizedBox(height: 4),
                Row(
                  children: [
                    // Category pill
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: categoryPillColor.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Text(
                        categoryLabel,
                        style: GoogleFonts.jetBrainsMono(
                          fontSize: 9,
                          fontWeight: FontWeight.w700,
                          color: categoryPillColor,
                        ),
                      ),
                    ),
                    const SizedBox(width: 5),
                    // Method badge
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 5, vertical: 2),
                      decoration: BoxDecoration(
                        color: methodColor.withValues(alpha: 0.08),
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(
                        methodLabel,
                        style: GoogleFonts.jetBrainsMono(
                          fontSize: 8,
                          fontWeight: FontWeight.w700,
                          color: methodColor,
                          letterSpacing: 0.3,
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          // Right: amount + running balance
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                '${sign}₹${entry.amount.toStringAsFixed(2)}',
                style: GoogleFonts.hankenGrotesk(
                  fontWeight: FontWeight.w800,
                  fontSize: 14,
                  color: amountColor,
                  letterSpacing: -0.3,
                  fontStyle: isItalic ? FontStyle.italic : FontStyle.normal,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                '₹${entry.runningBalance.toStringAsFixed(0)}',
                style: GoogleFonts.jetBrainsMono(
                  fontSize: 11,
                  color: AppColors.inkTertiary,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. Close & Lock Day button
// ─────────────────────────────────────────────────────────────────────────────

class _CloseDayButton extends StatelessWidget {
  final bool isLoading;
  final Future<void> Function() onCloseDay;

  const _CloseDayButton({required this.isLoading, required this.onCloseDay});

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 56,
      child: FilledButton.icon(
        style: FilledButton.styleFrom(
          backgroundColor: AppColors.inkPrimary,
          disabledBackgroundColor:
              AppColors.inkPrimary.withValues(alpha: 0.5),
          shape: const StadiumBorder(),
        ),
        icon: isLoading
            ? const SizedBox(
                width: 18,
                height: 18,
                child: CircularProgressIndicator(
                    strokeWidth: 2, color: Colors.white),
              )
            : const Icon(LucideIcons.lock, size: 18, color: Colors.white),
        label: Text(
          'CLOSE & LOCK DAY',
          style: GoogleFonts.jetBrainsMono(
            fontSize: 13,
            fontWeight: FontWeight.w800,
            letterSpacing: 1.2,
            color: Colors.white,
          ),
        ),
        onPressed: isLoading ? null : onCloseDay,
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. Credit sales footnote
// ─────────────────────────────────────────────────────────────────────────────

class _CreditSalesFootnote extends StatelessWidget {
  final double creditSales;
  const _CreditSalesFootnote({required this.creditSales});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: AppColors.primary.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(12),
        border:
            Border.all(color: AppColors.primary.withValues(alpha: 0.2)),
      ),
      child: Row(
        children: [
          const Icon(LucideIcons.info, size: 16, color: AppColors.primary),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              '₹${creditSales.toStringAsFixed(2)} in credit sales excluded from cash flow',
              style: GoogleFonts.inter(
                fontSize: 12,
                color: AppColors.primary,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────────────

class _SectionLabel extends StatelessWidget {
  final String label;
  const _SectionLabel({required this.label});

  @override
  Widget build(BuildContext context) {
    return Text(
      label,
      style: GoogleFonts.jetBrainsMono(
        fontSize: 10,
        fontWeight: FontWeight.w700,
        color: AppColors.inkTertiary,
        letterSpacing: 1.5,
      ),
    );
  }
}

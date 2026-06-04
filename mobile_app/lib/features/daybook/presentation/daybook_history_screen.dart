import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:mobile_app/features/daybook/data/daybook_models.dart';
import 'package:mobile_app/features/daybook/providers/daybook_providers.dart';

// ---------------------------------------------------------------------------
// Date format helper
// ---------------------------------------------------------------------------
String _fmt(String iso) {
  final p = iso.split('-');
  if (p.length < 3) return iso;
  final dt = DateTime(int.parse(p[0]), int.parse(p[1]), int.parse(p[2]));
  const m = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ];
  const d = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return '${d[dt.weekday - 1]}, ${dt.day} ${m[dt.month - 1]} ${dt.year}';
}

String _todayIso() {
  final now = DateTime.now();
  return '${now.year}-${now.month.toString().padLeft(2, '0')}-${now.day.toString().padLeft(2, '0')}';
}

String _fmtTime(DateTime dt) {
  final local = dt.toLocal();
  final h = local.hour.toString().padLeft(2, '0');
  final min = local.minute.toString().padLeft(2, '0');
  return '$h:$min';
}

String _rupee(double v) {
  final abs = v.abs();
  if (abs >= 1e7) return '₹${(abs / 1e7).toStringAsFixed(2)}Cr';
  if (abs >= 1e5) return '₹${(abs / 1e5).toStringAsFixed(2)}L';
  if (abs >= 1e3) return '₹${(abs / 1e3).toStringAsFixed(1)}k';
  return '₹${abs.toStringAsFixed(2)}';
}

// ---------------------------------------------------------------------------
// Main Screen
// ---------------------------------------------------------------------------
class DayBookHistoryScreen extends ConsumerWidget {
  const DayBookHistoryScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final listAsync = ref.watch(dayBookListProvider);
    final selectedDate = ref.watch(selectedDayBookDateProvider);
    final today = _todayIso();

    return Scaffold(
      backgroundColor: AppColors.canvas,
      appBar: AppBar(
        backgroundColor: AppColors.canvas,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(LucideIcons.arrowLeft, size: 20),
          color: AppColors.inkPrimary,
          onPressed: () => Navigator.pop(context),
        ),
        title: Text(
          'Day Book History',
          style: GoogleFonts.hankenGrotesk(
            fontSize: 17,
            fontWeight: FontWeight.w700,
            color: AppColors.inkPrimary,
            letterSpacing: -0.3,
          ),
        ),
        centerTitle: false,
        surfaceTintColor: Colors.transparent,
      ),
      body: listAsync.when(
        loading: () => const Center(
          child: CircularProgressIndicator(
            color: AppColors.primary,
            strokeWidth: 2.5,
          ),
        ),
        error: (_, _) => Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(LucideIcons.alertCircle,
                  size: 40, color: AppColors.danger.withValues(alpha: 0.5)),
              const SizedBox(height: 12),
              Text(
                'Failed to load history',
                style: GoogleFonts.inter(
                  fontSize: 15,
                  color: AppColors.inkSecondary,
                ),
              ),
            ],
          ),
        ),
        data: (list) {
          if (list.isEmpty) {
            return Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(LucideIcons.bookOpen,
                      size: 52,
                      color: AppColors.outlineVariant),
                  const SizedBox(height: 14),
                  Text(
                    'No day book history yet',
                    style: GoogleFonts.hankenGrotesk(
                      fontSize: 15,
                      fontWeight: FontWeight.w500,
                      color: AppColors.inkTertiary,
                    ),
                  ),
                ],
              ),
            );
          }

          // Sort descending by date so most recent is at top
          final sorted = [...list]
            ..sort((a, b) => b.date.compareTo(a.date));

          // ── KPI computation ──────────────────────────────────────────────
          final totalDays = sorted.length;
          final closedCount = sorted.where((r) => r.isClosed).length;
          final allTimeSales =
              sorted.fold<double>(0, (s, r) => s + r.totalSales);
          final allTimeExpenses =
              sorted.fold<double>(0, (s, r) => s + r.totalExpenses);
          final netFlow = allTimeSales - allTimeExpenses;

          return CustomScrollView(
            slivers: [
              // ── KPI row ─────────────────────────────────────────────────
              SliverToBoxAdapter(
                child: _KpiSection(
                  totalDays: totalDays,
                  closedCount: closedCount,
                  allTimeSales: allTimeSales,
                  allTimeExpenses: allTimeExpenses,
                  netFlow: netFlow,
                ),
              ),

              // ── Section header ───────────────────────────────────────────
              SliverToBoxAdapter(
                child: Padding(
                  padding:
                      const EdgeInsets.fromLTRB(16, 20, 16, 8),
                  child: Text(
                    'All Records',
                    style: GoogleFonts.hankenGrotesk(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: AppColors.inkTertiary,
                      letterSpacing: 0.4,
                    ),
                  ),
                ),
              ),

              // ── History list ─────────────────────────────────────────────
              SliverList(
                delegate: SliverChildBuilderDelegate(
                  (context, index) {
                    final record = sorted[index];
                    final isLast = index == sorted.length - 1;
                    return Padding(
                      padding: EdgeInsets.fromLTRB(
                          16, 0, 16, isLast ? 24 : 0),
                      child: Column(
                        children: [
                          _DayBookHistoryCard(
                            record: record,
                            isToday: record.date == today,
                            isViewing: record.date == selectedDate,
                            onTap: () {
                              ref
                                  .read(selectedDayBookDateProvider.notifier)
                                  .state = record.date;
                              Navigator.pop(context);
                            },
                          ),
                          if (!isLast) const SizedBox(height: 10),
                        ],
                      ),
                    );
                  },
                  childCount: sorted.length,
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// KPI Section
// ---------------------------------------------------------------------------
class _KpiSection extends StatelessWidget {
  final int totalDays;
  final int closedCount;
  final double allTimeSales;
  final double allTimeExpenses;
  final double netFlow;

  const _KpiSection({
    required this.totalDays,
    required this.closedCount,
    required this.allTimeSales,
    required this.allTimeExpenses,
    required this.netFlow,
  });

  @override
  Widget build(BuildContext context) {
    final netPositive = netFlow > 0;

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
      child: Column(
        children: [
          Row(
            children: [
              Expanded(
                child: _KpiCard(
                  label: 'Total Days',
                  value: '$totalDays',
                  sub: '$closedCount closed',
                  valueColor: AppColors.inkPrimary,
                  icon: LucideIcons.calendarDays,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _KpiCard(
                  label: 'Net Flow',
                  value: (netFlow >= 0 ? '+' : '−') + _rupee(netFlow),
                  valueColor: netPositive ? AppColors.success : AppColors.danger,
                  icon: netPositive
                      ? LucideIcons.trendingUp
                      : LucideIcons.trendingDown,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: _KpiCard(
                  label: 'All-Time Sales',
                  value: _rupee(allTimeSales),
                  valueColor: const Color(0xFF2E7D32),
                  icon: LucideIcons.arrowUpRight,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _KpiCard(
                  label: 'All-Time Expenses',
                  value: _rupee(allTimeExpenses),
                  valueColor: AppColors.danger,
                  icon: LucideIcons.arrowDownLeft,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _KpiCard extends StatelessWidget {
  final String label;
  final String value;
  final String? sub;
  final Color valueColor;
  final IconData icon;

  const _KpiCard({
    required this.label,
    required this.value,
    this.sub,
    required this.valueColor,
    required this.icon,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(14),
        boxShadow: [AppColors.cardShadow],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, size: 13, color: AppColors.inkTertiary),
              const SizedBox(width: 5),
              Expanded(
                child: Text(
                  label,
                  style: GoogleFonts.inter(
                    fontSize: 11,
                    fontWeight: FontWeight.w500,
                    color: AppColors.inkTertiary,
                    letterSpacing: 0.2,
                  ),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            value,
            style: GoogleFonts.jetBrainsMono(
              fontSize: 16,
              fontWeight: FontWeight.w700,
              color: valueColor,
              letterSpacing: -0.5,
            ),
          ),
          if (sub != null) ...[
            const SizedBox(height: 2),
            Text(
              sub!,
              style: GoogleFonts.inter(
                fontSize: 10,
                color: AppColors.inkTertiary,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// History Card
// ---------------------------------------------------------------------------
class _DayBookHistoryCard extends StatelessWidget {
  final DayBookRecord record;
  final bool isToday;
  final bool isViewing;
  final VoidCallback onTap;

  const _DayBookHistoryCard({
    required this.record,
    required this.isToday,
    required this.isViewing,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final net = record.totalSales - record.totalExpenses;
    final netPositive = net > 0;
    final variance = record.variance;

    return GestureDetector(
      onTap: onTap,
      child: Container(
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(16),
          boxShadow: [AppColors.cardShadow],
          border: isViewing
              ? Border.all(
                  color: AppColors.primary.withValues(alpha: 0.35),
                  width: 1.5,
                )
              : null,
        ),
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // ── Row 1: Date + tags + lock ─────────────────────────────────
            Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                Expanded(
                  child: Text(
                    _fmt(record.date),
                    style: GoogleFonts.hankenGrotesk(
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      color: AppColors.inkPrimary,
                      letterSpacing: -0.2,
                    ),
                  ),
                ),
                if (isToday) ...[
                  const SizedBox(width: 6),
                  _Tag(
                    label: 'TODAY',
                    bgColor: AppColors.primary,
                    textColor: AppColors.onPrimary,
                  ),
                ],
                if (isViewing && !isToday) ...[
                  const SizedBox(width: 6),
                  _Tag(
                    label: 'VIEWING',
                    bgColor: AppColors.primaryContainer,
                    textColor: AppColors.onPrimaryContainer,
                  ),
                ],
                const SizedBox(width: 8),
                Icon(
                  record.isClosed ? LucideIcons.lock : LucideIcons.unlock,
                  size: 15,
                  color: record.isClosed
                      ? const Color(0xFF2E7D32)
                      : AppColors.warning,
                ),
              ],
            ),

            const SizedBox(height: 10),

            // ── Row 2: Opening / Sales / Expenses ─────────────────────────
            Row(
              children: [
                _AmountChip(
                  label: 'Opening',
                  value: _rupee(record.openingBalance),
                  color: AppColors.inkSecondary,
                ),
                const SizedBox(width: 8),
                _AmountChip(
                  label: 'Sales',
                  value: _rupee(record.totalSales),
                  color: const Color(0xFF2E7D32),
                ),
                const SizedBox(width: 8),
                _AmountChip(
                  label: 'Exp',
                  value: _rupee(record.totalExpenses),
                  color: AppColors.danger,
                ),
              ],
            ),

            const SizedBox(height: 8),

            // ── Row 3: Closing / Net pill / Variance pill ──────────────────
            Row(
              children: [
                _AmountChip(
                  label: 'Closing',
                  value: _rupee(record.closingBalance),
                  color: record.closingBalance < 0
                      ? AppColors.danger
                      : AppColors.inkSecondary,
                ),
                const SizedBox(width: 8),
                _NetPill(net: net, netPositive: netPositive),
                const SizedBox(width: 8),
                _VariancePill(variance: variance),
              ],
            ),

            const SizedBox(height: 9),

            // ── Row 4: Closed at ──────────────────────────────────────────
            Row(
              children: [
                Icon(
                  record.isClosed
                      ? LucideIcons.clock
                      : LucideIcons.clock3,
                  size: 12,
                  color: record.isClosed
                      ? AppColors.inkTertiary
                      : AppColors.warning,
                ),
                const SizedBox(width: 4),
                Text(
                  record.isClosed && record.closedAt != null
                      ? 'Closed at ${_fmtTime(record.closedAt!)}'
                      : 'Open',
                  style: GoogleFonts.inter(
                    fontSize: 11,
                    fontWeight: FontWeight.w500,
                    color: record.isClosed
                        ? AppColors.inkTertiary
                        : AppColors.warning,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
class _Tag extends StatelessWidget {
  final String label;
  final Color bgColor;
  final Color textColor;

  const _Tag({
    required this.label,
    required this.bgColor,
    required this.textColor,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
      decoration: BoxDecoration(
        color: bgColor,
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(
        label,
        style: GoogleFonts.inter(
          fontSize: 9,
          fontWeight: FontWeight.w700,
          color: textColor,
          letterSpacing: 0.5,
        ),
      ),
    );
  }
}

class _AmountChip extends StatelessWidget {
  final String label;
  final String value;
  final Color color;

  const _AmountChip({
    required this.label,
    required this.value,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: GoogleFonts.inter(
            fontSize: 9,
            fontWeight: FontWeight.w500,
            color: AppColors.inkTertiary,
            letterSpacing: 0.2,
          ),
        ),
        const SizedBox(height: 1),
        Text(
          value,
          style: GoogleFonts.jetBrainsMono(
            fontSize: 12,
            fontWeight: FontWeight.w600,
            color: color,
          ),
        ),
      ],
    );
  }
}

class _NetPill extends StatelessWidget {
  final double net;
  final bool netPositive;

  const _NetPill({required this.net, required this.netPositive});

  @override
  Widget build(BuildContext context) {
    final label = (netPositive ? '+' : '−') + _rupee(net);
    final bg = netPositive
        ? const Color(0xFF2E7D32).withValues(alpha: 0.10)
        : AppColors.danger.withValues(alpha: 0.10);
    final fg = netPositive ? const Color(0xFF2E7D32) : AppColors.danger;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        label,
        style: GoogleFonts.jetBrainsMono(
          fontSize: 11,
          fontWeight: FontWeight.w700,
          color: fg,
        ),
      ),
    );
  }
}

class _VariancePill extends StatelessWidget {
  final double? variance;

  const _VariancePill({required this.variance});

  @override
  Widget build(BuildContext context) {
    String label;
    Color bg;
    Color fg;

    if (variance == null) {
      label = '—';
      bg = AppColors.surfaceContainer;
      fg = AppColors.inkTertiary;
    } else if (variance!.abs() < 0.01) {
      label = '✓ Balanced';
      bg = const Color(0xFF2E7D32).withValues(alpha: 0.10);
      fg = const Color(0xFF2E7D32);
    } else if (variance! > 0) {
      label = 'Over +${_rupee(variance!)}';
      bg = const Color(0xFF1565C0).withValues(alpha: 0.10);
      fg = const Color(0xFF1565C0);
    } else {
      label = 'Short ${_rupee(variance!)}';
      bg = AppColors.danger.withValues(alpha: 0.10);
      fg = AppColors.danger;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        label,
        style: GoogleFonts.inter(
          fontSize: 10,
          fontWeight: FontWeight.w600,
          color: fg,
        ),
      ),
    );
  }
}

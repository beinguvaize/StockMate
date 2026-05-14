import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/core/supabase/client.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:lucide_icons/lucide_icons.dart';

class DayBookEntry {
  final String type;
  final String description;
  final double amount;
  final bool isCredit;

  const DayBookEntry({
    required this.type,
    required this.description,
    required this.amount,
    required this.isCredit,
  });
}

final daybookProvider =
    FutureProvider.family<List<DayBookEntry>, ({String tenantId, String date})>(
        (ref, params) async {
  final List<DayBookEntry> entries = [];

  final sales = await supabase
      .from('sales')
      .select('total_amount, client_name, payment_method')
      .eq('tenant_id', params.tenantId)
      .eq('date', params.date);

  for (final s in sales as List) {
    entries.add(DayBookEntry(
      type: 'sale',
      description:
          '${s['client_name'] ?? 'Walk-in'} · ${s['payment_method'] ?? '—'}',
      amount: (s['total_amount'] as num? ?? 0).toDouble(),
      isCredit: true,
    ));
  }

  final expenses = await supabase
      .from('expenses')
      .select('amount, category, note')
      .eq('tenant_id', params.tenantId)
      .eq('date', params.date);

  for (final e in expenses as List) {
    entries.add(DayBookEntry(
      type: 'expense',
      description:
          '${e['category'] ?? 'Misc'}${e['note'] != null ? ' · ${e['note']}' : ''}',
      amount: (e['amount'] as num? ?? 0).toDouble(),
      isCredit: false,
    ));
  }

  final purchases = await supabase
      .from('purchases')
      .select('total_amount, supplier_name, payment_method')
      .eq('tenant_id', params.tenantId)
      .eq('date', params.date);

  for (final p in purchases as List) {
    entries.add(DayBookEntry(
      type: 'purchase',
      description:
          '${p['supplier_name'] ?? 'Supplier'} · ${p['payment_method'] ?? '—'}',
      amount: (p['total_amount'] as num? ?? 0).toDouble(),
      isCredit: false,
    ));
  }

  return entries;
});

class DayBookScreen extends ConsumerStatefulWidget {
  const DayBookScreen({super.key});

  @override
  ConsumerState<DayBookScreen> createState() => _DayBookScreenState();
}

class _DayBookScreenState extends ConsumerState<DayBookScreen> {
  DateTime _selectedDate = DateTime.now();

  String get _dateString =>
      '${_selectedDate.year}-${_selectedDate.month.toString().padLeft(2, '0')}-${_selectedDate.day.toString().padLeft(2, '0')}';

  String get _displayDate {
    final months = [
      'Jan','Feb','Mar','Apr','May','Jun',
      'Jul','Aug','Sep','Oct','Nov','Dec'
    ];
    return '${_selectedDate.day} ${months[_selectedDate.month - 1]} ${_selectedDate.year}';
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _selectedDate,
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
    if (picked != null) setState(() => _selectedDate = picked);
  }

  @override
  Widget build(BuildContext context) {
    final tenantAsync = ref.watch(tenantContextProvider);

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
          Padding(
            padding: const EdgeInsets.only(right: 16),
            child: GestureDetector(
              onTap: _pickDate,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: BoxDecoration(
                  color: AppColors.primaryContainer.withValues(alpha: 0.3),
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: AppColors.primaryContainer),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(LucideIcons.calendar,
                        size: 12, color: AppColors.primary),
                    const SizedBox(width: 6),
                    Text(
                      _displayDate,
                      style: GoogleFonts.jetBrainsMono(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        color: AppColors.primary,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
      body: tenantAsync.when(
        data: (ctx) {
          if (ctx == null) {
            return const Center(child: Text('No tenant context.'));
          }
          final params = (tenantId: ctx.tenantId, date: _dateString);
          final daybookAsync = ref.watch(daybookProvider(params));

          return daybookAsync.when(
            data: (entries) {
              double cashIn = 0;
              double cashOut = 0;
              for (final e in entries) {
                if (e.isCredit) {
                  cashIn += e.amount;
                } else {
                  cashOut += e.amount;
                }
              }
              final net = cashIn - cashOut;

              return CustomScrollView(
                slivers: [
                  // Summary hero card
                  SliverToBoxAdapter(
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
                      child: Container(
                        padding: const EdgeInsets.all(20),
                        decoration: BoxDecoration(
                          color: AppColors.primaryContainer,
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: Row(
                          children: [
                            Expanded(
                              child: _SummaryCol(
                                label: 'CASH IN',
                                amount: cashIn,
                                color: AppColors.inkPrimary,
                                icon: LucideIcons.trendingUp,
                              ),
                            ),
                            Container(
                              width: 1,
                              height: 50,
                              color: AppColors.inkPrimary.withValues(alpha: 0.15),
                            ),
                            Expanded(
                              child: _SummaryCol(
                                label: 'CASH OUT',
                                amount: cashOut,
                                color: AppColors.danger,
                                icon: LucideIcons.trendingDown,
                              ),
                            ),
                            Container(
                              width: 1,
                              height: 50,
                              color: AppColors.inkPrimary.withValues(alpha: 0.15),
                            ),
                            Expanded(
                              child: _SummaryCol(
                                label: 'NET',
                                amount: net,
                                color: net >= 0
                                    ? AppColors.inkPrimary
                                    : AppColors.danger,
                                icon: net >= 0
                                    ? LucideIcons.checkCircle
                                    : LucideIcons.alertCircle,
                                prefix: net >= 0 ? '+' : '',
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),

                  // Section header
                  SliverToBoxAdapter(
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(16, 28, 16, 12),
                      child: Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.all(6),
                            decoration: BoxDecoration(
                              color:
                                  AppColors.primaryContainer.withValues(alpha: 0.3),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: const Icon(LucideIcons.bookOpen,
                                size: 14, color: AppColors.primary),
                          ),
                          const SizedBox(width: 10),
                          Text(
                            'TRANSACTIONS',
                            style: GoogleFonts.jetBrainsMono(
                              fontSize: 11,
                              fontWeight: FontWeight.w700,
                              letterSpacing: 1.5,
                              color: AppColors.primary,
                            ),
                          ),
                          const Spacer(),
                          Text(
                            '${entries.length} entries',
                            style: GoogleFonts.jetBrainsMono(
                              fontSize: 10,
                              color: AppColors.inkSecondary,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),

                  if (entries.isEmpty)
                    SliverFillRemaining(
                      child: Center(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Container(
                              padding: const EdgeInsets.all(20),
                              decoration: BoxDecoration(
                                color: AppColors.surface,
                                shape: BoxShape.circle,
                              ),
                              child: const Icon(LucideIcons.bookOpen,
                                  size: 36, color: AppColors.inkSecondary),
                            ),
                            const SizedBox(height: 16),
                            Text(
                              'No transactions',
                              style: GoogleFonts.hankenGrotesk(
                                fontSize: 16,
                                fontWeight: FontWeight.w700,
                                color: AppColors.inkPrimary,
                              ),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              'Nothing recorded for $_displayDate',
                              style: GoogleFonts.inter(
                                fontSize: 13,
                                color: AppColors.inkSecondary,
                              ),
                            ),
                          ],
                        ),
                      ),
                    )
                  else
                    SliverPadding(
                      padding: const EdgeInsets.fromLTRB(16, 0, 16, 100),
                      sliver: SliverList(
                        delegate: SliverChildBuilderDelegate(
                          (context, index) =>
                              Padding(
                                padding: const EdgeInsets.only(bottom: 8),
                                child: _EntryCard(entry: entries[index]),
                              ),
                          childCount: entries.length,
                        ),
                      ),
                    ),
                ],
              );
            },
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (e, _) => Center(
              child: Text('Error: $e',
                  style: GoogleFonts.inter(color: AppColors.danger)),
            ),
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Error: $e')),
      ),
    );
  }
}

class _SummaryCol extends StatelessWidget {
  final String label;
  final double amount;
  final Color color;
  final IconData icon;
  final String prefix;

  const _SummaryCol({
    required this.label,
    required this.amount,
    required this.color,
    required this.icon,
    this.prefix = '',
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Icon(icon, size: 16, color: color),
        const SizedBox(height: 6),
        Text(
          label,
          style: GoogleFonts.jetBrainsMono(
            fontSize: 9,
            fontWeight: FontWeight.w700,
            letterSpacing: 1,
            color: AppColors.inkPrimary.withValues(alpha: 0.6),
          ),
        ),
        const SizedBox(height: 4),
        Text(
          '$prefix₹${amount.abs().toStringAsFixed(0)}',
          style: GoogleFonts.hankenGrotesk(
            fontSize: 16,
            fontWeight: FontWeight.w900,
            color: color,
            letterSpacing: -0.5,
          ),
        ),
      ],
    );
  }
}

class _EntryCard extends StatelessWidget {
  final DayBookEntry entry;
  const _EntryCard({required this.entry});

  @override
  Widget build(BuildContext context) {
    final isCredit = entry.isCredit;
    final color = isCredit ? AppColors.success : AppColors.danger;
    final IconData icon;
    final String typeLabel;

    switch (entry.type) {
      case 'sale':
        icon = LucideIcons.shoppingCart;
        typeLabel = 'SALE';
        break;
      case 'expense':
        icon = LucideIcons.receipt;
        typeLabel = 'EXPENSE';
        break;
      case 'purchase':
        icon = LucideIcons.shoppingBag;
        typeLabel = 'PURCHASE';
        break;
      default:
        icon = LucideIcons.circle;
        typeLabel = entry.type.toUpperCase();
    }

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.black.withValues(alpha: 0.06)),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(icon, color: color, size: 18),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  entry.description,
                  style: GoogleFonts.inter(
                    fontWeight: FontWeight.w600,
                    fontSize: 13,
                    color: AppColors.inkPrimary,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 2),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  decoration: BoxDecoration(
                    color: color.withValues(alpha: 0.08),
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: Text(
                    typeLabel,
                    style: GoogleFonts.jetBrainsMono(
                      fontSize: 9,
                      fontWeight: FontWeight.w700,
                      color: color,
                      letterSpacing: 0.5,
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Text(
            '${isCredit ? '+' : '-'}₹${entry.amount.toStringAsFixed(2)}',
            style: GoogleFonts.hankenGrotesk(
              fontWeight: FontWeight.w800,
              color: color,
              fontSize: 15,
              letterSpacing: -0.3,
            ),
          ),
        ],
      ),
    );
  }
}

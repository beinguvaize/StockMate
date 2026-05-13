import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/core/supabase/client.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:mobile_app/core/widgets/glass_panel.dart';
import 'package:lucide_icons/lucide_icons.dart';

class DayBookEntry {
  final String type; // 'sale', 'expense', 'purchase'
  final String description;
  final double amount;
  final bool isCredit; // true = money in, false = money out

  const DayBookEntry({
    required this.type,
    required this.description,
    required this.amount,
    required this.isCredit,
  });
}

final daybookProvider = FutureProvider.family<List<DayBookEntry>, ({String tenantId, String date})>((ref, params) async {
  final List<DayBookEntry> entries = [];

  // Fetch sales
  final sales = await supabase
      .from('sales')
      .select('total_amount, client_name, payment_method')
      .eq('tenant_id', params.tenantId)
      .eq('date', params.date);

  for (final s in sales as List) {
    entries.add(DayBookEntry(
      type: 'sale',
      description: 'Sale — ${s['client_name'] ?? 'Walk-in'} (${s['payment_method'] ?? '—'})',
      amount: (s['total_amount'] as num? ?? 0).toDouble(),
      isCredit: true,
    ));
  }

  // Fetch expenses
  final expenses = await supabase
      .from('expenses')
      .select('amount, category, note')
      .eq('tenant_id', params.tenantId)
      .eq('date', params.date);

  for (final e in expenses as List) {
    entries.add(DayBookEntry(
      type: 'expense',
      description: 'Expense — ${e['category'] ?? 'Misc'}${e['note'] != null ? ': ${e['note']}' : ''}',
      amount: (e['amount'] as num? ?? 0).toDouble(),
      isCredit: false,
    ));
  }

  // Fetch purchases
  final purchases = await supabase
      .from('purchases')
      .select('total_amount, supplier_name, payment_method')
      .eq('tenant_id', params.tenantId)
      .eq('date', params.date);

  for (final p in purchases as List) {
    entries.add(DayBookEntry(
      type: 'purchase',
      description: 'Purchase — ${p['supplier_name'] ?? 'Supplier'} (${p['payment_method'] ?? '—'})',
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

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _selectedDate,
      firstDate: DateTime(2020),
      lastDate: DateTime.now(),
    );
    if (picked != null) setState(() => _selectedDate = picked);
  }

  @override
  Widget build(BuildContext context) {
    final tenantAsync = ref.watch(tenantContextProvider);

    return Scaffold(
      backgroundColor: AppColors.canvas,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        title: const Text('Day Book', style: TextStyle(color: AppColors.inkPrimary, fontWeight: FontWeight.bold)),
        iconTheme: const IconThemeData(color: AppColors.inkPrimary),
      ),
      body: tenantAsync.when(
        data: (ctx) {
          if (ctx == null) return const Center(child: Text('No tenant context.'));

          final params = (tenantId: ctx.tenantId, date: _dateString);
          final daybookAsync = ref.watch(daybookProvider(params));

          return Column(
            children: [
              // Date picker
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
                child: GestureDetector(
                  onTap: _pickDate,
                  child: GlassPanel(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                    borderRadius: 14,
                    child: Row(
                      children: [
                        const Icon(LucideIcons.calendar, color: AppColors.inkSecondary, size: 18),
                        const SizedBox(width: 10),
                        Text(
                          _dateString,
                          style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
                        ),
                        const Spacer(),
                        const Icon(LucideIcons.chevronDown, color: AppColors.inkSecondary, size: 16),
                      ],
                    ),
                  ),
                ),
              ),

              Expanded(
                child: daybookAsync.when(
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
                    final netFlow = cashIn - cashOut;

                    return ListView(
                      padding: const EdgeInsets.fromLTRB(20, 8, 20, 100),
                      children: [
                        // Net flow summary
                        GlassPanel(
                          padding: const EdgeInsets.all(20),
                          borderRadius: 20,
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              _summaryItem('Cash In', cashIn, Colors.green),
                              Container(width: 1, height: 40, color: AppColors.inkTertiary.withValues(alpha: 0.2)),
                              _summaryItem('Cash Out', cashOut, AppColors.danger),
                              Container(width: 1, height: 40, color: AppColors.inkTertiary.withValues(alpha: 0.2)),
                              _summaryItem(
                                'Net Flow',
                                netFlow,
                                netFlow >= 0 ? Colors.green : AppColors.danger,
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 20),

                        if (entries.isEmpty)
                          const Center(
                            child: Padding(
                              padding: EdgeInsets.all(40),
                              child: Text('No transactions for this date.', style: TextStyle(color: AppColors.inkSecondary)),
                            ),
                          )
                        else ...[
                          const Text('Transactions', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                          const SizedBox(height: 12),
                          ...entries.map((entry) => _buildEntryCard(entry)),
                        ],
                      ],
                    );
                  },
                  loading: () => const Center(child: CircularProgressIndicator()),
                  error: (e, _) => Center(child: Text('Error: $e')),
                ),
              ),
            ],
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Error: $e')),
      ),
    );
  }

  Widget _summaryItem(String label, double amount, Color color) {
    return Column(
      children: [
        Text(label, style: const TextStyle(fontSize: 11, color: AppColors.inkSecondary, fontWeight: FontWeight.w700)),
        const SizedBox(height: 4),
        Text(
          '₹${amount.toStringAsFixed(0)}',
          style: TextStyle(fontSize: 16, fontWeight: FontWeight.w900, color: color),
        ),
      ],
    );
  }

  Widget _buildEntryCard(DayBookEntry entry) {
    final color = entry.isCredit ? Colors.green : AppColors.danger;
    final icon = entry.type == 'sale'
        ? LucideIcons.shoppingCart
        : entry.type == 'expense'
            ? LucideIcons.receipt
            : LucideIcons.shoppingBag;

    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: GlassPanel(
        padding: const EdgeInsets.all(14),
        borderRadius: 16,
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
            const SizedBox(width: 14),
            Expanded(
              child: Text(
                entry.description,
                style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
            ),
            const SizedBox(width: 8),
            Text(
              '${entry.isCredit ? '+' : '-'}₹${entry.amount.toStringAsFixed(2)}',
              style: TextStyle(fontWeight: FontWeight.w900, color: color, fontSize: 15),
            ),
          ],
        ),
      ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile_app/core/supabase/client.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:mobile_app/features/finance/data/models/expense.dart';
import 'package:mobile_app/features/finance/presentation/add_expense_screen.dart';
import 'package:mobile_app/features/finance/presentation/providers/finance_provider.dart';

/// Expenses — list only. Defaults to TODAY's expenses (matches web app).
/// Amber/mono design (approved sample "B Pro List").
class FinanceScreen extends ConsumerStatefulWidget {
  const FinanceScreen({super.key});

  @override
  ConsumerState<FinanceScreen> createState() => _FinanceScreenState();
}

// Amber brand constants (local — keeps this screen on the approved sample
// palette without depending on the app-wide green tokens).
const _amber600 = Color(0xFFD97706);
const _amber500 = Color(0xFFF59E0B);
const _amber400 = Color(0xFFFBBF24);

enum _Period { today, yesterday, week, month, all }

class _FinanceScreenState extends ConsumerState<FinanceScreen> {
  _Period _period = _Period.today; // default: today
  String _category = 'ALL';
  String _search = '';
  final _searchCtrl = TextEditingController();

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  // ── Date helpers (anchored on IST so it matches stored YYYY-MM-DD) ──
  String _two(int n) => n.toString().padLeft(2, '0');
  String _ymd(DateTime d) => '${d.year}-${_two(d.month)}-${_two(d.day)}';

  DateTime get _istNow =>
      DateTime.now().toUtc().add(const Duration(hours: 5, minutes: 30));

  /// Inclusive [from,to] YYYY-MM-DD window for the active period. null = open.
  (String?, String?) get _window {
    final now = _istNow;
    final today = _ymd(now);
    switch (_period) {
      case _Period.today:
        return (today, today);
      case _Period.yesterday:
        final y = now.subtract(const Duration(days: 1));
        return (_ymd(y), _ymd(y));
      case _Period.week:
        final dow = (now.weekday + 6) % 7; // Mon=0
        final s = now.subtract(Duration(days: dow));
        return (_ymd(s), today);
      case _Period.month:
        return ('${now.year}-${_two(now.month)}-01', today);
      case _Period.all:
        return (null, null);
    }
  }

  String _expDate(Expense e) => (e.date ?? '').split('T').first;

  bool _inWindow(Expense e) {
    final d = _expDate(e);
    if (d.isEmpty) return false;
    final (from, to) = _window;
    if (from != null && d.compareTo(from) < 0) return false;
    if (to != null && d.compareTo(to) > 0) return false;
    return true;
  }

  // Category rail color — small stable palette keyed off the name.
  Color _categoryColor(String? category) {
    final cat = (category ?? '').toLowerCase();
    if (cat.contains('rent') || cat.contains('util')) return _amber400;
    if (cat.contains('food') || cat.contains('meal') || cat.contains('mess')) {
      return const Color(0xFFEF4444);
    }
    if (cat.contains('salary') || cat.contains('payroll')) {
      return const Color(0xFF10B981);
    }
    if (cat.contains('recharge') || cat.contains('phone')) {
      return const Color(0xFFD6D3D1);
    }
    return _amber500;
  }

  IconData _categoryIcon(String? category) {
    final cat = (category ?? '').toLowerCase();
    if (cat.contains('rent') || cat.contains('util')) return LucideIcons.home;
    if (cat.contains('inventory') || cat.contains('stock')) return LucideIcons.package;
    if (cat.contains('health') || cat.contains('medical')) return LucideIcons.heartPulse;
    if (cat.contains('food') || cat.contains('meal') || cat.contains('mess')) {
      return LucideIcons.utensils;
    }
    if (cat.contains('salary') || cat.contains('payroll')) return LucideIcons.users;
    return LucideIcons.receipt;
  }

  String _periodLabel(_Period p) => switch (p) {
        _Period.today => 'Today',
        _Period.yesterday => 'Yesterday',
        _Period.week => 'This week',
        _Period.month => 'This month',
        _Period.all => 'All',
      };

  @override
  Widget build(BuildContext context) {
    final expensesAsync = ref.watch(expensesProvider);

    return Scaffold(
      backgroundColor: AppColors.canvas,
      floatingActionButton: FloatingActionButton(
        heroTag: null,
        onPressed: () => Navigator.push(
          context,
          MaterialPageRoute(builder: (_) => const AddExpenseScreen()),
        ).then((_) => ref.invalidate(expensesProvider)),
        backgroundColor: _amber600,
        foregroundColor: Colors.white,
        elevation: 4,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
        child: const Icon(LucideIcons.plus, size: 26),
      ),
      body: SafeArea(
        child: expensesAsync.when(
          loading: () => const Center(
            child: CircularProgressIndicator(color: _amber600),
          ),
          error: (err, _) => Center(
            child: Text('Error: $err',
                style: GoogleFonts.manrope(color: AppColors.danger)),
          ),
          data: (all) {
            final rows = all.where(_inWindow).toList();
            // Category filter (after window).
            final cats = <String>{for (final e in rows) e.category ?? 'Other'};
            final q = _search.trim().toLowerCase();
            final shown = rows.where((e) {
              if (_category != 'ALL' && (e.category ?? 'Other') != _category) {
                return false;
              }
              if (q.isEmpty) return true;
              return (e.note ?? '').toLowerCase().contains(q) ||
                  (e.category ?? '').toLowerCase().contains(q);
            }).toList();
            final total = shown.fold(0.0, (s, e) => s + (e.amount ?? 0));
            final itc = shown.fold(0.0, (s, e) => s + e.claimableItc);

            // Group by date desc.
            final groups = <String, List<Expense>>{};
            for (final e in shown) {
              (groups[_expDate(e)] ??= []).add(e);
            }
            final dates = groups.keys.toList()
              ..sort((a, b) => b.compareTo(a));

            return CustomScrollView(
              slivers: [
                // ── Header ──────────────────────────────
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
                    child: _header(total, shown.length, itc),
                  ),
                ),
                // ── Period chips ────────────────────────
                SliverToBoxAdapter(child: _periodChips()),
                // ── Category chips ──────────────────────
                if (cats.isNotEmpty)
                  SliverToBoxAdapter(child: _categoryChips(cats, rows)),
                const SliverToBoxAdapter(child: SizedBox(height: 8)),
                // ── Grouped list / empty ────────────────
                if (shown.isEmpty)
                  SliverFillRemaining(
                    hasScrollBody: false,
                    child: _empty(),
                  )
                else
                  SliverPadding(
                    padding: const EdgeInsets.fromLTRB(20, 0, 20, 100),
                    sliver: SliverList(
                      delegate: SliverChildBuilderDelegate(
                        (context, i) {
                          final date = dates[i];
                          return _dateGroup(date, groups[date]!);
                        },
                        childCount: dates.length,
                      ),
                    ),
                  ),
              ],
            );
          },
        ),
      ),
    );
  }

  // ── Header: title + search + summary strip ──────────────
  Widget _header(double total, int entries, double itc) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.baseline,
          textBaseline: TextBaseline.alphabetic,
          children: [
            Text('Expenses',
                style: GoogleFonts.manrope(
                  fontSize: 26,
                  fontWeight: FontWeight.w800,
                  color: AppColors.inkPrimary,
                  letterSpacing: -0.5,
                )),
            Text('.',
                style: GoogleFonts.manrope(
                  fontSize: 26,
                  fontWeight: FontWeight.w800,
                  color: _amber500,
                )),
            const Spacer(),
            Text(_periodLabel(_period).toLowerCase(),
                style: GoogleFonts.jetBrainsMono(
                  fontSize: 11,
                  color: AppColors.inkTertiary,
                )),
          ],
        ),
        const SizedBox(height: 12),
        // Search
        TextField(
          controller: _searchCtrl,
          onChanged: (v) => setState(() => _search = v),
          style: GoogleFonts.manrope(
              fontSize: 13, fontWeight: FontWeight.w600),
          decoration: InputDecoration(
            isDense: true,
            hintText: 'Search note or category…',
            hintStyle: GoogleFonts.manrope(
                fontSize: 13, color: AppColors.inkTertiary),
            prefixIcon: const Icon(LucideIcons.search,
                size: 16, color: AppColors.inkTertiary),
            prefixIconConstraints:
                const BoxConstraints(minWidth: 38, minHeight: 0),
            suffixIcon: _search.isEmpty
                ? null
                : GestureDetector(
                    onTap: () {
                      _searchCtrl.clear();
                      setState(() => _search = '');
                    },
                    child: const Icon(LucideIcons.x,
                        size: 15, color: AppColors.inkTertiary),
                  ),
            contentPadding: const EdgeInsets.symmetric(vertical: 11),
            filled: true,
            fillColor: Colors.white,
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide:
                  BorderSide(color: Colors.black.withValues(alpha: 0.08)),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide:
                  BorderSide(color: Colors.black.withValues(alpha: 0.08)),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: const BorderSide(color: _amber500, width: 1.4),
            ),
          ),
        ),
        const SizedBox(height: 14),
        // Summary strip: Total · Entries · ITC
        Container(
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: Colors.black.withValues(alpha: 0.06)),
          ),
          child: Row(
            children: [
              _summaryCell('TOTAL', _money(total), accent: true),
              _divider(),
              _summaryCell('ENTRIES', '$entries'),
              _divider(),
              _summaryCell('ITC', _money(itc)),
            ],
          ),
        ),
      ],
    );
  }

  Widget _divider() =>
      Container(width: 1, height: 34, color: Colors.black.withValues(alpha: 0.06));

  Widget _summaryCell(String label, String value, {bool accent = false}) {
    return Expanded(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label,
                style: GoogleFonts.jetBrainsMono(
                  fontSize: 8,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 1.2,
                  color: AppColors.inkTertiary,
                )),
            const SizedBox(height: 3),
            Text(value,
                style: GoogleFonts.jetBrainsMono(
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                  color: accent ? _amber600 : AppColors.inkPrimary,
                )),
          ],
        ),
      ),
    );
  }

  String _money(double v) => '₹${v.toStringAsFixed(0)}';

  // ── Period chips ──────────────────────────────────────────
  Widget _periodChips() {
    final items = _Period.values;
    return SizedBox(
      height: 56,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.fromLTRB(20, 14, 20, 8),
        itemCount: items.length,
        separatorBuilder: (_, _) => const SizedBox(width: 8),
        itemBuilder: (_, i) {
          final p = items[i];
          final sel = p == _period;
          return GestureDetector(
            onTap: () => setState(() => _period = p),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: sel ? _amber600 : Colors.white,
                borderRadius: BorderRadius.circular(99),
                border: Border.all(
                    color: sel
                        ? _amber600
                        : Colors.black.withValues(alpha: 0.10)),
              ),
              child: Text(
                _periodLabel(p),
                style: GoogleFonts.manrope(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: sel ? Colors.white : AppColors.inkSecondary,
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  // ── Category chips ────────────────────────────────────────
  Widget _categoryChips(Set<String> cats, List<Expense> rows) {
    final list = ['ALL', ...cats];
    return SizedBox(
      height: 38,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 20),
        itemCount: list.length,
        separatorBuilder: (_, _) => const SizedBox(width: 6),
        itemBuilder: (_, i) {
          final c = list[i];
          final sel = c == _category;
          final sum = c == 'ALL'
              ? null
              : rows
                  .where((e) => (e.category ?? 'Other') == c)
                  .fold(0.0, (s, e) => s + (e.amount ?? 0));
          return GestureDetector(
            onTap: () => setState(() => _category = c),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: sel ? _amber600 : Colors.white,
                borderRadius: BorderRadius.circular(99),
                border: Border.all(
                    color: sel
                        ? _amber600
                        : Colors.black.withValues(alpha: 0.10)),
              ),
              child: Text(
                c == 'ALL'
                    ? 'All'
                    : '$c${sum != null ? '  ${_money(sum)}' : ''}',
                style: GoogleFonts.manrope(
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                  color: sel ? Colors.white : AppColors.inkSecondary,
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  // ── Date group ────────────────────────────────────────────
  Widget _dateGroup(String date, List<Expense> items) {
    final groupTotal = items.fold(0.0, (s, e) => s + (e.amount ?? 0));
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(2, 0, 2, 8),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(_fmtDate(date).toUpperCase(),
                    style: GoogleFonts.jetBrainsMono(
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                      color: AppColors.inkTertiary,
                    )),
                Text(_money(groupTotal),
                    style: GoogleFonts.jetBrainsMono(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      color: AppColors.inkSecondary,
                    )),
              ],
            ),
          ),
          Container(
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(18),
              boxShadow: [AppColors.cardShadow],
            ),
            child: Column(
              children: [
                for (var i = 0; i < items.length; i++) ...[
                  if (i > 0)
                    Divider(
                        height: 1,
                        thickness: 1,
                        color: Colors.black.withValues(alpha: 0.05)),
                  _expenseRow(items[i]),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  // ── Single row ────────────────────────────────────────────
  Widget _expenseRow(Expense e) {
    final color = _categoryColor(e.category);
    return InkWell(
      onTap: () => _showExpenseSheet(e),
      borderRadius: BorderRadius.circular(18),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        child: Row(
          children: [
            Container(
              width: 4,
              height: 34,
              decoration: BoxDecoration(
                color: color,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    (e.note != null && e.note!.isNotEmpty)
                        ? e.note!
                        : (e.category ?? 'Expense'),
                    style: GoogleFonts.manrope(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      color: AppColors.inkPrimary,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 2),
                  Text(
                    '${e.category ?? 'Other'} · Cash'.toUpperCase(),
                    style: GoogleFonts.jetBrainsMono(
                      fontSize: 9,
                      letterSpacing: 0.8,
                      color: AppColors.inkTertiary,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 10),
            Text.rich(TextSpan(children: [
              TextSpan(
                  text: '₹',
                  style: GoogleFonts.jetBrainsMono(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: _amber400,
                  )),
              TextSpan(
                  text: (e.amount ?? 0).toStringAsFixed(0),
                  style: GoogleFonts.jetBrainsMono(
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    color: AppColors.inkPrimary,
                  )),
            ])),
          ],
        ),
      ),
    );
  }

  Widget _empty() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(LucideIcons.receipt,
              size: 40, color: AppColors.inkTertiary.withValues(alpha: 0.5)),
          const SizedBox(height: 12),
          Text('No expenses ${_periodLabel(_period).toLowerCase()}',
              style: GoogleFonts.manrope(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: AppColors.inkSecondary,
              )),
          const SizedBox(height: 4),
          Text('Tap + to log one',
              style: GoogleFonts.manrope(
                  fontSize: 12, color: AppColors.inkTertiary)),
        ],
      ),
    );
  }

  // dd Mon — friendly date label from YYYY-MM-DD.
  String _fmtDate(String ymd) {
    final parts = ymd.split('-');
    if (parts.length != 3) return ymd;
    const months = [
      '', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ];
    final m = int.tryParse(parts[1]) ?? 0;
    return '${parts[2]} ${m >= 1 && m <= 12 ? months[m] : parts[1]}';
  }

  // ── Detail / edit / delete sheet ──────────────────────────
  void _showExpenseSheet(Expense expense) {
    final color = _categoryColor(expense.category);
    final icon = _categoryIcon(expense.category);

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => Container(
        decoration: const BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
        ),
        padding: EdgeInsets.fromLTRB(
            24, 12, 24, MediaQuery.of(context).viewInsets.bottom + 32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 40,
              height: 4,
              margin: const EdgeInsets.only(bottom: 20),
              decoration: BoxDecoration(
                color: AppColors.inkTertiary.withValues(alpha: 0.3),
                borderRadius: BorderRadius.circular(99),
              ),
            ),
            Container(
              width: 56,
              height: 56,
              decoration: BoxDecoration(
                color: color.withValues(alpha: 0.12),
                shape: BoxShape.circle,
              ),
              child: Icon(icon, color: color, size: 26),
            ),
            const SizedBox(height: 12),
            Text(
              expense.category ?? 'Uncategorized',
              style: GoogleFonts.manrope(
                fontSize: 20,
                fontWeight: FontWeight.w700,
                color: AppColors.inkPrimary,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              '₹${expense.amount?.toStringAsFixed(0) ?? "0"}',
              style: GoogleFonts.jetBrainsMono(
                fontSize: 32,
                fontWeight: FontWeight.w700,
                color: _amber600,
                letterSpacing: -0.5,
              ),
            ),
            const SizedBox(height: 20),
            const Divider(height: 1),
            const SizedBox(height: 16),
            if (expense.note != null && expense.note!.isNotEmpty)
              _detailRow(LucideIcons.fileText, 'Description', expense.note!),
            if (expense.date != null)
              _detailRow(LucideIcons.calendar, 'Date', _expDate(expense)),
            const SizedBox(height: 24),
            Row(
              children: [
                Expanded(
                  child: _actionButton(
                    icon: LucideIcons.pencil,
                    label: 'Edit',
                    color: _amber600,
                    onTap: () {
                      Navigator.pop(context);
                      Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (_) => AddExpenseScreen(expense: expense),
                        ),
                      ).then((_) => ref.invalidate(expensesProvider));
                    },
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: _actionButton(
                    icon: LucideIcons.trash2,
                    label: 'Delete',
                    color: AppColors.danger,
                    onTap: () => _confirmDelete(expense),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _detailRow(IconData icon, String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        children: [
          Icon(icon, size: 16, color: AppColors.inkTertiary),
          const SizedBox(width: 10),
          Text('$label: ',
              style: GoogleFonts.manrope(
                  fontSize: 13, color: AppColors.inkTertiary)),
          Expanded(
            child: Text(value,
                style: GoogleFonts.manrope(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: AppColors.inkPrimary,
                ),
                overflow: TextOverflow.ellipsis),
          ),
        ],
      ),
    );
  }

  Widget _actionButton({
    required IconData icon,
    required String label,
    required Color color,
    required VoidCallback onTap,
  }) {
    return Material(
      color: color.withValues(alpha: 0.08),
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 14),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, size: 18, color: color),
              const SizedBox(width: 8),
              Text(label,
                  style: GoogleFonts.manrope(
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                    color: color,
                  )),
            ],
          ),
        ),
      ),
    );
  }

  void _confirmDelete(Expense expense) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: Text('Delete Expense',
            style: GoogleFonts.manrope(
                fontWeight: FontWeight.w700, color: AppColors.inkPrimary)),
        content: Text(
          'Remove ₹${expense.amount?.toStringAsFixed(0) ?? "0"} '
          '(${expense.category ?? "Uncategorized"}) from expenses? '
          'This cannot be undone.',
          style: GoogleFonts.manrope(
              fontSize: 14, color: AppColors.inkSecondary),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: Text('Cancel',
                style: GoogleFonts.manrope(
                    color: AppColors.inkSecondary,
                    fontWeight: FontWeight.w600)),
          ),
          TextButton(
            onPressed: () async {
              Navigator.pop(ctx);
              Navigator.pop(context);
              try {
                await supabase.from('expenses').delete().eq('id', expense.id);
                ref.invalidate(expensesProvider);
                if (mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: const Text('Expense deleted'),
                      backgroundColor: AppColors.danger,
                      behavior: SnackBarBehavior.floating,
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12)),
                    ),
                  );
                }
              } catch (e) {
                if (mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text('Failed to delete: $e'),
                      backgroundColor: AppColors.danger,
                      behavior: SnackBarBehavior.floating,
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12)),
                    ),
                  );
                }
              }
            },
            child: Text('Delete',
                style: GoogleFonts.manrope(
                    color: AppColors.danger, fontWeight: FontWeight.w700)),
          ),
        ],
      ),
    );
  }
}

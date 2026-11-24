import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_app/core/design/bl_widgets.dart';
import 'package:mobile_app/core/supabase/client.dart';
import 'package:mobile_app/core/utils/money.dart';
import 'package:mobile_app/features/finance/data/models/expense.dart';
import 'package:mobile_app/features/finance/presentation/add_expense_screen.dart';
import 'package:mobile_app/features/finance/presentation/providers/finance_provider.dart';

const _grey = Color(0xFF7A8088);
const _mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const _dow = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const _barColors = [
  Color(0xFF3B82F6),
  Bl.brand,
  Color(0xFF1E9E5A),
  Color(0xFFB7BCC2),
];

/// Icon and tint for an expense category, keyed off words in its name so the
/// shop's own categories get a sensible picture too.
({String icon, Color tile, Color ink}) expenseCategoryLook(String? category) {
  final c = (category ?? '').toLowerCase();
  bool has(List<String> words) => words.any(c.contains);
  if (has(['util', 'electric', 'power', 'water', 'recharge', 'phone', 'internet'])) {
    return (
      icon: '<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>',
      tile: const Color(0xFFE4EEFF),
      ink: const Color(0xFF1D4E9E),
    );
  }
  if (has(['petrol', 'fuel', 'diesel', 'transport', 'travel'])) {
    return (
      icon:
          '<path d="M5 20V5h8v15M3 20h12M13 10h3l2 2v5a1.5 1.5 0 01-3 0v-3"/>',
      tile: const Color(0xFFFFF1DC),
      ink: const Color(0xFFB86A0A),
    );
  }
  if (has(['food', 'tea', 'meal', 'mess', 'snack'])) {
    return (
      icon:
          '<path d="M5 8h11v6a5 5 0 01-5 5H10a5 5 0 01-5-5zM16 10h2a2 2 0 010 5h-2"/>',
      tile: const Color(0xFFE3F5EA),
      ink: const Color(0xFF17663A),
    );
  }
  if (has(['salary', 'payroll', 'wage', 'staff'])) {
    return (
      icon: BlIcons.users,
      tile: const Color(0xFFEFE9FF),
      ink: const Color(0xFF5133A8),
    );
  }
  if (has(['rent'])) {
    return (
      icon: BlIcons.home,
      tile: const Color(0xFFFDECEC),
      ink: Bl.redDeep,
    );
  }
  if (has(['deliver'])) {
    return (
      icon: BlIcons.truck,
      tile: const Color(0xFFFFF1DC),
      ink: const Color(0xFFB86A0A),
    );
  }
  if (has(['purchase', 'stock', 'inventory'])) {
    return (
      icon: BlIcons.box,
      tile: const Color(0xFFE4EEFF),
      ink: const Color(0xFF1D4E9E),
    );
  }
  return (icon: BlIcons.receipt, tile: Bl.well, ink: Bl.ink3);
}

String expenseMethodLabel(String? m) => switch ((m ?? '').toUpperCase()) {
      'CASH' => 'Cash',
      'UPI' => 'UPI',
      'BANK' => 'Bank',
      'CARD' => 'Card',
      _ => '',
    };

class FinanceScreen extends ConsumerStatefulWidget {
  const FinanceScreen({super.key});

  @override
  ConsumerState<FinanceScreen> createState() => _FinanceScreenState();
}

enum _Period { today, yesterday, week, month, all }

/// "Expenses" (canvas): what was spent in a period, split by category, with
/// each entry underneath.
class _FinanceScreenState extends ConsumerState<FinanceScreen> {
  _Period _period = _Period.today; // default: today
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

  String _periodLabel(_Period p) => switch (p) {
        _Period.today => 'Today',
        _Period.yesterday => 'Yesterday',
        _Period.week => 'This week',
        _Period.month => 'This month',
        _Period.all => 'All',
      };

  String get _spentLabel => switch (_period) {
        _Period.today => 'Spent today',
        _Period.yesterday => 'Spent yesterday',
        _Period.week => 'Spent this week',
        _Period.month => 'Spent this month',
        _Period.all => 'Spent, last 100 entries',
      };

  /// "2026-11-22" → "Sun, 22 Nov", with the year when it is not this one.
  String _dayLabel(String ymd, {bool weekday = true}) {
    final d = DateTime.tryParse(ymd);
    if (d == null) return ymd;
    final year = d.year == _istNow.year && weekday ? '' : ' ${d.year}';
    return '${weekday ? '${_dow[d.weekday - 1]}, ' : ''}${d.day} ${_mon[d.month - 1]}$year';
  }

  void _openNew() => Navigator.push(
        context,
        MaterialPageRoute(builder: (_) => const AddExpenseScreen()),
      ).then((_) => ref.invalidate(expensesProvider));

  Widget _stat(String value, String label) => Expanded(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(value,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: Bl.tight(15, w: FontWeight.w700)),
            const SizedBox(height: 1),
            Text(label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: Bl.inter(11.5, w: FontWeight.w500, c: _grey)),
          ],
        ),
      );

  Widget _expenseRow(Expense e) {
    final look = expenseCategoryLook(e.category);
    final note = (e.note ?? '').trim();
    final category = e.category ?? 'Uncategorized';
    final method = expenseMethodLabel(e.paymentMethod);
    return Semantics(
      button: true,
      label:
          '${note.isEmpty ? category : note}, ${Money.inr(e.amount ?? 0)}. Open',
      excludeSemantics: true,
      child: BlTap(
        onTap: () => _showExpenseSheet(e),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 10),
          decoration: const BoxDecoration(
              border: Border(bottom: BorderSide(color: Bl.sep))),
          child: Row(
            children: [
              Container(
                width: 40,
                height: 40,
                alignment: Alignment.center,
                decoration:
                    BoxDecoration(color: look.tile, shape: BoxShape.circle),
                child: BlIcon(look.icon, size: 17, color: look.ink),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(note.isEmpty ? category : note,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Bl.tight(14.5, w: FontWeight.w600)),
                    const SizedBox(height: 1),
                    Text(
                        [
                          if (note.isNotEmpty) category,
                          if (method.isNotEmpty) method,
                          if (e.claimableItc > 0)
                            'ITC ${Money.inr(e.claimableItc)}',
                          if (e.excludeFromPl) 'not a business expense',
                        ].join(' · '),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Bl.inter(12, c: _grey)),
                  ],
                ),
              ),
              const SizedBox(width: 10),
              Text(Money.inr(e.amount ?? 0),
                  style: Bl.tight(14.5, w: FontWeight.w600)),
            ],
          ),
        ),
      ),
    );
  }

  void _showExpenseSheet(Expense expense) {
    final look = expenseCategoryLook(expense.category);
    final note = (expense.note ?? '').trim();
    final category = expense.category ?? 'Uncategorized';
    final method = expenseMethodLabel(expense.paymentMethod);

    Widget row(String label, String value) => Container(
          padding: const EdgeInsets.symmetric(horizontal: 2, vertical: 10),
          decoration: const BoxDecoration(
              border: Border(bottom: BorderSide(color: Bl.sep))),
          child: Row(
            children: [
              Expanded(
                  child: Text(label,
                      style: Bl.inter(13.5, w: FontWeight.w500, c: _grey))),
              Text(value, style: Bl.inter(13.5, w: FontWeight.w600, c: Bl.ink)),
            ],
          ),
        );

    showBlSheet<void>(
      context: context,
      builder: (sheet) => Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Container(
                width: 44,
                height: 44,
                alignment: Alignment.center,
                decoration:
                    BoxDecoration(color: look.tile, shape: BoxShape.circle),
                child: BlIcon(look.icon, size: 17, color: look.ink),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(note.isEmpty ? category : note,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: Bl.tight(18, w: FontWeight.w700, ls: -0.02)),
                    const SizedBox(height: 1),
                    Text(category, style: Bl.inter(12.5, c: _grey)),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              BlRoundButton(BlIcons.close,
                  label: 'Close', onTap: () => Navigator.pop(sheet)),
            ],
          ),
          const SizedBox(height: 16),
          Text(Money.inr(expense.amount ?? 0),
              style: Bl.tight(36, w: FontWeight.w700, ls: -0.04, h: 1.05)),
          const SizedBox(height: 10),
          row('Date', _dayLabel(_expDate(expense), weekday: false)),
          if (method.isNotEmpty) row('Paid via', method),
          if (expense.claimableItc > 0)
            row('GST claimed (ITC)', Money.inr(expense.claimableItc)),
          if (expense.excludeFromPl) row('Counts in profit', 'No'),
          const SizedBox(height: 14),
          Row(
            children: [
              Semantics(
                button: true,
                label: 'Delete this expense',
                excludeSemantics: true,
                child: BlTap(
                  onTap: () => _confirmDelete(expense, sheet),
                  child: Container(
                    width: 48,
                    height: 46,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                        color: const Color(0xFFFEF2F2),
                        borderRadius: BorderRadius.circular(999)),
                    child: const BlIcon(
                        '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
                        size: 18,
                        color: Bl.redDeep),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: BlButton('Edit', onTap: () {
                  Navigator.pop(sheet);
                  Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (_) => AddExpenseScreen(expense: expense),
                    ),
                  ).then((_) => ref.invalidate(expensesProvider));
                }),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Future<void> _confirmDelete(Expense expense, BuildContext sheet) async {
    final ok = await showBlDialog<bool>(
      context: context,
      title: 'Delete this expense?',
      message:
          'Remove ${Money.inr(expense.amount ?? 0)} (${expense.category ?? 'Uncategorized'}) from expenses? This cannot be undone.',
      actions: (ctx) => [
        Row(
          children: [
            Expanded(
              child: BlButton('Cancel',
                  kind: BlButtonKind.soft,
                  onTap: () => Navigator.pop(ctx, false)),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: BlButton('Delete',
                  kind: BlButtonKind.danger,
                  onTap: () => Navigator.pop(ctx, true)),
            ),
          ],
        ),
      ],
    );
    if (ok != true || !mounted) return;
    if (sheet.mounted) Navigator.pop(sheet);
    final messenger = ScaffoldMessenger.of(context);
    try {
      await supabase.from('expenses').update({'deleted_at': DateTime.now().toUtc().toIso8601String()}).eq('id', expense.id); // soft delete
      ref.invalidate(expensesProvider);
      messenger.showSnackBar(const SnackBar(
        content: Text('Expense deleted'),
        behavior: SnackBarBehavior.floating,
      ));
    } catch (e) {
      debugPrint('[expenses] delete failed: $e');
      ref.invalidate(expensesProvider);
      messenger.showSnackBar(SnackBar(
        content: Text(
            'May not have been deleted. Check the list before trying again. ($e)'),
        behavior: SnackBarBehavior.floating,
        duration: const Duration(seconds: 8),
      ));
    }
  }

  @override
  Widget build(BuildContext context) {
    final expensesAsync = ref.watch(expensesProvider);

    return Scaffold(
      backgroundColor: Bl.white,
      body: SafeArea(
        child: Column(
          children: [
            const BlBackHeader(title: 'Expenses'),
            Expanded(
              child: expensesAsync.when(
                skipLoadingOnRefresh: true,
                loading: () => const Center(
                    child: CircularProgressIndicator(
                        color: Bl.amber, strokeWidth: 2)),
                error: (e, _) => Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Text(
                        'Could not load expenses. Check your internet and try again. ($e)',
                        textAlign: TextAlign.center,
                        style: Bl.inter(13.5, c: Bl.redDeep, h: 1.5)),
                  ),
                ),
                data: (all) {
                  final inPeriod = all.where(_inWindow).toList();
                  final q = _search.trim().toLowerCase();
                  final rows = q.isEmpty
                      ? inPeriod
                      : inPeriod
                          .where((e) =>
                              (e.note ?? '').toLowerCase().contains(q) ||
                              (e.category ?? '').toLowerCase().contains(q))
                          .toList();
                  final total = inPeriod.fold<double>(
                      0, (s, e) => s + (e.amount ?? 0));
                  final itc =
                      inPeriod.fold<double>(0, (s, e) => s + e.claimableItc);

                  // Biggest three categories, the rest as "Other".
                  final byCat = <String, double>{};
                  for (final e in inPeriod) {
                    final k = e.category ?? 'Uncategorized';
                    byCat[k] = (byCat[k] ?? 0) + (e.amount ?? 0);
                  }
                  final ranked = byCat.entries.where((c) => c.value > 0).toList()
                    ..sort((a, b) => b.value.compareTo(a.value));
                  final split = <(String, double)>[
                    for (final c in ranked.take(3)) (c.key, c.value),
                    if (ranked.length > 3)
                      (
                        'Other',
                        ranked.skip(3).fold<double>(0, (s, c) => s + c.value),
                      ),
                  ];

                  // Newest day first.
                  final byDay = <String, List<Expense>>{};
                  for (final e in rows) {
                    (byDay[_expDate(e)] ??= []).add(e);
                  }
                  final days = byDay.keys.toList()
                    ..sort((a, b) => b.compareTo(a));

                  return ListView(
                    padding: const EdgeInsets.only(bottom: 20),
                    children: [
                      SingleChildScrollView(
                        scrollDirection: Axis.horizontal,
                        padding: const EdgeInsets.fromLTRB(16, 6, 16, 0),
                        child: Row(
                          children: [
                            for (final p in _Period.values)
                              Padding(
                                padding: const EdgeInsets.only(right: 6),
                                child: Semantics(
                                  button: true,
                                  selected: _period == p,
                                  label: _periodLabel(p),
                                  excludeSemantics: true,
                                  child: BlTap(
                                    onTap: () => setState(() => _period = p),
                                    child: Container(
                                      height: 30,
                                      padding: const EdgeInsets.symmetric(
                                          horizontal: 12),
                                      alignment: Alignment.center,
                                      decoration: BoxDecoration(
                                          color: _period == p ? Bl.ink : null,
                                          borderRadius:
                                              BorderRadius.circular(999),
                                          border: Border.all(
                                              color: _period == p
                                                  ? Bl.ink
                                                  : const Color(0xFFDADADA))),
                                      child: Text(_periodLabel(p),
                                          style: Bl.tight(12.5,
                                              w: FontWeight.w600,
                                              ls: 0,
                                              c: _period == p
                                                  ? Bl.white
                                                  : const Color(0xFF303030))),
                                    ),
                                  ),
                                ),
                              ),
                          ],
                        ),
                      ),
                      Padding(
                        padding: const EdgeInsets.fromLTRB(18, 8, 18, 0),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(_spentLabel,
                                style: Bl.inter(13,
                                    w: FontWeight.w500, c: Bl.body)),
                            const SizedBox(height: 6),
                            Text(Money.inr(total),
                                style: Bl.tight(36,
                                    w: FontWeight.w700, ls: -0.04, h: 1.05)),
                            const SizedBox(height: 14),
                            Row(
                              children: [
                                _stat('${inPeriod.length}',
                                    inPeriod.length == 1 ? 'Entry' : 'Entries'),
                                const SizedBox(width: 10),
                                _stat(Money.inr(itc), 'GST to claim (ITC)'),
                              ],
                            ),
                            if (split.isNotEmpty) ...[
                              const SizedBox(height: 14),
                              SizedBox(
                                height: 6,
                                child: Row(
                                  children: [
                                    for (var i = 0; i < split.length; i++)
                                      Expanded(
                                        flex: (split[i].$2 / total * 1000)
                                            .round()
                                            .clamp(15, 1000),
                                        child: Container(
                                          margin: EdgeInsets.only(
                                              right: i == split.length - 1
                                                  ? 0
                                                  : 3),
                                          decoration: BoxDecoration(
                                              color: _barColors[i],
                                              borderRadius:
                                                  BorderRadius.circular(3)),
                                        ),
                                      ),
                                  ],
                                ),
                              ),
                              const SizedBox(height: 8),
                              Wrap(
                                spacing: 12,
                                runSpacing: 4,
                                children: [
                                  for (var i = 0; i < split.length; i++)
                                    Row(
                                      mainAxisSize: MainAxisSize.min,
                                      children: [
                                        Container(
                                            width: 7,
                                            height: 7,
                                            decoration: BoxDecoration(
                                                color: _barColors[i],
                                                shape: BoxShape.circle)),
                                        const SizedBox(width: 5),
                                        Text(
                                            '${split[i].$1} ${Money.inr(split[i].$2)}',
                                            style: Bl.inter(12,
                                                w: FontWeight.w500,
                                                c: const Color(0xFF5E646C))),
                                      ],
                                    ),
                                ],
                              ),
                            ],
                          ],
                        ),
                      ),
                      Container(
                        height: 44,
                        margin: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                        padding: const EdgeInsets.symmetric(horizontal: 14),
                        decoration: BoxDecoration(
                            color: Bl.well,
                            borderRadius: BorderRadius.circular(999)),
                        child: Row(
                          children: [
                            const BlIcon(BlIcons.search,
                                size: 20, color: Bl.mute),
                            const SizedBox(width: 10),
                            Expanded(
                              child: TextField(
                                controller: _searchCtrl,
                                onChanged: (v) => setState(() => _search = v),
                                cursorColor: Bl.brand,
                                style: Bl.inter(14,
                                    w: FontWeight.w500, c: Bl.ink),
                                decoration: InputDecoration(
                                  isCollapsed: true,
                                  filled: false,
                                  border: InputBorder.none,
                                  enabledBorder: InputBorder.none,
                                  focusedBorder: InputBorder.none,
                                  hintText: 'Search note or category',
                                  hintStyle: Bl.inter(14,
                                      w: FontWeight.w500, c: Bl.mute),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                      if (rows.isEmpty)
                        BlEmpty(
                          icon: BlIcons.receipt,
                          title: q.isNotEmpty
                              ? 'No results for "$_search"'
                              : _period == _Period.all
                                  ? 'No expenses yet'
                                  : 'Nothing spent ${_periodLabel(_period).toLowerCase()}',
                          message: q.isEmpty
                              ? 'Tap New expense to log one.'
                              : null,
                        ),
                      for (final d in days) ...[
                        BlGroupHeader(_dayLabel(d),
                            trailing: Money.inr(byDay[d]!.fold<double>(
                                0, (s, e) => s + (e.amount ?? 0)))),
                        for (final e in byDay[d]!) _expenseRow(e),
                      ],
                    ],
                  );
                },
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 10, 16, 12),
              child: BlButton('New expense',
                  leading: const BlIcon(BlIcons.plus,
                      size: 18, color: Bl.white, stroke: 2.2),
                  onTap: _openNew),
            ),
          ],
        ),
      ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_app/core/database/offline_sales_ui.dart' show OfflineSalesBanner;
import 'package:mobile_app/core/design/bl_widgets.dart';
import 'package:mobile_app/core/utils/money.dart';
import 'package:mobile_app/features/daybook/data/daybook_models.dart';
import 'package:mobile_app/features/daybook/presentation/daybook_history_screen.dart';
import 'package:mobile_app/features/daybook/providers/daybook_providers.dart';

const _greenDeep = Color(0xFF17663A);
const _amberText = Color(0xFFB86A0A);
const _grey = Color(0xFF7A8088);
const _rule = Color(0xFFECEBE9);
const _mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const _dow = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const _clockIcon = '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>';
const _calendarIcon =
    '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>';
const _reuseIcon =
    '<path d="M4 12a8 8 0 018-8 8 8 0 017 4M20 4v4h-4M20 12a8 8 0 01-15 4M4 20v-4"/>';
const _inIcon = '<path d="M12 5v14M6 13l6 6 6-6"/>';
const _outIcon = '<path d="M12 19V5M6 11l6-6 6 6"/>';

String _iso(DateTime d) =>
    '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

DateTime _parse(String iso) {
  final p = iso.split('-');
  return DateTime(int.parse(p[0]), int.parse(p[1]), int.parse(p[2]));
}

/// "Sun, 22 Nov 2026", or without the year for a dialog title.
String dayBookDateLabel(String iso, {bool year = true}) {
  final d = _parse(iso);
  return '${_dow[d.weekday - 1]}, ${d.day} ${_mon[d.month - 1]}${year ? ' ${d.year}' : ''}';
}

String _clock(DateTime dt) {
  final l = dt.toLocal();
  final h = l.hour % 12 == 0 ? 12 : l.hour % 12;
  return '$h:${l.minute.toString().padLeft(2, '0')} ${l.hour >= 12 ? 'pm' : 'am'}';
}

/// How the counted cash compares with the book: (words, colour, balanced).
(String, Color, bool) _countVerdict(double counted, double book) {
  final diff = counted - book;
  if (diff.abs() < 0.01) return ('Balanced · no difference', _greenDeep, true);
  return diff > 0
      ? ('Cash over · + ${Money.inr(diff)}', Bl.blue, false)
      : ('Cash short · ${Money.inr(-diff)}', Bl.redDeep, false);
}

/// "Day Book" (canvas): the cash drawer for one day. Opening, what came in,
/// what went out, the count at night, and the lock.
class DayBookScreen extends ConsumerStatefulWidget {
  const DayBookScreen({super.key});

  @override
  ConsumerState<DayBookScreen> createState() => _DayBookScreenState();
}

class _DayBookScreenState extends ConsumerState<DayBookScreen> {
  final _openingController = TextEditingController();
  final _physicalCashController = TextEditingController();
  bool _busy = false;
  bool _editingOpening = false;

  /// The date the count field was last filled for, so a saved count shows
  /// when a day opens but typing is never overwritten by a refresh.
  String? _countFor;

  @override
  void initState() {
    super.initState();
    _physicalCashController.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _openingController.dispose();
    _physicalCashController.dispose();
    super.dispose();
  }

  void _setDate(String iso) {
    _editingOpening = false;
    _openingController.clear();
    ref.read(selectedDayBookDateProvider.notifier).state = iso;
  }

  Future<void> _pickDate(String current) async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _parse(current),
      firstDate: DateTime(2020),
      lastDate: DateTime.now(),
      builder: (ctx, child) => Theme(
        data: Theme.of(ctx).copyWith(
          colorScheme: const ColorScheme.light(
              primary: Bl.ink, onPrimary: Bl.white, onSurface: Bl.ink),
        ),
        child: child!,
      ),
    );
    if (picked != null && mounted) _setDate(_iso(picked));
  }

  /// Runs one Day Book write. A failure may still have reached the server, so
  /// it never claims the write did not happen.
  Future<bool> _write(Future<void> Function() action) async {
    if (_busy) return false;
    setState(() => _busy = true);
    try {
      await action();
      return true;
    } catch (e) {
      debugPrint('[daybook] write failed: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(
              'May not have saved. Check the Day Book before trying again. ($e)'),
          behavior: SnackBarBehavior.floating,
          duration: const Duration(seconds: 8),
        ));
      }
      return false;
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _saveOpening(String date, double amount) async {
    final ok = await _write(() => ref
        .read(daybookMutationsProvider.notifier)
        .saveOpening(date: date, amount: amount));
    if (ok && mounted) {
      _openingController.clear();
      setState(() => _editingOpening = false);
    }
  }

  double? get _counted =>
      double.tryParse(_physicalCashController.text.trim());

  Future<void> _closeDay(DayBookLedger ledger, String date) async {
    // What was typed is what gets recorded, saved or not: the dialog shows
    // the same verdict, so the owner sees it before locking.
    final counted = _counted ?? ledger.savedPhysicalCash;
    final verdict =
        counted == null ? null : _countVerdict(counted, ledger.closingBal);
    final confirmed = await showBlCustomDialog<bool>(
      context: context,
      builder: (ctx) => Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Center(
            child: Container(
              width: 48,
              height: 48,
              alignment: Alignment.center,
              decoration: const BoxDecoration(
                  color: Color(0xFFFFF1DC), shape: BoxShape.circle),
              child: const BlIcon(BlIcons.lock, size: 22, color: _amberText),
            ),
          ),
          const SizedBox(height: 10),
          Text('Close ${dayBookDateLabel(date, year: false)}?',
              textAlign: TextAlign.center,
              style: Bl.tight(19, w: FontWeight.w700, ls: -0.02)),
          const SizedBox(height: 6),
          Text(
              'This locks the day. Entries for this date cannot be changed after.',
              textAlign: TextAlign.center,
              style: Bl.inter(13, c: _grey, h: 1.45)),
          Container(
            margin: const EdgeInsets.only(top: 12),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            decoration: BoxDecoration(
                color: Bl.tile, borderRadius: BorderRadius.circular(12)),
            child: Column(
              children: [
                _kv('Closing balance', Money.inr(ledger.closingBal)),
                _kv(
                    'Cash count',
                    verdict == null
                        ? 'Not counted'
                        : verdict.$3
                            ? 'Balanced'
                            : verdict.$1.replaceFirst('Cash ', '').replaceFirst(' · ', ' '),
                    color: verdict == null ? Bl.body : verdict.$2),
              ],
            ),
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                child: BlButton('Cancel',
                    kind: BlButtonKind.soft,
                    onTap: () => Navigator.pop(ctx, false)),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: BlButton('Lock day',
                    onTap: () => Navigator.pop(ctx, true)),
              ),
            ],
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    await _write(() => ref.read(daybookMutationsProvider.notifier).closeDay(
          date: date,
          ledger: ledger,
          physicalCash: counted,
        ));
  }

  static Widget _kv(String label, String value,
          {Color color = Bl.ink, bool muted = false}) =>
      Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Row(
          children: [
            Expanded(
              child: Text(label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Bl.inter(muted ? 13 : 13.5,
                      w: FontWeight.w500,
                      c: muted ? const Color(0xFF9AA0A6) : Bl.body)),
            ),
            const SizedBox(width: 10),
            Text(value,
                style: muted
                    ? Bl.inter(13,
                        w: FontWeight.w500, c: const Color(0xFF9AA0A6))
                    : Bl.tight(14, w: FontWeight.w600, c: color)),
          ],
        ),
      );

  Widget _round(String icon, String label, VoidCallback? onTap) => Semantics(
        button: true,
        enabled: onTap != null,
        label: label,
        excludeSemantics: true,
        child: BlTap(
          onTap: onTap,
          child: Opacity(
            opacity: onTap == null ? 0.4 : 1,
            child: Container(
              width: 36,
              height: 36,
              alignment: Alignment.center,
              decoration:
                  const BoxDecoration(color: Bl.well, shape: BoxShape.circle),
              child: BlIcon(icon, size: 18),
            ),
          ),
        ),
      );

  // ── Start the day ─────────────────────────────────────────────────────────
  List<Widget> _openingForm(DayBookLedger ledger, String date) => [
        Padding(
          padding: const EdgeInsets.fromLTRB(18, 8, 18, 0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(ledger.hasOpening ? 'Change it' : 'Start the day',
                  style: Bl.inter(13, w: FontWeight.w500, c: Bl.body)),
              const SizedBox(height: 6),
              Text('Opening cash',
                  style:
                      Bl.tight(36, w: FontWeight.w700, ls: -0.04, h: 1.05)),
              const SizedBox(height: 6),
              Text('How much cash was in the drawer at the start of the day?',
                  style: Bl.inter(13, c: _grey)),
            ],
          ),
        ),
        if (ledger.prevClosing != null) ...[
          Padding(
            padding: const EdgeInsets.fromLTRB(18, 16, 18, 0),
            child: Semantics(
              button: true,
              label:
                  "Use the last closing balance, ${Money.inr(ledger.prevClosing!)}",
              excludeSemantics: true,
              child: BlTap(
                onTap: _busy
                    ? null
                    : () => _saveOpening(date, ledger.prevClosing!),
                child: CustomPaint(
                  foregroundPainter: _DashedBorder(),
                  child: Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                        color: const Color(0xFFFFF8EC),
                        borderRadius: BorderRadius.circular(16)),
                    child: Row(
                      children: [
                        Container(
                          width: 42,
                          height: 42,
                          alignment: Alignment.center,
                          decoration: BoxDecoration(
                              color: Bl.brand,
                              borderRadius: BorderRadius.circular(12)),
                          child: const BlIcon(_reuseIcon,
                              size: 20, color: Bl.white),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text("Use yesterday's closing",
                                  style:
                                      Bl.tight(14.5, w: FontWeight.w600)),
                              const SizedBox(height: 1),
                              Text('Carried from the day before',
                                  style: Bl.inter(12,
                                      c: const Color(0xFF7A6A4E))),
                            ],
                          ),
                        ),
                        Text(Money.inr(ledger.prevClosing!),
                            style: Bl.tight(17,
                                w: FontWeight.w700, c: _amberText)),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(18, 16, 18, 0),
            child: Row(
              children: [
                const Expanded(
                    child: Divider(height: 1, color: Color(0xFFE9E8E6))),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 10),
                  child: Text('or enter it',
                      style: Bl.inter(12, w: FontWeight.w500, c: Bl.mute)),
                ),
                const Expanded(
                    child: Divider(height: 1, color: Color(0xFFE9E8E6))),
              ],
            ),
          ),
        ],
        Padding(
          padding: const EdgeInsets.fromLTRB(18, 0, 18, 0),
          child: BlField(
            label: 'Opening balance',
            hint: '0',
            prefix: '₹',
            controller: _openingController,
            keyboardType:
                const TextInputType.numberWithOptions(decimal: true),
            inputFormatters: [
              FilteringTextInputFormatter.allow(RegExp(r'^\d*\.?\d{0,2}')),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(18, 16, 18, 0),
          child: BlButton('Save opening',
              loading: _busy,
              onTap: _busy
                  ? null
                  : () {
                      final v =
                          double.tryParse(_openingController.text.trim());
                      if (v != null) _saveOpening(date, v);
                    }),
        ),
        if (ledger.hasOpening)
          BlTap(
            onTap: () => setState(() => _editingOpening = false),
            child: Padding(
              padding: const EdgeInsets.only(top: 14),
              child: Text('Keep ${Money.inr(ledger.openingBal)}',
                  textAlign: TextAlign.center,
                  style: Bl.tight(14.5, w: FontWeight.w600, c: Bl.ink3)),
            ),
          ),
      ];

  // ── The day ───────────────────────────────────────────────────────────────
  List<Widget> _summary(DayBookLedger ledger) {
    Widget cell(String label, String value, Color color, {bool first = false}) =>
        Expanded(
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            decoration: first
                ? null
                : const BoxDecoration(
                    border: Border(left: BorderSide(color: _rule))),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label,
                    style: Bl.inter(11.5, w: FontWeight.w500, c: _grey)),
                const SizedBox(height: 2),
                FittedBox(
                  fit: BoxFit.scaleDown,
                  alignment: Alignment.centerLeft,
                  child: Text(value,
                      style: Bl.tight(15, w: FontWeight.w700, c: color)),
                ),
              ],
            ),
          ),
        );

    return [
      Padding(
        padding: const EdgeInsets.fromLTRB(18, 8, 18, 0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(ledger.isDeficit ? 'Closing balance · short of cash' : 'Closing balance',
                style: Bl.inter(13, w: FontWeight.w500, c: Bl.body)),
            const SizedBox(height: 6),
            Text(
                ledger.isDeficit
                    ? '− ${Money.inr(-ledger.closingBal)}'
                    : Money.inr(ledger.closingBal),
                style: Bl.tight(36,
                    w: FontWeight.w700,
                    ls: -0.04,
                    h: 1.05,
                    c: ledger.isDeficit ? Bl.redDeep : Bl.ink)),
          ],
        ),
      ),
      Container(
        margin: const EdgeInsets.fromLTRB(18, 14, 18, 0),
        decoration: BoxDecoration(
            border: Border.all(color: _rule),
            borderRadius: BorderRadius.circular(14)),
        child: IntrinsicHeight(
          child: Row(
            children: [
              cell('Opening', Money.inr(ledger.openingBal), Bl.ink,
                  first: true),
              cell('Cash in', '+ ${Money.inr(ledger.cashIn)}', _greenDeep),
              cell('Cash out', '− ${Money.inr(ledger.cashOut)}', Bl.redDeep),
            ],
          ),
        ),
      ),
      if (ledger.isLocked)
        Padding(
          padding: const EdgeInsets.fromLTRB(18, 10, 18, 0),
          child: Row(
            children: [
              const BlIcon(BlIcons.lock, size: 15, color: _grey),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                    ledger.closedAt == null
                        ? 'Day closed and locked'
                        : 'Day closed and locked · ${_clock(ledger.closedAt!)}',
                    style: Bl.inter(12.5, w: FontWeight.w600, c: _grey)),
              ),
            ],
          ),
        )
      else
        Align(
          alignment: Alignment.centerLeft,
          child: BlTap(
            onTap: () => setState(() {
              _openingController.clear();
              _editingOpening = true;
            }),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(18, 8, 18, 4),
              child: Text('Edit opening balance',
                  style:
                      Bl.inter(12.5, w: FontWeight.w600, c: _amberText)),
            ),
          ),
        ),
      BlGroupHeader('Cash receipts', trailing: Money.inr(ledger.cashIn)),
      Padding(
        padding: const EdgeInsets.symmetric(horizontal: 18),
        child: Column(
          children: [
            _kv('Cash sales', Money.inr(ledger.cashSales)),
            _kv('Cash collections', Money.inr(ledger.cashCollect)),
            _kv('Bank / UPI sales · not in the drawer',
                Money.inr(ledger.bankSales),
                muted: true),
            _kv('Bank collections · not in the drawer',
                Money.inr(ledger.bankCollect),
                muted: true),
            _kv('Credit sales · not counted as cash',
                Money.inr(ledger.creditSales),
                muted: true),
          ],
        ),
      ),
      BlGroupHeader('Cash payments', trailing: Money.inr(ledger.cashOut)),
      Padding(
        padding: const EdgeInsets.symmetric(horizontal: 18),
        child: Column(
          children: [
            _kv('Expenses', Money.inr(ledger.totalExpenses)),
            _kv('Cash purchases', Money.inr(ledger.cashPurchPaid)),
            _kv('Bank purchases · not from the drawer',
                Money.inr(ledger.bankPurchPaid),
                muted: true),
          ],
        ),
      ),
    ];
  }

  List<Widget> _count(DayBookLedger ledger, String date) {
    final counted = _counted;
    final verdict =
        counted == null ? null : _countVerdict(counted, ledger.closingBal);
    final saved = counted != null &&
        ledger.savedPhysicalCash != null &&
        (counted - ledger.savedPhysicalCash!).abs() < 0.005;
    final tone = verdict?.$2 ?? Bl.body;
    return [
      const BlGroupHeader('Count your cash'),
      Padding(
        padding: const EdgeInsets.symmetric(horizontal: 18),
        child: Row(
          children: [
            Expanded(
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                decoration: BoxDecoration(
                    color: Bl.tile, borderRadius: BorderRadius.circular(14)),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Book says',
                        style: Bl.inter(11.5, w: FontWeight.w500, c: _grey)),
                    const SizedBox(height: 2),
                    FittedBox(
                      fit: BoxFit.scaleDown,
                      alignment: Alignment.centerLeft,
                      child: Text(Money.inr(ledger.closingBal),
                          style: Bl.tight(18, w: FontWeight.w700)),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                decoration: BoxDecoration(
                    color: Bl.white,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(
                        color: ledger.isLocked ? _rule : Bl.brand, width: 2)),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('You counted',
                        style: Bl.inter(11.5, w: FontWeight.w500, c: _grey)),
                    const SizedBox(height: 2),
                    Row(
                      children: [
                        Text('₹', style: Bl.tight(18, w: FontWeight.w700)),
                        Expanded(
                          child: TextField(
                            controller: _physicalCashController,
                            enabled: !ledger.isLocked,
                            keyboardType:
                                const TextInputType.numberWithOptions(
                                    decimal: true),
                            inputFormatters: [
                              FilteringTextInputFormatter.allow(
                                  RegExp(r'^\d*\.?\d{0,2}')),
                            ],
                            cursorColor: Bl.brand,
                            style: Bl.tight(18, w: FontWeight.w700),
                            decoration: InputDecoration(
                              isCollapsed: true,
                              filled: false,
                              border: InputBorder.none,
                              enabledBorder: InputBorder.none,
                              focusedBorder: InputBorder.none,
                              disabledBorder: InputBorder.none,
                              hintText: '0',
                              hintStyle: Bl.tight(18,
                                  w: FontWeight.w700, c: Bl.faint),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
      Container(
        margin: const EdgeInsets.fromLTRB(18, 10, 18, 0),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
        constraints: const BoxConstraints(minHeight: 42),
        decoration: BoxDecoration(
            color: verdict == null
                ? Bl.tile
                : verdict.$3
                    ? const Color(0xFFE3F5EA)
                    : verdict.$2 == Bl.blue
                        ? Bl.blueSoft
                        : Bl.redSoft,
            borderRadius: BorderRadius.circular(12)),
        child: Row(
          children: [
            if (verdict != null && verdict.$3) ...[
              BlIcon(BlIcons.check, size: 18, color: tone, stroke: 2.6),
              const SizedBox(width: 10),
            ],
            Expanded(
              child: Text(
                  verdict?.$1 ??
                      (ledger.isLocked
                          ? 'No cash count was saved for this day.'
                          : 'Count the drawer and type the total.'),
                  style: verdict == null
                      ? Bl.inter(12.5, c: Bl.body)
                      : Bl.tight(13.5, w: FontWeight.w600, c: tone)),
            ),
            if (saved)
              Text('saved', style: Bl.inter(12, w: FontWeight.w500, c: tone))
            else if (counted != null && !ledger.isLocked)
              BlTap(
                onTap: _busy
                    ? null
                    : () => _write(() => ref
                        .read(daybookMutationsProvider.notifier)
                        .savePhysicalCash(
                          date: date,
                          physical: counted,
                          closingBal: ledger.closingBal,
                          openingBal: ledger.openingBal,
                        )),
                child: Padding(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 4, vertical: 9),
                  child: Text('Save count',
                      style: Bl.tight(13, w: FontWeight.w700, c: tone)),
                ),
              ),
          ],
        ),
      ),
    ];
  }

  List<Widget> _transactions(DayBookLedger ledger) {
    final net = ledger.cashIn - ledger.cashOut;
    final entries = ledger.entries.reversed.toList();
    return [
      BlGroupHeader('Transactions',
          trailing:
              '${entries.length} · ${net < 0 ? '−' : '+'} ${Money.inr(net.abs())}'),
      if (entries.isEmpty)
        const BlEmpty(
          icon: BlIcons.book,
          title: 'No transactions',
          message: 'Nothing recorded for this day',
        ),
      for (final e in entries) _entryRow(e),
    ];
  }

  Widget _entryRow(DayBookEntry e) {
    final credit = e.type == EntryType.creditSale;
    final income = e.type == EntryType.income;
    final color = credit
        ? Bl.body
        : income
            ? _greenDeep
            : Bl.redDeep;
    final method = switch (e.method) {
      MethodKind.cash => 'Cash',
      MethodKind.bank => 'Bank',
      MethodKind.credit => 'Credit · not cash',
      MethodKind.other => e.methodLabel.isEmpty
          ? 'Other'
          : '${e.methodLabel[0]}${e.methodLabel.substring(1).toLowerCase()}',
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 10),
      decoration: const BoxDecoration(
          border: Border(bottom: BorderSide(color: Bl.sep))),
      child: Row(
        children: [
          Container(
            width: 38,
            height: 38,
            alignment: Alignment.center,
            decoration: BoxDecoration(
                color: credit
                    ? Bl.well
                    : income
                        ? const Color(0xFFE3F5EA)
                        : const Color(0xFFFDE2E2),
                shape: BoxShape.circle),
            child: BlIcon(
                credit
                    ? BlIcons.doc
                    : income
                        ? _inIcon
                        : _outIcon,
                size: 17,
                color: color),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(e.title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Bl.tight(14.5, w: FontWeight.w600)),
                const SizedBox(height: 1),
                Text(
                    [
                      _clock(e.createdAt),
                      method,
                      if ((e.note ?? '').trim().isNotEmpty) e.note!.trim(),
                    ].join(' · '),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Bl.inter(12, c: _grey)),
              ],
            ),
          ),
          const SizedBox(width: 10),
          Text(
              '${credit ? '' : income ? '+ ' : '− '}${Money.inr(e.amount)}',
              style: Bl.tight(14.5, w: FontWeight.w600, c: color)),
        ],
      ),
    );
  }

  Widget _notice(String title, String body) => Container(
        margin: const EdgeInsets.fromLTRB(18, 10, 18, 0),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
        decoration: BoxDecoration(
            color: Bl.amberSoft, borderRadius: BorderRadius.circular(12)),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title,
                style: Bl.tight(13.5, w: FontWeight.w600, c: Bl.amberDeep)),
            const SizedBox(height: 2),
            Text(body,
                style: Bl.inter(12.5, c: const Color(0xFF7A6A4E), h: 1.45)),
          ],
        ),
      );

  @override
  Widget build(BuildContext context) {
    final selectedDate = ref.watch(selectedDayBookDateProvider);
    final ledgerAsync = ref.watch(dayLedgerProvider(selectedDate));
    final today = _iso(DateTime.now());
    final isFuture = selectedDate.compareTo(today) > 0;
    final ledger = ledgerAsync.valueOrNull;

    if (ledger != null && ledger.date == selectedDate && _countFor != selectedDate) {
      _countFor = selectedDate;
      final saved = ledger.savedPhysicalCash;
      _physicalCashController.text = saved == null
          ? ''
          : (saved == saved.roundToDouble()
              ? saved.toStringAsFixed(0)
              : saved.toStringAsFixed(2));
    }

    final showForm =
        ledger != null && !ledger.isLocked && (!ledger.hasOpening || _editingOpening);
    final canClose = ledger != null &&
        !showForm &&
        !ledger.isLocked &&
        ledger.hasOpening &&
        !isFuture;

    return Scaffold(
      backgroundColor: Bl.white,
      body: SafeArea(
        child: Column(
          children: [
            BlBackHeader(
              title: 'Day Book',
              trailing: BlRoundButton(_clockIcon,
                  label: 'Day Book history',
                  onTap: () => Navigator.push(
                        context,
                        MaterialPageRoute(
                            builder: (_) => const DayBookHistoryScreen()),
                      )),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(18, 6, 18, 0),
              child: Row(
                children: [
                  _round(BlIcons.back, 'Previous day',
                      () => _setDate(_iso(_parse(selectedDate).subtract(const Duration(days: 1))))),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Semantics(
                      button: true,
                      label:
                          '${dayBookDateLabel(selectedDate)}. Pick another day',
                      excludeSemantics: true,
                      child: BlTap(
                        onTap: () => _pickDate(selectedDate),
                        child: Container(
                          height: 36,
                          decoration: BoxDecoration(
                              color: Bl.well,
                              borderRadius: BorderRadius.circular(999)),
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              const BlIcon(_calendarIcon,
                                  size: 18, color: _grey),
                              const SizedBox(width: 8),
                              Text(dayBookDateLabel(selectedDate),
                                  style:
                                      Bl.tight(13.5, w: FontWeight.w600)),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  _round(
                      BlIcons.chevronRight,
                      'Next day',
                      selectedDate.compareTo(today) >= 0
                          ? null
                          : () => _setDate(_iso(_parse(selectedDate)
                              .add(const Duration(days: 1))))),
                ],
              ),
            ),
            Expanded(
              child: ledgerAsync.when(
                skipLoadingOnRefresh: true,
                skipLoadingOnReload: true,
                loading: () => const Center(
                    child: CircularProgressIndicator(
                        color: Bl.amber, strokeWidth: 2)),
                error: (e, _) => Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Text(
                        'Could not load this day. Check your internet and try again. ($e)',
                        textAlign: TextAlign.center,
                        style: Bl.inter(13.5, c: Bl.redDeep, h: 1.5)),
                  ),
                ),
                data: (ledger) => ListView(
                  padding: const EdgeInsets.only(bottom: 24),
                  children: [
                    // Say so when the day is coming from the local cache.
                    // Without this an offline day with nothing cached renders
                    // as a legitimate day of zero trade, and a cashier reading
                    // a blank ledger as a closed till would reconcile against
                    // nothing.
                    if (ledger.fromCache)
                      _notice('Showing the last synced data',
                          "Anything recorded since the last sync is missing, so these totals may be short. Don't reconcile the till against this."),
                    if (ledger.unsyncedEntries > 0)
                      Padding(
                        padding: const EdgeInsets.fromLTRB(18, 10, 18, 0),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const OfflineSalesBanner(),
                            const SizedBox(height: 4),
                            Text(
                                '${ledger.unsyncedEntries} entr${ledger.unsyncedEntries == 1 ? 'y' : 'ies'} '
                                'below ${ledger.unsyncedEntries == 1 ? 'is' : 'are'} on this phone only, not synced yet.',
                                style: Bl.inter(12, c: _grey)),
                          ],
                        ),
                      ),
                    if (showForm)
                      ..._openingForm(ledger, selectedDate)
                    else ...[
                      ..._summary(ledger),
                      if (ledger.hasOpening && !isFuture)
                        ..._count(ledger, selectedDate),
                    ],
                    ..._transactions(ledger),
                  ],
                ),
              ),
            ),
            // Closing is withheld on a cached day. Closing computes variance
            // as counted minus expected and posts that difference to the cash
            // account; on a short expected figure that writes a real
            // adjustment for money that never went missing, and the day locks
            // for good.
            if (canClose)
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                child: ledger.fromCache
                    ? Text(
                        'Reconnect to close this day. Closing locks it and records a cash difference, which needs the complete day.',
                        textAlign: TextAlign.center,
                        style: Bl.inter(12.5, c: Bl.body, h: 1.45))
                    : BlSlide('Slide to lock day',
                        enabled: !_busy,
                        onConfirmed: () => _closeDay(ledger, selectedDate)),
              ),
          ],
        ),
      ),
    );
  }
}

/// Dashed amber outline for the "use yesterday's closing" card.
class _DashedBorder extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = Bl.brand
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.5;
    final path = Path()
      ..addRRect(RRect.fromRectAndRadius(
          Offset.zero & size, const Radius.circular(16)));
    for (final m in path.computeMetrics()) {
      for (double d = 0; d < m.length; d += 9) {
        canvas.drawPath(m.extractPath(d, d + 5), paint);
      }
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

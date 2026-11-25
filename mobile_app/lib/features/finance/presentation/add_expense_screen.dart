import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/material.dart';
import 'package:mobile_app/core/design/bl_widgets.dart';
import 'package:mobile_app/widgets/motion/motion_curves.dart' show motionDur;
import 'package:flutter/services.dart';
import 'package:supabase_flutter/supabase_flutter.dart' show PostgrestException;
import 'package:uuid/uuid.dart';
import 'package:mobile_app/features/finance/data/recurring.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/core/supabase/client.dart';
import 'package:mobile_app/features/sales/presentation/add_sale_screen.dart' show posStoresProvider;
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
  // Repeat: NONE | DAILY | MONTHLY. Daily can skip weekdays (ISO 1 = Mon …
  // 7 = Sun); all seven chosen is stored as "every day".
  String _repeat = 'NONE';
  Set<int> _weekdays = {1, 2, 3, 4, 5, 6, 7};
  bool _keepOneDay = false; // tried to turn off the last selected day
  bool _excludeFromPl = false;
  String? _storeId; // store/till this expense was paid from (multi-store)

  bool get _isEditMode => widget.expense != null;

  // (label on the chip, value stored on the expense).
  static const _categories = [
    ('Food', 'Food'),
    ('Petrol', 'Petrol'),
    ('Salary', 'Salary'),
    ('Rent', 'Rent'),
    ('Utility', 'Utility'),
    ('Purchase', 'Purchase'),
    ('Maintenance', 'Maintenance'),
    ('Credit card', 'Credit Card Payment'),
    ('Delivery', 'Delivery Charge'),
    ('Other', 'Other'),
  ];

  static const _methods = [
    ('CASH', 'Cash', BlIcons.cash),
    ('UPI', 'UPI',
        '<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 18h2v2h-2z"/>'),
    ('BANK', 'Bank', BlIcons.bank),
    ('CARD', 'Card',
        '<rect x="3" y="6" width="18" height="13" rx="3"/><path d="M3 10h18"/>'),
  ];

  bool _moreOpen = false;

  @override
  void initState() {
    super.initState();
    final e = widget.expense;
    _noteController = TextEditingController(text: e?.note ?? '');
    _amountController = TextEditingController(
      text: e?.amount != null ? expenseAmountText(e!.amount!) : '',
    );
    _selectedCategory = e?.category ?? 'Other';
    // A new expense defaults to today in IST, the shop's day (the web's
    // todayISOInAppTZ), whatever zone the phone is set to.
    _selectedDate = e?.date != null
        ? DateTime.tryParse(e!.date!) ?? DateTime.parse(todayIst())
        : DateTime.parse(todayIst());
    _excludeFromPl = e?.excludeFromPl ?? false;
    // An edit starts from what the expense was saved with. Starting from the
    // defaults instead rewrote a bank expense as cash, and dropped its GST
    // claim and its store, the moment anything else on it was changed.
    final method = (e?.paymentMethod ?? '').toUpperCase();
    if (_methods.any((m) => m.$1 == method)) _paymentMethod = method;
    _storeId = e?.locationId;
    final gstin = (e?.vendorGstin ?? '').trim();
    _gstinController = TextEditingController(text: gstin);
    if (e != null && ((e.gstAmount ?? 0) > 0 || gstin.isNotEmpty)) {
      _gstClaimable = true;
      final rate = e.gstRate;
      if (rate != null && rate > 0) {
        _gstRate = rate == rate.roundToDouble()
            ? rate.toStringAsFixed(0)
            : rate.toString();
      }
    }
    _moreOpen = _gstClaimable || _excludeFromPl || _storeId != null;
  }

  @override
  void dispose() {
    _noteController.dispose();
    _amountController.dispose();
    _gstinController.dispose();
    super.dispose();
  }

  // ── Amount figure sizing ──
  // The amount is drawn at 56 and shrinks, never rendering smaller than 28,
  // so a long figure on a narrow phone or under a large system font stays
  // whole instead of silently scrolling its first digits out of sight
  // (₹12,34,567 read as 2,34,567). Only past the floor does the field scroll.
  static const _amountMaxSize = 46.0;
  static const _amountMinRendered = 28.0;
  static const _amountHint = '0.00';

  // ₹, its offset and the letter spacing all scale with the figure, so the
  // row keeps the proportions it has at 56.
  TextStyle _rupeeStyle(double size) => Bl.tight(
        28 * size / _amountMaxSize,
        w: FontWeight.w600,
        c: const Color(0xFF7A8088),
      );

  TextStyle _amountStyle(double size) =>
      Bl.tight(size, w: FontWeight.w700, ls: -0.04, h: 1.1);

  TextStyle _amountHintStyle(double size) =>
      Bl.tight(size, w: FontWeight.w700, ls: -0.04, h: 1.1, c: Bl.faint);

  Size _measure(String s, TextStyle style, TextScaler scaler) {
    final painter = TextPainter(
      text: TextSpan(text: s, style: style),
      textDirection: TextDirection.ltr,
      textScaler: scaler,
      maxLines: 1,
    )..layout();
    final size = painter.size;
    painter.dispose();
    return size;
  }

  /// The largest size, up to 56, at which [text] fits beside ₹ in
  /// [maxWidth]. Each candidate is laid out with the real text scaler and
  /// bisected, because Android 14 scales large text non-linearly: shrinking
  /// in proportion to one measurement at 56 picks a size that still scrolls.
  double _amountFontSize(BuildContext context, String text, double maxWidth) {
    final scaler = MediaQuery.textScalerOf(context);
    final shown = text.isEmpty ? _amountHint : text;
    bool fits(double size) {
      final style =
          text.isEmpty ? _amountHintStyle(size) : _amountStyle(size);
      // The field's 280dp cap, or what the row has after ₹ and its 6dp
      // gap, less a little for the cursor.
      final room = (maxWidth - _measure('₹', _rupeeStyle(size), scaler).width - 6)
              .clamp(0.0, 280.0) -
          4;
      return _measure(shown, style, scaler).width <= room;
    }

    if (fits(_amountMaxSize)) return _amountMaxSize;
    // The floor is on the rendered size: under a 2x font a nominal 28 would
    // draw 56 tall and still scroll.
    var lo = 1.0, hi = _amountMinRendered;
    if (scaler.scale(_amountMinRendered) <= _amountMinRendered) {
      lo = _amountMinRendered;
    } else {
      for (var i = 0; i < 10; i++) {
        final mid = (lo + hi) / 2;
        if (scaler.scale(mid) >= _amountMinRendered) {
          hi = mid;
        } else {
          lo = mid;
        }
      }
      lo = hi;
    }
    if (!fits(lo)) return lo;
    hi = _amountMaxSize;
    for (var i = 0; i < 8; i++) {
      final mid = (lo + hi) / 2;
      if (fits(mid)) {
        lo = mid;
      } else {
        hi = mid;
      }
    }
    return lo;
  }

  /// The amount row's height at the full 56, held while the figure shrinks
  /// so the form below does not climb as a long figure is typed.
  double _amountRowHeight(BuildContext context) {
    final scaler = MediaQuery.textScalerOf(context);
    final figure = _measure('0', _amountStyle(_amountMaxSize), scaler).height;
    final rupee = _measure('₹', _rupeeStyle(_amountMaxSize), scaler).height;
    return figure > rupee ? figure : rupee;
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
            primary: Bl.ink,
            onPrimary: Bl.white,
            onSurface: Bl.ink,
            surface: Bl.white,
          ),
        ),
        child: child!,
      ),
    );
    if (picked != null) setState(() => _selectedDate = picked);
  }

  // ── Custom categories (parity with web settings.expense_categories) ──
  Future<void> _addCategoryDialog() async {
    final ctrl = TextEditingController();
    final name = await showBlCustomDialog<String>(
      context: context,
      builder: (ctx) => Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('New category', style: Bl.tight(16, w: FontWeight.w700)),
          BlField(
            label: 'Name',
            hint: 'e.g. Packaging',
            controller: ctrl,
            capitalization: TextCapitalization.words,
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                child: BlButton('Cancel',
                    kind: BlButtonKind.soft, onTap: () => Navigator.pop(ctx)),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: BlButton('Add',
                    onTap: () => Navigator.pop(ctx, ctrl.text.trim())),
              ),
            ],
          ),
        ],
      ),
    );
    if (name == null || name.isEmpty) return;
    final ctx = await ref.read(tenantContextProvider.future);
    if (ctx == null) return;
    final existing = ref.read(customExpenseCategoriesProvider).valueOrNull ?? [];
    try {
      await saveExpenseCategories(ref, ctx.tenantId, [...existing, name]);
    } catch (e) {
      debugPrint('[expenses] add category failed: $e');
      if (mounted) {
        setState(() => _formError =
            'The category may not have saved. Check the list before adding it again. ($e)');
      }
      return;
    }
    if (mounted) setState(() => _selectedCategory = name);
  }

  Future<void> _deleteCategoryDialog(String name) async {
    final ok = await showBlDialog<bool>(
      context: context,
      title: 'Remove "$name"?',
      message: 'Existing expenses keep this category.',
      actions: (dctx) => [
        Row(
          children: [
            Expanded(
              child: BlButton('Cancel',
                  kind: BlButtonKind.soft,
                  onTap: () => Navigator.pop(dctx, false)),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: BlButton('Remove',
                  kind: BlButtonKind.danger,
                  onTap: () => Navigator.pop(dctx, true)),
            ),
          ],
        ),
      ],
    );
    if (ok != true) return;
    final ctx = await ref.read(tenantContextProvider.future);
    if (ctx == null) return;
    final existing = ref.read(customExpenseCategoriesProvider).valueOrNull ?? [];
    try {
      await saveExpenseCategories(
          ref, ctx.tenantId, existing.where((c) => c != name).toList());
    } catch (e) {
      debugPrint('[expenses] remove category failed: $e');
      if (mounted) {
        setState(() => _formError =
            'The category may not have been removed. Check the list before trying again. ($e)');
      }
      return;
    }
    if (mounted && _selectedCategory == name) {
      setState(() => _selectedCategory = 'Other');
    }
  }

  String _dateLabel() {
    final today = DateTime.parse(todayIst());
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
      setState(() => _formError = 'Could not tell which shop this is. Sign out and back in.');
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

    // A repeat is set up online only (v1). Refuse before saving anything, so
    // the person can retry online without logging the expense twice.
    if (!_isEditMode && _repeat != 'NONE') {
      final conn = await Connectivity().checkConnectivity();
      if (conn == ConnectivityResult.none) {
        setState(() => _formError =
            'You are offline. Repeat not set up — try again online, or set Repeat to No to log this once.');
        return;
      }
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
          'location_id': _storeId,
          'exclude_from_pl': _excludeFromPl,
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
            const SnackBar(
              content: Text('Expense updated'),
              behavior: SnackBarBehavior.floating,
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
          'location_id': _storeId,
          'exclude_from_pl': _excludeFromPl,
          'tenant_id': tenantCtx.tenantId,
        };

        final queued = await ref.read(syncServiceProvider).upsertOnlineOrQueue('expenses', row);

        // Repeat → insert the template row; the database's nightly job
        // (generate_due_recurring_expenses) logs it from the day after. Same
        // fields as the web (shared contract: data/recurring.dart). Never
        // silent: whatever goes wrong is said on screen.
        String? repeatProblem;
        String? repeatLabel;
        if (_repeat != 'NONE') {
          if (queued) {
            // The expense went to the offline queue, so the connection
            // dropped mid-save. Don't attach a template to a queued expense.
            repeatProblem =
                'Expense saved offline. Repeat not set up — try again online.';
          } else {
            final tpl = recurringTemplateRow(
              id: 'RET-${const Uuid().v4()}',
              tenantId: tenantCtx.tenantId,
              note: note,
              amount: amount,
              category: _selectedCategory,
              paymentMethod: _paymentMethod,
              // The same values the expense was saved with (row above).
              locationId: row['location_id'] as String?,
              excludeFromPl: row['exclude_from_pl'] as bool,
              gstRate: row['gst_rate'] as double?,
              gstAmount: row['gst_amount'] as double?,
              vendorGstin: row['vendor_gstin'] as String?,
              frequency: _repeat,
              weekdays: _weekdays,
              date: row['date'] as String,
              today: todayIst(),
            );
            try {
              await supabase
                  .from('recurring_expense_templates')
                  .insert(tpl)
                  .timeout(const Duration(seconds: 10));
              repeatLabel = describeRecurringRow(tpl);
            } on PostgrestException catch (e) {
              debugPrint('[expenses] recurring setup rejected: $e');
              repeatProblem =
                  'Expense saved, but the repeat could not be set up: ${e.message}';
            } catch (e) {
              // A dropped connection may still have created it. The raw error
              // (a timeout or socket message) is logged, not shown.
              debugPrint('[expenses] recurring setup unconfirmed: $e');
              repeatProblem =
                  "Expense saved, but we couldn't confirm the repeat was set up. "
                  "Check the Expenses page on the web; if it isn't listed, set the repeat up again.";
            }
          }
        }

        if (mounted) {
          ref.invalidate(expensesProvider);
          ref.invalidate(telemetryProvider);
          Navigator.pop(context);
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(repeatProblem ??
                  (queued
                      ? 'Saved on this phone. It will sync when you are online.'
                      : repeatLabel != null
                          ? 'Expense logged · Repeats: $repeatLabel'
                          : 'Expense logged')),
              duration: Duration(seconds: repeatProblem != null ? 10 : 4),
              behavior: SnackBarBehavior.floating,
            ),
          );
        }
      }
    } catch (e) {
      if (mounted) {
        debugPrint('[expenses] save failed: $e');
        setState(() => _formError =
            'May not have saved. Check Expenses before trying again. ($e)');
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  // Repeat: No / Daily / Monthly, with weekday chips for Daily. The label is
  // the shared describeRecurring, so it reads exactly as the web's.
  /// Pills of equal visible width in a row, with the gap between two of
  /// them split across their own tap areas so the gap is never a dead zone.
  /// Edge slots carry only an inner half-gap, so they are sized to match.
  Widget _gaplessRow({
    required double gap,
    required List<Widget Function(EdgeInsets gap)> children,
  }) {
    final n = children.length;
    final half = gap / 2;
    return LayoutBuilder(builder: (context, c) {
      final visible = (c.maxWidth - gap * (n - 1)) / n;
      return Row(children: [
        for (var i = 0; i < n; i++)
          SizedBox(
            width: visible + (i > 0 ? half : 0) + (i < n - 1 ? half : 0),
            child: children[i](EdgeInsets.only(
                left: i > 0 ? half : 0, right: i < n - 1 ? half : 0)),
          ),
      ]);
    });
  }

  Widget _repeatControl() {
    // The line states the real next date by the database's rule, and flags
    // a 29th-31st pick being capped to the 28th (shared scheduleLine).
    final date = _selectedDate.toIso8601String().split('T')[0];
    final sub = _repeat == 'NONE'
        ? 'Log this once'
        : scheduleLine({
            ...recurringTemplateFor(
                frequency: _repeat, weekdays: _weekdays, date: date, today: todayIst()),
            'asked_day': _selectedDate.day,
          });

    // `gap` is padding INSIDE the tappable: the space between two pills
    // belongs to them, so a tap there is never a dead zone.
    Widget pill(String label, bool on, VoidCallback onTap,
            {String? semantics, EdgeInsets gap = EdgeInsets.zero}) =>
        Semantics(
          button: true,
          selected: on,
          label: semantics ?? label,
          child: BlTap(
            onTap: onTap,
            child: Padding(
              padding: gap,
              child: Container(
              // Size to the label (or to the slot an Expanded gives it).
              // `alignment` here would make every pill as wide as its parent
              // allows -- inside a Wrap that was one weekday per line.
              constraints: const BoxConstraints(minHeight: 44),
              padding: const EdgeInsets.symmetric(horizontal: 4),
              decoration: BoxDecoration(
                color: on ? Bl.ink : Bl.wellSoft,
                borderRadius: BorderRadius.circular(999),
              ),
              child: Center(
                widthFactor: 1,
                heightFactor: 1,
                child: Text(label, maxLines: 1, style: Bl.tight(13,
                    w: FontWeight.w600, ls: 0, c: on ? Bl.white : Bl.ink3)),
              ),
            ),
            ),
          ),
        );

    return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Repeat', style: Bl.tight(14, w: FontWeight.w600)),
          const SizedBox(height: 1),
          Text(sub, key: const Key('repeat-label'),
              style: Bl.inter(12, c: const Color(0xFF7A8088))),
          const SizedBox(height: 10),
          _gaplessRow(gap: 6, children: [
            for (final (k, label) in const [('NONE', 'No'), ('DAILY', 'Daily'), ('MONTHLY', 'Monthly')])
              (gap) => pill(label, _repeat == k, () => setState(() => _repeat = k),
                  semantics: 'Repeat $label', gap: gap),
          ]),
          if (_repeat == 'DAILY') ...[
            const SizedBox(height: 10),
            // One row of seven, Mon first, the same order as the web.
            _gaplessRow(gap: 4, children: [
              for (final w in weekdays)
                (gap) => pill(w.short, _weekdays.contains(w.n), () {
                  final next = {..._weekdays};
                  if (!next.remove(w.n)) next.add(w.n);
                  // At least one day: an empty list would mean "every
                  // day". Say so instead of ignoring the tap.
                  setState(() {
                    _keepOneDay = next.isEmpty;
                    if (next.isNotEmpty) _weekdays = next;
                  });
                }, semantics: '${w.short}, ${_weekdays.contains(w.n) ? 'on' : 'off'}', gap: gap),
            ]),
            if (_keepOneDay) ...[
              const SizedBox(height: 8),
              // Secondary text, like "Log this once". Red is kept for money
              // that is overdue or lost.
              Text('Keep at least one day', key: const Key('keep-one-day'),
                  style: Bl.inter(12, c: const Color(0xFF7A8088))),
            ],
          ],
        ],
    );
  }

  Widget _toggleRow(String title, String sub, bool value,
          ValueChanged<bool> onChanged) =>
      Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: Bl.tight(14, w: FontWeight.w600)),
                const SizedBox(height: 1),
                Text(sub,
                    style:
                        Bl.inter(12, c: const Color(0xFF7A8088), h: 1.35)),
              ],
            ),
          ),
          const SizedBox(width: 10),
          BlToggle(value: value, onChanged: onChanged, label: title),
        ],
      );

  Widget _chip(String label, bool on, VoidCallback onTap,
          {VoidCallback? onLongPress}) =>
      Semantics(
        button: true,
        selected: on,
        label: label,
        excludeSemantics: true,
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: onTap,
          onLongPress: onLongPress,
          child: Container(
            constraints: const BoxConstraints(minHeight: 36),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
            decoration: BoxDecoration(
                color: on ? Bl.ink : Bl.wellSoft,
                borderRadius: BorderRadius.circular(999)),
            child: Text(label,
                style: Bl.tight(13,
                    w: FontWeight.w600, ls: 0, c: on ? Bl.white : Bl.ink3)),
          ),
        ),
      );

  Future<void> _seeAllCategories(List<String> custom) async {
    final all = [
      for (final c in _categories) c.$2,
      ...custom,
      if (!_categories.any((c) => c.$2 == _selectedCategory) &&
          !custom.contains(_selectedCategory))
        _selectedCategory,
    ];
    final picked = await showBlPicker(context,
        title: 'Category', options: all, selected: _selectedCategory);
    if (picked != null && mounted) setState(() => _selectedCategory = picked);
  }

  @override
  Widget build(BuildContext context) {
    final stores = ref.watch(posStoresProvider).valueOrNull ?? const [];
    final custom = ref.watch(customExpenseCategoriesProvider).maybeWhen(
        data: (c) => c, orElse: () => const <String>[]);
    // A category the expense already has but the lists do not (renamed or
    // removed since) still gets a chip, so an edit does not silently move it.
    final orphan = !_categories.any((c) => c.$2 == _selectedCategory) &&
        !custom.contains(_selectedCategory);
    final storeName = stores
        .where((s) => s['id'] == _storeId)
        .map((s) => (s['name'] ?? 'Store').toString())
        .firstOrNull;

    return Scaffold(
      backgroundColor: Bl.white,
      body: SafeArea(
        child: Column(
          children: [
            BlBackHeader(title: _isEditMode ? 'Edit Expense' : 'New Expense'),
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.only(bottom: 20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const SizedBox(height: 10),
                    Text('Amount spent',
                        textAlign: TextAlign.center,
                        style: Bl.inter(13, w: FontWeight.w500, c: Bl.body)),
                    const SizedBox(height: 4),
                    // The figure shrinks to stay whole (see _amountFontSize),
                    // and the row keeps its full height while it does, so the
                    // form below does not climb as a long figure is typed.
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 24),
                      child: LayoutBuilder(builder: (context, c) {
                        return ValueListenableBuilder<TextEditingValue>(
                          valueListenable: _amountController,
                          builder: (context, value, _) {
                            final size = _amountFontSize(
                                context, value.text, c.maxWidth);
                            return SizedBox(
                              height: _amountRowHeight(context),
                              child: Row(
                                mainAxisAlignment: MainAxisAlignment.center,
                                crossAxisAlignment:
                                    CrossAxisAlignment.baseline,
                                textBaseline: TextBaseline.alphabetic,
                                children: [
                                  Text('₹', style: _rupeeStyle(size)),
                                  const SizedBox(width: 6),
                                  Flexible(
                                    child: ConstrainedBox(
                                      constraints: const BoxConstraints(
                                          maxWidth: 280),
                                      child: IntrinsicWidth(
                                        child: TextField(
                                          controller: _amountController,
                                          autofocus: !_isEditMode,
                                          keyboardType: const TextInputType
                                              .numberWithOptions(
                                              decimal: true),
                                          inputFormatters: [
                                            FilteringTextInputFormatter.deny(
                                                ','),
                                            const ExpenseAmountFormatter(),
                                          ],
                                          maxLines: 1,
                                          cursorColor: Bl.brand,
                                          style: _amountStyle(size),
                                          decoration: InputDecoration(
                                            isCollapsed: true,
                                            filled: false,
                                            border: InputBorder.none,
                                            enabledBorder: InputBorder.none,
                                            focusedBorder: InputBorder.none,
                                            hintText: _amountHint,
                                            hintStyle: _amountHintStyle(size),
                                          ),
                                        ),
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            );
                          },
                        );
                      }),
                    ),
                    Padding(
                      padding: const EdgeInsets.fromLTRB(18, 16, 18, 4),
                      child: Row(
                        children: [
                          Expanded(
                              child: Text('CATEGORY', style: Bl.eyebrow)),
                          BlTap(
                            onTap: () => _seeAllCategories(custom),
                            child: Padding(
                              padding:
                                  const EdgeInsets.symmetric(vertical: 4),
                              child: Text('See all',
                                  style: Bl.tight(12.5,
                                      w: FontWeight.w600,
                                      ls: 0,
                                      c: const Color(0xFFB86A0A))),
                            ),
                          ),
                        ],
                      ),
                    ),
                    Padding(
                      padding: const EdgeInsets.fromLTRB(18, 2, 18, 0),
                      child: Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          for (final c in _categories)
                            _chip(c.$1, _selectedCategory == c.$2,
                                () => setState(() => _selectedCategory = c.$2)),
                          for (final name in custom)
                            _chip(name, _selectedCategory == name,
                                () => setState(() => _selectedCategory = name),
                                onLongPress: () =>
                                    _deleteCategoryDialog(name)),
                          if (orphan) _chip(_selectedCategory, true, () {}),
                          _chip('+ Add', false, _addCategoryDialog),
                        ],
                      ),
                    ),
                    Padding(
                      padding: const EdgeInsets.fromLTRB(18, 16, 18, 4),
                      child: Text('PAID VIA', style: Bl.eyebrow),
                    ),
                    Padding(
                      padding: const EdgeInsets.fromLTRB(18, 2, 18, 0),
                      child: Row(
                        children: [
                          for (var i = 0; i < _methods.length; i++) ...[
                            if (i > 0) const SizedBox(width: 8),
                            Expanded(
                              child: Semantics(
                                button: true,
                                selected: _paymentMethod == _methods[i].$1,
                                label: _methods[i].$2,
                                excludeSemantics: true,
                                child: BlTap(
                                  onTap: () => setState(
                                      () => _paymentMethod = _methods[i].$1),
                                  child: Container(
                                    constraints:
                                        const BoxConstraints(minHeight: 58),
                                    padding: const EdgeInsets.symmetric(
                                        vertical: 8),
                                    decoration: BoxDecoration(
                                        color: _paymentMethod ==
                                                _methods[i].$1
                                            ? Bl.brand
                                            : Bl.wellSoft,
                                        borderRadius:
                                            BorderRadius.circular(14)),
                                    child: Column(
                                      mainAxisAlignment:
                                          MainAxisAlignment.center,
                                      children: [
                                        BlIcon(_methods[i].$3,
                                            size: 19,
                                            color: _paymentMethod ==
                                                    _methods[i].$1
                                                ? Bl.white
                                                : Bl.ink3),
                                        const SizedBox(height: 5),
                                        FittedBox(
                                          fit: BoxFit.scaleDown,
                                          child: Text(_methods[i].$2,
                                              maxLines: 1,
                                              style: Bl.tight(12.5,
                                                  w: FontWeight.w600,
                                                  ls: 0,
                                                  c: _paymentMethod ==
                                                          _methods[i].$1
                                                      ? Bl.white
                                                      : Bl.ink3)),
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 18),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          BlField(
                            label: 'What was it for?',
                            hint: 'e.g. Electricity bill',
                            controller: _noteController,
                            capitalization: TextCapitalization.sentences,
                          ),
                          BlField(
                            label: 'Date',
                            value: _dateLabel(),
                            onTap: _pickDate,
                            trailing: const Padding(
                              padding: EdgeInsets.only(right: 6),
                              child: BlIcon(
                                  '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>',
                                  size: 18,
                                  color: Color(0xFF7A8088)),
                            ),
                          ),
                        ],
                      ),
                    ),
                    Container(
                      margin: const EdgeInsets.fromLTRB(18, 14, 18, 0),
                      padding: const EdgeInsets.symmetric(
                          horizontal: 14, vertical: 12),
                      decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(14),
                          border:
                              Border.all(color: const Color(0xFFECEBE9))),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Semantics(
                            button: true,
                            expanded: _moreOpen,
                            label: 'More options',
                            excludeSemantics: true,
                            child: BlTap(
                              onTap: () =>
                                  setState(() => _moreOpen = !_moreOpen),
                              child: Row(
                                children: [
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Text('More options',
                                            style: Bl.tight(14,
                                                w: FontWeight.w600)),
                                        const SizedBox(height: 1),
                                        Text(
                                            _isEditMode
                                                ? 'Claim GST · not a business expense'
                                                : 'Claim GST · not a business expense · repeat',
                                            style: Bl.inter(12,
                                                c: const Color(0xFF7A8088))),
                                      ],
                                    ),
                                  ),
                                  AnimatedRotation(
                                    turns: _moreOpen ? 0.5 : 0,
                                    duration: motionDur(context, 160),
                                    child: const BlIcon(BlIcons.chevronDown,
                                        size: 18, color: Color(0xFF7A8088)),
                                  ),
                                ],
                              ),
                            ),
                          ),
                          if (_moreOpen) ...[
                            const Divider(height: 25, color: Bl.sep),
                            _toggleRow(
                                'Claim GST (ITC)',
                                'For registered vendors with a GSTIN',
                                _gstClaimable,
                                (v) => setState(() => _gstClaimable = v)),
                            if (_gstClaimable) ...[
                              const SizedBox(height: 10),
                              Wrap(
                                spacing: 8,
                                runSpacing: 8,
                                children: [
                                  for (final r in {
                                    '5',
                                    '12',
                                    '18',
                                    '28',
                                    _gstRate
                                  })
                                    _chip('$r%', _gstRate == r,
                                        () => setState(() => _gstRate = r)),
                                ],
                              ),
                              BlField(
                                label: 'Vendor GSTIN',
                                hint: '22AAAAA0000A1Z5',
                                controller: _gstinController,
                                capitalization: TextCapitalization.characters,
                              ),
                            ],
                            const Divider(height: 25, color: Bl.sep),
                            _toggleRow(
                                'Not a business expense',
                                'Owner drawing, loan repayment or capital. Kept out of profit.',
                                _excludeFromPl,
                                (v) => setState(() => _excludeFromPl = v)),
                            if (stores.length > 1) ...[
                              const Divider(height: 25, color: Bl.sep),
                              BlTap(
                                onTap: () async {
                                  const whole = 'Business-wide';
                                  final names = [
                                    whole,
                                    for (final s in stores)
                                      (s['name'] ?? 'Store').toString(),
                                  ];
                                  final picked = await showBlPicker(context,
                                      title: 'Paid from store',
                                      options: names,
                                      selected: storeName ?? whole);
                                  if (picked == null || !mounted) return;
                                  setState(() => _storeId = picked == whole
                                      ? null
                                      : stores
                                          .firstWhere((s) =>
                                              (s['name'] ?? 'Store')
                                                  .toString() ==
                                              picked)['id'] as String);
                                },
                                child: Row(
                                  children: [
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment:
                                            CrossAxisAlignment.start,
                                        children: [
                                          Text('Paid from store',
                                              style: Bl.tight(14,
                                                  w: FontWeight.w600)),
                                          const SizedBox(height: 1),
                                          Text(storeName ?? 'Business-wide',
                                              style: Bl.inter(12,
                                                  c: const Color(
                                                      0xFF7A8088))),
                                        ],
                                      ),
                                    ),
                                    const BlIcon(BlIcons.chevronRight,
                                        size: 16, color: Color(0xFFB8BCC2)),
                                  ],
                                ),
                              ),
                            ],
                            if (!_isEditMode) ...[
                              const Divider(height: 25, color: Bl.sep),
                              _repeatControl(),
                            ],
                          ],
                        ],
                      ),
                    ),
                    if (_formError != null)
                      Container(
                        margin: const EdgeInsets.fromLTRB(18, 12, 18, 0),
                        padding: const EdgeInsets.symmetric(
                            horizontal: 12, vertical: 9),
                        decoration: BoxDecoration(
                            color: Bl.redSoft,
                            borderRadius: BorderRadius.circular(12)),
                        child: Text(_formError!,
                            style: Bl.inter(12.5,
                                w: FontWeight.w500, c: Bl.redDeep)),
                      ),
                  ],
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 10, 16, 12),
              child: BlButton(_isEditMode ? 'Save changes' : 'Log expense',
                  loading: _isLoading, onTap: _isLoading ? null : _submit),
            ),
          ],
        ),
      ),
    );
  }
}

/// The amount as the field shows it: up to two decimals, no trailing zeros,
/// so an edit opens on 150.5 rather than rounding it to 151.
String expenseAmountText(double amount) {
  final fixed = amount.toStringAsFixed(2);
  return fixed.replaceFirst(RegExp(r'\.?0+$'), '');
}

/// Keeps the amount field to a figure `double.tryParse` reads as entered:
/// at most nine rupee digits, one dot and two paise digits. An edit that
/// breaks the shape is dropped and the previous text stays.
class ExpenseAmountFormatter extends TextInputFormatter {
  const ExpenseAmountFormatter();

  static final _shape = RegExp(r'^\d{0,9}(\.\d{0,2})?$');

  @override
  TextEditingValue formatEditUpdate(
      TextEditingValue oldValue, TextEditingValue newValue) {
    return _shape.hasMatch(newValue.text) ? newValue : oldValue;
  }
}

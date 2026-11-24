import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile_app/core/supabase/client.dart';
import 'package:mobile_app/features/invoices/data/models/invoice.dart';
import 'package:mobile_app/features/invoices/presentation/invoice_detail_screen.dart';
import 'package:mobile_app/features/sales/presentation/add_sale_screen.dart';
import 'package:mobile_app/core/theme/dimens.dart';
import 'package:mobile_app/core/widgets/app_button.dart';
import 'package:mobile_app/core/utils/money.dart';
import 'package:mobile_app/features/dashboard/presentation/widgets/dash_common.dart';

// ─── Provider — reads from `invoices` table (same as web Invoices.jsx) ────────
final invoicesProvider = FutureProvider<List<Invoice>>((ref) async {
  // Match the web Invoices.jsx sort exactly: invoice_date desc with
  // created_at desc as a stable tiebreaker for same-day rows. The web
  // list sorts in JS by new Date(b.invoice_date) - new Date(a.invoice_date)
  // (see src/pages/Invoices.jsx:185) so the phone has to use the same
  // key or the two surfaces show invoices in different orders even
  // though they read the same rows.
  // invoice_date desc, then invoice_number desc — same key the web
  // Invoices page now uses (see src/pages/Invoices.jsx). created_at
  // can't be the tiebreaker because bulk-backfilled rows share an
  // identical microsecond timestamp, which made the visible order
  // diverge between phone and browser even on the same data.
  final response = await supabase
      .from('invoices')
      .select().isFilter('deleted_at', null)
      .order('invoice_date', ascending: false)
      .order('invoice_number', ascending: false)
      .limit(500);
  return (response as List).map((d) => Invoice.fromJson(d)).toList();
});

// ─── Status logic — matches web resolveStatus() ───────────────────────────────
// Web: PAID → PARTIAL → OVERDUE (if due_date < today) → UNPAID
enum _InvoiceStatus { paid, partial, overdue, pending }

_InvoiceStatus _statusOf(Invoice inv) {
  final s = inv.paymentStatus;
  if (s == 'PAID') return _InvoiceStatus.paid;
  if (s == 'PARTIAL') return _InvoiceStatus.partial;
  // Use due_date for overdue — NOT invoice_date (that was the bug)
  if (inv.dueDate != null) {
    try {
      final due = DateTime.parse(inv.dueDate!);
      if (due.isBefore(DateTime.now())) return _InvoiceStatus.overdue;
    } catch (_) {}
  }
  return _InvoiceStatus.pending;
}

// ─── Screen ───────────────────────────────────────────────────────────────────
class InvoicesScreen extends ConsumerStatefulWidget {
  const InvoicesScreen({super.key});

  @override
  ConsumerState<InvoicesScreen> createState() => _InvoicesScreenState();
}

class _InvoicesScreenState extends ConsumerState<InvoicesScreen> {
  int _filterIndex = 0; // 0=All 1=Pending 2=Overdue 3=Partial 4=Paid
  final _searchController = TextEditingController();
  String _query = '';
  DateTimeRange? _dateRange;

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _pickDateRange() async {
    final picked = await showDateRangePicker(
      context: context,
      firstDate: DateTime(2020),
      lastDate: DateTime.now().add(const Duration(days: 1)),
      initialDateRange: _dateRange,
    );
    if (picked != null && mounted) setState(() => _dateRange = picked);
  }

  // Laid out to the approved board "Invoices" (sales-12).
  @override
  Widget build(BuildContext context) {
    final invoicesAsync = ref.watch(invoicesProvider);
    final filters = ['All', 'Pending', 'Overdue', 'Partial', 'Paid'];
    final now = DateTime.now();
    final monthStart = DateTime(now.year, now.month, 1);
    final bottomInset = MediaQuery.of(context).padding.bottom;

    return Scaffold(
      backgroundColor: DashColors.card,
      body: invoicesAsync.when(
        loading: () => const Center(
            child: CircularProgressIndicator(color: DashColors.amber)),
        error: (e, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Text(
                'Could not load invoices. Check your internet and try again.',
                textAlign: TextAlign.center,
                style: DashText.inter(13.5, c: DashColors.red)),
          ),
        ),
        data: (allInvoices) {
          // ── Stats — matching web logic ──────────────────────────────────────
          // Outstanding = sum of (grand_total - paid_amount) for unpaid invoices
          final unpaid =
              allInvoices.where((inv) => inv.paymentStatus != 'PAID').toList();
          final outstanding =
              unpaid.fold(0.0, (sum, inv) => sum + inv.outstanding);
          final unpaidCount = unpaid.length;
          final overdueCount = allInvoices
              .where((inv) => _statusOf(inv) == _InvoiceStatus.overdue)
              .length;

          // Collected this month = PAID invoices with invoice_date in current month
          final collectedThisMonth = allInvoices.where((inv) {
            if (inv.paymentStatus != 'PAID') return false;
            if (inv.invoiceDate == null) return false;
            try {
              final d = DateTime.parse(inv.invoiceDate!);
              return !d.isBefore(monthStart);
            } catch (_) { return false; }
          }).fold(0.0, (sum, inv) => sum + inv.grandTotal);

          // ── Filter ────────────────────────────────────────────────────────
          final filtered = allInvoices.where((inv) {
            final status = _statusOf(inv);
            final matchFilter = _filterIndex == 0 ||
                (_filterIndex == 1 && status == _InvoiceStatus.pending) ||
                (_filterIndex == 2 && status == _InvoiceStatus.overdue) ||
                (_filterIndex == 3 && status == _InvoiceStatus.partial) ||
                (_filterIndex == 4 && status == _InvoiceStatus.paid);
            final q = _query.toLowerCase();
            final matchSearch = q.isEmpty ||
                inv.displayClientName.toLowerCase().contains(q) ||
                inv.displayNumber.toLowerCase().contains(q) ||
                (inv.invoiceNumber ?? '').toLowerCase().contains(q);
            final matchDate = _dateRange == null ||
                _withinRange(
                  inv.invoiceDate ?? inv.createdAt?.toIso8601String().substring(0, 10),
                  _dateRange!,
                );
            return matchFilter && matchSearch && matchDate;
          }).toList();

          return Stack(
            children: [
              CustomScrollView(
                slivers: [
                  SliverToBoxAdapter(
                    child: SafeArea(
                      bottom: false,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          // ── Top bar ─────────────────────────────────────
                          Padding(
                            padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
                            child: Row(
                              children: [
                                if (Navigator.of(context).canPop())
                                  AppTappable(
                                    ripple: false,
                                    onTap: () => Navigator.pop(context),
                                    child: SizedBox(
                                      width: 44,
                                      height: 44,
                                      child: Center(
                                        child: Container(
                                          width: 40,
                                          height: 40,
                                          decoration: const BoxDecoration(
                                              color: _well,
                                              shape: BoxShape.circle),
                                          child: const Icon(
                                              LucideIcons.chevronLeft,
                                              size: 20,
                                              color: DashColors.ink),
                                        ),
                                      ),
                                    ),
                                  )
                                else
                                  const SizedBox(width: 44, height: 44),
                                Expanded(
                                  child: Text('Invoices',
                                      textAlign: TextAlign.center,
                                      style: DashText.tight(17,
                                          w: FontWeight.w600)),
                                ),
                                const SizedBox(width: 44),
                              ],
                            ),
                          ),

                          // ── Outstanding ─────────────────────────────────
                          Padding(
                            padding: const EdgeInsets.fromLTRB(18, 8, 18, 0),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text('Outstanding',
                                    style: DashText.inter(13,
                                        c: const Color(0xFF6E737A))),
                                const SizedBox(height: 6),
                                Text(Money.inr(outstanding),
                                    style: DashText.tight(36,
                                        ls: -0.04, h: 1.05)),
                                const SizedBox(height: 14),
                                Row(
                                  children: [
                                    Expanded(
                                        child: _MiniStat(
                                            value: '$unpaidCount',
                                            label: 'Unpaid')),
                                    const SizedBox(width: 10),
                                    Expanded(
                                        child: _MiniStat(
                                            value: '$overdueCount',
                                            label: 'Overdue',
                                            color: const Color(0xFFB91C1C))),
                                    const SizedBox(width: 10),
                                    Expanded(
                                        child: _MiniStat(
                                            value:
                                                Money.inr(collectedThisMonth),
                                            label: 'Collected this month',
                                            color: const Color(0xFF17663A))),
                                  ],
                                ),
                              ],
                            ),
                          ),

                          // ── Search + date ───────────────────────────────
                          Padding(
                            padding: const EdgeInsets.fromLTRB(16, 14, 16, 0),
                            child: Row(
                              children: [
                                Expanded(
                                  child: Container(
                                    height: 44,
                                    padding: const EdgeInsets.symmetric(
                                        horizontal: 14),
                                    decoration: BoxDecoration(
                                      color: _field,
                                      borderRadius: BorderRadius.circular(12),
                                    ),
                                    child: Row(
                                      children: [
                                        const Icon(LucideIcons.search,
                                            size: 16,
                                            color: Color(0xFF8A9099)),
                                        const SizedBox(width: 8),
                                        Expanded(
                                          child: TextField(
                                            controller: _searchController,
                                            onChanged: (v) =>
                                                setState(() => _query = v),
                                            style: DashText.tight(14.5,
                                                w: FontWeight.w500, ls: 0),
                                            cursorColor: DashColors.amber,
                                            decoration: InputDecoration(
                                              isCollapsed: true,
                                              hintText:
                                                  'Search name or invoice number',
                                              hintStyle: DashText.tight(14.5,
                                                  w: FontWeight.w500,
                                                  c: const Color(0xFF8A9099),
                                                  ls: 0),
                                              border: InputBorder.none,
                                              enabledBorder: InputBorder.none,
                                              focusedBorder: InputBorder.none,
                                              filled: false,
                                              contentPadding:
                                                  const EdgeInsets.symmetric(
                                                      vertical: 12),
                                            ),
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                                const SizedBox(width: 8),
                                AppTappable(
                                  ripple: false,
                                  onTap: _pickDateRange,
                                  child: Container(
                                    width: 44,
                                    height: 44,
                                    decoration: BoxDecoration(
                                      color: _dateRange != null
                                          ? DashColors.amberSoft
                                          : _field,
                                      borderRadius: BorderRadius.circular(12),
                                    ),
                                    child: Icon(LucideIcons.calendar,
                                        size: 17,
                                        color: _dateRange != null
                                            ? DashColors.amberDeep
                                            : const Color(0xFF30343A)),
                                  ),
                                ),
                              ],
                            ),
                          ),

                          // ── Filter pills ────────────────────────────────
                          SizedBox(
                            height: 40,
                            child: ListView.separated(
                              scrollDirection: Axis.horizontal,
                              padding:
                                  const EdgeInsets.fromLTRB(16, 10, 16, 0),
                              itemCount: filters.length,
                              separatorBuilder: (_, _) =>
                                  const SizedBox(width: 6),
                              itemBuilder: (ctx, i) {
                                final isActive = _filterIndex == i;
                                return AppTappable(
                                  ripple: false,
                                  onTap: () =>
                                      setState(() => _filterIndex = i),
                                  child: AnimatedContainer(
                                    duration: Motion.durationOf(context,
                                        const Duration(milliseconds: 180)),
                                    height: 30,
                                    alignment: Alignment.center,
                                    padding: const EdgeInsets.symmetric(
                                        horizontal: 12),
                                    decoration: BoxDecoration(
                                      color: isActive
                                          ? DashColors.ink
                                          : DashColors.card,
                                      borderRadius: BorderRadius.circular(999),
                                      border: Border.all(
                                          color: isActive
                                              ? DashColors.ink
                                              : const Color(0xFFE1E0DE)),
                                    ),
                                    child: Text(
                                      filters[i],
                                      style: DashText.tight(12.5,
                                          w: FontWeight.w600,
                                          c: isActive
                                              ? Colors.white
                                              : const Color(0xFF30343A),
                                          ls: 0),
                                    ),
                                  ),
                                );
                              },
                            ),
                          ),

                          // ── Date range chip ─────────────────────────────
                          if (_dateRange != null)
                            Padding(
                              padding:
                                  const EdgeInsets.fromLTRB(16, 10, 16, 0),
                              child: AppTappable(
                                ripple: false,
                                onTap: () => setState(() => _dateRange = null),
                                child: Container(
                                  height: 30,
                                  padding: const EdgeInsets.symmetric(
                                      horizontal: 12),
                                  decoration: BoxDecoration(
                                    color: DashColors.amberSoft,
                                    borderRadius: BorderRadius.circular(999),
                                  ),
                                  child: Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      Text(
                                        '${_fmtDate(_dateRange!.start.toIso8601String().substring(0, 10))} to ${_fmtDate(_dateRange!.end.toIso8601String().substring(0, 10))}',
                                        style: DashText.tight(12.5,
                                            w: FontWeight.w600,
                                            c: DashColors.amberDeep,
                                            ls: 0),
                                      ),
                                      const SizedBox(width: 6),
                                      const Icon(LucideIcons.x,
                                          size: 13,
                                          color: DashColors.amberDeep),
                                    ],
                                  ),
                                ),
                              ),
                            ),

                          // ── Section label ───────────────────────────────
                          Padding(
                            padding: const EdgeInsets.fromLTRB(18, 16, 18, 4),
                            child: Row(
                              mainAxisAlignment:
                                  MainAxisAlignment.spaceBetween,
                              children: [
                                Text('RECENT INVOICES', style: _eyebrow),
                                Text('${filtered.length}', style: _eyebrow),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),

                  // ── Invoice list (lazy) ───────────────────────────────────
                  filtered.isEmpty
                      ? SliverToBoxAdapter(
                          child: Padding(
                            padding: const EdgeInsets.all(40),
                            child: Center(
                              child: Text('No invoices found.',
                                  style: DashText.inter(13.5)),
                            ),
                          ),
                        )
                      : SliverPadding(
                          padding:
                              EdgeInsets.only(bottom: 96 + bottomInset),
                          sliver: SliverList(
                            delegate: SliverChildBuilderDelegate(
                              (context, i) => AppTappable(
                                ripple: false,
                                onTap: () => Navigator.push(
                                  context,
                                  MaterialPageRoute(
                                    builder: (_) => InvoiceDetailScreen(
                                      invoice: filtered[i],
                                    ),
                                  ),
                                ),
                                child: _InvoiceRow(invoice: filtered[i]),
                              ),
                              childCount: filtered.length,
                            ),
                          ),
                        ),
                ],
              ),

              // ── New sale ──────────────────────────────────────────────────
              Positioned(
                left: 0,
                right: 0,
                bottom: 0,
                child: Container(
                  padding:
                      EdgeInsets.fromLTRB(16, 10, 16, 18 + bottomInset),
                  decoration: const BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [Color(0x00FFFFFF), Color(0xFFFFFFFF)],
                      stops: [0, 0.35],
                    ),
                  ),
                  child: AppTappable(
                    ripple: false,
                    onTap: () => Navigator.push(
                      context,
                      MaterialPageRoute(builder: (_) => const AddSaleScreen()),
                    ).then((_) => ref.invalidate(invoicesProvider)),
                    child: Container(
                      height: 52,
                      decoration: BoxDecoration(
                        color: DashColors.amber,
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          const Icon(LucideIcons.plus,
                              size: 18, color: Colors.white),
                          const SizedBox(width: 8),
                          Text('New sale',
                              style: DashText.tight(15.5, c: Colors.white)),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  bool _withinRange(String? iso, DateTimeRange r) {
    if (iso == null || iso.isEmpty) return false;
    try {
      final d = DateTime.parse(iso);
      return !d.isBefore(r.start) && !d.isAfter(r.end.add(const Duration(days: 1)));
    } catch (_) { return false; }
  }

}

const _well = Color(0xFFF1F1F1);
const _field = Color(0xFFF4F4F3);
final _eyebrow = DashText.tight(11,
    w: FontWeight.w600, c: const Color(0xFF8A9099), ls: 0.07);

/// One of the three small figures under Outstanding.
class _MiniStat extends StatelessWidget {
  final String value;
  final String label;
  final Color color;
  const _MiniStat(
      {required this.value, required this.label, this.color = DashColors.ink});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(value,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: DashText.tight(15, c: color, ls: 0)),
        const SizedBox(height: 1),
        Text(label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: DashText.inter(11.5, c: const Color(0xFF7A8088))),
      ],
    );
  }
}

// ─── Invoice row ──────────────────────────────────────────────────────────────
class _InvoiceRow extends StatelessWidget {
  final Invoice invoice;
  const _InvoiceRow({required this.invoice});

  static const _avatars = [
    Color(0xFFFFF3D6),
    Color(0xFFE4EEFF),
    Color(0xFFF3E8FF),
    Color(0xFFE3F5EA),
  ];

  static String _initials(String name) {
    final w = name.trim().split(RegExp(r'\s+')).where((s) => s.isNotEmpty).toList();
    if (w.isEmpty) return '?';
    if (w.length == 1) return w.first.characters.take(2).toString().toUpperCase();
    return (w[0].characters.first + w[1].characters.first).toUpperCase();
  }

  @override
  Widget build(BuildContext context) {
    final status = _statusOf(invoice);
    final name = invoice.displayClientName;
    var sum = 0;
    for (final u in name.codeUnits) {
      sum += u;
    }

    // Pill: grey = nothing to do yet, amber = part paid, red = late,
    // green = settled. A part-paid bill says how much is left.
    final (String label, Color ink, Color fill) = switch (status) {
      _InvoiceStatus.paid => ('Paid', const Color(0xFF17663A), const Color(0xFFE3F5EA)),
      _InvoiceStatus.pending => ('Pending', const Color(0xFF6E737A), const Color(0xFFEFEEEC)),
      _InvoiceStatus.partial => (
          '${Money.inr(invoice.outstanding)} left',
          const Color(0xFF8A5A00),
          const Color(0xFFFFF1C9)
        ),
      _InvoiceStatus.overdue => ('Overdue', const Color(0xFFB91C1C), const Color(0xFFFDE2E2)),
    };

    final meta = <String>[
      invoice.displayNumber,
      _fmtShort(invoice.invoiceDate),
      if (invoice.dueDate != null && status != _InvoiceStatus.paid)
        'due ${_fmtShort(invoice.dueDate)}',
    ].join(' · ');

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 11),
      decoration: const BoxDecoration(
        border: Border(bottom: BorderSide(color: Color(0xFFF0EFED))),
      ),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            alignment: Alignment.center,
            decoration: BoxDecoration(
                color: _avatars[sum % _avatars.length],
                shape: BoxShape.circle),
            child: Text(_initials(name),
                style: DashText.tight(13, c: const Color(0xFF30343A), ls: 0)),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: DashText.tight(14.5, w: FontWeight.w600)),
                const SizedBox(height: 1),
                Text(meta,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: DashText.inter(12,
                        w: FontWeight.w400, c: const Color(0xFF7A8088))),
              ],
            ),
          ),
          const SizedBox(width: 12),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(Money.inr(invoice.grandTotal),
                  style: DashText.tight(14.5, w: FontWeight.w600)),
              const SizedBox(height: 3),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(
                    color: fill, borderRadius: BorderRadius.circular(999)),
                child: Text(label,
                    style: DashText.tight(11,
                        w: FontWeight.w600, c: ink, ls: 0)),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// "21 Nov" for the list rows; the year is only noise there.
String _fmtShort(String? d) {
  if (d == null || d.isEmpty) return '-';
  try {
    final dt = DateTime.parse(d);
    const m = ['Jan','Feb','Mar','Apr','May','Jun',
                'Jul','Aug','Sep','Oct','Nov','Dec'];
    return '${dt.day} ${m[dt.month - 1]}';
  } catch (_) { return d; }
}

String _fmtDate(String? d) {
  if (d == null || d.isEmpty) return '-';
  try {
    final dt = DateTime.parse(d);
    const m = ['Jan','Feb','Mar','Apr','May','Jun',
                'Jul','Aug','Sep','Oct','Nov','Dec'];
    return '${dt.day} ${m[dt.month - 1]} ${dt.year}';
  } catch (_) { return d; }
}

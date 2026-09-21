import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile_app/core/supabase/client.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:mobile_app/features/invoices/data/models/invoice.dart';
import 'package:mobile_app/features/invoices/presentation/invoice_detail_screen.dart';
import 'package:mobile_app/features/sales/presentation/add_sale_screen.dart';
import 'package:mobile_app/core/theme/dimens.dart';
import 'package:mobile_app/core/widgets/app_button.dart';
import 'package:mobile_app/core/theme/typography.dart';
import 'package:mobile_app/core/utils/money.dart';
import 'package:mobile_app/core/widgets/app_surfaces.dart';

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
  bool _showSearch = false;
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

  @override
  Widget build(BuildContext context) {
    final invoicesAsync = ref.watch(invoicesProvider);
    final filters = ['All', 'Pending', 'Overdue', 'Partial', 'Paid'];
    final now = DateTime.now();
    final monthStart = DateTime(now.year, now.month, 1);

    return Scaffold(
      backgroundColor: AppColors.canvasWarm,
      appBar: AppBar(
        backgroundColor: AppColors.canvasWarm,
        elevation: 0,
        scrolledUnderElevation: 0,
        toolbarHeight: 0,
        actions: const [],
      ),
      floatingActionButton: FloatingActionButton(
        heroTag: null,
        onPressed: () => Navigator.push(
          context,
          MaterialPageRoute(builder: (_) => const AddSaleScreen()),
        ).then((_) => ref.invalidate(invoicesProvider)),
        backgroundColor: AppColors.brandFill,
        foregroundColor: AppColors.onBrandFill,
        elevation: 4,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
        child: const Icon(LucideIcons.plus, size: 26),
      ),
      body: invoicesAsync.when(
        loading: () => const Center(child: CircularProgressIndicator(color: AppColors.primary)),
        error: (e, _) => Center(child: Text('Could not load invoices. Check your internet and try again.', style: GoogleFonts.manrope(color: AppColors.danger))),
        data: (allInvoices) {
          // ── Stats — matching web logic ──────────────────────────────────────
          // Outstanding = sum of (grand_total - paid_amount) for unpaid invoices
          final unpaid =
              allInvoices.where((inv) => inv.paymentStatus != 'PAID').toList();
          final outstanding =
              unpaid.fold(0.0, (sum, inv) => sum + inv.outstanding);
          // "to collect" only restated the label above it. How MANY bills are
          // out is the thing the figure cannot tell you.
          final unpaidCount = unpaid.length;

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

          return CustomScrollView(
            slivers: [
              // ── Header ──────────────────────────────────────────────────────
              SliverToBoxAdapter(
                child: SafeArea(
                  bottom: false,
                  child: Padding(
                  padding: const EdgeInsets.fromLTRB(20, 12, 20, 0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text('Invoices', style: AppText.display),
                                Text(
                                  'Manage billing & collections',
                                  style: AppText.caption.copyWith(color: AppColors.inkTertiary),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(width: Gap.md),
                          // The date filter, which is what the artboard puts
                          // here. There is no "New invoice" pill any more:
                          // the FAB below already does that, and the screen
                          // was offering the same action twice.
                          AppTappable(
                            ripple: false,
                            onTap: _pickDateRange,
                            child: Container(
                              width: 40,
                              height: 40,
                              decoration: BoxDecoration(
                                color: AppColors.canvas,
                                shape: BoxShape.circle,
                                border: Border.all(
                                  color: _dateRange != null
                                      ? AppColors.primary
                                      : AppColors.outlineVariant,
                                ),
                              ),
                              child: Icon(
                                LucideIcons.calendar,
                                size: 16,
                                color: _dateRange != null
                                    ? AppColors.primary
                                    : AppColors.inkSecondary,
                              ),
                            ),
                          ),
                        ],
                      ),

                      const SizedBox(height: 20),

                      // ── Money ───────────────────────────────────────────────
                      //
                      // These were two peer figures wearing different clothes:
                      // one white card with a shadow, one dark-grey panel with a
                      // 72px watermark icon behind it. Same kind of number, two
                      // visual languages, so neither read as authoritative.
                      //
                      // Both now sit on the one dark surface money uses across
                      // the app, split by a hairline. Colour is spent on the two
                      // words that differ — to collect, and collected — not on
                      // the panels.
                      Container(
                        decoration: const BoxDecoration(
                          gradient: LinearGradient(
                            begin: Alignment.topLeft,
                            end: Alignment.bottomRight,
                            colors: [AppColors.surfaceInverse, AppColors.surfaceInverseDeep],
                          ),
                          borderRadius: Radii.rLg,
                        ),
                        child: IntrinsicHeight(
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              Expanded(
                                child: _InverseStat(
                                  label: 'OUTSTANDING',
                                  value: Money.inr(outstanding),
                                  note: unpaidCount == 1
                                      ? '1 unpaid'
                                      : '$unpaidCount unpaid',
                                  noteColor: AppColors.brandFill,
                                ),
                              ),
                              const VerticalDivider(
                                width: 1, thickness: 1, indent: 16, endIndent: 16,
                                color: AppColors.outlineInverse,
                              ),
                              Expanded(
                                child: _InverseStat(
                                  label: 'COLLECTED',
                                  value: Money.inr(collectedThisMonth),
                                  note: 'this month',
                                  noteColor: AppColors.successOnInverse,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),

                      const SizedBox(height: 24),

                      // ── Search bar ──────────────────────────────────────────
                      if (_showSearch)
                        Container(
                          margin: const EdgeInsets.only(bottom: 12),
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(16),
                            boxShadow: [AppColors.cardShadow],
                          ),
                          child: TextField(
                            controller: _searchController,
                            autofocus: true,
                            onChanged: (v) => setState(() => _query = v),
                            style: GoogleFonts.manrope(fontSize: 14, color: AppColors.inkPrimary),
                            decoration: InputDecoration(
                              hintText: 'Search by name or invoice number…',
                              hintStyle: GoogleFonts.manrope(fontSize: 14, color: AppColors.inkTertiary),
                              prefixIcon: const Icon(LucideIcons.search, size: 18, color: AppColors.inkTertiary),
                              suffixIcon: IconButton(
                                icon: const Icon(LucideIcons.x, size: 16, color: AppColors.inkTertiary),
                                onPressed: () => setState(() {
                                  _showSearch = false;
                                  _query = '';
                                  _searchController.clear();
                                }),
                              ),
                              border: InputBorder.none,
                              contentPadding: const EdgeInsets.symmetric(vertical: 14),
                            ),
                          ),
                        ),

                      // ── Section header ──────────────────────────────────────
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              'RECENT INVOICES',
                              style: AppText.eyebrow,
                            ),
                          ),
                          IconButton(
                            onPressed: () => setState(() => _showSearch = !_showSearch),
                            icon: Icon(
                              LucideIcons.search,
                              size: 18,
                              color: _showSearch ? AppColors.primary : AppColors.inkTertiary,
                            ),
                            padding: EdgeInsets.zero,
                            constraints: const BoxConstraints(),
                          ),
                        ],
                      ),

                      const SizedBox(height: 12),

                      // ── Filter chips ────────────────────────────────────────
                      SizedBox(
                        height: 34,
                        child: ListView.separated(
                          scrollDirection: Axis.horizontal,
                          itemCount: filters.length,
                          separatorBuilder: (context2, i2) => const SizedBox(width: 8),
                          itemBuilder: (ctx, i) {
                            final isActive = _filterIndex == i;
                            return AppTappable(
   ripple: false,
                              onTap: () => setState(() => _filterIndex = i),
                              // Selected is a dark FILL, not a pale tint: a
                              // shadow on a chip claims it floats, and the
                              // tinted version leaned on colour alone to say
                              // which one was on.
                              child: AnimatedContainer(
                                duration: Motion.durationOf(context, const Duration(milliseconds: 180)),
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 13, vertical: 7),
                                decoration: BoxDecoration(
                                  color: isActive
                                      ? AppColors.surfaceInverse
                                      : AppColors.canvas,
                                  borderRadius: BorderRadius.circular(99),
                                  border: Border.all(
                                    color: isActive
                                        ? AppColors.surfaceInverse
                                        : AppColors.outlineVariant,
                                  ),
                                ),
                                child: Text(
                                  filters[i],
                                  style: AppText.label.copyWith(
                                    color: isActive
                                        ? AppColors.onSurfaceInverse
                                        : AppColors.inkSecondary,
                                  ),
                                ),
                              ),
 );
                          },
                        ),
                      ),

                      const SizedBox(height: 16),

                      // ── Date range chip ─────────────────────────────────────
                      if (_dateRange != null)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 12),
                          child: Row(
                            children: [
                              AppTappable(
                                ripple: false,
                                onTap: () => setState(() => _dateRange = null),
                                child: AnimatedContainer(
                                  duration: Motion.durationOf(context, const Duration(milliseconds: 180)),
                                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                                  decoration: BoxDecoration(
                                    color: AppColors.primaryContainer,
                                    borderRadius: BorderRadius.circular(99),
                                    boxShadow: [AppColors.cardShadow],
                                  ),
                                  child: Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      Icon(LucideIcons.calendar, size: 12, color: AppColors.primary),
                                      const SizedBox(width: 5),
                                      Text(
                                        '${_fmtDate(_dateRange!.start.toIso8601String().substring(0, 10))} – ${_fmtDate(_dateRange!.end.toIso8601String().substring(0, 10))}',
                                        style: AppText.label.copyWith(color: AppColors.primary),
                                      ),
                                      const SizedBox(width: 6),
                                      Icon(LucideIcons.x, size: 12, color: AppColors.primary),
                                    ],
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                    ],
                  ),
                ),
                ),
              ),

              // ── Invoice list ──────────────────────────────────────────────
              filtered.isEmpty
                  ? SliverToBoxAdapter(
                      child: Padding(
                        padding: const EdgeInsets.all(40),
                        child: Center(
                          child: Text(
                            'No invoices found.',
                            style: GoogleFonts.manrope(color: AppColors.inkTertiary),
                          ),
                        ),
                      ),
                    )
                  // ONE card holding hairline-separated rows, not a card per
                  // invoice. Twelve shadowed cards read as twelve unrelated
                  // objects; a list of like things is a list.
                  : SliverPadding(
                      padding: const EdgeInsets.fromLTRB(Gap.xl, 0, Gap.xl, 100),
                      sliver: SliverToBoxAdapter(
                        child: AppCard(
                          padding: const EdgeInsets.symmetric(
                              horizontal: Gap.lg),
                          child: Column(
                            children: [
                              for (int i = 0; i < filtered.length; i++)
                                AppTappable(
                                  ripple: false,
                                  onTap: () => Navigator.push(
                                    context,
                                    MaterialPageRoute(
                                      builder: (_) => InvoiceDetailScreen(
                                        invoice: filtered[i],
                                      ),
                                    ),
                                  ),
                                  child: _InvoiceRow(
                                    invoice: filtered[i],
                                    showDivider: i < filtered.length - 1,
                                  ),
                                ),
                            ],
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

// ─── Invoice Card ─────────────────────────────────────────────────────────────
class _InvoiceRow extends StatelessWidget {
  final Invoice invoice;
  final bool showDivider;
  const _InvoiceRow({required this.invoice, required this.showDivider});

  /// Colour carries the state, and only where the state is an obligation.
  /// Paid and pending are both "nothing to do right now" and stay ink; only
  /// overdue and partly-paid are asking the shop for something.
  static (String, Color) _status(_InvoiceStatus s) => switch (s) {
    _InvoiceStatus.paid => ('Paid', AppColors.inkTertiary),
    _InvoiceStatus.pending => ('Pending', AppColors.inkTertiary),
    _InvoiceStatus.partial => ('Partial', AppColors.warning),
    _InvoiceStatus.overdue => ('Overdue', AppColors.danger),
  };

  @override
  Widget build(BuildContext context) {
    final status = _statusOf(invoice);
    final (label, tint) = _status(status);

    // Everything the card used to spread over two rows and an avatar, in one
    // meta line. Nothing is dropped -- the number, the date, the due date and
    // the balance still outstanding are all still here.
    final meta = <String>[
      invoice.displayNumber,
      _fmtDate(invoice.invoiceDate),
      if (invoice.dueDate != null && status != _InvoiceStatus.paid)
        'due ${_fmtDate(invoice.dueDate)}',
      if (invoice.paidAmount > 0 && status != _InvoiceStatus.paid)
        '${Money.inr(invoice.outstanding)} left',
    ].join(' · ');

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(vertical: Gap.md),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      invoice.displayClientName,
                      style: AppText.bodyStrong,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 2),
                    Text(
                      meta,
                      style: AppText.caption,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
              Gap.w12,
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  // Money.inr: this row printed ₹48210.00 where the rest of
                  // the app prints ₹48,210.
                  Text(Money.inr(invoice.grandTotal), style: AppText.money),
                  const SizedBox(height: 3),
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Container(
                        width: 6,
                        height: 6,
                        decoration: BoxDecoration(
                            color: tint, shape: BoxShape.circle),
                      ),
                      Gap.w4,
                      Text(label,
                          style: AppText.caption.copyWith(color: tint)),
                    ],
                  ),
                ],
              ),
            ],
          ),
        ),
        if (showDivider)
          const Divider(
              height: 1, thickness: 1, color: AppColors.outlineVariant),
      ],
    );
  }
}

String _fmtDate(String? d) {
  if (d == null || d.isEmpty) return '—';
  try {
    final dt = DateTime.parse(d);
    const m = ['Jan','Feb','Mar','Apr','May','Jun',
                'Jul','Aug','Sep','Oct','Nov','Dec'];
    return '${dt.day} ${m[dt.month - 1]} ${dt.year}';
  } catch (_) { return d; }
}


/// One half of the dark money header — a label, a figure, and one coloured
/// word saying what kind of figure it is.
///
/// Contrast on [AppColors.surfaceInverse]: the value is white at 14.85:1, the
/// label is the muted ink at 5.18:1, and the note colours are 6.59:1 (brand)
/// and 8.52:1 (green). All measured, all past AA.
class _InverseStat extends StatelessWidget {
  final String label;
  final String value;
  final String note;
  final Color noteColor;

  const _InverseStat({
    required this.label,
    required this.value,
    required this.note,
    required this.noteColor,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: Gap.lg, vertical: Gap.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(label,
              style: AppText.label.copyWith(
                color: AppColors.onSurfaceInverseMuted,
                letterSpacing: 0.6,
              ),
              maxLines: 1, overflow: TextOverflow.ellipsis),
          const SizedBox(height: Gap.sm),
          Text(value,
              style: AppText.title.copyWith(
                color: AppColors.onSurfaceInverse,
                fontWeight: FontWeight.w800,
                letterSpacing: -0.5,
              ),
              maxLines: 1, overflow: TextOverflow.ellipsis),
          const SizedBox(height: 2),
          Text(note, style: AppText.caption.copyWith(color: noteColor)),
        ],
      ),
    );
  }
}

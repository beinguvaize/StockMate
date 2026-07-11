import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile_app/core/supabase/client.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:mobile_app/features/invoices/data/models/invoice.dart';
import 'package:mobile_app/features/invoices/presentation/invoice_detail_screen.dart';
import 'package:mobile_app/features/sales/presentation/add_sale_screen.dart';

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

  @override
  Widget build(BuildContext context) {
    final invoicesAsync = ref.watch(invoicesProvider);
    final filters = ['All', 'Pending', 'Overdue', 'Partial', 'Paid'];
    final now = DateTime.now();
    final monthStart = DateTime(now.year, now.month, 1);

    return Scaffold(
      backgroundColor: AppColors.canvas,
      appBar: AppBar(
        backgroundColor: AppColors.canvas,
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
        backgroundColor: AppColors.secondary,
        foregroundColor: AppColors.primaryContainer,
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
          final outstanding = allInvoices
              .where((inv) => inv.paymentStatus != 'PAID')
              .fold(0.0, (sum, inv) => sum + inv.outstanding);

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
                                Text(
                                  'Invoices',
                                  style: GoogleFonts.manrope(
                                    fontSize: 26,
                                    fontWeight: FontWeight.w700,
                                    color: AppColors.inkPrimary,
                                    letterSpacing: -0.3,
                                  ),
                                ),
                                Text(
                                  'Manage billing & collections',
                                  style: GoogleFonts.manrope(
                                    fontSize: 12,
                                    color: AppColors.inkTertiary,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(width: 8),
                          GestureDetector(
                            onTap: () => Navigator.push(
                              context,
                              MaterialPageRoute(builder: (_) => const AddSaleScreen()),
                            ).then((_) => ref.invalidate(invoicesProvider)),
                            child: Container(
                              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
                              decoration: BoxDecoration(
                                color: AppColors.primaryContainer,
                                borderRadius: BorderRadius.circular(100),
                              ),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  const Icon(LucideIcons.plus, size: 14, color: AppColors.primary),
                                  const SizedBox(width: 5),
                                  Text(
                                    'New Invoice',
                                    style: GoogleFonts.manrope(
                                      fontSize: 13,
                                      fontWeight: FontWeight.w700,
                                      color: AppColors.primary,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ],
                      ),

                      const SizedBox(height: 20),

                      // ── Stats cards ─────────────────────────────────────────
                      Row(
                        children: [
                          // Outstanding
                          Expanded(
                            child: Container(
                              padding: const EdgeInsets.all(20),
                              decoration: BoxDecoration(
                                color: Colors.white,
                                borderRadius: BorderRadius.circular(20),
                                boxShadow: [AppColors.cardShadow],
                              ),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    'OUTSTANDING',
                                    style: GoogleFonts.jetBrainsMono(
                                      fontSize: 9,
                                      fontWeight: FontWeight.w700,
                                      color: AppColors.inkTertiary,
                                      letterSpacing: 1,
                                    ),
                                  ),
                                  const SizedBox(height: 8),
                                  Text(
                                    '₹${_formatAmount(outstanding)}',
                                    style: GoogleFonts.manrope(
                                      fontSize: 22,
                                      fontWeight: FontWeight.w800,
                                      color: AppColors.danger,
                                      letterSpacing: -0.5,
                                    ),
                                  ),
                                  const SizedBox(height: 4),
                                  Row(
                                    children: [
                                      const Icon(LucideIcons.trendingUp, size: 12, color: AppColors.danger),
                                      const SizedBox(width: 4),
                                      Text(
                                        'To collect',
                                        style: GoogleFonts.manrope(
                                          fontSize: 11,
                                          color: AppColors.inkTertiary,
                                        ),
                                      ),
                                    ],
                                  ),
                                ],
                              ),
                            ),
                          ),

                          const SizedBox(width: 12),

                          // Collected this month
                          Expanded(
                            flex: 2,
                            child: Container(
                              padding: const EdgeInsets.all(20),
                              decoration: BoxDecoration(
                                color: AppColors.secondary,
                                borderRadius: BorderRadius.circular(20),
                              ),
                              child: Stack(
                                children: [
                                  Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        'COLLECTED THIS MONTH',
                                        style: GoogleFonts.jetBrainsMono(
                                          fontSize: 9,
                                          fontWeight: FontWeight.w700,
                                          color: AppColors.secondaryContainer.withValues(alpha: 0.7),
                                          letterSpacing: 1,
                                        ),
                                      ),
                                      const SizedBox(height: 8),
                                      Text(
                                        '₹${_formatAmount(collectedThisMonth)}',
                                        style: GoogleFonts.manrope(
                                          fontSize: 26,
                                          fontWeight: FontWeight.w800,
                                          color: AppColors.primaryContainer,
                                          letterSpacing: -0.5,
                                        ),
                                      ),
                                    ],
                                  ),
                                  Positioned(
                                    right: -10,
                                    bottom: -16,
                                    child: Icon(
                                      LucideIcons.receipt,
                                      size: 72,
                                      color: Colors.white.withValues(alpha: 0.08),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ],
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
                              'Recent Invoices',
                              style: GoogleFonts.manrope(
                                fontSize: 17,
                                fontWeight: FontWeight.w700,
                                color: AppColors.inkPrimary,
                              ),
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
                          const SizedBox(width: 4),
                          IconButton(
                            onPressed: () async {
                              final picked = await showDateRangePicker(
                                context: context,
                                firstDate: DateTime(2020),
                                lastDate: DateTime.now().add(const Duration(days: 1)),
                                initialDateRange: _dateRange,
                              );
                              if (picked != null) setState(() => _dateRange = picked);
                            },
                            icon: Icon(
                              LucideIcons.calendar,
                              size: 18,
                              color: _dateRange != null ? AppColors.primary : AppColors.inkTertiary,
                            ),
                            padding: EdgeInsets.zero,
                            constraints: const BoxConstraints(),
                            tooltip: 'Filter by date',
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
                            return GestureDetector(
                              onTap: () => setState(() => _filterIndex = i),
                              child: AnimatedContainer(
                                duration: const Duration(milliseconds: 180),
                                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                                decoration: BoxDecoration(
                                  color: isActive ? AppColors.primaryContainer : Colors.white,
                                  borderRadius: BorderRadius.circular(99),
                                  boxShadow: [AppColors.cardShadow],
                                ),
                                child: Text(
                                  filters[i],
                                  style: GoogleFonts.manrope(
                                    fontSize: 12,
                                    fontWeight: FontWeight.w600,
                                    color: isActive ? AppColors.primary : AppColors.inkTertiary,
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
                              GestureDetector(
                                onTap: () => setState(() => _dateRange = null),
                                child: AnimatedContainer(
                                  duration: const Duration(milliseconds: 180),
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
                                        style: GoogleFonts.manrope(
                                          fontSize: 12,
                                          fontWeight: FontWeight.w600,
                                          color: AppColors.primary,
                                        ),
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
                  : SliverList(
                      delegate: SliverChildBuilderDelegate(
                        (context, index) {
                          final inv = filtered[index];
                          return Padding(
                            padding: EdgeInsets.fromLTRB(
                                24, 0, 24, index == filtered.length - 1 ? 100 : 12),
                            child: GestureDetector(
                              onTap: () => Navigator.push(
                                context,
                                MaterialPageRoute(
                                  builder: (_) => InvoiceDetailScreen(
                                    invoice: inv,
                                  ),
                                ),
                              ),
                              child: _InvoiceCard(invoice: inv),
                            ),
                          );
                        },
                        childCount: filtered.length,
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

  String _formatAmount(double v) {
    final whole = v.round();
    final s = whole.abs().toString();
    final grouped = s.length <= 3
        ? s
        : '${s.substring(0, s.length - 3).replaceAllMapped(RegExp(r'(\d)(?=(\d{2})+$)'), (m) => '${m[1]},')},${s.substring(s.length - 3)}';
    return '${whole < 0 ? '-' : ''}$grouped';
  }
}

// ─── Invoice Card ─────────────────────────────────────────────────────────────
class _InvoiceCard extends StatelessWidget {
  final Invoice invoice;
  const _InvoiceCard({required this.invoice});

  @override
  Widget build(BuildContext context) {
    final status = _statusOf(invoice);
    final customerName = invoice.displayClientName;
    final initial = customerName.isNotEmpty ? customerName[0].toUpperCase() : 'I';
    final isOverdue = status == _InvoiceStatus.overdue;

    Color avatarBg;
    Color avatarFg;
    Color badgeBg;
    Color badgeFg;
    String badgeLabel;

    switch (status) {
      case _InvoiceStatus.paid:
        avatarBg = AppColors.primaryContainer.withValues(alpha: 0.5);
        avatarFg = AppColors.primary;
        badgeBg = AppColors.surfaceContainer;
        badgeFg = AppColors.inkTertiary;
        badgeLabel = 'Paid';
      case _InvoiceStatus.partial:
        avatarBg = AppColors.warning.withValues(alpha: 0.15);
        avatarFg = AppColors.warning;
        badgeBg = AppColors.warning.withValues(alpha: 0.12);
        badgeFg = AppColors.warning;
        badgeLabel = 'Partial';
      case _InvoiceStatus.overdue:
        avatarBg = AppColors.danger.withValues(alpha: 0.1);
        avatarFg = AppColors.danger;
        badgeBg = AppColors.danger.withValues(alpha: 0.1);
        badgeFg = AppColors.danger;
        badgeLabel = 'Overdue';
      case _InvoiceStatus.pending:
        avatarBg = AppColors.secondaryContainer;
        avatarFg = AppColors.secondary;
        badgeBg = AppColors.secondaryContainer;
        badgeFg = AppColors.secondary;
        badgeLabel = 'Pending';
    }

    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        boxShadow: [AppColors.cardShadow],
        border: isOverdue
            ? const Border(left: BorderSide(color: AppColors.danger, width: 4))
            : null,
      ),
      child: Padding(
        padding: EdgeInsets.fromLTRB(isOverdue ? 14 : 16, 16, 16, 16),
        child: Column(
          children: [
            // Top row
            Row(
              children: [
                // Avatar
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(color: avatarBg, shape: BoxShape.circle),
                  child: Center(
                    child: Text(
                      initial,
                      style: GoogleFonts.manrope(
                        fontSize: 18,
                        fontWeight: FontWeight.w800,
                        color: avatarFg,
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 12),

                // Name + invoice number
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        customerName,
                        style: GoogleFonts.manrope(
                          fontSize: 15,
                          fontWeight: FontWeight.w700,
                          color: AppColors.inkPrimary,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      Text(
                        invoice.displayNumber,
                        style: GoogleFonts.jetBrainsMono(
                          fontSize: 11,
                          color: AppColors.inkTertiary,
                        ),
                      ),
                    ],
                  ),
                ),

                // Amount + badge
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(
                      '₹${invoice.grandTotal.toStringAsFixed(2)}',
                      style: GoogleFonts.manrope(
                        fontSize: 15,
                        fontWeight: FontWeight.w800,
                        color: AppColors.inkPrimary,
                        letterSpacing: -0.5,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: badgeBg,
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(
                        badgeLabel,
                        style: GoogleFonts.jetBrainsMono(
                          fontSize: 9,
                          fontWeight: FontWeight.w700,
                          color: badgeFg,
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),

            const SizedBox(height: 10),

            // Bottom row: date + due date + outstanding
            Row(
              children: [
                Icon(LucideIcons.calendar, size: 11, color: AppColors.inkTertiary),
                const SizedBox(width: 4),
                Text(
                  _fmtDate(invoice.invoiceDate),
                  style: GoogleFonts.manrope(fontSize: 11, color: AppColors.inkTertiary),
                ),
                if (invoice.dueDate != null && status != _InvoiceStatus.paid) ...[
                  const SizedBox(width: 10),
                  Icon(
                    LucideIcons.clock,
                    size: 11,
                    color: isOverdue ? AppColors.danger : AppColors.inkTertiary,
                  ),
                  const SizedBox(width: 4),
                  Text(
                    'Due ${_fmtDate(invoice.dueDate)}',
                    style: GoogleFonts.manrope(
                      fontSize: 11,
                      color: isOverdue ? AppColors.danger : AppColors.inkTertiary,
                      fontWeight: isOverdue ? FontWeight.w600 : FontWeight.normal,
                    ),
                  ),
                ],
                const Spacer(),
                // Partial payment indicator
                if (invoice.paidAmount > 0 && status != _InvoiceStatus.paid)
                  Text(
                    'Paid ₹${invoice.paidAmount.toStringAsFixed(0)} · Due ₹${invoice.outstanding.toStringAsFixed(0)}',
                    style: GoogleFonts.manrope(
                      fontSize: 10,
                      color: AppColors.warning,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                const Icon(LucideIcons.chevronRight, size: 14, color: AppColors.inkTertiary),
              ],
            ),
          ],
        ),
      ),
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

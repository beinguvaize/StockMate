import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_app/core/design/bl_widgets.dart';
import 'package:mobile_app/core/supabase/client.dart';
import 'package:mobile_app/features/invoices/data/models/invoice.dart';
import 'package:mobile_app/features/invoices/presentation/invoice_detail_screen.dart';
import 'package:mobile_app/features/sales/presentation/add_sale_screen.dart';
import 'package:mobile_app/core/utils/money.dart';

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

  @override
  Widget build(BuildContext context) {
    final invoicesAsync = ref.watch(invoicesProvider);
    const filters = ['All', 'Pending', 'Overdue', 'Partial', 'Paid'];
    final now = DateTime.now();
    final monthStart = DateTime(now.year, now.month, 1);

    return Scaffold(
      backgroundColor: Bl.white,
      body: SafeArea(
        child: Column(
          children: [
            const BlBackHeader(title: 'Invoices'),
            Expanded(
              child: invoicesAsync.when(
                loading: () => const Center(
                    child: CircularProgressIndicator(
                        color: Bl.amber, strokeWidth: 2)),
                error: (e, _) => Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Text(
                        'Could not load invoices. Check your internet and try again.',
                        textAlign: TextAlign.center,
                        style: Bl.inter(13.5, c: Bl.redDeep, h: 1.5)),
                  ),
                ),
                data: (allInvoices) {
                  final unpaid = allInvoices
                      .where((inv) => inv.paymentStatus != 'PAID')
                      .toList();
                  final outstanding =
                      unpaid.fold(0.0, (sum, inv) => sum + inv.outstanding);
                  final overdue = unpaid
                      .where((inv) => _statusOf(inv) == _InvoiceStatus.overdue)
                      .length;
                  final collectedThisMonth = allInvoices.where((inv) {
                    if (inv.paymentStatus != 'PAID') return false;
                    if (inv.invoiceDate == null) return false;
                    try {
                      final d = DateTime.parse(inv.invoiceDate!);
                      return !d.isBefore(monthStart);
                    } catch (_) {
                      return false;
                    }
                  }).fold(0.0, (sum, inv) => sum + inv.grandTotal);

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
                          inv.invoiceDate ??
                              inv.createdAt?.toIso8601String().substring(0, 10),
                          _dateRange!,
                        );
                    return matchFilter && matchSearch && matchDate;
                  }).toList();

                  Widget stat(String value, String label, Color c) => Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(value,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: Bl.tight(15, w: FontWeight.w700, c: c)),
                            const SizedBox(height: 1),
                            Text(label,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: Bl.inter(11.5,
                                    w: FontWeight.w500,
                                    c: const Color(0xFF7A8088))),
                          ],
                        ),
                      );

                  final head = <Widget>[
                    Padding(
                      padding: const EdgeInsets.fromLTRB(18, 8, 18, 0),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Outstanding',
                              style: Bl.inter(13, w: FontWeight.w500)),
                          const SizedBox(height: 6),
                          Text(Money.inr(outstanding),
                              style: Bl.tight(36,
                                  w: FontWeight.w700, ls: -0.04, h: 1.05)),
                          const SizedBox(height: 14),
                          Row(
                            children: [
                              stat('${unpaid.length}', 'Unpaid', Bl.ink),
                              const SizedBox(width: 10),
                              stat('$overdue', 'Overdue',
                                  overdue > 0 ? Bl.redDeep : Bl.ink),
                              const SizedBox(width: 10),
                              stat(Money.inr(collectedThisMonth),
                                  'Collected this month',
                                  const Color(0xFF17663A)),
                            ],
                          ),
                        ],
                      ),
                    ),
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 14, 16, 0),
                      child: Row(
                        children: [
                          Expanded(
                            child: Container(
                              height: 44,
                              padding:
                                  const EdgeInsets.symmetric(horizontal: 14),
                              decoration: BoxDecoration(
                                  color: Bl.wellSoft,
                                  borderRadius: BorderRadius.circular(12)),
                              child: Row(
                                children: [
                                  const BlIcon(BlIcons.search,
                                      size: 16, color: Color(0xFFA8ADB4)),
                                  const SizedBox(width: 8),
                                  Expanded(
                                    child: TextField(
                                      controller: _searchController,
                                      onChanged: (v) =>
                                          setState(() => _query = v),
                                      cursorColor: Bl.brand,
                                      style: Bl.tight(14.5,
                                          w: FontWeight.w500, ls: 0),
                                      decoration: InputDecoration(
                                        isCollapsed: true,
                                        filled: false,
                                        border: InputBorder.none,
                                        enabledBorder: InputBorder.none,
                                        focusedBorder: InputBorder.none,
                                        hintText:
                                            'Search name or invoice number',
                                        hintStyle: Bl.tight(14.5,
                                            w: FontWeight.w500,
                                            ls: 0,
                                            c: const Color(0xFFA8ADB4)),
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                          BlTap(
                            label: 'Pick dates',
                            onTap: _pickDateRange,
                            child: Container(
                              width: 44,
                              height: 44,
                              alignment: Alignment.center,
                              decoration: BoxDecoration(
                                  color: _dateRange != null
                                      ? Bl.amberSoft
                                      : Bl.wellSoft,
                                  borderRadius: BorderRadius.circular(12)),
                              child: BlIcon(
                                  '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
                                  size: 17,
                                  color: _dateRange != null
                                      ? Bl.amberDeep
                                      : Bl.ink3),
                            ),
                          ),
                        ],
                      ),
                    ),
                    SizedBox(
                      height: 54,
                      child: ListView.separated(
                        scrollDirection: Axis.horizontal,
                        padding: const EdgeInsets.fromLTRB(16, 10, 16, 14),
                        itemCount: filters.length,
                        separatorBuilder: (_, _) => const SizedBox(width: 6),
                        itemBuilder: (_, i) {
                          final on = _filterIndex == i;
                          return Semantics(
                            button: true,
                            selected: on,
                            label: filters[i],
                            excludeSemantics: true,
                            child: BlTap(
                              onTap: () => setState(() => _filterIndex = i),
                              child: Container(
                                padding:
                                    const EdgeInsets.symmetric(horizontal: 12),
                                alignment: Alignment.center,
                                decoration: BoxDecoration(
                                  color: on ? Bl.ink : Colors.transparent,
                                  borderRadius: BorderRadius.circular(999),
                                  border: Border.all(
                                      color: on
                                          ? Bl.ink
                                          : const Color(0xFFE1E0DE)),
                                ),
                                child: Text(filters[i],
                                    style: Bl.tight(12.5,
                                        w: FontWeight.w600,
                                        ls: 0,
                                        c: on ? Bl.white : Bl.ink3)),
                              ),
                            ),
                          );
                        },
                      ),
                    ),
                    if (_dateRange != null)
                      Padding(
                        padding: const EdgeInsets.fromLTRB(16, 0, 16, 0),
                        child: Align(
                          alignment: Alignment.centerLeft,
                          child: BlTap(
                            label: 'Clear dates',
                            onTap: () => setState(() => _dateRange = null),
                            child: Container(
                              height: 30,
                              padding:
                                  const EdgeInsets.symmetric(horizontal: 12),
                              decoration: BoxDecoration(
                                  color: Bl.amberSoft,
                                  borderRadius: BorderRadius.circular(999)),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Text(
                                      '${_fmtDate(_dateRange!.start.toIso8601String().substring(0, 10))} – ${_fmtDate(_dateRange!.end.toIso8601String().substring(0, 10))}',
                                      style: Bl.tight(12,
                                          w: FontWeight.w600,
                                          ls: 0,
                                          c: Bl.amberDeep)),
                                  const SizedBox(width: 6),
                                  const BlIcon(BlIcons.close,
                                      size: 12, color: Bl.amberDeep),
                                ],
                              ),
                            ),
                          ),
                        ),
                      ),
                    Padding(
                      padding: const EdgeInsets.fromLTRB(18, 2, 18, 4),
                      child: Row(
                        children: [
                          Expanded(
                              child: Text('RECENT INVOICES',
                                  style: Bl.eyebrow)),
                          Text('${filtered.length}', style: Bl.eyebrow),
                        ],
                      ),
                    ),
                  ];

                  return ListView.builder(
                    padding: const EdgeInsets.only(bottom: 16),
                    itemCount: head.length + (filtered.isEmpty ? 1 : filtered.length),
                    itemBuilder: (context, i) {
                      if (i < head.length) return head[i];
                      if (filtered.isEmpty) {
                        return const BlEmpty(
                            icon: BlIcons.doc, title: 'No invoices found.');
                      }
                      final inv = filtered[i - head.length];
                      return BlTap(
                        onTap: () => Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (_) => InvoiceDetailScreen(invoice: inv),
                          ),
                        ),
                        child: _InvoiceRow(invoice: inv),
                      );
                    },
                  );
                },
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 8, 14, 14),
              child: BlButton(
                'New sale',
                leading: const BlIcon(BlIcons.plus, size: 16, color: Bl.white),
                onTap: () => Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => const AddSaleScreen()),
                ).then((_) => ref.invalidate(invoicesProvider)),
              ),
            ),
          ],
        ),
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
  const _InvoiceRow({required this.invoice});

  static const _tints = [
    Color(0xFFFFF3D6),
    Color(0xFFE4EEFF),
    Color(0xFFF3E8FF),
    Color(0xFFE3F5EA),
  ];

  @override
  Widget build(BuildContext context) {
    final status = _statusOf(invoice);
    final name = invoice.displayClientName;
    final (String label, Color fg, Color bg) = switch (status) {
      _InvoiceStatus.paid => (
          'Paid',
          const Color(0xFF17663A),
          const Color(0xFFE3F5EA)
        ),
      _InvoiceStatus.pending => (
          'Pending',
          const Color(0xFF6E737A),
          const Color(0xFFEFEEEC)
        ),
      _InvoiceStatus.partial => (
          '${Money.inr(invoice.outstanding)} left',
          const Color(0xFF8A5A00),
          const Color(0xFFFFF1C9)
        ),
      _InvoiceStatus.overdue => ('Overdue', Bl.redDeep, const Color(0xFFFDE2E2)),
    };
    final meta = <String>[
      invoice.displayNumber,
      _fmtShort(invoice.invoiceDate),
      if (invoice.dueDate != null && status != _InvoiceStatus.paid)
        'due ${_fmtShort(invoice.dueDate)}',
    ].join(' · ');
    final initials = BlPartyAvatar.initials(name);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 11),
      decoration: const BoxDecoration(
          border: Border(bottom: BorderSide(color: Bl.sep))),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            alignment: Alignment.center,
            decoration: BoxDecoration(
                color: _tints[name.hashCode.abs() % _tints.length],
                shape: BoxShape.circle),
            child: initials.isEmpty
                ? const BlIcon(BlIcons.person, size: 16, color: Bl.ink3)
                : Text(initials,
                    style:
                        Bl.tight(13, w: FontWeight.w700, ls: 0, c: Bl.ink3)),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Bl.tight(14.5, w: FontWeight.w600)),
                const SizedBox(height: 1),
                Text(meta,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Bl.inter(12, c: const Color(0xFF7A8088))),
              ],
            ),
          ),
          const SizedBox(width: 10),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(Money.inr(invoice.grandTotal),
                  style: Bl.tight(14.5, w: FontWeight.w600)),
              const SizedBox(height: 3),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(
                    color: bg, borderRadius: BorderRadius.circular(999)),
                child: Text(label,
                    style: Bl.tight(11, w: FontWeight.w600, ls: 0, c: fg)),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

const _mon = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/// "21 Nov" — the year is added only when it is not this year.
String _fmtShort(String? d) {
  if (d == null || d.isEmpty) return '—';
  try {
    final dt = DateTime.parse(d);
    final y = dt.year == DateTime.now().year ? '' : ' ${dt.year}';
    return '${dt.day} ${_mon[dt.month - 1]}$y';
  } catch (_) { return d; }
}

String _fmtDate(String? d) {
  if (d == null || d.isEmpty) return '—';
  try {
    final dt = DateTime.parse(d);
    return '${dt.day} ${_mon[dt.month - 1]} ${dt.year}';
  } catch (_) { return d; }
}

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/core/design/bl_widgets.dart';
import 'package:mobile_app/core/utils/money.dart';
import 'package:mobile_app/features/clients_suppliers/data/client_products.dart';
import 'package:mobile_app/features/clients_suppliers/data/models/client.dart';
import 'package:mobile_app/features/clients_suppliers/data/models/client_payment.dart';
import 'package:mobile_app/features/clients_suppliers/data/statement_credits.dart';
import 'package:mobile_app/features/clients_suppliers/data/statement_window.dart';
import 'package:mobile_app/features/clients_suppliers/presentation/client_settlement_screen.dart';
import 'package:mobile_app/features/clients_suppliers/presentation/providers/crm_provider.dart';
import 'package:mobile_app/features/clients_suppliers/presentation/statement_pdf_screen.dart';
import 'package:mobile_app/features/clients_suppliers/presentation/widgets/client_products_card.dart';
import 'package:mobile_app/features/inventory/presentation/providers/inventory_provider.dart';
import 'package:mobile_app/features/invoices/data/models/invoice.dart';
import 'package:mobile_app/features/invoices/presentation/invoice_detail_screen.dart';
import 'package:mobile_app/features/invoices/presentation/invoices_screen.dart';
import 'package:mobile_app/features/sales/presentation/providers/sales_provider.dart';
import 'package:mobile_app/features/settings/presentation/providers/settings_provider.dart';
import 'package:mobile_app/main.dart' show syncServiceProvider;

const _mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const _months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const _shareIcon = '<path d="M12 15V4M8 8l4-4 4 4M5 13v6h14v-6"/>';
const _calendarIcon =
    '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>';
const _greenDeep = Color(0xFF17663A);
const _grey = Color(0xFF7A8088);

// ─── Data model ───────────────────────────────────────────────────────────────
class _StatementRow {
  final String date;

  /// What the row is called on screen: "Bill INV-1041", "Payment received".
  final String title;

  /// Second line after the date on a payment: how it was paid, and any note.
  final String detail;

  /// The same row as one line of the printed statement.
  final String description;
  final double debit;   // money owed (sale or invoice)
  final double credit;  // money paid
  final String type;    // 'SALE' | 'INVOICE' | 'PAYMENT'
  double balance = 0;   // filled after sort

  /// The bill this row is about, so tapping it can open the thing itself
  /// rather than making the user go and find it in the invoice list. Null on
  /// payment rows — a receipt against the account is not a bill.
  ///
  /// Cash sales have no invoice record, so they are wrapped with
  /// Invoice.fromSale: one screen opens every bill, whichever way it was rung
  /// up, instead of two paths that drift apart.
  final Invoice? bill;

  /// The receipt this row IS, when it is a real client_payments row.
  ///
  /// Only those can be edited. Most PAYMENT rows on this statement are not
  /// records at all: they are credits synthesised from a sale's own paidAmount
  /// (see creditRows), and there is nothing in client_payments to edit. Giving
  /// them an edit action would either do nothing or send someone editing a
  /// sale while they believe they are editing a receipt, so the action is
  /// offered on exactly the rows that have one of these.
  final ClientPayment? payment;

  _StatementRow({
    required this.date,
    required this.title,
    required this.description,
    required this.debit,
    required this.credit,
    required this.type,
    this.detail = '',
    this.bill,
    this.payment,
  });

  bool get isPayment => type == 'PAYMENT';
}

List<LedgerEntry> _entries(List<_StatementRow> rows) => [
      for (final r in rows) (date: r.date, debit: r.debit, credit: r.credit),
    ];

// ─── Helper: payment method label ────────────────────────────────────────────
String _methodLabel(String method) {
  switch (method.toUpperCase()) {
    case 'CASH':   return 'Cash';
    case 'CARD':   return 'Card';
    case 'UPI':    return 'UPI';
    case 'BANK':   return 'Bank Transfer';
    case 'CHEQUE': return 'Cheque';
    default:       return method;
  }
}

String _iso(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

/// "2026-11-21" → "21 Nov", with the year when asked.
String _short(String iso, {bool year = false}) {
  final d = DateTime.tryParse(iso);
  if (d == null) return iso;
  return '${d.day} ${_mon[d.month - 1]}${year ? ' ${d.year}' : ''}';
}

/// A balance in words a shopkeeper reads at a glance: what is owed, or what
/// was paid ahead.
String _owed(double v) =>
    v < -0.5 ? '${Money.inr(-v)} advance' : Money.inr(v < 0 ? 0 : v);

// ─── Public entry-point ───────────────────────────────────────────────────────
/// Open the statement for [client].
Future<void> showClientStatement(BuildContext context, Client client) =>
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => ClientStatementSheet(client: client)),
    );

/// "Account Statement" (canvas): one client's bills and payments for a date
/// range, with the balance carried in and out.
class ClientStatementSheet extends ConsumerStatefulWidget {
  final Client client;
  const ClientStatementSheet({super.key, required this.client});

  @override
  ConsumerState<ClientStatementSheet> createState() =>
      _ClientStatementSheetState();
}

class _ClientStatementSheetState extends ConsumerState<ClientStatementSheet> {
  static const _presets = ['This month', 'Last month', 'This year', 'Custom'];
  int _preset = 2;
  late DateTime _from;
  late DateTime _to;
  int _kind = 0; // 0 all, 1 bills, 2 payments

  Client get client => widget.client;

  @override
  void initState() {
    super.initState();
    _applyPreset(2);
  }

  void _applyPreset(int i) {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    _preset = i;
    switch (i) {
      case 0:
        _from = DateTime(today.year, today.month, 1);
        _to = today;
      case 1:
        _from = DateTime(today.year, today.month - 1, 1);
        _to = DateTime(today.year, today.month, 0);
      case 2:
        _from = DateTime(today.year, 1, 1);
        _to = today;
    }
  }

  Future<void> _pickRange() async {
    final now = DateTime.now();
    final picked = await showDateRangePicker(
      context: context,
      firstDate: DateTime(2020),
      lastDate: DateTime(now.year, now.month, now.day),
      initialDateRange: DateTimeRange(start: _from, end: _to),
      builder: (ctx, child) => Theme(
        data: Theme.of(ctx).copyWith(
          colorScheme: const ColorScheme.light(
              primary: Bl.ink, onPrimary: Bl.white, onSurface: Bl.ink),
        ),
        child: child!,
      ),
    );
    if (picked == null || !mounted) return;
    setState(() {
      _preset = 3;
      _from = picked.start;
      _to = picked.end;
    });
  }

  String get _rangeLabel => _from.year == _to.year
      ? '${_short(_iso(_from))} – ${_short(_iso(_to), year: true)}'
      : '${_short(_iso(_from), year: true)} – ${_short(_iso(_to), year: true)}';

  void _refresh() {
    ref.invalidate(clientPaymentsForClientProvider(client.id));
    ref.invalidate(clientPaymentsProvider);
    ref.invalidate(saleReceiptsForClientProvider(client.id));
    ref.invalidate(recentSalesProvider);
    ref.invalidate(invoicesProvider);
    ref.invalidate(clientsProvider);
  }

  void _openPdf(List<_StatementRow> inRange, StatementWindow w) {
    final biz = ref.read(businessProfileProvider).valueOrNull;
    final tenant = ref.read(tenantContextProvider).valueOrNull?.tenant.name;
    final shop = (biz?.name ?? '').trim().isNotEmpty
        ? biz!.name!.trim()
        : (tenant ?? '').trim();
    final gst = (biz?.gstNo ?? '').trim();
    final shopPhone = (biz?.phone ?? '').trim();
    final now = DateTime.now();
    Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => StatementPdfScreen(
        data: StatementPdfData(
          shopName: shop.isEmpty ? 'Statement' : shop,
          shopLines: [
            if ((biz?.address ?? '').trim().isNotEmpty) biz!.address!.trim(),
            if (gst.isNotEmpty || shopPhone.isNotEmpty)
              [if (gst.isNotEmpty) 'GSTIN $gst', if (shopPhone.isNotEmpty) shopPhone]
                  .join(' · '),
          ],
          clientName: client.name ?? 'Unnamed',
          clientLine: [
            if ((client.address ?? '').trim().isNotEmpty) client.address!.trim(),
            if ((client.phone ?? '').trim().isNotEmpty) client.phone!.trim(),
          ].join(' · '),
          range:
              '${_short(_iso(_from), year: true)} to ${_short(_iso(_to), year: true)}',
          openingDate: _short(_iso(_from)),
          opening: w.opening,
          closing: w.closing,
          billed: w.billed,
          received: w.received,
          lines: [
            for (final r in inRange)
              (
                date: _short(r.date),
                details: r.description,
                billed: r.debit,
                received: r.credit,
                balance: r.balance,
              ),
          ],
          generated: _short(_iso(now), year: true),
        ),
      ),
    ));
  }

  Widget _sumRow(String label, String value,
          {Color color = Bl.ink, bool total = false}) =>
      Container(
        padding: total
            ? const EdgeInsets.only(top: 10)
            : const EdgeInsets.symmetric(vertical: 5),
        margin: total ? const EdgeInsets.only(top: 6) : null,
        decoration: total
            ? const BoxDecoration(
                border: Border(top: BorderSide(color: Color(0xFFE6E5E3))))
            : null,
        child: Row(
          children: [
            Expanded(
              child: Text(label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Bl.inter(13.5,
                      w: total ? FontWeight.w600 : FontWeight.w500,
                      c: total ? Bl.ink : const Color(0xFF6E737A))),
            ),
            const SizedBox(width: 10),
            Text(value,
                style: total
                    ? Bl.tight(17, w: FontWeight.w700, c: color)
                    : Bl.tight(14, w: FontWeight.w600, c: color)),
          ],
        ),
      );

  Widget _ledgerRow(_StatementRow row) {
    final items = row.bill?.items?.length ?? 0;
    final sub = [
      _short(row.date),
      if (row.isPayment && row.detail.isNotEmpty) row.detail,
      if (!row.isPayment && items > 0) '$items item${items == 1 ? '' : 's'}',
    ].join(' · ');
    final body = Container(
      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 9),
      decoration: const BoxDecoration(
          border: Border(bottom: BorderSide(color: Bl.sep))),
      child: Row(
        children: [
          Container(
            width: 36,
            height: 36,
            alignment: Alignment.center,
            decoration: BoxDecoration(
                color: row.isPayment ? const Color(0xFFE3F5EA) : Bl.well,
                shape: BoxShape.circle),
            child: BlIcon(row.isPayment ? BlIcons.check : BlIcons.doc,
                size: 16, color: row.isPayment ? _greenDeep : Bl.ink),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(row.title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Bl.tight(14, w: FontWeight.w600)),
                const SizedBox(height: 1),
                Text(sub,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Bl.inter(12, c: _grey)),
              ],
            ),
          ),
          const SizedBox(width: 10),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                  row.isPayment
                      ? '− ${Money.inr(row.credit)}'
                      : '+ ${Money.inr(row.debit)}',
                  style: Bl.tight(14.5,
                      w: FontWeight.w600,
                      c: row.isPayment ? _greenDeep : Bl.ink)),
              const SizedBox(height: 1),
              Text(
                  row.balance < -0.5
                      ? 'Adv ${Money.inr(-row.balance)}'
                      : 'Bal ${Money.inr(row.balance < 0 ? 0 : row.balance)}',
                  style: Bl.inter(11.5, c: _grey)),
            ],
          ),
        ],
      ),
    );
    // A bill row opens the bill; a real receipt opens its editor. A credit
    // worked out from a sale is not a record, so it opens nothing.
    if (row.bill != null) {
      return BlTap(
        onTap: () => Navigator.of(context).push(MaterialPageRoute(
            builder: (_) => InvoiceDetailScreen(invoice: row.bill!))),
        child: body,
      );
    }
    if (row.payment != null) {
      return BlTap(
        onTap: () => _openPaymentEditor(context, ref, row.payment!),
        child: body,
      );
    }
    return body;
  }

  @override
  Widget build(BuildContext context) {
    final owedNow = ref
            .watch(clientsProvider)
            .valueOrNull
            ?.where((c) => c.id == client.id)
            .firstOrNull
            ?.outstandingBalance ??
        client.outstandingBalance ??
        0;
    final invoicesAsync = ref.watch(invoicesProvider);
    final paymentsAsync = ref.watch(clientPaymentsForClientProvider(client.id));
    // One row per payment event, each with the date the money arrived. Empty
    // when unavailable, which falls back to the old single credit on the sale
    // date — still right whenever nothing was collected late.
    final receiptsAsync = ref.watch(saleReceiptsForClientProvider(client.id));
    // Sale lines carry no unit — only {cess, hsn, id, name, quantity, rate,
    // taxRate} — so the unit comes from the product, or every quantity reads
    // as a bare number.
    final productsAsync = ref.watch(productsProvider);
    final salesAsync    = ref.watch(recentSalesProvider);
    ref.watch(businessProfileProvider); // warmed for the PDF header

    // Determine loading / error states. Sales load is needed to resolve each
    // invoice's original payment method (invoices table doesn't store it).
    // receiptsAsync is in the LOADING gate so the credits are not first drawn
    // on the sale's date and then jump when the ledger lands. It is
    // deliberately NOT in the error gate: if it fails, the statement should
    // degrade to that single credit rather than refuse to render. isLoading
    // goes false on failure too, so a failure does not block either.
    final isLoading = (invoicesAsync.isLoading && !invoicesAsync.hasValue) ||
        (paymentsAsync.isLoading && !paymentsAsync.hasValue) ||
        (salesAsync.isLoading && !salesAsync.hasValue) ||
        (receiptsAsync.isLoading && !receiptsAsync.hasValue);

    final error = invoicesAsync.error ?? paymentsAsync.error ?? salesAsync.error;

    // ── Build statement rows (mirrors web ClientSettlement.jsx exactly) ──────
    final rows = <_StatementRow>[];

    // What they buy, from the same sales the ledger is built from — no extra
    // query, and it works offline as far as the cached sales go.
    final productLines = (isLoading || error != null)
        ? const <ClientProductLine>[]
        : aggregateClientProducts(
            salesAsync.valueOrNull ?? const [],
            client.id,
            unitById: {
              for (final p in (productsAsync.valueOrNull ?? const []))
                p.id: p.unit,
            },
          );

    if (!isLoading && error == null) {
      final sales = salesAsync.valueOrNull ?? const [];
      // sale id → payment method, to distinguish upfront-paid sales from
      // CREDIT sales settled later (those payments live in client_payments).
      final saleMethodById = <String, String>{
        for (final s in sales) s.id: (s.paymentMethod ?? '').toUpperCase(),
      };
      // An invoice settled at the POS carries paidAmount 0 — the money sits on
      // the SALE row. Crediting the invoice's own 0 against its full total
      // showed the whole bill as owed. Fall back to the sale, same as web.
      final salePaidById = <String, double>{
        for (final s in sales) s.id: (s.paidAmount ?? 0),
      };
      final invoicedSaleIds = <String>{};

      // saleId -> its ledger rows, so a credit can be dated by when it landed.
      final receiptsBySale = <String, List<Map<String, dynamic>>>{};
      for (final r in (receiptsAsync.valueOrNull ?? const <Map<String, dynamic>>[])) {
        final id = (r['ref_id'] ?? '').toString();
        if (id.isEmpty) continue;
        (receiptsBySale[id] ??= []).add(r);
      }

      /// Credit rows for one sale. The dating rule lives in
      /// data/statement_credits.dart so it can be tested without the widget.
      List<_StatementRow> creditRows({
        required String saleId,
        required double fallbackAmount,
        required String fallbackDate,
        required String label,
      }) =>
          creditsForSale(
            saleId: saleId,
            fallbackAmount: fallbackAmount,
            fallbackDate: fallbackDate,
            receipts: receiptsBySale[saleId] ?? const [],
          )
              .map((c) => _StatementRow(
                    date: c.date,
                    title: 'Payment received',
                    detail: c.collectedLater ? '$label · collected later' : label,
                    description: 'Payment · $label',
                    debit: 0,
                    credit: c.amount,
                    type: 'PAYMENT',
                  ))
              .toList();

      // 1. Invoice rows (single source of truth for DR).
      //    Credit sales that also appear as invoices must NOT be added as
      //    a separate "Credit Sale" row — that causes double-counting.
      final invoices = invoicesAsync.valueOrNull ?? const [];
      for (final inv in invoices) {
        if (inv.clientId != client.id) continue;
        if (inv.saleId != null) invoicedSaleIds.add(inv.saleId!);
        final dateStr = inv.invoiceDate ??
            inv.createdAt?.toIso8601String().substring(0, 10) ??
            '';
        rows.add(_StatementRow(
          date: dateStr,
          title: 'Bill ${inv.displayNumber}',
          description: 'Bill ${inv.displayNumber}',
          debit: inv.grandTotal,
          credit: 0,
          type: 'INVOICE',
          bill: inv,
        ));

        // Inline payment CR — ONLY for upfront-paid (non-CREDIT) sales, whose
        // payment never reaches client_payments. For CREDIT sales the later
        // collection IS in client_payments; synthesizing here double-counted
        // the same payment (same bug web fixed — see ClientSettlement.jsx).
        final saleMethod = saleMethodById[inv.saleId] ?? '';
        final invPaid = inv.paidAmount > 0
            ? inv.paidAmount
            : (salePaidById[inv.saleId] ?? 0);
        if (invPaid > 0 && saleMethod != 'CREDIT' && saleMethod.isNotEmpty) {
          rows.addAll(creditRows(
            saleId: inv.saleId ?? '',
            fallbackAmount: invPaid,
            fallbackDate: dateStr,
            label: _methodLabel(saleMethod),
          ));
        }
      }

      // 1b. CASH/UPI sales with no invoice, SETTLED OR NOT. Debit the full
      //     amount + credit what was paid, same as web (includeSettled in
      //     src/lib/clientStatement.js).
      //
      //     Settled bills used to be skipped, so a customer who pays at the
      //     counter every time had a statement with nothing on it — no record
      //     of what they had bought. A paid bill enters as a debit AND its
      //     payment, which nets to zero, so the running balance and the
      //     closing figure are unchanged. Crediting less than the debit here
      //     would invent a debt they do not owe.
      for (final s in sales) {
        if (s.shopId != client.id) continue;
        final method = (s.paymentMethod ?? '').toUpperCase();
        if (invoicedSaleIds.contains(s.id)) continue;
        final saleDate = s.date ?? s.createdAt?.toIso8601String().substring(0, 10) ?? '';
        // A credit sale with no invoice is still a bill the client was given,
        // same as web (src/lib/clientStatement.js). It is debited in full and
        // gets no credit of its own: what was collected against it arrives as
        // client_payments rows below, and crediting it here too would count
        // that money twice.
        if (method == 'CREDIT') {
          rows.add(_StatementRow(
            date: saleDate,
            title: 'Bill #${s.id.split('-').last}',
            description: 'Bill #${s.id.split('-').last}',
            debit: s.totalAmount ?? 0,
            credit: 0,
            type: 'SALE',
            bill: Invoice.fromSale(s),
          ));
          continue;
        }
        final total = s.totalAmount ?? 0;
        final paid  = s.paidAmount ?? 0;
        rows.add(_StatementRow(
          date: saleDate,
          title: 'Bill #${s.id.split('-').last}',
          description: 'Bill #${s.id.split('-').last}',
          debit: total,
          credit: 0,
          type: 'SALE',
          bill: Invoice.fromSale(s),
        ));
        if (paid > 0) {
          rows.addAll(creditRows(
            saleId: s.id,
            fallbackAmount: paid,
            fallbackDate: saleDate,
            label: _methodLabel(method),
          ));
        }
      }

      // 2. Client payment rows (post-sale cash collections).
      final payments = paymentsAsync.valueOrNull ?? const [];
      for (final payment in payments) {
        final notes = (payment.notes ?? '').trim();
        final label = _methodLabel(payment.paymentMethod);
        rows.add(_StatementRow(
          date: payment.date,
          title: 'Payment received',
          detail: [if (label.isNotEmpty) label, if (notes.isNotEmpty) notes]
              .join(' · '),
          description: label.isEmpty ? 'Payment' : 'Payment · $label',
          debit: 0,
          credit: payment.amount,
          type: 'PAYMENT',
          payment: payment,
        ));
      }

      // Sort ascending by date string (ISO YYYY-MM-DD sorts lexicographically).
      rows.sort((a, b) => a.date.compareTo(b.date));

      // Running balance. Bills older than this phone holds are carried in
      // front, so the last balance is what the client owes today.
      final run = runningBalances(_entries(rows), owedNow);
      for (var i = 0; i < rows.length; i++) {
        rows[i].balance = run[i];
      }
    }


    final fromIso = _iso(_from), toIso = _iso(_to);
    final window = statementWindow(_entries(rows), owedNow, fromIso, toIso);
    final inRange = [
      for (final r in rows)
        if (inStatementRange(r.date, fromIso, toIso)) r,
    ];
    final shown = [
      for (final r in inRange.reversed)
        if (_kind == 0 || (_kind == 2) == r.isPayment) r,
    ];
    final ready = !isLoading && error == null;
    final phone = (client.phone ?? '').trim();
    final credit = client.creditDays ?? 0;

    final ledger = <Widget>[];
    String? month;
    for (final r in shown) {
      final key = r.date.length >= 7 ? r.date.substring(0, 7) : r.date;
      if (key != month) {
        month = key;
        final net = shown
            .where((x) => x.date.startsWith(key))
            .fold<double>(0, (t, x) => t + x.debit - x.credit);
        final d = DateTime.tryParse('$key-01');
        ledger.add(BlGroupHeader(
            d == null ? key : '${_months[d.month - 1]} ${d.year}',
            trailing: '${net < 0 ? '−' : '+'} ${Money.inr(net.abs())}'));
      }
      ledger.add(_ledgerRow(r));
    }

    void collect() => Navigator.of(context)
        .push(MaterialPageRoute(
            builder: (_) => ClientSettlementScreen(client: client)))
        .then((_) => _refresh());

    return Scaffold(
      backgroundColor: Bl.white,
      body: SafeArea(
        child: Column(
          children: [
            BlBackHeader(
              title: 'Account Statement',
              trailing: BlRoundButton(_shareIcon,
                  label: 'Share the statement as a PDF',
                  onTap: ready ? () => _openPdf(inRange, window) : null),
            ),
            Expanded(
              child: isLoading
                  ? const Center(
                      child: CircularProgressIndicator(
                          color: Bl.amber, strokeWidth: 2))
                  : error != null
                      ? Center(
                          child: Padding(
                            padding: const EdgeInsets.all(24),
                            child: Text(
                                'Could not load the statement. Check your internet and try again. ($error)',
                                textAlign: TextAlign.center,
                                style: Bl.inter(13.5, c: Bl.redDeep, h: 1.5)),
                          ),
                        )
                      : ListView(
                          padding: const EdgeInsets.only(bottom: 20),
                          children: [
                            Padding(
                              padding:
                                  const EdgeInsets.fromLTRB(18, 4, 18, 0),
                              child: Row(
                                children: [
                                  BlTintAvatar(client.name ?? ''),
                                  const SizedBox(width: 12),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Text(client.name ?? 'Unnamed',
                                            maxLines: 1,
                                            overflow: TextOverflow.ellipsis,
                                            style: Bl.tight(15,
                                                w: FontWeight.w600)),
                                        const SizedBox(height: 1),
                                        Text(
                                            [
                                              if (phone.isNotEmpty) phone,
                                              credit == 0
                                                  ? 'Cash on delivery'
                                                  : 'Net $credit days',
                                            ].join(' · '),
                                            maxLines: 1,
                                            overflow: TextOverflow.ellipsis,
                                            style:
                                                Bl.inter(12.5, c: _grey)),
                                      ],
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            Padding(
                              padding:
                                  const EdgeInsets.fromLTRB(18, 14, 18, 0),
                              child: Semantics(
                                button: true,
                                label: 'Dates, $_rangeLabel. Change',
                                excludeSemantics: true,
                                child: BlTap(
                                  onTap: _pickRange,
                                  child: Container(
                                    height: 44,
                                    padding: const EdgeInsets.symmetric(
                                        horizontal: 12),
                                    decoration: BoxDecoration(
                                        borderRadius:
                                            BorderRadius.circular(12),
                                        border: Border.all(
                                            color:
                                                const Color(0xFFDADADA))),
                                    child: Row(
                                      children: [
                                        const BlIcon(_calendarIcon,
                                            size: 18, color: Bl.ink3),
                                        const SizedBox(width: 8),
                                        Expanded(
                                          child: Text(_rangeLabel,
                                              style: Bl.tight(13.5,
                                                  w: FontWeight.w600)),
                                        ),
                                        const BlIcon(BlIcons.chevronDown,
                                            size: 18, color: _grey),
                                      ],
                                    ),
                                  ),
                                ),
                              ),
                            ),
                            SingleChildScrollView(
                              scrollDirection: Axis.horizontal,
                              padding:
                                  const EdgeInsets.fromLTRB(18, 8, 18, 0),
                              child: Row(
                                children: [
                                  for (var i = 0; i < _presets.length; i++)
                                    Padding(
                                      padding:
                                          const EdgeInsets.only(right: 6),
                                      child: Semantics(
                                        button: true,
                                        selected: _preset == i,
                                        label: _presets[i],
                                        excludeSemantics: true,
                                        child: BlTap(
                                          onTap: () => i == 3
                                              ? _pickRange()
                                              : setState(
                                                  () => _applyPreset(i)),
                                          child: Container(
                                            height: 28,
                                            padding:
                                                const EdgeInsets.symmetric(
                                                    horizontal: 11),
                                            alignment: Alignment.center,
                                            decoration: BoxDecoration(
                                                color: _preset == i
                                                    ? Bl.ink
                                                    : Bl.well,
                                                borderRadius:
                                                    BorderRadius.circular(
                                                        999)),
                                            child: Text(_presets[i],
                                                style: Bl.tight(12,
                                                    w: FontWeight.w600,
                                                    ls: 0,
                                                    c: _preset == i
                                                        ? Bl.white
                                                        : Bl.ink3)),
                                          ),
                                        ),
                                      ),
                                    ),
                                ],
                              ),
                            ),
                            Container(
                              margin:
                                  const EdgeInsets.fromLTRB(18, 14, 18, 0),
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 14, vertical: 12),
                              decoration: BoxDecoration(
                                  color: Bl.tile,
                                  borderRadius: BorderRadius.circular(16)),
                              child: Column(
                                children: [
                                  _sumRow(
                                      'Opening balance · ${_short(fromIso)}',
                                      _owed(window.opening)),
                                  _sumRow(
                                      'Billed · ${window.bills} bill${window.bills == 1 ? '' : 's'}',
                                      '+ ${Money.inr(window.billed)}'),
                                  _sumRow(
                                      'Received · ${window.payments} payment${window.payments == 1 ? '' : 's'}',
                                      '− ${Money.inr(window.received)}',
                                      color: _greenDeep),
                                  _sumRow(
                                      'Closing balance · ${_short(toIso)}',
                                      _owed(window.closing),
                                      total: true,
                                      color: window.closing > 0.5
                                          ? Bl.redDeep
                                          : window.closing < -0.5
                                              ? _greenDeep
                                              : Bl.ink),
                                ],
                              ),
                            ),
                            Padding(
                              padding:
                                  const EdgeInsets.fromLTRB(16, 14, 16, 0),
                              child: BlSegmented(
                                labels: const ['All', 'Bills', 'Payments'],
                                counts: [
                                  inRange.length,
                                  inRange.where((r) => !r.isPayment).length,
                                  inRange.where((r) => r.isPayment).length,
                                ],
                                index: _kind,
                                onChanged: (i) => setState(() => _kind = i),
                              ),
                            ),
                            // The balance on each row is the running figure
                            // from the WHOLE ledger. Filtering hides rows but
                            // not their effect; recomputing over what is
                            // visible would show a balance this client never
                            // had.
                            if (_kind != 0 && shown.isNotEmpty)
                              Padding(
                                padding:
                                    const EdgeInsets.fromLTRB(18, 8, 18, 0),
                                child: Text(
                                    'Balance still counts the ${_kind == 2 ? 'bills' : 'payments'} hidden here.',
                                    style: Bl.inter(11.5, c: _grey)),
                              ),
                            if (ledger.isEmpty)
                              BlEmpty(
                                icon: BlIcons.doc,
                                title: inRange.isEmpty
                                    ? 'Nothing in these dates'
                                    : _kind == 1
                                        ? 'No bills in these dates'
                                        : 'No payments in these dates',
                                message: inRange.isEmpty
                                    ? 'Pick a wider range to see older bills and payments.'
                                    : null,
                              )
                            else
                              ...ledger,
                            if (productLines.isNotEmpty)
                              ClientProductsCard(lines: productLines),
                          ],
                        ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 10, 16, 12),
              child: Row(
                children: [
                  Expanded(
                    flex: 10,
                    child: BlButton('Share PDF',
                        kind: BlButtonKind.soft,
                        leading: const BlIcon(_shareIcon, size: 18),
                        onTap:
                            ready ? () => _openPdf(inRange, window) : null),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    flex: 12,
                    child: BlButton('Collect payment', onTap: collect),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ─── Receipt editor ───────────────────────────────────────────────────────────
//
// Both actions go to the server as ONE statement each: edit_client_payment and
// delete_client_payment. Neither is a table write from here.
//
// That matters more than it looks. Changing a receipt is not changing a row: it
// re-pools every receipt for that client and re-applies them FIFO across their
// credit sales, rewriting paidAmount and paymentStatus on each sale and its
// invoice, then recomputing outstanding -- and the ledger triggers drop and
// repost the cash entry. Doing that from a phone, statement by statement, is
// how a half-applied edit leaves a receipt changed and the sales still showing
// the old figure, with outstanding matching neither.
Future<void> _openPaymentEditor(
  BuildContext context,
  WidgetRef ref,
  ClientPayment payment,
) async {
  final changed = await showBlSheet<bool>(
    context: context,
    builder: (_) => _PaymentEditorSheet(payment: payment),
  );
  if (changed == true) {
    ref.invalidate(clientPaymentsForClientProvider(payment.clientId));
    ref.invalidate(clientPaymentsProvider);
    ref.invalidate(saleReceiptsForClientProvider(payment.clientId));
    ref.invalidate(recentSalesProvider);
    ref.invalidate(invoicesProvider);
    ref.invalidate(clientsProvider);
  }
}

class _PaymentEditorSheet extends ConsumerStatefulWidget {
  final ClientPayment payment;
  const _PaymentEditorSheet({required this.payment});

  @override
  ConsumerState<_PaymentEditorSheet> createState() => _PaymentEditorSheetState();
}

class _PaymentEditorSheetState extends ConsumerState<_PaymentEditorSheet> {
  static const _methods = ['CASH', 'UPI', 'BANK', 'CARD', 'CHEQUE'];
  late final TextEditingController _amount =
      TextEditingController(text: _trimAmount(widget.payment.amount));
  late final TextEditingController _notes =
      TextEditingController(text: widget.payment.notes ?? '');
  late String _method = widget.payment.paymentMethod.toUpperCase();
  late DateTime _date =
      DateTime.tryParse(widget.payment.date) ?? DateTime.now();
  bool _busy = false;
  String? _error;

  static String _trimAmount(double v) =>
      v == v.roundToDouble() ? v.toStringAsFixed(0) : v.toStringAsFixed(2);

  @override
  void dispose() {
    _amount.dispose();
    _notes.dispose();
    super.dispose();
  }

  String get _iso =>
      '${_date.year.toString().padLeft(4, '0')}-'
      '${_date.month.toString().padLeft(2, '0')}-'
      '${_date.day.toString().padLeft(2, '0')}';

  Future<void> _save() async {
    final amount = double.tryParse(_amount.text.trim());
    // The server raises on a non-positive amount. Saying so here costs one
    // comparison and saves a round trip that ends in a red snackbar.
    if (amount == null || amount <= 0) {
      setState(() => _error = 'Enter an amount greater than zero.');
      return;
    }
    setState(() { _busy = true; _error = null; });
    try {
      final ctx = await ref.read(tenantContextProvider.future);
      if (ctx == null) throw 'No tenant. Sign in again.';
      final queued = await ref.read(syncServiceProvider).rpcOnlineOrQueue(
        'edit_client_payment',
        {
          'p_tenant_id': ctx.tenantId,
          'p_payment_id': widget.payment.id,
          'p_amount': amount,
          'p_method': _method,
          'p_date': _iso,
          'p_notes': _notes.text.trim().isEmpty ? null : _notes.text.trim(),
        },
      );
      if (!mounted) return;
      Navigator.of(context).pop(true);
      _toast(context, queued
          ? 'Saved on this phone. The receipt updates when you are online.'
          : 'Receipt updated.');
    } catch (e) {
      // Never swallow the reason: a bare "could not save" here hides a server
      // rejection that the person could act on.
      if (mounted) {
        setState(() {
          _busy = false;
          _error =
              'May not have saved. Check the statement before trying again. ($e)';
        });
      }
    }
  }

  Future<void> _delete() async {
    final ok = await showBlDialog<bool>(
      context: context,
      title: 'Delete this receipt?',
      message:
          'The ${Money.inr(widget.payment.amount)} comes back off this '
          'customer’s account and their bills are re-settled from what is '
          'left. This can be undone only by entering the receipt again.',
      actions: (dctx) => [
        Row(
          children: [
            Expanded(
              child: BlButton('Keep it',
                  kind: BlButtonKind.soft,
                  onTap: () => Navigator.pop(dctx, false)),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: BlButton('Delete',
                  kind: BlButtonKind.danger,
                  onTap: () => Navigator.pop(dctx, true)),
            ),
          ],
        ),
      ],
    );
    if (ok != true) return;

    setState(() { _busy = true; _error = null; });
    try {
      final ctx = await ref.read(tenantContextProvider.future);
      if (ctx == null) throw 'No tenant. Sign in again.';
      final queued = await ref.read(syncServiceProvider).rpcOnlineOrQueue(
        'delete_client_payment',
        {'p_tenant_id': ctx.tenantId, 'p_payment_id': widget.payment.id},
      );
      if (!mounted) return;
      Navigator.of(context).pop(true);
      _toast(context, queued
          ? 'Saved on this phone. It reverses when you are online.'
          : 'Receipt deleted.');
    } catch (e) {
      if (mounted) {
        setState(() {
          _busy = false;
          _error =
              'May not have saved. Check the statement before trying again. ($e)';
        });
      }
    }
  }

  static void _toast(BuildContext context, String msg) {
    ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(msg), behavior: SnackBarBehavior.floating));
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _date,
      firstDate: DateTime(2020),
      lastDate: DateTime.now().add(const Duration(days: 1)),
      builder: (ctx, child) => Theme(
        data: Theme.of(ctx).copyWith(
          colorScheme: const ColorScheme.light(
              primary: Bl.ink, onPrimary: Bl.white, onSurface: Bl.ink),
        ),
        child: child!,
      ),
    );
    if (picked != null && mounted) setState(() => _date = picked);
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const BlSheetTitle('Edit receipt', size: 16, divider: true),
        const SizedBox(height: 4),
        IgnorePointer(
          ignoring: _busy,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              BlField(
                label: 'Amount',
                prefix: '₹',
                controller: _amount,
                keyboardType:
                    const TextInputType.numberWithOptions(decimal: true),
              ),
              Padding(
                padding: const EdgeInsets.only(top: 14, bottom: 8),
                child: Text('Paid by',
                    style: Bl.inter(12.5,
                        w: FontWeight.w500, c: const Color(0xFF5E646C))),
              ),
              BlChoicePills(
                options: [
                  for (final m in {..._methods, _method}) _methodLabel(m),
                ],
                selected: _methodLabel(_method),
                onChanged: (label) => setState(() => _method = {
                      ..._methods,
                      _method
                    }.firstWhere((m) => _methodLabel(m) == label)),
              ),
              BlField(
                label: 'Date',
                value: _short(_iso, year: true),
                onTap: _pickDate,
              ),
              BlField(label: 'Note', hint: 'Optional', controller: _notes),
            ],
          ),
        ),
        if (_error != null)
          Container(
            margin: const EdgeInsets.only(top: 12),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
            decoration: BoxDecoration(
                color: Bl.redSoft, borderRadius: BorderRadius.circular(12)),
            child: Text(_error!,
                style: Bl.inter(12.5, w: FontWeight.w500, c: Bl.redDeep)),
          ),
        const SizedBox(height: 16),
        Row(
          children: [
            Expanded(
              flex: 9,
              child: BlButton('Delete',
                  kind: BlButtonKind.danger, onTap: _busy ? null : _delete),
            ),
            const SizedBox(width: 8),
            Expanded(
              flex: 14,
              child: BlButton('Save changes',
                  loading: _busy, onTap: _busy ? null : _save),
            ),
          ],
        ),
      ],
    );
  }
}

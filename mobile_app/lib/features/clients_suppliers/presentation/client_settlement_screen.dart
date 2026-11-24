import 'package:flutter/material.dart';
import 'package:mobile_app/core/design/bl_widgets.dart';
import 'package:mobile_app/core/utils/money.dart';
import 'package:mobile_app/features/clients_suppliers/data/party_aging.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/core/supabase/client.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:mobile_app/features/clients_suppliers/data/models/client.dart';
import 'package:mobile_app/features/clients_suppliers/presentation/providers/crm_provider.dart';
import 'package:mobile_app/features/invoices/data/models/invoice.dart';
import 'package:mobile_app/features/invoices/presentation/invoices_screen.dart';
import 'package:mobile_app/features/sales/data/models/sale.dart';
import 'package:mobile_app/features/sales/presentation/providers/sales_provider.dart';

class ClientSettlementScreen extends ConsumerStatefulWidget {
  final Client client;
  const ClientSettlementScreen({super.key, required this.client});

  @override
  ConsumerState<ClientSettlementScreen> createState() =>
      _ClientSettlementScreenState();
}

class _ClientSettlementScreenState
    extends ConsumerState<ClientSettlementScreen> {
  final _amountController = TextEditingController();
  final _notesController = TextEditingController();

  String _date = _todayIso();
  String _method = 'CASH';
  Set<String> _selectedInvoiceIds = {};
  bool _isLoading = false;

  static String _todayIso() {
    final now = DateTime.now();
    return '${now.year.toString().padLeft(4, '0')}-'
        '${now.month.toString().padLeft(2, '0')}-'
        '${now.day.toString().padLeft(2, '0')}';
  }

  @override
  void dispose() {
    _amountController.dispose();
    _notesController.dispose();
    super.dispose();
  }

  // ─── helpers ──────────────────────────────────────────────────────────────

  String _formatDate(String iso) {
    try {
      final d = DateTime.parse(iso);
      const months = [
        'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
      ];
      return '${d.day} ${months[d.month - 1]} ${d.year}';
    } catch (_) {
      return iso;
    }
  }

  /// Unpaid invoices PLUS part-paid/unpaid cash-type sales that were never
  /// converted to an invoice — those carry a real balance too, so the cashier
  /// must be able to see and settle them here. Synthetic rows get a `SALE:`
  /// id prefix so _submit knows to allocate onto the sale row directly.
  List<Invoice> _unpaidInvoices(List<Invoice> all, List<Sale> sales) {
    final invRows = all
        .where((inv) =>
            inv.clientId == widget.client.id && inv.paymentStatus != 'PAID')
        .toList();
    final invoicedSaleIds =
        invRows.map((i) => i.saleId).whereType<String>().toSet();

    final saleRows = sales.where((s) {
      if (s.shopId != widget.client.id) return false;
      final method = (s.paymentMethod ?? '').toUpperCase();
      if (method == 'CREDIT') return false;
      final st = (s.paymentStatus ?? s.status ?? '').toUpperCase();
      if (!['PARTIAL', 'UNPAID', 'PENDING'].contains(st)) return false;
      return !invoicedSaleIds.contains(s.id);
    }).map((s) => Invoice(
          id: 'SALE:${s.id}',
          invoiceNumber: 'Sale ${s.id.split('-').last}',
          clientId: s.shopId,
          clientName: s.displayCustomerName,
          invoiceDate: s.date,
          dueDate: s.date,
          grandTotal: s.totalAmount ?? 0,
          paidAmount: s.paidAmount ?? 0,
          paymentStatus: (s.paymentStatus ?? 'UNPAID').toUpperCase(),
          paymentMethod: s.paymentMethod,
          items: s.items,
        ));

    return [...invRows, ...saleRows];
  }

  double _selectedTotal(List<Invoice> unpaid) => unpaid
      .where((inv) => _selectedInvoiceIds.contains(inv.id))
      .fold(0, (s, inv) => s + inv.outstanding);

  // ─── date picker ──────────────────────────────────────────────────────────

  Future<void> _pickDate() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: DateTime.tryParse(_date) ?? now,
      firstDate: DateTime(now.year - 2),
      lastDate: DateTime(now.year + 1),
      builder: (ctx, child) => Theme(
        data: Theme.of(ctx).copyWith(
          colorScheme: const ColorScheme.light(
            primary: AppColors.primary,
            onPrimary: Colors.white,
            surface: Colors.white,
            onSurface: AppColors.inkPrimary,
          ),
        ),
        child: child!,
      ),
    );
    if (picked != null) {
      setState(() {
        _date =
            '${picked.year.toString().padLeft(4, '0')}-'
            '${picked.month.toString().padLeft(2, '0')}-'
            '${picked.day.toString().padLeft(2, '0')}';
      });
    }
  }

  // ─── submit ───────────────────────────────────────────────────────────────

  Future<void> _submit() async {
    final amt =
        double.tryParse(_amountController.text.replaceAll(',', '')) ?? 0;
    if (amt <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Enter a valid amount')),
      );
      return;
    }
    setState(() => _isLoading = true);
    try {
      final ctx = await ref.read(tenantContextProvider.future);
      if (ctx == null) return;

      // 1. Allocate payment across selected rows — real invoices first, then
      //    SALE:-prefixed synthetic rows (part-paid cash sales without an
      //    invoice). Mirrors web logic.
      if (_selectedInvoiceIds.isNotEmpty) {
        final realInvoiceIds =
            _selectedInvoiceIds.where((x) => !x.startsWith('SALE:')).toList();
        final saleOnlyIds = _selectedInvoiceIds
            .where((x) => x.startsWith('SALE:'))
            .map((x) => x.substring(5))
            .toList();
        double remaining = amt;

        if (realInvoiceIds.isNotEmpty) {
          final invRows = await supabase
              .from('invoices')
              .select('id, grand_total, paid_amount, sale_id')
              .isFilter('deleted_at', null)
              .inFilter('id', realInvoiceIds);
          for (final inv in (invRows as List)) {
            if (remaining <= 0) break;
            final alreadyPaid = ((inv['paid_amount'] as num?)?.toDouble() ?? 0);
            final gt = (inv['grand_total'] as num).toDouble();
            final owed = gt - alreadyPaid;
            if (owed <= 0) continue;
            final allocating = remaining < owed ? remaining : owed;
            final newPaid = alreadyPaid + allocating;
            final status = newPaid >= gt ? 'PAID' : 'PARTIAL';
            await supabase.from('invoices').update({
              'paid_amount': newPaid,
              'payment_status': status,
            }).eq('id', inv['id'] as String);
            final saleId = inv['sale_id'] as String?;
            if (saleId != null) {
              await supabase.from('sales').update({
                'paidAmount': newPaid,
                'paymentStatus': status,
              }).eq('id', saleId).eq('tenant_id', ctx.tenantId);
            }
            remaining -= allocating;
          }
        }

        // Selected cash sales (no invoice) — allocate directly on the sale
        // rows; the outstanding trigger recomputes from these and the
        // sale-ledger trigger reposts Cash & Bank. This portion must stay
        // OUT of the client_payments audit row (the FIFO replay trigger
        // re-allocates the whole pool across CREDIT sales — including it
        // would double-count, and double-post Cash & Bank).
        double saleAllocated = 0;
        if (saleOnlyIds.isNotEmpty && remaining > 0) {
          final saleRows = await supabase
              .from('sales')
              .select('id, "totalAmount", "paidAmount"')
              .isFilter('deleted_at', null)
              .inFilter('id', saleOnlyIds)
              .eq('tenant_id', ctx.tenantId);
          for (final sale in (saleRows as List)) {
            if (remaining <= 0) break;
            final alreadyPaid = ((sale['paidAmount'] as num?)?.toDouble() ?? 0);
            final total = (sale['totalAmount'] as num).toDouble();
            final owed = total - alreadyPaid;
            if (owed <= 0) continue;
            final allocating = remaining < owed ? remaining : owed;
            final newPaid = alreadyPaid + allocating;
            final status = newPaid >= total ? 'PAID' : 'PARTIAL';
            await supabase.from('sales').update({
              'paidAmount': newPaid,
              'paymentStatus': status,
              'lastPaymentDate': _date,
            }).eq('id', sale['id'] as String).eq('tenant_id', ctx.tenantId);
            saleAllocated += allocating;
            remaining -= allocating;
          }
        }

        // 2. Audit record — credit/invoice portion only (cash-sale portion
        //    excluded, see note above). The no-selection path below uses the
        //    settle_client_payment RPC which inserts its own audit row.
        final auditAmount = amt - saleAllocated;
        if (auditAmount > 0.005) {
          final paymentId = 'CP-${DateTime.now().millisecondsSinceEpoch}';
          await supabase.from('client_payments').insert({
            'id': paymentId,
            'client_id': widget.client.id,
            'tenant_id': ctx.tenantId,
            'date': _date,
            'amount': auditAmount,
            'payment_method': _method,
            'notes': _notesController.text.trim().isEmpty
                ? null
                : _notesController.text.trim(),
          });
        }
      } else {
        // No invoices selected — allocation lives server-side in the
        // settle_client_payment RPC (FIFO across ALL unpaid/partial sales,
        // credit AND part-paid cash/UPI, oldest first). Same implementation
        // web and desktop use; it inserts the audit row itself.
        await supabase.rpc('settle_client_payment', params: {
          'p_id': 'CP-${DateTime.now().millisecondsSinceEpoch}',
          'p_tenant_id': ctx.tenantId,
          'p_client_id': widget.client.id,
          'p_amount': amt,
          'p_date': _date,
          'p_method': _method,
          'p_notes': _notesController.text.trim().isEmpty
              ? null
              : _notesController.text.trim(),
          'p_recorded_by': supabase.auth.currentUser?.id,
        });
      }

      ref.invalidate(clientPaymentsProvider);
      ref.invalidate(clientPaymentsForClientProvider(widget.client.id));
      ref.invalidate(clientsProvider);
      ref.invalidate(invoicesProvider);

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('${Money.inr(amt)} payment recorded'),
            behavior: SnackBarBehavior.floating,
          ),
        );
        Navigator.pop(context);
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
                'The payment may not have saved. Check the client before trying again. ($e)'),
            backgroundColor: Bl.redDeep,
            behavior: SnackBarBehavior.floating,
            duration: const Duration(seconds: 8),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  // ─── build ────────────────────────────────────────────────────────────────

  static const _methods = [
    ('CASH', 'Cash', BlIcons.cash),
    (
      'UPI',
      'UPI',
      '<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 18h2v2h-2z"/>'
    ),
    ('BANK', 'Bank', BlIcons.bank),
    (
      'CHEQUE',
      'Cheque',
      '<path d="M3 7h18v10H3z"/><path d="M6 13h6M14 13l2 1.5 3-3"/>'
    ),
  ];

  static int _daysOld(String? iso) {
    final d = iso == null ? null : DateTime.tryParse(iso);
    if (d == null) return 0;
    final n = DateTime.now().difference(d).inDays;
    return n < 0 ? 0 : n;
  }

  @override
  Widget build(BuildContext context) {
    final client = widget.client;
    final name = client.name ?? 'Unnamed';
    final outstanding = client.outstandingBalance ?? 0.0;
    final sales = ref.watch(recentSalesProvider).valueOrNull ?? const <Sale>[];
    final unpaid = _unpaidInvoices(
        ref.watch(invoicesProvider).valueOrNull ?? const <Invoice>[], sales);
    // Same count and age the Clients list shows for this client.
    final aging = clientAging(sales, DateTime.now())[client.id];
    final billCount = aging?.unpaidBills ?? unpaid.length;
    final oldest = aging?.oldestDays ??
        unpaid.fold<int>(0, (m, inv) {
          final d = _daysOld(inv.invoiceDate);
          return d > m ? d : m;
        });
    final amount =
        double.tryParse(_amountController.text.replaceAll(',', '').trim()) ?? 0;
    final after = (outstanding - amount).clamp(0, double.infinity).toDouble();
    final allSelected = unpaid.isNotEmpty &&
        unpaid.every((inv) => _selectedInvoiceIds.contains(inv.id));

    return Scaffold(
      backgroundColor: Bl.white,
      body: SafeArea(
        child: Column(
          children: [
            const BlBackHeader(title: 'Collect Payment'),
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.only(bottom: 16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: BlEntrance.all([
                    // ── Who, and how much they owe ───────────────────────
                    Padding(
                      padding: const EdgeInsets.fromLTRB(18, 6, 18, 0),
                      child: Row(
                        children: [
                          BlTintAvatar(name, size: 44),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(name,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style:
                                        Bl.tight(15, w: FontWeight.w600)),
                                const SizedBox(height: 1),
                                Text(
                                    billCount == 0
                                        ? 'No unpaid bills listed'
                                        : '$billCount unpaid bill${billCount == 1 ? '' : 's'} · oldest $oldest days',
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: Bl.inter(12.5,
                                        c: const Color(0xFF7A8088))),
                              ],
                            ),
                          ),
                          const SizedBox(width: 8),
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.end,
                            children: [
                              Text(Money.inr(outstanding.abs()),
                                  style: Bl.tight(20,
                                      w: FontWeight.w700,
                                      ls: -0.02,
                                      c: outstanding > 0.5
                                          ? Bl.redDeep
                                          : Bl.ink)),
                              Text(
                                  outstanding > 0.5
                                      ? 'owes you'
                                      : outstanding < -0.5
                                          ? 'paid in advance'
                                          : 'settled',
                                  style: Bl.inter(11.5,
                                      c: const Color(0xFF7A8088))),
                            ],
                          ),
                        ],
                      ),
                    ),

                    // ── Amount and date ──────────────────────────────────
                    Padding(
                      padding: const EdgeInsets.fromLTRB(18, 16, 18, 0),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Expanded(
                            flex: 13,
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text('Amount received',
                                    style: Bl.tight(13,
                                        w: FontWeight.w600,
                                        ls: 0,
                                        c: Bl.ink3)),
                                const SizedBox(height: 6),
                                Container(
                                  height: 50,
                                  padding: const EdgeInsets.symmetric(
                                      horizontal: 14),
                                  decoration: BoxDecoration(
                                    color: Bl.white,
                                    borderRadius: BorderRadius.circular(14),
                                    border:
                                        Border.all(color: Bl.brand, width: 2),
                                  ),
                                  child: Row(
                                    children: [
                                      Text('₹ ',
                                          style: Bl.tight(15.5,
                                              w: FontWeight.w600, ls: 0)),
                                      Expanded(
                                        child: TextField(
                                          controller: _amountController,
                                          keyboardType: const TextInputType
                                              .numberWithOptions(
                                              decimal: true),
                                          cursorColor: Bl.brand,
                                          onChanged: (_) => setState(() {}),
                                          style: Bl.tight(15.5,
                                              w: FontWeight.w600, ls: 0),
                                          decoration: InputDecoration(
                                            isCollapsed: true,
                                            filled: false,
                                            border: InputBorder.none,
                                            enabledBorder: InputBorder.none,
                                            focusedBorder: InputBorder.none,
                                            hintText: '0',
                                            hintStyle: Bl.tight(15.5,
                                                w: FontWeight.w500,
                                                ls: 0,
                                                c: const Color(0xFFA8ADB4)),
                                          ),
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            flex: 10,
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text('Date',
                                    style: Bl.tight(13,
                                        w: FontWeight.w600,
                                        ls: 0,
                                        c: Bl.ink3)),
                                const SizedBox(height: 6),
                                Semantics(
                                  button: true,
                                  label: 'Date, ${_formatDate(_date)}',
                                  excludeSemantics: true,
                                  child: BlTap(
                                    onTap: _pickDate,
                                    child: Container(
                                      height: 50,
                                      padding: const EdgeInsets.symmetric(
                                          horizontal: 14),
                                      decoration: BoxDecoration(
                                          color: Bl.wellSoft,
                                          borderRadius:
                                              BorderRadius.circular(14)),
                                      child: Row(
                                        children: [
                                          Expanded(
                                            child: FittedBox(
                                              fit: BoxFit.scaleDown,
                                              alignment:
                                                  Alignment.centerLeft,
                                              child: Text(
                                                  _formatDate(_date),
                                                  style: Bl.tight(15.5,
                                                      w: FontWeight.w600,
                                                      ls: 0)),
                                            ),
                                          ),
                                          const SizedBox(width: 6),
                                          const BlIcon(
                                              '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>',
                                              size: 16,
                                              color: Color(0xFF7A8088)),
                                        ],
                                      ),
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                    if (outstanding > 0)
                      Padding(
                        padding: const EdgeInsets.fromLTRB(18, 1, 18, 0),
                        child: Align(
                          alignment: Alignment.centerLeft,
                          child: BlTap(
                            label: 'Fill the full amount owed',
                            onTap: () => setState(() =>
                                _amountController.text =
                                    outstanding.toStringAsFixed(2)),
                            child: Padding(
                              padding:
                                  const EdgeInsets.symmetric(vertical: 7),
                              child: Container(
                                height: 30,
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 12),
                                decoration: BoxDecoration(
                                  color: const Color(0xFFFFF8EC),
                                  borderRadius: BorderRadius.circular(999),
                                  border: Border.all(
                                      color: const Color(0xFFF0C48A)),
                                ),
                                child: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Text('Full ${Money.inr(outstanding)}',
                                        style: Bl.tight(12.5,
                                            w: FontWeight.w600,
                                            ls: 0,
                                            c: const Color(0xFFB86A0A))),
                                  ],
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),

                    // ── How it was paid ──────────────────────────────────
                    Padding(
                      padding: const EdgeInsets.fromLTRB(18, 7, 18, 0),
                      child: Row(
                        children: [
                          for (final (key, label, icon) in _methods) ...[
                            if (key != 'CASH') const SizedBox(width: 8),
                            Expanded(
                              child: Semantics(
                                button: true,
                                selected: _method == key,
                                label: label,
                                excludeSemantics: true,
                                child: BlTap(
                                  onTap: () => setState(() => _method = key),
                                  child: Container(
                                    height: 64,
                                    decoration: BoxDecoration(
                                        color: _method == key
                                            ? Bl.brand
                                            : Bl.wellSoft,
                                        borderRadius:
                                            BorderRadius.circular(14)),
                                    child: Column(
                                      mainAxisAlignment:
                                          MainAxisAlignment.center,
                                      children: [
                                        BlIcon(icon,
                                            size: 20,
                                            color: _method == key
                                                ? Bl.white
                                                : Bl.ink3),
                                        const SizedBox(height: 5),
                                        Text(label,
                                            style: Bl.tight(12.5,
                                                w: FontWeight.w600,
                                                ls: 0,
                                                c: _method == key
                                                    ? Bl.white
                                                    : Bl.ink3)),
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
                      child: BlField(
                        label: 'Notes (optional)',
                        hint: 'e.g. cheque number',
                        controller: _notesController,
                        capitalization: TextCapitalization.sentences,
                      ),
                    ),

                    // ── Which bills it pays ──────────────────────────────
                    if (unpaid.isNotEmpty) ...[
                      Padding(
                        padding: const EdgeInsets.fromLTRB(18, 10, 10, 0),
                        child: Row(
                          children: [
                            Expanded(
                                child: Text('APPLY TO BILLS (OPTIONAL)',
                                    style: Bl.eyebrow)),
                            BlTap(
                              onTap: () => setState(() {
                                _selectedInvoiceIds = allSelected
                                    ? {}
                                    : unpaid.map((inv) => inv.id).toSet();
                              }),
                              child: Padding(
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 8, vertical: 10),
                                child: Text(
                                    allSelected
                                        ? 'Clear all'
                                        : 'Select all',
                                    style: Bl.tight(12.5,
                                        w: FontWeight.w600,
                                        ls: 0,
                                        c: const Color(0xFFB86A0A))),
                              ),
                            ),
                          ],
                        ),
                      ),
                      for (var i = 0; i < unpaid.length; i++)
                        () {
                          final inv = unpaid[i];
                          final on = _selectedInvoiceIds.contains(inv.id);
                          final days = _daysOld(inv.invoiceDate);
                          return Semantics(
                            checked: on,
                            label:
                                '${inv.displayNumber}, ${Money.inr(inv.outstanding)}',
                            excludeSemantics: true,
                            child: GestureDetector(
                              behavior: HitTestBehavior.opaque,
                              onTap: () => setState(() {
                                if (on) {
                                  _selectedInvoiceIds.remove(inv.id);
                                } else {
                                  _selectedInvoiceIds.add(inv.id);
                                }
                              }),
                              child: Container(
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 18, vertical: 10),
                                decoration: i == unpaid.length - 1
                                    ? null
                                    : const BoxDecoration(
                                        border: Border(
                                            bottom:
                                                BorderSide(color: Bl.sep))),
                                child: Row(
                                  children: [
                                    Container(
                                      width: 22,
                                      height: 22,
                                      alignment: Alignment.center,
                                      decoration: BoxDecoration(
                                        color: on ? Bl.brand : null,
                                        borderRadius:
                                            BorderRadius.circular(7),
                                        border: on
                                            ? null
                                            : Border.all(
                                                width: 1.5,
                                                color: const Color(
                                                    0xFFCFCFCF)),
                                      ),
                                      child: on
                                          ? const BlIcon(BlIcons.check,
                                              size: 13,
                                              color: Bl.white,
                                              stroke: 3)
                                          : null,
                                    ),
                                    const SizedBox(width: 12),
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment:
                                            CrossAxisAlignment.start,
                                        children: [
                                          Text(inv.displayNumber,
                                              maxLines: 1,
                                              overflow: TextOverflow.ellipsis,
                                              style: Bl.tight(14,
                                                  w: FontWeight.w600)),
                                          const SizedBox(height: 1),
                                          Text(
                                              inv.dueDate != null
                                                  ? 'Due ${_formatDate(inv.dueDate!)}'
                                                  : 'No due date',
                                              style: Bl.inter(12,
                                                  c: const Color(
                                                      0xFF7A8088))),
                                        ],
                                      ),
                                    ),
                                    days > 60
                                        ? BlStatusPill.red('$days days')
                                        : days > 30
                                            ? BlStatusPill.yellow(
                                                '$days days')
                                            : BlStatusPill.green(
                                                '$days days'),
                                    const SizedBox(width: 10),
                                    ConstrainedBox(
                                      constraints: const BoxConstraints(
                                          minWidth: 58),
                                      child: Text(
                                          Money.inr(inv.outstanding),
                                          textAlign: TextAlign.right,
                                          style: Bl.tight(14,
                                              w: FontWeight.w600)),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          );
                        }(),
                      if (_selectedInvoiceIds.isNotEmpty)
                        Padding(
                          padding: const EdgeInsets.fromLTRB(18, 6, 18, 0),
                          child: Text(
                              'Ticked bills come to ${Money.inr(_selectedTotal(unpaid))}.',
                              style: Bl.inter(12, c: Bl.mute)),
                        ),
                    ],

                    // ── What this leaves ─────────────────────────────────
                    Container(
                      margin: const EdgeInsets.fromLTRB(18, 12, 18, 0),
                      padding: const EdgeInsets.symmetric(
                          horizontal: 14, vertical: 12),
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(color: const Color(0xFFECEBE9)),
                      ),
                      child: Column(
                        children: [
                          Row(
                            children: [
                              Expanded(
                                child: Text('Receiving now',
                                    style: Bl.inter(13,
                                        w: FontWeight.w500)),
                              ),
                              Text(Money.inr(amount),
                                  style: Bl.inter(13,
                                      w: FontWeight.w600,
                                      c: const Color(0xFF17663A))),
                            ],
                          ),
                          const SizedBox(height: 6),
                          Row(
                            children: [
                              Expanded(
                                child: Text('Still due after this',
                                    style: Bl.inter(13,
                                        w: FontWeight.w600,
                                        c: after > 0
                                            ? const Color(0xFFB86A0A)
                                            : const Color(0xFF17663A))),
                              ),
                              Text(Money.inr(after),
                                  style: Bl.inter(13,
                                      w: FontWeight.w600,
                                      c: after > 0
                                          ? const Color(0xFFB86A0A)
                                          : const Color(0xFF17663A))),
                            ],
                          ),
                          if (amount > outstanding + 0.005 && outstanding >= 0)
                            Padding(
                              padding: const EdgeInsets.only(top: 6),
                              child: Row(
                                children: [
                                  Expanded(
                                    child: Text('Kept as advance',
                                        style: Bl.inter(13,
                                            w: FontWeight.w500)),
                                  ),
                                  Text(Money.inr(amount - outstanding),
                                      style: Bl.inter(13,
                                          w: FontWeight.w600, c: Bl.ink)),
                                ],
                              ),
                            ),
                        ],
                      ),
                    ),
                  ]),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 8, 14, 14),
              child: BlSlide(
                _isLoading
                    ? 'Recording'
                    : amount > 0
                        ? 'Slide to record ${Money.inr(amount)}'
                        : 'Enter the amount received',
                enabled: amount > 0 && !_isLoading,
                onConfirmed: _submit,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/core/supabase/client.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:mobile_app/features/clients_suppliers/data/models/client.dart';
import 'package:mobile_app/features/clients_suppliers/presentation/providers/crm_provider.dart';
import 'package:mobile_app/features/clients_suppliers/presentation/widgets/client_utils.dart';
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
        // rows; the outstanding trigger recomputes from these.
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
            remaining -= allocating;
          }
        }

        // 2. Audit record for the invoice-selected path. (The no-selection
        //    path below uses the settle_client_payment RPC, which inserts
        //    its own audit row — inserting here too would double-count.)
        //    outstanding_balance is recalculated by the DB trigger
        //    trg_payments_outstanding on client_payments INSERT.
        final paymentId = 'CP-${DateTime.now().millisecondsSinceEpoch}';
        await supabase.from('client_payments').insert({
          'id': paymentId,
          'client_id': widget.client.id,
          'tenant_id': ctx.tenantId,
          'date': _date,
          'amount': amt,
          'payment_method': _method,
          'notes': _notesController.text.trim().isEmpty
              ? null
              : _notesController.text.trim(),
        });
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
            content: Text(
              '₹${amt.toStringAsFixed(2)} payment recorded',
              style: GoogleFonts.manrope(color: AppColors.inkPrimary),
            ),
            backgroundColor: AppColors.primaryContainer,
            behavior: SnackBarBehavior.floating,
            shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12)),
          ),
        );
        Navigator.pop(context);
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Error: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  // ─── build ────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final client = widget.client;
    final invoicesAsync = ref.watch(invoicesProvider);
    final salesAsync = ref.watch(recentSalesProvider);
    final outstanding = client.outstandingBalance ?? 0.0;

    return Scaffold(
      backgroundColor: AppColors.canvas,
      appBar: AppBar(
        backgroundColor: AppColors.canvas,
        elevation: 0,
        scrolledUnderElevation: 0,
        leading: IconButton(
          icon: const Icon(LucideIcons.arrowLeft,
              size: 20, color: AppColors.inkPrimary),
          onPressed: () => Navigator.pop(context),
        ),
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Collect Payment',
              style: GoogleFonts.manrope(
                color: AppColors.inkPrimary,
                fontSize: 20,
                fontWeight: FontWeight.w800,
                letterSpacing: -0.5,
              ),
            ),
            Text(
              client.name ?? '',
              style: GoogleFonts.jetBrainsMono(
                color: AppColors.secondary,
                fontSize: 9,
                fontWeight: FontWeight.w600,
                letterSpacing: 1.5,
              ),
            ),
          ],
        ),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 100),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // ── Section 1 — Client summary card ──────────────────────
            _ClientSummaryCard(
              client: client,
              outstanding: outstanding,
              unpaidCount: _unpaidInvoices(
                invoicesAsync.valueOrNull ?? const <Invoice>[],
                salesAsync.valueOrNull ?? const <Sale>[],
              ).length,
            ),

            const SizedBox(height: 16),

            // ── Section 2 — Payment form ──────────────────────────────
            _SectionCard(
              icon: LucideIcons.creditCard,
              title: 'PAYMENT DETAILS',
              children: [
                // Date row
                GestureDetector(
                  onTap: _pickDate,
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 14, vertical: 12),
                    decoration: BoxDecoration(
                      color: AppColors.canvas,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                          color: Colors.black.withValues(alpha: 0.06)),
                    ),
                    child: Row(
                      children: [
                        const Icon(LucideIcons.calendar,
                            size: 16, color: AppColors.primary),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            _formatDate(_date),
                            style: GoogleFonts.manrope(
                              fontSize: 14,
                              fontWeight: FontWeight.w600,
                              color: AppColors.inkPrimary,
                            ),
                          ),
                        ),
                        const Icon(LucideIcons.chevronDown,
                            size: 16, color: AppColors.inkTertiary),
                      ],
                    ),
                  ),
                ),

                const SizedBox(height: 14),

                // Amount label
                _FieldLabel(text: 'AMOUNT', required: true),
                Container(
                  decoration: BoxDecoration(
                    color: AppColors.canvas,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                        color: Colors.black.withValues(alpha: 0.06)),
                  ),
                  child: TextField(
                    controller: _amountController,
                    keyboardType: const TextInputType.numberWithOptions(
                        decimal: true),
                    style: GoogleFonts.manrope(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      color: AppColors.inkPrimary,
                    ),
                    decoration: InputDecoration(
                      border: InputBorder.none,
                      contentPadding: const EdgeInsets.symmetric(
                          horizontal: 14, vertical: 12),
                      prefixText: '₹ ',
                      prefixStyle: GoogleFonts.manrope(
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                        color: AppColors.primary,
                      ),
                      hintText: '0.00',
                      hintStyle: GoogleFonts.manrope(
                        color: AppColors.inkTertiary,
                        fontSize: 13,
                      ),
                    ),
                  ),
                ),

                if (outstanding > 0) ...[
                  const SizedBox(height: 4),
                  Align(
                    alignment: Alignment.centerRight,
                    child: TextButton(
                      onPressed: () {
                        _amountController.text =
                            outstanding.toStringAsFixed(2);
                      },
                      style: TextButton.styleFrom(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 8, vertical: 4),
                        minimumSize: Size.zero,
                        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                      ),
                      child: Text(
                        'Fill full outstanding (₹${outstanding.toStringAsFixed(2)})',
                        style: GoogleFonts.manrope(
                          fontSize: 11,
                          color: AppColors.primary,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ),
                ],

                const SizedBox(height: 14),

                // Payment method chips
                _FieldLabel(text: 'PAYMENT METHOD'),
                const SizedBox(height: 6),
                _MethodSelector(
                  selected: _method,
                  onChanged: (m) => setState(() => _method = m),
                ),

                const SizedBox(height: 14),

                // Notes
                _FieldLabel(text: 'NOTES'),
                Container(
                  decoration: BoxDecoration(
                    color: AppColors.canvas,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                        color: Colors.black.withValues(alpha: 0.06)),
                  ),
                  child: TextField(
                    controller: _notesController,
                    maxLines: 2,
                    style: GoogleFonts.manrope(
                      fontSize: 14,
                      fontWeight: FontWeight.w500,
                      color: AppColors.inkPrimary,
                    ),
                    decoration: InputDecoration(
                      border: InputBorder.none,
                      contentPadding: const EdgeInsets.symmetric(
                          horizontal: 14, vertical: 12),
                      hintText: 'Notes (optional)',
                      hintStyle: GoogleFonts.manrope(
                        color: AppColors.inkTertiary,
                        fontSize: 13,
                      ),
                    ),
                  ),
                ),
              ],
            ),

            const SizedBox(height: 16),

            // ── Section 3 — Invoice selection ─────────────────────────
            invoicesAsync.when(
              loading: () => const SizedBox.shrink(),
              error: (err, _) => const SizedBox.shrink(),
              data: (allInvoices) {
                final sales = salesAsync.valueOrNull ?? const <Sale>[];
                final unpaid = _unpaidInvoices(allInvoices, sales);
                if (unpaid.isEmpty) return const SizedBox.shrink();

                final selTotal = _selectedTotal(unpaid);
                final allSelected = unpaid.every(
                    (inv) => _selectedInvoiceIds.contains(inv.id));

                return Container(
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(
                        color: Colors.black.withValues(alpha: 0.05)),
                    boxShadow: [AppColors.cardShadow],
                  ),
                  child: Theme(
                    data: Theme.of(context)
                        .copyWith(dividerColor: Colors.transparent),
                    child: ExpansionTile(
                      tilePadding: const EdgeInsets.symmetric(
                          horizontal: 16, vertical: 4),
                      leading: Icon(LucideIcons.fileText,
                          size: 14, color: AppColors.primary),
                      title: Text(
                        'APPLY TO INVOICES (OPTIONAL)',
                        style: GoogleFonts.jetBrainsMono(
                          fontSize: 11,
                          fontWeight: FontWeight.w800,
                          letterSpacing: 1.5,
                          color: AppColors.inkPrimary,
                        ),
                      ),
                      iconColor: AppColors.inkSecondary,
                      collapsedIconColor: AppColors.inkTertiary,
                      children: [
                        // Divider + select all
                        Container(
                          height: 1,
                          color: Colors.black.withValues(alpha: 0.05),
                        ),
                        Padding(
                          padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
                          child: Row(
                            mainAxisAlignment:
                                MainAxisAlignment.spaceBetween,
                            children: [
                              Text(
                                '${unpaid.length} unpaid bill${unpaid.length == 1 ? '' : 's'}',
                                style: GoogleFonts.manrope(
                                  fontSize: 12,
                                  color: AppColors.inkTertiary,
                                ),
                              ),
                              TextButton(
                                onPressed: () {
                                  setState(() {
                                    if (allSelected) {
                                      _selectedInvoiceIds = {};
                                    } else {
                                      _selectedInvoiceIds = unpaid
                                          .map((inv) => inv.id)
                                          .toSet();
                                    }
                                  });
                                },
                                style: TextButton.styleFrom(
                                  padding: const EdgeInsets.symmetric(
                                      horizontal: 8, vertical: 4),
                                  minimumSize: Size.zero,
                                  tapTargetSize:
                                      MaterialTapTargetSize.shrinkWrap,
                                ),
                                child: Text(
                                  allSelected ? 'Deselect All' : 'Select All',
                                  style: GoogleFonts.manrope(
                                    fontSize: 12,
                                    color: AppColors.primary,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),

                        // Invoice rows
                        ...unpaid.map((inv) {
                          final checked =
                              _selectedInvoiceIds.contains(inv.id);
                          return CheckboxListTile(
                            value: checked,
                            onChanged: (v) {
                              setState(() {
                                if (v == true) {
                                  _selectedInvoiceIds.add(inv.id);
                                } else {
                                  _selectedInvoiceIds.remove(inv.id);
                                }
                              });
                            },
                            activeColor: AppColors.primary,
                            checkColor: Colors.white,
                            contentPadding: const EdgeInsets.symmetric(
                                horizontal: 16, vertical: 0),
                            title: Text(
                              inv.displayNumber,
                              style: GoogleFonts.jetBrainsMono(
                                fontSize: 12,
                                fontWeight: FontWeight.w700,
                                color: AppColors.inkPrimary,
                              ),
                            ),
                            subtitle: Text(
                              inv.dueDate != null
                                  ? 'Due ${_formatDate(inv.dueDate!)}'
                                  : 'No due date',
                              style: GoogleFonts.manrope(
                                fontSize: 11,
                                color: AppColors.inkTertiary,
                              ),
                            ),
                            secondary: Text(
                              '₹${inv.outstanding.toStringAsFixed(2)}',
                              style: GoogleFonts.manrope(
                                fontSize: 13,
                                fontWeight: FontWeight.w700,
                                color: AppColors.danger,
                              ),
                            ),
                          );
                        }),

                        // Summary
                        if (_selectedInvoiceIds.isNotEmpty) ...[
                          Container(
                            height: 1,
                            color: Colors.black.withValues(alpha: 0.05),
                          ),
                          Padding(
                            padding:
                                const EdgeInsets.symmetric(
                                    horizontal: 16, vertical: 10),
                            child: Row(
                              children: [
                                const Icon(LucideIcons.checkCircle,
                                    size: 14, color: AppColors.success),
                                const SizedBox(width: 6),
                                Text(
                                  'Selected: ${_selectedInvoiceIds.length} '
                                  'invoice${_selectedInvoiceIds.length == 1 ? '' : 's'} '
                                  '· ₹${selTotal.toStringAsFixed(2)}',
                                  style: GoogleFonts.manrope(
                                    fontSize: 12,
                                    fontWeight: FontWeight.w600,
                                    color: AppColors.inkSecondary,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                        const SizedBox(height: 8),
                      ],
                    ),
                  ),
                );
              },
            ),

            const SizedBox(height: 16),
          ],
        ),
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
          child: ElevatedButton(
            onPressed: _isLoading ? null : _submit,
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.primaryContainer,
              foregroundColor: AppColors.inkPrimary,
              disabledBackgroundColor:
                  AppColors.primaryContainer.withValues(alpha: 0.4),
              elevation: 0,
              minimumSize: const Size.fromHeight(56),
              shape: const StadiumBorder(),
            ),
            child: _isLoading
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(
                        color: AppColors.inkPrimary, strokeWidth: 2.5),
                  )
                : Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Icon(LucideIcons.checkCircle, size: 18),
                      const SizedBox(width: 8),
                      Text(
                        'RECORD PAYMENT',
                        style: GoogleFonts.jetBrainsMono(
                          fontWeight: FontWeight.w700,
                          fontSize: 13,
                          letterSpacing: 1,
                        ),
                      ),
                    ],
                  ),
          ),
        ),
      ),
    );
  }
}

// ─── Client summary card ──────────────────────────────────────────────────────

class _ClientSummaryCard extends StatelessWidget {
  final Client client;
  final double outstanding;
  final int unpaidCount;

  const _ClientSummaryCard({
    required this.client,
    required this.outstanding,
    required this.unpaidCount,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.black.withValues(alpha: 0.05)),
        boxShadow: [AppColors.cardShadow],
      ),
      child: Row(
        children: [
          // Avatar
          Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(
              color: avatarBg(client.name),
              borderRadius: BorderRadius.circular(14),
            ),
            alignment: Alignment.center,
            child: Text(
              initials(client.name),
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w800,
                color: avatarColor(client.name),
              ),
            ),
          ),
          const SizedBox(width: 14),
          // Info
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  client.name ?? 'Unknown Client',
                  style: GoogleFonts.manrope(
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                    color: AppColors.inkPrimary,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  '$unpaidCount unpaid bill${unpaidCount == 1 ? '' : 's'}',
                  style: GoogleFonts.manrope(
                    fontSize: 12,
                    color: AppColors.inkTertiary,
                  ),
                ),
              ],
            ),
          ),
          // Outstanding balance
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                '₹${outstanding.toStringAsFixed(2)}',
                style: GoogleFonts.manrope(
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                  color: outstanding > 0 ? AppColors.danger : AppColors.success,
                ),
              ),
              Text(
                'outstanding',
                style: GoogleFonts.manrope(
                  fontSize: 10,
                  color: AppColors.inkTertiary,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

// ─── Section card wrapper ─────────────────────────────────────────────────────

class _SectionCard extends StatelessWidget {
  final IconData icon;
  final String title;
  final List<Widget> children;

  const _SectionCard({
    required this.icon,
    required this.title,
    required this.children,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.black.withValues(alpha: 0.05)),
        boxShadow: [AppColors.cardShadow],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
            decoration: BoxDecoration(
              border: Border(
                  bottom: BorderSide(
                      color: Colors.black.withValues(alpha: 0.05))),
            ),
            child: Row(
              children: [
                Icon(icon, size: 14, color: AppColors.primary),
                const SizedBox(width: 8),
                Text(
                  title,
                  style: GoogleFonts.jetBrainsMono(
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 1.5,
                    color: AppColors.inkPrimary,
                  ),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: children,
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Field label ──────────────────────────────────────────────────────────────

class _FieldLabel extends StatelessWidget {
  final String text;
  final bool required;
  const _FieldLabel({required this.text, this.required = false});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6, left: 2),
      child: RichText(
        text: TextSpan(children: [
          TextSpan(
            text: text.toUpperCase(),
            style: GoogleFonts.jetBrainsMono(
              fontSize: 10,
              fontWeight: FontWeight.w700,
              color: AppColors.inkTertiary,
              letterSpacing: 1,
            ),
          ),
          if (required)
            TextSpan(
              text: ' *',
              style: GoogleFonts.jetBrainsMono(
                fontSize: 11,
                fontWeight: FontWeight.w900,
                color: AppColors.primary,
              ),
            ),
        ]),
      ),
    );
  }
}

// ─── Payment method selector ──────────────────────────────────────────────────

class _MethodSelector extends StatelessWidget {
  final String selected;
  final ValueChanged<String> onChanged;

  const _MethodSelector({
    required this.selected,
    required this.onChanged,
  });

  static const methods = ['CASH', 'BANK', 'UPI', 'CHEQUE'];

  @override
  Widget build(BuildContext context) {
    return Row(
      children: methods.map((m) {
        final isSelected = m == selected;
        return Expanded(
          child: Padding(
            padding: EdgeInsets.only(
                right: m == methods.last ? 0 : 8),
            child: GestureDetector(
              onTap: () => onChanged(m),
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 140),
                padding: const EdgeInsets.symmetric(vertical: 10),
                decoration: BoxDecoration(
                  color: isSelected
                      ? AppColors.primaryContainer
                      : AppColors.canvas,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(
                    color: isSelected
                        ? AppColors.primaryContainer
                        : Colors.black.withValues(alpha: 0.1),
                    width: 1.5,
                  ),
                ),
                alignment: Alignment.center,
                child: Text(
                  m,
                  style: GoogleFonts.jetBrainsMono(
                    fontSize: 10,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 0.5,
                    color: isSelected
                        ? AppColors.inkPrimary
                        : AppColors.inkSecondary,
                  ),
                ),
              ),
            ),
          ),
        );
      }).toList(),
    );
  }
}

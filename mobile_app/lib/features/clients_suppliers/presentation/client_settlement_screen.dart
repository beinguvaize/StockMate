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

  List<Invoice> _unpaidInvoices(List<Invoice> all) => all
      .where((inv) =>
          inv.clientId == widget.client.id && inv.paymentStatus != 'PAID')
      .toList();

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

      final paymentId = 'CP-${DateTime.now().millisecondsSinceEpoch}';
      await supabase.from('client_payments').insert({
        'id': paymentId,
        'client_id': widget.client.id,
        'tenant_id': ctx.tenantId,
        'date': _date,
        'amount': amt,
        'payment_method': _method,
        'notes': _notesController.text.trim(),
        'applied_invoice_ids': _selectedInvoiceIds.toList(),
      });

      // Update client outstanding_balance
      final newBal =
          ((widget.client.outstandingBalance ?? 0) - amt)
              .clamp(0.0, double.infinity);
      await supabase
          .from('clients')
          .update({'outstanding_balance': newBal})
          .eq('id', widget.client.id)
          .eq('tenant_id', ctx.tenantId);

      // Mark selected invoices PAID / PARTIAL
      for (final invId in _selectedInvoiceIds) {
        final inv = await supabase
            .from('invoices')
            .select('grand_total, paid_amount')
            .eq('id', invId)
            .single();
        final gt = (inv['grand_total'] as num).toDouble();
        final newPaid =
            ((inv['paid_amount'] as num?)?.toDouble() ?? 0) + amt;
        await supabase.from('invoices').update({
          'paid_amount': newPaid.clamp(0, gt),
          'payment_status': newPaid >= gt ? 'PAID' : 'PARTIAL',
        }).eq('id', invId);
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
              style: GoogleFonts.inter(color: AppColors.inkPrimary),
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
              'Settle Account',
              style: GoogleFonts.hankenGrotesk(
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
              invoicesAsync: invoicesAsync,
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
                            style: GoogleFonts.inter(
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
                    style: GoogleFonts.inter(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      color: AppColors.inkPrimary,
                    ),
                    decoration: InputDecoration(
                      border: InputBorder.none,
                      contentPadding: const EdgeInsets.symmetric(
                          horizontal: 14, vertical: 12),
                      prefixText: '₹ ',
                      prefixStyle: GoogleFonts.inter(
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                        color: AppColors.primary,
                      ),
                      hintText: '0.00',
                      hintStyle: GoogleFonts.inter(
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
                        style: GoogleFonts.inter(
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
                    style: GoogleFonts.inter(
                      fontSize: 14,
                      fontWeight: FontWeight.w500,
                      color: AppColors.inkPrimary,
                    ),
                    decoration: InputDecoration(
                      border: InputBorder.none,
                      contentPadding: const EdgeInsets.symmetric(
                          horizontal: 14, vertical: 12),
                      hintText: 'Notes (optional)',
                      hintStyle: GoogleFonts.inter(
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
                final unpaid = _unpaidInvoices(allInvoices);
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
                                '${unpaid.length} unpaid invoice${unpaid.length == 1 ? '' : 's'}',
                                style: GoogleFonts.inter(
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
                                  style: GoogleFonts.inter(
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
                              style: GoogleFonts.inter(
                                fontSize: 11,
                                color: AppColors.inkTertiary,
                              ),
                            ),
                            secondary: Text(
                              '₹${inv.outstanding.toStringAsFixed(2)}',
                              style: GoogleFonts.inter(
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
                                  style: GoogleFonts.inter(
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
  final AsyncValue<List<Invoice>> invoicesAsync;

  const _ClientSummaryCard({
    required this.client,
    required this.outstanding,
    required this.invoicesAsync,
  });

  @override
  Widget build(BuildContext context) {
    final unpaidCount = invoicesAsync.whenOrNull(
          data: (all) => all
              .where((inv) =>
                  inv.clientId == client.id && inv.paymentStatus != 'PAID')
              .length,
        ) ??
        0;

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
                  style: GoogleFonts.hankenGrotesk(
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                    color: AppColors.inkPrimary,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  '$unpaidCount unpaid invoice${unpaidCount == 1 ? '' : 's'}',
                  style: GoogleFonts.inter(
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
                style: GoogleFonts.hankenGrotesk(
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                  color: outstanding > 0 ? AppColors.danger : AppColors.success,
                ),
              ),
              Text(
                'outstanding',
                style: GoogleFonts.inter(
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

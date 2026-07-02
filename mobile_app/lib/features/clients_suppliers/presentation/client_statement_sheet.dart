import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:mobile_app/features/clients_suppliers/data/models/client.dart';
import 'package:mobile_app/features/clients_suppliers/presentation/providers/crm_provider.dart';
import 'package:mobile_app/features/clients_suppliers/presentation/widgets/client_utils.dart';
import 'package:mobile_app/features/invoices/presentation/invoices_screen.dart';

// ─── Data model ───────────────────────────────────────────────────────────────
class _StatementRow {
  final String date;
  final String description;
  final double debit;   // money owed (sale or invoice)
  final double credit;  // money paid
  final String type;    // 'SALE' | 'INVOICE' | 'PAYMENT'
  double balance = 0;   // filled after sort

  _StatementRow({
    required this.date,
    required this.description,
    required this.debit,
    required this.credit,
    required this.type,
  });
}

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

// ─── Helper: today formatted as "17 May 2026" ────────────────────────────────
String _todayFormatted() {
  final now = DateTime.now();
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  return '${now.day} ${months[now.month - 1]} ${now.year}';
}

// ─── Helper: format ₹ amount with paise if non-zero ──────────────────────────
String _fmtRupee(double v) {
  if (v == 0) return '₹0';
  final whole = v.truncate();
  final s = whole.toString();
  if (s.length <= 3) {
    final paise = ((v - whole) * 100).round();
    return paise > 0 ? '₹$whole.${paise.toString().padLeft(2, '0')}' : '₹$s';
  }
  final last3 = s.substring(s.length - 3);
  final rest = s.substring(0, s.length - 3);
  final restGrouped =
      rest.replaceAllMapped(RegExp(r'(\d)(?=(\d{2})+$)'), (m) => '${m[1]},');
  return '₹$restGrouped,$last3';
}

// ─── Public entry-point ───────────────────────────────────────────────────────
/// Show the statement sheet for [client].
///
/// ```dart
/// showClientStatement(context, client);
/// ```
void showClientStatement(BuildContext context, Client client) {
  showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => ClientStatementSheet(client: client),
  );
}

// ─── Widget ───────────────────────────────────────────────────────────────────
class ClientStatementSheet extends ConsumerWidget {
  final Client client;
  const ClientStatementSheet({super.key, required this.client});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final invoicesAsync = ref.watch(invoicesProvider);
    final paymentsAsync = ref.watch(clientPaymentsForClientProvider(client.id));

    // Determine loading / error states.
    final isLoading = invoicesAsync.isLoading || paymentsAsync.isLoading;

    final error = invoicesAsync.error ?? paymentsAsync.error;

    // ── Build statement rows ──────────────────────────────────────────────────
    final rows = <_StatementRow>[];

    if (!isLoading && error == null) {
      // 1. Invoice rows (single source of truth for DR).
      //    Credit sales that also appear as invoices must NOT be added as
      //    a separate "Credit Sale" row — that causes double-counting.
      final invoices = invoicesAsync.valueOrNull ?? const [];
      for (final inv in invoices) {
        if (inv.clientId != client.id) continue;
        final dateStr = inv.invoiceDate ??
            inv.createdAt?.toIso8601String().substring(0, 10) ??
            '';
        rows.add(_StatementRow(
          date: dateStr,
          description: 'Invoice ${inv.displayNumber}',
          debit: inv.grandTotal,
          credit: 0,
          type: 'INVOICE',
        ));

        // Inline payment CR: CASH/BANK/UPI sales paid at POS time have
        // paidAmount > 0 but are NOT tracked in client_payments. Show the
        // upfront payment as a credit on the same date so the statement
        // balance matches the actual outstanding.
        final method = (inv.paymentMethod ?? '').toUpperCase();
        if (method != 'CREDIT' && inv.paidAmount > 0) {
          rows.add(_StatementRow(
            date: dateStr,
            description: 'Payment (${_methodLabel(method)})',
            debit: 0,
            credit: inv.paidAmount,
            type: 'PAYMENT',
          ));
        }
      }

      // 2. Client payment rows (post-sale cash collections).
      final payments = paymentsAsync.valueOrNull ?? const [];
      for (final payment in payments) {
        final notesSuffix = (payment.notes != null && payment.notes!.isNotEmpty)
            ? ' — ${payment.notes}'
            : '';
        rows.add(_StatementRow(
          date: payment.date,
          description: 'Payment (${_methodLabel(payment.paymentMethod)})$notesSuffix',
          debit: 0,
          credit: payment.amount,
          type: 'PAYMENT',
        ));
      }

      // Sort ascending by date string (ISO YYYY-MM-DD sorts lexicographically).
      rows.sort((a, b) => a.date.compareTo(b.date));

      // Compute running balance.
      double running = 0;
      for (final row in rows) {
        running += row.debit - row.credit;
        row.balance = running;
      }
    }

    return DraggableScrollableSheet(
      initialChildSize: 0.85,
      minChildSize: 0.5,
      maxChildSize: 0.95,
      builder: (_, scrollController) => Container(
        decoration: const BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
        ),
        child: Column(
          children: [
            // ── Drag handle ──────────────────────────────────────────────────
            Container(
              margin: const EdgeInsets.only(top: 12),
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: AppColors.outlineVariant,
                borderRadius: BorderRadius.circular(2),
              ),
            ),

            Expanded(
              child: isLoading
                  ? const Center(
                      child: CircularProgressIndicator(color: AppColors.primary),
                    )
                  : error != null
                      ? _ErrorView(message: error.toString())
                      : _StatementBody(
                          client: client,
                          rows: rows,
                          scrollController: scrollController,
                        ),
            ),
          ],
        ),
      ),
    );
  }
}

// ─── Statement body ───────────────────────────────────────────────────────────
class _StatementBody extends StatelessWidget {
  final Client client;
  final List<_StatementRow> rows;
  final ScrollController scrollController;

  const _StatementBody({
    required this.client,
    required this.rows,
    required this.scrollController,
  });

  @override
  Widget build(BuildContext context) {
    final balance = client.outstandingBalance ?? 0;

    return ListView(
      controller: scrollController,
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 40),
      children: [
        // ── Header ──────────────────────────────────────────────────────────
        _HeaderSection(client: client),

        const SizedBox(height: 20),

        // ── KPI tiles ────────────────────────────────────────────────────────
        Row(
          children: [
            _KpiTile(
              label: 'TOTAL OUTSTANDING',
              value: compactAmount(balance),
              valueColor: balance > 0 ? AppColors.danger : AppColors.success,
              icon: balance > 0 ? LucideIcons.alertCircle : LucideIcons.checkCircle2,
              iconColor: balance > 0 ? AppColors.danger : AppColors.success,
            ),
            const SizedBox(width: 10),
            _KpiTile(
              label: 'TRANSACTIONS',
              value: rows.length.toString(),
              valueColor: AppColors.inkPrimary,
              icon: LucideIcons.receipt,
              iconColor: AppColors.primary,
            ),
          ],
        ),

        const SizedBox(height: 24),

        // ── Ledger section label ──────────────────────────────────────────────
        Row(
          children: [
            const Icon(LucideIcons.bookOpen, size: 13, color: AppColors.inkTertiary),
            const SizedBox(width: 6),
            Text(
              'TRANSACTION LEDGER',
              style: GoogleFonts.jetBrainsMono(
                fontSize: 10,
                fontWeight: FontWeight.w700,
                color: AppColors.inkTertiary,
                letterSpacing: 1.2,
              ),
            ),
          ],
        ),

        const SizedBox(height: 10),

        // ── Ledger rows ───────────────────────────────────────────────────────
        if (rows.isEmpty)
          _EmptyLedger()
        else
          ...rows.map((row) => Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: _LedgerCard(row: row),
              )),
      ],
    );
  }
}

// ─── Header: title, date generated, avatar + name/contact ────────────────────
class _HeaderSection extends StatelessWidget {
  final Client client;
  const _HeaderSection({required this.client});

  @override
  Widget build(BuildContext context) {
    final color  = avatarColor(client.name);
    final bgCol  = avatarBg(client.name);
    final inits  = initials(client.name);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Title + generated date
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Account Statement',
                    style: GoogleFonts.manrope(
                      fontSize: 22,
                      fontWeight: FontWeight.w800,
                      color: AppColors.inkPrimary,
                      letterSpacing: -0.3,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    'Generated: ${_todayFormatted()}',
                    style: GoogleFonts.manrope(
                      fontSize: 12,
                      color: AppColors.inkTertiary,
                    ),
                  ),
                ],
              ),
            ),
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: AppColors.primaryContainer.withValues(alpha: 0.2),
                borderRadius: BorderRadius.circular(12),
              ),
              child: const Icon(
                LucideIcons.fileText,
                size: 20,
                color: AppColors.primary,
              ),
            ),
          ],
        ),

        const SizedBox(height: 16),

        // Avatar + name + contact
        Row(
          children: [
            Container(
              width: 52,
              height: 52,
              decoration: BoxDecoration(color: bgCol, shape: BoxShape.circle),
              child: Center(
                child: Text(
                  inits,
                  style: GoogleFonts.manrope(
                    fontSize: 18,
                    fontWeight: FontWeight.w800,
                    color: color,
                  ),
                ),
              ),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    client.name ?? 'Unknown',
                    style: GoogleFonts.manrope(
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                      color: AppColors.inkPrimary,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  if (client.phone != null && client.phone!.isNotEmpty) ...[
                    const SizedBox(height: 2),
                    Row(
                      children: [
                        const Icon(LucideIcons.phone, size: 11, color: AppColors.inkTertiary),
                        const SizedBox(width: 4),
                        Text(
                          client.phone!,
                          style: GoogleFonts.manrope(fontSize: 12, color: AppColors.inkTertiary),
                        ),
                      ],
                    ),
                  ],
                  if (client.email != null && client.email!.isNotEmpty) ...[
                    const SizedBox(height: 2),
                    Row(
                      children: [
                        const Icon(LucideIcons.mail, size: 11, color: AppColors.inkTertiary),
                        const SizedBox(width: 4),
                        Expanded(
                          child: Text(
                            client.email!,
                            style: GoogleFonts.manrope(fontSize: 12, color: AppColors.inkTertiary),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ],
    );
  }
}

// ─── KPI tile ─────────────────────────────────────────────────────────────────
class _KpiTile extends StatelessWidget {
  final String label;
  final String value;
  final Color valueColor;
  final IconData icon;
  final Color iconColor;

  const _KpiTile({
    required this.label,
    required this.value,
    required this.valueColor,
    required this.icon,
    required this.iconColor,
  });

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
        decoration: BoxDecoration(
          color: AppColors.canvas,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: AppColors.outlineVariant.withValues(alpha: 0.6)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  label,
                  style: GoogleFonts.jetBrainsMono(
                    fontSize: 8.5,
                    fontWeight: FontWeight.w700,
                    color: AppColors.inkTertiary,
                    letterSpacing: 1,
                  ),
                ),
                Icon(icon, size: 13, color: iconColor),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              value,
              style: GoogleFonts.manrope(
                fontSize: 18,
                fontWeight: FontWeight.w900,
                color: valueColor,
                letterSpacing: -0.3,
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ),
      ),
    );
  }
}

// ─── Ledger card ──────────────────────────────────────────────────────────────
class _LedgerCard extends StatelessWidget {
  final _StatementRow row;
  const _LedgerCard({required this.row});

  @override
  Widget build(BuildContext context) {
    final isDebit    = row.type == 'SALE' || row.type == 'INVOICE';
    final isCr       = row.balance <= 0;
    final balColor   = isCr ? AppColors.success : AppColors.danger;
    final balLabel   = isCr ? 'Cr' : 'Dr';

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [AppColors.cardShadow],
        border: Border.all(color: AppColors.outlineVariant.withValues(alpha: 0.4)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Top line: date | type pill
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                _fmtDate(row.date),
                style: GoogleFonts.jetBrainsMono(
                  fontSize: 10,
                  color: AppColors.inkTertiary,
                  fontWeight: FontWeight.w600,
                ),
              ),
              _TypePill(type: row.type),
            ],
          ),

          const SizedBox(height: 6),

          // Middle line: description
          Text(
            row.description,
            style: GoogleFonts.manrope(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: AppColors.inkPrimary,
            ),
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),

          const SizedBox(height: 8),

          // Divider
          Divider(
            height: 1,
            color: AppColors.outlineVariant.withValues(alpha: 0.4),
          ),

          const SizedBox(height: 8),

          // Bottom line: Dr / Cr amounts + running balance
          Row(
            children: [
              if (isDebit && row.debit > 0) ...[
                Text(
                  'Dr ${_fmtRupee(row.debit)}',
                  style: GoogleFonts.manrope(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: AppColors.danger,
                  ),
                ),
                const SizedBox(width: 12),
              ],
              if (!isDebit && row.credit > 0) ...[
                Text(
                  'Cr ${_fmtRupee(row.credit)}',
                  style: GoogleFonts.manrope(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: AppColors.success,
                  ),
                ),
                const SizedBox(width: 12),
              ],
              const Spacer(),
              // Running balance chip
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: balColor.withValues(alpha: 0.08),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  'Bal ${_fmtRupee(row.balance.abs())} $balLabel',
                  style: GoogleFonts.jetBrainsMono(
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                    color: balColor,
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  /// "2026-05-17" → "17 May 2026"
  static String _fmtDate(String iso) {
    if (iso.length < 10) return iso;
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
}

// ─── Type pill ────────────────────────────────────────────────────────────────
class _TypePill extends StatelessWidget {
  final String type; // 'SALE' | 'INVOICE' | 'PAYMENT'
  const _TypePill({required this.type});

  @override
  Widget build(BuildContext context) {
    final isPayment = type == 'PAYMENT';
    final bg    = isPayment
        ? AppColors.success.withValues(alpha: 0.12)
        : AppColors.danger.withValues(alpha: 0.10);
    final fg    = isPayment ? AppColors.success : AppColors.danger;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(99),
      ),
      child: Text(
        type,
        style: GoogleFonts.jetBrainsMono(
          fontSize: 9,
          fontWeight: FontWeight.w700,
          color: fg,
          letterSpacing: 1,
        ),
      ),
    );
  }
}

// ─── Empty ledger state ───────────────────────────────────────────────────────
class _EmptyLedger extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 40),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: AppColors.surfaceContainer,
              shape: BoxShape.circle,
            ),
            child: const Icon(
              LucideIcons.receipt,
              size: 32,
              color: AppColors.inkTertiary,
            ),
          ),
          const SizedBox(height: 16),
          Text(
            'No transaction history for this client.',
            style: GoogleFonts.manrope(
              fontSize: 15,
              fontWeight: FontWeight.w600,
              color: AppColors.inkSecondary,
            ),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 4),
          Text(
            'Credit sales, invoices and payments will appear here.',
            style: GoogleFonts.manrope(fontSize: 12, color: AppColors.inkTertiary),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }
}

// ─── Error view ───────────────────────────────────────────────────────────────
class _ErrorView extends StatelessWidget {
  final String message;
  const _ErrorView({required this.message});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(LucideIcons.alertTriangle, size: 36, color: AppColors.danger),
            const SizedBox(height: 12),
            Text(
              'Failed to load statement',
              style: GoogleFonts.manrope(
                fontSize: 16,
                fontWeight: FontWeight.w700,
                color: AppColors.inkPrimary,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              message,
              style: GoogleFonts.manrope(fontSize: 12, color: AppColors.inkTertiary),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}

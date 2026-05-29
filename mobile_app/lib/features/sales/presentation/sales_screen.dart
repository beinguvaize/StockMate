import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:mobile_app/features/invoices/data/models/invoice.dart';
import 'package:mobile_app/features/invoices/presentation/invoice_detail_screen.dart';
import 'package:mobile_app/features/sales/presentation/providers/sales_provider.dart';
import 'package:mobile_app/features/clients_suppliers/presentation/providers/crm_provider.dart';

class SalesScreen extends ConsumerStatefulWidget {
  const SalesScreen({super.key});

  @override
  ConsumerState<SalesScreen> createState() => _SalesScreenState();
}

class _SalesScreenState extends ConsumerState<SalesScreen> {
  int _filterIndex = 0; // 0=All, 1=Paid, 2=Credit

  @override
  Widget build(BuildContext context) {
    final salesAsync = ref.watch(recentSalesProvider);
    final filters = ['All', 'Paid', 'Credit'];

    return Scaffold(
      backgroundColor: AppColors.canvas,
      appBar: AppBar(
        backgroundColor: AppColors.canvas,
        elevation: 0,
        scrolledUnderElevation: 0,
        toolbarHeight: 0,
        actions: const [],
      ),
      // FAB provided by DashboardScreen's shell when sales tab is active.
      // Avoids stacked duplicate FABs.
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // ── Header ─────────────────────────────────────────────
            // Title only — "New Sale" action lives on the shell-level FAB
            // (see DashboardScreen build). Keeping a second button here
            // duplicates the action and visually collides with the global
            // SyncStatusPill rendered just above this row.
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 20, 24, 0),
              child: Text(
                'Sales History',
                style: GoogleFonts.hankenGrotesk(
                  fontSize: 28,
                  fontWeight: FontWeight.w700,
                  color: AppColors.inkPrimary,
                  letterSpacing: -0.3,
                ),
              ),
            ),

            const SizedBox(height: 20),

            // ── Stats row ──────────────────────────────────────────
            salesAsync.maybeWhen(
              data: (sales) {
                final today = DateTime.now();
                final todayStr = '${today.year}-${today.month.toString().padLeft(2, '0')}-${today.day.toString().padLeft(2, '0')}';
                // DB may return DATE as "2026-05-27" or TIMESTAMP as
                // "2026-05-27T00:00:00". startsWith handles both.
                final todaySales = sales.where((s) => (s.date ?? '').startsWith(todayStr)).toList();
                final total = todaySales.fold(0.0, (sum, s) => sum + (s.totalAmount ?? 0));
                final txCount = todaySales.length;
                return Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 24),
                  child: Row(
                    children: [
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
                                'TOTAL TODAY',
                                style: GoogleFonts.jetBrainsMono(
                                  fontSize: 10,
                                  color: AppColors.inkTertiary,
                                  letterSpacing: 0.5,
                                ),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                '₹${total.toStringAsFixed(0)}',
                                style: GoogleFonts.hankenGrotesk(
                                  fontSize: 28,
                                  fontWeight: FontWeight.w700,
                                  color: AppColors.danger,
                                  letterSpacing: -0.5,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                      const SizedBox(width: 12),
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
                                'TRANSACTIONS',
                                style: GoogleFonts.jetBrainsMono(
                                  fontSize: 10,
                                  color: AppColors.inkTertiary,
                                  letterSpacing: 0.5,
                                ),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                '$txCount',
                                style: GoogleFonts.hankenGrotesk(
                                  fontSize: 28,
                                  fontWeight: FontWeight.w700,
                                  color: AppColors.inkPrimary,
                                  letterSpacing: -0.5,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                );
              },
              orElse: () => const SizedBox.shrink(),
            ),

            const SizedBox(height: 24),

            // ── Filter chips ────────────────────────────────────────
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      'Recent Sales',
                      style: GoogleFonts.hankenGrotesk(
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                        color: AppColors.inkPrimary,
                      ),
                    ),
                  ),
                  Row(
                    children: List.generate(filters.length, (i) {
                      final isActive = _filterIndex == i;
                      return Padding(
                        padding: EdgeInsets.only(left: i == 0 ? 0 : 8),
                        child: GestureDetector(
                          onTap: () => setState(() => _filterIndex = i),
                          child: AnimatedContainer(
                            duration: const Duration(milliseconds: 200),
                            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                            decoration: BoxDecoration(
                              color: isActive ? AppColors.primaryContainer : Colors.white,
                              borderRadius: BorderRadius.circular(100),
                              boxShadow: [AppColors.cardShadow],
                            ),
                            child: Text(
                              filters[i],
                              style: GoogleFonts.inter(
                                fontSize: 12,
                                fontWeight: FontWeight.w600,
                                color: isActive ? AppColors.primary : AppColors.inkTertiary,
                              ),
                            ),
                          ),
                        ),
                      );
                    }),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 16),

            // ── Sales list ──────────────────────────────────────────
            Expanded(
              child: salesAsync.when(
                data: (allSales) {
                  final sales = allSales.where((s) {
                    if (_filterIndex == 1) return s.paymentStatus == 'PAID';
                    if (_filterIndex == 2) return s.paymentStatus != 'PAID';
                    return true;
                  }).toList();

                  if (sales.isEmpty) {
                    return Center(
                      child: Text(
                        'No sales found.',
                        style: GoogleFonts.inter(color: AppColors.inkTertiary),
                      ),
                    );
                  }

                  // Resolve client name from clientsProvider when sale.shopId is set
                  // (RPC-created sales don't carry customerInfo — only shopId).
                  final clientsAsync = ref.watch(clientsProvider);
                  final clientById = <String, String>{};
                  if (clientsAsync.hasValue) {
                    for (final c in clientsAsync.value!) {
                      clientById[c.id] = c.name ?? '';
                    }
                  }

                  return ListView.separated(
                    padding: const EdgeInsets.fromLTRB(24, 0, 24, 100),
                    itemCount: sales.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 12),
                    itemBuilder: (context, index) {
                      final sale = sales[index];
                      final resolvedFromShop = (sale.shopId != null)
                          ? clientById[sale.shopId!]
                          : null;
                      final customerName = (resolvedFromShop != null && resolvedFromShop.isNotEmpty)
                          ? resolvedFromShop
                          : sale.displayCustomerName;
                      final isPaid = sale.paymentStatus == 'PAID';
                      final initial = customerName.isNotEmpty ? customerName[0].toUpperCase() : 'W';

                      return GestureDetector(
                        onTap: () => Navigator.push(
                          context,
                          MaterialPageRoute(builder: (_) => InvoiceDetailScreen(invoice: Invoice.fromSale(sale))),
                        ),
                        child: Container(
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(20),
                          boxShadow: [AppColors.cardShadow],
                        ),
                        child: Row(
                          children: [
                            // Avatar
                            Container(
                              width: 44,
                              height: 44,
                              decoration: const BoxDecoration(
                                color: AppColors.secondaryContainer,
                                shape: BoxShape.circle,
                              ),
                              child: Center(
                                child: Text(
                                  initial,
                                  style: GoogleFonts.hankenGrotesk(
                                    fontSize: 18,
                                    fontWeight: FontWeight.w700,
                                    color: AppColors.secondary,
                                  ),
                                ),
                              ),
                            ),
                            const SizedBox(width: 14),

                            // Name + invoice ID
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    customerName,
                                    style: GoogleFonts.hankenGrotesk(
                                      fontSize: 15,
                                      fontWeight: FontWeight.w600,
                                      color: AppColors.inkPrimary,
                                    ),
                                  ),
                                  const SizedBox(height: 2),
                                  Text(
                                    '#${sale.id.substring(0, 8).toUpperCase()}',
                                    style: GoogleFonts.jetBrainsMono(
                                      fontSize: 11,
                                      color: AppColors.inkTertiary,
                                    ),
                                  ),
                                  if (sale.date != null) ...[
                                    const SizedBox(height: 2),
                                    Text(
                                      _fmtDate(sale.date!),
                                      style: GoogleFonts.inter(
                                        fontSize: 11,
                                        color: AppColors.inkTertiary,
                                      ),
                                    ),
                                  ],
                                ],
                              ),
                            ),

                            // Amount + status badge
                            Column(
                              crossAxisAlignment: CrossAxisAlignment.end,
                              children: [
                                Text(
                                  '₹${sale.totalAmount?.toStringAsFixed(0) ?? "0"}',
                                  style: GoogleFonts.hankenGrotesk(
                                    fontSize: 16,
                                    fontWeight: FontWeight.w700,
                                    color: AppColors.success,
                                  ),
                                ),
                                const SizedBox(height: 4),
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                  decoration: BoxDecoration(
                                    color: isPaid
                                        ? AppColors.success.withValues(alpha: 0.12)
                                        : AppColors.warning.withValues(alpha: 0.12),
                                    borderRadius: BorderRadius.circular(8),
                                  ),
                                  child: Text(
                                    isPaid ? 'Paid' : 'Credit',
                                    style: GoogleFonts.inter(
                                      fontSize: 10,
                                      fontWeight: FontWeight.w700,
                                      color: isPaid ? AppColors.success : AppColors.warning,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                      );
                    },
                  );
                },
                loading: () => const Center(child: CircularProgressIndicator(color: AppColors.primary)),
                error: (err, stack) => Center(
                  child: Text('Error: $err', style: GoogleFonts.inter(color: AppColors.danger)),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  static const _months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  String _fmtDate(String dateStr) {
    try {
      final d = DateTime.parse(dateStr);
      return '${d.day} ${_months[d.month - 1]} ${d.year}';
    } catch (_) {
      return dateStr;
    }
  }
}

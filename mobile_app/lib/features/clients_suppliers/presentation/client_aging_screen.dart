import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:mobile_app/features/clients_suppliers/data/models/client.dart';
import 'package:mobile_app/features/clients_suppliers/presentation/providers/crm_provider.dart';
import 'package:mobile_app/features/clients_suppliers/presentation/widgets/client_utils.dart';
import 'package:mobile_app/features/sales/presentation/providers/sales_provider.dart';
import 'package:mobile_app/features/clients_suppliers/presentation/client_settlement_screen.dart';

// ─── Aging bucket data ────────────────────────────────────────────────────────
class _AgingBuckets {
  final double current;   // 0–30 days
  final double overdue30; // 31–60 days
  final double overdue60; // 61–90 days
  final double overdue90; // 90+ days

  const _AgingBuckets({
    this.current = 0,
    this.overdue30 = 0,
    this.overdue60 = 0,
    this.overdue90 = 0,
  });

  double get total => current + overdue30 + overdue60 + overdue90;
  bool get hasAny => total > 0;
}

class _ClientAgingEntry {
  final Client client;
  final _AgingBuckets buckets;
  const _ClientAgingEntry({required this.client, required this.buckets});
}

// ─── Main screen ──────────────────────────────────────────────────────────────
class ClientAgingScreen extends ConsumerWidget {
  const ClientAgingScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final clientsAsync  = ref.watch(clientsProvider);
    final salesAsync    = ref.watch(recentSalesProvider);
    final paymentsAsync = ref.watch(clientPaymentsProvider);

    final isLoading = clientsAsync.isLoading || salesAsync.isLoading || paymentsAsync.isLoading;

    if (isLoading) {
      return Scaffold(
        backgroundColor: AppColors.canvas,
        appBar: _buildAppBar(context),
        body: const Center(child: CircularProgressIndicator(color: AppColors.primary)),
      );
    }

    final clients  = clientsAsync.valueOrNull  ?? const [];
    final sales    = salesAsync.valueOrNull    ?? const [];
    final payments = paymentsAsync.valueOrNull ?? const [];

    final now = DateTime.now();

    // Build per-client aging entries using FIFO algorithm.
    final entries = <_ClientAgingEntry>[];

    for (final client in clients) {
      // 1. Get credit sales for this client, sorted oldest-first.
      final creditSales = sales
          .where((s) =>
              s.shopId == client.id &&
              (s.paymentMethod?.toUpperCase() == 'CREDIT'))
          .toList()
        ..sort((a, b) {
          final da = a.date ?? '';
          final db = b.date ?? '';
          return da.compareTo(db);
        });

      if (creditSales.isEmpty) continue;

      // 2. Sum all payments for this client.
      final totalPaid = payments
          .where((p) => p.clientId == client.id)
          .fold(0.0, (sum, p) => sum + p.amount);

      // 3. Walk sales oldest-first, applying FIFO payment offset.
      double remainingPaid = totalPaid;
      double bucketCurrent  = 0;
      double bucketOver30   = 0;
      double bucketOver60   = 0;
      double bucketOver90   = 0;

      for (final sale in creditSales) {
        final saleAmount = sale.totalAmount ?? 0;
        if (saleAmount <= 0) continue;

        final applied = remainingPaid.clamp(0.0, saleAmount);
        final unpaid  = saleAmount - applied;
        remainingPaid = (remainingPaid - saleAmount).clamp(0.0, double.infinity);

        if (unpaid <= 0) continue;

        // Compute age in days.
        int daysOld = 0;
        if (sale.date != null) {
          try {
            final saleDate = DateTime.parse(sale.date!);
            daysOld = now.difference(saleDate).inDays;
          } catch (_) {
            daysOld = 0;
          }
        }

        if (daysOld <= 30) {
          bucketCurrent += unpaid;
        } else if (daysOld <= 60) {
          bucketOver30 += unpaid;
        } else if (daysOld <= 90) {
          bucketOver60 += unpaid;
        } else {
          bucketOver90 += unpaid;
        }
      }

      final buckets = _AgingBuckets(
        current:   bucketCurrent,
        overdue30: bucketOver30,
        overdue60: bucketOver60,
        overdue90: bucketOver90,
      );

      if (buckets.hasAny) {
        entries.add(_ClientAgingEntry(client: client, buckets: buckets));
      }
    }

    // Sort by total owed descending.
    entries.sort((a, b) => b.buckets.total.compareTo(a.buckets.total));

    // Aggregate KPI totals.
    double kpiCurrent  = 0;
    double kpiOver30   = 0;
    double kpiOver60   = 0;
    double kpiOver90   = 0;
    for (final e in entries) {
      kpiCurrent  += e.buckets.current;
      kpiOver30   += e.buckets.overdue30;
      kpiOver60   += e.buckets.overdue60;
      kpiOver90   += e.buckets.overdue90;
    }

    return Scaffold(
      backgroundColor: AppColors.canvas,
      appBar: _buildAppBar(context),
      body: entries.isEmpty
          ? _EmptyState()
          : CustomScrollView(
              slivers: [
                // ── KPI grid ─────────────────────────────────────────────────
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(20, 20, 20, 0),
                    child: GridView.count(
                      crossAxisCount: 2,
                      childAspectRatio: 1.8,
                      crossAxisSpacing: 12,
                      mainAxisSpacing: 12,
                      shrinkWrap: true,
                      physics: const NeverScrollableScrollPhysics(),
                      children: [
                        _KpiCard(
                          label: '0–30 Days',
                          amount: kpiCurrent,
                          count: entries.where((e) => e.buckets.current > 0).length,
                          color: const Color(0xFF059669),
                          bgColor: const Color(0xFF059669),
                          icon: LucideIcons.clock,
                        ),
                        _KpiCard(
                          label: '31–60 Days',
                          amount: kpiOver30,
                          count: entries.where((e) => e.buckets.overdue30 > 0).length,
                          color: const Color(0xFFF59E0B),
                          bgColor: const Color(0xFFF59E0B),
                          icon: LucideIcons.alertTriangle,
                        ),
                        _KpiCard(
                          label: '61–90 Days',
                          amount: kpiOver60,
                          count: entries.where((e) => e.buckets.overdue60 > 0).length,
                          color: const Color(0xFFEA580C),
                          bgColor: const Color(0xFFEA580C),
                          icon: LucideIcons.alertOctagon,
                        ),
                        _KpiCard(
                          label: '90+ Days',
                          amount: kpiOver90,
                          count: entries.where((e) => e.buckets.overdue90 > 0).length,
                          color: const Color(0xFFDC2626),
                          bgColor: const Color(0xFFDC2626),
                          icon: LucideIcons.xCircle,
                        ),
                      ],
                    ),
                  ),
                ),

                // ── Section header ────────────────────────────────────────────
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(20, 24, 20, 10),
                    child: Row(
                      children: [
                        const Icon(LucideIcons.users, size: 14, color: AppColors.inkTertiary),
                        const SizedBox(width: 6),
                        Text(
                          'CLIENT BREAKDOWN',
                          style: GoogleFonts.jetBrainsMono(
                            fontSize: 10,
                            fontWeight: FontWeight.w700,
                            color: AppColors.inkTertiary,
                            letterSpacing: 1.2,
                          ),
                        ),
                        const SizedBox(width: 8),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                          decoration: BoxDecoration(
                            color: AppColors.danger.withValues(alpha: 0.1),
                            borderRadius: BorderRadius.circular(99),
                          ),
                          child: Text(
                            '${entries.length}',
                            style: GoogleFonts.jetBrainsMono(
                              fontSize: 9,
                              fontWeight: FontWeight.w700,
                              color: AppColors.danger,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),

                // ── Client list ───────────────────────────────────────────────
                SliverList(
                  delegate: SliverChildBuilderDelegate(
                    (ctx, i) {
                      final entry = entries[i];
                      final isLast = i == entries.length - 1;
                      return Padding(
                        padding: EdgeInsets.fromLTRB(20, 0, 20, isLast ? 40 : 10),
                        child: _ClientAgingCard(entry: entry),
                      );
                    },
                    childCount: entries.length,
                  ),
                ),
              ],
            ),
    );
  }

  PreferredSizeWidget _buildAppBar(BuildContext context) {
    return AppBar(
      backgroundColor: Colors.white,
      elevation: 0,
      scrolledUnderElevation: 0,
      surfaceTintColor: Colors.transparent,
      leading: IconButton(
        onPressed: () => Navigator.of(context).pop(),
        icon: Container(
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(
            color: AppColors.canvas,
            borderRadius: BorderRadius.circular(12),
          ),
          child: const Icon(LucideIcons.arrowLeft, size: 18, color: AppColors.inkPrimary),
        ),
      ),
      title: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Aging Report',
            style: GoogleFonts.hankenGrotesk(
              fontSize: 18,
              fontWeight: FontWeight.w800,
              color: AppColors.inkPrimary,
              letterSpacing: -0.3,
            ),
          ),
          Text(
            'Outstanding credit balances by age',
            style: GoogleFonts.inter(
              fontSize: 11,
              color: AppColors.inkTertiary,
            ),
          ),
        ],
      ),
      titleSpacing: 0,
    );
  }
}

// ─── KPI card ─────────────────────────────────────────────────────────────────
class _KpiCard extends StatelessWidget {
  final String label;
  final double amount;
  final int count;
  final Color color;
  final Color bgColor;
  final IconData icon;

  const _KpiCard({
    required this.label,
    required this.amount,
    required this.count,
    required this.color,
    required this.bgColor,
    required this.icon,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        boxShadow: [AppColors.cardShadow],
        border: Border.all(color: color.withValues(alpha: 0.15)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Flexible(
                child: Text(
                  label,
                  style: GoogleFonts.jetBrainsMono(
                    fontSize: 9,
                    fontWeight: FontWeight.w700,
                    color: AppColors.inkTertiary,
                    letterSpacing: 0.5,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              Container(
                padding: const EdgeInsets.all(5),
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Icon(icon, size: 12, color: color),
              ),
            ],
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                compactAmount(amount),
                style: GoogleFonts.hankenGrotesk(
                  fontSize: 17,
                  fontWeight: FontWeight.w900,
                  color: color,
                  letterSpacing: -0.4,
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
              const SizedBox(height: 1),
              Text(
                '$count account${count == 1 ? '' : 's'}',
                style: GoogleFonts.inter(
                  fontSize: 10,
                  color: AppColors.inkTertiary,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

// ─── Client aging card ────────────────────────────────────────────────────────
class _ClientAgingCard extends StatelessWidget {
  final _ClientAgingEntry entry;

  const _ClientAgingCard({required this.entry});

  @override
  Widget build(BuildContext context) {
    final client  = entry.client;
    final buckets = entry.buckets;
    final aColor  = avatarColor(client.name);
    final aBg     = avatarBg(client.name);

    return GestureDetector(
      onTap: () {
        Navigator.push(
          context,
          MaterialPageRoute(
            builder: (_) => ClientSettlementScreen(client: client),
          ),
        );
      },
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(20),
          boxShadow: [AppColors.cardShadow],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // ── Header row: avatar + name + contact + total owed chip ──────
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Avatar
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(color: aBg, shape: BoxShape.circle),
                  child: Center(
                    child: Text(
                      initials(client.name),
                      style: GoogleFonts.hankenGrotesk(
                        fontSize: 15,
                        fontWeight: FontWeight.w800,
                        color: aColor,
                      ),
                    ),
                  ),
                ),

                const SizedBox(width: 12),

                // Name + contact
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        client.name ?? 'Unknown',
                        style: GoogleFonts.hankenGrotesk(
                          fontSize: 15,
                          fontWeight: FontWeight.w700,
                          color: AppColors.inkPrimary,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 2),
                      if (client.phone != null)
                        Row(
                          children: [
                            const Icon(LucideIcons.phone, size: 10, color: AppColors.inkTertiary),
                            const SizedBox(width: 3),
                            Text(
                              client.phone!,
                              style: GoogleFonts.inter(fontSize: 11, color: AppColors.inkTertiary),
                            ),
                          ],
                        )
                      else if (client.email != null)
                        Row(
                          children: [
                            const Icon(LucideIcons.mail, size: 10, color: AppColors.inkTertiary),
                            const SizedBox(width: 3),
                            Expanded(
                              child: Text(
                                client.email!,
                                style: GoogleFonts.inter(fontSize: 11, color: AppColors.inkTertiary),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                          ],
                        ),
                    ],
                  ),
                ),

                const SizedBox(width: 8),

                // Total owed chip
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                      decoration: BoxDecoration(
                        color: AppColors.danger.withValues(alpha: 0.08),
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: AppColors.danger.withValues(alpha: 0.2)),
                      ),
                      child: Text(
                        compactAmount(buckets.total),
                        style: GoogleFonts.hankenGrotesk(
                          fontSize: 13,
                          fontWeight: FontWeight.w800,
                          color: AppColors.danger,
                        ),
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      'Total Owed',
                      style: GoogleFonts.inter(
                        fontSize: 9,
                        color: AppColors.inkTertiary,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                ),
              ],
            ),

            const SizedBox(height: 14),

            // ── Bucket breakdown row ──────────────────────────────────────────
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              decoration: BoxDecoration(
                color: AppColors.canvas,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: AppColors.outlineVariant.withValues(alpha: 0.5)),
              ),
              child: Row(
                children: [
                  _BucketCell(
                    label: '0–30d',
                    amount: buckets.current,
                    color: const Color(0xFF059669),
                  ),
                  _BucketDivider(),
                  _BucketCell(
                    label: '31–60d',
                    amount: buckets.overdue30,
                    color: const Color(0xFFF59E0B),
                  ),
                  _BucketDivider(),
                  _BucketCell(
                    label: '61–90d',
                    amount: buckets.overdue60,
                    color: const Color(0xFFEA580C),
                  ),
                  _BucketDivider(),
                  _BucketCell(
                    label: '90+d',
                    amount: buckets.overdue90,
                    color: const Color(0xFFDC2626),
                  ),
                ],
              ),
            ),

            // Tap hint
            const SizedBox(height: 10),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                Text(
                  'View settlement',
                  style: GoogleFonts.inter(
                    fontSize: 10,
                    color: AppColors.primary,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(width: 3),
                const Icon(LucideIcons.chevronRight, size: 12, color: AppColors.primary),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _BucketDivider extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      width: 1,
      height: 28,
      margin: const EdgeInsets.symmetric(horizontal: 8),
      color: AppColors.outlineVariant.withValues(alpha: 0.5),
    );
  }
}

class _BucketCell extends StatelessWidget {
  final String label;
  final double amount;
  final Color color;

  const _BucketCell({
    required this.label,
    required this.amount,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    final hasAmount = amount > 0;
    return Expanded(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Text(
            label,
            style: GoogleFonts.jetBrainsMono(
              fontSize: 8,
              fontWeight: FontWeight.w600,
              color: AppColors.inkTertiary,
              letterSpacing: 0.3,
            ),
          ),
          const SizedBox(height: 3),
          Text(
            hasAmount ? compactAmount(amount) : '—',
            style: GoogleFonts.hankenGrotesk(
              fontSize: 12,
              fontWeight: hasAmount ? FontWeight.w800 : FontWeight.w500,
              color: hasAmount ? color : AppColors.inkTertiary,
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }
}

// ─── Empty state ──────────────────────────────────────────────────────────────
class _EmptyState extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(40),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              padding: const EdgeInsets.all(24),
              decoration: const BoxDecoration(
                color: AppColors.surfaceContainer,
                shape: BoxShape.circle,
              ),
              child: const Icon(
                LucideIcons.checkCircle2,
                size: 36,
                color: Color(0xFF059669),
              ),
            ),
            const SizedBox(height: 20),
            Text(
              'All accounts are current.',
              style: GoogleFonts.hankenGrotesk(
                fontSize: 17,
                fontWeight: FontWeight.w700,
                color: AppColors.inkPrimary,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 6),
            Text(
              'No outstanding balances.',
              style: GoogleFonts.inter(
                fontSize: 13,
                color: AppColors.inkTertiary,
              ),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}

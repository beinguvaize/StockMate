import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:mobile_app/features/clients_suppliers/data/models/client.dart';
import 'package:mobile_app/features/clients_suppliers/data/receivable_aging.dart';
import 'package:mobile_app/features/clients_suppliers/presentation/providers/receivable_aging_provider.dart';
import 'package:mobile_app/features/clients_suppliers/presentation/widgets/aging_widgets.dart';
import 'package:mobile_app/features/clients_suppliers/presentation/widgets/client_utils.dart';
import 'package:mobile_app/features/clients_suppliers/presentation/client_settlement_screen.dart';
import 'package:mobile_app/features/reports/utils/financial_calcs.dart' show formatINR;
import 'package:mobile_app/core/widgets/app_button.dart';
import 'package:mobile_app/core/theme/typography.dart';

// ─── Main screen ──────────────────────────────────────────────────────────────
//
// Reads get_unpaid_sales through receivableAgingProvider. It used to rebuild
// dues from the newest 500 sales and payments, for CREDIT sales only, which
// showed Rs 3,941 for a shop whose customers owed Rs 73,819.
class ClientAgingScreen extends ConsumerWidget {
  const ClientAgingScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      backgroundColor: AppColors.canvas,
      appBar: _buildAppBar(context, ref),
      body: AgingLoader(builder: (data) => _Body(data)),
    );
  }

  PreferredSizeWidget _buildAppBar(BuildContext context, WidgetRef ref) {
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
            'Customer Aging',
            style: GoogleFonts.manrope(
              fontSize: 18,
              fontWeight: FontWeight.w800,
              color: AppColors.inkPrimary,
              letterSpacing: -0.3,
            ),
          ),
          Text(
            'Who owes you, and for how long',
            style: AppText.caption.copyWith(color: AppColors.inkTertiary),
          ),
        ],
      ),
      titleSpacing: 0,
      actions: [
        IconButton(
          tooltip: 'Refresh',
          icon: const Icon(LucideIcons.refreshCw, size: 18, color: AppColors.inkPrimary),
          onPressed: () => ref.invalidate(receivableAgingProvider),
        ),
      ],
    );
  }
}

class _Body extends StatelessWidget {
  final ReceivableAgingData data;
  const _Body(this.data);

  @override
  Widget build(BuildContext context) {
    final a = data.aging;
    if (a.bills.isEmpty) return AgingNothingUnpaid(a);
    int accounts(String b) => a.customers.where((c) => (c.buckets[b] ?? 0) > 0).length;
    final tiles = <Widget>[
      _KpiCard(
        label: 'Customers owe',
        amount: a.total,
        count: a.customers.length,
        color: AppColors.inkPrimary,
        icon: LucideIcons.wallet,
      ),
      for (final b in ageBuckets)
        _KpiCard(
          label: '$b days',
          amount: a.totals[b] ?? 0,
          count: accounts(b),
          color: ageBucketColor(b),
          icon: LucideIcons.clock,
        ),
    ];

    return CustomScrollView(
      slivers: [
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
            child: AgingTieOut(a),
          ),
        ),
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 14, 20, 0),
            child: Column(
              children: [
                for (var i = 0; i < tiles.length; i += 2) ...[
                  if (i > 0) const SizedBox(height: 12),
                  // Height follows the text, so a large system font wraps
                  // instead of overflowing a fixed-ratio cell.
                  IntrinsicHeight(
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Expanded(child: tiles[i]),
                        const SizedBox(width: 12),
                        Expanded(child: tiles[i + 1]),
                      ],
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 24, 20, 10),
            child: Row(
              children: [
                const Icon(LucideIcons.users, size: 14, color: AppColors.inkTertiary),
                const SizedBox(width: 6),
                Text(
                  'BY CUSTOMER',
                  style: AppText.label.copyWith(fontWeight: FontWeight.w700,
                    color: AppColors.inkTertiary,
                    letterSpacing: 1.2),
                ),
                const SizedBox(width: 8),
                Text(
                  '${a.customers.length}',
                  style: AppText.label.copyWith(fontWeight: FontWeight.w700,
                    color: AppColors.inkTertiary),
                ),
              ],
            ),
          ),
        ),
        SliverList(
          delegate: SliverChildBuilderDelegate(
            (ctx, i) {
              final c = a.customers[i];
              return Padding(
                padding: EdgeInsets.fromLTRB(20, 0, 20, i == a.customers.length - 1 ? 40 : 10),
                child: _CustomerCard(entry: c, client: data.clientsById[c.clientId]),
              );
            },
            childCount: a.customers.length,
          ),
        ),
      ],
    );
  }
}

// ─── KPI card ─────────────────────────────────────────────────────────────────
class _KpiCard extends StatelessWidget {
  final String label;
  final double amount;
  final int count;
  final Color color;
  final IconData icon;

  const _KpiCard({
    required this.label,
    required this.amount,
    required this.count,
    required this.color,
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
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Flexible(
                child: Text(
                  label,
                  style: AppText.label.copyWith(fontWeight: FontWeight.w700,
                    color: AppColors.inkTertiary,
                    letterSpacing: 0.5),
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
          const SizedBox(height: 6),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                compactAmount(amount),
                semanticsLabel: formatINR(amount),
                style: AppText.heading.copyWith(fontWeight: FontWeight.w900,
                  color: color,
                  letterSpacing: -0.4),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
              const SizedBox(height: 1),
              Text(
                '$count account${count == 1 ? '' : 's'}',
                style: AppText.caption.copyWith(color: AppColors.inkTertiary,
                  fontWeight: FontWeight.w500),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

// ─── Customer card ────────────────────────────────────────────────────────────
class _CustomerCard extends StatelessWidget {
  final AgedCustomer entry;
  // Null for a sale with no customer record: nothing to settle against.
  final Client? client;

  const _CustomerCard({required this.entry, required this.client});

  @override
  Widget build(BuildContext context) {
    final name = entry.clientName;
    final client = this.client;
    final card = Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        boxShadow: [AppColors.cardShadow],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(color: avatarBg(name), shape: BoxShape.circle),
                child: Center(
                  child: Text(
                    initials(name),
                    style: AppText.bodyStrong.copyWith(fontWeight: FontWeight.w800,
                      color: avatarColor(name)),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      name,
                      style: AppText.bodyStrong.copyWith(fontWeight: FontWeight.w700,
                        color: AppColors.inkPrimary),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '${entry.bills} bill${entry.bills == 1 ? '' : 's'} · oldest ${entry.oldest} days',
                      style: AppText.caption.copyWith(color: AppColors.inkTertiary),
                    ),
                    if (entry.phone.isNotEmpty)
                      Row(
                        children: [
                          const Icon(LucideIcons.phone, size: 10, color: AppColors.inkTertiary),
                          const SizedBox(width: 3),
                          Text(
                            entry.phone,
                            style: AppText.caption.copyWith(color: AppColors.inkTertiary),
                          ),
                        ],
                      ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    compactAmount(entry.total),
                    style: AppText.bodyStrong.copyWith(fontWeight: FontWeight.w800,
                      color: AppColors.inkPrimary),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    'Total owed',
                    style: AppText.caption.copyWith(color: AppColors.inkTertiary,
                      fontWeight: FontWeight.w500),
                  ),
                ],
              ),
            ],
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              for (final b in ageBuckets)
                if ((entry.buckets[b] ?? 0) > 0) AgingBucketPill(b, amount: entry.buckets[b]),
            ],
          ),
          if (client != null) ...[
            const SizedBox(height: 10),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                Text('View settlement', style: AppText.label.copyWith(color: AppColors.primary)),
                const SizedBox(width: 3),
                const Icon(LucideIcons.chevronRight, size: 12, color: AppColors.primary),
              ],
            ),
          ],
        ],
      ),
    );
    if (client == null) return card;
    return AppTappable(
      ripple: false,
      onTap: () => Navigator.push(
        context,
        MaterialPageRoute(builder: (_) => ClientSettlementScreen(client: client)),
      ),
      child: card,
    );
  }
}

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:mobile_app/features/clients_suppliers/data/models/client_payment.dart';
import 'package:mobile_app/features/clients_suppliers/presentation/providers/crm_provider.dart';
import 'package:mobile_app/features/clients_suppliers/presentation/widgets/client_utils.dart';

// ─── Payment method metadata ──────────────────────────────────────────────────
class _MethodMeta {
  final Color color;
  final String label;
  const _MethodMeta({required this.color, required this.label});
}

const _methodMeta = <String, _MethodMeta>{
  'CASH':   _MethodMeta(color: Color(0xFF059669), label: 'Cash'),
  'CARD':   _MethodMeta(color: Color(0xFF2563EB), label: 'Card'),
  'UPI':    _MethodMeta(color: Color(0xFF7C3AED), label: 'UPI'),
  'BANK':   _MethodMeta(color: Color(0xFF0891B2), label: 'Bank Transfer'),
  'CHEQUE': _MethodMeta(color: Color(0xFFB45309), label: 'Cheque'),
};

_MethodMeta _meta(String method) =>
    _methodMeta[method.toUpperCase()] ??
    const _MethodMeta(color: Color(0xFF727a64), label: 'Other');

// ─── Date formatter ───────────────────────────────────────────────────────────
String _formatDate(String isoDate) {
  final months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  try {
    final d = DateTime.parse(isoDate);
    return '${d.day} ${months[d.month - 1]} ${d.year}';
  } catch (_) {
    return isoDate;
  }
}

// ─── Amount compact ───────────────────────────────────────────────────────────
String _compact(double v) {
  if (v >= 100000) return '₹${(v / 100000).toStringAsFixed(1)}L';
  if (v >= 1000) return '₹${(v / 1000).toStringAsFixed(1)}K';
  return '₹${v.toStringAsFixed(0)}';
}

// ─── Joined model ─────────────────────────────────────────────────────────────
class _PaymentRow {
  final ClientPayment payment;
  final String clientName;
  _PaymentRow({required this.payment, required this.clientName});
}

// ─── Screen ───────────────────────────────────────────────────────────────────
class ClientPaymentsScreen extends ConsumerStatefulWidget {
  const ClientPaymentsScreen({super.key});

  @override
  ConsumerState<ClientPaymentsScreen> createState() =>
      _ClientPaymentsScreenState();
}

class _ClientPaymentsScreenState extends ConsumerState<ClientPaymentsScreen> {
  final _searchController = TextEditingController();
  String _query = '';

  @override
  void initState() {
    super.initState();
    _searchController.addListener(
      () => setState(() => _query = _searchController.text),
    );
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final paymentsAsync = ref.watch(clientPaymentsProvider);
    final clientsAsync  = ref.watch(clientsProvider);

    return Scaffold(
      backgroundColor: AppColors.canvas,
      appBar: AppBar(
        backgroundColor: Colors.white,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        leading: IconButton(
          onPressed: () => Navigator.pop(context),
          icon: const Icon(LucideIcons.arrowLeft, size: 20, color: AppColors.inkPrimary),
        ),
        title: Text(
          'Payment History',
          style: GoogleFonts.hankenGrotesk(
            fontSize: 18,
            fontWeight: FontWeight.w800,
            color: AppColors.inkPrimary,
            letterSpacing: -0.3,
          ),
        ),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(1),
          child: Container(height: 1, color: AppColors.outlineVariant.withValues(alpha: 0.4)),
        ),
      ),
      body: paymentsAsync.when(
        loading: () => const Center(
          child: CircularProgressIndicator(color: AppColors.primary),
        ),
        error: (e, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Text(
              'Error: $e',
              style: GoogleFonts.inter(color: AppColors.danger, fontSize: 13),
              textAlign: TextAlign.center,
            ),
          ),
        ),
        data: (payments) {
          // Build clientId → name map from clientsProvider (best-effort)
          final clientMap = <String, String>{};
          final clientsValue = clientsAsync.valueOrNull ?? const [];
          for (final c in clientsValue) {
            clientMap[c.id] = c.name ?? '—';
          }

          // Join payments with client names
          final rows = payments.map((p) => _PaymentRow(
            payment: p,
            clientName: clientMap[p.clientId] ?? 'Unknown Client',
          )).toList();

          // Apply search filter
          final q = _query.toLowerCase().trim();
          final filtered = q.isEmpty
              ? rows
              : rows.where((r) {
                  return r.clientName.toLowerCase().contains(q) ||
                      (r.payment.notes ?? '').toLowerCase().contains(q);
                }).toList();

          // KPI calculations (from unfiltered list so KPIs always reflect total)
          final totalCollected = payments.fold(0.0, (s, p) => s + p.amount);
          final transactionCount = payments.length;
          final distinctClients = payments.map((p) => p.clientId).toSet().length;

          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // ── KPI row ──────────────────────────────────────────────────
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 20, 20, 0),
                child: Row(
                  children: [
                    _KpiTile(
                      label: 'TOTAL COLLECTED',
                      value: _compact(totalCollected),
                      icon: LucideIcons.trendingUp,
                      accent: const Color(0xFF059669),
                    ),
                    const SizedBox(width: 10),
                    _KpiTile(
                      label: 'TRANSACTIONS',
                      value: transactionCount.toString(),
                      icon: LucideIcons.receipt,
                      accent: const Color(0xFF2563EB),
                    ),
                    const SizedBox(width: 10),
                    _KpiTile(
                      label: 'CLIENTS PAID',
                      value: distinctClients.toString(),
                      icon: LucideIcons.users,
                      accent: const Color(0xFF7C3AED),
                    ),
                  ],
                ),
              ),

              const SizedBox(height: 16),

              // ── Search bar ───────────────────────────────────────────────
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: _SearchBar(controller: _searchController),
              ),

              const SizedBox(height: 12),

              // ── Summary row ──────────────────────────────────────────────
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 0),
                child: Text(
                  '${filtered.length} payment${filtered.length == 1 ? '' : 's'}${q.isNotEmpty ? ' · filtered' : ''}',
                  style: GoogleFonts.jetBrainsMono(
                    fontSize: 11,
                    color: AppColors.inkTertiary,
                  ),
                ),
              ),

              const SizedBox(height: 8),

              // ── List ─────────────────────────────────────────────────────
              Expanded(
                child: filtered.isEmpty
                    ? _EmptyState(
                        icon: LucideIcons.bell,
                        message: q.isEmpty
                            ? 'No payments recorded yet'
                            : 'No results for "$_query"',
                      )
                    : ListView.separated(
                        padding: const EdgeInsets.fromLTRB(20, 4, 20, 40),
                        itemCount: filtered.length,
                        separatorBuilder: (_, __) => const SizedBox(height: 10),
                        itemBuilder: (_, i) => _PaymentCard(row: filtered[i]),
                      ),
              ),
            ],
          );
        },
      ),
    );
  }
}

// ─── KPI tile ─────────────────────────────────────────────────────────────────
class _KpiTile extends StatelessWidget {
  final String label;
  final String value;
  final IconData icon;
  final Color accent;

  const _KpiTile({
    required this.label,
    required this.value,
    required this.icon,
    required this.accent,
  });

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 12),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          boxShadow: [AppColors.cardShadow],
          border: Border.all(color: AppColors.outlineVariant.withValues(alpha: 0.5)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Flexible(
                  child: Text(
                    label,
                    style: GoogleFonts.jetBrainsMono(
                      fontSize: 7.5,
                      fontWeight: FontWeight.w700,
                      color: AppColors.inkTertiary,
                      letterSpacing: 0.8,
                    ),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                const SizedBox(width: 4),
                Container(
                  padding: const EdgeInsets.all(5),
                  decoration: BoxDecoration(
                    color: accent.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Icon(icon, size: 11, color: accent),
                ),
              ],
            ),
            const SizedBox(height: 6),
            Text(
              value,
              style: GoogleFonts.hankenGrotesk(
                fontSize: 16,
                fontWeight: FontWeight.w900,
                color: AppColors.inkPrimary,
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

// ─── Search bar ───────────────────────────────────────────────────────────────
class _SearchBar extends StatelessWidget {
  final TextEditingController controller;
  const _SearchBar({required this.controller});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [AppColors.cardShadow],
      ),
      child: TextField(
        controller: controller,
        style: GoogleFonts.inter(fontSize: 14, color: AppColors.inkPrimary),
        decoration: InputDecoration(
          hintText: 'Search by client name or notes…',
          hintStyle: GoogleFonts.inter(fontSize: 13, color: AppColors.inkTertiary),
          prefixIcon: const Icon(LucideIcons.search, size: 18, color: AppColors.inkTertiary),
          suffixIcon: controller.text.isNotEmpty
              ? IconButton(
                  icon: const Icon(LucideIcons.x, size: 16, color: AppColors.inkTertiary),
                  onPressed: controller.clear,
                )
              : null,
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(16),
            borderSide: BorderSide.none,
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(16),
            borderSide: const BorderSide(color: AppColors.primaryContainer, width: 2),
          ),
          filled: true,
          fillColor: Colors.white,
          contentPadding: const EdgeInsets.symmetric(vertical: 14),
        ),
      ),
    );
  }
}

// ─── Payment card ─────────────────────────────────────────────────────────────
class _PaymentCard extends StatelessWidget {
  final _PaymentRow row;
  const _PaymentCard({required this.row});

  @override
  Widget build(BuildContext context) {
    final p = row.payment;
    final meta = _meta(p.paymentMethod);
    final color = avatarColor(row.clientName);
    final bg    = avatarBg(row.clientName);

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        boxShadow: [AppColors.cardShadow],
      ),
      child: Row(
        children: [
          // ── Avatar ────────────────────────────────────────────────────
          Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(color: bg, shape: BoxShape.circle),
            child: Center(
              child: Text(
                initials(row.clientName),
                style: GoogleFonts.hankenGrotesk(
                  fontSize: 16,
                  fontWeight: FontWeight.w800,
                  color: color,
                ),
              ),
            ),
          ),

          const SizedBox(width: 14),

          // ── Centre info ───────────────────────────────────────────────
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  row.clientName,
                  style: GoogleFonts.hankenGrotesk(
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                    color: AppColors.inkPrimary,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 2),
                if (p.notes != null && p.notes!.trim().isNotEmpty) ...[
                  Text(
                    p.notes!,
                    style: GoogleFonts.inter(
                      fontSize: 12,
                      color: AppColors.inkTertiary,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 2),
                ],
                Row(
                  children: [
                    const Icon(LucideIcons.calendar, size: 11, color: AppColors.inkTertiary),
                    const SizedBox(width: 4),
                    Text(
                      _formatDate(p.date),
                      style: GoogleFonts.inter(
                        fontSize: 12,
                        color: AppColors.inkTertiary,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),

          const SizedBox(width: 12),

          // ── Right: amount + method chip ───────────────────────────────
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                '₹${p.amount.toStringAsFixed(p.amount % 1 == 0 ? 0 : 2)}',
                style: GoogleFonts.hankenGrotesk(
                  fontSize: 15,
                  fontWeight: FontWeight.w800,
                  color: const Color(0xFF059669),
                  letterSpacing: -0.3,
                ),
              ),
              const SizedBox(height: 6),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
                decoration: BoxDecoration(
                  color: meta.color.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(99),
                ),
                child: Text(
                  meta.label,
                  style: GoogleFonts.jetBrainsMono(
                    fontSize: 9,
                    fontWeight: FontWeight.w700,
                    color: meta.color,
                    letterSpacing: 0.5,
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

// ─── Empty state ──────────────────────────────────────────────────────────────
class _EmptyState extends StatelessWidget {
  final IconData icon;
  final String message;
  const _EmptyState({required this.icon, required this.message});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            padding: const EdgeInsets.all(20),
            decoration: const BoxDecoration(
              color: AppColors.surfaceContainer,
              shape: BoxShape.circle,
            ),
            child: Icon(icon, size: 32, color: AppColors.inkTertiary),
          ),
          const SizedBox(height: 16),
          Text(
            message,
            style: GoogleFonts.hankenGrotesk(
              fontSize: 16,
              fontWeight: FontWeight.w600,
              color: AppColors.inkSecondary,
            ),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 4),
          Text(
            'Payments will appear here once recorded',
            style: GoogleFonts.inter(fontSize: 13, color: AppColors.inkTertiary),
          ),
        ],
      ),
    );
  }
}

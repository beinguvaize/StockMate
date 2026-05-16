import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile_app/core/supabase/client.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:mobile_app/features/clients_suppliers/data/models/supplier.dart';
import 'package:mobile_app/features/clients_suppliers/presentation/add_supplier_screen.dart';
import 'package:mobile_app/features/clients_suppliers/presentation/providers/crm_provider.dart';

// ─── Supplier transactions provider ──────────────────────────────────────────
// Provider key: "supplierId|supplierName"
final supplierTransactionsProvider =
    FutureProvider.family<List<_SupplierTxn>, String>((ref, key) async {
  final parts = key.split('|');
  final supplierId = parts.isNotEmpty ? parts[0] : '';
  final supplierName = parts.length > 1 ? parts[1] : '';
  if (supplierId.isEmpty && supplierName.isEmpty) return [];

  List data = [];
  // Try supplier_id first (more reliable)
  if (supplierId.isNotEmpty) {
    try {
      final result = await supabase
          .from('purchases')
          .select('id, total_amount, date, payment_type')
          .eq('supplier_id', supplierId)
          .order('date', ascending: false)
          .limit(50);
      data = result as List;
    } catch (_) {}
  }
  // Fallback to name match if no results or supplier_id query failed
  if (data.isEmpty && supplierName.isNotEmpty) {
    final result = await supabase
        .from('purchases')
        .select('id, total_amount, date, payment_type')
        .eq('supplier_name', supplierName)
        .order('date', ascending: false)
        .limit(50);
    data = result as List;
  }

  return data
      .map((row) => _SupplierTxn.fromMap(row as Map<String, dynamic>))
      .toList();
});

class _SupplierTxn {
  final String id;
  final double amount;
  final String? date;
  final String? paymentType;

  _SupplierTxn({required this.id, required this.amount, this.date, this.paymentType});

  factory _SupplierTxn.fromMap(Map<String, dynamic> m) => _SupplierTxn(
        id: m['id'] as String,
        amount: (m['total_amount'] as num? ?? 0).toDouble(),
        date: m['date'] as String?,
        paymentType: m['payment_type'] as String?,
      );

  String get poNumber => 'PO-${id.substring(0, 8).toUpperCase()}';
}

// ─── Avatar helpers ────────────────────────────────────────────────────────────
Color _avatarColor(String? name) {
  const palette = [
    Color(0xFF446900),
    Color(0xFF48654d),
    Color(0xFF2563EB),
    Color(0xFF7C3AED),
    Color(0xFFB45309),
    Color(0xFF0891B2),
    Color(0xFF059669),
    Color(0xFFbe185d),
  ];
  if (name == null || name.isEmpty) return palette[0];
  return palette[name.codeUnitAt(0) % palette.length];
}

String _initials(String? name) {
  if (name == null || name.trim().isEmpty) return '?';
  final parts = name.trim().split(RegExp(r'\s+'));
  if (parts.length >= 2) return '${parts[0][0]}${parts[1][0]}'.toUpperCase();
  return parts[0][0].toUpperCase();
}

String _fmtDate(String? d) {
  if (d == null || d.isEmpty) return '—';
  try {
    final dt = DateTime.parse(d);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return '${dt.day} ${months[dt.month - 1]} ${dt.year}';
  } catch (_) {
    return d;
  }
}

// ─── Screen ───────────────────────────────────────────────────────────────────
class SupplierDetailScreen extends ConsumerWidget {
  final Supplier supplier;
  const SupplierDetailScreen({super.key, required this.supplier});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final txnAsync = ref.watch(
      supplierTransactionsProvider('${supplier.id}|${supplier.name ?? ''}'),
    );
    final avatarColor = _avatarColor(supplier.name);
    final avatarBg = avatarColor.withValues(alpha: 0.12);
    final balance = supplier.balance ?? 0;

    return Scaffold(
      backgroundColor: AppColors.canvas,
      body: CustomScrollView(
        slivers: [
          // ── App bar / hero ─────────────────────────────────────────────────
          SliverAppBar(
            expandedHeight: 260,
            pinned: true,
            backgroundColor: AppColors.canvas,
            surfaceTintColor: Colors.transparent,
            elevation: 0,
            scrolledUnderElevation: 0,
            leading: Padding(
              padding: const EdgeInsets.all(8),
              child: GestureDetector(
                onTap: () => Navigator.pop(context),
                child: Container(
                  decoration: BoxDecoration(
                    color: Colors.white,
                    shape: BoxShape.circle,
                    boxShadow: [AppColors.cardShadow],
                  ),
                  child: const Icon(LucideIcons.arrowLeft, size: 20, color: AppColors.inkPrimary),
                ),
              ),
            ),
            actions: [
              Padding(
                padding: const EdgeInsets.only(right: 16, top: 8, bottom: 8),
                child: GestureDetector(
                  onTap: () => Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (_) => AddSupplierScreen(supplier: supplier),
                    ),
                  ).then((_) {
                    ref.invalidate(suppliersProvider);
                    ref.invalidate(supplierTransactionsProvider('${supplier.id}|${supplier.name ?? ''}'));
                  }),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                    decoration: BoxDecoration(
                      color: AppColors.primary,
                      borderRadius: BorderRadius.circular(20),
                      boxShadow: [AppColors.cardShadow],
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(LucideIcons.pencil, size: 14, color: Colors.white),
                        const SizedBox(width: 6),
                        Text(
                          'Edit',
                          style: GoogleFonts.inter(
                            fontWeight: FontWeight.w700,
                            fontSize: 13,
                            color: Colors.white,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ],
            flexibleSpace: FlexibleSpaceBar(
              collapseMode: CollapseMode.pin,
              background: _HeroSection(
                supplier: supplier,
                avatarColor: avatarColor,
                avatarBg: avatarBg,
                balance: balance,
              ),
            ),
          ),

          // ── Body content ───────────────────────────────────────────────────
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 120),
            sliver: SliverList(
              delegate: SliverChildListDelegate([
                // Quick actions
                if (supplier.phone != null || supplier.email != null) ...[
                  _QuickActions(supplier: supplier),
                  const SizedBox(height: 24),
                ],

                // Balance card
                _BalanceCard(balance: balance),
                const SizedBox(height: 14),

                // Aggregate stats (totalProcured / count / last purchase)
                Builder(builder: (_) {
                  final txns = txnAsync.valueOrNull ?? const <_SupplierTxn>[];
                  final totalProcured = txns.fold(0.0, (s, t) => s + t.amount);
                  final lastDate = txns.isEmpty ? null : txns.first.date;
                  return _SupplierStatsCard(
                    totalProcured: totalProcured,
                    purchaseCount: txns.length,
                    lastPurchaseDate: lastDate,
                  );
                }),
                const SizedBox(height: 24),

                // Contact & address section
                _InfoSection(
                  title: 'CONTACT & ADDRESS',
                  icon: LucideIcons.mapPin,
                  children: [
                    if (supplier.contactPerson != null)
                      _InfoTile(
                        icon: LucideIcons.user,
                        label: 'Contact Person',
                        value: supplier.contactPerson!,
                      ),
                    if (supplier.phone != null)
                      _InfoTile(
                        icon: LucideIcons.phone,
                        label: 'Phone',
                        value: supplier.phone!,
                      ),
                    if (supplier.email != null)
                      _InfoTile(
                        icon: LucideIcons.mail,
                        label: 'Email',
                        value: supplier.email!,
                      ),
                    if (supplier.address != null)
                      _InfoTile(
                        icon: LucideIcons.building2,
                        label: 'Address',
                        value: supplier.address!,
                        multiLine: true,
                      ),
                  ],
                ),

                if (supplier.notes != null && supplier.notes!.isNotEmpty) ...[
                  const SizedBox(height: 20),
                  _InfoSection(
                    title: 'NOTES',
                    icon: LucideIcons.fileText,
                    children: [
                      _InfoTile(
                        icon: LucideIcons.messageSquare,
                        label: 'Internal notes',
                        value: supplier.notes!,
                        multiLine: true,
                      ),
                    ],
                  ),
                ],

                const SizedBox(height: 24),

                // Transactions
                _TransactionSection(txnAsync: txnAsync),

                if (supplier.createdAt != null) ...[
                  const SizedBox(height: 20),
                  Center(
                    child: Text(
                      'Supplier added ${_fmtDate(supplier.createdAt!.toIso8601String())}',
                      style: GoogleFonts.inter(fontSize: 11, color: AppColors.inkTertiary),
                    ),
                  ),
                ],
              ]),
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Hero section ─────────────────────────────────────────────────────────────
class _HeroSection extends StatelessWidget {
  final Supplier supplier;
  final Color avatarColor;
  final Color avatarBg;
  final double balance;

  const _HeroSection({
    required this.supplier,
    required this.avatarColor,
    required this.avatarBg,
    required this.balance,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      alignment: Alignment.bottomLeft,
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
      child: SafeArea(
        bottom: false,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.end,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Avatar
            Container(
              width: 72,
              height: 72,
              decoration: BoxDecoration(
                color: avatarBg,
                shape: BoxShape.circle,
                border: Border.all(color: avatarColor.withValues(alpha: 0.3), width: 2),
              ),
              child: Center(
                child: Text(
                  _initials(supplier.name),
                  style: GoogleFonts.hankenGrotesk(
                    fontSize: 26,
                    fontWeight: FontWeight.w900,
                    color: avatarColor,
                  ),
                ),
              ),
            ),
            const SizedBox(height: 14),

            // Name + badge
            Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                Expanded(
                  child: Text(
                    supplier.name ?? 'Unknown Supplier',
                    style: GoogleFonts.hankenGrotesk(
                      fontSize: 26,
                      fontWeight: FontWeight.w800,
                      color: AppColors.inkPrimary,
                      letterSpacing: -0.5,
                    ),
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: AppColors.warning.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: AppColors.warning.withValues(alpha: 0.3)),
                  ),
                  child: Text(
                    'SUPPLIER',
                    style: GoogleFonts.jetBrainsMono(
                      fontSize: 9,
                      fontWeight: FontWeight.w700,
                      color: AppColors.warning,
                      letterSpacing: 1.5,
                    ),
                  ),
                ),
              ],
            ),

            if (supplier.contactPerson != null && supplier.contactPerson!.isNotEmpty) ...[
              const SizedBox(height: 4),
              Row(
                children: [
                  const Icon(LucideIcons.user, size: 13, color: AppColors.inkTertiary),
                  const SizedBox(width: 5),
                  Text(
                    supplier.contactPerson!,
                    style: GoogleFonts.inter(fontSize: 13, color: AppColors.inkTertiary),
                  ),
                ],
              ),
            ],
            // Address removed from hero — rendered once inside CONTACT card.
          ],
        ),
      ),
    );
  }
}

// ─── Quick actions ────────────────────────────────────────────────────────────
class _QuickActions extends StatelessWidget {
  final Supplier supplier;
  const _QuickActions({required this.supplier});

  void _copySnack(BuildContext context, String text) {
    Clipboard.setData(ClipboardData(text: text));
    HapticFeedback.lightImpact();
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('Copied: $text',
            style: GoogleFonts.inter(color: AppColors.inkPrimary)),
        backgroundColor: AppColors.primaryContainer,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        duration: const Duration(seconds: 2),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final hasPhone = supplier.phone != null && supplier.phone!.isNotEmpty;
    final hasEmail = supplier.email != null && supplier.email!.isNotEmpty;
    return Row(
      children: [
        if (hasPhone) ...[
          Expanded(
            child: _ActionBtn(
              icon: LucideIcons.phone,
              label: 'Call',
              sublabel: supplier.phone!,
              color: AppColors.primary,
              onTap: () => _copySnack(context, supplier.phone!),
            ),
          ),
          const SizedBox(width: 10),
        ],
        if (hasEmail) ...[
          Expanded(
            child: _ActionBtn(
              icon: LucideIcons.mail,
              label: 'Email',
              sublabel: supplier.email!,
              color: const Color(0xFF2563EB),
              onTap: () => _copySnack(context, supplier.email!),
            ),
          ),
          const SizedBox(width: 10),
        ],
        Expanded(
          child: _ActionBtn(
            icon: LucideIcons.clipboardList,
            label: 'Orders',
            sublabel: 'View POs',
            color: AppColors.warning,
            onTap: () {},
          ),
        ),
      ],
    );
  }
}

class _ActionBtn extends StatelessWidget {
  final IconData icon;
  final String label;
  final String sublabel;
  final Color color;
  final VoidCallback onTap;

  const _ActionBtn({
    required this.icon,
    required this.label,
    required this.sublabel,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 10),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          boxShadow: [AppColors.cardShadow],
          border: Border.all(color: color.withValues(alpha: 0.15)),
        ),
        child: Column(
          children: [
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                color: color.withValues(alpha: 0.1),
                shape: BoxShape.circle,
              ),
              child: Icon(icon, size: 18, color: color),
            ),
            const SizedBox(height: 6),
            Text(
              label,
              style: GoogleFonts.inter(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: AppColors.inkPrimary,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              sublabel,
              style: GoogleFonts.inter(fontSize: 10, color: AppColors.inkTertiary),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}

// ─── Balance card ─────────────────────────────────────────────────────────────
class _BalanceCard extends StatelessWidget {
  final double balance;
  const _BalanceCard({required this.balance});

  // Indian-format grouping helper (matches client detail / dashboard).
  static String _fmtAmount(double v) {
    final whole = v.truncate();
    final s = whole.toString();
    if (s.length <= 3) return '₹$s';
    final last3 = s.substring(s.length - 3);
    final rest = s.substring(0, s.length - 3);
    final restGrouped =
        rest.replaceAllMapped(RegExp(r'(\d)(?=(\d{2})+$)'), (m) => '${m[1]},');
    return '₹$restGrouped,$last3';
  }

  @override
  Widget build(BuildContext context) {
    final isOwed = balance > 0;
    final color = isOwed ? AppColors.warning : AppColors.success;

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withValues(alpha: 0.2)),
      ),
      child: Row(
        children: [
          Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.12),
              shape: BoxShape.circle,
            ),
            child: Icon(
              isOwed ? LucideIcons.indianRupee : LucideIcons.checkCircle2,
              size: 22,
              color: color,
            ),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Credit Due',
                  style: GoogleFonts.inter(
                    fontSize: 12,
                    color: AppColors.inkTertiary,
                  ),
                ),
                const SizedBox(height: 2),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(
                      _fmtAmount(balance),
                      style: GoogleFonts.hankenGrotesk(
                        fontSize: 24,
                        fontWeight: FontWeight.w900,
                        color: color,
                        letterSpacing: -0.5,
                      ),
                    ),
                    const SizedBox(width: 10),
                    Padding(
                      padding: const EdgeInsets.only(bottom: 4),
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(
                          color: color.withValues(alpha: 0.12),
                          borderRadius: BorderRadius.circular(99),
                        ),
                        child: Text(
                          isOwed ? 'UNPAID' : 'CLEARED',
                          style: GoogleFonts.jetBrainsMono(
                            fontSize: 9,
                            fontWeight: FontWeight.w700,
                            color: color,
                            letterSpacing: 1.2,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Supplier stats card ──────────────────────────────────────────────────────
// Mirrors web getSupplierStats: totalProcured / purchaseCount / lastPurchase.
class _SupplierStatsCard extends StatelessWidget {
  final double totalProcured;
  final int    purchaseCount;
  final String? lastPurchaseDate;
  const _SupplierStatsCard({
    required this.totalProcured,
    required this.purchaseCount,
    required this.lastPurchaseDate,
  });

  static String _fmtAmount(double v) {
    final whole = v.truncate();
    final s = whole.toString();
    if (s.length <= 3) return '₹$s';
    final last3 = s.substring(s.length - 3);
    final rest = s.substring(0, s.length - 3);
    final restGrouped =
        rest.replaceAllMapped(RegExp(r'(\d)(?=(\d{2})+$)'), (m) => '${m[1]},');
    return '₹$restGrouped,$last3';
  }

  static String _fmtDate(String iso) {
    try {
      final d = DateTime.parse(iso);
      const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      return '${d.day} ${m[d.month - 1]} ${d.year}';
    } catch (_) { return iso; }
  }

  Widget _stat(String label, String value) {
    return Expanded(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label,
              style: GoogleFonts.jetBrainsMono(
                  fontSize: 9, fontWeight: FontWeight.w700,
                  color: AppColors.inkTertiary, letterSpacing: 1.2)),
          const SizedBox(height: 4),
          Text(value,
              style: GoogleFonts.hankenGrotesk(
                  fontSize: 16, fontWeight: FontWeight.w900,
                  color: AppColors.inkPrimary, letterSpacing: -0.3)),
        ],
      ),
    );
  }

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
          _stat('PROCURED', _fmtAmount(totalProcured)),
          Container(width: 1, height: 32, color: Colors.black.withValues(alpha: 0.05)),
          const SizedBox(width: 14),
          _stat('ORDERS', '$purchaseCount'),
          Container(width: 1, height: 32, color: Colors.black.withValues(alpha: 0.05)),
          const SizedBox(width: 14),
          _stat('LAST ORDER',
              lastPurchaseDate == null ? '—' : _fmtDate(lastPurchaseDate!)),
        ],
      ),
    );
  }
}

// ─── Info section ─────────────────────────────────────────────────────────────
class _InfoSection extends StatelessWidget {
  final String title;
  final IconData icon;
  final List<_InfoTile> children;

  const _InfoSection({
    required this.title,
    required this.icon,
    required this.children,
  });

  @override
  Widget build(BuildContext context) {
    final visible = children.where((c) => true).toList();
    if (visible.isEmpty) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Section label
        Row(
          children: [
            Icon(icon, size: 13, color: AppColors.inkTertiary),
            const SizedBox(width: 6),
            Text(
              title,
              style: GoogleFonts.jetBrainsMono(
                fontSize: 10,
                fontWeight: FontWeight.w700,
                color: AppColors.inkTertiary,
                letterSpacing: 1.3,
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),

        // Card
        Container(
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(20),
            boxShadow: [AppColors.cardShadow],
          ),
          child: Column(
            children: visible.asMap().entries.map((entry) {
              final i = entry.key;
              final tile = entry.value;
              return Column(
                children: [
                  _InfoTileRow(tile: tile),
                  if (i < visible.length - 1)
                    Divider(
                      height: 1,
                      indent: 52,
                      endIndent: 20,
                      color: AppColors.outlineVariant.withValues(alpha: 0.5),
                    ),
                ],
              );
            }).toList(),
          ),
        ),
      ],
    );
  }
}

class _InfoTile {
  final IconData icon;
  final String label;
  final String value;
  final bool multiLine;
  const _InfoTile({
    required this.icon,
    required this.label,
    required this.value,
    this.multiLine = false,
  });
}

class _InfoTileRow extends StatelessWidget {
  final _InfoTile tile;
  const _InfoTileRow({required this.tile});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onLongPress: () {
        Clipboard.setData(ClipboardData(text: tile.value));
        HapticFeedback.mediumImpact();
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Copied!',
                style: GoogleFonts.inter(color: AppColors.inkPrimary)),
            backgroundColor: AppColors.primaryContainer,
            behavior: SnackBarBehavior.floating,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
            duration: const Duration(seconds: 1),
          ),
        );
      },
      child: Padding(
        padding: EdgeInsets.fromLTRB(16, tile.multiLine ? 16 : 14, 16, tile.multiLine ? 16 : 14),
        child: Row(
          crossAxisAlignment: tile.multiLine ? CrossAxisAlignment.start : CrossAxisAlignment.center,
          children: [
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                color: AppColors.surfaceContainer,
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(tile.icon, size: 16, color: AppColors.inkSecondary),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    tile.label,
                    style: GoogleFonts.inter(
                      fontSize: 11,
                      color: AppColors.inkTertiary,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    tile.value,
                    style: GoogleFonts.inter(
                      fontSize: 14,
                      fontWeight: FontWeight.w500,
                      color: AppColors.inkPrimary,
                      height: tile.multiLine ? 1.5 : 1.2,
                    ),
                  ),
                ],
              ),
            ),
            const Icon(LucideIcons.copyCheck, size: 14, color: AppColors.outlineVariant),
          ],
        ),
      ),
    );
  }
}

// ─── Transaction section ──────────────────────────────────────────────────────
class _TransactionSection extends StatelessWidget {
  final AsyncValue<List<_SupplierTxn>> txnAsync;
  const _TransactionSection({required this.txnAsync});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(LucideIcons.receipt, size: 13, color: AppColors.inkTertiary),
            const SizedBox(width: 6),
            Text(
              'PURCHASE HISTORY',
              style: GoogleFonts.jetBrainsMono(
                fontSize: 10,
                fontWeight: FontWeight.w700,
                color: AppColors.inkTertiary,
                letterSpacing: 1.3,
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),

        txnAsync.when(
          data: (txns) {
            if (txns.isEmpty) {
              return Container(
                padding: const EdgeInsets.all(28),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(20),
                  boxShadow: [AppColors.cardShadow],
                ),
                child: Center(
                  child: Column(
                    children: [
                      Icon(LucideIcons.packageOpen, size: 32, color: AppColors.outlineVariant),
                      const SizedBox(height: 10),
                      Text(
                        'No purchases yet',
                        style: GoogleFonts.hankenGrotesk(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                          color: AppColors.inkTertiary,
                        ),
                      ),
                    ],
                  ),
                ),
              );
            }

            final total = txns.fold(0.0, (s, t) => s + t.amount);

            return Container(
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(20),
                boxShadow: [AppColors.cardShadow],
              ),
              child: Column(
                children: [
                  // Total row
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 16, 16, 10),
                    child: Row(
                      children: [
                        Expanded(
                          child: Text(
                            '${txns.length} order${txns.length == 1 ? '' : 's'}',
                            style: GoogleFonts.inter(
                              fontSize: 12,
                              color: AppColors.inkTertiary,
                            ),
                          ),
                        ),
                        Text(
                          'Total: ₹${_compactNum(total)}',
                          style: GoogleFonts.hankenGrotesk(
                            fontSize: 13,
                            fontWeight: FontWeight.w700,
                            color: AppColors.inkPrimary,
                          ),
                        ),
                      ],
                    ),
                  ),
                  Divider(height: 1, color: AppColors.outlineVariant.withValues(alpha: 0.4)),

                  // List
                  ...txns.asMap().entries.map((entry) {
                    final i = entry.key;
                    final txn = entry.value;
                    return Column(
                      children: [
                        _TxnTile(txn: txn),
                        if (i < txns.length - 1)
                          Divider(
                            height: 1,
                            indent: 52,
                            endIndent: 16,
                            color: AppColors.outlineVariant.withValues(alpha: 0.4),
                          ),
                      ],
                    );
                  }),
                ],
              ),
            );
          },
          loading: () => Container(
            height: 80,
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(20),
              boxShadow: [AppColors.cardShadow],
            ),
            child: const Center(
              child: CircularProgressIndicator(color: AppColors.primary, strokeWidth: 2),
            ),
          ),
          error: (e, _) => Padding(
            padding: const EdgeInsets.all(16),
            child: Text('Error loading transactions: $e',
                style: GoogleFonts.inter(color: AppColors.danger, fontSize: 12)),
          ),
        ),
      ],
    );
  }

  static String _compactNum(double v) {
    if (v >= 10000000) return '${(v / 10000000).toStringAsFixed(1)}Cr';
    if (v >= 100000) return '${(v / 100000).toStringAsFixed(1)}L';
    if (v >= 1000) return '${(v / 1000).toStringAsFixed(1)}K';
    return v.toStringAsFixed(0);
  }
}

class _TxnTile extends StatelessWidget {
  final _SupplierTxn txn;
  const _TxnTile({required this.txn});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Row(
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: AppColors.primaryContainer.withValues(alpha: 0.2),
              borderRadius: BorderRadius.circular(10),
            ),
            child: const Icon(LucideIcons.shoppingCart, size: 16, color: AppColors.primary),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  txn.poNumber,
                  style: GoogleFonts.jetBrainsMono(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: AppColors.inkPrimary,
                  ),
                ),
                Text(
                  _fmtDate(txn.date),
                  style: GoogleFonts.inter(fontSize: 11, color: AppColors.inkTertiary),
                ),
              ],
            ),
          ),
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (txn.paymentType != null)
                Container(
                  margin: const EdgeInsets.only(right: 8),
                  padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                  decoration: BoxDecoration(
                    color: txn.paymentType == 'CASH'
                        ? AppColors.primaryContainer.withValues(alpha: 0.3)
                        : AppColors.warning.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Text(
                    txn.paymentType!,
                    style: GoogleFonts.jetBrainsMono(
                      fontSize: 8,
                      fontWeight: FontWeight.w700,
                      color: txn.paymentType == 'CASH' ? AppColors.primary : AppColors.warning,
                    ),
                  ),
                ),
              Text(
                '₹${txn.amount.toStringAsFixed(0)}',
                style: GoogleFonts.hankenGrotesk(
                  fontSize: 15,
                  fontWeight: FontWeight.w700,
                  color: AppColors.inkPrimary,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

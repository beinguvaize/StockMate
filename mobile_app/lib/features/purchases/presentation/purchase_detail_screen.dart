import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/core/supabase/client.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:mobile_app/features/purchases/presentation/purchases_screen.dart';
import 'package:mobile_app/features/returns/presentation/purchase_return_form_screen.dart';

class PurchaseDetailScreen extends ConsumerWidget {
  final Purchase purchase;
  const PurchaseDetailScreen({super.key, required this.purchase});

  Future<void> _updateStatus(BuildContext context, WidgetRef ref, String newStatus) async {
    try {
      await supabase
          .from('purchases')
          .update({'status': newStatus})
          .eq('id', purchase.id);

      final tenantId = ref.read(tenantContextProvider).valueOrNull?.tenantId;
      if (tenantId != null) {
        ref.invalidate(purchasesProvider(tenantId));
      }

      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Marked as ${newStatus.toLowerCase()}'),
            backgroundColor: AppColors.secondary,
            behavior: SnackBarBehavior.floating,
          ),
        );
        Navigator.of(context).pop();
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Status update failed: $e'),
            backgroundColor: AppColors.danger,
            behavior: SnackBarBehavior.floating,
            duration: const Duration(seconds: 6),
          ),
        );
      }
    }
  }

  static String _fmtDate(String? d) {
    if (d == null || d.isEmpty) return '—';
    try {
      final dt = DateTime.parse(d);
      const m = ['Jan','Feb','Mar','Apr','May','Jun',
                  'Jul','Aug','Sep','Oct','Nov','Dec'];
      return '${dt.day} ${m[dt.month - 1]} ${dt.year}';
    } catch (_) { return d; }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final status      = purchase.resolvedStatus;
    final statusColor = orderStatusColor(status);
    final statusBg    = orderStatusBg(status);

    return Scaffold(
      backgroundColor: AppColors.canvas,
      body: CustomScrollView(
        slivers: [
          // ── App bar ──────────────────────────────────────────────────────
          SliverAppBar(
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
                  child: const Icon(LucideIcons.arrowLeft,
                      size: 20, color: AppColors.inkPrimary),
                ),
              ),
            ),
            title: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  purchase.poNumber,
                  style: GoogleFonts.jetBrainsMono(
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                    color: AppColors.inkPrimary,
                    letterSpacing: 0.5,
                  ),
                ),
                Text(
                  'PURCHASE ORDER',
                  style: GoogleFonts.jetBrainsMono(
                    fontSize: 9,
                    fontWeight: FontWeight.w600,
                    color: AppColors.inkTertiary,
                    letterSpacing: 1.5,
                  ),
                ),
              ],
            ),
            actions: [
              // Copy PO number
              Padding(
                padding: const EdgeInsets.only(right: 16, top: 8, bottom: 8),
                child: GestureDetector(
                  onTap: () {
                    Clipboard.setData(ClipboardData(text: purchase.poNumber));
                    HapticFeedback.lightImpact();
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(
                        content: Text('Copied ${purchase.poNumber}',
                            style: GoogleFonts.inter(color: AppColors.inkPrimary)),
                        backgroundColor: AppColors.primaryContainer,
                        behavior: SnackBarBehavior.floating,
                        shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12)),
                        duration: const Duration(seconds: 1),
                      ),
                    );
                  },
                  child: Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(10),
                      boxShadow: [AppColors.cardShadow],
                    ),
                    child: const Icon(LucideIcons.copy,
                        size: 16, color: AppColors.inkSecondary),
                  ),
                ),
              ),
            ],
          ),

          // ── Body ─────────────────────────────────────────────────────────
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 100),
            sliver: SliverList(
              delegate: SliverChildListDelegate([

                // ── Hero PO card ─────────────────────────────────────────
                Container(
                  padding: const EdgeInsets.all(24),
                  decoration: BoxDecoration(
                    color: AppColors.primary,
                    borderRadius: BorderRadius.circular(24),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.all(10),
                            decoration: BoxDecoration(
                              color: Colors.white.withValues(alpha: 0.15),
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: const Icon(LucideIcons.clipboardList,
                                size: 20, color: Colors.white),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  purchase.poNumber,
                                  style: GoogleFonts.jetBrainsMono(
                                    fontSize: 16,
                                    fontWeight: FontWeight.w800,
                                    color: Colors.white,
                                    letterSpacing: 1,
                                  ),
                                ),
                                Text(
                                  'Order Date: ${_fmtDate(purchase.date)}',
                                  style: GoogleFonts.inter(
                                    fontSize: 12,
                                    color: Colors.white.withValues(alpha: 0.7),
                                  ),
                                ),
                              ],
                            ),
                          ),
                          // Status badge
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 12, vertical: 6),
                            decoration: BoxDecoration(
                              color: statusBg,
                              borderRadius: BorderRadius.circular(20),
                            ),
                            child: Text(
                              status,
                              style: GoogleFonts.jetBrainsMono(
                                fontSize: 10,
                                fontWeight: FontWeight.w700,
                                color: statusColor,
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 20),
                      // Divider line
                      Container(
                          height: 1,
                          color: Colors.white.withValues(alpha: 0.15)),
                      const SizedBox(height: 20),
                      // Amount
                      Text(
                        'Total Amount',
                        style: GoogleFonts.inter(
                          fontSize: 12,
                          color: Colors.white.withValues(alpha: 0.65),
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        '₹${purchase.totalAmount.toStringAsFixed(2)}',
                        style: GoogleFonts.hankenGrotesk(
                          fontSize: 36,
                          fontWeight: FontWeight.w900,
                          color: Colors.white,
                          letterSpacing: -1,
                        ),
                      ),
                    ],
                  ),
                ),

                const SizedBox(height: 24),

                // ── Supplier info ────────────────────────────────────────
                _SectionLabel(
                    title: 'SUPPLIER', icon: LucideIcons.building2),
                const SizedBox(height: 10),
                _InfoCard(
                  children: [
                    _InfoRow(
                      icon: LucideIcons.building2,
                      label: 'Supplier Name',
                      value: purchase.supplierName ?? 'Unknown Supplier',
                    ),
                  ],
                ),

                const SizedBox(height: 24),

                // ── Order details ────────────────────────────────────────
                _SectionLabel(
                    title: 'ORDER DETAILS', icon: LucideIcons.fileText),
                const SizedBox(height: 10),
                _InfoCard(
                  children: [
                    _InfoRow(
                      icon: LucideIcons.hash,
                      label: 'PO Number',
                      value: purchase.poNumber,
                    ),
                    _InfoRow(
                      icon: LucideIcons.calendar,
                      label: 'Order Date',
                      value: _fmtDate(purchase.date),
                    ),
                    if (purchase.deliveryDate != null)
                      _InfoRow(
                        icon: LucideIcons.truck,
                        label: 'Est. Delivery',
                        value: _fmtDate(purchase.deliveryDate),
                      ),
                    _InfoRow(
                      icon: LucideIcons.activity,
                      label: 'Status',
                      value: status,
                      valueWidget: Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: statusBg,
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          status,
                          style: GoogleFonts.jetBrainsMono(
                            fontSize: 10,
                            fontWeight: FontWeight.w700,
                            color: statusColor,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),

                const SizedBox(height: 24),

                // ── Amount summary ───────────────────────────────────────
                _SectionLabel(
                    title: 'AMOUNT SUMMARY', icon: LucideIcons.indianRupee),
                const SizedBox(height: 10),
                Container(
                  padding: const EdgeInsets.all(20),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(20),
                    boxShadow: [AppColors.cardShadow],
                  ),
                  child: Row(
                    children: [
                      Container(
                        width: 44,
                        height: 44,
                        decoration: BoxDecoration(
                          color: AppColors.primaryContainer.withValues(alpha: 0.25),
                          shape: BoxShape.circle,
                        ),
                        child: const Icon(LucideIcons.indianRupee,
                            size: 20, color: AppColors.primary),
                      ),
                      const SizedBox(width: 16),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Order Total',
                              style: GoogleFonts.inter(
                                  fontSize: 12, color: AppColors.inkTertiary),
                            ),
                            Text(
                              '₹${purchase.totalAmount.toStringAsFixed(2)}',
                              style: GoogleFonts.hankenGrotesk(
                                fontSize: 24,
                                fontWeight: FontWeight.w800,
                                color: AppColors.inkPrimary,
                                letterSpacing: -0.5,
                              ),
                            ),
                          ],
                        ),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 12, vertical: 6),
                        decoration: BoxDecoration(
                          color: statusBg,
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(
                              color: statusColor.withValues(alpha: 0.3)),
                        ),
                        child: Text(
                          status == 'RECEIVED' ? 'PAID' : 'UNPAID',
                          style: GoogleFonts.jetBrainsMono(
                            fontSize: 10,
                            fontWeight: FontWeight.w700,
                            color: statusColor,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),

                const SizedBox(height: 24),

                // ── Status timeline ──────────────────────────────────────
                _SectionLabel(
                    title: 'ORDER TIMELINE', icon: LucideIcons.gitBranch),
                const SizedBox(height: 10),
                _StatusTimeline(status: status),

                const SizedBox(height: 16),

                // ── Status actions ──────────────────────────────────────
                Builder(builder: (_) {
                  final actions = <_StatusAction>[];
                  if (status != 'PENDING' && status != 'CANCELLED') {
                    actions.add(_StatusAction(
                      label: 'Mark Pending',
                      icon: LucideIcons.clock,
                      target: 'PENDING',
                      color: AppColors.warning,
                    ));
                  }
                  if (status != 'ORDERED' && status != 'CANCELLED') {
                    actions.add(_StatusAction(
                      label: 'Mark Ordered',
                      icon: LucideIcons.send,
                      target: 'ORDERED',
                      color: AppColors.primary,
                    ));
                  }
                  if (status != 'RECEIVED' && status != 'CANCELLED') {
                    actions.add(_StatusAction(
                      label: 'Mark Received',
                      icon: LucideIcons.packageCheck,
                      target: 'RECEIVED',
                      color: AppColors.success,
                    ));
                  }
                  if (status != 'CANCELLED') {
                    actions.add(_StatusAction(
                      label: 'Cancel',
                      icon: LucideIcons.x,
                      target: 'CANCELLED',
                      color: AppColors.danger,
                    ));
                  } else {
                    actions.add(_StatusAction(
                      label: 'Restore',
                      icon: LucideIcons.rotateCcw,
                      target: 'ORDERED',
                      color: AppColors.primary,
                    ));
                  }
                  final upperStatus = purchase.status?.toUpperCase();
                  final showReturn = upperStatus == null ||
                      upperStatus == 'RECEIVED' ||
                      upperStatus == 'COMPLETED';
                  if (actions.isEmpty && !showReturn) return const SizedBox.shrink();
                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      if (actions.isNotEmpty)
                        Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: actions.map((a) => OutlinedButton.icon(
                            icon: Icon(a.icon, size: 14, color: a.color),
                            label: Text(
                              a.label,
                              style: GoogleFonts.inter(
                                fontSize: 12,
                                fontWeight: FontWeight.w700,
                                color: a.color,
                              ),
                            ),
                            style: OutlinedButton.styleFrom(
                              backgroundColor: a.color.withValues(alpha: 0.08),
                              side: BorderSide(color: a.color.withValues(alpha: 0.4), width: 1.2),
                              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                              shape: const StadiumBorder(),
                            ),
                            onPressed: () => _updateStatus(context, ref, a.target),
                          )).toList(),
                        ),
                      if (showReturn) ...[
                        if (actions.isNotEmpty) const SizedBox(height: 8),
                        OutlinedButton.icon(
                          icon: const Icon(LucideIcons.rotateCcw, size: 14, color: AppColors.danger),
                          label: Text(
                            'Process Return',
                            style: GoogleFonts.inter(
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                              color: AppColors.danger,
                            ),
                          ),
                          style: OutlinedButton.styleFrom(
                            backgroundColor: AppColors.danger.withValues(alpha: 0.08),
                            side: BorderSide(color: AppColors.danger.withValues(alpha: 0.4), width: 1.2),
                            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                            shape: const StadiumBorder(),
                          ),
                          onPressed: () => Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (_) => PurchaseReturnFormScreen(purchase: purchase),
                            ),
                          ),
                        ),
                      ],
                    ],
                  );
                }),
              ]),
            ),
          ),
        ],
      ),
    );
  }
}

class _StatusAction {
  final String label;
  final IconData icon;
  final String target;
  final Color color;
  const _StatusAction({
    required this.label,
    required this.icon,
    required this.target,
    required this.color,
  });
}

// ─── Status timeline ──────────────────────────────────────────────────────────
class _StatusTimeline extends StatelessWidget {
  final String status;
  const _StatusTimeline({required this.status});

  static const _steps = [
    (label: 'Order Placed', sub: 'PO created', icon: LucideIcons.clipboardList),
    (label: 'Ordered', sub: 'Sent to supplier', icon: LucideIcons.send),
    (label: 'Received', sub: 'Goods received', icon: LucideIcons.packageCheck),
  ];

  int get _activeStep {
    switch (status) {
      case 'ORDERED': return 1;
      case 'RECEIVED': return 2;
      default: return 0; // PENDING
    }
  }

  @override
  Widget build(BuildContext context) {
    final active = _activeStep;
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        boxShadow: [AppColors.cardShadow],
      ),
      child: Column(
        children: _steps.asMap().entries.map((entry) {
          final i = entry.key;
          final step = entry.value;
          final done = i <= active;
          final isLast = i == _steps.length - 1;

          return Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Left: circle + line
              Column(
                children: [
                  Container(
                    width: 36,
                    height: 36,
                    decoration: BoxDecoration(
                      color: done
                          ? AppColors.primary
                          : AppColors.surfaceContainer,
                      shape: BoxShape.circle,
                    ),
                    child: Icon(
                      step.icon,
                      size: 16,
                      color: done ? Colors.white : AppColors.inkTertiary,
                    ),
                  ),
                  if (!isLast)
                    Container(
                      width: 2,
                      height: 32,
                      margin: const EdgeInsets.symmetric(vertical: 4),
                      decoration: BoxDecoration(
                        color: done && i < active
                            ? AppColors.primary
                            : AppColors.outlineVariant,
                        borderRadius: BorderRadius.circular(1),
                      ),
                    ),
                ],
              ),
              const SizedBox(width: 14),
              // Right: label
              Expanded(
                child: Padding(
                  padding: EdgeInsets.only(
                      top: 6, bottom: isLast ? 0 : 28),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        step.label,
                        style: GoogleFonts.hankenGrotesk(
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                          color: done
                              ? AppColors.inkPrimary
                              : AppColors.inkTertiary,
                        ),
                      ),
                      Text(
                        step.sub,
                        style: GoogleFonts.inter(
                            fontSize: 12, color: AppColors.inkTertiary),
                      ),
                    ],
                  ),
                ),
              ),
              if (done && i == active)
                Container(
                  margin: const EdgeInsets.only(top: 6),
                  padding: const EdgeInsets.symmetric(
                      horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: AppColors.primaryContainer.withValues(alpha: 0.3),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    'CURRENT',
                    style: GoogleFonts.jetBrainsMono(
                      fontSize: 8,
                      fontWeight: FontWeight.w700,
                      color: AppColors.primary,
                      letterSpacing: 1,
                    ),
                  ),
                ),
            ],
          );
        }).toList(),
      ),
    );
  }
}

// ─── Shared widgets ───────────────────────────────────────────────────────────
class _SectionLabel extends StatelessWidget {
  final String title;
  final IconData icon;
  const _SectionLabel({required this.title, required this.icon});

  @override
  Widget build(BuildContext context) {
    return Row(
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
    );
  }
}

class _InfoCard extends StatelessWidget {
  final List<_InfoRow> children;
  const _InfoCard({required this.children});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        boxShadow: [AppColors.cardShadow],
      ),
      child: Column(
        children: children.asMap().entries.map((entry) {
          final i = entry.key;
          final row = entry.value;
          return Column(
            children: [
              row,
              if (i < children.length - 1)
                Divider(
                  height: 1,
                  indent: 52,
                  endIndent: 16,
                  color: AppColors.outlineVariant.withValues(alpha: 0.5),
                ),
            ],
          );
        }).toList(),
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  final Widget? valueWidget;
  const _InfoRow({
    required this.icon,
    required this.label,
    required this.value,
    this.valueWidget,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      child: Row(
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: AppColors.surfaceContainer,
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icon, size: 16, color: AppColors.inkSecondary),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label,
                    style: GoogleFonts.inter(
                        fontSize: 11, color: AppColors.inkTertiary)),
                const SizedBox(height: 2),
                valueWidget ??
                    Text(
                      value,
                      style: GoogleFonts.inter(
                        fontSize: 14,
                        fontWeight: FontWeight.w500,
                        color: AppColors.inkPrimary,
                      ),
                    ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

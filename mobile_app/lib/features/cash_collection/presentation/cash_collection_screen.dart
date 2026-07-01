import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:mobile_app/main.dart' show syncServiceProvider;
import 'providers/cash_collection_provider.dart';

class CashCollectionScreen extends ConsumerStatefulWidget {
  const CashCollectionScreen({super.key});

  @override
  ConsumerState<CashCollectionScreen> createState() => _CashCollectionScreenState();
}

class _CashCollectionScreenState extends ConsumerState<CashCollectionScreen> {
  String _search = '';
  String? _expandedId;
  final Map<String, TextEditingController> _amountCtrls = {};
  final Map<String, String> _methods = {};
  final Set<String> _collected = {};
  final Map<String, double> _collectedAmounts = {};
  final Set<String> _submitting = {};

  double get _sessionTotal => _collectedAmounts.values.fold(0, (a, b) => a + b);
  int get _sessionCount => _collectedAmounts.length;

  @override
  void dispose() {
    for (final c in _amountCtrls.values) {
      c.dispose();
    }
    super.dispose();
  }

  String _today() {
    final now = DateTime.now().toUtc().add(const Duration(hours: 5, minutes: 30));
    return '${now.year}-${now.month.toString().padLeft(2, '0')}-${now.day.toString().padLeft(2, '0')}';
  }

  Future<void> _recordPayment(CollectableClient client) async {
    final ctrl = _amountCtrls[client.id];
    final amount = double.tryParse(ctrl?.text ?? '') ?? 0;
    if (amount <= 0) return;
    final method = _methods[client.id] ?? 'CASH';
    final tenantCtx = await ref.read(tenantContextProvider.future);
    if (tenantCtx == null) return;

    setState(() => _submitting.add(client.id));

    try {
      final paymentId = 'CP-${DateTime.now().millisecondsSinceEpoch}';
      final payload = {
        'id': paymentId,
        'tenant_id': tenantCtx.tenantId,
        'client_id': client.id,
        'amount': amount,
        'payment_method': method,
        'date': _today(),
      };

      final svc = ref.read(syncServiceProvider);
      await svc.rpcOnlineOrQueue('settle_client_payment', {
        'p_id': paymentId,
        'p_tenant_id': tenantCtx.tenantId,
        'p_client_id': client.id,
        'p_amount': amount,
        'p_method': method,
        'p_date': _today(),
        'p_invoice_ids': <String>[],
        'p_notes': null,
      });

      // Also upsert client_payments record for offline tracking
      await svc.upsertOnlineOrQueue('client_payments', payload);

      setState(() {
        _collected.add(client.id);
        _collectedAmounts[client.id] = amount;
        _expandedId = null;
      });

      ref.invalidate(collectableClientsProvider);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text('Failed to record payment: $e'),
          backgroundColor: AppColors.danger,
        ));
      }
    } finally {
      setState(() => _submitting.remove(client.id));
    }
  }

  @override
  Widget build(BuildContext context) {
    final clientsAsync = ref.watch(collectableClientsProvider);
    final dateLabel = DateTime.now().toLocal().toString().split(' ').first;

    return Scaffold(
      backgroundColor: AppColors.canvas,
      appBar: AppBar(
        backgroundColor: AppColors.canvas,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(LucideIcons.arrowLeft, color: AppColors.inkPrimary),
          onPressed: () => Navigator.pop(context),
        ),
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Cash Collection', style: GoogleFonts.manrope(fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.inkPrimary)),
            Text(dateLabel, style: GoogleFonts.manrope(fontSize: 11, color: AppColors.inkTertiary)),
          ],
        ),
        actions: [
          if (_sessionCount > 0)
            Padding(
              padding: const EdgeInsets.only(right: 16),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    '₹${_sessionTotal.toStringAsFixed(0)}',
                    style: GoogleFonts.jetBrainsMono(fontSize: 14, fontWeight: FontWeight.w700, color: const Color(0xFF16A34A)),
                  ),
                  Text(
                    '$_sessionCount client${_sessionCount == 1 ? '' : 's'}',
                    style: GoogleFonts.manrope(fontSize: 10, color: AppColors.inkTertiary),
                  ),
                ],
              ),
            ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
            child: TextField(
              onChanged: (v) => setState(() => _search = v.toLowerCase()),
              decoration: InputDecoration(
                hintText: 'Search clients…',
                hintStyle: GoogleFonts.manrope(color: AppColors.inkTertiary, fontSize: 14),
                prefixIcon: const Icon(LucideIcons.search, size: 18, color: AppColors.inkTertiary),
                filled: true,
                fillColor: Colors.white,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
                contentPadding: const EdgeInsets.symmetric(vertical: 12),
              ),
            ),
          ),
          Expanded(
            child: clientsAsync.when(
              loading: () => const Center(child: CircularProgressIndicator(color: AppColors.primary)),
              error: (e, _) => Center(child: Text('Error loading clients', style: GoogleFonts.manrope(color: AppColors.danger))),
              data: (clients) {
                final pending = clients.where((c) => !_collected.contains(c.id)).toList();
                final done = clients.where((c) => _collected.contains(c.id)).toList();
                final all = [...pending, ...done];
                final filtered = all.where((c) => _search.isEmpty || c.name.toLowerCase().contains(_search)).toList();

                if (filtered.isEmpty) {
                  return Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(LucideIcons.checkCircle2, size: 48, color: Color(0xFF16A34A)),
                        const SizedBox(height: 16),
                        Text('All collections done!', style: GoogleFonts.manrope(fontSize: 16, fontWeight: FontWeight.w600, color: AppColors.inkSecondary)),
                      ],
                    ),
                  );
                }

                return RefreshIndicator(
                  color: AppColors.primary,
                  onRefresh: () async => ref.invalidate(collectableClientsProvider),
                  child: ListView.builder(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 32),
                    itemCount: filtered.length,
                    itemBuilder: (ctx, i) {
                      final client = filtered[i];
                      final isDone = _collected.contains(client.id);
                      final isExpanded = _expandedId == client.id;
                      final isSubmitting = _submitting.contains(client.id);

                      _amountCtrls.putIfAbsent(client.id, () {
                        final ctrl = TextEditingController();
                        ctrl.text = client.outstandingBalance.toStringAsFixed(2);
                        return ctrl;
                      });
                      _methods.putIfAbsent(client.id, () => 'CASH');

                      return _ClientCollectionCard(
                        client: client,
                        isDone: isDone,
                        isExpanded: isExpanded,
                        isSubmitting: isSubmitting,
                        amountCtrl: _amountCtrls[client.id]!,
                        method: _methods[client.id] ?? 'CASH',
                        onMethodChange: (m) => setState(() => _methods[client.id] = m),
                        onTap: isDone ? null : () => setState(() => _expandedId = isExpanded ? null : client.id),
                        onRecord: () => _recordPayment(client),
                        onSkip: () => setState(() => _expandedId = null),
                      );
                    },
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _ClientCollectionCard extends StatelessWidget {
  final CollectableClient client;
  final bool isDone;
  final bool isExpanded;
  final bool isSubmitting;
  final TextEditingController amountCtrl;
  final String method;
  final void Function(String) onMethodChange;
  final VoidCallback? onTap;
  final VoidCallback onRecord;
  final VoidCallback onSkip;

  const _ClientCollectionCard({
    required this.client,
    required this.isDone,
    required this.isExpanded,
    required this.isSubmitting,
    required this.amountCtrl,
    required this.method,
    required this.onMethodChange,
    this.onTap,
    required this.onRecord,
    required this.onSkip,
  });

  @override
  Widget build(BuildContext context) {
    return AnimatedOpacity(
      opacity: isDone ? 0.55 : 1,
      duration: const Duration(milliseconds: 200),
      child: Container(
        margin: const EdgeInsets.only(bottom: 10),
        decoration: BoxDecoration(
          color: isDone ? const Color(0xFFF0FDF4) : Colors.white,
          borderRadius: BorderRadius.circular(16),
          border: isDone
              ? Border.all(color: const Color(0xFF16A34A).withValues(alpha: 0.3))
              : Border.all(color: AppColors.outlineVariant.withValues(alpha: 0.5)),
          boxShadow: [AppColors.cardShadow],
        ),
        child: Column(
          children: [
            GestureDetector(
              onTap: onTap,
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Row(
                  children: [
                    Container(
                      width: 40, height: 40,
                      decoration: BoxDecoration(
                        color: isDone
                            ? const Color(0xFF16A34A).withValues(alpha: 0.1)
                            : AppColors.primary.withValues(alpha: 0.08),
                        shape: BoxShape.circle,
                      ),
                      child: Center(
                        child: isDone
                            ? const Icon(LucideIcons.checkCircle2, size: 20, color: Color(0xFF16A34A))
                            : Text(
                                client.name.isNotEmpty ? client.name[0].toUpperCase() : '?',
                                style: GoogleFonts.manrope(fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.primary),
                              ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(client.name, style: GoogleFonts.manrope(fontSize: 14, fontWeight: FontWeight.w600, color: AppColors.inkPrimary), overflow: TextOverflow.ellipsis),
                          if (isDone)
                            Text('Collected', style: GoogleFonts.manrope(fontSize: 11, color: const Color(0xFF16A34A), fontWeight: FontWeight.w600))
                          else if (client.phone != null)
                            Text(client.phone!, style: GoogleFonts.manrope(fontSize: 11, color: AppColors.inkTertiary)),
                        ],
                      ),
                    ),
                    Text(
                      '₹${client.outstandingBalance.toStringAsFixed(0)}',
                      style: GoogleFonts.jetBrainsMono(fontSize: 15, fontWeight: FontWeight.w700, color: isDone ? const Color(0xFF16A34A) : AppColors.inkPrimary),
                    ),
                    if (!isDone) ...[
                      const SizedBox(width: 8),
                      Icon(
                        isExpanded ? LucideIcons.chevronUp : LucideIcons.chevronDown,
                        size: 16, color: AppColors.inkTertiary,
                      ),
                    ],
                  ],
                ),
              ),
            ),
            if (isExpanded) ...[
              Divider(height: 1, color: AppColors.outlineVariant.withValues(alpha: 0.5)),
              Padding(
                padding: const EdgeInsets.fromLTRB(14, 14, 14, 16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    TextField(
                      controller: amountCtrl,
                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      style: GoogleFonts.jetBrainsMono(fontSize: 16, fontWeight: FontWeight.w700),
                      decoration: InputDecoration(
                        labelText: 'Amount (₹)',
                        labelStyle: GoogleFonts.manrope(fontSize: 13, color: AppColors.inkTertiary),
                        filled: true,
                        fillColor: AppColors.canvas,
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
                        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                      ),
                    ),
                    const SizedBox(height: 12),
                    // Method pills
                    Row(
                      children: ['CASH', 'BANK', 'UPI'].map((m) {
                        final sel = method == m;
                        return Padding(
                          padding: const EdgeInsets.only(right: 8),
                          child: GestureDetector(
                            onTap: () => onMethodChange(m),
                            child: Container(
                              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                              decoration: BoxDecoration(
                                color: sel ? AppColors.primary : Colors.white,
                                borderRadius: BorderRadius.circular(20),
                                border: Border.all(color: sel ? AppColors.primary : AppColors.outlineVariant),
                              ),
                              child: Text(m, style: GoogleFonts.manrope(fontSize: 13, fontWeight: FontWeight.w600, color: sel ? Colors.white : AppColors.inkSecondary)),
                            ),
                          ),
                        );
                      }).toList(),
                    ),
                    const SizedBox(height: 14),
                    Row(
                      children: [
                        Expanded(
                          child: GestureDetector(
                            onTap: isSubmitting ? null : onRecord,
                            child: Container(
                              height: 44,
                              decoration: BoxDecoration(
                                color: isSubmitting ? AppColors.primary.withValues(alpha: 0.5) : AppColors.primary,
                                borderRadius: BorderRadius.circular(14),
                              ),
                              child: Center(
                                child: isSubmitting
                                    ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                                    : Text('Record Payment', style: GoogleFonts.manrope(fontSize: 14, fontWeight: FontWeight.w700, color: Colors.white)),
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(width: 10),
                        GestureDetector(
                          onTap: onSkip,
                          child: Container(
                            height: 44, width: 70,
                            decoration: BoxDecoration(
                              color: Colors.white,
                              borderRadius: BorderRadius.circular(14),
                              border: Border.all(color: AppColors.outlineVariant),
                            ),
                            child: Center(child: Text('Skip', style: GoogleFonts.manrope(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.inkSecondary))),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

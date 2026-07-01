import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'providers/estimates_provider.dart';

class EstimatesScreen extends ConsumerStatefulWidget {
  const EstimatesScreen({super.key});

  @override
  ConsumerState<EstimatesScreen> createState() => _EstimatesScreenState();
}

class _EstimatesScreenState extends ConsumerState<EstimatesScreen> {
  String _search = '';
  String _typeFilter = 'ALL';

  @override
  Widget build(BuildContext context) {
    final estimatesAsync = ref.watch(estimatesProvider);

    return Scaffold(
      backgroundColor: AppColors.canvas,
      appBar: AppBar(
        backgroundColor: AppColors.canvas,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(LucideIcons.arrowLeft, color: AppColors.inkPrimary),
          onPressed: () => Navigator.pop(context),
        ),
        title: Text(
          'Estimates',
          style: GoogleFonts.manrope(fontSize: 18, fontWeight: FontWeight.w700, color: AppColors.inkPrimary),
        ),
      ),
      body: Column(
        children: [
          // Search bar
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
            child: TextField(
              onChanged: (v) => setState(() => _search = v.toLowerCase()),
              decoration: InputDecoration(
                hintText: 'Search by client or number…',
                hintStyle: GoogleFonts.manrope(color: AppColors.inkTertiary, fontSize: 14),
                prefixIcon: const Icon(LucideIcons.search, size: 18, color: AppColors.inkTertiary),
                filled: true,
                fillColor: Colors.white,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
                contentPadding: const EdgeInsets.symmetric(vertical: 12),
              ),
            ),
          ),
          // Type filter chips
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
            child: Row(
              children: ['ALL', 'ESTIMATE', 'QUOTATION', 'DELIVERY_CHALLAN', 'PROFORMA'].map((t) {
                final selected = _typeFilter == t;
                return Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: GestureDetector(
                    onTap: () => setState(() => _typeFilter = t),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
                      decoration: BoxDecoration(
                        color: selected ? AppColors.primary : Colors.white,
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(color: selected ? AppColors.primary : AppColors.outlineVariant),
                      ),
                      child: Text(
                        t == 'ALL' ? 'All' : t == 'DELIVERY_CHALLAN' ? 'Challan' : _capitalize(t),
                        style: GoogleFonts.manrope(
                          fontSize: 12, fontWeight: FontWeight.w600,
                          color: selected ? Colors.white : AppColors.inkSecondary,
                        ),
                      ),
                    ),
                  ),
                );
              }).toList(),
            ),
          ),
          Expanded(
            child: estimatesAsync.when(
              loading: () => const Center(child: CircularProgressIndicator(color: AppColors.primary)),
              error: (e, _) => Center(child: Text('Error loading estimates', style: GoogleFonts.manrope(color: AppColors.danger))),
              data: (estimates) {
                final filtered = estimates.where((e) {
                  final matchesType = _typeFilter == 'ALL' || (e.docType ?? 'ESTIMATE') == _typeFilter;
                  final matchesSearch = _search.isEmpty ||
                      (e.clientName ?? '').toLowerCase().contains(_search) ||
                      (e.estimateNumber ?? '').toLowerCase().contains(_search);
                  return matchesType && matchesSearch;
                }).toList();

                if (filtered.isEmpty) {
                  return Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(LucideIcons.fileText, size: 48, color: AppColors.inkTertiary),
                        const SizedBox(height: 16),
                        Text('No estimates found', style: GoogleFonts.manrope(fontSize: 16, fontWeight: FontWeight.w600, color: AppColors.inkSecondary)),
                      ],
                    ),
                  );
                }

                return RefreshIndicator(
                  color: AppColors.primary,
                  onRefresh: () async => ref.invalidate(estimatesProvider),
                  child: ListView.builder(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                    itemCount: filtered.length,
                    itemBuilder: (ctx, i) => _EstimateCard(estimate: filtered[i]),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  String _capitalize(String s) => s.isEmpty ? s : s[0] + s.substring(1).toLowerCase();
}

class _EstimateCard extends StatelessWidget {
  final EstimateModel estimate;
  const _EstimateCard({required this.estimate});

  Color get _statusColor {
    switch ((estimate.status ?? '').toUpperCase()) {
      case 'ACCEPTED': return const Color(0xFF16A34A);
      case 'REJECTED': return AppColors.danger;
      case 'EXPIRED': return AppColors.inkTertiary;
      default: return const Color(0xFFD97706);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [AppColors.cardShadow],
      ),
      child: Row(
        children: [
          Container(
            width: 42, height: 42,
            decoration: BoxDecoration(
              color: const Color(0xFF7C3AED).withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Icon(LucideIcons.fileText, size: 20, color: Color(0xFF7C3AED)),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  estimate.clientName ?? 'Unknown client',
                  style: GoogleFonts.manrope(fontSize: 14, fontWeight: FontWeight.w600, color: AppColors.inkPrimary),
                  overflow: TextOverflow.ellipsis,
                ),
                Row(
                  children: [
                    Text(
                      estimate.displayType,
                      style: GoogleFonts.manrope(fontSize: 11, color: AppColors.inkTertiary),
                    ),
                    if (estimate.estimateNumber != null) ...[
                      Text(' · ', style: GoogleFonts.manrope(fontSize: 11, color: AppColors.inkTertiary)),
                      Text(estimate.estimateNumber!, style: GoogleFonts.jetBrainsMono(fontSize: 11, color: AppColors.inkTertiary)),
                    ],
                  ],
                ),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                '₹${estimate.grandTotal.toStringAsFixed(2)}',
                style: GoogleFonts.jetBrainsMono(fontSize: 14, fontWeight: FontWeight.w700, color: AppColors.inkPrimary),
              ),
              if (estimate.status != null)
                Container(
                  margin: const EdgeInsets.only(top: 4),
                  padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                  decoration: BoxDecoration(
                    color: _statusColor.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Text(
                    estimate.status!,
                    style: GoogleFonts.manrope(fontSize: 9, fontWeight: FontWeight.w700, color: _statusColor),
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

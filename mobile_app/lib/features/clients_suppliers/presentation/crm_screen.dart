import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:mobile_app/features/clients_suppliers/presentation/add_client_screen.dart';
import 'package:mobile_app/features/clients_suppliers/presentation/add_supplier_screen.dart';
import 'package:mobile_app/features/clients_suppliers/presentation/providers/crm_provider.dart';

class CRMScreen extends ConsumerStatefulWidget {
  const CRMScreen({super.key});

  @override
  ConsumerState<CRMScreen> createState() => _CRMScreenState();
}

class _CRMScreenState extends ConsumerState<CRMScreen> with SingleTickerProviderStateMixin {
  late TabController _tabController;
  final _searchController = TextEditingController();
  String _query = '';

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _searchController.addListener(() => setState(() => _query = _searchController.text));
  }

  @override
  void dispose() {
    _tabController.dispose();
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.canvas,
      floatingActionButton: FloatingActionButton(
        onPressed: () => Navigator.push(
          context,
          MaterialPageRoute(
            builder: (_) => _tabController.index == 0
                ? const AddClientScreen()
                : const AddSupplierScreen(),
          ),
        ),
        backgroundColor: AppColors.primaryContainer,
        foregroundColor: AppColors.primary,
        elevation: 0,
        child: const Icon(LucideIcons.userPlus, size: 22),
      ),
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // ── Header ────────────────────────────────────────────
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 20, 24, 0),
              child: Text(
                'Clients',
                style: GoogleFonts.hankenGrotesk(
                  fontSize: 28,
                  fontWeight: FontWeight.w700,
                  color: AppColors.inkPrimary,
                  letterSpacing: -0.3,
                ),
              ),
            ),

            const SizedBox(height: 16),

            // ── Search ────────────────────────────────────────────
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24),
              child: TextField(
                controller: _searchController,
                decoration: InputDecoration(
                  hintText: 'Search clients & suppliers…',
                  hintStyle: GoogleFonts.inter(fontSize: 14, color: AppColors.inkTertiary),
                  prefixIcon: const Icon(LucideIcons.search, size: 18, color: AppColors.inkTertiary),
                  filled: true,
                  fillColor: AppColors.surfaceContainer,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(16),
                    borderSide: BorderSide.none,
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(16),
                    borderSide: BorderSide.none,
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(16),
                    borderSide: const BorderSide(color: AppColors.primaryContainer, width: 2),
                  ),
                  contentPadding: const EdgeInsets.symmetric(vertical: 14),
                ),
              ),
            ),

            const SizedBox(height: 16),

            // ── Tab row ───────────────────────────────────────────
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24),
              child: Container(
                height: 44,
                padding: const EdgeInsets.all(4),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(14),
                  boxShadow: [AppColors.cardShadow],
                ),
                child: TabBar(
                  controller: _tabController,
                  indicatorSize: TabBarIndicatorSize.tab,
                  indicator: BoxDecoration(
                    color: AppColors.primaryContainer,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  labelColor: AppColors.primary,
                  unselectedLabelColor: AppColors.inkTertiary,
                  labelStyle: GoogleFonts.inter(fontWeight: FontWeight.w700, fontSize: 13),
                  unselectedLabelStyle: GoogleFonts.inter(fontWeight: FontWeight.w500, fontSize: 13),
                  dividerColor: Colors.transparent,
                  splashBorderRadius: BorderRadius.circular(10),
                  tabs: const [
                    Tab(text: 'Clients'),
                    Tab(text: 'Suppliers'),
                  ],
                ),
              ),
            ),

            const SizedBox(height: 8),

            // ── Tab content ───────────────────────────────────────
            Expanded(
              child: TabBarView(
                controller: _tabController,
                children: [
                  _buildClientsList(),
                  _buildSuppliersList(),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildClientsList() {
    final clientsAsync = ref.watch(clientsProvider);

    return clientsAsync.when(
      data: (clients) {
        final filtered = _query.isEmpty
            ? clients
            : clients
                .where((c) =>
                    (c.name ?? '').toLowerCase().contains(_query.toLowerCase()) ||
                    (c.phone ?? '').contains(_query))
                .toList();

        if (filtered.isEmpty) {
          return Center(
            child: Text('No clients found.', style: GoogleFonts.inter(color: AppColors.inkTertiary)),
          );
        }

        return ListView.separated(
          padding: const EdgeInsets.fromLTRB(24, 12, 24, 100),
          itemCount: filtered.length,
          separatorBuilder: (_, __) => const SizedBox(height: 12),
          itemBuilder: (context, index) {
            final client = filtered[index];
            final balance = client.outstandingBalance ?? 0;
            final initial = (client.name?.isNotEmpty == true)
                ? client.name![0].toUpperCase()
                : '?';

            return Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(24),
                boxShadow: [AppColors.cardShadow],
              ),
              child: Row(
                children: [
                  // Avatar
                  Container(
                    width: 44,
                    height: 44,
                    decoration: BoxDecoration(
                      color: AppColors.primaryContainer,
                      shape: BoxShape.circle,
                    ),
                    child: Center(
                      child: Text(
                        initial,
                        style: GoogleFonts.hankenGrotesk(
                          fontSize: 18,
                          fontWeight: FontWeight.w700,
                          color: AppColors.primary,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 14),

                  // Name + contact
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          client.name ?? 'Unknown',
                          style: GoogleFonts.hankenGrotesk(
                            fontSize: 15,
                            fontWeight: FontWeight.w600,
                            color: AppColors.inkPrimary,
                          ),
                        ),
                        if (client.phone != null)
                          Text(
                            client.phone!,
                            style: GoogleFonts.inter(fontSize: 12, color: AppColors.inkTertiary),
                          ),
                      ],
                    ),
                  ),

                  // Balance + chevron
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text(
                        balance == 0 ? '✓ Clear' : '₹${balance.toStringAsFixed(0)}',
                        style: GoogleFonts.hankenGrotesk(
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                          color: balance > 0 ? AppColors.danger : AppColors.success,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(width: 8),
                  const Icon(LucideIcons.chevronRight, size: 16, color: AppColors.inkTertiary),
                ],
              ),
            );
          },
        );
      },
      loading: () => const Center(child: CircularProgressIndicator(color: AppColors.primary)),
      error: (err, stack) => Center(
        child: Text('Error: $err', style: GoogleFonts.inter(color: AppColors.danger)),
      ),
    );
  }

  Widget _buildSuppliersList() {
    final suppliersAsync = ref.watch(suppliersProvider);

    return suppliersAsync.when(
      data: (suppliers) {
        final filtered = _query.isEmpty
            ? suppliers
            : suppliers
                .where((s) =>
                    (s.name ?? '').toLowerCase().contains(_query.toLowerCase()))
                .toList();

        if (filtered.isEmpty) {
          return Center(
            child: Text('No suppliers found.', style: GoogleFonts.inter(color: AppColors.inkTertiary)),
          );
        }

        return ListView.separated(
          padding: const EdgeInsets.fromLTRB(24, 12, 24, 100),
          itemCount: filtered.length,
          separatorBuilder: (_, __) => const SizedBox(height: 12),
          itemBuilder: (context, index) {
            final supplier = filtered[index];
            final initial = (supplier.name?.isNotEmpty == true)
                ? supplier.name![0].toUpperCase()
                : '?';

            return Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(24),
                boxShadow: [AppColors.cardShadow],
              ),
              child: Row(
                children: [
                  // Avatar
                  Container(
                    width: 44,
                    height: 44,
                    decoration: BoxDecoration(
                      color: AppColors.surfaceContainer,
                      shape: BoxShape.circle,
                    ),
                    child: Center(
                      child: Text(
                        initial,
                        style: GoogleFonts.hankenGrotesk(
                          fontSize: 18,
                          fontWeight: FontWeight.w700,
                          color: AppColors.inkSecondary,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 14),

                  // Name + contact person
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          supplier.name ?? 'Unknown',
                          style: GoogleFonts.hankenGrotesk(
                            fontSize: 15,
                            fontWeight: FontWeight.w600,
                            color: AppColors.inkPrimary,
                          ),
                        ),
                        if (supplier.contactPerson != null)
                          Text(
                            supplier.contactPerson!,
                            style: GoogleFonts.inter(fontSize: 12, color: AppColors.inkTertiary),
                          ),
                      ],
                    ),
                  ),

                  // Balance
                  Text(
                    '₹${supplier.balance?.toStringAsFixed(0) ?? "0"}',
                    style: GoogleFonts.hankenGrotesk(
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      color: AppColors.inkSecondary,
                    ),
                  ),
                  const SizedBox(width: 8),
                  const Icon(LucideIcons.chevronRight, size: 16, color: AppColors.inkTertiary),
                ],
              ),
            );
          },
        );
      },
      loading: () => const Center(child: CircularProgressIndicator(color: AppColors.primary)),
      error: (err, stack) => Center(
        child: Text('Error: $err', style: GoogleFonts.inter(color: AppColors.danger)),
      ),
    );
  }
}

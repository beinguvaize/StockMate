import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:mobile_app/core/widgets/glass_panel.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile_app/features/clients_suppliers/presentation/providers/crm_provider.dart';
import 'package:mobile_app/features/clients_suppliers/presentation/add_client_screen.dart';
import 'package:mobile_app/features/clients_suppliers/presentation/add_supplier_screen.dart';

class CRMScreen extends ConsumerStatefulWidget {
  const CRMScreen({super.key});

  @override
  ConsumerState<CRMScreen> createState() => _CRMScreenState();
}

class _CRMScreenState extends ConsumerState<CRMScreen> with SingleTickerProviderStateMixin {
  late TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.canvas,
      body: SafeArea(
        child: Column(
          children: [
            // Header
            Padding(
              padding: const EdgeInsets.all(20),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Directory',
                        style: TextStyle(
                          fontSize: 40,
                          fontWeight: FontWeight.w900,
                          letterSpacing: -1,
                          height: 1,
                        ),
                      ),
                      Text(
                        'CLIENTS & SUPPLIERS LOGISTICS',
                        style: TextStyle(
                          color: AppColors.inkSecondary,
                          fontSize: 10,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: Row(
                children: [
                  Expanded(
                    child: ElevatedButton(
                      onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const AddClientScreen())),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          const Text('ADD CLIENT'),
                          const SizedBox(width: 8),
                          Container(
                            padding: const EdgeInsets.all(4), 
                            decoration: const BoxDecoration(color: AppColors.inkPrimary, shape: BoxShape.circle), 
                            child: const Icon(LucideIcons.plus, size: 14, color: AppColors.surface)
                          ),
                        ]
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const AddSupplierScreen())),
                      style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 16),
                        side: BorderSide(color: Colors.black.withValues(alpha: 0.1), width: 2),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
                      ),
                      child: const Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Text('ADD SUPPLIER', style: TextStyle(color: AppColors.inkPrimary, fontWeight: FontWeight.w800, fontSize: 13, letterSpacing: -0.5)),
                          SizedBox(width: 8),
                          Icon(LucideIcons.store, size: 18, color: AppColors.inkPrimary),
                        ]
                      ),
                    ),
                  )
                ]
              )
            ),
            
            const SizedBox(height: 20),
            
            // Premium Pill Navigation
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: Container(
                height: 56,
                padding: const EdgeInsets.all(6),
                decoration: BoxDecoration(
                  color: AppColors.surface.withValues(alpha: 0.6),
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(color: Colors.black.withValues(alpha: 0.05)),
                  boxShadow: [
                    BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 20, offset: const Offset(0, 10))
                  ],
                ),
                child: TabBar(
                  controller: _tabController,
                  indicatorSize: TabBarIndicatorSize.tab,
                  indicator: BoxDecoration(
                    color: AppColors.inkPrimary,
                    borderRadius: BorderRadius.circular(999),
                  ),
                  labelColor: AppColors.surface,
                  unselectedLabelColor: AppColors.inkSecondary,
                  labelStyle: const TextStyle(fontWeight: FontWeight.w800, fontSize: 12, letterSpacing: 1.2),
                  unselectedLabelStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12, letterSpacing: 1.2),
                  dividerColor: Colors.transparent,
                  splashBorderRadius: BorderRadius.circular(999),
                  tabs: const [
                    Tab(text: 'CLIENTS'),
                    Tab(text: 'SUPPLIERS'),
                  ],
                ),
              ),
            ),
            
            const SizedBox(height: 10),
            
            // Tab Views
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
        if (clients.isEmpty) {
          return const Center(child: Text('No clients found.', style: TextStyle(color: AppColors.inkSecondary)));
        }
        
        return ListView.builder(
          padding: const EdgeInsets.fromLTRB(20, 10, 20, 100),
          itemCount: clients.length,
          itemBuilder: (context, index) {
            final client = clients[index];
            return Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: GlassPanel(
                padding: const EdgeInsets.all(16),
                borderRadius: 20,
                child: Row(
                  children: [
                    CircleAvatar(
                      backgroundColor: AppColors.accentSignature.withValues(alpha: 0.2),
                      foregroundColor: AppColors.accentSignature,
                      child: Text(client.name?.substring(0, 1).toUpperCase() ?? '?'),
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(client.name ?? 'Unknown', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                          if (client.phone != null)
                            Text(client.phone!, style: const TextStyle(color: AppColors.inkSecondary, fontSize: 12)),
                        ],
                      ),
                    ),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        const Text('Balance', style: TextStyle(color: AppColors.inkSecondary, fontSize: 10)),
                        Text(
                          '₹${client.outstandingBalance?.toStringAsFixed(2) ?? "0.00"}',
                          style: TextStyle(
                            fontWeight: FontWeight.w900,
                            color: (client.outstandingBalance ?? 0) > 0 ? AppColors.danger : AppColors.success,
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
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (err, stack) => Center(child: Text('Error: $err')),
    );
  }

  Widget _buildSuppliersList() {
    final suppliersAsync = ref.watch(suppliersProvider);

    return suppliersAsync.when(
      data: (suppliers) {
        if (suppliers.isEmpty) {
          return const Center(child: Text('No suppliers found.', style: TextStyle(color: AppColors.inkSecondary)));
        }
        
        return ListView.builder(
          padding: const EdgeInsets.fromLTRB(20, 10, 20, 100),
          itemCount: suppliers.length,
          itemBuilder: (context, index) {
            final supplier = suppliers[index];
            return Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: GlassPanel(
                padding: const EdgeInsets.all(16),
                borderRadius: 20,
                child: Row(
                  children: [
                    CircleAvatar(
                      backgroundColor: AppColors.inkPrimary.withValues(alpha: 0.1),
                      foregroundColor: AppColors.inkPrimary,
                      child: Text(supplier.name?.substring(0, 1).toUpperCase() ?? '?'),
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(supplier.name ?? 'Unknown', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                          if (supplier.contactPerson != null)
                            Text(supplier.contactPerson!, style: const TextStyle(color: AppColors.inkSecondary, fontSize: 12)),
                        ],
                      ),
                    ),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        const Text('Balance', style: TextStyle(color: AppColors.inkSecondary, fontSize: 10)),
                        Text(
                          '₹${supplier.balance?.toStringAsFixed(2) ?? "0.00"}',
                          style: const TextStyle(
                            fontWeight: FontWeight.w900,
                            color: AppColors.inkPrimary,
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
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (err, stack) => Center(child: Text('Error: $err')),
    );
  }
}

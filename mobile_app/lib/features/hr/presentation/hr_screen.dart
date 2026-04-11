import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:mobile_app/core/widgets/glass_panel.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile_app/features/hr/presentation/providers/hr_provider.dart';
import 'package:mobile_app/features/hr/presentation/add_employee_screen.dart';

class HRScreen extends ConsumerWidget {
  const HRScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final employeesAsync = ref.watch(employeesProvider);

    return Scaffold(
      backgroundColor: AppColors.canvas,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        title: const Text('Employees & HR', style: TextStyle(color: AppColors.inkPrimary, fontWeight: FontWeight.bold)),
        iconTheme: const IconThemeData(color: AppColors.inkPrimary),
      ),
      body: SafeArea(
        child: Column(
          children: [
            // KPI Summary
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: GlassPanel(
                padding: const EdgeInsets.all(20),
                borderRadius: 24,
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('Active Team', style: TextStyle(color: AppColors.inkSecondary, fontSize: 14)),
                        const SizedBox(height: 4),
                        employeesAsync.maybeWhen(
                          data: (employees) => Text(
                            '${employees.where((e) => e.status == 'ACTIVE').length}',
                            style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w900, color: AppColors.info),
                          ),
                          orElse: () => const Text('...', style: TextStyle(fontSize: 28, fontWeight: FontWeight.w900)),
                        ),
                      ],
                    ),
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: AppColors.info.withValues(alpha: 0.1),
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(LucideIcons.users, color: AppColors.info, size: 28),
                    ),
                  ],
                ),
              ),
            ),
            
            const SizedBox(height: 20),
            
            // Employee List
            Expanded(
              child: employeesAsync.when(
                data: (employees) {
                  if (employees.isEmpty) {
                    return const Center(child: Text('No employees found.', style: TextStyle(color: AppColors.inkSecondary)));
                  }
                  
                  return ListView.builder(
                    padding: const EdgeInsets.fromLTRB(20, 0, 20, 100),
                    itemCount: employees.length,
                    itemBuilder: (context, index) {
                      final employee = employees[index];
                      return Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: GlassPanel(
                          padding: const EdgeInsets.all(16),
                          borderRadius: 20,
                          child: Row(
                            children: [
                              CircleAvatar(
                                backgroundColor: AppColors.info.withValues(alpha: 0.2),
                                foregroundColor: AppColors.info,
                                child: Text(employee.name?.substring(0, 1).toUpperCase() ?? '?'),
                              ),
                              const SizedBox(width: 16),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(employee.name ?? 'Unknown', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                                    const SizedBox(height: 4),
                                    Text(employee.role ?? employee.position ?? 'Employee', style: const TextStyle(color: AppColors.inkSecondary, fontSize: 12)),
                                  ],
                                ),
                              ),
                              Column(
                                crossAxisAlignment: CrossAxisAlignment.end,
                                children: [
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                    decoration: BoxDecoration(
                                      color: employee.status == 'ACTIVE' 
                                          ? AppColors.success.withValues(alpha: 0.2)
                                          : AppColors.inkSecondary.withValues(alpha: 0.2),
                                      borderRadius: BorderRadius.circular(8),
                                    ),
                                    child: Text(
                                      employee.status ?? 'UNKNOWN',
                                      style: TextStyle(
                                        fontSize: 10,
                                        fontWeight: FontWeight.bold,
                                        color: employee.status == 'ACTIVE' ? AppColors.success : AppColors.inkSecondary,
                                      ),
                                    ),
                                  ),
                                  const SizedBox(height: 8),
                                  Text(
                                    '₹${employee.salary?.toStringAsFixed(0) ?? "0"}/mo',
                                    style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12),
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
              ),
            ),
          ],
        ),
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () {
          Navigator.push(context, MaterialPageRoute(builder: (_) => const AddEmployeeScreen()));
        },
        backgroundColor: AppColors.inkPrimary,
        child: const Icon(LucideIcons.plus, color: AppColors.surface),
      ),
    );
  }
}

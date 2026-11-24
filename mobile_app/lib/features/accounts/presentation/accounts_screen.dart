import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:mobile_app/core/theme/typography.dart';
import 'providers/accounts_provider.dart';
import '../../../core/widgets/app_surfaces.dart';

class AccountsScreen extends ConsumerWidget {
  const AccountsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final accountsAsync = ref.watch(accountsProvider);

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
          'Cash & Bank',
          style: GoogleFonts.manrope(
            fontSize: 18,
            fontWeight: FontWeight.w700,
            color: AppColors.inkPrimary,
          ),
        ),
      ),
      body: accountsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator(color: AppColors.primary)),
        error: (e, _) => Center(
          child: Text('Error loading accounts', style: GoogleFonts.manrope(color: AppColors.danger)),
        ),
        data: (rawAccounts) {
          // Linked UPI accounts fold into their bank card (web parity).
          final accounts = mergeLinkedUpiForDisplay(rawAccounts);
          if (accounts.isEmpty) {
            return Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(LucideIcons.wallet, size: 48, color: AppColors.inkTertiary),
                  const SizedBox(height: 16),
                  Text(
                    'No accounts yet',
                    style: GoogleFonts.manrope(fontSize: 16, fontWeight: FontWeight.w600, color: AppColors.inkSecondary),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Add accounts from the web app Settings → Accounts',
                    style: AppText.caption.copyWith(color: AppColors.inkTertiary),
                    textAlign: TextAlign.center,
                  ),
                ],
              ),
            );
          }

          // Group by type
          final cash = accounts.where((a) => a.type == 'CASH').toList();
          final bank = accounts.where((a) => a.type == 'BANK').toList();
          final upi = accounts.where((a) => a.type == 'UPI').toList();
          final other = accounts.where((a) => !['CASH', 'BANK', 'UPI'].contains(a.type)).toList();

          final totalBalance = accounts.where((a) => a.type != 'LOAN').fold<double>(0, (s, a) => s + a.balance);

          return ListView(
            padding: const EdgeInsets.all(20),
            children: [
              // Total balance card
              Container(
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  color: AppColors.primary,
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Total Balance', style: AppText.label.copyWith(color: Colors.white60)),
                    const SizedBox(height: 6),
                    Text(
                      '₹${totalBalance.toStringAsFixed(2)}',
                      style: GoogleFonts.manrope(fontSize: 28, fontWeight: FontWeight.w700, color: Colors.white),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 24),
              if (cash.isNotEmpty) ...[
                SectionHeading('Cash', icon: LucideIcons.banknote, tint: AppColors.accountCash),
                ...cash.map((a) => _AccountCard(account: a)),
                const SizedBox(height: 16),
              ],
              if (bank.isNotEmpty) ...[
                SectionHeading('Bank', icon: LucideIcons.building2, tint: AppColors.accountBank),
                ...bank.map((a) => _AccountCard(account: a)),
                const SizedBox(height: 16),
              ],
              if (upi.isNotEmpty) ...[
                SectionHeading('UPI', icon: LucideIcons.smartphone, tint: AppColors.accountUpi),
                ...upi.map((a) => _AccountCard(account: a)),
                const SizedBox(height: 16),
              ],
              if (other.isNotEmpty) ...[
                SectionHeading('Other', icon: LucideIcons.creditCard, tint: AppColors.inkSecondary),
                ...other.map((a) => _AccountCard(account: a)),
              ],
            ],
          );
        },
      ),
    );
  }
}


class _AccountCard extends StatelessWidget {
  final AccountModel account;
  const _AccountCard({required this.account});

  @override
  Widget build(BuildContext context) {
    final isPositive = account.balance >= 0;
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [AppColors.cardShadow],
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Text(
                      account.name,
                      style: AppText.bodyStrong.copyWith(color: AppColors.inkPrimary),
                    ),
                    if (account.isDefault) ...[
                      const SizedBox(width: 6),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(
                          color: AppColors.primary.withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: Text('Default', style: AppText.label.copyWith(color: AppColors.primary, fontWeight: FontWeight.w700)),
                      ),
                    ],
                  ],
                ),
                if (account.upiId != null && account.upiId!.isNotEmpty)
                  Text(account.upiId!, style: AppText.caption.copyWith(color: AppColors.inkTertiary)),
                // Linked UPI handles folded into this bank card (web parity)
                for (final h in account.linkedUpiHandles)
                  Padding(
                    padding: const EdgeInsets.only(top: 3),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: AppColors.canvas,
                        borderRadius: BorderRadius.circular(6),
                        border: Border.all(color: AppColors.outlineVariant.withValues(alpha: 0.5)),
                      ),
                      child: Text(h, style: AppText.caption.copyWith(color: AppColors.inkTertiary)),
                    ),
                  ),
              ],
            ),
          ),
          Text(
            '₹${account.balance.toStringAsFixed(2)}',
            style: GoogleFonts.manrope(
              fontSize: 16, fontWeight: FontWeight.w700,
              color: isPositive ? AppColors.inkPrimary : AppColors.danger,
            ),
          ),
        ],
      ),
    );
  }
}

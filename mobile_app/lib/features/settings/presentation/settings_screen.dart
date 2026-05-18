import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/core/supabase/client.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:mobile_app/features/settings/data/models/business_profile.dart';
import 'package:mobile_app/features/settings/presentation/providers/settings_provider.dart';

class SettingsScreen extends ConsumerStatefulWidget {
  const SettingsScreen({super.key});

  @override
  ConsumerState<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends ConsumerState<SettingsScreen> {
  bool _pushNotificationsEnabled = false;

  Future<void> _updateProfileField(String column, dynamic value) async {
    final tenantId = ref.read(tenantContextProvider).valueOrNull?.tenantId;
    if (tenantId == null) return;
    await supabase.from('business_profile').update({column: value}).eq('tenant_id', tenantId);
    ref.invalidate(businessProfileProvider);
  }

  void _openEditProfile(BusinessProfile profile) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _EditBusinessProfileSheet(
        profile: profile,
        onSaved: () {
          ref.invalidate(businessProfileProvider);
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text(
                  'Business profile updated.',
                  style: GoogleFonts.inter(fontSize: 14, color: Colors.white),
                ),
                backgroundColor: AppColors.success,
                behavior: SnackBarBehavior.floating,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
            );
          }
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final profileAsync = ref.watch(businessProfileProvider);

    return Scaffold(
      backgroundColor: AppColors.canvas,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Settings',
              style: GoogleFonts.hankenGrotesk(
                fontSize: 20,
                fontWeight: FontWeight.w800,
                letterSpacing: -0.5,
                color: AppColors.inkPrimary,
              ),
            ),
            Text(
              'ACCOUNT & PREFERENCES',
              style: GoogleFonts.jetBrainsMono(
                fontSize: 9,
                fontWeight: FontWeight.w600,
                color: AppColors.secondary,
                letterSpacing: 1.5,
              ),
            ),
          ],
        ),
        iconTheme: const IconThemeData(color: AppColors.inkPrimary),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(24, 8, 24, 40),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // ── Business profile card ────────────────────────────
              profileAsync.when(
                data: (profile) {
                  if (profile == null) {
                    return Text(
                      'No profile found.',
                      style: GoogleFonts.inter(color: AppColors.inkTertiary),
                    );
                  }
                  return Container(
                    padding: const EdgeInsets.all(24),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(24),
                      boxShadow: [AppColors.cardShadow],
                    ),
                    child: Column(
                      children: [
                        // Header row: avatar + edit button
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Spacer(),
                            Container(
                              width: 64,
                              height: 64,
                              decoration: const BoxDecoration(
                                color: AppColors.primaryContainer,
                                shape: BoxShape.circle,
                              ),
                              child: const Icon(LucideIcons.building2, color: AppColors.primary, size: 28),
                            ),
                            Expanded(
                              child: Align(
                                alignment: Alignment.topRight,
                                child: GestureDetector(
                                  onTap: () => _openEditProfile(profile),
                                  child: Container(
                                    padding: const EdgeInsets.all(8),
                                    decoration: BoxDecoration(
                                      color: AppColors.primaryContainer,
                                      borderRadius: BorderRadius.circular(10),
                                    ),
                                    child: const Icon(
                                      LucideIcons.pencil,
                                      size: 16,
                                      color: AppColors.primary,
                                    ),
                                  ),
                                ),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 12),
                        Text(
                          profile.name ?? 'Company Name',
                          style: GoogleFonts.hankenGrotesk(
                            fontSize: 20,
                            fontWeight: FontWeight.w700,
                            color: AppColors.inkPrimary,
                          ),
                        ),
                        const SizedBox(height: 4),
                        if (profile.email != null)
                          Text(
                            profile.email!,
                            style: GoogleFonts.inter(fontSize: 13, color: AppColors.inkTertiary),
                          ),
                        if (profile.phone != null)
                          Text(
                            profile.phone!,
                            style: GoogleFonts.inter(fontSize: 13, color: AppColors.inkTertiary),
                          ),
                        const SizedBox(height: 20),
                        const Divider(color: AppColors.outlineVariant, height: 1),
                        const SizedBox(height: 16),
                        _ProfileRow('Address', profile.address ?? 'N/A'),
                        const SizedBox(height: 8),
                        _ProfileRow('GSTIN', profile.gstNo ?? 'N/A'),
                        const SizedBox(height: 8),
                        _ProfileRow('Currency', profile.currency ?? 'INR'),
                      ],
                    ),
                  );
                },
                loading: () => const Center(child: CircularProgressIndicator(color: AppColors.primary)),
                error: (e, _) => Text('Error: $e', style: GoogleFonts.inter(color: AppColors.danger)),
              ),

              const SizedBox(height: 24),

              // ── App preferences ──────────────────────────────────
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(6),
                    decoration: BoxDecoration(
                      color: AppColors.primaryContainer.withValues(alpha: 0.3),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: const Icon(LucideIcons.settings, size: 14, color: AppColors.primary),
                  ),
                  const SizedBox(width: 10),
                  Text(
                    'APP PREFERENCES',
                    style: GoogleFonts.jetBrainsMono(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 1.5,
                      color: AppColors.primary,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),

              Container(
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(24),
                  boxShadow: [AppColors.cardShadow],
                ),
                child: Column(
                  children: [
                    _SettingRow(
                      icon: LucideIcons.bell,
                      iconColor: AppColors.warning,
                      label: 'Push Notifications',
                      trailing: Switch(
                        value: _pushNotificationsEnabled,
                        onChanged: (v) => setState(() => _pushNotificationsEnabled = v),
                        activeThumbColor: AppColors.primary,
                        activeTrackColor: AppColors.primaryContainer,
                      ),
                    ),
                    const Divider(color: AppColors.outlineVariant, height: 1, indent: 60),
                    _SettingRow(
                      icon: LucideIcons.refreshCw,
                      iconColor: AppColors.primary,
                      label: 'Offline Sync Engine',
                      subtitle: 'Background queue active',
                      trailing: const Icon(LucideIcons.checkCircle2, color: AppColors.success, size: 20),
                    ),
                  ],
                ),
              ),

              const SizedBox(height: 24),

              // ── Invoice template ─────────────────────────────────
              profileAsync.when(
                data: (profile) {
                  if (profile == null) return const SizedBox.shrink();
                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.all(6),
                            decoration: BoxDecoration(
                              color: AppColors.primaryContainer.withValues(alpha: 0.3),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: const Icon(LucideIcons.calculator, size: 14, color: AppColors.primary),
                          ),
                          const SizedBox(width: 10),
                          Text(
                            'INVOICE TEMPLATE',
                            style: GoogleFonts.jetBrainsMono(
                              fontSize: 10,
                              fontWeight: FontWeight.w700,
                              letterSpacing: 1.5,
                              color: AppColors.primary,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      Container(
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(16),
                          boxShadow: [AppColors.cardShadow],
                        ),
                        child: Column(
                          children: [
                            _SettingRow(
                              icon: LucideIcons.shieldCheck,
                              iconColor: AppColors.primary,
                              label: 'Show Business GSTIN',
                              trailing: Switch(
                                value: profile.showGstin ?? true,
                                onChanged: (v) => _updateProfileField('show_gstin', v),
                                activeThumbColor: AppColors.primary,
                                activeTrackColor: AppColors.primaryContainer,
                              ),
                            ),
                            const Divider(color: AppColors.outlineVariant, height: 1, indent: 60),
                            _SettingRow(
                              icon: LucideIcons.userCheck,
                              iconColor: AppColors.secondary,
                              label: 'Show Customer GSTIN',
                              trailing: Switch(
                                value: profile.showCustomerGstin ?? true,
                                onChanged: (v) => _updateProfileField('show_customer_gstin', v),
                                activeThumbColor: AppColors.primary,
                                activeTrackColor: AppColors.primaryContainer,
                              ),
                            ),
                            const Divider(color: AppColors.outlineVariant, height: 1, indent: 60),
                            _SettingRow(
                              icon: LucideIcons.percent,
                              iconColor: AppColors.warning,
                              label: 'Show Tax Breakdown',
                              trailing: Switch(
                                value: profile.showTaxBreakdown ?? true,
                                onChanged: (v) => _updateProfileField('show_tax_breakdown', v),
                                activeThumbColor: AppColors.primary,
                                activeTrackColor: AppColors.primaryContainer,
                              ),
                            ),
                            const Divider(color: AppColors.outlineVariant, height: 1, indent: 60),
                            Padding(
                              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                              child: Row(
                                children: [
                                  Container(
                                    padding: const EdgeInsets.all(8),
                                    decoration: BoxDecoration(
                                      color: AppColors.inkTertiary.withValues(alpha: 0.1),
                                      borderRadius: BorderRadius.circular(10),
                                    ),
                                    child: const Icon(LucideIcons.calculator, color: AppColors.inkTertiary, size: 18),
                                  ),
                                  const SizedBox(width: 14),
                                  Expanded(
                                    child: Text(
                                      'Tax Mode',
                                      style: GoogleFonts.hankenGrotesk(
                                        fontSize: 14,
                                        fontWeight: FontWeight.w600,
                                        color: AppColors.inkPrimary,
                                      ),
                                    ),
                                  ),
                                  _TaxModePicker(
                                    current: profile.taxMode ?? 'EXCLUSIVE',
                                    onChanged: (v) => _updateProfileField('tax_mode', v),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  );
                },
                loading: () => const SizedBox.shrink(),
                error: (_, __) => const SizedBox.shrink(),
              ),

              const SizedBox(height: 32),

              // ── Logout ───────────────────────────────────────────
              SizedBox(
                width: double.infinity,
                child: TextButton(
                  onPressed: () async => await supabase.auth.signOut(),
                  style: TextButton.styleFrom(
                    foregroundColor: AppColors.danger,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(16),
                      side: const BorderSide(color: AppColors.danger),
                    ),
                    textStyle: GoogleFonts.inter(fontWeight: FontWeight.w700, fontSize: 15),
                  ),
                  child: const Text('Sign Out'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────
// Edit Business Profile — Modal Bottom Sheet
// ─────────────────────────────────────────────────────────

class _EditBusinessProfileSheet extends ConsumerStatefulWidget {
  final BusinessProfile profile;
  final VoidCallback onSaved;

  const _EditBusinessProfileSheet({required this.profile, required this.onSaved});

  @override
  ConsumerState<_EditBusinessProfileSheet> createState() => _EditBusinessProfileSheetState();
}

class _EditBusinessProfileSheetState extends ConsumerState<_EditBusinessProfileSheet> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _nameCtrl;
  late final TextEditingController _gstinCtrl;
  late final TextEditingController _addressCtrl;
  late final TextEditingController _phoneCtrl;
  late final TextEditingController _emailCtrl;
  late final TextEditingController _currencyCtrl;

  bool _isSaving = false;

  @override
  void initState() {
    super.initState();
    _nameCtrl = TextEditingController(text: widget.profile.name ?? '');
    _gstinCtrl = TextEditingController(text: widget.profile.gstNo ?? '');
    _addressCtrl = TextEditingController(text: widget.profile.address ?? '');
    _phoneCtrl = TextEditingController(text: widget.profile.phone ?? '');
    _emailCtrl = TextEditingController(text: widget.profile.email ?? '');
    _currencyCtrl = TextEditingController(text: widget.profile.currency ?? '');
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _gstinCtrl.dispose();
    _addressCtrl.dispose();
    _phoneCtrl.dispose();
    _emailCtrl.dispose();
    _currencyCtrl.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() => _isSaving = true);

    try {
      final tenantCtx = ref.read(tenantContextProvider).valueOrNull;
      final tenantId = tenantCtx?.tenantId;

      final updates = <String, dynamic>{
        'name': _nameCtrl.text.trim(),
        'gst_no': _gstinCtrl.text.trim().isEmpty ? null : _gstinCtrl.text.trim(),
        'address': _addressCtrl.text.trim().isEmpty ? null : _addressCtrl.text.trim(),
        'phone': _phoneCtrl.text.trim().isEmpty ? null : _phoneCtrl.text.trim(),
        'email': _emailCtrl.text.trim().isEmpty ? null : _emailCtrl.text.trim(),
        'currency': _currencyCtrl.text.trim().isEmpty ? null : _currencyCtrl.text.trim(),
      };

      if (tenantId != null && tenantId.isNotEmpty) {
        await supabase
            .from('business_profile')
            .update(updates)
            .eq('tenant_id', tenantId);
      } else {
        // Fallback: update by record id
        await supabase
            .from('business_profile')
            .update(updates)
            .eq('id', widget.profile.id);
      }

      if (mounted) {
        Navigator.of(context).pop();
        widget.onSaved();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              'Failed to save: $e',
              style: GoogleFonts.inter(fontSize: 13, color: Colors.white),
            ),
            backgroundColor: AppColors.danger,
            behavior: SnackBarBehavior.floating,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _isSaving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;

    return Container(
      margin: const EdgeInsets.fromLTRB(12, 0, 12, 12),
      decoration: BoxDecoration(
        color: AppColors.canvas,
        borderRadius: BorderRadius.circular(28),
      ),
      padding: EdgeInsets.fromLTRB(24, 24, 24, 24 + bottomInset),
      child: Form(
        key: _formKey,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Sheet handle
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: AppColors.outlineVariant,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const SizedBox(height: 20),

              // Title row
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: AppColors.primaryContainer,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: const Icon(LucideIcons.building2, size: 18, color: AppColors.primary),
                  ),
                  const SizedBox(width: 12),
                  Text(
                    'Edit Business Profile',
                    style: GoogleFonts.hankenGrotesk(
                      fontSize: 18,
                      fontWeight: FontWeight.w700,
                      color: AppColors.inkPrimary,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 24),

              _FormField(label: 'Business Name', controller: _nameCtrl, hint: 'e.g. Acme Pvt. Ltd.', required: true),
              const SizedBox(height: 16),
              _FormField(label: 'GSTIN', controller: _gstinCtrl, hint: 'e.g. 29ABCDE1234F1Z5'),
              const SizedBox(height: 16),
              _FormField(label: 'Address', controller: _addressCtrl, hint: 'Street, City, State', maxLines: 3),
              const SizedBox(height: 16),
              _FormField(
                label: 'Phone',
                controller: _phoneCtrl,
                hint: '+91 98765 43210',
                keyboardType: TextInputType.phone,
              ),
              const SizedBox(height: 16),
              _FormField(
                label: 'Email',
                controller: _emailCtrl,
                hint: 'contact@company.com',
                keyboardType: TextInputType.emailAddress,
              ),
              const SizedBox(height: 16),
              _FormField(label: 'Currency Symbol', controller: _currencyCtrl, hint: 'e.g. ₹  or  USD'),
              const SizedBox(height: 28),

              // Save button
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: _isSaving ? null : _save,
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.primary,
                    disabledBackgroundColor: AppColors.primary.withValues(alpha: 0.5),
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                    textStyle: GoogleFonts.inter(fontWeight: FontWeight.w700, fontSize: 15),
                  ),
                  child: _isSaving
                      ? const SizedBox(
                          height: 20,
                          width: 20,
                          child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2.5),
                        )
                      : const Text('Save Changes'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────
// Shared form field widget
// ─────────────────────────────────────────────────────────

class _FormField extends StatelessWidget {
  final String label;
  final TextEditingController controller;
  final String? hint;
  final bool required;
  final int maxLines;
  final TextInputType keyboardType;

  const _FormField({
    required this.label,
    required this.controller,
    this.hint,
    this.required = false,
    this.maxLines = 1,
    this.keyboardType = TextInputType.text,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        RichText(
          text: TextSpan(
            text: label,
            style: GoogleFonts.inter(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: AppColors.inkSecondary,
              letterSpacing: 0.3,
            ),
            children: required
                ? [
                    TextSpan(
                      text: ' *',
                      style: GoogleFonts.inter(color: AppColors.danger),
                    ),
                  ]
                : [],
          ),
        ),
        const SizedBox(height: 6),
        TextFormField(
          controller: controller,
          maxLines: maxLines,
          keyboardType: keyboardType,
          style: GoogleFonts.inter(fontSize: 14, color: AppColors.inkPrimary),
          decoration: InputDecoration(
            hintText: hint,
            hintStyle: GoogleFonts.inter(fontSize: 14, color: AppColors.inkTertiary),
            filled: true,
            fillColor: Colors.white,
            contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: const BorderSide(color: AppColors.outlineVariant),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: const BorderSide(color: AppColors.outlineVariant),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: const BorderSide(color: AppColors.primary, width: 1.5),
            ),
            errorBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: const BorderSide(color: AppColors.danger),
            ),
            focusedErrorBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: const BorderSide(color: AppColors.danger, width: 1.5),
            ),
          ),
          validator: required
              ? (v) => (v == null || v.trim().isEmpty) ? '$label is required' : null
              : null,
        ),
      ],
    );
  }
}

// ─────────────────────────────────────────────────────────
// Read-only profile row
// ─────────────────────────────────────────────────────────

class _ProfileRow extends StatelessWidget {
  final String label;
  final String value;

  const _ProfileRow(this.label, this.value);

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: GoogleFonts.inter(fontSize: 13, color: AppColors.inkTertiary)),
        const SizedBox(width: 12),
        Expanded(
          child: Text(
            value,
            textAlign: TextAlign.right,
            softWrap: true,
            style: GoogleFonts.inter(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.inkPrimary),
          ),
        ),
      ],
    );
  }
}

// ─────────────────────────────────────────────────────────
// Tax mode pill picker
// ─────────────────────────────────────────────────────────

class _TaxModePicker extends StatelessWidget {
  final String current;
  final ValueChanged<String> onChanged;

  const _TaxModePicker({required this.current, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: ['INCLUSIVE', 'EXCLUSIVE'].map((mode) {
        final selected = current == mode;
        return GestureDetector(
          onTap: () => onChanged(mode),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 150),
            margin: const EdgeInsets.only(left: 6),
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: BoxDecoration(
              color: selected ? AppColors.primaryContainer : Colors.transparent,
              borderRadius: BorderRadius.circular(20),
              border: Border.all(
                color: selected ? AppColors.primaryContainer : AppColors.outlineVariant,
                width: 1.5,
              ),
            ),
            child: Text(
              mode,
              style: GoogleFonts.jetBrainsMono(
                fontSize: 10,
                fontWeight: FontWeight.w700,
                letterSpacing: 0.8,
                color: selected ? AppColors.onPrimaryContainer : AppColors.inkTertiary,
              ),
            ),
          ),
        );
      }).toList(),
    );
  }
}

// ─────────────────────────────────────────────────────────
// Preference row
// ─────────────────────────────────────────────────────────

class _SettingRow extends StatelessWidget {
  final IconData icon;
  final Color iconColor;
  final String label;
  final String? subtitle;
  final Widget trailing;

  const _SettingRow({
    required this.icon,
    required this.iconColor,
    required this.label,
    this.subtitle,
    required this.trailing,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: iconColor.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icon, color: iconColor, size: 18),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: GoogleFonts.hankenGrotesk(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: AppColors.inkPrimary,
                  ),
                ),
                if (subtitle != null)
                  Text(
                    subtitle!,
                    style: GoogleFonts.inter(fontSize: 11, color: AppColors.inkTertiary),
                  ),
              ],
            ),
          ),
          trailing,
        ],
      ),
    );
  }
}

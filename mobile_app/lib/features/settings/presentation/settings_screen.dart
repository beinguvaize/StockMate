import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/core/database/sync_status_pill.dart'
    show pendingSyncCountProvider;
import 'package:mobile_app/core/design/bl_widgets.dart';
import 'package:mobile_app/core/supabase/client.dart';
import 'package:mobile_app/core/update/auto_updater.dart';
import 'package:mobile_app/features/settings/data/models/business_profile.dart';
import 'package:mobile_app/features/settings/presentation/invoice_template_screen.dart';
import 'package:mobile_app/features/settings/presentation/providers/settings_provider.dart';
import 'package:mobile_app/features/settings/presentation/sync_diagnostics_screen.dart';
import 'package:mobile_app/main.dart' show syncServiceProvider;
import 'package:package_info_plus/package_info_plus.dart';

const _grey = Color(0xFF7A8088);

/// Changes that could not be delivered and are parked for the owner.
final _failedSyncCountProvider = StreamProvider<int>(
    (ref) => ref.watch(syncServiceProvider).watchFailedCount());

/// "Settings" (canvas): the shop's profile, app switches and what a bill
/// shows.
class SettingsScreen extends ConsumerStatefulWidget {
  const SettingsScreen({super.key});

  @override
  ConsumerState<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends ConsumerState<SettingsScreen> {
  bool _pushNotificationsEnabled = false;

  void _openEditProfile(BusinessProfile profile) {
    showBlSheet<void>(
      context: context,
      builder: (_) => _EditBusinessProfileSheet(
        profile: profile,
        onSaved: () {
          ref.invalidate(businessProfileProvider);
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
              content: Text('Business profile updated.'),
              behavior: SnackBarBehavior.floating,
            ));
          }
        },
      ),
    );
  }

  Widget _fact(String label, String value, {bool last = false}) => Container(
        padding: const EdgeInsets.symmetric(vertical: 9),
        decoration: last
            ? null
            : const BoxDecoration(
                border: Border(bottom: BorderSide(color: Color(0xFFECEBE9)))),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(
              width: 84,
              child: Text(label,
                  style: Bl.inter(13, w: FontWeight.w500, c: _grey)),
            ),
            Expanded(
              child: Text(value,
                  textAlign: TextAlign.right,
                  style: Bl.inter(13.5, w: FontWeight.w600, c: Bl.ink)),
            ),
          ],
        ),
      );

  Widget _row(
          {required String icon,
          required String title,
          String? sub,
          Widget? trailing,
          VoidCallback? onTap,
          bool last = false}) {
    final row = Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: last
          ? null
          : const BoxDecoration(
              border: Border(bottom: BorderSide(color: Color(0xFFECEBE9)))),
      child: Row(
        children: [
          Container(
            width: 36,
            height: 36,
            alignment: Alignment.center,
            decoration: BoxDecoration(
                color: Bl.white, borderRadius: BorderRadius.circular(11)),
            child: BlIcon(icon, size: 17, color: Bl.ink3),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: Bl.tight(14.5, w: FontWeight.w600)),
                if (sub != null) ...[
                  const SizedBox(height: 1),
                  Text(sub,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: Bl.inter(12, c: _grey)),
                ],
              ],
            ),
          ),
          if (trailing != null) ...[const SizedBox(width: 10), trailing],
        ],
      ),
    );
    return onTap == null
        ? row
        : Semantics(
            button: true,
            label: sub == null ? title : '$title. $sub',
            excludeSemantics: true,
            child: BlTap(onTap: onTap, child: row),
          );
  }

  Widget _group(String heading, List<Widget> rows) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          BlGroupHeader(heading),
          Container(
            margin: const EdgeInsets.fromLTRB(16, 4, 16, 0),
            decoration: BoxDecoration(
                color: Bl.tile, borderRadius: BorderRadius.circular(18)),
            child: Column(children: rows),
          ),
        ],
      );

  @override
  Widget build(BuildContext context) {
    final profileAsync = ref.watch(businessProfileProvider);
    final profile = profileAsync.valueOrNull;
    final waiting = (ref.watch(pendingSyncCountProvider).valueOrNull ?? 0) +
        (ref.watch(_failedSyncCountProvider).valueOrNull ?? 0);
    final taxMode = switch ((profile?.taxMode ?? 'EXCLUSIVE').toUpperCase()) {
      'INCLUSIVE' => 'GST included in prices',
      'NONE' => 'No GST',
      _ => 'GST added to prices',
    };
    const chevron =
        BlIcon(BlIcons.chevronRight, size: 16, color: Color(0xFFB8BCC2));

    return Scaffold(
      backgroundColor: Bl.white,
      body: SafeArea(
        child: Column(
          children: [
            const BlBackHeader(title: 'Settings'),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.only(bottom: 24),
                children: [
                  Container(
                    margin: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                    padding: const EdgeInsets.fromLTRB(14, 14, 14, 6),
                    decoration: BoxDecoration(
                        color: Bl.tile,
                        borderRadius: BorderRadius.circular(18)),
                    child: profileAsync.isLoading && profile == null
                        ? const Padding(
                            padding: EdgeInsets.symmetric(vertical: 30),
                            child: Center(
                                child: CircularProgressIndicator(
                                    color: Bl.amber, strokeWidth: 2)),
                          )
                        : profile == null
                            ? Padding(
                                padding: const EdgeInsets.only(bottom: 8),
                                child: Text(
                                    'Could not load the business profile. Check your internet and try again.',
                                    style: Bl.inter(13,
                                        c: Bl.redDeep, h: 1.5)),
                              )
                            : Column(
                                children: [
                                  Row(
                                    children: [
                                      BlTintAvatar(profile.name ?? '',
                                          size: 44),
                                      const SizedBox(width: 12),
                                      Expanded(
                                        child: Column(
                                          crossAxisAlignment:
                                              CrossAxisAlignment.start,
                                          children: [
                                            Text(
                                                profile.name ??
                                                    'Your shop',
                                                maxLines: 1,
                                                overflow:
                                                    TextOverflow.ellipsis,
                                                style: Bl.tight(16,
                                                    w: FontWeight.w700,
                                                    ls: -0.01)),
                                            const SizedBox(height: 1),
                                            Text(
                                                [
                                                  profile.email ?? '',
                                                  profile.phone ?? '',
                                                ]
                                                    .where((s) =>
                                                        s.trim().isNotEmpty)
                                                    .join(' · '),
                                                maxLines: 1,
                                                overflow:
                                                    TextOverflow.ellipsis,
                                                style: Bl.inter(12,
                                                    c: _grey)),
                                          ],
                                        ),
                                      ),
                                      const SizedBox(width: 8),
                                      Semantics(
                                        button: true,
                                        label: 'Edit business profile',
                                        excludeSemantics: true,
                                        child: BlTap(
                                          onTap: () =>
                                              _openEditProfile(profile),
                                          child: Container(
                                            height: 32,
                                            padding:
                                                const EdgeInsets.symmetric(
                                                    horizontal: 14),
                                            alignment: Alignment.center,
                                            decoration: BoxDecoration(
                                                color: Bl.white,
                                                borderRadius:
                                                    BorderRadius.circular(
                                                        999)),
                                            child: Text('Edit',
                                                style: Bl.tight(13,
                                                    w: FontWeight.w600,
                                                    ls: 0)),
                                          ),
                                        ),
                                      ),
                                    ],
                                  ),
                                  const SizedBox(height: 8),
                                  _fact(
                                      'Address',
                                      (profile.address ?? '').trim().isEmpty
                                          ? 'Not set'
                                          : profile.address!.trim()),
                                  _fact(
                                      'GSTIN',
                                      (profile.gstNo ?? '').trim().isEmpty
                                          ? 'Not set'
                                          : profile.gstNo!.trim()),
                                  _fact('Currency', profile.currency ?? 'INR',
                                      last: true),
                                ],
                              ),
                  ),
                  _group('App', [
                    _row(
                      icon: BlIcons.bell,
                      title: 'Push notifications',
                      trailing: BlToggle(
                        value: _pushNotificationsEnabled,
                        label: 'Push notifications',
                        onChanged: (v) =>
                            setState(() => _pushNotificationsEnabled = v),
                      ),
                    ),
                    _row(
                      icon: BlIcons.sync,
                      title: 'Offline sync',
                      sub: 'Working in the background',
                      trailing: Text('On',
                          style: Bl.tight(13,
                              w: FontWeight.w600,
                              c: const Color(0xFF17663A))),
                    ),
                    _row(
                      icon: BlIcons.doc,
                      title: 'Sync diagnostics',
                      sub: 'Waiting or failed changes',
                      last: true,
                      onTap: () => Navigator.of(context).push(
                        MaterialPageRoute(
                            builder: (_) => const SyncDiagnosticsScreen()),
                      ),
                      trailing: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          if (waiting > 0) ...[
                            BlStatusPill.yellow('$waiting waiting'),
                            const SizedBox(width: 6),
                          ],
                          chevron,
                        ],
                      ),
                    ),
                  ]),
                  if (profile != null)
                    _group('Billing', [
                      _row(
                        icon: BlIcons.receipt,
                        title: 'Invoice template',
                        sub: 'What shows on a printed bill · $taxMode',
                        last: true,
                        trailing: chevron,
                        onTap: () => Navigator.of(context).push(
                          MaterialPageRoute(
                              builder: (_) => const InvoiceTemplateScreen()),
                        ),
                      ),
                    ]),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 20, 16, 0),
                    child: BlButton('Check for updates',
                        kind: BlButtonKind.soft,
                        onTap: () => AutoUpdater.instance
                            .checkForUpdate(context, verbose: true)),
                  ),
                  Center(
                    child: BlTap(
                      onTap: () async => await supabase.auth.signOut(),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 24, vertical: 14),
                        child: Text('Sign out',
                            style: Bl.tight(14.5,
                                w: FontWeight.w600, c: Bl.redDeep)),
                      ),
                    ),
                  ),
                  FutureBuilder<PackageInfo>(
                    future: PackageInfo.fromPlatform(),
                    builder: (context, snap) {
                      final v = snap.data;
                      return Text(
                          v == null
                              ? 'bookledger'
                              : 'bookledger · v${v.version} (build ${v.buildNumber})',
                          textAlign: TextAlign.center,
                          style: Bl.inter(12, c: Bl.mute));
                    },
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Edit business profile ────────────────────────────────────────────────────
class _EditBusinessProfileSheet extends ConsumerStatefulWidget {
  final BusinessProfile profile;
  final VoidCallback onSaved;
  const _EditBusinessProfileSheet(
      {required this.profile, required this.onSaved});

  @override
  ConsumerState<_EditBusinessProfileSheet> createState() =>
      _EditBusinessProfileSheetState();
}

class _EditBusinessProfileSheetState
    extends ConsumerState<_EditBusinessProfileSheet> {
  late final _nameCtrl = TextEditingController(text: widget.profile.name ?? '');
  late final _gstinCtrl =
      TextEditingController(text: widget.profile.gstNo ?? '');
  late final _addressCtrl =
      TextEditingController(text: widget.profile.address ?? '');
  late final _phoneCtrl =
      TextEditingController(text: widget.profile.phone ?? '');
  late final _emailCtrl =
      TextEditingController(text: widget.profile.email ?? '');
  late final _currencyCtrl =
      TextEditingController(text: widget.profile.currency ?? '');

  bool _isSaving = false;
  String? _error;

  @override
  void dispose() {
    for (final c in [
      _nameCtrl,
      _gstinCtrl,
      _addressCtrl,
      _phoneCtrl,
      _emailCtrl,
      _currencyCtrl
    ]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    if (_nameCtrl.text.trim().isEmpty) {
      setState(() => _error = 'Business name is required.');
      return;
    }
    setState(() {
      _isSaving = true;
      _error = null;
    });

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
      debugPrint('[settings] profile save failed: $e');
      if (mounted) {
        setState(() => _error =
            'May not have saved. Check the profile before trying again. ($e)');
      }
    } finally {
      if (mounted) setState(() => _isSaving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const BlSheetTitle('Edit business profile', size: 16, divider: true),
        BlField(
          label: 'Business name',
          hint: 'e.g. Sharma General Store',
          controller: _nameCtrl,
          capitalization: TextCapitalization.words,
        ),
        BlField(
          label: 'GSTIN',
          hint: 'e.g. 29ABCDE1234F1Z5',
          controller: _gstinCtrl,
          capitalization: TextCapitalization.characters,
        ),
        BlField(
          label: 'Address',
          hint: 'Street, City, State',
          controller: _addressCtrl,
          capitalization: TextCapitalization.words,
        ),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              flex: 13,
              child: BlField(
                label: 'Phone',
                hint: '98765 43210',
                controller: _phoneCtrl,
                keyboardType: TextInputType.phone,
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              flex: 9,
              child: BlField(
                label: 'Currency symbol',
                hint: '₹',
                controller: _currencyCtrl,
              ),
            ),
          ],
        ),
        BlField(
          label: 'Email',
          hint: 'owner@shop.in',
          controller: _emailCtrl,
          keyboardType: TextInputType.emailAddress,
        ),
        if (_error != null)
          Container(
            margin: const EdgeInsets.only(top: 12),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
            decoration: BoxDecoration(
                color: Bl.redSoft, borderRadius: BorderRadius.circular(12)),
            child: Text(_error!,
                style: Bl.inter(12.5, w: FontWeight.w500, c: Bl.redDeep)),
          ),
        const SizedBox(height: 16),
        BlButton('Save changes',
            loading: _isSaving, onTap: _isSaving ? null : _save),
      ],
    );
  }
}

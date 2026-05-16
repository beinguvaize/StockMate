import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:mobile_app/features/clients_suppliers/data/models/client.dart';
import 'package:mobile_app/main.dart' show syncServiceProvider;
import 'package:mobile_app/features/clients_suppliers/presentation/providers/crm_provider.dart';

// Mirrors web Clients.jsx form schema exactly.
// DB columns written: id, tenant_id, name, contact, phone, email, address,
// gstin, state, state_code, pin_code, client_type, price_tier, credit_days.
const _kIndianStates = <_State>[
  _State('Jammu & Kashmir', '01'), _State('Himachal Pradesh', '02'),
  _State('Punjab', '03'),          _State('Chandigarh', '04'),
  _State('Uttarakhand', '05'),     _State('Haryana', '06'),
  _State('Delhi', '07'),           _State('Rajasthan', '08'),
  _State('Uttar Pradesh', '09'),   _State('Bihar', '10'),
  _State('Sikkim', '11'),          _State('Arunachal Pradesh', '12'),
  _State('Nagaland', '13'),        _State('Manipur', '14'),
  _State('Mizoram', '15'),         _State('Tripura', '16'),
  _State('Meghalaya', '17'),       _State('Assam', '18'),
  _State('West Bengal', '19'),     _State('Jharkhand', '20'),
  _State('Odisha', '21'),          _State('Chhattisgarh', '22'),
  _State('Madhya Pradesh', '23'),  _State('Gujarat', '24'),
  _State('Dadra & Nagar Haveli and Daman & Diu', '26'),
  _State('Maharashtra', '27'),     _State('Karnataka', '29'),
  _State('Goa', '30'),             _State('Lakshadweep', '31'),
  _State('Kerala', '32'),          _State('Tamil Nadu', '33'),
  _State('Puducherry', '34'),      _State('Andaman & Nicobar Islands', '35'),
  _State('Telangana', '36'),       _State('Andhra Pradesh', '37'),
  _State('Ladakh', '38'),          _State('Other Territory', '97'),
];

class _State {
  final String name;
  final String code;
  const _State(this.name, this.code);
}

const _kCreditDayOptions = <int>[0, 7, 15, 30, 45, 60, 90];

class AddClientScreen extends ConsumerStatefulWidget {
  final Client? client; // null = create, non-null = edit
  const AddClientScreen({super.key, this.client});

  @override
  ConsumerState<AddClientScreen> createState() => _AddClientScreenState();
}

class _AddClientScreenState extends ConsumerState<AddClientScreen> {
  final _nameController    = TextEditingController();
  final _contactController = TextEditingController();
  final _phoneController   = TextEditingController();
  final _emailController   = TextEditingController();
  final _addressController = TextEditingController();
  final _gstinController   = TextEditingController();
  final _pinCodeController = TextEditingController();

  String? _selectedState;
  String? _selectedStateCode;
  String _clientType = 'B2C';   // B2C | B2B
  String _priceTier  = 'RETAIL'; // RETAIL | WHOLESALE | DISTRIBUTOR
  int    _creditDays = 0;

  bool _isLoading = false;
  String? _formError;

  bool get _isEdit => widget.client != null;

  @override
  void initState() {
    super.initState();
    final c = widget.client;
    if (c != null) {
      _nameController.text    = c.name ?? '';
      _contactController.text = c.contact ?? '';
      _phoneController.text   = c.phone ?? '';
      _emailController.text   = c.email ?? '';
      _addressController.text = c.address ?? '';
      _gstinController.text   = (c.gstin ?? c.gstNo ?? '').toUpperCase();
      _pinCodeController.text = c.pinCode ?? '';
      _selectedState     = c.state;
      _selectedStateCode = c.stateCode;
      _clientType        = c.clientType ?? 'B2C';
      _priceTier         = c.priceTier ?? 'RETAIL';
      _creditDays        = c.creditDays ?? 0;
    }
  }

  @override
  void dispose() {
    _nameController.dispose();
    _contactController.dispose();
    _phoneController.dispose();
    _emailController.dispose();
    _addressController.dispose();
    _gstinController.dispose();
    _pinCodeController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() => _formError = null);
    final name = _nameController.text.trim();
    if (name.length < 2) {
      setState(() => _formError = 'Business / client name is required.');
      return;
    }
    final gstin = _gstinController.text.trim().toUpperCase();
    if (gstin.isNotEmpty && gstin.length != 15) {
      setState(() => _formError = 'GSTIN must be exactly 15 characters.');
      return;
    }

    final tenantCtx = ref.read(tenantContextProvider).valueOrNull;
    if (tenantCtx == null) {
      setState(() => _formError = 'No tenant context — sign out and back in.');
      return;
    }

    setState(() => _isLoading = true);
    try {
      final data = <String, dynamic>{
        'id': _isEdit
            ? widget.client!.id
            : 'CLI-${DateTime.now().millisecondsSinceEpoch}-${DateTime.now().microsecond}',
        'tenant_id': tenantCtx.tenantId,
        'name':       name,
        'contact':    _contactController.text.trim(),
        'phone':      _phoneController.text.trim(),
        'email':      _emailController.text.trim(),
        'address':    _addressController.text.trim(),
        'gstin':      gstin,
        'state':      _selectedState ?? '',
        'state_code': _selectedStateCode ?? '',
        'pin_code':   _pinCodeController.text.trim(),
        'client_type': _clientType,
        'price_tier':  _priceTier,
        'credit_days': _creditDays,
      };

      final queued = await ref.read(syncServiceProvider)
          .upsertOnlineOrQueue('clients', data);

      if (mounted) {
        ref.invalidate(clientsProvider);
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              queued
                  ? 'Saved offline — will sync when online'
                  : (_isEdit ? 'Client updated' : 'Client added'),
              style: GoogleFonts.inter(color: AppColors.inkPrimary),
            ),
            backgroundColor: AppColors.primaryContainer,
            behavior: SnackBarBehavior.floating,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          ),
        );
      }
    } catch (e) {
      if (mounted) setState(() => _formError = 'Save failed: $e');
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.canvas,
      appBar: AppBar(
        backgroundColor: AppColors.canvas,
        elevation: 0,
        scrolledUnderElevation: 0,
        leading: IconButton(
          icon: const Icon(LucideIcons.arrowLeft, size: 20, color: AppColors.inkPrimary),
          onPressed: () => Navigator.pop(context),
        ),
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              _isEdit ? 'Edit Client' : 'Add Client',
              style: GoogleFonts.hankenGrotesk(
                color: AppColors.inkPrimary,
                fontSize: 20,
                fontWeight: FontWeight.w800,
                letterSpacing: -0.5,
              ),
            ),
            Text(
              'CRM',
              style: GoogleFonts.jetBrainsMono(
                color: AppColors.secondary,
                fontSize: 9,
                fontWeight: FontWeight.w600,
                letterSpacing: 1.5,
              ),
            ),
          ],
        ),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 100),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // ── BASIC INFO ──────────────────────────────────────────
            _CardSection(
              icon: LucideIcons.userCircle,
              title: 'BASIC INFORMATION',
              children: [
                _FieldLabel(text: 'Business / Client Name', required: true),
                _Field(
                  controller: _nameController,
                  hint: 'e.g. Sunrise Traders Pvt Ltd',
                ),
                const SizedBox(height: 14),
                _FieldLabel(text: 'Contact Person'),
                _Field(
                  controller: _contactController,
                  hint: 'e.g. Ramesh Kumar',
                ),
                const SizedBox(height: 14),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          _FieldLabel(text: 'Phone'),
                          _Field(
                            controller: _phoneController,
                            hint: '9876543210',
                            keyboardType: TextInputType.phone,
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          _FieldLabel(text: 'Email'),
                          _Field(
                            controller: _emailController,
                            hint: 'billing@client.com',
                            keyboardType: TextInputType.emailAddress,
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 14),
                _FieldLabel(text: 'Address'),
                _Field(
                  controller: _addressController,
                  hint: 'Shop / Street / Area / City',
                  maxLines: 2,
                ),
              ],
            ),

            const SizedBox(height: 16),

            // ── LOCATION ────────────────────────────────────────────
            _CardSection(
              icon: LucideIcons.mapPin,
              title: 'LOCATION',
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      flex: 3,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          _FieldLabel(text: 'State'),
                          _StateDropdown(
                            value: _selectedState,
                            onChanged: (st) {
                              setState(() {
                                _selectedState = st?.name;
                                _selectedStateCode = st?.code;
                              });
                            },
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      flex: 2,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          _FieldLabel(text: 'PIN Code'),
                          _Field(
                            controller: _pinCodeController,
                            hint: '600001',
                            keyboardType: TextInputType.number,
                            maxLength: 6,
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ],
            ),

            const SizedBox(height: 16),

            // ── GST ─────────────────────────────────────────────────
            _CardSection(
              icon: LucideIcons.shieldCheck,
              title: 'GST DETAILS',
              trailing: 'OPTIONAL',
              children: [
                _FieldLabel(text: 'GSTIN'),
                _Field(
                  controller: _gstinController,
                  hint: '22AAAAA0000A1Z5',
                  mono: true,
                  maxLength: 15,
                  textCapitalization: TextCapitalization.characters,
                ),
              ],
            ),

            const SizedBox(height: 16),

            // ── ACCOUNT CLASSIFICATION ──────────────────────────────
            _CardSection(
              icon: LucideIcons.tag,
              title: 'ACCOUNT CLASSIFICATION',
              children: [
                _FieldLabel(text: 'Account Type'),
                Row(
                  children: [
                    Expanded(
                      child: _TypeCard(
                        title: 'B2C — Consumer',
                        sub: 'Walk-in / retail',
                        emoji: '🛒',
                        selected: _clientType == 'B2C',
                        onTap: () => setState(() => _clientType = 'B2C'),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: _TypeCard(
                        title: 'B2B — Business',
                        sub: 'Company / distributor',
                        emoji: '🏢',
                        selected: _clientType == 'B2B',
                        onTap: () => setState(() => _clientType = 'B2B'),
                      ),
                    ),
                  ],
                ),

                const SizedBox(height: 14),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          _FieldLabel(text: 'Price Tier'),
                          _BasicDropdown<String>(
                            value: _priceTier,
                            items: const [
                              MapEntry('RETAIL',      'Retail — Standard'),
                              MapEntry('WHOLESALE',   'Wholesale — Volume'),
                              MapEntry('DISTRIBUTOR', 'Distributor — Trade'),
                            ],
                            onChanged: (v) => setState(() => _priceTier = v ?? 'RETAIL'),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          _FieldLabel(text: 'Credit Terms'),
                          _BasicDropdown<int>(
                            value: _creditDays,
                            items: _kCreditDayOptions.map((d) => MapEntry(
                              d, d == 0 ? 'Cash on delivery' : 'Net $d days')).toList(),
                            onChanged: (v) => setState(() => _creditDays = v ?? 0),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ],
            ),

            if (_formError != null) ...[
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                decoration: BoxDecoration(
                  color: AppColors.danger.withValues(alpha: 0.08),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: AppColors.danger.withValues(alpha: 0.3)),
                ),
                child: Row(
                  children: [
                    const Icon(LucideIcons.alertCircle, size: 16, color: AppColors.danger),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        _formError!,
                        style: GoogleFonts.inter(
                          fontSize: 13,
                          color: AppColors.danger,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
          child: ElevatedButton(
            onPressed: _isLoading ? null : _submit,
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.primaryContainer,
              foregroundColor: AppColors.inkPrimary,
              disabledBackgroundColor: AppColors.primaryContainer.withValues(alpha: 0.4),
              elevation: 0,
              padding: const EdgeInsets.symmetric(vertical: 16),
              shape: const StadiumBorder(),
            ),
            child: _isLoading
                ? const SizedBox(
                    width: 20, height: 20,
                    child: CircularProgressIndicator(color: AppColors.inkPrimary, strokeWidth: 2.5),
                  )
                : Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(_isEdit ? LucideIcons.save : LucideIcons.userPlus, size: 18),
                      const SizedBox(width: 8),
                      Text(
                        _isEdit ? 'SAVE CHANGES' : 'ADD CLIENT',
                        style: GoogleFonts.jetBrainsMono(
                          fontWeight: FontWeight.w700, fontSize: 13, letterSpacing: 1,
                        ),
                      ),
                    ],
                  ),
          ),
        ),
      ),
    );
  }
}

// ─── Section card wrapper ─────────────────────────────────────────────────────
class _CardSection extends StatelessWidget {
  final IconData icon;
  final String title;
  final String? trailing;
  final List<Widget> children;
  const _CardSection({
    required this.icon,
    required this.title,
    required this.children,
    this.trailing,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.black.withValues(alpha: 0.05)),
        boxShadow: [AppColors.cardShadow],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
            decoration: BoxDecoration(
              border: Border(bottom: BorderSide(color: Colors.black.withValues(alpha: 0.05))),
            ),
            child: Row(
              children: [
                Icon(icon, size: 14, color: AppColors.primary),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    title,
                    style: GoogleFonts.jetBrainsMono(
                      fontSize: 11,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 1.5,
                      color: AppColors.inkPrimary,
                    ),
                  ),
                ),
                if (trailing != null)
                  Text(
                    trailing!,
                    style: GoogleFonts.jetBrainsMono(
                      fontSize: 9, fontWeight: FontWeight.w700,
                      color: AppColors.inkTertiary, letterSpacing: 1.2,
                    ),
                  ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: children,
            ),
          ),
        ],
      ),
    );
  }
}

class _FieldLabel extends StatelessWidget {
  final String text;
  final bool required;
  const _FieldLabel({required this.text, this.required = false});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6, left: 2),
      child: RichText(
        text: TextSpan(children: [
          TextSpan(
            text: text.toUpperCase(),
            style: GoogleFonts.jetBrainsMono(
              fontSize: 10, fontWeight: FontWeight.w700,
              color: AppColors.inkTertiary, letterSpacing: 1,
            ),
          ),
          if (required)
            TextSpan(
              text: ' *',
              style: GoogleFonts.jetBrainsMono(
                fontSize: 11, fontWeight: FontWeight.w900, color: AppColors.primary,
              ),
            ),
        ]),
      ),
    );
  }
}

class _Field extends StatelessWidget {
  final TextEditingController controller;
  final String hint;
  final TextInputType? keyboardType;
  final int maxLines;
  final int? maxLength;
  final bool mono;
  final TextCapitalization textCapitalization;
  const _Field({
    required this.controller,
    required this.hint,
    this.keyboardType,
    this.maxLines = 1,
    this.maxLength,
    this.mono = false,
    this.textCapitalization = TextCapitalization.none,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.canvas,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.black.withValues(alpha: 0.06)),
      ),
      child: TextField(
        controller: controller,
        keyboardType: keyboardType,
        maxLines: maxLines,
        maxLength: maxLength,
        textCapitalization: textCapitalization,
        style: (mono
                ? GoogleFonts.jetBrainsMono(fontSize: 13, fontWeight: FontWeight.w700, letterSpacing: 1)
                : GoogleFonts.inter(fontSize: 14, fontWeight: FontWeight.w600))
            .copyWith(color: AppColors.inkPrimary),
        decoration: InputDecoration(
          counterText: '',
          border: InputBorder.none,
          contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          hintText: hint,
          hintStyle: GoogleFonts.inter(
            color: AppColors.inkTertiary,
            fontSize: 13,
          ),
        ),
      ),
    );
  }
}

class _StateDropdown extends StatelessWidget {
  final String? value;
  final ValueChanged<_State?> onChanged;
  const _StateDropdown({required this.value, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14),
      decoration: BoxDecoration(
        color: AppColors.canvas,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.black.withValues(alpha: 0.06)),
      ),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<String>(
          value: value,
          isExpanded: true,
          hint: Text(
            '— Select State —',
            style: GoogleFonts.inter(
                color: AppColors.inkTertiary, fontSize: 13),
          ),
          style: GoogleFonts.inter(
            fontSize: 13, fontWeight: FontWeight.w600,
            color: AppColors.inkPrimary,
          ),
          icon: const Icon(LucideIcons.chevronDown,
              size: 16, color: AppColors.inkSecondary),
          items: _kIndianStates
              .map((s) => DropdownMenuItem<String>(
                    value: s.name,
                    child: Text('${s.name} · ${s.code}'),
                  ))
              .toList(),
          onChanged: (name) {
            if (name == null) {
              onChanged(null);
            } else {
              onChanged(_kIndianStates.firstWhere((s) => s.name == name));
            }
          },
        ),
      ),
    );
  }
}

class _BasicDropdown<T> extends StatelessWidget {
  final T value;
  final List<MapEntry<T, String>> items;
  final ValueChanged<T?> onChanged;
  const _BasicDropdown({
    required this.value,
    required this.items,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14),
      decoration: BoxDecoration(
        color: AppColors.canvas,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.black.withValues(alpha: 0.06)),
      ),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<T>(
          value: value,
          isExpanded: true,
          style: GoogleFonts.inter(
            fontSize: 13, fontWeight: FontWeight.w600,
            color: AppColors.inkPrimary,
          ),
          icon: const Icon(LucideIcons.chevronDown,
              size: 16, color: AppColors.inkSecondary),
          items: items
              .map((e) => DropdownMenuItem<T>(
                    value: e.key,
                    child: Text(e.value),
                  ))
              .toList(),
          onChanged: onChanged,
        ),
      ),
    );
  }
}

class _TypeCard extends StatelessWidget {
  final String title;
  final String sub;
  final String emoji;
  final bool selected;
  final VoidCallback onTap;
  const _TypeCard({
    required this.title,
    required this.sub,
    required this.emoji,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 160),
        padding: const EdgeInsets.fromLTRB(14, 12, 12, 12),
        decoration: BoxDecoration(
          color: selected ? AppColors.inkPrimary : AppColors.canvas,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: selected ? AppColors.inkPrimary : Colors.black.withValues(alpha: 0.08),
            width: 1.5,
          ),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(emoji, style: const TextStyle(fontSize: 18)),
            const SizedBox(width: 8),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: GoogleFonts.jetBrainsMono(
                      fontSize: 10,
                      fontWeight: FontWeight.w800,
                      color: selected ? AppColors.primaryContainer : AppColors.inkPrimary,
                      letterSpacing: 0.5,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    sub,
                    style: GoogleFonts.inter(
                      fontSize: 10,
                      color: selected
                          ? Colors.white.withValues(alpha: 0.55)
                          : AppColors.inkTertiary,
                    ),
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

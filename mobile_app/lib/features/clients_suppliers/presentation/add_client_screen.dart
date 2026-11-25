import 'package:flutter/material.dart';
import 'package:mobile_app/core/design/bl_widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
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
            content: Text(queued
                ? 'Saved on this phone. It will sync when you are online.'
                : (_isEdit ? 'Client updated' : 'Client added')),
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    } catch (e) {
      if (mounted) setState(() => _formError =
          'May not have saved. Check the client list before trying again. ($e)');
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  int _step = 0;

  void _next() {
    setState(() => _formError = null);
    if (_step == 0 && _nameController.text.trim().length < 2) {
      setState(() => _formError = 'Business / client name is required.');
      return;
    }
    if (_step == 1) {
      final g = _gstinController.text.trim();
      if (g.isNotEmpty && g.length != 15) {
        setState(() => _formError = 'GSTIN must be exactly 15 characters.');
        return;
      }
    }
    if (_step < 2) {
      FocusScope.of(context).unfocus();
      setState(() => _step++);
    } else {
      _submit();
    }
  }

  void _back() {
    if (_step == 0) {
      Navigator.maybePop(context);
    } else {
      setState(() {
        _formError = null;
        _step--;
      });
    }
  }

  Future<void> _pickState() async {
    final picked = await showBlPicker(context,
        title: 'State',
        options: [for (final s in _kIndianStates) '${s.name} · ${s.code}'],
        selected: _selectedState == null
            ? null
            : '$_selectedState · ${_selectedStateCode ?? ''}');
    if (picked == null || !mounted) return;
    final st = _kIndianStates.firstWhere((s) => '${s.name} · ${s.code}' == picked);
    setState(() {
      _selectedState = st.name;
      _selectedStateCode = st.code;
    });
  }

  static const _tiers = {
    'RETAIL': 'Retail · Standard',
    'WHOLESALE': 'Wholesale · Volume',
    'DISTRIBUTOR': 'Distributor · Trade',
  };

  static String _creditLabel(int d) =>
      d == 0 ? 'Cash on delivery' : 'Net $d days';

  Future<void> _pickTier() async {
    final picked = await showBlPicker(context,
        title: 'Price tier',
        options: _tiers.values.toList(),
        selected: _tiers[_priceTier]);
    if (picked == null || !mounted) return;
    setState(() => _priceTier =
        _tiers.entries.firstWhere((e) => e.value == picked).key);
  }

  Future<void> _pickCredit() async {
    final picked = await showBlPicker(context,
        title: 'Credit terms',
        options: [for (final d in _kCreditDayOptions) _creditLabel(d)],
        selected: _creditLabel(_creditDays));
    if (picked == null || !mounted) return;
    setState(() => _creditDays =
        _kCreditDayOptions.firstWhere((d) => _creditLabel(d) == picked));
  }

  Widget _typeCard(String key, String title, String sub) {
    final on = _clientType == key;
    return Padding(
      padding: const EdgeInsets.only(top: 10),
      child: Semantics(
        button: true,
        selected: on,
        label: '$title. $sub',
        excludeSemantics: true,
        child: BlTap(
          onTap: () => setState(() => _clientType = key),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            decoration: BoxDecoration(
              color: on ? const Color(0xFFFFF8EC) : null,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(
                  color: on ? Bl.brand : const Color(0xFFE6E5E3),
                  width: on ? 1.5 : 1),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(title, style: Bl.tight(14.5, w: FontWeight.w600)),
                      const SizedBox(height: 1),
                      Text(sub,
                          style: Bl.inter(12, c: const Color(0xFF7A8088))),
                    ],
                  ),
                ),
                Container(
                  width: 22,
                  height: 22,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: on ? Bl.brand : null,
                    shape: BoxShape.circle,
                    border: on
                        ? null
                        : Border.all(
                            width: 1.5, color: const Color(0xFFCFCFCF)),
                  ),
                  child: on
                      ? const BlIcon(BlIcons.check,
                          size: 13, color: Bl.white, stroke: 3)
                      : null,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _errorBox() => _formError == null
      ? const SizedBox.shrink()
      : Container(
          margin: const EdgeInsets.only(top: 12),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
          decoration: BoxDecoration(
              color: Bl.redSoft, borderRadius: BorderRadius.circular(12)),
          child: Text(_formError!,
              style: Bl.inter(12.5, w: FontWeight.w500, c: Bl.redDeep)),
        );

  List<Widget> _clientStep() => [
        BlField(
          label: 'Business / client name',
          hint: 'e.g. Sunrise Traders Pvt Ltd',
          controller: _nameController,
          capitalization: TextCapitalization.words,
        ),
        BlField(
          label: 'Contact person',
          hint: 'e.g. Ramesh Kumar',
          controller: _contactController,
          capitalization: TextCapitalization.words,
        ),
        BlField(
          label: 'Phone',
          hint: '9876543210',
          controller: _phoneController,
          keyboardType: TextInputType.phone,
        ),
        BlField(
          label: 'Email',
          hint: 'billing@client.com',
          controller: _emailController,
          keyboardType: TextInputType.emailAddress,
        ),
        _errorBox(),
      ];

  List<Widget> _addressStep() => [
        BlField(
          label: 'Address',
          hint: 'Shop / Street / Area / City',
          controller: _addressController,
          capitalization: TextCapitalization.words,
        ),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              flex: 13,
              child: BlField(
                label: 'State',
                hint: 'Select state',
                value: _selectedState,
                onTap: _pickState,
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              flex: 9,
              child: BlField(
                label: 'PIN code',
                hint: '600001',
                controller: _pinCodeController,
                keyboardType: TextInputType.number,
              ),
            ),
          ],
        ),
        BlField(
          label: 'GSTIN (optional)',
          hint: '22AAAAA0000A1Z5',
          controller: _gstinController,
          capitalization: TextCapitalization.characters,
          helper: 'Needed only if this client wants GST invoices.',
        ),
        _errorBox(),
      ];

  List<Widget> _billingStep() => [
        _typeCard('B2C', 'B2C · Consumer',
            'Sells to a person, no GSTIN on the bill'),
        _typeCard('B2B', 'B2B · Business', 'GST invoice with their GSTIN'),
        BlField(
            label: 'Price tier', value: _tiers[_priceTier], onTap: _pickTier),
        BlField(
            label: 'Credit terms',
            value: _creditLabel(_creditDays),
            onTap: _pickCredit),
        _errorBox(),
      ];

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: _step == 0,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _back();
      },
      child: BlStepFrame(
        title: _isEdit ? 'Edit Client' : 'Add Client',
        step: _step,
        stepNames: const ['Client', 'Address', 'Billing'],
        question: const [
          'Who is the client?',
          'Where are they?',
          'How do you bill them?',
        ][_step],
        onBack: _back,
        loading: _isLoading,
        onNext: _isLoading ? null : _next,
        buttonLabel: switch (_step) {
          0 => 'Next: address',
          1 => 'Next: billing',
          _ => _isEdit ? 'Save changes' : 'Add client',
        },
        children: switch (_step) {
          0 => _clientStep(),
          1 => _addressStep(),
          _ => _billingStep(),
        },
      ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:mobile_app/core/design/bl_widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/features/clients_suppliers/data/models/supplier.dart';
import 'package:mobile_app/features/clients_suppliers/presentation/providers/crm_provider.dart';
import 'package:mobile_app/main.dart' show syncServiceProvider;

class AddSupplierScreen extends ConsumerStatefulWidget {
  final Supplier? supplier; // null = create, non-null = edit
  const AddSupplierScreen({super.key, this.supplier});

  @override
  ConsumerState<AddSupplierScreen> createState() => _AddSupplierScreenState();
}

class _AddSupplierScreenState extends ConsumerState<AddSupplierScreen> {
  final _nameController    = TextEditingController();
  final _contactController = TextEditingController();
  final _phoneController   = TextEditingController();
  final _emailController   = TextEditingController();
  final _addressController = TextEditingController();
  final _notesController   = TextEditingController();
  bool _isLoading = false;

  bool get _isEdit => widget.supplier != null;

  @override
  void initState() {
    super.initState();
    final s = widget.supplier;
    if (s != null) {
      _nameController.text    = s.name ?? '';
      _contactController.text = s.contactPerson ?? '';
      _phoneController.text   = s.phone ?? '';
      _emailController.text   = s.email ?? '';
      _addressController.text = s.address ?? '';
      _notesController.text   = s.notes ?? '';
    }
  }

  @override
  void dispose() {
    _nameController.dispose();
    _contactController.dispose();
    _phoneController.dispose();
    _emailController.dispose();
    _addressController.dispose();
    _notesController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_nameController.text.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Enter the supplier name first.'),
          behavior: SnackBarBehavior.floating,
        ),
      );
      return;
    }

    setState(() => _isLoading = true);
    try {
      // Tenant id required — server default points at seed tenant which RLS hides.
      final tenantCtx = ref.read(tenantContextProvider).valueOrNull;
      if (tenantCtx == null) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('No tenant context — sign out and back in.')),
          );
        }
        return;
      }

      // Web schema parity: name, contact_person, phone, email, address, notes.
      // Drop the legacy 'balance' field — that's maintained by purchase flows.
      final data = <String, dynamic>{
        'id': _isEdit
            ? widget.supplier!.id
            : 'SUP-${DateTime.now().millisecondsSinceEpoch}-${DateTime.now().microsecond}',
        'tenant_id':      tenantCtx.tenantId,
        'name':           _nameController.text.trim(),
        'contact_person': _contactController.text.trim(),
        'phone':          _phoneController.text.trim(),
        'email':          _emailController.text.trim(),
        'address':        _addressController.text.trim(),
        'notes':          _notesController.text.trim(),
      };

      await ref.read(syncServiceProvider)
          .upsertOnlineOrQueue('suppliers', data);

      if (mounted) {
        ref.invalidate(suppliersProvider);
        ref.invalidate(supplierOutstandingProvider);
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(_isEdit ? 'Supplier updated' : 'Supplier added'),
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
                'May not have saved. Check the supplier list before trying again. ($e)'),
            backgroundColor: Bl.redDeep,
            behavior: SnackBarBehavior.floating,
            duration: const Duration(seconds: 8),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Bl.white,
      body: SafeArea(
        child: Column(
          children: [
            BlBackHeader(title: _isEdit ? 'Edit Supplier' : 'Add Supplier'),
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(18, 6, 18, 16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: BlEntrance.all([
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(_isEdit ? 'Edit this supplier' : 'Add a supplier',
                            style: Bl.tight(24,
                                w: FontWeight.w700, ls: -0.03)),
                        const SizedBox(height: 4),
                        Text('Only the name is needed. Add the rest any time.',
                            style: Bl.inter(12.5,
                                c: const Color(0xFF7A8088))),
                      ],
                    ),
                    BlField(
                      label: 'Supplier / company name',
                      hint: 'e.g. ABC Wholesale Pvt Ltd',
                      controller: _nameController,
                      capitalization: TextCapitalization.words,
                    ),
                    BlField(
                      label: 'Contact person',
                      hint: 'e.g. Ramesh Kumar',
                      controller: _contactController,
                      capitalization: TextCapitalization.words,
                    ),
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: BlField(
                            label: 'Phone',
                            hint: 'Phone number',
                            controller: _phoneController,
                            keyboardType: TextInputType.phone,
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: BlField(
                            label: 'Email',
                            hint: 'Email',
                            controller: _emailController,
                            keyboardType: TextInputType.emailAddress,
                          ),
                        ),
                      ],
                    ),
                    BlField(
                      label: 'Address',
                      hint: 'Full business address',
                      controller: _addressController,
                      capitalization: TextCapitalization.words,
                    ),
                    BlField(
                      label: 'Internal notes',
                      hint: 'Payment terms, lead time, contacts',
                      controller: _notesController,
                      capitalization: TextCapitalization.sentences,
                    ),
                  ]),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 8, 14, 14),
              child: BlButton(_isEdit ? 'Save changes' : 'Add supplier',
                  loading: _isLoading, onTap: _isLoading ? null : _submit),
            ),
          ],
        ),
      ),
    );
  }
}

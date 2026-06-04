import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/core/theme/colors.dart';
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
        SnackBar(
          content: Text('Supplier name required',
              style: GoogleFonts.inter(color: Colors.white)),
          backgroundColor: AppColors.danger,
          behavior: SnackBarBehavior.floating,
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
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
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              _isEdit ? 'Supplier updated' : 'Supplier added',
              style: GoogleFonts.inter(color: AppColors.inkPrimary),
            ),
            backgroundColor: AppColors.primaryContainer,
            behavior: SnackBarBehavior.floating,
            shape:
                RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Error: $e',
                style: GoogleFonts.inter(color: Colors.white)),
            backgroundColor: AppColors.danger,
            behavior: SnackBarBehavior.floating,
            shape:
                RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
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
      backgroundColor: AppColors.canvas,
      appBar: AppBar(
        backgroundColor: AppColors.canvas,
        elevation: 0,
        scrolledUnderElevation: 0,
        leading: IconButton(
          icon: const Icon(LucideIcons.arrowLeft,
              size: 20, color: AppColors.inkPrimary),
          onPressed: () => Navigator.pop(context),
        ),
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              _isEdit ? 'Edit Supplier' : 'Add Supplier',
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
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 100),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Avatar preview
            Center(
              child: Container(
                width: 72,
                height: 72,
                decoration: BoxDecoration(
                  color: AppColors.surfaceContainer,
                  shape: BoxShape.circle,
                ),
                child: Center(
                  child: ValueListenableBuilder(
                    valueListenable: _nameController,
                    builder: (_, _, _) {
                      final initial = _nameController.text.isNotEmpty
                          ? _nameController.text[0].toUpperCase()
                          : '?';
                      return Text(
                        initial,
                        style: GoogleFonts.hankenGrotesk(
                          color: AppColors.inkSecondary,
                          fontSize: 28,
                          fontWeight: FontWeight.w900,
                        ),
                      );
                    },
                  ),
                ),
              ),
            ),
            const SizedBox(height: 8),
            Center(
              child: Text(
                'SUPPLIER',
                style: GoogleFonts.jetBrainsMono(
                  color: AppColors.inkSecondary,
                  fontSize: 9,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 2,
                ),
              ),
            ),
            const SizedBox(height: 28),

            // Entity info
            _SectionHeader(
                title: 'ENTITY INFO', icon: LucideIcons.building2),
            const SizedBox(height: 12),
            _buildField(
              label: 'Supplier / Company Name',
              hint: 'e.g. ABC Wholesale Pvt Ltd',
              controller: _nameController,
              icon: LucideIcons.building2,
            ),
            const SizedBox(height: 12),
            _buildField(
              label: 'Contact Person',
              hint: 'e.g. Ramesh Kumar',
              controller: _contactController,
              icon: LucideIcons.user,
            ),

            const SizedBox(height: 28),

            // Contact details
            _SectionHeader(
                title: 'CONTACT DETAILS', icon: LucideIcons.phone),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: _buildField(
                    label: 'Phone',
                    hint: '+91 00000 00000',
                    controller: _phoneController,
                    icon: LucideIcons.phone,
                    keyboardType: TextInputType.phone,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: _buildField(
                    label: 'Email',
                    hint: 'supplier@email.com',
                    controller: _emailController,
                    icon: LucideIcons.mail,
                    keyboardType: TextInputType.emailAddress,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            _buildField(
              label: 'Address',
              hint: 'Full business address',
              controller: _addressController,
              icon: LucideIcons.mapPin,
              maxLines: 2,
            ),

            const SizedBox(height: 28),

            // Notes — internal supplier remarks (matches web 'notes' column).
            _SectionHeader(title: 'NOTES', icon: LucideIcons.stickyNote),
            const SizedBox(height: 12),
            _buildField(
              label: 'Internal notes',
              hint: 'Payment terms, lead time, contacts, anything...',
              controller: _notesController,
              icon: LucideIcons.messageSquare,
              maxLines: 3,
            ),

            const SizedBox(height: 32),
          ],
        ),
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 16),
          child: ElevatedButton(
            onPressed: _isLoading ? null : _submit,
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.primaryContainer,
              foregroundColor: AppColors.inkPrimary,
              disabledBackgroundColor:
                  AppColors.primaryContainer.withValues(alpha: 0.4),
              elevation: 0,
              padding: const EdgeInsets.symmetric(vertical: 16),
              shape: const StadiumBorder(),
            ),
            child: _isLoading
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(
                        color: AppColors.inkPrimary, strokeWidth: 2.5),
                  )
                : Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(_isEdit ? LucideIcons.save : LucideIcons.plus, size: 18),
                      const SizedBox(width: 8),
                      Text(
                        _isEdit ? 'SAVE CHANGES' : 'ADD SUPPLIER',
                        style: GoogleFonts.jetBrainsMono(
                          fontWeight: FontWeight.w700,
                          fontSize: 13,
                          letterSpacing: 1,
                        ),
                      ),
                    ],
                  ),
          ),
        ),
      ),
    );
  }

  Widget _buildField({
    required String label,
    required String hint,
    required TextEditingController controller,
    required IconData icon,
    TextInputType? keyboardType,
    int maxLines = 1,
  }) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.black.withValues(alpha: 0.06)),
      ),
      child: TextField(
        controller: controller,
        keyboardType: keyboardType ?? TextInputType.text,
        maxLines: maxLines,
        style: GoogleFonts.inter(
          fontSize: 14,
          color: AppColors.inkPrimary,
          fontWeight: FontWeight.w500,
        ),
        decoration: InputDecoration(
          prefixIcon: Padding(
            padding: maxLines > 1 ? const EdgeInsets.only(top: 12) : EdgeInsets.zero,
            child: Icon(icon, size: 18, color: AppColors.inkSecondary),
          ),
          prefixIconConstraints:
              maxLines > 1 ? const BoxConstraints(minWidth: 48, minHeight: 0) : null,
          border: InputBorder.none,
          contentPadding:
              const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          hintText: hint,
          hintStyle: GoogleFonts.inter(
            color: AppColors.inkSecondary.withValues(alpha: 0.5),
            fontSize: 14,
          ),
          labelText: label,
          labelStyle: GoogleFonts.jetBrainsMono(
            color: AppColors.inkSecondary,
            fontSize: 10,
            fontWeight: FontWeight.w600,
            letterSpacing: 0.5,
          ),
          floatingLabelBehavior: FloatingLabelBehavior.always,
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(14),
            borderSide: const BorderSide(
                color: AppColors.primaryContainer, width: 1.5),
          ),
          enabledBorder: InputBorder.none,
        ),
      ),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  final String title;
  final IconData icon;
  const _SectionHeader({required this.title, required this.icon});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          padding: const EdgeInsets.all(6),
          decoration: BoxDecoration(
            color: AppColors.primaryContainer.withValues(alpha: 0.3),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Icon(icon, size: 14, color: AppColors.primary),
        ),
        const SizedBox(width: 10),
        Text(
          title,
          style: GoogleFonts.jetBrainsMono(
            color: AppColors.primary,
            fontSize: 11,
            fontWeight: FontWeight.w700,
            letterSpacing: 1.5,
          ),
        ),
      ],
    );
  }
}

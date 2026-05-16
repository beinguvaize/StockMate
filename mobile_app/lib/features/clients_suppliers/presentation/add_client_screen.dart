import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:mobile_app/features/clients_suppliers/data/models/client.dart';
import 'package:mobile_app/main.dart' show syncServiceProvider;
import 'package:mobile_app/features/clients_suppliers/presentation/providers/crm_provider.dart';

class AddClientScreen extends ConsumerStatefulWidget {
  final Client? client; // null = create, non-null = edit
  const AddClientScreen({super.key, this.client});

  @override
  ConsumerState<AddClientScreen> createState() => _AddClientScreenState();
}

class _AddClientScreenState extends ConsumerState<AddClientScreen> {
  final _nameController       = TextEditingController();
  final _contactController    = TextEditingController();
  final _phoneController      = TextEditingController();
  final _emailController      = TextEditingController();
  final _addressController    = TextEditingController();
  final _gstinController      = TextEditingController();
  final _balanceController    = TextEditingController();
  final _creditLimitController = TextEditingController();
  String _selectedStatus = 'ACTIVE';
  bool _isLoading = false;

  bool get _isEdit => widget.client != null;

  @override
  void initState() {
    super.initState();
    final c = widget.client;
    if (c != null) {
      _nameController.text        = c.name ?? '';
      _contactController.text     = c.contact ?? '';
      _phoneController.text       = c.phone ?? '';
      _emailController.text       = c.email ?? '';
      _addressController.text     = c.address ?? '';
      _gstinController.text       = c.gstNo ?? c.gstin ?? '';
      _balanceController.text     = c.outstandingBalance?.toString() ?? '';
      _creditLimitController.text = c.creditLimit?.toString() ?? '';
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
    _balanceController.dispose();
    _creditLimitController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_nameController.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Business name required',
              style: GoogleFonts.inter(color: Colors.white)),
          backgroundColor: AppColors.danger,
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
      );
      return;
    }

    setState(() => _isLoading = true);
    try {
      final data = {
        'name':                _nameController.text.trim(),
        'contact':             _contactController.text.trim(),
        'phone':               _phoneController.text.trim(),
        'email':               _emailController.text.trim(),
        'address':             _addressController.text.trim(),
        'gst_no':              _gstinController.text.trim(),
        'outstanding_balance': double.tryParse(_balanceController.text) ?? 0.0,
        'credit_limit':        double.tryParse(_creditLimitController.text),
        'status':              _selectedStatus,
      };

      // Offline-first: upsert (works for both insert + update via on_conflict).
      // For update path we ensure id is present in the payload.
      if (_isEdit) {
        data['id'] = widget.client!.id;
      }
      await ref.read(syncServiceProvider)
          .upsertOnlineOrQueue('clients', data);

      if (mounted) {
        ref.invalidate(clientsProvider);
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              _isEdit ? 'Client updated' : 'Client added',
              style: GoogleFonts.inter(color: AppColors.inkPrimary),
            ),
            backgroundColor: AppColors.primaryContainer,
            behavior: SnackBarBehavior.floating,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
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
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
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
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 100),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Avatar preview
            Center(
              child: Container(
                width: 72,
                height: 72,
                decoration: const BoxDecoration(
                  color: AppColors.secondaryContainer,
                  shape: BoxShape.circle,
                ),
                child: Center(
                  child: ValueListenableBuilder(
                    valueListenable: _nameController,
                    builder: (context2, child2, _) {
                      final initial = _nameController.text.isNotEmpty
                          ? _nameController.text[0].toUpperCase()
                          : '?';
                      return Text(
                        initial,
                        style: GoogleFonts.hankenGrotesk(
                          color: AppColors.secondary,
                          fontSize: 28,
                          fontWeight: FontWeight.w900,
                        ),
                      );
                    },
                  ),
                ),
              ),
            ),
            const SizedBox(height: 6),
            Center(
              child: Text(
                'CLIENT',
                style: GoogleFonts.jetBrainsMono(
                  color: AppColors.inkSecondary,
                  fontSize: 9,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 2,
                ),
              ),
            ),
            const SizedBox(height: 28),

            // Business info
            _SectionHeader(title: 'BUSINESS INFO', icon: LucideIcons.building2),
            const SizedBox(height: 12),
            _buildField(
              label: 'Business / Client Name',
              hint: 'e.g. Sunrise Traders Pvt Ltd',
              controller: _nameController,
              icon: LucideIcons.building2,
            ),
            const SizedBox(height: 12),
            _buildField(
              label: 'Contact Person',
              hint: 'e.g. John Doe',
              controller: _contactController,
              icon: LucideIcons.userCheck,
            ),

            const SizedBox(height: 28),

            // Contact details
            _SectionHeader(title: 'CONTACT DETAILS', icon: LucideIcons.phone),
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
                    hint: 'client@email.com',
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

            // Tax info
            _SectionHeader(title: 'TAX INFORMATION', icon: LucideIcons.fileText),
            const SizedBox(height: 12),
            _buildField(
              label: 'GSTIN',
              hint: '22AAAAA0000A1Z5',
              controller: _gstinController,
              icon: LucideIcons.hash,
            ),

            const SizedBox(height: 28),

            // Account details
            _SectionHeader(title: 'ACCOUNT DETAILS', icon: LucideIcons.indianRupee),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: _buildField(
                    label: _isEdit ? 'Outstanding Balance' : 'Opening Balance',
                    hint: '0.00',
                    controller: _balanceController,
                    icon: LucideIcons.indianRupee,
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: _buildField(
                    label: 'Credit Limit',
                    hint: '0.00',
                    controller: _creditLimitController,
                    icon: LucideIcons.creditCard,
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),

            // Status selector
            Row(
              children: [
                _StatusChip(
                  label: 'Active',
                  selected: _selectedStatus == 'ACTIVE',
                  color: AppColors.success,
                  onTap: () => setState(() => _selectedStatus = 'ACTIVE'),
                ),
                const SizedBox(width: 10),
                _StatusChip(
                  label: 'Inactive',
                  selected: _selectedStatus == 'INACTIVE',
                  color: AppColors.danger,
                  onTap: () => setState(() => _selectedStatus = 'INACTIVE'),
                ),
              ],
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
                      Icon(_isEdit ? LucideIcons.save : LucideIcons.userPlus, size: 18),
                      const SizedBox(width: 8),
                      Text(
                        _isEdit ? 'SAVE CHANGES' : 'ADD CLIENT',
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
          contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
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
            borderSide: const BorderSide(color: AppColors.primaryContainer, width: 1.5),
          ),
          enabledBorder: InputBorder.none,
        ),
      ),
    );
  }
}

class _StatusChip extends StatelessWidget {
  final String label;
  final bool selected;
  final Color color;
  final VoidCallback onTap;
  const _StatusChip({
    required this.label,
    required this.selected,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
        decoration: BoxDecoration(
          color: selected ? color.withValues(alpha: 0.12) : AppColors.surface,
          borderRadius: BorderRadius.circular(30),
          border: Border.all(
            color: selected ? color : Colors.black.withValues(alpha: 0.08),
            width: selected ? 1.5 : 1,
          ),
        ),
        child: Text(
          label,
          style: GoogleFonts.jetBrainsMono(
            color: selected ? color : AppColors.inkSecondary,
            fontSize: 11,
            fontWeight: FontWeight.w700,
            letterSpacing: 0.5,
          ),
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

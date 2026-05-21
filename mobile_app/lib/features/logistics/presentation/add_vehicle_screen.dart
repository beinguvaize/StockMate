import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:mobile_app/core/supabase/client.dart';
import 'package:mobile_app/features/logistics/data/models/vehicle.dart';
import 'package:mobile_app/features/logistics/presentation/providers/logistics_provider.dart';

class AddVehicleScreen extends ConsumerStatefulWidget {
  /// When non-null the screen operates in edit mode.
  final Vehicle? vehicle;

  const AddVehicleScreen({super.key, this.vehicle});

  @override
  ConsumerState<AddVehicleScreen> createState() => _AddVehicleScreenState();
}

class _AddVehicleScreenState extends ConsumerState<AddVehicleScreen> {
  final _nameController = TextEditingController();
  final _plateController = TextEditingController();
  final _driverController = TextEditingController();
  String _selectedStatus = 'ACTIVE';
  bool _isLoading = false;

  bool get _isEditing => widget.vehicle != null;

  static const _statusOptions = ['ACTIVE', 'MAINTENANCE', 'OUT_OF_SERVICE'];
  static const _statusLabels = {
    'ACTIVE': 'Active',
    'MAINTENANCE': 'Maintenance',
    'OUT_OF_SERVICE': 'Out of Service',
  };
  static const _statusColors = {
    'ACTIVE': AppColors.success,
    'MAINTENANCE': Colors.orange,
    'OUT_OF_SERVICE': AppColors.danger,
  };
  static const _statusIcons = {
    'ACTIVE': LucideIcons.checkCircle,
    'MAINTENANCE': LucideIcons.wrench,
    'OUT_OF_SERVICE': LucideIcons.xCircle,
  };

  @override
  void initState() {
    super.initState();
    // Pre-fill fields when editing an existing vehicle
    final v = widget.vehicle;
    if (v != null) {
      _nameController.text = v.name ?? '';
      _plateController.text = v.displayPlate == '—' ? '' : v.displayPlate;
      _driverController.text = v.driverName ?? '';
      _selectedStatus = v.status ?? 'ACTIVE';
    }
  }

  @override
  void dispose() {
    _nameController.dispose();
    _plateController.dispose();
    _driverController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_nameController.text.isEmpty || _plateController.text.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Vehicle name and plate number required',
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
      final payload = {
        'name': _nameController.text.trim(),
        'plateNumber': _plateController.text.trim().toUpperCase(),
        'status': _selectedStatus,
        'driverName': _driverController.text.trim(),
      };

      if (_isEditing) {
        await supabase
            .from('vehicles')
            .update(payload)
            .eq('id', widget.vehicle!.id);
      } else {
        await supabase.from('vehicles').insert(payload);
      }

      if (mounted) {
        ref.invalidate(vehiclesProvider);
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              _isEditing ? 'Vehicle updated' : 'Vehicle added to fleet',
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
              _isEditing ? 'Edit Vehicle' : 'Add Vehicle',
              style: GoogleFonts.hankenGrotesk(
                color: AppColors.inkPrimary,
                fontSize: 20,
                fontWeight: FontWeight.w800,
                letterSpacing: -0.5,
              ),
            ),
            Text(
              'FLEET MANAGEMENT',
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
            // Vehicle icon header
            Center(
              child: Container(
                width: 80,
                height: 80,
                decoration: BoxDecoration(
                  color: AppColors.primaryContainer.withValues(alpha: 0.25),
                  shape: BoxShape.circle,
                ),
                child: const Center(
                  child: Icon(LucideIcons.truck,
                      size: 36, color: AppColors.primary),
                ),
              ),
            ),
            const SizedBox(height: 8),
            Center(
              child: Text(
                'FLEET VEHICLE',
                style: GoogleFonts.jetBrainsMono(
                  color: AppColors.inkSecondary,
                  fontSize: 9,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 2,
                ),
              ),
            ),
            const SizedBox(height: 28),

            // Vehicle details
            _SectionHeader(
                title: 'VEHICLE DETAILS', icon: LucideIcons.truck),
            const SizedBox(height: 12),
            _buildField(
              label: 'Vehicle Name / Model',
              hint: 'e.g. Tata Ace 2023',
              controller: _nameController,
              icon: LucideIcons.truck,
            ),
            const SizedBox(height: 12),
            _buildField(
              label: 'License Plate Number',
              hint: 'e.g. MH 12 AB 1234',
              controller: _plateController,
              icon: LucideIcons.creditCard,
              textCapitalization: TextCapitalization.characters,
            ),
            const SizedBox(height: 12),
            _buildField(
              label: 'Assigned Driver (Optional)',
              hint: 'e.g. Suresh Patel',
              controller: _driverController,
              icon: LucideIcons.user,
            ),

            const SizedBox(height: 28),

            // Status
            _SectionHeader(title: 'STATUS', icon: LucideIcons.activity),
            const SizedBox(height: 12),
            Column(
              children: _statusOptions.map((status) {
                final selected = _selectedStatus == status;
                final color =
                    _statusColors[status] ?? AppColors.inkSecondary;
                final icon = _statusIcons[status] ?? LucideIcons.circle;
                final label = _statusLabels[status] ?? status;
                return Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: GestureDetector(
                    onTap: () => setState(() => _selectedStatus = status),
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 180),
                      padding: const EdgeInsets.symmetric(
                          horizontal: 16, vertical: 14),
                      decoration: BoxDecoration(
                        color: selected
                            ? color.withValues(alpha: 0.08)
                            : AppColors.surface,
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(
                          color: selected
                              ? color
                              : Colors.black.withValues(alpha: 0.08),
                          width: selected ? 1.5 : 1,
                        ),
                      ),
                      child: Row(
                        children: [
                          Icon(icon,
                              size: 18,
                              color: selected
                                  ? color
                                  : AppColors.inkSecondary),
                          const SizedBox(width: 12),
                          Text(
                            label,
                            style: GoogleFonts.inter(
                              color: selected ? color : AppColors.inkSecondary,
                              fontSize: 14,
                              fontWeight: selected
                                  ? FontWeight.w700
                                  : FontWeight.w500,
                            ),
                          ),
                          const Spacer(),
                          if (selected)
                            Container(
                              width: 8,
                              height: 8,
                              decoration: BoxDecoration(
                                color: color,
                                shape: BoxShape.circle,
                              ),
                            ),
                        ],
                      ),
                    ),
                  ),
                );
              }).toList(),
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
                      Icon(
                        _isEditing ? LucideIcons.save : LucideIcons.plus,
                        size: 18,
                      ),
                      const SizedBox(width: 8),
                      Text(
                        _isEditing ? 'SAVE CHANGES' : 'ADD TO FLEET',
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
    TextCapitalization textCapitalization = TextCapitalization.words,
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
        textCapitalization: textCapitalization,
        style: GoogleFonts.inter(
          fontSize: 14,
          color: AppColors.inkPrimary,
          fontWeight: FontWeight.w500,
        ),
        decoration: InputDecoration(
          prefixIcon: Icon(icon, size: 18, color: AppColors.inkSecondary),
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

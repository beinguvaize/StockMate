import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:mobile_app/core/supabase/client.dart';
import 'package:mobile_app/features/hr/data/models/employee.dart';
import 'package:mobile_app/features/hr/presentation/providers/hr_provider.dart';

class AddEmployeeScreen extends ConsumerStatefulWidget {
  /// Pass an existing [Employee] to enter edit mode; leave null to add a new one.
  final Employee? employee;

  const AddEmployeeScreen({super.key, this.employee});

  @override
  ConsumerState<AddEmployeeScreen> createState() => _AddEmployeeScreenState();
}

class _AddEmployeeScreenState extends ConsumerState<AddEmployeeScreen> {
  late final TextEditingController _nameController;
  late final TextEditingController _roleController;
  late final TextEditingController _salaryController;
  late String _selectedStatus;
  bool _isLoading = false;

  bool get _isEditing => widget.employee != null;

  static const _statusOptions = ['Active', 'On Leave', 'Inactive'];
  static const _statusColors = {
    'Active': AppColors.success,
    'On Leave': Colors.orange,
    'Inactive': AppColors.danger,
  };

  @override
  void initState() {
    super.initState();
    final emp = widget.employee;
    _nameController = TextEditingController(text: emp?.name ?? '');
    _roleController =
        TextEditingController(text: emp?.role ?? emp?.position ?? '');
    _salaryController = TextEditingController(
      text: emp?.salary != null && emp!.salary! > 0
          ? emp.salary!.toStringAsFixed(0)
          : '',
    );
    // Normalise status to one of the three option strings
    final rawStatus = emp?.status ?? 'Active';
    if (_statusOptions.contains(rawStatus)) {
      _selectedStatus = rawStatus;
    } else {
      switch (rawStatus.toUpperCase()) {
        case 'ACTIVE':
          _selectedStatus = 'Active';
          break;
        case 'ON LEAVE':
        case 'ON_LEAVE':
          _selectedStatus = 'On Leave';
          break;
        default:
          _selectedStatus = 'Inactive';
      }
    }
  }

  @override
  void dispose() {
    _nameController.dispose();
    _roleController.dispose();
    _salaryController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_nameController.text.isEmpty || _roleController.text.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Name and role required',
              style: GoogleFonts.inter(color: Colors.white)),
          backgroundColor: AppColors.danger,
          behavior: SnackBarBehavior.floating,
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
      );
      return;
    }

    final tenantCtx = ref.read(tenantContextProvider).valueOrNull;

    setState(() => _isLoading = true);
    try {
      final payload = {
        'name': _nameController.text.trim(),
        'role': _roleController.text.trim(),
        'salary': double.tryParse(_salaryController.text) ?? 0.0,
        'status': _selectedStatus,
      };

      if (_isEditing) {
        await supabase
            .from('employees')
            .update(payload)
            .eq('id', widget.employee!.id);
      } else {
        await supabase.from('employees').insert({
          ...payload,
          'tenant_id': tenantCtx?.tenantId,
        });
      }

      if (mounted) {
        ref.invalidate(employeesProvider);
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              _isEditing ? 'Employee updated' : 'Employee added',
              style: GoogleFonts.inter(color: AppColors.inkPrimary),
            ),
            backgroundColor: AppColors.primaryContainer,
            behavior: SnackBarBehavior.floating,
            shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12)),
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
              _isEditing ? 'Edit Employee' : 'Add Employee',
              style: GoogleFonts.hankenGrotesk(
                color: AppColors.inkPrimary,
                fontSize: 20,
                fontWeight: FontWeight.w800,
                letterSpacing: -0.5,
              ),
            ),
            Text(
              'HR & PAYROLL',
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
                width: 80,
                height: 80,
                decoration: const BoxDecoration(
                  color: AppColors.secondaryContainer,
                  shape: BoxShape.circle,
                ),
                child: Center(
                  child: ValueListenableBuilder(
                    valueListenable: _nameController,
                    builder: (_, __, ___) {
                      final initial = _nameController.text.isNotEmpty
                          ? _nameController.text[0].toUpperCase()
                          : '?';
                      return Text(
                        initial,
                        style: GoogleFonts.hankenGrotesk(
                          color: AppColors.secondary,
                          fontSize: 32,
                          fontWeight: FontWeight.w900,
                        ),
                      );
                    },
                  ),
                ),
              ),
            ),
            const SizedBox(height: 28),

            // Personal info
            _SectionHeader(title: 'PERSONAL INFO', icon: LucideIcons.user),
            const SizedBox(height: 12),
            _buildField(
              label: 'Full Name',
              hint: 'e.g. Ravi Kumar',
              controller: _nameController,
              icon: LucideIcons.user,
            ),
            const SizedBox(height: 12),
            _buildField(
              label: 'Job Role / Title',
              hint: 'e.g. Sales Executive',
              controller: _roleController,
              icon: LucideIcons.briefcase,
            ),

            const SizedBox(height: 28),

            // Salary
            _SectionHeader(title: 'COMPENSATION', icon: LucideIcons.indianRupee),
            const SizedBox(height: 12),
            _buildField(
              label: 'Base Salary (Monthly)',
              hint: '0.00',
              controller: _salaryController,
              icon: LucideIcons.indianRupee,
              keyboardType:
                  const TextInputType.numberWithOptions(decimal: true),
            ),

            const SizedBox(height: 28),

            // Status
            _SectionHeader(title: 'STATUS', icon: LucideIcons.activity),
            const SizedBox(height: 12),
            Row(
              children: _statusOptions.map((status) {
                final selected = _selectedStatus == status;
                final color = _statusColors[status] ?? AppColors.inkSecondary;
                return Expanded(
                  child: Padding(
                    padding: EdgeInsets.only(
                        right: status != _statusOptions.last ? 8 : 0),
                    child: GestureDetector(
                      onTap: () => setState(() => _selectedStatus = status),
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 180),
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        decoration: BoxDecoration(
                          color: selected
                              ? color.withValues(alpha: 0.1)
                              : AppColors.surface,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(
                            color: selected
                                ? color
                                : Colors.black.withValues(alpha: 0.08),
                            width: selected ? 1.5 : 1,
                          ),
                        ),
                        child: Column(
                          children: [
                            Container(
                              width: 8,
                              height: 8,
                              decoration: BoxDecoration(
                                color: selected
                                    ? color
                                    : AppColors.inkSecondary
                                        .withValues(alpha: 0.3),
                                shape: BoxShape.circle,
                              ),
                            ),
                            const SizedBox(height: 6),
                            Text(
                              status,
                              textAlign: TextAlign.center,
                              style: GoogleFonts.inter(
                                color: selected ? color : AppColors.inkSecondary,
                                fontSize: 11,
                                fontWeight: selected
                                    ? FontWeight.w700
                                    : FontWeight.w500,
                              ),
                            ),
                          ],
                        ),
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
                      Icon(_isEditing ? LucideIcons.save : LucideIcons.userPlus,
                          size: 18),
                      const SizedBox(width: 8),
                      Text(
                        _isEditing ? 'SAVE CHANGES' : 'ADD EMPLOYEE',
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

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile_app/core/supabase/client.dart';
import 'package:mobile_app/core/theme/colors.dart';

class DeliveryScreen extends ConsumerStatefulWidget {
  /// When provided, shows only this route. When null, shows all routes for
  /// the current user that are in PLANNED or IN_TRANSIT state.
  final String? routeId;
  const DeliveryScreen({super.key, this.routeId});

  @override
  ConsumerState<DeliveryScreen> createState() => _DeliveryScreenState();
}

class _DeliveryScreenState extends ConsumerState<DeliveryScreen> {
  final _odometerController = TextEditingController();
  final _cashController = TextEditingController();
  List<Map<String, dynamic>> _routes = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadRoutes();
  }

  @override
  void dispose() {
    _odometerController.dispose();
    _cashController.dispose();
    super.dispose();
  }

  Future<void> _loadRoutes() async {
    setState(() { _loading = true; _error = null; });
    try {
      final userId = supabase.auth.currentUser?.id;
      var query = supabase.from('routes').select('*');

      if (widget.routeId != null) {
        query = query.eq('id', widget.routeId!);
      } else if (userId != null) {
        // Show routes for this driver that are not yet reconciled
        query = query
            .or('driver_id.eq.$userId,driverId.eq.$userId')
            .inFilter('status', ['PLANNED', 'IN_TRANSIT', 'ACTIVE']);
      }

      final res = await query.order('created_at', ascending: false);
      if (mounted) setState(() { _routes = List<Map<String, dynamic>>.from(res); _loading = false; });
    } catch (e) {
      if (mounted) setState(() { _error = e.toString(); _loading = false; });
    }
  }

  Future<void> _updateStatus(String id, String status) async {
    try {
      await supabase.from('routes').update({'status': status}).eq('id', id);
      _loadRoutes();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e')));
    }
  }

  Future<void> _completeRoute(String id) async {
    if (_odometerController.text.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Enter final odometer reading')));
      return;
    }
    final odo = double.tryParse(_odometerController.text) ?? 0;

    // Resolve tenantId
    final session = supabase.auth.currentSession;
    String? tenantId = session?.user.userMetadata?['tenant_id'] as String?;
    if (tenantId == null || tenantId.isEmpty) {
      final uid = supabase.auth.currentUser?.id;
      if (uid != null) {
        final row = await supabase.from('users').select('tenant_id').eq('id', uid).maybeSingle();
        tenantId = row?['tenant_id'] as String?;
      }
    }

    try {
      await supabase.rpc('reconcile_vehicle_route', params: {
        'p_route_id':       id,
        'p_final_odometer': odo,
        'p_returned_stock': <dynamic>[],  // stock stays on van by default
        'p_actual_cash':    double.tryParse(_cashController.text) ?? 0,
        'p_tenant_id':      tenantId,
      });
      _odometerController.clear();
      _cashController.clear();
      _loadRoutes();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e')));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.canvas,
      appBar: AppBar(
        title: const Text('Route Management', style: TextStyle(fontWeight: FontWeight.bold)),
        backgroundColor: AppColors.canvas,
        foregroundColor: AppColors.inkPrimary,
        elevation: 0,
        actions: [
          IconButton(icon: const Icon(LucideIcons.refreshCw, size: 18), onPressed: _loadRoutes),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Text('Error: $_error', style: const TextStyle(color: AppColors.error)))
              : _routes.isEmpty
                  ? const Center(child: Text('No assigned routes', style: TextStyle(color: AppColors.inkSecondary)))
                  : ListView.builder(
                      padding: const EdgeInsets.all(16),
                      itemCount: _routes.length,
                      itemBuilder: (context, index) => _RouteCard(
                        route: _routes[index],
                        odometerController: _odometerController,
                        cashController: _cashController,
                        onStartTransit: () => _updateStatus(_routes[index]['id'], 'IN_TRANSIT'),
                        onComplete:     () => _completeRoute(_routes[index]['id']),
                      ),
                    ),
    );
  }
}

class _RouteCard extends StatelessWidget {
  final Map<String, dynamic> route;
  final TextEditingController odometerController;
  final TextEditingController cashController;
  final VoidCallback onStartTransit;
  final VoidCallback onComplete;

  const _RouteCard({
    required this.route,
    required this.odometerController,
    required this.cashController,
    required this.onStartTransit,
    required this.onComplete,
  });

  @override
  Widget build(BuildContext context) {
    final id = route['id'] as String? ?? '';
    final status = (route['status'] as String?) ?? 'PLANNED';
    final location = route['location'] as String?;
    final date = (route['date'] as String?)?.substring(0, 10) ?? '';

    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: Colors.black.withValues(alpha: 0.05)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'Route #${id.length >= 8 ? id.substring(0, 8) : id}',
                style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 18),
              ),
              _StatusBadge(status: status),
            ],
          ),
          const SizedBox(height: 8),
          if (location != null) Row(
            children: [
              const Icon(LucideIcons.mapPin, size: 14, color: AppColors.inkSecondary),
              const SizedBox(width: 6),
              Text(location, style: const TextStyle(color: AppColors.inkSecondary, fontSize: 13)),
            ],
          ),
          if (date.isNotEmpty) Row(
            children: [
              const Icon(LucideIcons.calendar, size: 14, color: AppColors.inkSecondary),
              const SizedBox(width: 6),
              Text(date, style: const TextStyle(color: AppColors.inkSecondary, fontSize: 13)),
            ],
          ),
          const Divider(height: 28),
          if (status == 'PLANNED' || status == 'ACTIVE')
            ElevatedButton.icon(
              onPressed: onStartTransit,
              icon: const Icon(LucideIcons.playCircle),
              label: const Text('START TRANSIT'),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.accentSignature,
                minimumSize: const Size(double.infinity, 50),
              ),
            )
          else if (status == 'IN_TRANSIT')
            Column(
              children: [
                TextField(
                  controller: odometerController,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(
                    labelText: 'Final Odometer Reading (km)',
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: cashController,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(
                    labelText: 'Cash Collected (₹)',
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 12),
                ElevatedButton.icon(
                  onPressed: onComplete,
                  icon: const Icon(LucideIcons.checkCircle),
                  label: const Text('COMPLETE & RECONCILE'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.success,
                    minimumSize: const Size(double.infinity, 50),
                  ),
                ),
              ],
            )
          else
            const Center(
              child: Text(
                'Route Closed & Reconciled',
                style: TextStyle(color: AppColors.success, fontWeight: FontWeight.bold),
              ),
            ),
        ],
      ),
    );
  }
}

class _StatusBadge extends StatelessWidget {
  final String status;
  const _StatusBadge({required this.status});

  @override
  Widget build(BuildContext context) {
    Color color;
    switch (status.toUpperCase()) {
      case 'IN_TRANSIT': color = Colors.blue;        break;
      case 'ACTIVE':     color = Colors.indigo;      break;
      case 'RECONCILED':
      case 'COMPLETED':  color = AppColors.success;  break;
      default:           color = AppColors.inkSecondary;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.withValues(alpha: 0.2)),
      ),
      child: Text(
        status,
        style: TextStyle(color: color, fontSize: 10, fontWeight: FontWeight.w900),
      ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/core/design/bl_widgets.dart';
import 'package:mobile_app/core/utils/money.dart';
import 'package:mobile_app/features/clients_suppliers/data/party_aging.dart';
import 'package:mobile_app/features/clients_suppliers/presentation/providers/crm_provider.dart';
import 'package:mobile_app/features/sales/presentation/providers/sales_provider.dart';
import 'package:mobile_app/main.dart' show syncServiceProvider;
import 'providers/cash_collection_provider.dart';

const _green = Color(0xFF1E9E5A);
const _greenDeep = Color(0xFF17663A);
const _amberText = Color(0xFFB86A0A);
const _grey = Color(0xFF7A8088);
const _upiIcon =
    '<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 18h2v2h-2z"/>';

/// 1234567.5 → "12,34,567.5": Indian grouping, typed digits kept as typed.
String groupIndian(String raw) {
  final clean = raw.replaceAll(',', '');
  final dot = clean.indexOf('.');
  final whole = dot < 0 ? clean : clean.substring(0, dot);
  final rest = dot < 0 ? '' : clean.substring(dot);
  if (whole.length <= 3) return '$whole$rest';
  final head = whole.substring(0, whole.length - 3).replaceAllMapped(
      RegExp(r'(\d)(?=(\d{2})+$)'), (m) => '${m[1]},');
  return '$head,${whole.substring(whole.length - 3)}$rest';
}

/// Keeps an amount field grouped with commas while it is typed.
class _AmountFormatter extends TextInputFormatter {
  static final _ok = RegExp(r'^\d{0,9}(\.\d{0,2})?$');

  @override
  TextEditingValue formatEditUpdate(
      TextEditingValue oldValue, TextEditingValue newValue) {
    final clean = newValue.text.replaceAll(',', '');
    if (!_ok.hasMatch(clean)) return oldValue;
    final text = groupIndian(clean);
    return TextEditingValue(
        text: text, selection: TextSelection.collapsed(offset: text.length));
  }
}

/// "Cash Collection" (canvas): go through the clients who owe, one at a time,
/// oldest dues first. "see all" shows the whole round and lets the owner jump
/// to anyone.
class CashCollectionScreen extends ConsumerStatefulWidget {
  const CashCollectionScreen({super.key});

  @override
  ConsumerState<CashCollectionScreen> createState() => _CashCollectionScreenState();
}

class _CashCollectionScreenState extends ConsumerState<CashCollectionScreen> {
  static const _methods = [
    ('CASH', 'Cash', BlIcons.cash),
    ('BANK', 'Bank', BlIcons.bank),
    ('UPI', 'UPI', _upiIcon),
  ];

  // The round is fixed when the screen opens. Re-reading the list after each
  // payment would drop paid clients and reshuffle the rest under the owner's
  // thumb.
  List<CollectableClient>? _queue;
  Map<String, PartyAging> _aging = const {};
  int _index = 0;
  bool _showAll = false;
  bool _saving = false;
  String _method = 'CASH';
  final _amount = TextEditingController();
  final Map<String, double> _paid = {};

  double get _sessionTotal => _paid.values.fold(0, (a, b) => a + b);

  @override
  void initState() {
    super.initState();
    _amount.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _amount.dispose();
    super.dispose();
  }

  String _today() {
    final now = DateTime.now().toUtc().add(const Duration(hours: 5, minutes: 30));
    return '${now.year}-${now.month.toString().padLeft(2, '0')}-${now.day.toString().padLeft(2, '0')}';
  }

  double _owed(CollectableClient c) {
    final v = c.outstandingBalance - (_paid[c.id] ?? 0);
    return v < 0 ? 0 : v;
  }

  double get _entered =>
      double.tryParse(_amount.text.replaceAll(',', '').trim()) ?? 0;

  static String _plain(double v) => groupIndian(
      v == v.roundToDouble() ? v.toStringAsFixed(0) : v.toStringAsFixed(2));

  void _goTo(int i) {
    _index = i;
    _method = 'CASH';
    _amount.text = _plain(_owed(_queue![i]));
    _showAll = false;
  }

  /// The next client nobody has collected from yet, looking forward from the
  /// current one and wrapping round. Null when the round is finished.
  int? _nextPending() {
    final q = _queue!;
    for (var step = 1; step < q.length; step++) {
      final i = (_index + step) % q.length;
      if (!_paid.containsKey(q[i].id)) return i;
    }
    return null;
  }

  void _advance() {
    final next = _nextPending();
    setState(() {
      if (next == null) {
        _showAll = true;
      } else {
        _goTo(next);
      }
    });
  }

  Future<void> _recordPayment(CollectableClient client) async {
    final amount = _entered;
    if (amount <= 0 || _saving) return;
    final method = _method;
    final owed = _owed(client);
    FocusScope.of(context).unfocus();

    final confirmed = await showBlCustomDialog<bool>(
      context: context,
      builder: (ctx) => Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Confirm payment',
              textAlign: TextAlign.center,
              style: Bl.inter(13, w: FontWeight.w600, c: Bl.body)),
          const SizedBox(height: 6),
          Text(Money.inr(amount),
              textAlign: TextAlign.center,
              style: Bl.tight(34, w: FontWeight.w700, ls: -0.04, h: 1.1)),
          const SizedBox(height: 4),
          Text(
              'from ${client.name} · ${_methods.firstWhere((m) => m.$1 == method).$2}',
              textAlign: TextAlign.center,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: Bl.inter(13, w: FontWeight.w500, c: _grey)),
          Container(
            margin: const EdgeInsets.only(top: 14),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            decoration: BoxDecoration(
                color: Bl.tile, borderRadius: BorderRadius.circular(12)),
            child: Column(
              children: [
                _line('Owes now', Money.inr(owed)),
                _line(
                    amount > owed + 0.5
                        ? 'Paid in advance after this'
                        : 'Still due after this',
                    Money.inr((owed - amount).abs()),
                    color: _amberText),
              ],
            ),
          ),
          const SizedBox(height: 14),
          BlSlide('Slide to confirm ${Money.inr(amount)}',
              onConfirmed: () => Navigator.pop(ctx, true)),
          BlTap(
            onTap: () => Navigator.pop(ctx, false),
            child: Padding(
              padding: const EdgeInsets.only(top: 12, bottom: 2),
              child: Text('Edit',
                  textAlign: TextAlign.center,
                  style: Bl.tight(14.5, w: FontWeight.w600, c: Bl.ink3)),
            ),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    final tenantCtx = await ref.read(tenantContextProvider.future);
    if (tenantCtx == null) return;

    setState(() => _saving = true);

    try {
      final paymentId = 'CP-${DateTime.now().millisecondsSinceEpoch}';
      final payload = {
        'id': paymentId,
        'tenant_id': tenantCtx.tenantId,
        'client_id': client.id,
        'amount': amount,
        'payment_method': method,
        'date': _today(),
      };

      final svc = ref.read(syncServiceProvider);
      await svc.rpcOnlineOrQueue('settle_client_payment', {
        'p_id': paymentId,
        'p_tenant_id': tenantCtx.tenantId,
        'p_client_id': client.id,
        'p_amount': amount,
        'p_method': method,
        'p_date': _today(),
        'p_invoice_ids': <String>[],
        'p_notes': null,
      });

      // Also upsert client_payments record for offline tracking
      await svc.upsertOnlineOrQueue('client_payments', payload);

      _paid[client.id] = (_paid[client.id] ?? 0) + amount;
      ref.invalidate(collectableClientsProvider);
      ref.invalidate(clientsProvider);
      ref.invalidate(clientPaymentsProvider);
      if (mounted) {
        setState(() => _saving = false);
        _advance();
      }
    } catch (e) {
      debugPrint('[cash collection] payment failed: $e');
      if (mounted) {
        setState(() => _saving = false);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(
              'May not have saved. Check Payment History before trying again. ($e)'),
          behavior: SnackBarBehavior.floating,
          duration: const Duration(seconds: 8),
        ));
      }
    }
  }

  static Widget _line(String label, String value, {Color color = Bl.ink}) =>
      Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Row(
          children: [
            Expanded(
                child: Text(label,
                    style: Bl.inter(13.5, w: FontWeight.w500, c: Bl.body))),
            Text(value, style: Bl.tight(14, w: FontWeight.w600, c: color)),
          ],
        ),
      );

  Widget _agePill(int days) => days > 60
      ? BlStatusPill.red('$days days')
      : days > 30
          ? BlStatusPill.yellow('$days days')
          : BlStatusPill.green('$days days');

  Widget _chip(String label, double value) {
    final on = (_entered - value).abs() < 0.005;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 4),
      child: Semantics(
        button: true,
        selected: on,
        label: label,
        excludeSemantics: true,
        child: BlTap(
          onTap: () => _amount.text = _plain(value),
          child: Container(
            height: 34,
            padding: const EdgeInsets.symmetric(horizontal: 14),
            alignment: Alignment.center,
            decoration: BoxDecoration(
                color: on ? Bl.ink : Bl.wellSoft,
                borderRadius: BorderRadius.circular(999)),
            child: Text(label,
                style: Bl.tight(13,
                    w: FontWeight.w600, ls: 0, c: on ? Bl.white : Bl.ink3)),
          ),
        ),
      ),
    );
  }

  // ── One client ────────────────────────────────────────────────────────────
  Widget _one(List<CollectableClient> q) {
    final client = q[_index];
    final owed = _owed(client);
    final age = _aging[client.id];
    final amount = _entered;
    final next = _nextPending();
    final bills = age?.unpaidBills ?? 0;

    return SingleChildScrollView(
      padding: const EdgeInsets.only(bottom: 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(18, 4, 18, 0),
            child: Column(
              children: [
                Row(
                  children: [
                    for (var i = 0; i < q.length; i++)
                      Expanded(
                        child: Container(
                          height: 4,
                          margin: EdgeInsets.only(
                              right: i == q.length - 1 ? 0 : (q.length > 24 ? 1 : 5)),
                          decoration: BoxDecoration(
                              color: i == _index
                                  ? Bl.brand
                                  : _paid.containsKey(q[i].id)
                                      ? _green
                                      : const Color(0xFFE9E8E6),
                              borderRadius: BorderRadius.circular(2)),
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Text('Client ${_index + 1} of ${q.length} · ',
                        style: Bl.inter(12.5, w: FontWeight.w500, c: _grey)),
                    Semantics(
                      button: true,
                      label: 'See all clients',
                      excludeSemantics: true,
                      child: BlTap(
                        onTap: () => setState(() => _showAll = true),
                        child: Padding(
                          padding: const EdgeInsets.symmetric(vertical: 6),
                          child: Text('see all',
                              style: Bl.inter(12.5,
                                  w: FontWeight.w600, c: _amberText)),
                        ),
                      ),
                    ),
                    const Spacer(),
                    Text('${Money.inr(_sessionTotal)} collected',
                        style: Bl.inter(12.5,
                            w: FontWeight.w600, c: _greenDeep)),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          Center(child: BlTintAvatar(client.name, size: 60)),
          const SizedBox(height: 10),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 18),
            child: Text(client.name,
                textAlign: TextAlign.center,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: Bl.tight(20, w: FontWeight.w700, ls: -0.02)),
          ),
          const SizedBox(height: 4),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              if (age?.oldestDays != null) ...[
                _agePill(age!.oldestDays!),
                const SizedBox(width: 6),
              ],
              Flexible(
                child: Text(
                    'owes ${Money.inr(owed)}${bills > 0 ? ' · $bills unpaid bill${bills == 1 ? '' : 's'}' : ''}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Bl.inter(12.5, c: _grey)),
              ),
            ],
          ),
          const SizedBox(height: 18),
          Text('Receiving',
              textAlign: TextAlign.center,
              style: Bl.inter(12.5, w: FontWeight.w500, c: Bl.body)),
          const SizedBox(height: 2),
          Center(
            child: Container(
              padding: const EdgeInsets.fromLTRB(10, 0, 10, 4),
              decoration: const BoxDecoration(
                  border:
                      Border(bottom: BorderSide(color: Bl.brand, width: 2))),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.baseline,
                textBaseline: TextBaseline.alphabetic,
                children: [
                  Text('₹',
                      style: Bl.tight(28, w: FontWeight.w600, c: _grey)),
                  IntrinsicWidth(
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(minWidth: 40),
                      child: TextField(
                        controller: _amount,
                        enabled: !_saving,
                        keyboardType: const TextInputType.numberWithOptions(
                            decimal: true),
                        inputFormatters: [_AmountFormatter()],
                        textAlign: TextAlign.center,
                        cursorColor: Bl.brand,
                        style: Bl.tight(46,
                            w: FontWeight.w700, ls: -0.04, h: 1.1),
                        decoration: InputDecoration(
                          isCollapsed: true,
                          filled: false,
                          border: InputBorder.none,
                          enabledBorder: InputBorder.none,
                          focusedBorder: InputBorder.none,
                          disabledBorder: InputBorder.none,
                          hintText: '0',
                          hintStyle: Bl.tight(46,
                              w: FontWeight.w700,
                              ls: -0.04,
                              h: 1.1,
                              c: Bl.faint),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 14),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 14),
            child: ConstrainedBox(
              constraints: BoxConstraints(
                  minWidth: MediaQuery.sizeOf(context).width - 28),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  for (final v in const [1000.0, 2000.0, 5000.0])
                    if (v < owed - 0.5) _chip(Money.inr(v), v),
                  _chip('Full ${Money.inr(owed)}', owed),
                ],
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(18, 18, 18, 0),
            child: Row(
              children: [
                for (var i = 0; i < _methods.length; i++) ...[
                  if (i > 0) const SizedBox(width: 8),
                  Expanded(
                    child: Semantics(
                      button: true,
                      selected: _method == _methods[i].$1,
                      label: _methods[i].$2,
                      excludeSemantics: true,
                      child: BlTap(
                        onTap: () =>
                            setState(() => _method = _methods[i].$1),
                        child: Container(
                          height: 58,
                          decoration: BoxDecoration(
                              color: _method == _methods[i].$1
                                  ? Bl.brand
                                  : Bl.wellSoft,
                              borderRadius: BorderRadius.circular(14)),
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              BlIcon(_methods[i].$3,
                                  size: 19,
                                  color: _method == _methods[i].$1
                                      ? Bl.white
                                      : Bl.ink3),
                              const SizedBox(height: 5),
                              Text(_methods[i].$2,
                                  style: Bl.tight(12.5,
                                      w: FontWeight.w600,
                                      ls: 0,
                                      c: _method == _methods[i].$1
                                          ? Bl.white
                                          : Bl.ink3)),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
          Container(
            margin: const EdgeInsets.fromLTRB(18, 12, 18, 0),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
            decoration: BoxDecoration(
                color: Bl.tile, borderRadius: BorderRadius.circular(12)),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                      amount > owed + 0.5
                          ? 'Paid in advance after this'
                          : 'Still due after this',
                      style: Bl.inter(13, w: FontWeight.w500, c: Bl.body)),
                ),
                Text(Money.inr((owed - amount).abs()),
                    style:
                        Bl.tight(14, w: FontWeight.w600, c: _amberText)),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(18, 16, 18, 0),
            child: Row(
              children: [
                Expanded(
                  flex: 10,
                  child: BlButton('Skip',
                      kind: BlButtonKind.soft,
                      onTap: _saving ? null : _advance),
                ),
                const SizedBox(width: 8),
                Expanded(
                  flex: 17,
                  child: BlButton('Record payment',
                      loading: _saving,
                      onTap: amount > 0 && !_saving
                          ? () => _recordPayment(client)
                          : null),
                ),
              ],
            ),
          ),
          if (next != null)
            Container(
              margin: const EdgeInsets.fromLTRB(18, 16, 18, 0),
              padding: const EdgeInsets.only(top: 12),
              decoration: const BoxDecoration(
                  border: Border(top: BorderSide(color: Color(0xFFECEBE9)))),
              child: Row(
                children: [
                  Text('Up next',
                      style: Bl.inter(12.5, w: FontWeight.w500, c: _grey)),
                  const SizedBox(width: 10),
                  BlTintAvatar(q[next].name, size: 28),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(q[next].name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Bl.tight(13.5, w: FontWeight.w600)),
                  ),
                  Text(Money.inr(_owed(q[next])),
                      style: Bl.tight(13.5,
                          w: FontWeight.w600, c: Bl.redDeep)),
                ],
              ),
            ),
        ],
      ),
    );
  }

  // ── The whole round ───────────────────────────────────────────────────────
  Widget _all(List<CollectableClient> q) {
    final done = q.where((c) => _paid.containsKey(c.id)).length;
    final left = q.fold<double>(0, (t, c) => t + _owed(c));
    final finished = done == q.length;
    final next = finished ? null : _nextPending();
    final currentOpen = !finished && !_paid.containsKey(q[_index].id);

    Widget row(int i) {
      final c = q[i];
      final paid = _paid[c.id];
      final isNow = currentOpen && i == _index;
      final age = _aging[c.id];
      final sub = paid != null
          ? 'Paid ${Money.inr(paid)}${_owed(c) > 0.5 ? ' · ${Money.inr(_owed(c))} still due' : ''}'
          : [
              if ((age?.unpaidBills ?? 0) > 0)
                '${age!.unpaidBills} unpaid bill${age.unpaidBills == 1 ? '' : 's'}',
              if (age?.oldestDays != null) 'oldest ${age!.oldestDays} days',
              if (age == null && (c.phone ?? '').trim().isNotEmpty)
                c.phone!.trim(),
            ].join(' · ');
      final canOpen = _owed(c) > 0.5;
      return Semantics(
        button: canOpen,
        label:
            '${c.name}, ${paid != null ? 'collected ${Money.inr(paid)}' : 'owes ${Money.inr(_owed(c))}'}',
        excludeSemantics: true,
        child: BlTap(
          onTap: canOpen ? () => setState(() => _goTo(i)) : null,
          child: Container(
            margin: isNow
                ? const EdgeInsets.symmetric(horizontal: 10, vertical: 4)
                : null,
            padding: isNow
                ? const EdgeInsets.symmetric(horizontal: 6, vertical: 12)
                : const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            decoration: isNow
                ? BoxDecoration(
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: Bl.ink, width: 1.5))
                : const BoxDecoration(
                    border: Border(bottom: BorderSide(color: Bl.sep))),
            child: Row(
              children: [
                Container(
                  width: 28,
                  height: 28,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                      color: paid != null
                          ? _green
                          : isNow
                              ? Bl.ink
                              : const Color(0xFFEFEEEC),
                      shape: BoxShape.circle),
                  child: paid != null
                      ? const BlIcon(BlIcons.check,
                          size: 13, color: Bl.white, stroke: 3)
                      : Text('${i + 1}',
                          style: Bl.tight(12.5,
                              w: FontWeight.w700,
                              ls: 0,
                              c: isNow ? Bl.white : Bl.body)),
                ),
                const SizedBox(width: 10),
                BlTintAvatar(c.name),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(c.name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: Bl.tight(14.5, w: FontWeight.w600)),
                      if (sub.isNotEmpty) ...[
                        const SizedBox(height: 1),
                        Text(sub,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: Bl.inter(12, c: _grey)),
                      ],
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(Money.inr(paid ?? _owed(c)),
                        style: Bl.tight(14.5,
                            w: FontWeight.w600,
                            c: paid != null ? _greenDeep : Bl.redDeep)),
                    const SizedBox(height: 3),
                    if (paid != null)
                      BlStatusPill.green('Collected')
                    else if (isNow)
                      Text('Now',
                          style: Bl.tight(11.5,
                              w: FontWeight.w600, ls: 0, c: _amberText))
                    else
                      BlStatusPill.grey(i == next ? 'Next' : 'Waiting'),
                  ],
                ),
              ],
            ),
          ),
        ),
      );
    }

    return Column(
      children: [
        Expanded(
          child: ListView(
            padding: const EdgeInsets.only(bottom: 20),
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(18, 8, 18, 0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Collected so far',
                        style: Bl.inter(13, w: FontWeight.w500, c: Bl.body)),
                    const SizedBox(height: 6),
                    Text(Money.inr(_sessionTotal),
                        style: Bl.tight(36,
                            w: FontWeight.w700,
                            ls: -0.04,
                            h: 1.05,
                            c: _greenDeep)),
                    const SizedBox(height: 14),
                    Row(
                      children: [
                        for (var i = 0; i < q.length; i++)
                          Expanded(
                            child: Container(
                              height: 6,
                              margin: EdgeInsets.only(
                                  right: i == q.length - 1
                                      ? 0
                                      : (q.length > 24 ? 1 : 4)),
                              decoration: BoxDecoration(
                                  color: _paid.containsKey(q[i].id)
                                      ? _green
                                      : const Color(0xFFDDDCDA),
                                  borderRadius: BorderRadius.circular(3)),
                            ),
                          ),
                      ],
                    ),
                    const SizedBox(height: 7),
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                              '$done of ${q.length} client${q.length == 1 ? '' : 's'} done',
                              style: Bl.inter(12,
                                  w: FontWeight.w500, c: Bl.body)),
                        ),
                        Text('${Money.inr(left)} still to collect',
                            style: Bl.tight(12.5, w: FontWeight.w600)),
                      ],
                    ),
                  ],
                ),
              ),
              BlGroupHeader('Oldest dues first', trailing: '${q.length}'),
              for (var i = 0; i < q.length; i++) row(i),
              if (!finished)
                Container(
                  margin: const EdgeInsets.fromLTRB(18, 14, 18, 0),
                  padding:
                      const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
                  decoration: BoxDecoration(
                      color: Bl.tile, borderRadius: BorderRadius.circular(12)),
                  child: Row(
                    children: [
                      const BlIcon(
                          '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
                          size: 18,
                          color: Bl.body),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(
                            'Tap any client to collect from them next.',
                            style: Bl.inter(12.5, c: Bl.body, h: 1.4)),
                      ),
                    ],
                  ),
                ),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 12),
          child: finished
              ? BlButton('Done', onTap: () => Navigator.maybePop(context))
              : BlButton(
                  currentOpen
                      ? 'Back to ${q[_index].name}'
                      : 'Next: ${q[next!].name}',
                  onTap: () =>
                      setState(() => _goTo(currentOpen ? _index : next!))),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_queue == null) {
      final clientsAsync = ref.watch(collectableClientsProvider);
      final salesAsync = ref.watch(recentSalesProvider);
      final salesSettled = salesAsync.hasValue || salesAsync.hasError;
      if (clientsAsync.hasValue && salesSettled) {
        _aging = clientAging(salesAsync.valueOrNull ?? const [], DateTime.now());
        // Oldest dues first; clients whose bills this phone does not hold go
        // last, biggest balance first.
        _queue = [...clientsAsync.value!]..sort((a, b) {
            final byAge = (_aging[b.id]?.oldestDays ?? -1)
                .compareTo(_aging[a.id]?.oldestDays ?? -1);
            return byAge != 0
                ? byAge
                : b.outstandingBalance.compareTo(a.outstandingBalance);
          });
        if (_queue!.isNotEmpty) _amount.text = _plain(_owed(_queue![0]));
      }
    }
    final q = _queue;
    final loadError =
        q == null ? ref.watch(collectableClientsProvider).error : null;

    return PopScope(
      canPop: !_showAll || q == null || q.isEmpty || _paid.length == q.length,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) setState(() => _showAll = false);
      },
      child: Scaffold(
        backgroundColor: Bl.white,
        body: SafeArea(
          child: Column(
            children: [
              BlBackHeader(
                title: 'Cash Collection',
                onBack: () => Navigator.maybePop(context),
              ),
              Expanded(
                child: loadError != null
                    ? Center(
                        child: Padding(
                          padding: const EdgeInsets.all(24),
                          child: Text(
                              'Could not load who owes you. Check your internet and try again. ($loadError)',
                              textAlign: TextAlign.center,
                              style: Bl.inter(13.5, c: Bl.redDeep, h: 1.5)),
                        ),
                      )
                    : q == null
                    ? const Center(
                        child: CircularProgressIndicator(
                            color: Bl.amber, strokeWidth: 2))
                    : q.isEmpty
                        ? const Center(
                            child: BlEmpty(
                              icon: BlIcons.check,
                              title: 'Nobody owes you',
                              message: 'Every client is settled.',
                            ),
                          )
                        : _showAll
                            ? _all(q)
                            : _one(q),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

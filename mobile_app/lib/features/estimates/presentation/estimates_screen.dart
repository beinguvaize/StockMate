import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_app/core/design/bl_widgets.dart';
import 'package:mobile_app/core/utils/money.dart';
import 'providers/estimates_provider.dart';

const _grey = Color(0xFF7A8088);
const _mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

String _date(String? iso) {
  final d = iso == null ? null : DateTime.tryParse(iso);
  if (d == null) return '';
  return '${d.day} ${_mon[d.month - 1]}${d.year == DateTime.now().year ? '' : ' ${d.year}'}';
}

/// Tile colours for a document type.
(Color, Color) _typeLook(String type) => switch (type) {
      'Quotation' => (const Color(0xFFF1ECFF), const Color(0xFF5133A8)),
      'Challan' => (const Color(0xFFFFF1DC), const Color(0xFFB86A0A)),
      'Proforma' => (const Color(0xFFE3F5EA), const Color(0xFF17663A)),
      _ => (const Color(0xFFE4EEFF), const Color(0xFF1D4E9E)),
    };

/// Status as the owner reads it: label, pill background, pill text.
(String, Color, Color) _statusLook(String? status) =>
    switch ((status ?? '').toUpperCase()) {
      'ACCEPTED' => ('Accepted', const Color(0xFFE3F5EA), const Color(0xFF17663A)),
      'CONVERTED' => ('Billed', const Color(0xFFE3F5EA), const Color(0xFF17663A)),
      'REJECTED' => ('Rejected', const Color(0xFFFDE2E2), Bl.redDeep),
      'EXPIRED' => ('Expired', const Color(0xFFEFEEEC), Bl.body),
      'DRAFT' => ('Draft', const Color(0xFFEFEEEC), Bl.body),
      _ => ('Sent', const Color(0xFFE4EEFF), const Color(0xFF1D4E9E)),
    };

bool _waiting(String? status) =>
    !const {'ACCEPTED', 'CONVERTED', 'REJECTED', 'EXPIRED', 'DRAFT'}
        .contains((status ?? '').toUpperCase());

/// "Estimates" (canvas): estimates, quotations, challans and proformas, with
/// what is still waiting for the client's answer. View only on the phone.
class EstimatesScreen extends ConsumerStatefulWidget {
  const EstimatesScreen({super.key});

  @override
  ConsumerState<EstimatesScreen> createState() => _EstimatesScreenState();
}

class _EstimatesScreenState extends ConsumerState<EstimatesScreen> {
  static const _types = [
    ('ALL', 'All'),
    ('ESTIMATE', 'Estimate'),
    ('QUOTATION', 'Quotation'),
    ('DELIVERY_CHALLAN', 'Challan'),
    ('PROFORMA', 'Proforma'),
  ];
  String _search = '';
  String _typeFilter = 'ALL';
  final _searchCtrl = TextEditingController();

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  Widget _stat(String value, String label, {Color color = Bl.ink}) => Expanded(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(value,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: Bl.tight(15, w: FontWeight.w700, c: color)),
            const SizedBox(height: 1),
            Text(label,
                maxLines: 1,
                style: Bl.inter(11.5, w: FontWeight.w500, c: _grey)),
          ],
        ),
      );

  @override
  Widget build(BuildContext context) {
    final estimatesAsync = ref.watch(estimatesProvider);

    return Scaffold(
      backgroundColor: Bl.white,
      body: SafeArea(
        child: Column(
          children: [
            const BlBackHeader(title: 'Estimates'),
            Expanded(
              child: estimatesAsync.when(
                skipLoadingOnRefresh: true,
                loading: () => const Center(
                    child: CircularProgressIndicator(
                        color: Bl.amber, strokeWidth: 2)),
                error: (e, _) => Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Text(
                        'Could not load estimates. Check your internet and try again. ($e)',
                        textAlign: TextAlign.center,
                        style: Bl.inter(13.5, c: Bl.redDeep, h: 1.5)),
                  ),
                ),
                data: (estimates) {
                  final q = _search.trim().toLowerCase();
                  final filtered = estimates.where((e) {
                    final matchesType = _typeFilter == 'ALL' ||
                        (e.docType ?? 'ESTIMATE') == _typeFilter;
                    final matchesSearch = q.isEmpty ||
                        (e.clientName ?? '').toLowerCase().contains(q) ||
                        (e.estimateNumber ?? '').toLowerCase().contains(q);
                    return matchesType && matchesSearch;
                  }).toList();
                  final waiting =
                      estimates.where((e) => _waiting(e.status)).toList();
                  final accepted = estimates
                      .where((e) =>
                          (e.status ?? '').toUpperCase() == 'ACCEPTED')
                      .fold<double>(0, (s, e) => s + e.grandTotal);

                  return RefreshIndicator(
                    color: Bl.amber,
                    onRefresh: () async => ref.invalidate(estimatesProvider),
                    child: ListView(
                      padding: const EdgeInsets.only(bottom: 24),
                      children: [
                        Padding(
                          padding: const EdgeInsets.fromLTRB(18, 8, 18, 0),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('Waiting for an answer',
                                  style: Bl.inter(13,
                                      w: FontWeight.w500, c: Bl.body)),
                              const SizedBox(height: 6),
                              Text(
                                  Money.inr(waiting.fold<double>(
                                      0, (s, e) => s + e.grandTotal)),
                                  style: Bl.tight(36,
                                      w: FontWeight.w700,
                                      ls: -0.04,
                                      h: 1.05)),
                              const SizedBox(height: 14),
                              Row(
                                children: [
                                  _stat('${estimates.length}',
                                      estimates.length == 1
                                          ? 'Document'
                                          : 'Documents'),
                                  const SizedBox(width: 10),
                                  _stat('${waiting.length}', 'Sent',
                                      color: waiting.isEmpty
                                          ? Bl.ink
                                          : const Color(0xFFB86A0A)),
                                  const SizedBox(width: 10),
                                  _stat(Money.inr(accepted), 'Accepted',
                                      color: const Color(0xFF17663A)),
                                ],
                              ),
                            ],
                          ),
                        ),
                        Container(
                          height: 44,
                          margin: const EdgeInsets.fromLTRB(16, 14, 16, 0),
                          padding: const EdgeInsets.symmetric(horizontal: 14),
                          decoration: BoxDecoration(
                              color: Bl.well,
                              borderRadius: BorderRadius.circular(999)),
                          child: Row(
                            children: [
                              const BlIcon(BlIcons.search,
                                  size: 20, color: Bl.mute),
                              const SizedBox(width: 10),
                              Expanded(
                                child: TextField(
                                  controller: _searchCtrl,
                                  onChanged: (v) =>
                                      setState(() => _search = v),
                                  cursorColor: Bl.brand,
                                  style: Bl.inter(14,
                                      w: FontWeight.w500, c: Bl.ink),
                                  decoration: InputDecoration(
                                    isCollapsed: true,
                                    filled: false,
                                    border: InputBorder.none,
                                    enabledBorder: InputBorder.none,
                                    focusedBorder: InputBorder.none,
                                    hintText: 'Search by client or number',
                                    hintStyle: Bl.inter(14,
                                        w: FontWeight.w500, c: Bl.mute),
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                        SingleChildScrollView(
                          scrollDirection: Axis.horizontal,
                          padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                          child: Row(
                            children: [
                              for (final (key, label) in _types)
                                Padding(
                                  padding: const EdgeInsets.only(right: 6),
                                  child: Semantics(
                                    button: true,
                                    selected: _typeFilter == key,
                                    label: label,
                                    excludeSemantics: true,
                                    child: BlTap(
                                      onTap: () =>
                                          setState(() => _typeFilter = key),
                                      child: Container(
                                        height: 30,
                                        padding: const EdgeInsets.symmetric(
                                            horizontal: 12),
                                        alignment: Alignment.center,
                                        decoration: BoxDecoration(
                                            color: _typeFilter == key
                                                ? Bl.ink
                                                : null,
                                            borderRadius:
                                                BorderRadius.circular(999),
                                            border: Border.all(
                                                color: _typeFilter == key
                                                    ? Bl.ink
                                                    : const Color(
                                                        0xFFDADADA))),
                                        child: Text(label,
                                            style: Bl.tight(12.5,
                                                w: FontWeight.w600,
                                                ls: 0,
                                                c: _typeFilter == key
                                                    ? Bl.white
                                                    : const Color(
                                                        0xFF303030))),
                                      ),
                                    ),
                                  ),
                                ),
                            ],
                          ),
                        ),
                        BlGroupHeader('Recent',
                            trailing: '${filtered.length}'),
                        if (filtered.isEmpty)
                          BlEmpty(
                            icon: BlIcons.doc,
                            title: estimates.isEmpty
                                ? 'No estimates yet'
                                : 'Nothing matches',
                            message: estimates.isEmpty
                                ? 'Estimates are made in the web app and show here.'
                                : 'Try another type or search.',
                          ),
                        for (final e in filtered)
                          Builder(builder: (context) {
                            final look = _typeLook(e.displayType);
                            final st = _statusLook(e.status);
                            final name = (e.clientName ?? '').trim();
                            return Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 18, vertical: 11),
                              decoration: const BoxDecoration(
                                  border: Border(
                                      bottom: BorderSide(color: Bl.sep))),
                              child: Row(
                                children: [
                                  Container(
                                    width: 40,
                                    height: 40,
                                    alignment: Alignment.center,
                                    decoration: BoxDecoration(
                                        color: look.$1,
                                        borderRadius:
                                            BorderRadius.circular(12)),
                                    child: BlIcon(BlIcons.doc,
                                        size: 18, color: look.$2),
                                  ),
                                  const SizedBox(width: 12),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Text(name.isEmpty ? 'Walk-in' : name,
                                            maxLines: 1,
                                            overflow: TextOverflow.ellipsis,
                                            style: Bl.tight(14.5,
                                                w: FontWeight.w600)),
                                        const SizedBox(height: 1),
                                        Text(
                                            [
                                              e.displayType,
                                              e.estimateNumber ?? '',
                                              _date(e.estimateDate),
                                            ]
                                                .where((s) => s.isNotEmpty)
                                                .join(' · '),
                                            maxLines: 1,
                                            overflow: TextOverflow.ellipsis,
                                            style:
                                                Bl.inter(12, c: _grey)),
                                      ],
                                    ),
                                  ),
                                  const SizedBox(width: 10),
                                  Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.end,
                                    children: [
                                      Text(Money.inr(e.grandTotal),
                                          style: Bl.tight(14.5,
                                              w: FontWeight.w600)),
                                      const SizedBox(height: 3),
                                      Container(
                                        padding: const EdgeInsets.symmetric(
                                            horizontal: 8, vertical: 2),
                                        decoration: BoxDecoration(
                                            color: st.$2,
                                            borderRadius:
                                                BorderRadius.circular(999)),
                                        child: Text(st.$1,
                                            style: Bl.tight(11,
                                                w: FontWeight.w600,
                                                ls: 0,
                                                c: st.$3)),
                                      ),
                                    ],
                                  ),
                                ],
                              ),
                            );
                          }),
                      ],
                    ),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/core/design/bl_widgets.dart';
import 'package:mobile_app/core/supabase/client.dart';
import 'package:mobile_app/core/utils/money.dart';
import 'package:mobile_app/features/settings/data/models/business_profile.dart';
import 'package:mobile_app/features/settings/presentation/providers/settings_provider.dart';

const _grey = Color(0xFF7A8088);

/// One switch on the template: the column it saves to and what it is called.
typedef _Toggle = ({String column, String label, bool Function(BusinessProfile) read});

final _toggles = <_Toggle>[
  (column: 'show_gstin', label: 'Business GSTIN', read: (p) => p.showGstin ?? true),
  (column: 'show_customer_gstin', label: 'Customer GSTIN', read: (p) => p.showCustomerGstin ?? true),
  (column: 'show_tax_breakdown', label: 'Tax breakdown', read: (p) => p.showTaxBreakdown ?? true),
  (column: 'show_address', label: 'Address', read: (p) => p.showAddress ?? true),
  (column: 'show_phone', label: 'Phone', read: (p) => p.showPhone ?? true),
  (column: 'show_customer_name', label: 'Customer name', read: (p) => p.showCustomerName ?? true),
  (column: 'show_upi', label: 'UPI QR', read: (p) => p.showUpi ?? true),
  (column: 'show_discount', label: 'Discount line', read: (p) => p.showDiscount ?? true),
];

const _modes = ['INCLUSIVE', 'EXCLUSIVE', 'NONE'];
const _modeLabels = ['GST included', 'GST added', 'No GST'];

/// "Invoice Template" (canvas): a sample bill that changes as the switches
/// below it are flipped, and how prices carry GST.
class InvoiceTemplateScreen extends ConsumerStatefulWidget {
  const InvoiceTemplateScreen({super.key});

  @override
  ConsumerState<InvoiceTemplateScreen> createState() =>
      _InvoiceTemplateScreenState();
}

class _InvoiceTemplateScreenState extends ConsumerState<InvoiceTemplateScreen> {
  // What the owner just tapped, shown at once while the save is on its way.
  // Cleared for a column when its save fails, so the screen falls back to
  // what the server holds.
  final Map<String, dynamic> _local = {};

  Future<void> _set(String column, dynamic value) async {
    final tenantId = ref.read(tenantContextProvider).valueOrNull?.tenantId;
    if (tenantId == null) return;
    setState(() => _local[column] = value);
    try {
      await supabase
          .from('business_profile')
          .update({column: value}).eq('tenant_id', tenantId);
      ref.invalidate(businessProfileProvider);
    } catch (e) {
      debugPrint('[settings] template save failed: $e');
      ref.invalidate(businessProfileProvider);
      if (!mounted) return;
      setState(() => _local.remove(column));
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(
            'May not have saved. Check the switch before trying again. ($e)'),
        behavior: SnackBarBehavior.floating,
        duration: const Duration(seconds: 8),
      ));
    }
  }

  Widget _line(String label, String value,
          {bool bold = false, Color? color}) =>
      Padding(
        padding: const EdgeInsets.symmetric(vertical: 2.5),
        child: Row(
          children: [
            Expanded(
              child: Text(label,
                  style: Bl.inter(bold ? 12.5 : 12,
                      w: bold ? FontWeight.w700 : FontWeight.w400,
                      c: color ?? (bold ? Bl.ink : Bl.ink3))),
            ),
            Text(value,
                style: Bl.inter(bold ? 12.5 : 12,
                    w: bold ? FontWeight.w700 : FontWeight.w500,
                    c: color ?? Bl.ink)),
          ],
        ),
      );

  Widget _preview(BusinessProfile p, bool Function(String) on, String mode) {
    const sub = 1575.0;
    final discount = on('show_discount') ? 75.0 : 0.0;
    final base = sub - discount;
    final taxable = mode == 'INCLUSIVE' ? base / 1.05 : base;
    final tax = mode == 'NONE' ? 0.0 : taxable * 0.05;
    final total = mode == 'EXCLUSIVE' ? base + tax : base;
    final contact = [
      if (on('show_address') && (p.address ?? '').trim().isNotEmpty)
        p.address!.trim(),
      if (on('show_phone') && (p.phone ?? '').trim().isNotEmpty)
        p.phone!.trim(),
    ].join(' · ');
    const rule = Divider(height: 17, color: Color(0xFFE6E5E3));

    return Semantics(
      label: 'Sample bill',
      child: Container(
        margin: const EdgeInsets.fromLTRB(16, 6, 16, 0),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
            color: const Color(0xFFE9E8E6),
            borderRadius: BorderRadius.circular(20)),
        child: Container(
          padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
          decoration: BoxDecoration(
            color: Bl.white,
            borderRadius: BorderRadius.circular(6),
            boxShadow: const [
              BoxShadow(
                  color: Color(0x33000000),
                  blurRadius: 18,
                  spreadRadius: -8,
                  offset: Offset(0, 6)),
            ],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text((p.name ?? '').trim().isEmpty ? 'Your shop' : p.name!.trim(),
                  textAlign: TextAlign.center,
                  style: Bl.tight(15, w: FontWeight.w700)),
              if (on('show_gstin') &&
                  mode != 'NONE' &&
                  (p.gstNo ?? '').trim().isNotEmpty)
                Text('GSTIN ${p.gstNo!.trim()}',
                    textAlign: TextAlign.center,
                    style: Bl.inter(11, c: _grey)),
              if (contact.isNotEmpty)
                Text(contact,
                    textAlign: TextAlign.center,
                    style: Bl.inter(11, c: _grey)),
              rule,
              if (on('show_customer_name'))
                Text('Bill to: Ravi Kumar',
                    style: Bl.inter(12, w: FontWeight.w500, c: Bl.ink3)),
              if (on('show_customer_gstin') && mode != 'NONE')
                Text('GSTIN 27AAACH1234Q1Z2',
                    style: Bl.inter(11, c: _grey)),
              if (on('show_customer_name') ||
                  (on('show_customer_gstin') && mode != 'NONE'))
                const SizedBox(height: 6),
              _line('Basmati rice 5 kg × 2', Money.inr(1080)),
              _line('Fortune oil 1 L × 3', Money.inr(495)),
              if (discount > 0)
                _line('Discount', '− ${Money.inr(discount)}',
                    color: const Color(0xFF17663A)),
              rule,
              if (on('show_tax_breakdown') && mode != 'NONE') ...[
                _line('Taxable', Money.inrExact(taxable)),
                _line('CGST 2.5%', Money.inrExact(tax / 2)),
                _line('SGST 2.5%', Money.inrExact(tax / 2)),
              ],
              _line('Total', Money.inrExact(total), bold: true),
              if (on('show_upi')) ...[
                const SizedBox(height: 10),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Container(
                      width: 34,
                      height: 34,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                          border: Border.all(color: Bl.ink, width: 1.5),
                          borderRadius: BorderRadius.circular(5)),
                      child: const BlIcon(
                          '<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 18h2v2h-2z"/>',
                          size: 20),
                    ),
                    const SizedBox(width: 8),
                    Text('Scan to pay by UPI',
                        style: Bl.inter(11.5, w: FontWeight.w500, c: Bl.ink3)),
                  ],
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final profileAsync = ref.watch(businessProfileProvider);
    final p = profileAsync.valueOrNull;

    return Scaffold(
      backgroundColor: Bl.white,
      body: SafeArea(
        child: Column(
          children: [
            const BlBackHeader(title: 'Invoice Template'),
            Expanded(
              child: p == null
                  ? Center(
                      child: profileAsync.isLoading
                          ? const CircularProgressIndicator(
                              color: Bl.amber, strokeWidth: 2)
                          : Padding(
                              padding: const EdgeInsets.all(24),
                              child: Text(
                                  'Could not load the template. Check your internet and try again.',
                                  textAlign: TextAlign.center,
                                  style: Bl.inter(13.5,
                                      c: Bl.redDeep, h: 1.5)),
                            ),
                    )
                  : Builder(builder: (context) {
                      bool on(String column) =>
                          (_local[column] as bool?) ??
                          _toggles
                              .firstWhere((t) => t.column == column)
                              .read(p);
                      final saved =
                          (p.taxMode ?? 'EXCLUSIVE').toUpperCase();
                      final mode = (_local['tax_mode'] as String?) ??
                          (_modes.contains(saved) ? saved : 'EXCLUSIVE');
                      final count =
                          _toggles.where((t) => on(t.column)).length;
                      return ListView(
                        padding: const EdgeInsets.only(bottom: 24),
                        children: [
                          _preview(p, on, mode),
                          BlGroupHeader('Show on the bill',
                              trailing: '$count of ${_toggles.length} on'),
                          Container(
                            margin: const EdgeInsets.fromLTRB(16, 4, 16, 0),
                            padding:
                                const EdgeInsets.symmetric(horizontal: 14),
                            decoration: BoxDecoration(
                                color: Bl.tile,
                                borderRadius: BorderRadius.circular(18)),
                            child: Column(
                              children: [
                                for (var i = 0; i < _toggles.length; i++)
                                  Container(
                                    padding: const EdgeInsets.symmetric(
                                        vertical: 10),
                                    decoration: i == _toggles.length - 1
                                        ? null
                                        : const BoxDecoration(
                                            border: Border(
                                                bottom: BorderSide(
                                                    color:
                                                        Color(0xFFECEBE9)))),
                                    child: Row(
                                      children: [
                                        Expanded(
                                          child: Text(_toggles[i].label,
                                              style: Bl.tight(14.5,
                                                  w: FontWeight.w600)),
                                        ),
                                        BlToggle(
                                          value: on(_toggles[i].column),
                                          label: _toggles[i].label,
                                          onChanged: (v) =>
                                              _set(_toggles[i].column, v),
                                        ),
                                      ],
                                    ),
                                  ),
                              ],
                            ),
                          ),
                          const BlGroupHeader('Prices and GST'),
                          Padding(
                            padding: const EdgeInsets.fromLTRB(16, 4, 16, 0),
                            child: BlSegmented(
                              labels: _modeLabels,
                              index: _modes.indexOf(mode),
                              onChanged: (i) => _set('tax_mode', _modes[i]),
                            ),
                          ),
                          Padding(
                            padding: const EdgeInsets.fromLTRB(18, 10, 18, 0),
                            child: Text(
                                switch (mode) {
                                  'INCLUSIVE' =>
                                    'The price you type already has GST in it. The bill shows the tax inside it.',
                                  'NONE' =>
                                    'Bills carry no GST. Use this if the shop is not registered.',
                                  _ =>
                                    'GST is added on top of the price you type.',
                                },
                                style: Bl.inter(12.5, c: _grey, h: 1.45)),
                          ),
                        ],
                      );
                    }),
            ),
          ],
        ),
      ),
    );
  }
}

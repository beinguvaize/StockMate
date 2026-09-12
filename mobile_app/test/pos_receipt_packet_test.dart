// What the customer is handed must describe what they actually bought.
//
// A packet sale is STORED in the base unit — 0.5 KG at Rs 120 — because stock,
// COGS and the below-cost guard all work there. Printed literally, that reads as
// a different purchase from the two 250 g packets the customer carried out.
//
// These tests pin the three things that matter: the packet view is printed when
// it exists, the base view still prints when it does not, and the line total is
// the same either way — a receipt that disagreed with the bill would be a worse
// bug than the wrong unit.

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/core/print/pos_receipt_pdf.dart';
import 'package:mobile_app/features/invoices/data/models/invoice.dart';

Invoice invoiceWith(List<Map<String, dynamic>> items) =>
    Invoice(id: 'INV-TEST', items: items);

void main() {
  test('a packet line prints packets, not the base unit it is stored in', () {
    // Two 250 g packets of a Rs 120/KG product, as add_sale_screen now writes it.
    final items = parsePdfItems(invoiceWith([
      {
        'id': 'P1', 'name': 'Vectal',
        'quantity': 0.5, 'rate': 120.0, 'unit': 'KG',
        'sellUnitName': 'PACK', 'sellQty': 2.0, 'sellUnitPrice': 30.0,
      }
    ]));

    expect(items, hasLength(1));
    expect(items.first.unit, 'PACK');
    expect(items.first.qty, 2.0);
    expect(items.first.price, 30.0);
    // The bill charged 0.5 x 120. The receipt must reach the same number.
    expect(items.first.lineTotal, 60.0);
  });

  test('without the snapshot it still prints the base unit', () {
    // Sales made before this build, and every non-packet product.
    final items = parsePdfItems(invoiceWith([
      {'id': 'P1', 'name': 'Vectal', 'quantity': 0.5, 'rate': 120.0, 'unit': 'KG'}
    ]));

    expect(items.first.unit, 'KG');
    expect(items.first.qty, 0.5);
    expect(items.first.price, 120.0);
    expect(items.first.lineTotal, 60.0);
  });

  test('a partial snapshot is ignored rather than half-applied', () {
    // If any of the three fields is missing the packet view cannot be trusted,
    // and printing a packet qty against a per-kilo price would overcharge on
    // paper by 4x. Fall back whole.
    final items = parsePdfItems(invoiceWith([
      {
        'id': 'P1', 'name': 'Vectal', 'quantity': 0.5, 'rate': 120.0, 'unit': 'KG',
        'sellUnitName': 'PACK', 'sellQty': 2.0, // sellUnitPrice absent
      }
    ]));

    expect(items.first.unit, 'KG');
    expect(items.first.qty, 0.5);
    expect(items.first.lineTotal, 60.0);
  });

  test('a fractional base quantity is not rounded up to 1', () {
    // The original bug: int.tryParse('0.25') failed and fell back to 1, so a
    // quarter-kilo sale printed four times the real amount.
    final items = parsePdfItems(invoiceWith([
      {'id': 'P1', 'name': 'Loose', 'quantity': 0.25, 'rate': 120.0, 'unit': 'KG'}
    ]));

    expect(items.first.qty, 0.25);
    expect(items.first.lineTotal, 30.0);
  });

  test('line totals agree between the two views at several quantities', () {
    for (final packs in [1.0, 2.0, 10.0]) {
      const conv = 0.25, basePrice = 120.0;
      final base = parsePdfItems(invoiceWith([
        {'id': 'P1', 'name': 'V', 'quantity': packs * conv, 'rate': basePrice, 'unit': 'KG'}
      ])).first;
      final pack = parsePdfItems(invoiceWith([
        {
          'id': 'P1', 'name': 'V', 'quantity': packs * conv, 'rate': basePrice, 'unit': 'KG',
          'sellUnitName': 'PACK', 'sellQty': packs, 'sellUnitPrice': basePrice * conv,
        }
      ])).first;
      expect(pack.lineTotal, closeTo(base.lineTotal, 0.001),
          reason: 'receipt must tie to the bill at $packs packets');
    }
  });
}

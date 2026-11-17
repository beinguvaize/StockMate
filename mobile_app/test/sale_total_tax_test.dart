// What _submit sends as p_total_amount: the figure the checkout shows.
// EXCLUSIVE shops pay tax on top; INCLUSIVE and NONE are unchanged.

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/core/print/pos_receipt_pdf.dart';
import 'package:mobile_app/core/database/database.dart' show Product;
import 'package:mobile_app/features/sales/presentation/add_sale_screen.dart'
    show CartItem, saleGrossTotal, saleTotals;

CartItem line(double price, double qty, double rate) => CartItem(
      product: Product(
          id: 'P', tenantId: 'T', name: 'Soap', costPrice: 0, sellingPrice: price,
          stock: 100, taxRate: rate, cessRate: 0),
      quantity: qty,
    );

void main() {
  // 2 x 100 @18% and 1 x 50 @5%: lines 250, tax 36 + 2.5.
  final cart = [line(100, 2, 18), line(50, 1, 5)];

  test('EXCLUSIVE sends lines + tax at each product\'s own rate', () {
    final t = saleTotals(cart, 'EXCLUSIVE', 0);
    expect(t.net, closeTo(288.5, 0.001));
    expect(t.gross, closeTo(288.5, 0.001));
  });

  test('a missing tax_mode is treated as EXCLUSIVE, as the checkout does', () {
    expect(saleTotals(cart, null, 0).net, closeTo(288.5, 0.001));
  });

  test('INCLUSIVE and NONE are unchanged: the lines are the price', () {
    expect(saleTotals(cart, 'INCLUSIVE', 0).net, 250);
    expect(saleTotals(cart, 'NONE', 0).net, 250);
  });

  test('discount comes off the tax-inclusive total, as in checkout and web', () {
    final t = saleTotals(cart, 'EXCLUSIVE', 38.5);
    expect(t.discount, 38.5);
    expect(t.net, closeTo(250, 0.001));
    // Capped at the total it comes off, never below zero.
    final big = saleTotals(cart, 'EXCLUSIVE', 9999);
    expect(big.discount, closeTo(288.5, 0.001));
    expect(big.net, 0);
    // Same for INCLUSIVE.
    expect(saleTotals(cart, 'INCLUSIVE', 50).net, 200);
  });

  test('the default paid amount is the corrected total', () {
    // _submit tenders netTotal when no amount is typed.
    final t = saleTotals(cart, 'EXCLUSIVE', 10);
    expect(t.net, closeTo(278.5, 0.001));
    expect(saleGrossTotal(cart, 'EXCLUSIVE') - t.discount, t.net);
  });

  test('the offline receipt prints that same total', () {
    final items = [
      PdfLineItem(name: 'Soap', qty: 2, price: 100, taxRate: 18),
      PdfLineItem(name: 'Pen', qty: 1, price: 50, taxRate: 5),
    ];
    final sent = saleTotals(cart, 'EXCLUSIVE', 10).net;
    final r = ReceiptTotals.compute(items,
        taxMode: 'EXCLUSIVE', recordedTotal: sent, discount: 10);
    expect(r.total, closeTo(sent, 0.005));
    expect(r.adjustment, 0);
    expect(r.subtotal + r.tax - r.discount, closeTo(sent, 0.005));
  });
}

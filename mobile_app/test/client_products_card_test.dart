import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/features/clients_suppliers/data/client_products.dart';
import 'package:mobile_app/features/clients_suppliers/presentation/widgets/client_products_card.dart';

ClientProductLine _line(String name, double value, {double qty = 1, String? unit, int orders = 1, String last = '2026-08-05'}) =>
    ClientProductLine(key: name, name: name, unit: unit, qty: qty, orders: orders, value: value, lastDate: last);

Future<void> _pump(WidgetTester tester, List<ClientProductLine> lines) =>
    tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: SingleChildScrollView(child: ClientProductsCard(lines: lines)),
      ),
    ));

void main() {
  testWidgets('shows the products and their spend', (tester) async {
    await _pump(tester, [
      _line('Frootty', 1500, qty: 15, unit: 'PCS', orders: 2),
      _line('Rice', 60, qty: 0.75, unit: 'KG'),
    ]);

    expect(find.text('Frootty'), findsOneWidget);
    expect(find.text('Rice'), findsOneWidget);
    expect(find.text('2 items'), findsOneWidget);
    // Fractional quantities must survive to the screen, not just the maths.
    expect(find.textContaining('0.75'), findsOneWidget);
    expect(find.textContaining('2 times'), findsOneWidget);
  });

  testWidgets('collapses a long list and expands on demand', (tester) async {
    final many = List.generate(10, (i) => _line('Product $i', (10 - i) * 100));
    await _pump(tester, many);

    // Six shown, the rest behind the toggle.
    expect(find.text('Product 0'), findsOneWidget);
    expect(find.text('Product 5'), findsOneWidget);
    expect(find.text('Product 6'), findsNothing);
    expect(find.text('Show all 10 products'), findsOneWidget);

    await tester.tap(find.text('Show all 10 products'));
    await tester.pumpAndSettle();

    expect(find.text('Product 9'), findsOneWidget);
    expect(find.text('Show less'), findsOneWidget);
  });

  testWidgets('does not offer a toggle when everything already fits', (tester) async {
    await _pump(tester, [_line('Only one', 100)]);
    expect(find.textContaining('Show all'), findsNothing);
    expect(find.text('1 item'), findsOneWidget);
  });

  testWidgets('explains itself when the client has bought nothing', (tester) async {
    await _pump(tester, const []);
    expect(find.textContaining('No products recorded'), findsOneWidget);
    // A balance can exist without till sales, so say why this can be empty.
    expect(find.textContaining('will appear here'), findsOneWidget);
  });

  testWidgets('omits the "times" hint for a one-off purchase', (tester) async {
    await _pump(tester, [_line('Bought once', 100, orders: 1)]);
    expect(find.textContaining('times'), findsNothing);
    expect(find.textContaining('last 5 Aug'), findsOneWidget);
  });
}

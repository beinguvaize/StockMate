import 'package:mobile_app/features/sales/data/models/sale.dart';

/// What a client has actually bought, rolled up per product.
///
/// The statement sheet answers "how much do they owe"; this answers "what do
/// they buy". Both are built from the sales already in memory — `Sale.items`
/// is populated on the online path (`select()` with no column list) and on the
/// Drift fallback (`itemsJson`), so this adds no query and works offline.
class ClientProductLine {
  final String key;        // product id when present, else the name
  final String name;
  final String? unit;
  final double qty;        // total units bought
  final int orders;        // how many separate sales included it
  final double value;      // total money on those lines
  final String lastDate;   // most recent sale date, ISO, '' if unknown

  const ClientProductLine({
    required this.key,
    required this.name,
    required this.unit,
    required this.qty,
    required this.orders,
    required this.value,
    required this.lastDate,
  });
}

double _num(dynamic v) {
  if (v is num) return v.toDouble();
  if (v is String) return double.tryParse(v) ?? 0;
  return 0;
}

/// Sales that should never count towards what a client bought.
bool _isCountable(Sale s) {
  final status = (s.status ?? '').toUpperCase();
  return status != 'VOID' && status != 'VOIDED' && status != 'CANCELLED';
}

/// Roll the client's sale lines up per product, biggest spend first.
///
/// Grouped by product id where the line carries one, falling back to the name.
/// The id is preferred because a product can be renamed between two sales and
/// splitting one product into two rows would misreport both.
/// [unitById] supplies the unit the sale line does not carry. Sale items are
/// stored with only {cess, hsn, id, name, quantity, rate, taxRate} — there is
/// no `unit` on them and never has been — so without this every quantity reads
/// as a bare number: "29" rather than "29 PCS". The unit belongs to the
/// product, so it is looked up there rather than guessed or left blank.
List<ClientProductLine> aggregateClientProducts(
  List<Sale> sales,
  String clientId, {
  Map<String, String?> unitById = const {},
}) {
  final byKey = <String, _Acc>{};

  for (final sale in sales) {
    if (sale.shopId != clientId) continue;
    if (!_isCountable(sale)) continue;

    final items = sale.items;
    if (items == null) continue;

    // One sale counts once per product towards `orders`, even if the same
    // product appears on two lines of it.
    final seenInThisSale = <String>{};

    for (final raw in items) {
      if (raw is! Map) continue;
      final item = raw.cast<String, dynamic>();

      final name = (item['name'] ?? item['productName'] ?? '').toString().trim();
      final id   = (item['id'] ?? item['product_id'] ?? item['productId'] ?? '').toString().trim();
      final key  = id.isNotEmpty ? id : name.toLowerCase();
      if (key.isEmpty) continue;   // nothing to group or label by

      final qty   = _num(item['quantity'] ?? item['qty']);
      final price = _num(item['price'] ?? item['rate'] ?? item['unitPrice']);
      // Prefer a line total the sale already computed — it accounts for any
      // per-line discount. Fall back to qty x price.
      final lineTotal = item.containsKey('total')
          ? _num(item['total'])
          : item.containsKey('lineTotal')
              ? _num(item['lineTotal'])
              : qty * price;

      final date = sale.date ?? '';

      // The line's own unit if it ever gains one, else the product's.
      final lineUnit = item['unit']?.toString();
      final unit = (lineUnit != null && lineUnit.isNotEmpty)
          ? lineUnit
          : (id.isNotEmpty ? unitById[id] : null);

      final acc = byKey.putIfAbsent(
        key,
        () => _Acc(key: key, name: name.isEmpty ? key : name, unit: unit),
      );
      acc.qty += qty;
      acc.value += lineTotal;
      if (date.compareTo(acc.lastDate) > 0) acc.lastDate = date;
      // A later sale may carry the current name; keep the most recent one.
      if (name.isNotEmpty && date.compareTo(acc.nameDate) >= 0) {
        acc.name = name;
        acc.nameDate = date;
      }
      acc.unit ??= unit;
      if (seenInThisSale.add(key)) acc.orders += 1;
    }
  }

  final out = byKey.values
      .map((a) => ClientProductLine(
            key: a.key, name: a.name, unit: a.unit,
            qty: a.qty, orders: a.orders, value: a.value, lastDate: a.lastDate,
          ))
      .toList();

  // Biggest spend first — that is the question a shop owner is asking.
  // Name is the tiebreaker so the order never shuffles between rebuilds.
  out.sort((x, y) {
    final byValue = y.value.compareTo(x.value);
    return byValue != 0 ? byValue : x.name.toLowerCase().compareTo(y.name.toLowerCase());
  });
  return out;
}

class _Acc {
  final String key;
  String name;
  String? unit;
  double qty = 0;
  double value = 0;
  int orders = 0;
  String lastDate = '';
  String nameDate = '';
  _Acc({required this.key, required this.name, this.unit});
}

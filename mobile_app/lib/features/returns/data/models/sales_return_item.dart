/// One line of a processed sales return, read from `sales_return_items`.
class SalesReturnItem {
  final String id;
  final int lineNo;
  final String productName;
  final double quantity;
  final double rate;
  final double taxRate;
  final double lineTotal;

  const SalesReturnItem({
    required this.id,
    required this.lineNo,
    required this.productName,
    required this.quantity,
    required this.rate,
    required this.taxRate,
    required this.lineTotal,
  });

  factory SalesReturnItem.fromMap(Map<String, dynamic> m) {
    final quantity = (m['quantity'] as num?)?.toDouble() ?? 0;
    final rate = (m['rate'] as num?)?.toDouble() ?? 0;
    return SalesReturnItem(
      id: (m['id'] ?? '').toString(),
      lineNo: (m['line_no'] as num?)?.toInt() ?? 0,
      productName: (m['product_name'] ?? '') as String,
      quantity: quantity,
      rate: rate,
      taxRate: (m['tax_rate'] as num?)?.toDouble() ?? 0,
      // line_total is a generated column; fall back to the arithmetic if absent.
      lineTotal: (m['line_total'] as num?)?.toDouble() ?? quantity * rate,
    );
  }
}

class VanStockItem {
  final String productId;
  final String productName;
  final double quantity;
  final double sellingPrice;
  final String locationId;

  const VanStockItem({
    required this.productId,
    required this.productName,
    required this.quantity,
    required this.sellingPrice,
    required this.locationId,
  });

  factory VanStockItem.fromJson(Map<String, dynamic> j) {
    final product = j['products'] as Map?;
    return VanStockItem(
      productId:    j['product_id'] as String,
      productName:  product?['name'] as String? ?? j['product_id'] as String,
      quantity:     (j['quantity'] as num?)?.toDouble() ?? 0,
      sellingPrice: (product?['sellingPrice'] as num?)?.toDouble() ?? 0,
      locationId:   j['location_id'] as String,
    );
  }
}

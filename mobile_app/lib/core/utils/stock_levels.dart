/// One definition of "low stock" for the whole app.
///
/// There were three, and they disagreed on live data. On FUTURE DISPO's 69
/// products the dashboard said 10, the inventory screen said 12, and the rule
/// that honours each product's own threshold said 11 -- three screens, three
/// answers to one question:
///
///   * dashboard telemetry  `stock < 10`   (strictly less)
///   * inventory list       `stock <= 10`  (less or equal)
///   * inventory chip       `stock > 0 && stock <= 10`
///   * reports              `stock <= lowStockThreshold ?? 10`
///
/// The dashboard was also not obeying its own rule. It parsed stock with
/// `int.tryParse`, which returns null for "42.5", fell back to 0, and so
/// reported a FULL shelf as low stock. Exactly one product on that tenant has
/// a fractional quantity, which is why the badge read 11 where the rule
/// computes 10. Stock is a REAL column; it is parsed as a double here.
class StockLevels {
  StockLevels._();

  /// Used when a product carries no threshold of its own.
  ///
  /// Mobile always lands here today: the local Drift `products` table has no
  /// `lowStockThreshold` column, so the per-product value a shopkeeper sets in
  /// Add Product never reaches the cached row. Reports reads Supabase directly
  /// and does honour it. Closing that gap needs a Drift migration plus a sync
  /// field, which is why this constant is documented rather than hidden.
  static const double defaultThreshold = 10;

  /// Parses a stock value that may arrive as a double, an int, or a string
  /// from Supabase. Never silently becomes 0 for a fractional quantity.
  static double parse(Object? raw) {
    if (raw == null) return 0;
    if (raw is num) return raw.toDouble();
    return double.tryParse(raw.toString()) ?? 0;
  }

  static bool isOutOfStock(double stock) => stock <= 0;

  /// On the shelf, but at or under the threshold. Excludes zero, which is its
  /// own state and is counted separately.
  static bool isLow(double stock, {double? threshold}) =>
      stock > 0 && stock <= (threshold ?? defaultThreshold);

  /// Anything the shopkeeper has to do something about -- low OR out. This is
  /// what a single "Low stock" badge means when there is only one number.
  static bool needsRestock(double stock, {double? threshold}) =>
      stock <= (threshold ?? defaultThreshold);

  static bool isHealthy(double stock, {double? threshold}) =>
      !needsRestock(stock, threshold: threshold);
}

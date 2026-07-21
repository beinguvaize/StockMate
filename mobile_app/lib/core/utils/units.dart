/// Unit classification and quantity formatting.
///
/// Mirrors `src/lib/units.js` on the web. Keep the two in step: a product that
/// accepts 0.25 KG at the counter must accept it on the phone, and print the
/// same way on the receipt.
///
/// Loose goods are sold by weight — 200 g of rubber bands, not "1". The POS
/// previously forced whole numbers, so a cashier entered quantity 1 and typed
/// the real money into the rate field. Revenue came out right; stock and COGS
/// did not.
library;

/// Units measured on a scale or tape — fractions are meaningful.
const _fractionalUnits = <String>{
  'KG', 'LITRE', 'LTR', 'L', 'SQFT', 'MSTR', 'MTR', 'GM', 'G', 'ML',
};

/// Live data has both `KG` and `kg`; imports default to lowercase. Normalise
/// before matching or imported products get misclassified.
String _norm(String? unit) => (unit ?? '').trim().toUpperCase();

/// Whether this unit may be sold in fractions.
///
/// Unknown units return false. 19 products use `Ps`, which is not in the unit
/// enum at all — defaulting unknown units to whole numbers is the safe
/// direction.
bool allowsFraction(String? unit) => _fractionalUnits.contains(_norm(unit));

/// Smallest sellable quantity — a gram, or one piece. 0.001 matches the three
/// decimal places the database stores on batch quantities.
double qtyMin(String? unit) => allowsFraction(unit) ? 0.001 : 1;

/// Step for the +/- buttons. Typing 0.001 is reasonable; stepping to 1 kg in
/// gram increments is not.
double qtyStepButton(String? unit) => allowsFraction(unit) ? 0.5 : 1;

/// Display a quantity without float noise.
///
/// Trailing zeros are dropped so a whole 2 KG prints as "2", not "2.000", and
/// 0.1+0.2 error never reaches a receipt as "0.30000000000000004".
String formatQty(num? qty, String? unit) {
  final n = (qty ?? 0).toDouble();
  if (!n.isFinite) return '0';
  if (!allowsFraction(unit)) return n.round().toString();
  var s = n.toStringAsFixed(3);
  if (s.contains('.')) {
    s = s.replaceFirst(RegExp(r'0+$'), '');
    s = s.replaceFirst(RegExp(r'\.$'), '');
  }
  return s.isEmpty ? '0' : s;
}

/// Quantity with its unit, e.g. "0.25 KG".
String formatQtyWithUnit(num? qty, String? unit) {
  final u = (unit ?? '').trim();
  return u.isEmpty ? formatQty(qty, unit) : '${formatQty(qty, unit)} $u';
}

/// Round a typed quantity to what the unit permits, so the value stored
/// matches the value shown.
double clampQty(num? qty, String? unit) {
  final n = (qty ?? 0).toDouble();
  if (!n.isFinite || n < 0) return 0;
  return allowsFraction(unit) ? double.parse(n.toStringAsFixed(3)) : n.roundToDouble();
}

/// Compare against available stock with a tolerance. Without it, float error
/// makes 0.3 > 0.3 true and the cart clamps a valid entry down.
bool exceedsStock(num qty, num available) => qty.toDouble() - available.toDouble() > 1e-6;

import 'package:intl/intl.dart';

/// Rupee formatting, in one place.
///
/// Indian digit grouping is not the western one: 6,47,218 -- lakhs and crores,
/// two digits at a time above the last three. Getting it wrong does not look
/// foreign to an Indian shopkeeper, it looks wrong.
///
/// This existed only as a private `_fmtAmount` inside the dashboard, so every
/// other screen printed `toStringAsFixed(0)` and rendered a six-figure total as
/// an unbroken run of digits -- 647218 -- which is genuinely hard to read at a
/// glance and is exactly the moment when a shopkeeper is glancing.
class Money {
  Money._();

  static final NumberFormat _whole =
      NumberFormat.decimalPattern('en_IN')..maximumFractionDigits = 0;

  static final NumberFormat _precise = NumberFormat('#,##,##0.00', 'en_IN');

  /// `₹6,47,218` -- totals, list rows, anywhere the paise do not matter.
  static String inr(num amount) => '₹${_whole.format(amount)}';

  /// `₹6,47,218.50` -- invoices and anything that has to reconcile to the paisa.
  static String inrExact(num amount) => '₹${_precise.format(amount)}';

  /// Without the symbol, for a column that carries its own heading.
  static String plain(num amount) => _whole.format(amount);
}

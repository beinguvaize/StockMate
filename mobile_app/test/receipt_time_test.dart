import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/core/print/pos_receipt_pdf.dart';

/// This prints on a customer's receipt, so a wrong value leaves the shop on
/// paper. The 12-hour conversion has two ends that are easy to get wrong, and
/// a UTC timestamp printed raw would be hours out.
void main() {
  group('fmtReceiptTime', () {
    test('returns nothing when there is no timestamp', () {
      // '' not a dash: the caller joins date and time and drops empties, so a
      // bill without one prints the date alone rather than "12 Aug · —".
      expect(fmtReceiptTime(null), '');
    });

    test('converts a UTC timestamp to local time', () {
      // Raw UTC would print 9:27 am on a bill rung up at 2:57 pm in Kerala.
      final utc = DateTime.utc(2026, 8, 10, 9, 27);
      final local = utc.toLocal();
      final h = local.hour % 12 == 0 ? 12 : local.hour % 12;
      final expected =
          '$h:${local.minute.toString().padLeft(2, '0')} ${local.hour < 12 ? 'am' : 'pm'}';
      expect(fmtReceiptTime(utc), expected);
    });

    test('midnight is 12 am, not 0 am', () {
      expect(fmtReceiptTime(DateTime(2026, 8, 10, 0, 5)), '12:05 am');
    });

    test('noon is 12 pm, not 0 pm', () {
      expect(fmtReceiptTime(DateTime(2026, 8, 10, 12, 0)), '12:00 pm');
    });

    test('afternoon wraps to 12-hour', () {
      expect(fmtReceiptTime(DateTime(2026, 8, 10, 14, 57)), '2:57 pm');
      expect(fmtReceiptTime(DateTime(2026, 8, 10, 23, 9)), '11:09 pm');
    });

    test('pads the minute, so 09:05 never reads as 9:5', () {
      expect(fmtReceiptTime(DateTime(2026, 8, 10, 9, 5)), '9:05 am');
    });
  });
}

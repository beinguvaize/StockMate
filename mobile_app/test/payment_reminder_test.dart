import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/features/clients_suppliers/presentation/payment_reminder_sheet.dart';

void main() {
  const bills = [
    (number: 'INV-0977', due: 4200.0, days: 38),
    (number: 'INV-1012', due: 7745.0, days: 11),
  ];

  test('polite reminder names the amount, the bills and the oldest age', () {
    final m = reminderMessage(
        clientName: 'Ravi Kumar',
        shopName: 'Sharma General Store',
        owed: 11945,
        bills: bills,
        firm: false,
        withBills: false);
    expect(m, contains('Hello Ravi Kumar'));
    expect(m, contains('₹11,945'));
    expect(m, contains('on 2 bills at Sharma General Store'));
    expect(m, contains('The oldest is 38 days old'));
    expect(m, isNot(contains('INV-0977')));
  });

  test('the bill list is added only when asked for', () {
    final m = reminderMessage(
        clientName: 'Ravi',
        shopName: '',
        owed: 11945,
        bills: bills,
        firm: true,
        withBills: true);
    expect(m, contains('overdue on 2 bills.'));
    expect(m, contains('INV-0977: ₹4,200'));
    expect(m, contains('INV-1012: ₹7,745'));
  });

  test('no bills on the phone: the message still reads properly', () {
    final m = reminderMessage(
        clientName: 'Ravi',
        shopName: 'Shop',
        owed: 500,
        bills: const [],
        firm: false,
        withBills: true);
    expect(m, 'Hello Ravi, a balance of ₹500 is due at Shop. Please pay when you can. Thank you.');
  });

  test('phone numbers are cleaned for WhatsApp', () {
    expect(reminderPhone('98220 11223'), '919822011223');
    expect(reminderPhone('+91 98220-11223'), '919822011223');
    expect(reminderPhone(''), '');
  });
}

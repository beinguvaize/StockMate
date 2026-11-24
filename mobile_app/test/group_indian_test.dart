import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/features/cash_collection/presentation/cash_collection_screen.dart';

void main() {
  test('groups the Indian way', () {
    expect(groupIndian('0'), '0');
    expect(groupIndian('999'), '999');
    expect(groupIndian('3907'), '3,907');
    expect(groupIndian('21822'), '21,822');
    expect(groupIndian('1234567'), '12,34,567');
    expect(groupIndian('12,34,567'), '12,34,567');
  });

  test('keeps what was typed after the point', () {
    expect(groupIndian('1500.'), '1,500.');
    expect(groupIndian('1500.5'), '1,500.5');
    expect(groupIndian('.5'), '.5');
  });
}

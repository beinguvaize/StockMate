import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/core/update/auto_updater.dart';

void main() {
  final u = AutoUpdater.instance;

  group('isNewer', () {
    test('handles a double-digit patch, where a string compare would not', () {
      // "1.7.10" < "1.7.9" as strings. The first release to cross into double
      // digits would stop offering itself, on every phone, with no error.
      expect(u.isNewer('1.7.9', '1.7.10'), isTrue);
      expect(u.isNewer('1.7.10', '1.7.9'), isFalse);
      expect(u.isNewer('1.9.0', '1.10.0'), isTrue);
    });

    test('the ordinary cases', () {
      expect(u.isNewer('1.7.8', '1.7.9'), isTrue);
      expect(u.isNewer('1.7.9', '1.8.0'), isTrue);
      expect(u.isNewer('1.7.9', '2.0.0'), isTrue);
      expect(u.isNewer('1.7.9', '1.7.9'), isFalse, reason: 'same version is not newer');
      expect(u.isNewer('1.8.0', '1.7.9'), isFalse);
    });

    test('tolerates the shapes a tag or package version can arrive in', () {
      expect(u.isNewer('1.7.9', '1.7.10+128'), isTrue);   // build number suffix
      expect(u.isNewer('1.7', '1.7.1'), isTrue);          // short version
      expect(u.isNewer('', '1.0.0'), isTrue);             // unknown installed
      expect(u.isNewer('1.0.0', ''), isFalse);
    });
  });
}

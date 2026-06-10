import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

/// Full-screen barcode/QR scanner. Pops with the raw barcode string.
/// Shared by sales (SKU lookup) and purchases (product pick by barcode).
class BarcodeScannerScreen extends StatelessWidget {
  final String title;
  const BarcodeScannerScreen({super.key, this.title = 'Scan Barcode'});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        foregroundColor: Colors.white,
        title: Text(title,
            style: GoogleFonts.manrope(
                color: Colors.white, fontWeight: FontWeight.w700)),
      ),
      body: MobileScanner(
        onDetect: (capture) {
          final barcodes = capture.barcodes;
          if (barcodes.isNotEmpty) {
            Navigator.pop(context, barcodes.first.rawValue);
          }
        },
      ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

/// Full-screen barcode/QR scanner. Pops with the raw barcode string.
/// Shared by sales (SKU lookup) and purchases (product pick by barcode).
///
/// Laid out to the approved board "Barcode scanner" (sales-17): the camera
/// fills the screen, with an amber-cornered frame and one line of help. It
/// stays dark when the rest of the app is white, because it is a camera view.
class BarcodeScannerScreen extends StatefulWidget {
  final String title;
  const BarcodeScannerScreen({super.key, this.title = 'Scan barcode'});

  @override
  State<BarcodeScannerScreen> createState() => _BarcodeScannerScreenState();
}

class _BarcodeScannerScreenState extends State<BarcodeScannerScreen> {
  // The camera reports the same code many times a second; pop only once.
  bool _done = false;

  static const _amber = Color(0xFFF09935);

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.of(context).size;
    final frameW = size.width - 90;
    const frameH = 210.0;
    final frameTop = size.height * 0.25;

    return Scaffold(
      backgroundColor: const Color(0xFF0C0C0D),
      body: Stack(
        children: [
          Positioned.fill(
            child: MobileScanner(
              onDetect: (capture) {
                if (_done) return;
                final barcodes = capture.barcodes;
                if (barcodes.isNotEmpty) {
                  _done = true;
                  Navigator.pop(context, barcodes.first.rawValue);
                }
              },
            ),
          ),
          // Frame
          Positioned(
            left: 45,
            top: frameTop,
            width: frameW,
            height: frameH,
            child: IgnorePointer(
              child: CustomPaint(painter: _FramePainter(_amber)),
            ),
          ),
          // Help
          Positioned(
            left: 24,
            right: 24,
            top: frameTop + frameH + 30,
            child: IgnorePointer(
              child: Column(
                children: [
                  Text('Hold the barcode inside the frame',
                      textAlign: TextAlign.center,
                      style: GoogleFonts.interTight(
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                          color: Colors.white)),
                  const SizedBox(height: 6),
                  Text('It scans by itself. No button to press.',
                      textAlign: TextAlign.center,
                      style: GoogleFonts.inter(
                          fontSize: 13, color: const Color(0xFF9AA0A8))),
                ],
              ),
            ),
          ),
          // Top bar
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(14, 6, 16, 0),
              child: Row(
                children: [
                  InkResponse(
                    onTap: () => Navigator.pop(context),
                    radius: 24,
                    child: SizedBox(
                      width: 44,
                      height: 44,
                      child: Center(
                        child: Container(
                          width: 40,
                          height: 40,
                          decoration: const BoxDecoration(
                              color: Color(0x24FFFFFF),
                              shape: BoxShape.circle),
                          child: const Icon(LucideIcons.x,
                              size: 18, color: Colors.white),
                        ),
                      ),
                    ),
                  ),
                  Expanded(
                    child: Text(widget.title,
                        textAlign: TextAlign.center,
                        style: GoogleFonts.interTight(
                            fontSize: 17,
                            fontWeight: FontWeight.w600,
                            color: Colors.white)),
                  ),
                  const SizedBox(width: 44),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Four amber corner brackets and a glowing scan line across the middle.
class _FramePainter extends CustomPainter {
  final Color color;
  _FramePainter(this.color);

  @override
  void paint(Canvas canvas, Size size) {
    const r = 22.0;
    const arm = 34.0;
    final p = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 4
      ..strokeCap = StrokeCap.round;

    final w = size.width, h = size.height;
    Path corner(double x, double y, double sx, double sy) => Path()
      ..moveTo(x, y + sy * arm)
      ..lineTo(x, y + sy * r)
      ..quadraticBezierTo(x, y, x + sx * r, y)
      ..lineTo(x + sx * arm, y);
    canvas.drawPath(corner(0, 0, 1, 1), p);
    canvas.drawPath(corner(w, 0, -1, 1), p);
    canvas.drawPath(corner(0, h, 1, -1), p);
    canvas.drawPath(corner(w, h, -1, -1), p);

    final glow = Paint()
      ..color = color.withValues(alpha: 0.7)
      ..strokeWidth = 6
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 6);
    final line = Paint()
      ..color = color
      ..strokeWidth = 2
      ..strokeCap = StrokeCap.round;
    canvas.drawLine(Offset(16, h / 2), Offset(w - 16, h / 2), glow);
    canvas.drawLine(Offset(16, h / 2), Offset(w - 16, h / 2), line);
  }

  @override
  bool shouldRepaint(covariant _FramePainter old) => old.color != color;
}

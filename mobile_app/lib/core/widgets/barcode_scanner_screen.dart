import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mobile_app/core/design/bl_widgets.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

/// Full-screen barcode scanner (canvas "Barcode scanner"): the camera, a
/// framed window with amber corners and a line that sweeps it. Pops with the
/// first code it reads.
class BarcodeScannerScreen extends StatefulWidget {
  final String title;
  const BarcodeScannerScreen({super.key, this.title = 'Scan barcode'});

  @override
  State<BarcodeScannerScreen> createState() => _BarcodeScannerScreenState();
}

class _BarcodeScannerScreenState extends State<BarcodeScannerScreen>
    with SingleTickerProviderStateMixin {
  late final AnimationController _sweep = AnimationController(
      vsync: this, duration: const Duration(milliseconds: 1800));
  bool _done = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (MediaQuery.maybeDisableAnimationsOf(context) == true) {
      _sweep.value = 0.5;
    } else if (!_sweep.isAnimating) {
      _sweep.repeat(reverse: true);
    }
  }

  @override
  void dispose() {
    _sweep.dispose();
    super.dispose();
  }

  void _onDetect(BarcodeCapture capture) {
    // The camera reports the same code many times a second; leave once.
    if (_done || capture.barcodes.isEmpty) return;
    final value = capture.barcodes.first.rawValue;
    if (value == null || value.isEmpty) return;
    _done = true;
    HapticFeedback.mediumImpact();
    Navigator.pop(context, value);
  }

  Widget _corner(Alignment a) {
    const side = BorderSide(color: Bl.brand, width: 4);
    final top = a.y < 0, left = a.x < 0;
    return Align(
      alignment: a,
      child: Container(
        width: 34,
        height: 34,
        decoration: BoxDecoration(
          border: Border(
            top: top ? side : BorderSide.none,
            bottom: top ? BorderSide.none : side,
            left: left ? side : BorderSide.none,
            right: left ? BorderSide.none : side,
          ),
          borderRadius: BorderRadius.only(
            topLeft: Radius.circular(top && left ? 22 : 0),
            topRight: Radius.circular(top && !left ? 22 : 0),
            bottomLeft: Radius.circular(!top && left ? 22 : 0),
            bottomRight: Radius.circular(!top && !left ? 22 : 0),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Bl.dark,
      body: AnnotatedRegion<SystemUiOverlayStyle>(
        value: SystemUiOverlayStyle.light,
        child: Stack(
          fit: StackFit.expand,
          children: [
            MobileScanner(onDetect: _onDetect),
            // Darken the camera a little so the frame and text read.
            const ColoredBox(color: Color(0x660C0C0D)),
            SafeArea(
              child: Column(
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                    child: Row(
                      children: [
                        BlTap(
                          label: 'Close',
                          onTap: () => Navigator.maybePop(context),
                          child: Container(
                            width: 40,
                            height: 40,
                            alignment: Alignment.center,
                            decoration: const BoxDecoration(
                                color: Color(0x24FFFFFF),
                                shape: BoxShape.circle),
                            child: const BlIcon(BlIcons.close,
                                size: 18, color: Bl.white),
                          ),
                        ),
                        Expanded(
                          child: Text(widget.title,
                              textAlign: TextAlign.center,
                              style: Bl.tight(17,
                                  w: FontWeight.w600, c: Bl.white)),
                        ),
                        const SizedBox(width: 40),
                      ],
                    ),
                  ),
                  const Spacer(flex: 3),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 45),
                    child: SizedBox(
                      height: 210,
                      child: Stack(
                        children: [
                          Positioned.fill(
                            child: DecoratedBox(
                              decoration: BoxDecoration(
                                  color: const Color(0x0DFFFFFF),
                                  borderRadius: BorderRadius.circular(22)),
                            ),
                          ),
                          _corner(Alignment.topLeft),
                          _corner(Alignment.topRight),
                          _corner(Alignment.bottomLeft),
                          _corner(Alignment.bottomRight),
                          AnimatedBuilder(
                            animation: _sweep,
                            builder: (_, _) => Align(
                              alignment: Alignment(
                                  0,
                                  -0.7 +
                                      1.4 *
                                          Curves.easeInOut
                                              .transform(_sweep.value)),
                              child: Container(
                                height: 2,
                                margin:
                                    const EdgeInsets.symmetric(horizontal: 16),
                                decoration: BoxDecoration(
                                  color: Bl.brand,
                                  borderRadius: BorderRadius.circular(1),
                                  boxShadow: const [
                                    BoxShadow(
                                        color: Color(0xB3F09935),
                                        blurRadius: 12,
                                        spreadRadius: 2),
                                  ],
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 30),
                  Text('Hold the barcode inside the frame',
                      textAlign: TextAlign.center,
                      style: Bl.tight(16, w: FontWeight.w600, c: Bl.white)),
                  const SizedBox(height: 6),
                  Text('It scans by itself. No button to press.',
                      textAlign: TextAlign.center,
                      style: Bl.inter(13, c: const Color(0xFF9AA0A8))),
                  const Spacer(flex: 5),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

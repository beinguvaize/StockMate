import 'dart:async';
import 'package:flutter/material.dart';
import 'motion_curves.dart';

/// Item 6: stacked toasts via an Overlay. New one enters from the bottom
/// (400ms); older ones step back (-10px * i, scale 1-0.05*i), max 3 visible;
/// swipe down (velocity > 0.11 px/ms) or time-out dismisses. Never covers
/// the real error: errors use [isError] and stay longer.
class MotionToast {
  static final List<_Entry> _items = [];
  static OverlayEntry? _overlay;
  static final _tick = ValueNotifier<int>(0);

  static void show(BuildContext context, String message, {bool isError = false}) {
    final overlay = Overlay.maybeOf(context, rootOverlay: true);
    if (overlay == null) return;
    final e = _Entry(message, isError);
    _items.insert(0, e);
    _tick.value++;
    _overlay ??= OverlayEntry(builder: (_) => const _Host());
    if (!_overlay!.mounted) overlay.insert(_overlay!);
    e.timer = Timer(Duration(seconds: isError ? 6 : 3), () => _dismiss(e));
  }

  static void _dismiss(_Entry e) {
    e.timer?.cancel();
    if (e.leaving) return;
    e.leaving = true;
    _tick.value++;
    Timer(const Duration(milliseconds: 400), () {
      _items.remove(e);
      _tick.value++;
      if (_items.isEmpty) {
        _overlay?.remove();
        _overlay = null;
      }
    });
  }
}

class _Entry {
  final String message;
  final bool isError;
  bool leaving = false;
  Timer? timer;
  final key = UniqueKey();
  _Entry(this.message, this.isError);
}

class _Host extends StatelessWidget {
  const _Host();
  @override
  Widget build(BuildContext context) => ValueListenableBuilder<int>(
        valueListenable: MotionToast._tick,
        builder: (ctx, _, __) {
          final live = MotionToast._items.where((e) => !e.leaving).toList();
          final bottom = MediaQuery.of(ctx).padding.bottom + 24;
          return Positioned.fill(
            child: IgnorePointer(
              ignoring: false,
              child: Stack(
                alignment: Alignment.bottomCenter,
                children: [
                  for (final e in MotionToast._items.reversed.toList())
                    _ToastView(
                      key: e.key,
                      entry: e,
                      depth: e.leaving ? 0 : live.indexOf(e),
                      bottom: bottom,
                    ),
                ],
              ),
            ),
          );
        },
      );
}

class _ToastView extends StatefulWidget {
  final _Entry entry;
  final int depth;
  final double bottom;
  const _ToastView({super.key, required this.entry, required this.depth, required this.bottom});
  @override
  State<_ToastView> createState() => _ToastViewState();
}

class _ToastViewState extends State<_ToastView> {
  bool _in = false;
  double _drag = 0;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) setState(() => _in = true);
    });
  }

  @override
  Widget build(BuildContext context) {
    final e = widget.entry;
    final hidden = widget.depth >= 3 && !e.leaving;
    final step = toastStackStep(widget.depth.clamp(0, 2));
    final out = e.leaving || !_in;
    final dy = out ? 90.0 : step.dy;
    return Positioned(
      left: 16,
      right: 16,
      bottom: widget.bottom,
      child: AnimatedSlide(
        offset: Offset(0, out ? 1.0 : 0),
        duration: motionDur(context, 400),
        curve: MotionCurves.out,
        child: AnimatedOpacity(
          opacity: (out || hidden) ? 0 : 1,
          duration: motionDur(context, 400),
          curve: MotionCurves.out,
          child: AnimatedContainer(
            duration: motionDur(context, 400),
            curve: MotionCurves.out,
            transform: Matrix4.identity()
              ..translateByDouble(0, out ? 0 : dy + _drag, 0, 1)
              ..scaleByDouble(step.scale, step.scale, 1, 1),
            transformAlignment: Alignment.bottomCenter,
            child: GestureDetector(
              onVerticalDragUpdate: (d) =>
                  setState(() => _drag = (_drag + d.delta.dy).clamp(0, 200)),
              onVerticalDragEnd: (d) {
                if (d.velocity.pixelsPerSecond.dy / 1000 > 0.11) {
                  MotionToast._dismiss(e);
                } else {
                  setState(() => _drag = 0);
                }
              },
              child: Material(
                color: e.isError ? const Color(0xFFB3261E) : const Color(0xFF1F1F1F),
                borderRadius: BorderRadius.circular(12),
                elevation: 4,
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                  child: Row(children: [
                    Icon(e.isError ? Icons.error_outline : Icons.check_circle_outline,
                        color: Colors.white, size: 20),
                    const SizedBox(width: 10),
                    Expanded(
                        child: Text(e.message,
                            style: const TextStyle(color: Colors.white, fontSize: 14))),
                  ]),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

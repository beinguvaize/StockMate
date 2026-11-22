import 'package:flutter/material.dart';
import 'motion_curves.dart';

/// Item 14: bottom sheet that rises 450ms on the drawer curve, drags to
/// dismiss with velocity (framework default) over a dim backdrop.
Future<T?> showMotionSheet<T>({
  required BuildContext context,
  required WidgetBuilder builder,
  bool isScrollControlled = true,
  Color backgroundColor = Colors.transparent,
  bool useRootNavigator = false,
}) {
  final reduce = MediaQuery.maybeDisableAnimationsOf(context) == true;
  return showModalBottomSheet<T>(
    context: context,
    isScrollControlled: isScrollControlled,
    backgroundColor: backgroundColor,
    barrierColor: Colors.black54,
    useRootNavigator: useRootNavigator,
    sheetAnimationStyle: AnimationStyle(
      curve: MotionCurves.drawer,
      reverseCurve: MotionCurves.drawer,
      duration: reduce ? Duration.zero : const Duration(milliseconds: 450),
      reverseDuration: reduce ? Duration.zero : const Duration(milliseconds: 300),
    ),
    builder: builder,
  );
}

/// Item 4: popup menus scale 0.96->1 + fade, 160ms.
AnimationStyle menuAnimationStyle(BuildContext context) => AnimationStyle(
      curve: MotionCurves.out,
      duration: motionDur(context, 160),
      reverseDuration: motionDur(context, 100),
    );

import 'package:flutter/material.dart';

import 'dash_common.dart';

class QuickAction {
  final IconData icon;
  final String label;
  final bool primary;
  final VoidCallback onTap;
  const QuickAction(this.icon, this.label, this.onTap, {this.primary = false});
}

/// Round 52px buttons with a label underneath. One is amber and filled (New
/// sale); the rest are white.
class QuickActions extends StatelessWidget {
  final List<QuickAction> actions;
  const QuickActions({super.key, required this.actions});

  @override
  Widget build(BuildContext context) {
    if (actions.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.fromLTRB(18, 18, 18, 0),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
        children: [
          for (final a in actions)
            Expanded(
              child: Tap(
                onTap: a.onTap,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 52,
                      height: 52,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: a.primary ? DashColors.amber : DashColors.card,
                        boxShadow: [
                          if (a.primary)
                            const BoxShadow(
                                color: Color(0x66E8890C),
                                blurRadius: 14,
                                offset: Offset(0, 6),
                                spreadRadius: -4),
                        ],
                      ),
                      child: Icon(a.icon,
                          size: 22,
                          color: a.primary ? Colors.white : DashColors.ink),
                    ),
                    const SizedBox(height: 7),
                    Text(a.label,
                        maxLines: 1,
                        style: DashText.tight(12,
                            w: FontWeight.w600, c: DashColors.ink2)),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}

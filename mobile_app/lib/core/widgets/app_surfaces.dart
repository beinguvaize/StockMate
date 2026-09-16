import 'package:flutter/material.dart';

import '../theme/colors.dart';
import '../theme/dimens.dart';
import '../theme/typography.dart';

/// The surface and row vocabulary the screens are rebuilt on.
///
/// WHY THESE EXIST. Every block in the app had become a card: white fill,
/// 20px radius, a border AND a drop shadow, repeated down the screen. When
/// everything is lifted, nothing is -- border, fill, radius and shadow each
/// say "separate object", and spending all four on every block flattens the
/// hierarchy instead of creating one.
///
/// So the vocabulary is deliberately small and mostly flat. [AppCard] is a
/// hairline, not a shadow. Elevation is reserved for things that genuinely
/// float above the page: a sheet, a menu, the FAB.

// ─────────────────────────────────────────────────────────────────────────────
// Card
// ─────────────────────────────────────────────────────────────────────────────

class AppCard extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry padding;
  final VoidCallback? onTap;

  /// Lift this card off the page. Default false on purpose -- see the note
  /// above. Use it for something that is genuinely floating, not to make a
  /// list item look important.
  final bool elevated;

  final Color? color;

  const AppCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(Gap.lg),
    this.onTap,
    this.elevated = false,
    this.color,
  });

  @override
  Widget build(BuildContext context) {
    final content = Container(
      padding: padding,
      decoration: BoxDecoration(
        color: color ?? AppColors.canvas,
        borderRadius: Radii.rMd,
        border: Border.all(color: AppColors.outlineVariant),
        boxShadow: elevated ? [AppColors.cardShadow] : null,
      ),
      child: child,
    );

    if (onTap == null) return content;
    return Material(
      color: Colors.transparent,
      child: InkWell(onTap: onTap, borderRadius: Radii.rMd, child: content),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Icon tile
// ─────────────────────────────────────────────────────────────────────────────

/// The tinted square that leads a row.
///
/// 48px, which is also the minimum comfortable touch target -- so a row built
/// around one is tappable by construction rather than by luck.
class IconTile extends StatelessWidget {
  final IconData icon;
  final Color tint;
  final double size;

  const IconTile({
    super.key,
    required this.icon,
    this.tint = AppColors.primary,
    this.size = 48,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        // A wash of the tint, not the tint itself: the icon has to stay the
        // most saturated thing in the tile or the tile reads as a button.
        color: tint.withValues(alpha: 0.10),
        borderRadius: Radii.rSm,
      ),
      child: Icon(icon, size: size * 0.46, color: tint),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Row
// ─────────────────────────────────────────────────────────────────────────────

/// Tile, title, supporting line, trailing. The reference's core pattern and
/// the shape most of this app's lists actually are.
class AppListRow extends StatelessWidget {
  final IconData? icon;
  final Color tint;
  final Widget? leading;
  final String title;
  final String? subtitle;
  final Widget? trailing;
  final VoidCallback? onTap;
  final bool showChevron;

  const AppListRow({
    super.key,
    this.icon,
    this.tint = AppColors.primary,
    this.leading,
    required this.title,
    this.subtitle,
    this.trailing,
    this.onTap,
    this.showChevron = false,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: Radii.rSm,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: Gap.md),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              if (leading != null)
                leading!
              else if (icon != null)
                IconTile(icon: icon!, tint: tint),
              if (leading != null || icon != null) Gap.w16,
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      title,
                      style: AppText.heading,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    if (subtitle != null) ...[
                      const SizedBox(height: 2),
                      Text(
                        subtitle!,
                        style: AppText.caption,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ],
                ),
              ),
              if (trailing != null) ...[Gap.w12, trailing!],
              if (showChevron) ...[
                Gap.w8,
                const Icon(
                  Icons.chevron_right_rounded,
                  size: 22,
                  color: AppColors.inkTertiary,
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Section heading
// ─────────────────────────────────────────────────────────────────────────────

class SectionHeading extends StatelessWidget {
  final String title;
  final String? actionLabel;
  final VoidCallback? onAction;

  /// Screen-level headings use [AppText.title]; a heading that merely labels a
  /// group inside a screen -- "Suggested destinations" -- is quieter than the
  /// rows beneath it, which is what makes the rows read as the content.
  final bool prominent;

  const SectionHeading(
    this.title, {
    super.key,
    this.actionLabel,
    this.onAction,
    this.prominent = false,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: Gap.sm),
      child: Row(
        children: [
          Expanded(
            child: Text(
              title,
              style: prominent
                  ? AppText.title
                  : AppText.bodyStrong.copyWith(
                      color: AppColors.onSurfaceVariant,
                    ),
            ),
          ),
          if (actionLabel != null)
            TextButton(
              onPressed: onAction,
              style: TextButton.styleFrom(
                padding: const EdgeInsets.symmetric(horizontal: Gap.sm),
                minimumSize: const Size(0, 36),
                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              ),
              child: Text(
                actionLabel!,
                style: AppText.label.copyWith(color: AppColors.primary),
              ),
            ),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Search field
// ─────────────────────────────────────────────────────────────────────────────

class AppSearchField extends StatelessWidget {
  final String hint;
  final TextEditingController? controller;
  final ValueChanged<String>? onChanged;
  final VoidCallback? onTap;
  final bool readOnly;
  final bool autofocus;
  final Widget? trailing;

  const AppSearchField({
    super.key,
    this.hint = 'Search',
    this.controller,
    this.onChanged,
    this.onTap,
    this.readOnly = false,
    this.autofocus = false,
    this.trailing,
  });

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      onChanged: onChanged,
      onTap: onTap,
      readOnly: readOnly,
      autofocus: autofocus,
      style: AppText.body,
      decoration: InputDecoration(
        hintText: hint,
        hintStyle: AppText.body.copyWith(color: AppColors.inkTertiary),
        prefixIcon: const Icon(
          Icons.search_rounded,
          size: 22,
          color: AppColors.onSurfaceVariant,
        ),
        suffixIcon: trailing,
        // Outlined rather than filled: a filled grey box beside white cards
        // reads as disabled. The reference outlines it for the same reason.
        filled: false,
        isDense: true,
        contentPadding: const EdgeInsets.symmetric(
          horizontal: Gap.lg,
          vertical: 16,
        ),
        border: const OutlineInputBorder(
          borderRadius: Radii.rSm,
          borderSide: BorderSide(color: AppColors.outlineVariant),
        ),
        enabledBorder: const OutlineInputBorder(
          borderRadius: Radii.rSm,
          borderSide: BorderSide(color: AppColors.outlineVariant),
        ),
        focusedBorder: const OutlineInputBorder(
          borderRadius: Radii.rSm,
          borderSide: BorderSide(color: AppColors.onSurface, width: 1.5),
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sheet
// ─────────────────────────────────────────────────────────────────────────────

/// A bottom sheet with a grab handle, a stated title and room to breathe.
///
/// The app opened sheets with no handle and a 13px title, so they read as a
/// panel that had appeared rather than as something the user had opened and
/// could dismiss.
Future<T?> showAppSheet<T>({
  required BuildContext context,
  required String title,
  required Widget child,
  bool isScrollControlled = true,
}) {
  return showModalBottomSheet<T>(
    context: context,
    isScrollControlled: isScrollControlled,
    backgroundColor: AppColors.canvas,
    barrierColor: AppColors.slate900.withValues(alpha: 0.45),
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(Radii.lg)),
    ),
    builder: (context) => SafeArea(
      top: false,
      child: Padding(
        padding: EdgeInsets.only(
          bottom: MediaQuery.of(context).viewInsets.bottom,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SizedBox(height: Gap.md),
            Center(
              child: Container(
                width: 36,
                height: 4,
                decoration: BoxDecoration(
                  color: AppColors.outlineVariant,
                  borderRadius: Radii.rPill,
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(
                Gap.xl,
                Gap.xl,
                Gap.xl,
                Gap.lg,
              ),
              child: Text(title, style: AppText.title),
            ),
            Flexible(child: child),
            const SizedBox(height: Gap.sm),
          ],
        ),
      ),
    ),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Top tabs
// ─────────────────────────────────────────────────────────────────────────────

typedef AppTab = ({IconData icon, String label});

/// Icon-over-label tabs with an underline on the active one, as in the
/// reference. Selection is carried by weight AND the rule, never by colour
/// alone -- colour alone fails for a user who cannot distinguish it.
class AppTopTabs extends StatelessWidget {
  final List<AppTab> tabs;
  final int selectedIndex;
  final ValueChanged<int> onSelected;

  const AppTopTabs({
    super.key,
    required this.tabs,
    required this.selectedIndex,
    required this.onSelected,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        for (var i = 0; i < tabs.length; i++)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: Gap.md),
            child: _Tab(
              tab: tabs[i],
              selected: i == selectedIndex,
              onTap: () => onSelected(i),
            ),
          ),
      ],
    );
  }
}

class _Tab extends StatelessWidget {
  final AppTab tab;
  final bool selected;
  final VoidCallback onTap;

  const _Tab({required this.tab, required this.selected, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final color = selected ? AppColors.onSurface : AppColors.inkTertiary;
    return InkWell(
      onTap: onTap,
      borderRadius: Radii.rSm,
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: Gap.sm,
          vertical: Gap.sm,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(tab.icon, size: 22, color: color),
            const SizedBox(height: 6),
            Text(
              tab.label,
              style: AppText.label.copyWith(
                color: color,
                fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
              ),
            ),
            const SizedBox(height: 6),
            AnimatedContainer(
              duration: Motion.durationOf(context, Motion.base),
              curve: Motion.curveOf(context, Motion.standard),
              height: 2,
              width: selected ? 28 : 0,
              decoration: const BoxDecoration(
                color: AppColors.onSurface,
                borderRadius: Radii.rPill,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

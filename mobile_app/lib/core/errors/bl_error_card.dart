// The outcome card (mockup error-codes frames 2-4) and its Details sheet
// (frame 5).
//
//   headline = the outcome (Not sent / May have saved / Not saved), code chip
//   one plain sentence, never the raw error
//   "… is kept on screen" when what was typed is still there
//   buttons by outcome, then "Details"
//
// Raw error text appears ONLY in the Details sheet. "Copy for support" copies
// the code, reference, time (IST), action, app version, full shop id and the
// scrubbed raw error. Never the shop name, client name or an amount.

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'package:mobile_app/core/design/bl_widgets.dart';
import 'package:mobile_app/core/errors/error_codes.dart';
import 'package:mobile_app/core/errors/error_report.dart';
import 'package:mobile_app/core/theme/dimens.dart' show Motion;
import 'package:mobile_app/widgets/motion/motion_curves.dart';

class BlErrorAction {
  final String label;
  final VoidCallback? onTap;
  final bool primary;
  final Key? key;

  /// Off while the card's [BlErrorCard.online] is false (NET-01 "Try again").
  /// It only switches the button on when the internet returns; it never taps
  /// it. Unknown connectivity (null) leaves it on.
  final bool needsOnline;
  const BlErrorAction(this.label,
      {required this.onTap,
      this.primary = false,
      this.key,
      this.needsOnline = false});
}

class _Tone {
  final Color bg, border, fg, iconColor;
  final String icon;
  const _Tone(this.bg, this.border, this.fg, this.iconColor, this.icon);
}

const _wifiOff =
    '<path d="M2 8.5a15 15 0 0 1 20 0M5.5 12a10 10 0 0 1 13 0M9 15.5a5 5 0 0 1 6 0"/><path d="M3 3l18 18"/><circle cx="12" cy="19" r="1"/>';
const _clock = '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>';
const _lock =
    '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>';
const _stop = '<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>';
const _info = '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.5"/>';
const _copyIcon =
    '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>';

const _headBlue = Color(0xFF1E40AF);

_Tone _toneOf(ErrorResult r) {
  switch (r.outcome) {
    case ErrorOutcome.notSent:
      return _Tone(Bl.blueSoft, const Color(0xFFD3E0FB), _headBlue, Bl.blue,
          r.code.startsWith('NET') ? _wifiOff : _info);
    case ErrorOutcome.mayHaveSaved:
      return const _Tone(
          Bl.amberSoft, Color(0xFFF6DDB8), Bl.amberDeep, Bl.amberDeep, _clock);
    case ErrorOutcome.notSaved:
      final locked = r.code == 'DB-02' || r.code.startsWith('AUTH');
      return _Tone(Bl.redSoft, const Color(0xFFF7D3D3), Bl.redDeep, Bl.redDeep,
          locked ? _lock : _stop);
    case ErrorOutcome.noChange:
      return const _Tone(Bl.tile, Bl.line, Bl.ink, Bl.body, _info);
  }
}

Color outcomeColor(ErrorOutcome o) => switch (o) {
      ErrorOutcome.notSent => _headBlue,
      ErrorOutcome.mayHaveSaved => Bl.amberDeep,
      ErrorOutcome.notSaved => Bl.redDeep,
      ErrorOutcome.noChange => Bl.ink,
    };

class BlCodeChip extends StatelessWidget {
  final String code;
  const BlCodeChip(this.code, {super.key});
  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
        decoration: BoxDecoration(
          color: Bl.white,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: const Color(0x1A111418)),
        ),
        child: Text(code,
            style: Bl.tight(12, w: FontWeight.w700, ls: 0.04, c: Bl.ink)),
      );
}

class BlErrorCard extends StatelessWidget {
  final ErrorReport report;
  final String message;

  /// "₹1,500, Cash, 27 Nov is kept on screen". Shown for Not sent and May
  /// have saved; a refusal does not need the reassurance.
  final String? keptLine;
  final List<BlErrorAction> actions;

  /// The phone's connectivity as the app knows it: false offline, true
  /// online, null unknown. Only [BlErrorAction.needsOnline] actions read it.
  final bool? online;
  final EdgeInsets margin;

  const BlErrorCard({
    super.key,
    required this.report,
    required this.message,
    required this.actions,
    this.keptLine,
    this.margin = EdgeInsets.zero,
    this.online,
  });

  @override
  Widget build(BuildContext context) {
    final r = report.result;
    final tone = _toneOf(r);
    final showKept = keptLine != null &&
        (r.outcome == ErrorOutcome.notSent ||
            r.outcome == ErrorOutcome.mayHaveSaved);
    final card = Container(
      key: const Key('bl-error-card'),
      margin: margin,
      padding: const EdgeInsets.fromLTRB(14, 14, 14, 12),
      decoration: BoxDecoration(
        color: tone.bg,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: tone.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(children: [
            Container(
              width: 32,
              height: 32,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                  color: Bl.white, borderRadius: BorderRadius.circular(10)),
              child: BlIcon(tone.icon, size: 18, color: tone.iconColor),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(r.outcome.label,
                  key: const Key('bl-error-headline'),
                  style: Bl.tight(16, w: FontWeight.w700, c: tone.fg)),
            ),
            BlCodeChip(r.chip),
          ]),
          const SizedBox(height: 8),
          Text(message,
              key: const Key('bl-error-message'),
              style: Bl.inter(13.5, c: Bl.ink2, h: 1.42)),
          if (showKept) ...[
            const SizedBox(height: 8),
            Row(children: [
              const BlIcon(BlIcons.check, size: 14, color: Bl.green, stroke: 2.6),
              const SizedBox(width: 6),
              Expanded(
                child: Text(keptLine!,
                    style: Bl.inter(12.5, w: FontWeight.w500, c: Bl.green)),
              ),
            ]),
          ],
          if (actions.isNotEmpty) ...[
            const SizedBox(height: 12),
            Row(children: [
              for (var i = 0; i < actions.length; i++) ...[
                if (i > 0) const SizedBox(width: 8),
                Expanded(
                    child: _ActionButton(actions[i],
                        waiting: actions[i].needsOnline && online == false)),
              ],
            ]),
          ],
          const SizedBox(height: 10),
          Container(height: 1, color: const Color(0x14111418)),
          BlTap(
            label: 'Details for support',
            onTap: () => showErrorDetails(context, report),
            child: Padding(
              key: const Key('bl-error-details'),
              padding: const EdgeInsets.only(top: 10, bottom: 2),
              child: Row(children: [
                Expanded(
                  child: Text('Details',
                      style: Bl.tight(12.5, w: FontWeight.w600, ls: 0, c: Bl.body)),
                ),
                const BlIcon(BlIcons.chevronDown, size: 16, color: Bl.body),
              ]),
            ),
          ),
        ],
      ),
    );
    return Semantics(
      container: true,
      liveRegion: true,
      child: _Rise(key: ValueKey(report.reference), child: card),
    );
  }
}

/// The mockup's `rise`: 8px up and in. A single frame with reduced motion.
class _Rise extends StatelessWidget {
  final Widget child;
  const _Rise({super.key, required this.child});
  @override
  Widget build(BuildContext context) => TweenAnimationBuilder<double>(
        tween: Tween(begin: 0, end: 1),
        duration: Motion.durationOf(
            context, const Duration(milliseconds: 320)),
        curve: Motion.curveOf(context, MotionCurves.out),
        builder: (_, t, c) => Opacity(
          opacity: t,
          child: Transform.translate(offset: Offset(0, 8 * (1 - t)), child: c),
        ),
        child: child,
      );
}

class _ActionButton extends StatelessWidget {
  final BlErrorAction a;

  /// Offline and the action needs the internet: shown off, taps ignored.
  final bool waiting;
  const _ActionButton(this.a, {this.waiting = false});
  @override
  Widget build(BuildContext context) {
    final enabled = a.onTap != null && !waiting;
    return Semantics(
      button: true,
      enabled: enabled,
      label: a.label,
      excludeSemantics: true,
      child: BlTap(
        key: a.key,
        onTap: enabled ? a.onTap : null,
        // Same size either way, so switching on is a fade, not a jump.
        child: AnimatedOpacity(
          opacity: enabled ? 1 : 0.5,
          duration: Motion.durationOf(context, const Duration(milliseconds: 220)),
          curve: Motion.curveOf(context, MotionCurves.out),
          child: Container(
            height: 42,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: a.primary ? Bl.ink : Bl.white,
              borderRadius: BorderRadius.circular(12),
              border: a.primary
                  ? null
                  : Border.all(color: const Color(0x24111418)),
            ),
            child: Text(a.label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: Bl.tight(14,
                    w: FontWeight.w600, ls: 0, c: a.primary ? Bl.white : Bl.ink)),
          ),
        ),
      ),
    );
  }
}

Future<void> showErrorDetails(BuildContext context, ErrorReport report) =>
    showBlSheet<void>(
      context: context,
      useRootNavigator: true,
      builder: (_) => ErrorDetailsSheet(report: report),
    );

class ErrorDetailsSheet extends StatefulWidget {
  final ErrorReport report;
  const ErrorDetailsSheet({super.key, required this.report});
  @override
  State<ErrorDetailsSheet> createState() => _ErrorDetailsSheetState();
}

class _ErrorDetailsSheetState extends State<ErrorDetailsSheet> {
  bool _copied = false;

  Future<void> _copy() async {
    await Clipboard.setData(ClipboardData(text: widget.report.copyText()));
    if (mounted) setState(() => _copied = true);
  }

  @override
  Widget build(BuildContext context) {
    final r = widget.report;
    Widget kv(String k, String v, {Color? c, bool last = false}) => Container(
          padding: const EdgeInsets.symmetric(vertical: 8),
          decoration: last
              ? null
              : const BoxDecoration(
                  border: Border(bottom: BorderSide(color: Bl.sep))),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(k, style: Bl.inter(13, c: Bl.body)),
              const SizedBox(width: 12),
              Expanded(
                child: Text(v,
                    textAlign: TextAlign.right,
                    style: Bl.inter(13, w: FontWeight.w600, c: c ?? Bl.ink)),
              ),
            ],
          ),
        );
    return Column(
      key: const Key('bl-error-sheet'),
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Center(
          child: Container(
            width: 36,
            height: 4,
            margin: const EdgeInsets.only(bottom: 12),
            decoration: BoxDecoration(
                color: Bl.line, borderRadius: BorderRadius.circular(4)),
          ),
        ),
        Row(children: [
          Expanded(
            child: Text('Details for support',
                style: Bl.tight(17, w: FontWeight.w700)),
          ),
          BlCodeChip(r.result.chip),
        ]),
        Container(
          margin: const EdgeInsets.only(top: 12),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
          decoration: BoxDecoration(
              color: Bl.tile, borderRadius: BorderRadius.circular(14)),
          child: Column(children: [
            kv('Reference', r.reference),
            kv('Result', r.result.outcome.label,
                c: outcomeColor(r.result.outcome)),
            kv('Time', r.timeIst),
            kv('Action', r.actionLabel),
            kv('App', 'Phone ${r.appVersion}'),
            kv('Shop id', r.shortShopId, last: true),
          ]),
        ),
        Container(
          key: const Key('bl-error-raw'),
          margin: const EdgeInsets.only(top: 10),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          constraints: const BoxConstraints(maxHeight: 132),
          decoration: BoxDecoration(
              color: Bl.wellSoft, borderRadius: BorderRadius.circular(12)),
          child: SingleChildScrollView(
            child: SelectableText(r.raw,
                style: const TextStyle(
                    fontFamily: 'monospace',
                    fontFamilyFallback: ['Courier', 'Menlo'],
                    fontSize: 10.5,
                    height: 1.5,
                    color: Bl.ink2)),
          ),
        ),
        const SizedBox(height: 12),
        Semantics(
          button: true,
          label: _copied ? 'Copied' : 'Copy for support',
          excludeSemantics: true,
          child: BlTap(
            key: const Key('bl-error-copy'),
            onTap: _copy,
            child: Container(
              height: 48,
              decoration: BoxDecoration(
                  color: Bl.ink, borderRadius: BorderRadius.circular(14)),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  BlIcon(_copied ? BlIcons.check : _copyIcon,
                      size: 18, color: Bl.white),
                  const SizedBox(width: 8),
                  Text(_copied ? 'Copied' : 'Copy for support',
                      style: Bl.tight(15, w: FontWeight.w600, c: Bl.white)),
                ],
              ),
            ),
          ),
        ),
        const SizedBox(height: 8),
        Text(
          'Copies the code, reference, time, action, app version, shop id and '
          'this text. No shop name, client name or amount.',
          textAlign: TextAlign.center,
          style: Bl.inter(11.5, c: Bl.mute),
        ),
      ],
    );
  }
}

/// The card on its own in a dialog, for screens whose failure happens inside
/// a sheet (the till's checkout). Actions close the dialog first.
Future<void> showErrorCardDialog(
  BuildContext context, {
  required ErrorReport report,
  required String message,
  String? keptLine,
  List<BlErrorAction>? actions,
  bool? initialOnline,
  Stream<bool>? onlineChanges,
}) {
  return showBlCustomDialog<void>(
    context: context,
    builder: (ctx) => StreamBuilder<bool>(
      stream: onlineChanges,
      initialData: initialOnline,
      builder: (_, snap) => BlErrorCard(
      report: report,
      message: message,
      keptLine: keptLine,
      online: snap.data,
      actions: [
        for (final a in actions ??
            [BlErrorAction('Got it', onTap: () {}, primary: true)])
          BlErrorAction(a.label,
              key: a.key,
              primary: a.primary,
              needsOnline: a.needsOnline,
              onTap: a.onTap == null
                  ? null
                  : () {
                      Navigator.of(ctx).pop();
                      a.onTap!();
                    }),
      ],
    ),
    ),
  );
}

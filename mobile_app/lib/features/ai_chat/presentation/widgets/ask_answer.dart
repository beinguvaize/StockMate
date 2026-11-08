// The answer, drawn from the server's card. The order is the contract's:
// hero, AI text, rows, table, rows after, note, footnote. Nothing here works a
// figure out: values are only formatted for their kind.


import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:mobile_app/core/widgets/app_button.dart';
import 'package:mobile_app/features/ai_chat/data/ask_format.dart';

const _ink1 = AppColors.inkPrimary;
const _ink2 = AppColors.inkSecondary;
const _ink3 = AppColors.inkTertiary;
const _border = AppColors.outlineVariant;
const _tabular = [FontFeature.tabularFigures()];

TextStyle _t(double size, {FontWeight w = FontWeight.w400, Color c = _ink1, double? h}) =>
    GoogleFonts.publicSans(fontSize: size, fontWeight: w, color: c, height: h);
TextStyle _n(double size, {FontWeight w = FontWeight.w500, Color c = _ink1}) =>
    GoogleFonts.manrope(fontSize: size, fontWeight: w, color: c, fontFeatures: _tabular);

/// Money and percentages set apart in the number style, the rest as prose.
class AskNumbered extends StatelessWidget {
  final String text;
  final TextStyle style;
  const AskNumbered(this.text, {super.key, required this.style});

  @override
  Widget build(BuildContext context) => Text.rich(TextSpan(children: [
        for (final p in askSplitNumbers(text))
          TextSpan(
            text: p.part,
            style: p.number ? style.copyWith(fontWeight: FontWeight.w600, fontFeatures: _tabular) : null,
          ),
      ]), style: style);
}

class AskAnswerView extends StatelessWidget {
  final Map<String, dynamic> answer;
  final String questionLabel;
  final Map<String, dynamic> strings;
  final Map<String, dynamic>? usage;
  final List<Map<String, dynamic>> also;
  final VoidCallback onRetry;
  final VoidCallback onPlans;
  final ValueChanged<Map<String, dynamic>> onAsk;

  const AskAnswerView({
    super.key,
    required this.answer,
    required this.questionLabel,
    required this.strings,
    required this.usage,
    required this.also,
    required this.onRetry,
    required this.onPlans,
    required this.onAsk,
  });

  Map<String, dynamic> get ui => strings['ui'] as Map<String, dynamic>;

  @override
  Widget build(BuildContext context) {
    final card = answer['card'] as Map<String, dynamic>;
    final hero = (card['hero'] ?? const {}) as Map<String, dynamic>;
    final rows = (card['rows'] as List?)?.cast<Map<String, dynamic>>() ?? const [];
    final after = (card['rows_after'] as List?)?.cast<Map<String, dynamic>>() ?? const [];
    final table = card['table'] as Map<String, dynamic>?;

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Semantics(header: true, child: Text(questionLabel, style: _t(13, w: FontWeight.w500, c: _ink2))),
          const SizedBox(height: 6),
          // Hero: the one figure the question asks for.
          Text.rich(
            TextSpan(children: [
              TextSpan(text: askFormatValue(hero['value'], hero['kind'] as String?, strings)),
              if (hero['unit'] != null)
                TextSpan(text: '  ${hero['unit']}', style: _t(15, w: FontWeight.w500, c: _ink2)),
            ]),
            key: const Key('ask-hero'),
            style: _n(32, w: FontWeight.w600),
          ),
          if ((hero['caption'] ?? '') != '')
            Text('${hero['caption']}', style: _t(14, w: FontWeight.w500, c: _ink2, h: 1.4)),
          if (hero['detail'] != null)
            AskNumbered('${hero['detail']}', style: _t(12.5, c: _ink3, h: 1.4)),
          const SizedBox(height: 16),
          _aiSlot(),
          _figures(rows, table, after, card, context),
          if (also.isNotEmpty) ...[
            const SizedBox(height: 16),
            Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: Text('${ui['also_ask']}', style: _t(12.5, w: FontWeight.w600, c: _ink3)),
            ),
            for (final q in also)
              AskQuestionRow(label: '${q['label']}', onTap: () => onAsk(q), inset: 0),
          ],
        ],
      ),
    );
  }

  Widget _aiSlot() {
    final reason = answer['reason'] as String?;
    if (reason == 'no_data') return const SizedBox.shrink();
    final text = answer['text'] as String?;
    Widget box(List<Widget> children) => Container(
          margin: const EdgeInsets.only(bottom: 16),
          padding: const EdgeInsets.only(left: 12),
          decoration: const BoxDecoration(border: Border(left: BorderSide(color: _border, width: 2))),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: children),
        );
    if (text != null && text.isNotEmpty) {
      return box([
        Text('${ui['ai_label']}', style: _t(12, w: FontWeight.w500, c: _ink3)),
        const SizedBox(height: 3),
        AskNumbered(text, style: _t(15, h: 1.6)),
      ]);
    }
    final quota = reason == 'quota_reached';
    final note = askFill(
        (ui['reason_$reason'] ?? answer['reason_message'] ?? reason ?? '') as String,
        askUsageVars(usage, strings));
    return box([
      Text('${quota ? ui['quota_title'] : ui['figures_only']}', style: _t(12, w: FontWeight.w500, c: _ink3)),
      const SizedBox(height: 3),
      Text(note, key: const Key('ask-reason'), style: _t(13, c: _ink2, h: 1.55)),
      if (quota || const {'model_error', 'rate_limited', 'provider_busy'}.contains(reason))
        Padding(
          padding: const EdgeInsets.only(top: 8),
          child: AppButton(
            label: '${quota ? ui['see_plans'] : ui['retry']}',
            onPressed: quota ? onPlans : onRetry,
            variant: AppButtonVariant.secondary,
            size: AppButtonSize.small,
          ),
        ),
    ]);
  }

  Widget _figures(List<Map<String, dynamic>> rows, Map<String, dynamic>? table,
      List<Map<String, dynamic>> after, Map<String, dynamic> card, BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Container(
          padding: const EdgeInsets.only(bottom: 6),
          decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: AppColors.outline, width: 0.6))),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            children: [
              Expanded(child: Text('${ui['from_books']}', style: _t(13, w: FontWeight.w700))),
              Text(askAsOf(answer['as_of'], strings), style: _n(12, c: _ink3)),
            ],
          ),
        ),
        for (final r in rows) _row(r),
        if (table != null) _table(table),
        for (final r in after) _row(r),
        if (card['note'] != null)
          Padding(
            padding: const EdgeInsets.only(top: 7),
            child: Text('${card['note']}', style: _t(12, c: _ink2, h: 1.5)),
          ),
        if (card['footnote'] != null)
          Padding(
            padding: const EdgeInsets.only(top: 7),
            child: AskNumbered('${card['footnote']}', style: _t(12, c: _ink3, h: 1.5)),
          ),
      ],
    );
  }

  Widget _row(Map<String, dynamic> r) {
    final total = r['tone'] == 'total';
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 10),
      decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: _border))),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.baseline,
        textBaseline: TextBaseline.alphabetic,
        children: [
          Expanded(
            child: Text('${r['label']}',
                style: _t(14, w: total ? FontWeight.w700 : FontWeight.w400, c: total ? _ink1 : _ink2)),
          ),
          const SizedBox(width: 16),
          Text(askFormatValue(r['value'], r['kind'] as String?, strings),
              style: _n(14, w: total ? FontWeight.w700 : FontWeight.w500)),
        ],
      ),
    );
  }

  Widget _table(Map<String, dynamic> table) {
    final cols = (table['columns'] as List).cast<Map<String, dynamic>>();
    final rows = (table['rows'] as List).cast<List>();
    final tones = (table['tones'] as List?) ?? const [];
    final bars = (table['bars'] as List?) ?? const [];
    if (rows.isEmpty) return const SizedBox.shrink();
    bool right(int i) => cols[i]['align'] == 'right';
    Widget cell(Widget child, int i) => Expanded(
          flex: i == 0 ? 5 : 3,
          child: Padding(padding: EdgeInsets.only(left: i == 0 ? 0 : 10), child: child),
        );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Container(
          padding: const EdgeInsets.only(top: 9, bottom: 5),
          decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: _border))),
          child: Row(children: [
            for (var i = 0; i < cols.length; i++)
              cell(Text('${cols[i]['label']}',
                  textAlign: right(i) ? TextAlign.right : TextAlign.left,
                  style: _t(12, w: FontWeight.w600, c: _ink3)), i),
          ]),
        ),
        for (var r = 0; r < rows.length; r++)
          Builder(builder: (_) {
            final tone = r < tones.length ? tones[r] as String? : null;
            final neg = tone == 'neg';
            final strong = tone == 'strong';
            final colour = neg ? AppColors.danger : _ink1;
            return Container(
              key: Key('ask-row-$r'),
              padding: const EdgeInsets.symmetric(vertical: 9),
              decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: _border))),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  for (var i = 0; i < cols.length; i++)
                    cell(
                      Column(
                        crossAxisAlignment: right(i) ? CrossAxisAlignment.end : CrossAxisAlignment.start,
                        children: [
                          Text(
                            askFormatValue(i < rows[r].length ? rows[r][i] : null, cols[i]['kind'] as String?, strings),
                            textAlign: right(i) ? TextAlign.right : TextAlign.left,
                            style: right(i) && cols[i]['kind'] != 'text'
                                ? _n(13, w: strong ? FontWeight.w700 : FontWeight.w500, c: colour)
                                : _t(13.5,
                                    w: strong ? FontWeight.w600 : FontWeight.w400,
                                    c: right(i) && !neg ? _ink3 : colour,
                                    h: 1.35),
                          ),
                          if (i == 0 && r < bars.length)
                            Padding(
                              padding: const EdgeInsets.only(top: 5),
                              child: ClipRRect(
                                borderRadius: BorderRadius.circular(2),
                                child: SizedBox(
                                  height: 4,
                                  child: Stack(children: [
                                    const ColoredBox(color: AppColors.secondaryContainer, child: SizedBox.expand()),
                                    Align(
                                      alignment: Alignment.centerLeft,
                                      child: FractionallySizedBox(
                                        key: Key('ask-bar-$r'),
                                        widthFactor: ((bars[r] as num?)?.toDouble() ?? 0).clamp(0, 100) / 100,
                                        heightFactor: 1,
                                        // Ink, never red: there are no due dates.
                                        child: ColoredBox(color: strong ? _ink1 : _ink3),
                                      ),
                                    ),
                                  ]),
                                ),
                              ),
                            ),
                        ],
                      ),
                      i,
                    ),
                ],
              ),
            );
          }),
      ],
    );
  }
}

/// "18 Nov, 2:12 pm": when the figures were read, in the phone's time.
String askAsOf(Object? iso, Map<String, dynamic> strings) {
  final d = DateTime.tryParse('${iso ?? ''}')?.toLocal();
  if (d == null) return '';
  final h = d.hour % 12 == 0 ? 12 : d.hour % 12;
  final day = askDayMonth(
      '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}', strings);
  return '$day, $h:${d.minute.toString().padLeft(2, '0')} ${d.hour < 12 ? 'am' : 'pm'}';
}

/// One tappable line in the question register.
class AskQuestionRow extends StatelessWidget {
  final String label;
  final VoidCallback? onTap;
  final double inset;
  const AskQuestionRow({super.key, required this.label, required this.onTap, this.inset = 16});

  @override
  Widget build(BuildContext context) => Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          child: Container(
            constraints: const BoxConstraints(minHeight: 50),
            padding: EdgeInsets.fromLTRB(inset, 10, 12, 10),
            decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: _border))),
            child: Row(children: [
              Expanded(
                child: Text(label,
                    style: _t(14.5, w: FontWeight.w500, c: onTap == null ? _ink3 : _ink1, h: 1.35)),
              ),
              const SizedBox(width: 8),
              Icon(LucideIcons.chevronRight, size: 16, color: onTap == null ? _border : _ink3),
            ]),
          ),
        ),
      );
}

/// Same bones as the answer, so nothing jumps when it arrives.
class AskLoading extends StatelessWidget {
  final String questionLabel;
  final Map<String, dynamic> strings;
  const AskLoading({super.key, required this.questionLabel, required this.strings});

  @override
  Widget build(BuildContext context) {
    Widget bone(double w, double h) => FractionallySizedBox(
          widthFactor: w,
          alignment: Alignment.centerLeft,
          child: Container(
            height: h,
            margin: const EdgeInsets.symmetric(vertical: 6),
            decoration: BoxDecoration(color: AppColors.secondaryContainer, borderRadius: BorderRadius.circular(4)),
          ),
        );
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(questionLabel, style: _t(13, w: FontWeight.w500, c: _ink2)),
          const SizedBox(height: 6),
          Text('${(strings['ui'] as Map)['reading']}', key: const Key('ask-loading'),
              style: _t(13, w: FontWeight.w500, c: _ink2)),
          bone(0.62, 36),
          const SizedBox(height: 8),
          for (final w in [1.0, 0.92, 0.54]) bone(w, 13),
          const SizedBox(height: 8),
          for (var i = 0; i < 5; i++) bone(1, 13),
        ],
      ),
    );
  }
}

/// A one-message screen: off, staff, needs internet, could not read.
class AskMessage extends StatelessWidget {
  final String title;
  final List<Widget> children;
  const AskMessage({super.key, required this.title, required this.children});

  @override
  Widget build(BuildContext context) => SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(16, 20, 16, 24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: _t(18, w: FontWeight.w700, h: 1.3)),
            const SizedBox(height: 6),
            ...children,
          ],
        ),
      );
}

TextStyle askBody([Color c = _ink2]) => _t(14, c: c, h: 1.6);
TextStyle askSmall([Color c = _ink3]) => _t(12.5, c: c, h: 1.55);
TextStyle askHeading() => _t(13, w: FontWeight.w700);

/// The consent notice, word for word from the server's strings (ui.on_fine is
/// the agreed privacy text). Used by the Ask screen and by Settings.
class AskConsentView extends StatelessWidget {
  final Map<String, dynamic> ui;
  final bool busy;
  final String? error;
  final VoidCallback onTurnOn;
  final VoidCallback onNotNow;
  const AskConsentView({super.key, required this.ui, required this.busy, required this.error,
      required this.onTurnOn, required this.onNotNow});

  @override
  Widget build(BuildContext context) {
    Widget list(String head, List<String> items) => Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Container(
              padding: const EdgeInsets.only(bottom: 6),
              decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: AppColors.outline, width: 0.6))),
              child: Text(head, style: askHeading()),
            ),
            for (final i in items)
              Container(
                padding: const EdgeInsets.symmetric(vertical: 7),
                decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: _border))),
                child: Text(i, style: askBody()),
              ),
          ],
        );
    return AskMessage(title: '${ui['on_title']}', children: [
      Text('${ui['on_body']}', style: askBody()),
      const SizedBox(height: 18),
      list('${ui['sent_title']}', ['${ui['sent_1']}', '${ui['sent_2']}']),
      const SizedBox(height: 16),
      list('${ui['never_title']}', [for (var i = 1; i <= 5; i++) '${ui['never_$i']}']),
      const SizedBox(height: 14),
      for (final para in '${ui['on_fine']}'.split('\n'))
        Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: Text(para, key: const Key('ask-on-fine'), style: askSmall()),
        ),
      if (error != null)
        Padding(
          padding: const EdgeInsets.only(top: 4),
          child: Text(error!, style: askBody(AppColors.danger)),
        ),
      const SizedBox(height: 10),
      Row(children: [
        Expanded(child: AppButton(label: '${ui['turn_on']}', loading: busy, onPressed: busy ? null : onTurnOn)),
        const SizedBox(width: 8),
        Expanded(
          child: AppButton(label: '${ui['not_now']}', variant: AppButtonVariant.secondary, onPressed: onNotNow),
        ),
      ]),
    ]);
  }
}

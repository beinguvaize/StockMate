// Ask: 12 set questions about the shop's own books. A register of questions,
// not a conversation. Every number comes from the ai-ask function; offline it
// says "Needs internet" and never works an answer out from the local copy.
//
// Built to the approved mockup v2 (mockups/ai-chat.html, phone frames): a
// pushed full screen, Back returns from an answer to the list where the owner
// left it, and the link to the matching screen sits in a dock at the bottom.

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/core/database/sync_status_pill.dart' show connectivityProvider;
import 'package:mobile_app/core/theme/colors.dart';
import 'package:mobile_app/core/widgets/app_button.dart';
import 'package:mobile_app/features/ai_chat/data/ask_client.dart';
import 'package:mobile_app/features/ai_chat/data/ask_format.dart';
import 'package:mobile_app/features/ai_chat/presentation/ask_routes.dart';
import 'package:mobile_app/features/ai_chat/presentation/providers/ask_providers.dart';
import 'package:mobile_app/features/ai_chat/presentation/widgets/ask_answer.dart';
import 'package:mobile_app/features/settings/presentation/settings_screen.dart';

const _categories = ['sales', 'stock', 'dues', 'cash', 'gst'];

enum _ListState { loading, ready, staff, notEnabled, error }

enum _Status { loading, done, error, stale }

class _Current {
  final Map<String, dynamic> question;
  final _Status status;
  final Map<String, dynamic>? answer;
  final AskError? error;
  const _Current(this.question, this.status, {this.answer, this.error});
}

class AskScreen extends ConsumerStatefulWidget {
  const AskScreen({super.key});

  @override
  ConsumerState<AskScreen> createState() => _AskScreenState();
}

class _AskScreenState extends ConsumerState<AskScreen> {
  String? _lang;
  Map<String, dynamic>? _list;
  _ListState _listState = _ListState.loading;
  AskError? _listError;
  Map<String, dynamic>? _usage;
  _Current? _current;
  bool _turning = false;
  String? _turnError;
  int _seq = 0;
  double _listTop = 0;
  ScrollController _scroll = ScrollController();

  TenantContext? get _ctx => ref.read(tenantContextProvider).valueOrNull;
  String get _uid => _ctx?.userProfile.id ?? '';
  String get _tenant => _ctx?.tenantId ?? '';

  bool get _online {
    final c = ref.watch(connectivityProvider);
    // Until the first reading arrives, try: a failed call says so itself.
    return c.valueOrNull != ConnectivityResult.none;
  }

  @override
  void initState() {
    super.initState();
    _start();
  }

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _start() async {
    await ref.read(tenantContextProvider.future);
    final local = ref.read(askLocalProvider);
    final saved = await local.lang(_uid);
    if (!mounted) return;
    setState(() => _lang = saved ?? askDeviceLang());
    await _loadList();
  }

  Future<void> _loadList() async {
    final lang = _lang!;
    final local = ref.read(askLocalProvider);
    final cached = await local.list(_uid, _tenant, lang);
    if (!mounted) return;
    setState(() {
      _list = cached;
      _listState = _ListState.loading;
    });
    final conn = await ref.read(connectivityProvider.future);
    if (conn == ConnectivityResult.none) {
      if (mounted) setState(() => _listState = cached != null ? _ListState.ready : _ListState.error);
      return;
    }
    try {
      final data = await ref.read(askClientProvider).list(lang);
      if (!mounted || lang != _lang) return;
      setState(() {
        _list = data;
        _usage = data['usage'] as Map<String, dynamic>?;
        _listState = _ListState.ready;
        final c = _current;
        if (c != null) {
          final fresh = _questions.where((q) => q['id'] == c.question['id']);
          if (fresh.isNotEmpty) _current = _Current(fresh.first, c.status, answer: c.answer, error: c.error);
        }
      });
      await local.setList(_uid, _tenant, lang, data);
    } on AskError catch (e) {
      if (!mounted || lang != _lang) return;
      if (e.reason == 'not_owner') {
        setState(() => _listState = _ListState.staff);
        return;
      }
      if (e.reason == 'not_enabled') {
        // The shop's rollout flag is off: hide the entry points too.
        ref.invalidate(askTenantProvider);
        setState(() => _listState = _ListState.notEnabled);
        return;
      }
      debugPrint('[ask] list failed: $e');
      setState(() {
        _listError = e;
        _listState = cached != null ? _ListState.ready : _ListState.error;
      });
    }
  }

  Future<void> _ask(Map<String, dynamic> q) async {
    if (_current == null && _scroll.hasClients) _listTop = _scroll.offset;
    final mine = ++_seq;
    setState(() => _current = _Current(q, _Status.loading));
    try {
      final a = await ref.read(askClientProvider).ask(q['id'] as String, _lang!);
      if (!mounted || mine != _seq) return;
      setState(() {
        final u = a['usage'] as Map<String, dynamic>?;
        if (u != null) _usage = {...?_usage, ...u};
        _current = _Current(q, _Status.done, answer: a);
      });
    } on AskError catch (e) {
      if (!mounted || mine != _seq) return;
      debugPrint('[ask] answer failed: ${q['id']} $e');
      setState(() => _current = _Current(q, _Status.error, error: e));
    }
  }

  /// Back from an answer returns to the list where the owner left it.
  void _backToList() {
    _seq++;
    setState(() {
      _current = null;
      _scroll.dispose();
      _scroll = ScrollController(initialScrollOffset: _listTop);
    });
  }

  Future<void> _changeLang(String lang) async {
    if (lang == _lang) return;
    await ref.read(askLocalProvider).setLang(_uid, lang);
    ref.invalidate(askSavedLangProvider(_uid));
    setState(() {
      _lang = lang;
      // Keep the question, so one tap asks it again in the new language.
      // Asking uses an explanation, so it is never automatic (as on the web).
      final c = _current;
      if (c != null) _current = _Current(c.question, _Status.stale);
    });
    await _loadList();
  }

  Future<void> _turnOn() async {
    setState(() {
      _turning = true;
      _turnError = null;
    });
    try {
      await ref.read(askClientProvider).setEnabled(true);
      ref.invalidate(askTenantProvider);
      await _loadList();
    } on AskError catch (e) {
      setState(() => _turnError = e.message ?? '$e');
    } finally {
      if (mounted) setState(() => _turning = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final bundled = ref.watch(askBundledStringsProvider).valueOrNull;
    final lang = _lang;
    final online = _online;
    if (lang == null || (bundled == null && _list == null)) {
      return const Scaffold(backgroundColor: AppColors.surface, body: Center(child: CircularProgressIndicator()));
    }
    final strings = (_list?['strings'] ?? bundled![lang]) as Map<String, dynamic>;
    final ui = strings['ui'] as Map<String, dynamic>;
    final onAnswer = _current != null && online;

    return PopScope(
      canPop: !onAnswer,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop && onAnswer) _backToList();
      },
      child: Scaffold(
        backgroundColor: AppColors.surface,
        body: SafeArea(
          bottom: false,
          child: Column(
            children: [
              _header(ui, onAnswer),
              const Divider(height: 1, color: AppColors.outlineVariant),
              Expanded(child: _body(strings, ui, online)),
              if (onAnswer) _dock(strings),
            ],
          ),
        ),
      ),
    );
  }

  Widget _header(Map<String, dynamic> ui, bool onAnswer) {
    return SizedBox(
      height: 56,
      child: Row(
        children: [
          const SizedBox(width: 4),
          IconButton(
            tooltip: 'Back',
            iconSize: 20,
            constraints: const BoxConstraints(minWidth: 44, minHeight: 44),
            icon: const Icon(LucideIcons.chevronLeft, color: AppColors.inkSecondary),
            onPressed: () => onAnswer ? _backToList() : Navigator.of(context).maybePop(),
          ),
          Expanded(
            child: Text('${ui['title']}',
                overflow: TextOverflow.ellipsis,
                style: GoogleFonts.publicSans(fontSize: 17, fontWeight: FontWeight.w700, color: AppColors.inkPrimary)),
          ),
          if (_listState != _ListState.staff && _listState != _ListState.notEnabled) _languageSwitch(),
          const SizedBox(width: 12),
        ],
      ),
    );
  }

  Widget _languageSwitch() {
    Widget opt(String code, String label) {
      final on = _lang == code;
      return Semantics(
        button: true,
        selected: on,
        child: InkWell(
          borderRadius: BorderRadius.circular(999),
          onTap: () => _changeLang(code),
          child: Container(
            constraints: const BoxConstraints(minHeight: 36),
            padding: const EdgeInsets.symmetric(horizontal: 12),
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: on ? Colors.white : Colors.transparent,
              borderRadius: BorderRadius.circular(999),
              border: on ? Border.all(color: AppColors.outlineVariant) : null,
            ),
            child: Text(label,
                style: GoogleFonts.publicSans(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w600,
                    color: on ? AppColors.inkPrimary : AppColors.inkSecondary)),
          ),
        ),
      );
    }

    return Container(
      padding: const EdgeInsets.all(2),
      decoration: BoxDecoration(
        color: AppColors.secondaryContainer,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: AppColors.outlineVariant),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [opt('en', 'English'), opt('hi', 'हिन्दी')]),
    );
  }

  List<Map<String, dynamic>> get _questions =>
      ((_list?['questions'] as List?) ?? const []).cast<Map<String, dynamic>>();

  Widget _body(Map<String, dynamic> strings, Map<String, dynamic> ui, bool online) {
    final questions = _questions;
    if (_listState == _ListState.staff) {
      return AskMessage(title: '${ui['staff_title']}', children: [
        Text('${ui['staff_body']}', style: askBody()),
        const SizedBox(height: 18),
        AppButton(
          label: '${ui['staff_back']}',
          variant: AppButtonVariant.secondary,
          onPressed: () => Navigator.of(context).maybePop(),
        ),
      ]);
    }
    if (_listState == _ListState.notEnabled) {
      return AskMessage(title: '${ui['title']}', children: [
        Text('${ui['reason_not_enabled']}', key: const Key('ask-not-enabled'), style: askBody()),
        const SizedBox(height: 18),
        AppButton(
          label: '${ui['staff_back']}',
          variant: AppButtonVariant.secondary,
          onPressed: () => Navigator.of(context).maybePop(),
        ),
      ]);
    }
    if (online && _listState == _ListState.ready && _list?['state'] == 'off') return _turnOnView(ui);
    if (!online && questions.isEmpty) {
      return AskMessage(title: '${ui['offline_title']}', children: [Text('${ui['offline_body']}', style: askBody())]);
    }
    if (online && _listState == _ListState.error) {
      final e = _listError;
      final why = e?.reason != null && ui['reason_${e!.reason}'] != null
          ? '${ui['reason_${e.reason}']}'
          : '${_errorWhy(e, ui)} ${ui['error_nothing']}';
      return AskMessage(title: '${ui['error_title']}', children: [
        Text(why, style: askBody()),
        const SizedBox(height: 18),
        AppButton(label: '${ui['retry']}', variant: AppButtonVariant.secondary, onPressed: _loadList),
      ]);
    }
    if (_listState == _ListState.loading && questions.isEmpty) {
      return Padding(
        padding: const EdgeInsets.all(16),
        child: Text('${ui['reading']}', style: askBody()),
      );
    }
    if (!online) {
      return Column(children: [
        Container(
          width: double.infinity,
          color: AppColors.secondaryContainer,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          child: Text.rich(
            TextSpan(children: [
              TextSpan(text: '${ui['offline_title']}. ', style: const TextStyle(fontWeight: FontWeight.w700)),
              TextSpan(text: '${ui['offline_body']}'),
            ]),
            style: askBody(),
          ),
        ),
        Expanded(child: _listView(ui, strings, enabled: false)),
      ]);
    }
    final c = _current;
    if (c == null) return _listView(ui, strings, enabled: true);
    final label = '${c.question['label']}';
    switch (c.status) {
      case _Status.loading:
        return SingleChildScrollView(child: AskLoading(questionLabel: label, strings: strings));
      case _Status.stale:
        return AskMessage(title: label, children: [
          Text('${ui['stale_note']}', key: const Key('ask-stale'), style: askBody()),
          const SizedBox(height: 18),
          AppButton(label: '${ui['ask_again']}', variant: AppButtonVariant.secondary, onPressed: () => _ask(c.question)),
        ]);
      case _Status.error:
        final e = c.error;
        if (e?.reason != null && e!.reason != 'read_failed' && ui['reason_${e.reason}'] != null) {
          return AskMessage(title: '${ui['error_title']}', children: [Text('${ui['reason_${e.reason}']}', style: askBody())]);
        }
        return AskMessage(title: '${ui['error_title']}', children: [
          Text('${_errorWhy(e, ui)} ${ui['error_nothing']}', key: const Key('ask-error'), style: askBody()),
          const SizedBox(height: 18),
          AppButton(label: '${ui['retry']}', variant: AppButtonVariant.secondary, onPressed: () => _ask(c.question)),
        ]);
      case _Status.done:
        final same = questions.where((q) => q['category'] == c.question['category'] && q['id'] != c.question['id']).toList();
        final also = (same.isNotEmpty ? same : questions.where((q) => q['id'] != c.question['id']).toList()).take(2).toList();
        return SingleChildScrollView(
          key: ValueKey('answer-${c.question['id']}'),
          child: AskAnswerView(
            answer: c.answer!,
            questionLabel: label,
            strings: strings,
            usage: _usage,
            also: also,
            onRetry: () => _ask(c.question),
            onPlans: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const SettingsScreen())),
            onAsk: _ask,
          ),
        );
    }
  }

  String _errorWhy(AskError? e, Map<String, dynamic> ui) => switch (e?.kind) {
        AskErrorKind.slow => '${ui['error_slow']}',
        AskErrorKind.connection => '${ui['error_connection']}',
        _ => '${ui['error_read']}',
      };

  Widget _listView(Map<String, dynamic> ui, Map<String, dynamic> strings, {required bool enabled}) {
    final questions = _questions;
    final usage = _usage;
    final full = usage != null && (usage['used'] as num? ?? 0) >= (usage['limit'] as num? ?? 1 << 30);
    final usageLine = usage == null
        ? null
        : askFill('${full ? ui['usage_full'] : ui['usage_line']}', askUsageVars(usage, strings));
    return ListView(
      key: const Key('ask-list'),
      controller: _scroll,
      padding: const EdgeInsets.only(bottom: 8),
      children: [
        for (final cat in _categories)
          if (questions.any((q) => q['category'] == cat)) ...[
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 14, 16, 4),
              child: Text('${ui['category_$cat']}',
                  style: GoogleFonts.publicSans(fontSize: 12.5, fontWeight: FontWeight.w600, color: AppColors.inkTertiary)),
            ),
            for (final q in questions.where((q) => q['category'] == cat))
              AskQuestionRow(label: '${q['label']}', onTap: enabled ? () => _ask(q) : null),
          ],
        if (enabled && usageLine != null)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 20),
            child: Text(usageLine, key: const Key('ask-usage'), style: askSmall()),
          ),
      ],
    );
  }

  Widget _turnOnView(Map<String, dynamic> ui) => AskConsentView(
        ui: ui,
        busy: _turning,
        error: _turnError,
        onTurnOn: _turnOn,
        onNotNow: () => Navigator.of(context).maybePop(),
      );

  Widget _dock(Map<String, dynamic> strings) {
    final screen = _current?.answer?['screen'] as Map<String, dynamic>?;
    final key = askMobileKey(screen);
    final label = askLinkLabel(key, strings);
    if (key == null || label == null) return const SizedBox.shrink();
    return Container(
      padding: EdgeInsets.fromLTRB(16, 10, 16, 10 + MediaQuery.of(context).padding.bottom),
      decoration: const BoxDecoration(
        color: AppColors.surface,
        border: Border(top: BorderSide(color: AppColors.outlineVariant)),
      ),
      child: AppButton(
        key: const Key('ask-go'),
        label: label,
        icon: LucideIcons.arrowRight,
        variant: AppButtonVariant.secondary,
        fullWidth: true,
        onPressed: () => askOpen(context, key, screen?['params'] as Map<String, dynamic>?),
      ),
    );
  }
}

/// The row on the dashboard, directly under its figures.
class AskEntryRow extends ConsumerWidget {
  final VoidCallback onTap;
  const AskEntryRow({super.key, required this.onTap});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final strings = ref.watch(askBundledStringsProvider).valueOrNull;
    if (strings == null) return const SizedBox.shrink();
    // The language the owner chose in Ask, else the phone's.
    final uid = ref.watch(tenantContextProvider).valueOrNull?.userProfile.id ?? '';
    final lang = ref.watch(askSavedLangProvider(uid)).valueOrNull ?? askDeviceLang();
    final ui = (strings[lang] as Map)['ui'] as Map;
    return Material(
      color: AppColors.surface,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        key: const Key('ask-entry'),
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: Container(
          constraints: const BoxConstraints(minHeight: 56),
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: AppColors.outlineVariant),
          ),
          child: Row(children: [
            const Icon(LucideIcons.messageSquare, size: 18, color: AppColors.inkSecondary),
            const SizedBox(width: 10),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('${ui['entry_title']}',
                    style: GoogleFonts.publicSans(fontSize: 14, fontWeight: FontWeight.w600, color: AppColors.inkPrimary)),
                Text('${ui['entry_sub']}', style: askSmall()),
              ]),
            ),
            const Icon(LucideIcons.chevronRight, size: 16, color: AppColors.inkTertiary),
          ]),
        ),
      ),
    );
  }
}

/// The consent notice on its own, for Settings. Pops true once Ask is on.
class AskConsentScreen extends ConsumerStatefulWidget {
  const AskConsentScreen({super.key});

  @override
  ConsumerState<AskConsentScreen> createState() => _AskConsentScreenState();
}

class _AskConsentScreenState extends ConsumerState<AskConsentScreen> {
  bool _busy = false;
  String? _error;

  Future<void> _turnOn() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(askClientProvider).setEnabled(true);
      if (mounted) Navigator.of(context).pop(true);
    } on AskError catch (e) {
      if (mounted) setState(() => _error = e.message ?? '$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final bundled = ref.watch(askBundledStringsProvider).valueOrNull;
    final uid = ref.watch(tenantContextProvider).valueOrNull?.userProfile.id ?? '';
    final lang = ref.watch(askSavedLangProvider(uid)).valueOrNull ?? askDeviceLang();
    if (bundled == null) {
      return const Scaffold(backgroundColor: AppColors.surface, body: Center(child: CircularProgressIndicator()));
    }
    final ui = (bundled[lang] as Map<String, dynamic>)['ui'] as Map<String, dynamic>;
    return Scaffold(
      backgroundColor: AppColors.surface,
      appBar: AppBar(
        backgroundColor: AppColors.surface,
        elevation: 0,
        title: Text('${ui['title']}',
            style: GoogleFonts.publicSans(fontSize: 17, fontWeight: FontWeight.w700, color: AppColors.inkPrimary)),
      ),
      body: AskConsentView(
        ui: ui,
        busy: _busy,
        error: _error,
        onTurnOn: _turnOn,
        onNotNow: () => Navigator.of(context).pop(false),
      ),
    );
  }
}

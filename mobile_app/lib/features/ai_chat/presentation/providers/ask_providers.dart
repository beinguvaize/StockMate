import 'dart:convert';

import 'package:flutter/services.dart' show rootBundle;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_app/features/ai_chat/data/ask_client.dart';
import 'package:mobile_app/features/ai_chat/data/ask_local.dart';

final askClientProvider = Provider<AskClient>((ref) => AskClient());
final askLocalProvider = Provider<AskLocal>((ref) => const AskLocal());

/// The bundled copy of shared/ai_chat/strings.json: the words for first run and
/// offline, before any list has come from the server.
final askBundledStringsProvider = FutureProvider<Map<String, dynamic>>((ref) async =>
    jsonDecode(await rootBundle.loadString('assets/ai_chat/strings.json')) as Map<String, dynamic>);

/// Who may see the entry. The server decides (is_tenant_admin); this only
/// keeps the row off staff dashboards.
bool askMaySee(List<String> roles) => roles.contains('OWNER') || roles.contains('GLOBAL_ADMIN');

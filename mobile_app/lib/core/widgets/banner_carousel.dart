import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:mobile_app/core/supabase/client.dart';

/// Dashboard promo/announcement banners — mirrors the web BannerCarousel.
/// Content comes from the shared `banners` table (RLS: active + in window).
final bannersProvider = FutureProvider<List<Map<String, dynamic>>>((ref) async {
  final res = await supabase.from('banners').select().order('sort');
  return (res as List).map((e) => Map<String, dynamic>.from(e as Map)).toList();
});

const _gradients = {
  'amber':   [Color(0xFFF59E0B), Color(0xFFEA580C)],
  'indigo':  [Color(0xFF6366F1), Color(0xFF4F46E5)],
  'emerald': [Color(0xFF10B981), Color(0xFF0D9488)],
  'slate':   [Color(0xFF334155), Color(0xFF0F172A)],
  'rose':    [Color(0xFFF43F5E), Color(0xFFDB2777)],
};

class BannerCarousel extends ConsumerStatefulWidget {
  const BannerCarousel({super.key});

  @override
  ConsumerState<BannerCarousel> createState() => _BannerCarouselState();
}

class _BannerCarouselState extends ConsumerState<BannerCarousel> {
  final _controller = PageController();
  Timer? _timer;
  int _page = 0;

  @override
  void dispose() {
    _timer?.cancel();
    _controller.dispose();
    super.dispose();
  }

  void _startAutoRotate(int count) {
    _timer ??= Timer.periodic(const Duration(seconds: 6), (_) {
      if (!mounted || count < 2) return;
      final next = (_page + 1) % count;
      _controller.animateToPage(next,
          duration: const Duration(milliseconds: 350), curve: Curves.easeOut);
    });
  }

  @override
  Widget build(BuildContext context) {
    final bannersAsync = ref.watch(bannersProvider);
    return bannersAsync.when(
      loading: () => const SizedBox.shrink(),
      error: (_, _) => const SizedBox.shrink(),
      data: (banners) {
        if (banners.isEmpty) return const SizedBox.shrink();
        _startAutoRotate(banners.length);
        return Column(
          children: [
            SizedBox(
              height: 92,
              child: PageView.builder(
                controller: _controller,
                itemCount: banners.length,
                onPageChanged: (i) => setState(() => _page = i),
                itemBuilder: (_, i) {
                  final b = banners[i];
                  final colors =
                      _gradients[b['gradient']] ?? _gradients['amber']!;
                  return Container(
                    margin: const EdgeInsets.symmetric(horizontal: 2),
                    padding: const EdgeInsets.symmetric(
                        horizontal: 16, vertical: 12),
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                          colors: colors,
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight),
                      borderRadius: BorderRadius.circular(18),
                    ),
                    child: Row(
                      children: [
                        if ((b['emoji'] ?? '') != '') ...[
                          Text(b['emoji'] as String,
                              style: const TextStyle(fontSize: 28)),
                          const SizedBox(width: 12),
                        ],
                        Expanded(
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                b['title'] ?? '',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: GoogleFonts.manrope(
                                    fontSize: 14,
                                    fontWeight: FontWeight.w800,
                                    color: Colors.white),
                              ),
                              if ((b['subtitle'] ?? '') != '')
                                Text(
                                  b['subtitle'] as String,
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                  style: GoogleFonts.manrope(
                                      fontSize: 11,
                                      color: Colors.white
                                          .withValues(alpha: .85)),
                                ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  );
                },
              ),
            ),
            if (banners.length > 1) ...[
              const SizedBox(height: 6),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: List.generate(banners.length, (i) {
                  final active = i == _page;
                  return AnimatedContainer(
                    duration: const Duration(milliseconds: 200),
                    margin: const EdgeInsets.symmetric(horizontal: 2),
                    width: active ? 16 : 5,
                    height: 5,
                    decoration: BoxDecoration(
                      color: active
                          ? AppColorsBridge.dot
                          : AppColorsBridge.dot.withValues(alpha: .3),
                      borderRadius: BorderRadius.circular(3),
                    ),
                  );
                }),
              ),
            ],
          ],
        );
      },
    );
  }
}

// Tiny bridge to avoid importing the whole theme here.
class AppColorsBridge {
  static const dot = Color(0xFFD97706);
}

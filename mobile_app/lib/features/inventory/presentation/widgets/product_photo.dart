import 'dart:math';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:mobile_app/core/design/bl_widgets.dart';
import 'package:mobile_app/core/supabase/client.dart';
import 'package:supabase_flutter/supabase_flutter.dart' show FileOptions;

/// A product's picture, or its initials on a soft tint when it has none (or
/// the picture cannot be loaded, e.g. offline).
class ProductPicture extends StatelessWidget {
  final String name;
  final String? image;
  final double size;
  final double radius;
  final double fontSize;

  /// Overrides the tint (the sale screen greys out a product with no stock).
  final Color? ground;
  final Color? ink;

  const ProductPicture(
      {super.key,
      required this.name,
      required this.image,
      this.size = 44,
      this.radius = 11,
      this.fontSize = 13,
      this.ground,
      this.ink});

  static const tints = [
    (Color(0xFFFFF3D6), Color(0xFF8A5A00)),
    (Color(0xFFE8F1FF), Color(0xFF1D4E9E)),
    (Color(0xFFE6F6EC), Color(0xFF17663A)),
    (Color(0xFFFDECEC), Color(0xFFA32A2A)),
    (Color(0xFFF1ECFF), Color(0xFF5133A8)),
  ];

  static bool hasPhoto(String? image) =>
      image != null && image.startsWith('http');

  @override
  Widget build(BuildContext context) {
    final (bg, fg) = tints[name.hashCode.abs() % tints.length];
    final initials = Text(BlPartyAvatar.initials(name),
        style: Bl.tight(fontSize, w: FontWeight.w700, ls: 0, c: ink ?? fg));
    // Decode at the size shown, not the size stored: a list of full-size
    // photos is what makes a long product list stutter.
    final px = (size * MediaQuery.devicePixelRatioOf(context)).round();
    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
          color: ground ?? bg, borderRadius: BorderRadius.circular(radius)),
      child: hasPhoto(image)
          ? Image.network(image!,
              width: size,
              height: size,
              cacheWidth: px,
              fit: BoxFit.cover,
              excludeFromSemantics: true,
              // Initials until the picture arrives, so a slow connection
              // shows a labelled tile rather than a blank one.
              frameBuilder: (_, child, frame, sync) =>
                  sync || frame != null ? child : initials,
              errorBuilder: (_, _, _) => initials)
          : initials,
    );
  }
}

/// What the owner chose on the photo sheet.
enum PhotoChoice { camera, gallery, remove }

/// "Take a photo / Choose from gallery / Remove photo".
Future<PhotoChoice?> askPhotoChoice(BuildContext context,
        {required bool canRemove}) =>
    showBlSheet<PhotoChoice>(
      context: context,
      builder: (ctx) {
        Widget row(String label, PhotoChoice c, {Color? color}) => Semantics(
              button: true,
              child: BlTap(
                onTap: () => Navigator.pop(ctx, c),
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 13),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(label,
                            style: Bl.tight(14.5,
                                w: FontWeight.w500, c: color ?? Bl.ink)),
                      ),
                      const BlIcon(BlIcons.chevronRight,
                          size: 16, color: Bl.faint),
                    ],
                  ),
                ),
              ),
            );
        return Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const BlSheetTitle('Product photo', size: 16, divider: true),
            row('Take a photo', PhotoChoice.camera),
            row('Choose from gallery', PhotoChoice.gallery),
            if (canRemove)
              row('Remove photo', PhotoChoice.remove, color: Bl.redDeep),
          ],
        );
      },
    );

/// Take or choose a picture, already shrunk to a thumbnail: at most 256 px on
/// its long side and re-saved as a light JPEG, so a 4 MB camera shot uploads
/// as roughly 10 KB. The biggest place a product photo is shown is about a
/// hundred points across, so nothing larger is ever needed. The web makes the
/// same size (src/lib/imageShrink.js). Null when the owner backs out.
Future<XFile?> pickShrunkPhoto(PhotoChoice choice) => ImagePicker().pickImage(
      source: choice == PhotoChoice.camera
          ? ImageSource.camera
          : ImageSource.gallery,
      maxWidth: 256,
      maxHeight: 256,
      imageQuality: 68,
    );

/// Upload a picked photo and return its public address.
///
/// Stored under `<shop id>/…` in the same `product-images` bucket the web app
/// uses, so a photo added on either shows on both. Throws on failure; the
/// caller says so on screen.
Future<String> uploadProductPhoto(XFile photo, String tenantId) async {
  final bytes = await photo.readAsBytes();
  final lower = photo.name.toLowerCase();
  final png = lower.endsWith('.png');
  final ext = png ? 'png' : 'jpg';
  final path = '$tenantId/${DateTime.now().millisecondsSinceEpoch}-'
      '${Random().nextInt(0x7fffffff).toRadixString(36)}.$ext';
  await supabase.storage.from('product-images').uploadBinary(
        path,
        bytes,
        fileOptions: FileOptions(
            cacheControl: '3600',
            upsert: false,
            contentType: png ? 'image/png' : 'image/jpeg'),
      );
  return supabase.storage.from('product-images').getPublicUrl(path);
}

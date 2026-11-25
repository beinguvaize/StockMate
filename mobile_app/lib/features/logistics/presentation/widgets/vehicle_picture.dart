import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

/// The two kinds of vehicle the fleet screens draw.
enum VehicleKind { van, miniTruck }

/// Anything stored with "truck" in its type is drawn as a mini truck;
/// everything else, including an empty type, is a van.
VehicleKind vehicleKindOf(String? type) =>
    (type ?? '').toUpperCase().contains('TRUCK')
        ? VehicleKind.miniTruck
        : VehicleKind.van;

String vehicleKindLabel(VehicleKind k) =>
    k == VehicleKind.van ? 'Van' : 'Mini truck';

/// What is saved in vehicles.type for each kind.
String vehicleKindValue(VehicleKind k) =>
    k == VehicleKind.van ? 'VAN' : 'MINI_TRUCK';

const _wheels = '''
<circle cx="34" cy="48" r="8.5" fill="#2E343B"/><circle cx="34" cy="48" r="3.6" fill="#D9D8D5"/>
<circle cx="98" cy="48" r="8.5" fill="#2E343B"/><circle cx="98" cy="48" r="3.6" fill="#D9D8D5"/>''';

const _van = '''
<svg viewBox="0 0 128 64" xmlns="http://www.w3.org/2000/svg">
<ellipse cx="66" cy="57.5" rx="54" ry="2.6" fill="#111418" opacity=".08"/>
<path d="M9 47V20a5 5 0 015-5h64c4 0 7.500 1.800 9.800 5l10.200 14 15 3.200c3.300.7 5.500 3.400 5.500 6.800V47z" fill="#FFFFFF" stroke="#C9C8C6" stroke-width="1.6" stroke-linejoin="round"/>
<path d="M72 20h7c2.200 0 4 1 5.300 2.800L92.500 34H72z" fill="#DDE7F3"/>
<path d="M68 16v31M42 16v31" stroke="#E6E5E3" stroke-width="1.4"/>
<path d="M9 40h110" stroke="#EDEDED" stroke-width="1.2"/>
<rect x="60" y="33" width="5" height="2" rx="1" fill="#B7BCC2"/>
<path d="M112.500 40.500h6v4h-6z" fill="#F6D58A"/>
<path d="M112 47h8v3.500h-8zM8 47h6v3.500H8z" fill="#2E343B"/>
$_wheels
</svg>''';

const _miniTruck = '''
<svg viewBox="0 0 128 64" xmlns="http://www.w3.org/2000/svg">
<ellipse cx="66" cy="57.500" rx="54" ry="2.600" fill="#111418" opacity=".08"/>
<path d="M8 28h64v19H8z" fill="#F09935"/>
<path d="M8 28h64M8 34h64" stroke="#D97F1E" stroke-width="1.400"/>
<path d="M24 28v19M40 28v19M56 28v19" stroke="#E08A26" stroke-width="1.200"/>
<path d="M72 47V16a4 4 0 014-4h17c3.500 0 6.500 1.700 8.300 4.700l7.700 13.300 8 2.600c2.700.9 4.500 3.300 4.500 6.200V47z" fill="#F09935" stroke="#D97F1E" stroke-width="1.400" stroke-linejoin="round"/>
<path d="M78 17h14c2 0 3.700 1 4.700 2.700L103 30H78z" fill="#DDE7F3"/>
<rect x="80" y="34" width="5" height="2" rx="1" fill="#B8690F"/>
<path d="M113.500 37.500h6v4h-6z" fill="#FFF3D6"/>
<path d="M112 47h9v3.500h-9zM6 47h6v3.500H6z" fill="#2E343B"/>
$_wheels
</svg>''';

/// A drawn side view of a van or a mini truck.
///
/// Drawn rather than photographed on purpose: the canvas used manufacturer
/// photos with a badge on the grille as stand-ins, and plain pictures are
/// still to come from the owner. When they do, this is the one place to swap
/// them in.
class VehiclePicture extends StatelessWidget {
  final VehicleKind kind;
  final double width;
  final double opacity;
  const VehiclePicture(this.kind,
      {super.key, this.width = 128, this.opacity = 1});

  @override
  Widget build(BuildContext context) => ExcludeSemantics(
        child: Opacity(
          opacity: opacity,
          child: SvgPicture.string(
            kind == VehicleKind.van ? _van : _miniTruck,
            width: width,
            height: width / 2,
          ),
        ),
      );
}

/// The picture rolling in from the left, for the vehicle detail sheet.
class VehiclePictureArrive extends StatelessWidget {
  final VehicleKind kind;
  final double width;
  const VehiclePictureArrive(this.kind, {super.key, this.width = 202});

  @override
  Widget build(BuildContext context) {
    if (MediaQuery.maybeDisableAnimationsOf(context) == true) {
      return VehiclePicture(kind, width: width);
    }
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: 1),
      duration: const Duration(milliseconds: 520),
      curve: const Cubic(0.23, 1, 0.32, 1),
      builder: (_, t, child) => Opacity(
        opacity: t.clamp(0.0, 1.0),
        child: Transform.translate(
            offset: Offset(-56 * (1 - t), 0), child: child),
      ),
      child: VehiclePicture(kind, width: width),
    );
  }
}

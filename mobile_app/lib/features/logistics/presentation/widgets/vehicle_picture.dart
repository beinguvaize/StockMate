import 'package:flutter/material.dart';
import 'package:mobile_app/core/design/bl_widgets.dart';

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

String _photo(VehicleKind k) => k == VehicleKind.van
    ? 'assets/images/vehicles/vehicle-van.jpg'
    : 'assets/images/vehicles/vehicle-mini-truck.jpg';

String _clip(VehicleKind k) => k == VehicleKind.van
    ? 'assets/images/vehicles/vehicle-van-anim.webp'
    : 'assets/images/vehicles/vehicle-mini-truck-anim.webp';

/// The owner's photo of a van or a mini truck (from mockups/vehicles).
///
/// The photos sit on white. [ground] is the colour of whatever is behind the
/// picture; the photo is multiplied onto it so its white disappears into the
/// card instead of showing as a box.
class VehiclePicture extends StatelessWidget {
  final VehicleKind kind;
  final double width;
  final double opacity;
  final Color ground;
  const VehiclePicture(this.kind,
      {super.key, this.width = 128, this.opacity = 1, this.ground = Bl.tile});

  @override
  Widget build(BuildContext context) => ExcludeSemantics(
        child: Opacity(
          opacity: opacity,
          child: Image.asset(
            _photo(kind),
            width: width,
            height: width / 2,
            fit: BoxFit.contain,
            color: ground,
            colorBlendMode: BlendMode.multiply,
            filterQuality: FilterQuality.medium,
          ),
        ),
      );
}

/// The moving picture on the vehicle detail sheet, which is white. Shows the
/// still photo instead when the phone asks for less motion.
class VehiclePictureArrive extends StatelessWidget {
  final VehicleKind kind;
  final double width;
  const VehiclePictureArrive(this.kind, {super.key, this.width = 202});

  @override
  Widget build(BuildContext context) {
    if (MediaQuery.maybeDisableAnimationsOf(context) == true) {
      return VehiclePicture(kind, width: width, ground: Bl.white);
    }
    return ExcludeSemantics(
      child: Image.asset(
        _clip(kind),
        width: width,
        height: width * 110 / 202,
        fit: BoxFit.contain,
        gaplessPlayback: true,
      ),
    );
  }
}

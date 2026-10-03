import 'package:doorstep_core/doorstep_core.dart';
import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:provider/provider.dart';

/// Pin-drop picker: the pin stays in the centre while the user pans the map.
class MapPinPicker extends StatefulWidget {
  const MapPinPicker({super.key, required this.initial, required this.onChanged, this.height = 280});

  final LatLng initial;
  final ValueChanged<LatLng> onChanged;
  final double height;

  @override
  State<MapPinPicker> createState() => _MapPinPickerState();
}

class _MapPinPickerState extends State<MapPinPicker> {
  GoogleMapController? _controller;
  late LatLng _center = widget.initial;
  bool _locating = false;

  Future<void> _useMyLocation() async {
    setState(() => _locating = true);
    try {
      final position = await currentPosition();
      final target = LatLng(position.latitude, position.longitude);
      await _controller?.animateCamera(CameraUpdate.newLatLngZoom(target, 17));
      _center = target;
      widget.onChanged(target);
    } catch (e) {
      if (mounted) showSnack(context, e is LocationException ? e.message : 'Could not get your location', error: true);
    } finally {
      if (mounted) setState(() => _locating = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final lowData = context.watch<AppSettings>().lowDataMode;
    return ClipRRect(
      borderRadius: BorderRadius.circular(18),
      child: SizedBox(
        height: widget.height,
        child: Stack(
          alignment: Alignment.center,
          children: [
            GoogleMap(
              initialCameraPosition: CameraPosition(target: widget.initial, zoom: 16),
              onMapCreated: (c) => _controller = c,
              onCameraMove: (pos) => _center = pos.target,
              onCameraIdle: () => widget.onChanged(_center),
              myLocationButtonEnabled: false,
              zoomControlsEnabled: false,
              mapToolbarEnabled: false,
              liteModeEnabled: false,
              buildingsEnabled: !lowData,
            ),
            const IgnorePointer(
              child: Padding(
                padding: EdgeInsets.only(bottom: 36),
                child: Icon(Icons.location_on_rounded, size: 48, color: DsColors.red),
              ),
            ),
            Positioned(
              right: 12,
              bottom: 12,
              child: FloatingActionButton.small(
                heroTag: null,
                backgroundColor: DsColors.white,
                foregroundColor: DsColors.orange,
                onPressed: _locating ? null : _useMyLocation,
                child: _locating
                    ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                    : const Icon(Icons.my_location_rounded),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class LocationException implements Exception {
  LocationException(this.message);
  final String message;
}

/// Current GPS position with friendly permission errors.
Future<Position> currentPosition() async {
  if (!await Geolocator.isLocationServiceEnabled()) {
    throw LocationException('Turn on location (GPS) and try again.');
  }
  var permission = await Geolocator.checkPermission();
  if (permission == LocationPermission.denied) permission = await Geolocator.requestPermission();
  if (permission == LocationPermission.denied) throw LocationException('Location permission is needed to find you.');
  if (permission == LocationPermission.deniedForever) {
    throw LocationException('Location is blocked. Enable it for DoorStep in your phone settings.');
  }
  return Geolocator.getCurrentPosition(locationSettings: const LocationSettings(accuracy: LocationAccuracy.high, timeLimit: Duration(seconds: 15)));
}

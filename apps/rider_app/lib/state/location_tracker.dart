import 'dart:async';

import 'package:doorstep_core/doorstep_core.dart';
import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';

class LocationPermissionException implements Exception {
  LocationPermissionException(this.message);
  final String message;
  @override
  String toString() => message;
}

/// Streams the rider's GPS position to the API while online: over Socket.IO
/// when connected, otherwise via REST. The send rate follows low-data mode.
class LocationTracker extends ChangeNotifier {
  LocationTracker({required this.api, required this.socket, required this.settings});

  final ApiClient api;
  final SocketService socket;
  final AppSettings settings;

  StreamSubscription<Position>? _sub;
  Position? _last;
  DateTime _lastSent = DateTime.fromMillisecondsSinceEpoch(0);

  Position? get last => _last;
  bool get isTracking => _sub != null;

  /// Asks for permission (throws [LocationPermissionException] with a friendly message).
  static Future<void> ensurePermission() async {
    if (!await Geolocator.isLocationServiceEnabled()) {
      throw LocationPermissionException('Turn on location (GPS) to go online.');
    }
    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) permission = await Geolocator.requestPermission();
    if (permission == LocationPermission.denied) {
      throw LocationPermissionException('DoorStep needs your location to send you nearby deliveries.');
    }
    if (permission == LocationPermission.deniedForever) {
      throw LocationPermissionException('Location is blocked. Enable it for DoorStep Rider in your phone settings.');
    }
  }

  Future<Position> currentPosition() async {
    await ensurePermission();
    final p = await Geolocator.getCurrentPosition(
      locationSettings: const LocationSettings(accuracy: LocationAccuracy.high, timeLimit: Duration(seconds: 20)),
    );
    _last = p;
    return p;
  }

  LocationSettings _settings() {
    const distanceFilter = 10;
    if (defaultTargetPlatform == TargetPlatform.android) {
      return AndroidSettings(
        accuracy: LocationAccuracy.high,
        distanceFilter: distanceFilter,
        intervalDuration: settings.locationInterval,
        foregroundNotificationConfig: const ForegroundNotificationConfig(
          notificationTitle: 'DoorStep Rider is online',
          notificationText: 'Sharing your location so we can send you deliveries.',
          notificationChannelName: 'Rider location',
          enableWakeLock: true,
          setOngoing: true,
        ),
      );
    }
    if (defaultTargetPlatform == TargetPlatform.iOS) {
      return AppleSettings(
        accuracy: LocationAccuracy.high,
        distanceFilter: distanceFilter,
        activityType: ActivityType.automotiveNavigation,
        allowBackgroundLocationUpdates: true,
        showBackgroundLocationIndicator: true,
      );
    }
    return const LocationSettings(accuracy: LocationAccuracy.high, distanceFilter: distanceFilter);
  }

  Future<void> start() async {
    if (_sub != null) return;
    await ensurePermission();
    _sub = Geolocator.getPositionStream(locationSettings: _settings()).listen(
      _onPosition,
      onError: (Object e) => debugPrint('Location stream error: $e'),
    );
    notifyListeners();
  }

  Future<void> stop() async {
    await _sub?.cancel();
    _sub = null;
    notifyListeners();
  }

  Future<void> _onPosition(Position p) async {
    _last = p;
    final now = DateTime.now();
    if (now.difference(_lastSent) < settings.locationInterval) return;
    _lastSent = now;
    final payload = {
      'lat': p.latitude,
      'lng': p.longitude,
      if (p.heading >= 0 && p.heading <= 360) 'heading': p.heading,
      if (p.speed >= 0 && p.speed <= 100) 'speed': p.speed,
    };
    if (!socket.emit('rider:location', payload)) {
      try {
        await api.post('/rider/location', body: payload);
      } catch (_) {
        // Offline: the next position will try again.
      }
    }
  }

  @override
  void dispose() {
    _sub?.cancel();
    super.dispose();
  }
}

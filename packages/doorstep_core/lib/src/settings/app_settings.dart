import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Device-level preferences.
class AppSettings extends ChangeNotifier {
  static const _lowDataKey = 'ds_low_data_mode';

  bool _lowDataMode = false;

  /// Low-data mode: small compressed images, lite maps and slower polling.
  bool get lowDataMode => _lowDataMode;

  /// Polling interval for screens that poll when live updates are unavailable.
  Duration get pollInterval => _lowDataMode ? const Duration(seconds: 30) : const Duration(seconds: 10);

  /// How often the rider app sends GPS updates.
  Duration get locationInterval => _lowDataMode ? const Duration(seconds: 15) : const Duration(seconds: 5);

  Future<void> load() async {
    final prefs = await SharedPreferences.getInstance();
    _lowDataMode = prefs.getBool(_lowDataKey) ?? false;
    notifyListeners();
  }

  Future<void> setLowDataMode(bool value) async {
    _lowDataMode = value;
    notifyListeners();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_lowDataKey, value);
  }
}

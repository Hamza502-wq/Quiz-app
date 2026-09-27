import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';

import '../api/api_client.dart';
import '../config.dart';

/// Firebase Cloud Messaging. Disabled (no-op) unless the FIREBASE_* dart-defines
/// are provided — the backend then falls back to SMS/WhatsApp for important updates.
class PushService {
  PushService(this.api);

  final ApiClient api;
  String? _token;
  bool _initialised = false;

  /// Shows foreground messages in-app (e.g. a SnackBar).
  void Function(String title, String body, Map<String, dynamic> data)? onForegroundMessage;

  /// Called when the user taps a notification (data contains e.g. orderId).
  void Function(Map<String, dynamic> data)? onOpened;

  Future<void> init() async {
    if (!AppConfig.firebaseEnabled || _initialised) return;
    try {
      await Firebase.initializeApp(
        options: const FirebaseOptions(
          apiKey: AppConfig.firebaseApiKey,
          appId: AppConfig.firebaseAppId,
          messagingSenderId: AppConfig.firebaseMessagingSenderId,
          projectId: AppConfig.firebaseProjectId,
        ),
      );
      _initialised = true;
      FirebaseMessaging.onMessage.listen((message) {
        final n = message.notification;
        if (n != null) onForegroundMessage?.call(n.title ?? 'DoorStep', n.body ?? '', message.data);
      });
      FirebaseMessaging.onMessageOpenedApp.listen((m) => onOpened?.call(m.data));
      final initial = await FirebaseMessaging.instance.getInitialMessage();
      if (initial != null) onOpened?.call(initial.data);
      FirebaseMessaging.instance.onTokenRefresh.listen((t) => _register(t));
    } catch (e) {
      debugPrint('Push init failed: $e');
    }
  }

  /// Requests permission and registers this device with the API (after sign-in).
  Future<void> registerDevice() async {
    if (!_initialised) return;
    try {
      final settings = await FirebaseMessaging.instance.requestPermission();
      if (settings.authorizationStatus == AuthorizationStatus.denied) return;
      final token = await FirebaseMessaging.instance.getToken();
      if (token != null) await _register(token);
    } catch (e) {
      debugPrint('Push registration failed: $e');
    }
  }

  Future<void> unregisterDevice() async {
    final token = _token;
    if (token == null) return;
    await api.delete('/notifications/device-tokens', body: {'token': token});
    _token = null;
  }

  Future<void> _register(String token) async {
    _token = token;
    await api.post('/notifications/device-tokens', body: {
      'token': token,
      'platform': defaultTargetPlatform == TargetPlatform.iOS ? 'ios' : 'android',
    });
  }
}

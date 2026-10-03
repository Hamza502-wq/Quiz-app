import 'package:flutter/foundation.dart';

/// Build-time configuration, supplied with `--dart-define` (or
/// `--dart-define-from-file=config/dev.json`).
class AppConfig {
  AppConfig._();

  static const String _apiUrlDefine = String.fromEnvironment('API_URL');

  /// Base URL of the DoorStep API. Without API_URL, the web build uses the
  /// site it is served from (the API shares the domain) and mobile builds reach
  /// a backend running on the host machine from the Android emulator.
  static String get apiUrl {
    if (_apiUrlDefine.isNotEmpty) return _apiUrlDefine;
    if (kIsWeb) return Uri.base.origin;
    return 'http://10.0.2.2:4000';
  }

  /// Live updates over Socket.IO. Set REALTIME=false where the API can't hold
  /// socket connections (serverless hosting); the apps then poll instead.
  static const bool realtime = bool.fromEnvironment('REALTIME', defaultValue: true);

  /// Sign-in with SMS codes. Set SMS_SIGN_IN=false until an SMS provider is
  /// connected; accounts then sign up and sign in with a password.
  static const bool smsSignIn = bool.fromEnvironment('SMS_SIGN_IN', defaultValue: true);

  // Firebase Cloud Messaging (optional). Push is disabled when these are empty
  // and notifications fall back to in-app + SMS/WhatsApp.
  static const String firebaseApiKey = String.fromEnvironment('FIREBASE_API_KEY');
  static const String firebaseAppId = String.fromEnvironment('FIREBASE_APP_ID');
  static const String firebaseMessagingSenderId = String.fromEnvironment('FIREBASE_MESSAGING_SENDER_ID');
  static const String firebaseProjectId = String.fromEnvironment('FIREBASE_PROJECT_ID');

  static bool get firebaseEnabled =>
      firebaseApiKey.isNotEmpty && firebaseAppId.isNotEmpty && firebaseMessagingSenderId.isNotEmpty && firebaseProjectId.isNotEmpty;

  /// Harare CBD — default map position.
  static const double defaultLat = -17.8292;
  static const double defaultLng = 31.0522;
}

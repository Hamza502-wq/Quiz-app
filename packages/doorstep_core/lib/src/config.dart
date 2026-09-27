/// Build-time configuration, supplied with `--dart-define` (or
/// `--dart-define-from-file=config/dev.json`).
class AppConfig {
  AppConfig._();

  /// Base URL of the DoorStep API. The default reaches a backend running on the
  /// host machine from the Android emulator.
  static const String apiUrl = String.fromEnvironment('API_URL', defaultValue: 'http://10.0.2.2:4000');

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

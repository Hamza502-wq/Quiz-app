import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Persists the access/refresh token pair in the platform keystore.
class TokenStore {
  TokenStore([FlutterSecureStorage? storage]) : _storage = storage ?? const FlutterSecureStorage();

  static const _accessKey = 'ds_access_token';
  static const _refreshKey = 'ds_refresh_token';

  final FlutterSecureStorage _storage;
  String? _access;
  String? _refresh;

  String? get accessToken => _access;
  String? get refreshToken => _refresh;
  bool get hasSession => _refresh != null;

  Future<void> load() async {
    _access = await _storage.read(key: _accessKey);
    _refresh = await _storage.read(key: _refreshKey);
  }

  Future<void> save(String access, String refresh) async {
    _access = access;
    _refresh = refresh;
    await _storage.write(key: _accessKey, value: access);
    await _storage.write(key: _refreshKey, value: refresh);
  }

  Future<void> clear() async {
    _access = null;
    _refresh = null;
    await _storage.delete(key: _accessKey);
    await _storage.delete(key: _refreshKey);
  }
}

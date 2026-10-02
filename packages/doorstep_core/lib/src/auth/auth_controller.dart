import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../api/api_client.dart';
import '../api/api_exception.dart';
import '../models/models.dart';

enum AuthStatus { unknown, signedOut, signedIn }

class OtpRequestResult {
  OtpRequestResult({required this.expiresInSec, this.devCode});
  final int expiresInSec;
  final String? devCode;
}

/// Session state for one app role (CUSTOMER or RIDER).
///
/// The last profile is cached so the app opens offline; it is refreshed from
/// the API whenever a connection is available.
class AuthController extends ChangeNotifier {
  AuthController({required this.api, required this.role}) {
    api.onSessionExpired = _onExpired;
  }

  final ApiClient api;
  final String role;

  static const _profileKey = 'ds_cached_profile';

  AuthStatus _status = AuthStatus.unknown;
  Profile? _profile;

  AuthStatus get status => _status;
  Profile? get profile => _profile;
  bool get isSignedIn => _status == AuthStatus.signedIn;

  /// Hooks run after sign-in and before sign-out (push token registration etc).
  final List<Future<void> Function()> _onSignIn = [];
  final List<Future<void> Function()> _onSignOut = [];
  void addSignInHook(Future<void> Function() hook) => _onSignIn.add(hook);
  void addSignOutHook(Future<void> Function() hook) => _onSignOut.add(hook);

  Future<void> init() async {
    await api.tokens.load();
    if (!api.tokens.hasSession) {
      _set(AuthStatus.signedOut, null);
      return;
    }
    final prefs = await SharedPreferences.getInstance();
    final cached = prefs.getString(_profileKey);
    if (cached != null) {
      try {
        _profile = Profile.fromJson(jsonDecode(cached) as Map<String, dynamic>);
      } catch (_) {
        _profile = null;
      }
    }
    try {
      await refreshProfile();
      _set(AuthStatus.signedIn, _profile);
      _runHooks(_onSignIn);
    } on ApiException catch (e) {
      if (e.isNetwork && _profile != null) {
        // Offline start with the cached profile; sockets reconnect when the network returns.
        _set(AuthStatus.signedIn, _profile);
        _runHooks(_onSignIn);
      } else {
        await api.tokens.clear();
        _set(AuthStatus.signedOut, null);
      }
    } catch (_) {
      await api.tokens.clear();
      _set(AuthStatus.signedOut, null);
    }
  }

  Future<OtpRequestResult> requestOtp(String phone) async {
    final data = await api.post('/auth/otp/request', body: {'phone': phone}, auth: false) as Map<String, dynamic>;
    return OtpRequestResult(expiresInSec: (data['expiresInSec'] as num).toInt(), devCode: data['devCode'] as String?);
  }

  Future<void> verifyOtp(String phone, String code, {String? name}) async {
    final data = await api.post(
      '/auth/otp/verify',
      body: {'phone': phone, 'code': code, 'role': role, if (name != null && name.isNotEmpty) 'name': name},
      auth: false,
    ) as Map<String, dynamic>;
    await _acceptSession(data);
  }

  /// Signs in with phone number and password (signing in to this app adds its role).
  Future<void> loginWithPassword(String phone, String password) async {
    final data = await api.post(
      '/auth/login',
      body: {'phone': phone, 'password': password, 'role': role},
      auth: false,
    ) as Map<String, dynamic>;
    await _acceptSession(data);
  }

  /// Creates a password account for this app's role.
  Future<void> register({required String name, required String phone, required String password}) async {
    final data = await api.post(
      '/auth/register',
      body: {'name': name, 'phone': phone, 'password': password, 'role': role},
      auth: false,
    ) as Map<String, dynamic>;
    await _acceptSession(data);
  }

  Future<void> _acceptSession(Map<String, dynamic> data) async {
    await api.tokens.save(data['accessToken'] as String, data['refreshToken'] as String);
    final profile = Profile.fromJson(data['user'] as Map<String, dynamic>);
    await _cache(profile);
    _set(AuthStatus.signedIn, profile);
    _runHooks(_onSignIn);
  }

  Future<Profile> refreshProfile() async {
    final data = await api.get('/auth/me') as Map<String, dynamic>;
    final profile = Profile.fromJson(data);
    await _cache(profile);
    _profile = profile;
    notifyListeners();
    return profile;
  }

  Future<Profile> updateProfile(Map<String, dynamic> patch) async {
    final data = await api.patch('/auth/me', body: patch) as Map<String, dynamic>;
    final profile = Profile.fromJson(data);
    await _cache(profile);
    _set(_status, profile);
    return profile;
  }

  Future<void> logout() async {
    for (final hook in _onSignOut) {
      try {
        await hook();
      } catch (_) {}
    }
    final refresh = api.tokens.refreshToken;
    if (refresh != null) {
      try {
        await api.post('/auth/logout', body: {'refreshToken': refresh}, auth: false);
      } catch (_) {
        // Offline: the token expires on its own.
      }
    }
    await _clearLocal();
  }

  Future<void> _clearLocal() async {
    await api.tokens.clear();
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_profileKey);
    _set(AuthStatus.signedOut, null);
  }

  void _onExpired() {
    if (_status == AuthStatus.signedIn) _clearLocal();
  }

  Future<void> _cache(Profile p) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_profileKey, jsonEncode(p.toJson()));
  }

  void _runHooks(List<Future<void> Function()> hooks) {
    for (final hook in hooks) {
      hook().catchError((Object e) => debugPrint('Auth hook failed: $e'));
    }
  }

  void _set(AuthStatus status, Profile? profile) {
    _status = status;
    _profile = profile;
    notifyListeners();
  }
}

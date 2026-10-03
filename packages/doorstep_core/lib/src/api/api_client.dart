import 'dart:async';
import 'dart:typed_data';

import 'package:dio/dio.dart';

import '../config.dart';
import 'api_exception.dart';
import 'token_store.dart';

class UploadResult {
  UploadResult({required this.url, required this.thumbUrl});
  final String url;
  final String thumbUrl;
}

/// HTTP client for the DoorStep API.
///
/// Adds the bearer token, transparently rotates the refresh token on 401 (one
/// refresh at a time) and maps every failure to an [ApiException].
class ApiClient {
  ApiClient({required this.tokens, String? baseUrl})
      : baseUrl = (baseUrl ?? AppConfig.apiUrl).replaceAll(RegExp(r'/+$'), ''),
        _dio = Dio() {
    _dio.options = BaseOptions(
      baseUrl: '${this.baseUrl}/api/v1',
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 30),
      sendTimeout: const Duration(seconds: 60),
      headers: {'Accept': 'application/json'},
    );
    _dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) {
          final token = tokens.accessToken;
          if (token != null && options.extra['auth'] != false) {
            options.headers['Authorization'] = 'Bearer $token';
          }
          handler.next(options);
        },
        onError: (error, handler) async {
          final response = error.response;
          final options = error.requestOptions;
          final canRefresh = response?.statusCode == 401 &&
              options.extra['auth'] != false &&
              options.extra['retried'] != true &&
              tokens.refreshToken != null;
          if (!canRefresh) return handler.next(error);
          final refreshed = await refreshSession();
          if (!refreshed) return handler.next(error);
          try {
            options.extra['retried'] = true;
            options.headers['Authorization'] = 'Bearer ${tokens.accessToken}';
            handler.resolve(await _dio.fetch<dynamic>(options));
          } on DioException catch (e) {
            handler.next(e);
          }
        },
      ),
    );
  }

  final String baseUrl;
  final TokenStore tokens;
  final Dio _dio;
  Completer<bool>? _refreshing;

  /// Called when the refresh token is rejected — the user must log in again.
  void Function()? onSessionExpired;

  /// Rotates the token pair. Concurrent callers share a single request.
  Future<bool> refreshSession() {
    final inflight = _refreshing;
    if (inflight != null) return inflight.future;
    final completer = Completer<bool>();
    _refreshing = completer;
    () async {
      final refresh = tokens.refreshToken;
      if (refresh == null) return false;
      try {
        final res = await _dio.post<Map<String, dynamic>>(
          '/auth/refresh',
          data: {'refreshToken': refresh},
          options: Options(extra: {'auth': false}),
        );
        final body = res.data!;
        await tokens.save(body['accessToken'] as String, body['refreshToken'] as String);
        return true;
      } on DioException catch (e) {
        final status = e.response?.statusCode;
        if (status == 401 || status == 403) {
          await tokens.clear();
          onSessionExpired?.call();
        }
        return false;
      }
    }()
        .then(completer.complete, onError: (Object _) => completer.complete(false))
        .whenComplete(() => _refreshing = null);
    return completer.future;
  }

  Future<dynamic> get(String path, {Map<String, dynamic>? query}) =>
      _send(() => _dio.get<dynamic>(path, queryParameters: _clean(query)));

  Future<dynamic> post(String path, {Object? body, bool auth = true}) =>
      _send(() => _dio.post<dynamic>(path, data: body ?? const <String, dynamic>{}, options: Options(extra: {'auth': auth})));

  Future<dynamic> patch(String path, {Object? body}) => _send(() => _dio.patch<dynamic>(path, data: body));

  Future<dynamic> put(String path, {Object? body}) => _send(() => _dio.put<dynamic>(path, data: body));

  Future<dynamic> delete(String path, {Object? body}) => _send(() => _dio.delete<dynamic>(path, data: body));

  /// Uploads an image. `kind`: product | vendor | avatar | document | proof.
  /// Takes bytes so it works on the web as well as on phones.
  Future<UploadResult> uploadImage(Uint8List bytes, String filename, String kind, {String? mimeType}) async {
    final type = mimeType ?? _imageMimeType(filename);
    final form = FormData.fromMap({'file': MultipartFile.fromBytes(bytes, filename: filename, contentType: DioMediaType.parse(type))});
    final data = await _send(() => _dio.post<dynamic>('/uploads', data: form, queryParameters: {'kind': kind}));
    final map = data as Map<String, dynamic>;
    return UploadResult(url: map['url'] as String, thumbUrl: map['thumbUrl'] as String);
  }

  static String _imageMimeType(String filename) {
    final ext = filename.contains('.') ? filename.split('.').last.toLowerCase() : '';
    switch (ext) {
      case 'png':
        return 'image/png';
      case 'webp':
        return 'image/webp';
      case 'heic':
        return 'image/heic';
      case 'heif':
        return 'image/heif';
      default:
        return 'image/jpeg';
    }
  }

  /// Headers for loading private images (delivery proof, documents).
  Map<String, String> get authHeaders {
    final token = tokens.accessToken;
    return token == null ? const {} : {'Authorization': 'Bearer $token'};
  }

  Map<String, dynamic>? _clean(Map<String, dynamic>? query) {
    if (query == null) return null;
    return Map.fromEntries(query.entries.where((e) => e.value != null && e.value != ''));
  }

  Future<dynamic> _send(Future<Response<dynamic>> Function() request) async {
    try {
      final res = await request();
      return res.data;
    } on DioException catch (e) {
      throw _map(e);
    }
  }

  ApiException _map(DioException e) {
    final response = e.response;
    if (response == null) {
      final timeout = e.type == DioExceptionType.connectionTimeout ||
          e.type == DioExceptionType.receiveTimeout ||
          e.type == DioExceptionType.sendTimeout;
      return ApiException(
        timeout
            ? 'The connection is slow. Please check your network and try again.'
            : 'No internet connection. Check your data or Wi-Fi and try again.',
      );
    }
    final data = response.data;
    var message = 'Something went wrong (${response.statusCode}). Please try again.';
    var code = 'ERROR';
    if (data is Map && data['error'] is Map) {
      final err = data['error'] as Map;
      message = (err['message'] as String?) ?? message;
      code = (err['code'] as String?) ?? code;
      final details = err['details'];
      if (code == 'VALIDATION_ERROR' && details is List && details.isNotEmpty && details.first is Map) {
        final first = details.first as Map;
        final detail = first['message'] as String?;
        if (detail != null) message = detail;
      }
    }
    return ApiException(message, statusCode: response.statusCode ?? 0, code: code);
  }
}

/// Error returned by the DoorStep API (or a network failure), with a message
/// that is safe to show to users.
class ApiException implements Exception {
  ApiException(this.message, {this.statusCode = 0, this.code = 'ERROR'});

  final String message;
  final int statusCode;
  final String code;

  bool get isNetwork => statusCode == 0;
  bool get isUnauthorized => statusCode == 401;
  bool get isNotFound => statusCode == 404;

  @override
  String toString() => message;
}

/// Converts any thrown object into a user-facing message.
String errorMessage(Object error) {
  if (error is ApiException) return error.message;
  return 'Something went wrong. Please try again.';
}

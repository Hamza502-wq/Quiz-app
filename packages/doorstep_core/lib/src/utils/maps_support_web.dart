import 'dart:js_interop';
import 'dart:js_interop_unsafe';

/// True once the Maps JavaScript API script has loaded on the page.
bool get googleMapsAvailable {
  final google = globalContext['google'];
  if (google == null || google.isUndefinedOrNull) return false;
  return (google as JSObject).has('maps');
}

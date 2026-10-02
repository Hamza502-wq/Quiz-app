// Whether the Google Maps SDK is available. Phones always have it (the key is
// in the app manifest); the web build only loads the Maps script when a key is
// configured for the site.
export 'maps_support_stub.dart' if (dart.library.js_interop) 'maps_support_web.dart';

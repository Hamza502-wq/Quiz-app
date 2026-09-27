# DoorStep customer app

Flutter app for ordering food, groceries and pharmacy items, sending parcels, paying with EcoCash/OneMoney/card/cash and tracking riders live. Shared code lives in [`packages/doorstep_core`](../../packages/doorstep_core).

```bash
flutter pub get
flutter run                                             # Android emulator → API at http://10.0.2.2:4000
flutter run --dart-define=API_URL=http://192.168.1.10:4000   # physical device on your LAN
flutter run --dart-define-from-file=config/dev.json     # copy config/dev.example.json first
flutter test
flutter build apk --release --dart-define=API_URL=https://api.doorstep.example
```

* **Google Maps:** add `MAPS_API_KEY=...` to `android/local.properties`; for iOS create `ios/Flutter/Secrets.xcconfig` with `GOOGLE_MAPS_API_KEY = ...`.
* **Push notifications (optional):** pass the `FIREBASE_*` dart-defines. Without them the app uses in-app notifications and the backend falls back to SMS/WhatsApp.
* **Release signing:** create `android/key.properties` (`storeFile`, `storePassword`, `keyAlias`, `keyPassword`).
* App ID: `zw.co.doorstep.customer`. Icons are generated from `brand/` with `dart run flutter_launcher_icons`.

Structure: `lib/state` (cart, addresses), `lib/screens` (home, vendor, checkout & payment, orders & tracking, parcel, address, profile), `lib/widgets`.

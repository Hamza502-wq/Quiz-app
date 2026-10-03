# DoorStep rider app

Flutter app for riders: registration with ID/licence/vehicle documents, online/offline with background location, delivery requests with countdown, navigation, customer call/chat, status updates, proof of delivery (PIN or photo), wallet with cash-owed tracking, and payouts. Shared code lives in [`packages/doorstep_core`](../../packages/doorstep_core).

```bash
flutter pub get
flutter run                                             # Android emulator → API at http://10.0.2.2:4000
flutter run --dart-define=API_URL=http://192.168.1.10:4000
flutter test
flutter build apk --release --dart-define=API_URL=https://api.doorstep.example
```

* **Location:** while online the app streams GPS through an Android foreground service ("DoorStep Rider is online" notification) so tracking continues with the screen off. iOS uses background location updates (`UIBackgroundModes: location`).
* **Google Maps / Firebase / signing:** same setup as the customer app (`android/local.properties` → `MAPS_API_KEY`, `ios/Flutter/Secrets.xcconfig` → `GOOGLE_MAPS_API_KEY`, `FIREBASE_*` dart-defines, `android/key.properties`).
* App ID: `zw.co.doorstep.rider`.

Structure: `lib/state` (rider session, location tracker), `lib/screens` (registration, pending, home + offer sheet, delivery, proof, earnings, payouts, profile).

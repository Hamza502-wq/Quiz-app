# doorstep_core

Shared Flutter package used by the customer and rider apps:

* `ApiClient` (Dio) with bearer auth, single-flight refresh-token rotation and friendly `ApiException` messages
* `TokenStore` (secure storage), `AuthController` (phone + OTP sign-in, cached profile for offline start)
* `SocketService` (Socket.IO with token refresh and room re-subscription), `PushService` (optional FCM)
* Models for every API response, money/date formatting (USD & ZiG)
* DoorStep theme (Poppins bundled), brand widgets, loading/error/empty states, `AsyncView`, low-data images
* Shared screens: splash, phone login, order chat, notifications

```bash
flutter test                                                        # unit tests
DOORSTEP_API_URL=http://localhost:4000 flutter test test/api_contract_test.dart   # against a live, seeded API
```

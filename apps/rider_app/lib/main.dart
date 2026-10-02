import 'package:doorstep_core/doorstep_core.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'app.dart';
import 'state/location_tracker.dart';
import 'state/rider_controller.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  final settings = AppSettings();
  await settings.load();
  final api = ApiClient(tokens: TokenStore());
  final auth = AuthController(api: api, role: 'RIDER');
  final socket = SocketService(api);
  final push = PushService(api);
  final tracker = LocationTracker(api: api, socket: socket, settings: settings);
  final rider = RiderController(api: api, socket: socket, tracker: tracker);
  await push.init();

  auth.addSignInHook(() async {
    socket.connect();
    rider.startPolling();
    await rider.refresh();
    await push.registerDevice();
  });
  auth.addSignOutHook(() async {
    rider.stopPolling();
    await rider.goOfflineQuietly();
    await push.unregisterDevice();
    socket.disconnect();
    rider.reset();
  });

  runApp(
    MultiProvider(
      providers: [
        ChangeNotifierProvider.value(value: settings),
        Provider.value(value: api),
        ChangeNotifierProvider.value(value: auth),
        ChangeNotifierProvider.value(value: socket),
        Provider.value(value: push),
        ChangeNotifierProvider.value(value: tracker),
        ChangeNotifierProvider.value(value: rider),
      ],
      child: const RiderApp(),
    ),
  );

  await auth.init();
}

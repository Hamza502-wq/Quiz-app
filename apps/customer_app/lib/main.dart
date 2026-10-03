import 'package:doorstep_core/doorstep_core.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'app.dart';
import 'state/address_controller.dart';
import 'state/cart_controller.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  final settings = AppSettings();
  await settings.load();
  final api = ApiClient(tokens: TokenStore());
  final auth = AuthController(api: api, role: 'CUSTOMER');
  final socket = SocketService(api);
  final push = PushService(api);
  final cart = CartController();
  await cart.load();
  final addresses = AddressController(api);
  await push.init();

  auth.addSignInHook(() async {
    socket.connect();
    await addresses.load();
    await push.registerDevice();
  });
  auth.addSignOutHook(() async {
    await push.unregisterDevice();
    socket.disconnect();
    await cart.clear();
    addresses.reset();
  });

  runApp(
    MultiProvider(
      providers: [
        ChangeNotifierProvider.value(value: settings),
        Provider.value(value: api),
        ChangeNotifierProvider.value(value: auth),
        ChangeNotifierProvider.value(value: socket),
        Provider.value(value: push),
        ChangeNotifierProvider.value(value: cart),
        ChangeNotifierProvider.value(value: addresses),
      ],
      child: const CustomerApp(),
    ),
  );

  await auth.init();
}

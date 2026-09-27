import 'package:doorstep_core/doorstep_core.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'screens/home_shell.dart';
import 'screens/orders/order_detail_screen.dart';
import 'screens/profile/profile_setup_screen.dart';

final navigatorKey = GlobalKey<NavigatorState>();
final messengerKey = GlobalKey<ScaffoldMessengerState>();

class CustomerApp extends StatefulWidget {
  const CustomerApp({super.key});

  @override
  State<CustomerApp> createState() => _CustomerAppState();
}

class _CustomerAppState extends State<CustomerApp> {
  @override
  void initState() {
    super.initState();
    final push = context.read<PushService>();
    push.onForegroundMessage = (title, body, data) {
      messengerKey.currentState?.showSnackBar(
        SnackBar(
          content: Text('$title\n$body'),
          action: data['orderId'] == null ? null : SnackBarAction(label: 'View', onPressed: () => _openOrder(data['orderId'] as String)),
        ),
      );
    };
    push.onOpened = (data) {
      final orderId = data['orderId'];
      if (orderId is String) _openOrder(orderId);
    };
  }

  void _openOrder(String orderId) {
    navigatorKey.currentState?.push(MaterialPageRoute<void>(builder: (_) => OrderDetailScreen(orderId: orderId)));
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'DoorStep Zimbabwe',
      debugShowCheckedModeBanner: false,
      theme: buildDoorStepTheme(),
      navigatorKey: navigatorKey,
      scaffoldMessengerKey: messengerKey,
      home: const _AuthGate(),
    );
  }
}

class _AuthGate extends StatelessWidget {
  const _AuthGate();

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthController>();
    return AnimatedSwitcher(
      duration: const Duration(milliseconds: 250),
      child: switch (auth.status) {
        AuthStatus.unknown => const SplashScreen(key: ValueKey('splash'), tagline: 'Delivered to your doorstep'),
        AuthStatus.signedOut => const PhoneLoginScreen(
            key: ValueKey('login'),
            title: 'Welcome to DoorStep',
            subtitle: 'Food, groceries, pharmacy & parcels — delivered across Zimbabwe.',
          ),
        AuthStatus.signedIn => (auth.profile?.name ?? '').trim().isEmpty
            ? const ProfileSetupScreen(key: ValueKey('setup'))
            : const HomeShell(key: ValueKey('home')),
      },
    );
  }
}

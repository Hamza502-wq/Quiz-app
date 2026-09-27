import 'package:doorstep_core/doorstep_core.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'screens/pending_screen.dart';
import 'screens/registration_screen.dart';
import 'screens/rider_shell.dart';
import 'state/rider_controller.dart';

final messengerKey = GlobalKey<ScaffoldMessengerState>();

class RiderApp extends StatefulWidget {
  const RiderApp({super.key});

  @override
  State<RiderApp> createState() => _RiderAppState();
}

class _RiderAppState extends State<RiderApp> {
  @override
  void initState() {
    super.initState();
    final push = context.read<PushService>();
    final rider = context.read<RiderController>();
    push.onForegroundMessage = (title, body, data) {
      messengerKey.currentState?.showSnackBar(SnackBar(content: Text('$title\n$body')));
      rider.refresh();
    };
    push.onOpened = (_) => rider.refresh();
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'DoorStep Rider',
      debugShowCheckedModeBanner: false,
      theme: buildDoorStepTheme(),
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
    return switch (auth.status) {
      AuthStatus.unknown => const SplashScreen(tagline: 'Rider app'),
      AuthStatus.signedOut => const PhoneLoginScreen(
          title: 'DoorStep Rider',
          subtitle: 'Deliver across your city and earn on your schedule.',
        ),
      AuthStatus.signedIn => const _RiderGate(),
    };
  }
}

/// Routes by registration & approval status.
class _RiderGate extends StatelessWidget {
  const _RiderGate();

  @override
  Widget build(BuildContext context) {
    final controller = context.watch<RiderController>();
    final dashboard = controller.dashboard;
    if (dashboard == null) {
      if (controller.error != null) {
        return Scaffold(body: ErrorView(error: controller.error!, onRetry: controller.refresh));
      }
      return const SplashScreen(tagline: 'Loading your rider profile…');
    }
    if (!dashboard.registered) return const RegistrationScreen();
    final rider = dashboard.rider!;
    if (rider.status == 'REJECTED') return PendingScreen(rider: rider, canResubmit: true);
    if (!rider.isApproved) return PendingScreen(rider: rider);
    return const RiderShell();
  }
}

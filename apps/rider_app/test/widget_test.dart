import 'package:doorstep_core/doorstep_core.dart';
import 'package:doorstep_rider/screens/home_screen.dart';
import 'package:doorstep_rider/state/location_tracker.dart';
import 'package:doorstep_rider/state/rider_controller.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';

DispatchOffer _offer({int secondsLeft = 30, int cash = 0}) => DispatchOffer.fromJson({
      'offerId': 'off1',
      'expiresAt': DateTime.now().add(Duration(seconds: secondsLeft)).toUtc().toIso8601String(),
      'distanceToPickupKm': 1.2,
      'order': {
        'id': 'o1',
        'code': 'DS-ABC123',
        'type': 'DELIVERY',
        'vendorName': 'Sadza Republic',
        'itemCount': 3,
        'pickup': {'lat': -17.83, 'lng': 31.04, 'address': '45 Samora Machel Ave', 'landmark': 'Green pharmacy'},
        'dropoff': {'lat': -17.79, 'lng': 31.05, 'address': 'Belgravia', 'landmark': 'Blue gate opposite Spar'},
        'distanceKm': 4.6,
        'riderEarningCents': 284,
        'tipCents': 100,
        'paymentMethod': cash > 0 ? 'CASH' : 'ECOCASH',
        'cashToCollectCents': cash,
        'currency': 'USD',
        'exchangeRate': 26.8,
      },
    });

Widget _host(Widget child) {
  final settings = AppSettings();
  final api = ApiClient(tokens: TokenStore(), baseUrl: 'http://localhost:4000');
  final socket = SocketService(api);
  final tracker = LocationTracker(api: api, socket: socket, settings: settings);
  return MultiProvider(
    providers: [
      ChangeNotifierProvider.value(value: settings),
      ChangeNotifierProvider(create: (_) => RiderController(api: api, socket: socket, tracker: tracker)),
    ],
    child: MaterialApp(theme: buildDoorStepTheme(), home: Scaffold(body: child)),
  );
}

void main() {
  testWidgets('offer sheet shows earnings, route and cash to collect', (tester) async {
    await tester.pumpWidget(_host(OfferSheet(offer: _offer(cash: 1510))));
    expect(find.text('New delivery request'), findsOneWidget);
    expect(find.text(r'US$3.84'), findsOneWidget); // 2.84 pay + 1.00 tip
    expect(find.text('Sadza Republic'), findsOneWidget);
    expect(find.textContaining('Blue gate opposite Spar'), findsOneWidget);
    expect(find.textContaining(r'Collect US$15.10 cash'), findsOneWidget);
    expect(find.text('Accept'), findsOneWidget);
    expect(find.text('Decline'), findsOneWidget);
  });

  testWidgets('offer countdown ticks down', (tester) async {
    await tester.pumpWidget(_host(OfferSheet(offer: _offer(secondsLeft: 20))));
    final first = int.parse((tester.widget<Text>(find.byWidgetPredicate((w) => w is Text && RegExp(r'^\d+$').hasMatch(w.data ?? ''))).data)!);
    // The countdown is computed from wall-clock time (robust when the app is backgrounded),
    // so let real time pass, then let the periodic timer tick.
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 2100)));
    await tester.pump(const Duration(seconds: 1));
    final later = int.parse((tester.widget<Text>(find.byWidgetPredicate((w) => w is Text && RegExp(r'^\d+$').hasMatch(w.data ?? ''))).data)!);
    expect(later, lessThan(first));
  });
}

import 'package:doorstep_core/doorstep_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('format', () {
    test('formats USD and ZiG', () {
      expect(formatMoney(550), r'US$5.50');
      expect(formatMoney(147400, 'ZWG'), 'ZiG 1,474.00');
      expect(formatInCurrency(1000, 'ZWG', 26.8), 'ZiG 268.00');
      expect(formatUsdZig(1000, 26.8), r'US$10.00 · ZiG 268.00');
    });

    test('parses money input', () {
      expect(parseMoney('5.5'), 550);
      expect(parseMoney(r'US$12.25'), 1225);
      expect(parseMoney('abc'), isNull);
      expect(parseMoney('1.234'), isNull);
    });

    test('phone sanity check', () {
      expect(looksLikePhone('0771 234 567'), isTrue);
      expect(looksLikePhone('+263771234567'), isTrue);
      expect(looksLikePhone('123'), isFalse);
    });

    test('Zimbabwean number plates', () {
      expect(normalizeZwPlate('aez1234'), 'AEZ 1234');
      expect(normalizeZwPlate(' AEZ-1234 '), 'AEZ 1234');
      expect(normalizeZwPlate('AEZ  1234'), 'AEZ 1234');
      for (final bad in ['AE 1234', 'AEZ 123', '1234 AEZ', 'ABCD 1234', '']) {
        expect(normalizeZwPlate(bad), isNull, reason: bad);
      }
      expect(vehicleLabel('BICYCLE'), 'Bicycle');
      expect(categoryIcon('electronics'), Icons.devices_rounded);
      expect(categoryIcon('something-new'), Icons.storefront_rounded);
    });
  });

  group('models', () {
    final orderJson = {
      'id': 'o1',
      'code': 'DS-ABC123',
      'type': 'DELIVERY',
      'status': 'ON_THE_WAY',
      'statusLabel': 'On the way',
      'vendor': {'id': 'v1', 'name': 'Sadza Republic', 'phone': '+263772000101', 'logoUrl': null, 'lat': -17.83, 'lng': 31.04, 'addressLine': 'CBD', 'landmark': null},
      'rider': {
        'id': 'r1',
        'name': 'Tawanda',
        'photoUrl': 'https://example.com/tawanda.webp',
        'phone': '+263773000201',
        'vehicleType': 'MOTORBIKE',
        'vehicleDescription': 'Red Honda Ace',
        'vehiclePlate': 'AEF 1234',
        'ratingAvg': 4.8,
        'location': {'lat': -17.8, 'lng': 31.05, 'heading': null, 'updatedAt': null},
      },
      'pickup': {'lat': -17.83, 'lng': 31.04, 'address': 'CBD', 'landmark': null, 'contactName': 'Sadza Republic', 'contactPhone': null},
      'dropoff': {'lat': -17.79, 'lng': 31.05, 'address': 'Belgravia', 'landmark': 'Blue gate opposite Spar', 'recipientName': 'Tatenda', 'recipientPhone': '+263774000301'},
      'parcel': null,
      'distanceKm': 5.2,
      'items': [
        {'id': 'i1', 'productId': 'p1', 'name': 'Sadza & Beef', 'unitPriceCents': 550, 'quantity': 2, 'lineTotalCents': 1100, 'notes': null},
      ],
      'amounts': {'subtotalCents': 1100, 'deliveryFeeCents': 410, 'tipCents': 100, 'totalCents': 1610, 'currency': 'ZWG', 'exchangeRate': 26.8, 'totalLocalCents': 43148},
      'paymentMethod': 'CASH',
      'paymentStatus': 'PENDING',
      'payment': null,
      'deliveryPin': '4821',
      'proof': null,
      'notes': null,
      'prepMinutes': 15,
      'estimatedReadyAt': '2026-09-27T10:15:00.000Z',
      'cancelReason': null,
      'rejectReason': null,
      'canRate': false,
      'timestamps': {'createdAt': '2026-09-27T10:00:00.000Z', 'placedAt': '2026-09-27T10:00:00.000Z', 'deliveredAt': null},
      'events': [
        {'id': 'e1', 'type': 'STATUS_CHANGED', 'status': 'PLACED', 'message': 'Order placed', 'createdAt': '2026-09-27T10:00:00.000Z'},
      ],
    };

    test('parses an order', () {
      final order = Order.fromJson(orderJson);
      expect(order.status, OrderStatus.onTheWay);
      expect(order.status.isActive, isTrue);
      expect(order.itemCount, 2);
      expect(order.rider!.location!.lat, -17.8);
      expect(order.rider!.photoUrl, 'https://example.com/tawanda.webp');
      expect(order.rider!.vehiclePlate, 'AEF 1234');
      expect(order.dropoff.landmark, 'Blue gate opposite Spar');
      expect(order.dropoff.contactPhone, '+263774000301');
      expect(order.amounts.totalLocalCents, 43148);
      expect(order.deliveryPin, '4821');
      expect(order.events.single.status, OrderStatus.placed);
      expect(order.title, 'Sadza Republic');
    });

    test('parses the rider dashboard', () {
      final dash = RiderDashboard.fromJson({
        'registered': true,
        'rider': {
          'id': 'r1',
          'name': 'Tawanda',
          'phone': '+263773000201',
          'status': 'APPROVED',
          'rejectionReason': null,
          'isOnline': true,
          'vehicleType': 'MOTORBIKE',
          'vehiclePlate': 'AEF 1234',
          'ratingAvg': 4.9,
          'ratingCount': 12,
          'zone': {'id': 'z1', 'name': 'Harare Metro'},
        },
        'wallet': {'balanceCents': -1200, 'availableForPayoutCents': 0, 'cashOwedCents': 1200, 'cashLimitCents': 5000, 'cashLimitRemainingCents': 3800, 'outstandingCashCents': 1200},
        'activeOrder': null,
        'pendingOffer': null,
        'stats': {
          'today': {'deliveries': 3, 'earningsCents': 900},
          'week': {'deliveries': 20, 'earningsCents': 6500},
        },
      });
      expect(dash.registered, isTrue);
      expect(dash.rider!.isApproved, isTrue);
      expect(dash.rider!.zoneName, 'Harare Metro');
      expect(dash.wallet!.cashOwedCents, 1200);
      expect(dash.today!.deliveries, 3);
      expect(RiderDashboard.fromJson({'registered': false}).registered, isFalse);
    });

    test('cyclists have no plate; profiles carry photos', () {
      final rider = OrderRider.fromJson({'id': 'r2', 'name': 'Nyasha', 'vehicleType': 'BICYCLE', 'vehicleDescription': '', 'vehiclePlate': null, 'ratingAvg': 0, 'location': null});
      expect(rider.vehiclePlate, isNull);
      expect(rider.vehicleType, 'BICYCLE');
      final profile = Profile.fromJson({'id': 'u1', 'phone': '+263774000301', 'roles': ['CUSTOMER'], 'avatarUrl': 'https://example.com/me.webp'});
      expect(profile.avatarUrl, 'https://example.com/me.webp');
      expect(Profile.fromJson(profile.toJson()).avatarUrl, 'https://example.com/me.webp');
    });

    test('unknown status falls back safely', () {
      expect(OrderStatus.parse('SOMETHING_NEW'), OrderStatus.placed);
    });
  });

  group('widgets', () {
    testWidgets('avatar falls back to initials without a photo', (tester) async {
      await tester.pumpWidget(const MaterialApp(home: Scaffold(body: UserAvatar(url: null, name: 'Tatenda Moyo'))));
      expect(find.text('TM'), findsOneWidget);
      await tester.pumpWidget(const MaterialApp(home: Scaffold(body: PlateChip(plate: 'AEZ 1234'))));
      expect(find.text('AEZ 1234'), findsOneWidget);
    });

    testWidgets('skeletons fit unbounded and short spaces', (tester) async {
      for (final layout in SkeletonLayout.values) {
        await tester.pumpWidget(MaterialApp(
          home: Scaffold(
            body: Column(
              children: [
                LoadingView(layout: layout, message: 'Loading', compact: true),
                SizedBox(height: 120, child: SkeletonView(layout: layout)),
              ],
            ),
          ),
        ));
        await tester.pump(const Duration(milliseconds: 500));
        expect(tester.takeException(), isNull, reason: layout.name);
      }
      // Inside SliverFillRemaining, which measures its child's intrinsic height.
      await tester.pumpWidget(const MaterialApp(
        home: Scaffold(body: CustomScrollView(slivers: [SliverFillRemaining(hasScrollBody: false, child: LoadingView(layout: SkeletonLayout.cards))])),
      ));
      await tester.pump(const Duration(milliseconds: 500));
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
    });

    testWidgets('opening splash plays before showing the app', (tester) async {
      await tester.pumpWidget(const MaterialApp(home: OpeningSplashGate(ready: true, tagline: 'Rider app', child: Text('Home'))));
      expect(find.byType(SplashScreen), findsOneWidget);
      expect(find.text('Made by Hamza Protech Solutions'), findsOneWidget);
      expect(find.text('Home'), findsNothing);
      await tester.pump(const Duration(milliseconds: 1800));
      expect(find.text('Home'), findsOneWidget);
    });

    testWidgets('opening splash waits until the app is ready', (tester) async {
      Widget gate(bool ready) => MaterialApp(home: OpeningSplashGate(ready: ready, child: const Text('Home')));
      await tester.pumpWidget(gate(false));
      await tester.pump(const Duration(seconds: 3));
      expect(find.text('Home'), findsNothing);
      await tester.pumpWidget(gate(true));
      await tester.pump();
      expect(find.text('Home'), findsOneWidget);
    });
  });
}

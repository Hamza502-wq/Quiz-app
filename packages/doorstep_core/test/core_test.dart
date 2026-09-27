import 'package:doorstep_core/doorstep_core.dart';
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

    test('unknown status falls back safely', () {
      expect(OrderStatus.parse('SOMETHING_NEW'), OrderStatus.placed);
    });
  });
}

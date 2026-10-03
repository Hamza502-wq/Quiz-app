// End-to-end contract test: runs the shared ApiClient and models against a
// live DoorStep API (seeded database, OTP_DEV_ECHO=true, PAYMENTS_MOCK=true).
//
//   DOORSTEP_API_URL=http://localhost:4000 flutter test test/api_contract_test.dart
//
// Skipped automatically when DOORSTEP_API_URL is not set.
@TestOn('vm')
library;

import 'dart:io';

import 'package:doorstep_core/doorstep_core.dart';
import 'package:flutter_test/flutter_test.dart';

/// In-memory token store (the real one uses the platform keystore).
class MemoryTokenStore extends TokenStore {
  String? _a;
  String? _r;
  @override
  String? get accessToken => _a;
  @override
  String? get refreshToken => _r;
  @override
  bool get hasSession => _r != null;
  @override
  Future<void> load() async {}
  @override
  Future<void> save(String access, String refresh) async {
    _a = access;
    _r = refresh;
  }

  @override
  Future<void> clear() async {
    _a = null;
    _r = null;
  }
}

final baseUrl = Platform.environment['DOORSTEP_API_URL'];

Future<ApiClient> login(String phone, String role) async {
  final api = ApiClient(tokens: MemoryTokenStore(), baseUrl: baseUrl);
  final otp = await api.post('/auth/otp/request', body: {'phone': phone}, auth: false) as Map<String, dynamic>;
  final code = otp['devCode'] as String?;
  expect(code, isNotNull, reason: 'Start the API with OTP_DEV_ECHO=true');
  final session = await api.post('/auth/otp/verify', body: {'phone': phone, 'code': code, 'role': role}, auth: false) as Map<String, dynamic>;
  await api.tokens.save(session['accessToken'] as String, session['refreshToken'] as String);
  final profile = Profile.fromJson(session['user'] as Map<String, dynamic>);
  expect(profile.roles, contains(role));
  return api;
}

Future<T> eventually<T>(Future<T?> Function() fn, {Duration timeout = const Duration(seconds: 10)}) async {
  final end = DateTime.now().add(timeout);
  while (DateTime.now().isBefore(end)) {
    final v = await fn();
    if (v != null) return v;
    await Future<void>.delayed(const Duration(milliseconds: 500));
  }
  throw StateError('Timed out');
}

void main() {
  final skip = baseUrl == null ? 'Set DOORSTEP_API_URL to run against a live API' : null;

  test('customer → vendor → rider flow parses every response', () async {
    final customer = await login('+263774000301', 'CUSTOMER');
    final vendor = await login('+263772000101', 'VENDOR');
    final rider = await login('+263773000201', 'RIDER');

    // Browse
    final categories = (await customer.get('/categories') as List).map((e) => Category.fromJson(e as Map<String, dynamic>)).toList();
    expect(categories.map((c) => c.slug), containsAll(['food', 'groceries', 'pharmacy', 'parcels']));
    final addresses = (await customer.get('/customer/addresses') as List).map((e) => Address.fromJson(e as Map<String, dynamic>)).toList();
    final home = addresses.first;
    final vendors = Paged.fromJson(
      await customer.get('/vendors', query: {'lat': home.lat, 'lng': home.lng, 'category': 'food'}) as Map<String, dynamic>,
      Vendor.fromJson,
    );
    final sadza = vendors.items.firstWhere((v) => v.slug == 'sadza-republic');
    expect(sadza.deliveryFeeCents, isNotNull);
    final menu = VendorMenu.fromJson(await customer.get('/vendors/${sadza.id}', query: {'lat': home.lat, 'lng': home.lng}) as Map<String, dynamic>);
    expect(menu.sections, isNotEmpty);
    expect(menu.delivery!.deliverable, isTrue);
    final product = menu.sections.first.products.firstWhere((p) => p.isAvailable);
    final reviews = Paged.fromJson(await customer.get('/vendors/${sadza.id}/reviews') as Map<String, dynamic>, Review.fromJson);
    expect(reviews.total, greaterThanOrEqualTo(0));

    // Quote + cash order
    final items = [
      {'productId': product.id, 'quantity': 2},
    ];
    final quote = Quote.fromJson(await customer.post('/orders/quote', body: {
      'vendorId': sadza.id,
      'items': items,
      'addressId': home.id,
      'tipCents': 100,
      'currency': 'ZWG',
    }) as Map<String, dynamic>);
    expect(quote.subtotalCents, product.priceCents * 2);
    expect(quote.currency, 'ZWG');
    final created = await customer.post('/orders', body: {
      'vendorId': sadza.id,
      'items': items,
      'addressId': home.id,
      'tipCents': 100,
      'currency': 'USD',
      'paymentMethod': 'CASH',
    }) as Map<String, dynamic>;
    final order = Order.fromJson(created['order'] as Map<String, dynamic>);
    expect(order.status, OrderStatus.placed);
    expect(order.deliveryPin, hasLength(4));
    final pin = order.deliveryPin!;

    final detail = Order.fromJson(await customer.get('/orders/${order.id}') as Map<String, dynamic>);
    expect(detail.events, isNotEmpty);
    final active = Paged.fromJson(await customer.get('/orders', query: {'active': 'true'}) as Map<String, dynamic>, Order.fromJson);
    expect(active.items.map((o) => o.id), contains(order.id));

    // Rider online near the store; vendor accepts → auto-dispatch offer
    await rider.post('/rider/status', body: {'online': true, 'lat': sadza.lat + 0.001, 'lng': sadza.lng + 0.001});
    final dashboardBefore = RiderDashboard.fromJson(await rider.get('/rider/me') as Map<String, dynamic>);
    expect(dashboardBefore.registered, isTrue);
    expect(dashboardBefore.rider!.isOnline, isTrue);

    await vendor.post('/vendor/orders/${order.id}/accept', body: {'prepMinutes': 10});
    final offer = await eventually(() async {
      final data = await rider.get('/rider/offers/current') as Map<String, dynamic>;
      final o = data['offer'];
      if (o == null) return null;
      final parsed = DispatchOffer.fromJson(o as Map<String, dynamic>);
      return parsed.orderId == order.id ? parsed : null;
    });
    expect(offer.cashToCollectCents, order.amounts.totalCents);

    var riderOrder = Order.fromJson(await rider.post('/rider/offers/${offer.offerId}/accept') as Map<String, dynamic>);
    expect(riderOrder.customerPhone, isNotNull);
    expect(riderOrder.deliveryPin, isNull, reason: 'riders never see the PIN');

    // Chat + tracking + notifications
    final msg = ChatMessage.fromJson(await customer.post('/orders/${order.id}/messages', body: {'body': 'Blue gate please'}) as Map<String, dynamic>);
    expect(msg.mine, isTrue);
    final riderMsgs = (await rider.get('/orders/${order.id}/messages') as List).map((e) => ChatMessage.fromJson(e as Map<String, dynamic>)).toList();
    expect(riderMsgs.last.mine, isFalse);
    await rider.post('/rider/location', body: {'lat': sadza.lat, 'lng': sadza.lng, 'heading': 90});
    final tracking = TrackingSnapshot.fromJson(await customer.get('/orders/${order.id}/tracking') as Map<String, dynamic>);
    expect(tracking.riderLocation, isNotNull);
    final notifications = Paged.fromJson(await customer.get('/notifications') as Map<String, dynamic>, AppNotification.fromJson);
    expect(notifications.items, isNotEmpty);

    // Deliver with PIN
    riderOrder = Order.fromJson(await rider.post('/rider/orders/${order.id}/picked-up') as Map<String, dynamic>);
    expect(riderOrder.status, OrderStatus.pickedUp);
    riderOrder = Order.fromJson(await rider.post('/rider/orders/${order.id}/on-the-way') as Map<String, dynamic>);
    await expectLater(
      rider.post('/rider/orders/${order.id}/deliver', body: {'proofType': 'PIN', 'pin': pin == '0000' ? '1111' : '0000'}),
      throwsA(isA<ApiException>().having((e) => e.statusCode, 'status', 400)),
    );
    riderOrder = Order.fromJson(await rider.post('/rider/orders/${order.id}/deliver', body: {'proofType': 'PIN', 'pin': pin}) as Map<String, dynamic>);
    expect(riderOrder.status, OrderStatus.delivered);

    final wallet = WalletSummary.fromJson(await rider.get('/rider/wallet') as Map<String, dynamic>);
    expect(wallet.cashLimitCents, greaterThan(0));
    final txs = Paged.fromJson(await rider.get('/rider/wallet/transactions') as Map<String, dynamic>, WalletTransaction.fromJson);
    expect(txs.items.first.orderCode, order.code);
    Paged.fromJson(await rider.get('/rider/payouts') as Map<String, dynamic>, Payout.fromJson);
    Paged.fromJson(await rider.get('/rider/orders') as Map<String, dynamic>, Order.fromJson);
    await rider.post('/rider/status', body: {'online': false});

    // Rate + reorder
    final delivered = Order.fromJson(await customer.get('/orders/${order.id}') as Map<String, dynamic>);
    expect(delivered.canRate, isTrue);
    await customer.post('/orders/${order.id}/rate', body: {'vendorScore': 5, 'riderScore': 5});
    final reorder = await customer.post('/orders/${order.id}/reorder') as Map<String, dynamic>;
    expect((reorder['items'] as List), isNotEmpty);

    // Online payment (mock Paynow)
    final online = await customer.post('/orders', body: {
      'vendorId': sadza.id,
      'items': items,
      'addressId': home.id,
      'tipCents': 0,
      'paymentMethod': 'ECOCASH',
      'payerPhone': '0771111111',
    }) as Map<String, dynamic>;
    final pendingOrder = Order.fromJson(online['order'] as Map<String, dynamic>);
    expect(pendingOrder.status, OrderStatus.pendingPayment);
    final payment = PaymentInfo.fromJson(online['payment'] as Map<String, dynamic>);
    expect(payment.isPending, isTrue);
    final paid = await eventually(() async {
      final p = PaymentInfo.fromJson(await customer.get('/payments/${payment.id}') as Map<String, dynamic>);
      return p.isPaid ? p : null;
    }, timeout: const Duration(seconds: 20));
    expect(paid.status, 'PAID');
    final placed = Order.fromJson(await customer.get('/orders/${pendingOrder.id}') as Map<String, dynamic>);
    expect(placed.status, OrderStatus.placed);
    await vendor.post('/vendor/orders/${pendingOrder.id}/reject', body: {'reason': 'Contract test cleanup'});

    // Token rotation
    final before = customer.tokens.refreshToken;
    expect(await customer.refreshSession(), isTrue);
    expect(customer.tokens.refreshToken, isNot(before));
    expect(Profile.fromJson(await customer.get('/auth/me') as Map<String, dynamic>).phone, '+263774000301');
  }, skip: skip, timeout: const Timeout(Duration(minutes: 2)));
}

import 'package:doorstep_core/doorstep_core.dart';
import 'package:doorstep_customer/state/cart_controller.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  group('CartController', () {
    test('adds, merges and totals items for one vendor', () {
      final cart = CartController();
      cart.add(vendorId: 'v1', vendorName: 'Sadza Republic', productId: 'p1', name: 'Sadza & Beef', priceCents: 550);
      cart.add(vendorId: 'v1', vendorName: 'Sadza Republic', productId: 'p1', name: 'Sadza & Beef', priceCents: 550);
      cart.add(vendorId: 'v1', vendorName: 'Sadza Republic', productId: 'p2', name: 'Maheu', priceCents: 150);
      expect(cart.itemCount, 3);
      expect(cart.subtotalCents, 550 * 2 + 150);
      expect(cart.toOrderItems(), [
        {'productId': 'p1', 'quantity': 2},
        {'productId': 'p2', 'quantity': 1},
      ]);
    });

    test('switching vendor starts a new cart', () {
      final cart = CartController();
      cart.add(vendorId: 'v1', vendorName: 'A', productId: 'p1', name: 'X', priceCents: 100);
      expect(cart.belongsToOtherVendor('v2'), isTrue);
      cart.add(vendorId: 'v2', vendorName: 'B', productId: 'p9', name: 'Y', priceCents: 200);
      expect(cart.vendorId, 'v2');
      expect(cart.itemCount, 1);
    });

    test('removing the last item clears the vendor', () {
      final cart = CartController();
      cart.add(vendorId: 'v1', vendorName: 'A', productId: 'p1', name: 'X', priceCents: 100);
      cart.setQuantity('p1', 0);
      expect(cart.isEmpty, isTrue);
      expect(cart.vendorId, isNull);
    });

    test('persists and restores', () async {
      final cart = CartController();
      cart.add(vendorId: 'v1', vendorName: 'A', productId: 'p1', name: 'X', priceCents: 100, quantity: 3);
      await Future<void>.delayed(Duration.zero);
      final restored = CartController();
      await restored.load();
      expect(restored.itemCount, 3);
      expect(restored.vendorName, 'A');
    });
  });

  testWidgets('login screen validates the phone number before sending a code', (tester) async {
    final api = ApiClient(tokens: TokenStore(), baseUrl: 'http://localhost:4000');
    await tester.pumpWidget(
      ChangeNotifierProvider(
        create: (_) => AuthController(api: api, role: 'CUSTOMER'),
        child: MaterialApp(
          theme: buildDoorStepTheme(),
          home: const PhoneLoginScreen(title: 'Welcome to DoorStep', subtitle: 'Delivered to your doorstep'),
        ),
      ),
    );
    expect(find.text('Welcome to DoorStep'), findsOneWidget);
    expect(find.text('Send code'), findsOneWidget);

    await tester.enterText(find.byType(TextField).first, '123');
    await tester.tap(find.text('Send code'));
    await tester.pump();
    expect(find.textContaining('valid phone number'), findsOneWidget);
  });
}

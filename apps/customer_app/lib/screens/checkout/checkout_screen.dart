import 'dart:async';

import 'package:doorstep_core/doorstep_core.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../state/address_controller.dart';
import '../../state/cart_controller.dart';
import '../../widgets/checkout_widgets.dart';
import '../address/address_picker_sheet.dart';
import '../orders/order_detail_screen.dart';
import 'payment_screen.dart';

class CheckoutScreen extends StatefulWidget {
  const CheckoutScreen({super.key});

  @override
  State<CheckoutScreen> createState() => _CheckoutScreenState();
}

class _CheckoutScreenState extends State<CheckoutScreen> {
  final _notes = TextEditingController();
  late final _payerPhone = TextEditingController(text: context.read<AuthController>().profile?.phone ?? '');
  late String _currency = context.read<AuthController>().profile?.preferredCurrency ?? 'USD';
  String _method = 'ECOCASH';
  int _tipCents = 0;

  Quote? _quote;
  Object? _quoteError;
  bool _quoting = false;
  bool _placing = false;
  Timer? _debounce;
  int _quoteSeq = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _requote());
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _notes.dispose();
    _payerPhone.dispose();
    super.dispose();
  }

  Map<String, dynamic>? _body() {
    final cart = context.read<CartController>();
    final address = context.read<AddressController>().selected;
    if (cart.isEmpty || cart.vendorId == null || address == null) return null;
    return {
      'vendorId': cart.vendorId,
      'items': cart.toOrderItems(),
      'addressId': address.id,
      'tipCents': _tipCents,
      'currency': _currency,
    };
  }

  void _requote() {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), () async {
      final body = _body();
      if (body == null) {
        setState(() => _quote = null);
        return;
      }
      final seq = ++_quoteSeq;
      setState(() {
        _quoting = true;
        _quoteError = null;
      });
      try {
        final data = await context.read<ApiClient>().post('/orders/quote', body: body);
        if (!mounted || seq != _quoteSeq) return;
        final quote = Quote.fromJson(data as Map<String, dynamic>);
        setState(() {
          _quote = quote;
          // Riders can only carry so much cash: larger orders are paid online.
          if (!quote.cashAllowed && _method == 'CASH') _method = 'ECOCASH';
        });
      } catch (e) {
        if (!mounted || seq != _quoteSeq) return;
        setState(() {
          _quote = null;
          _quoteError = e;
        });
      } finally {
        if (mounted && seq == _quoteSeq) setState(() => _quoting = false);
      }
    });
  }

  Future<void> _placeOrder() async {
    final body = _body();
    if (body == null) return;
    final isMobile = _method == 'ECOCASH' || _method == 'ONEMONEY';
    if (isMobile && !looksLikePhone(_payerPhone.text)) {
      showSnack(context, 'Enter the ${paymentLabel(_method)} number to charge', error: true);
      return;
    }
    setState(() => _placing = true);
    final api = context.read<ApiClient>();
    final cart = context.read<CartController>();
    final navigator = Navigator.of(context);
    try {
      final data = await api.post('/orders', body: {
        ...body,
        'paymentMethod': _method,
        if (isMobile) 'payerPhone': _payerPhone.text.trim(),
        if (_notes.text.trim().isNotEmpty) 'notes': _notes.text.trim(),
      }) as Map<String, dynamic>;
      final order = Order.fromJson(data['order'] as Map<String, dynamic>);
      await cart.clear();
      if (!mounted) return;
      if (_method == 'CASH') {
        navigator.pushReplacement(MaterialPageRoute<void>(builder: (_) => OrderDetailScreen(orderId: order.id)));
      } else {
        navigator.pushReplacement(MaterialPageRoute<void>(
          builder: (_) => PaymentScreen(
            orderId: order.id,
            initialPayment: data['payment'] == null ? null : PaymentInfo.fromJson(data['payment'] as Map<String, dynamic>),
            initialError: data['paymentError'] as String?,
            method: _method,
            payerPhone: _payerPhone.text.trim(),
          ),
        ));
      }
    } catch (e) {
      if (mounted) showSnack(context, errorMessage(e), error: true);
      _requote();
    } finally {
      if (mounted) setState(() => _placing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final cart = context.watch<CartController>();
    final address = context.watch<AddressController>().selected;

    if (cart.isEmpty) {
      return Scaffold(
        appBar: AppBar(title: const Text('Your cart')),
        body: EmptyView(
          icon: Icons.shopping_bag_outlined,
          title: 'Your cart is empty',
          message: 'Browse stores and add something tasty.',
          action: OutlinedButton(onPressed: () => Navigator.pop(context), child: const Text('Browse stores')),
        ),
      );
    }

    final isMobile = _method == 'ECOCASH' || _method == 'ONEMONEY';
    return Scaffold(
      appBar: AppBar(title: Text('Checkout · ${cart.vendorName ?? ''}')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          SectionCard(
            title: 'Deliver to',
            trailing: TextButton(
              onPressed: () async {
                await showAddressPicker(context);
                _requote();
              },
              child: Text(address == null ? 'Add' : 'Change'),
            ),
            child: address == null
                ? const Text('Add a delivery address with a landmark so your rider can find you.', style: TextStyle(color: DsColors.muted))
                : Row(
                    children: [
                      const Icon(Icons.location_on_rounded, color: DsColors.red),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('${address.label} · ${address.landmark}', style: const TextStyle(fontWeight: FontWeight.w700)),
                            Text(address.summary, style: const TextStyle(color: DsColors.muted)),
                          ],
                        ),
                      ),
                    ],
                  ),
          ),
          const SizedBox(height: 12),
          SectionCard(
            title: 'Your order',
            child: Column(
              children: [
                for (final line in cart.lines)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 6),
                    child: Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(line.name, style: const TextStyle(fontWeight: FontWeight.w600)),
                              Text(formatMoney(line.totalCents), style: const TextStyle(color: DsColors.muted)),
                            ],
                          ),
                        ),
                        IconButton(
                          icon: Icon(line.quantity == 1 ? Icons.delete_outline_rounded : Icons.remove_circle_outline_rounded),
                          onPressed: () {
                            cart.setQuantity(line.productId, line.quantity - 1);
                            _requote();
                          },
                        ),
                        Text('${line.quantity}', style: const TextStyle(fontWeight: FontWeight.w700)),
                        IconButton(
                          icon: const Icon(Icons.add_circle_outline_rounded),
                          onPressed: () {
                            cart.setQuantity(line.productId, line.quantity + 1);
                            _requote();
                          },
                        ),
                      ],
                    ),
                  ),
                TextField(
                  controller: _notes,
                  maxLength: 300,
                  decoration: const InputDecoration(hintText: 'Note for the store (optional)', prefixIcon: Icon(Icons.edit_note_rounded)),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          SectionCard(
            title: 'Tip your rider',
            child: TipSelector(
              valueCents: _tipCents,
              onChanged: (v) {
                setState(() => _tipCents = v);
                _requote();
              },
            ),
          ),
          const SizedBox(height: 12),
          SectionCard(
            title: 'Payment',
            trailing: CurrencyToggle(
              value: _currency,
              onChanged: (v) {
                setState(() => _currency = v);
                _requote();
              },
            ),
            child: Column(
              children: [
                PaymentMethodSelector(
                  value: _method,
                  onChanged: (m) => setState(() => _method = m),
                  allowCash: _quote?.cashAllowed ?? true,
                  cashLimitCents: _quote?.cashLimitCents,
                ),
                if (isMobile)
                  TextField(
                    controller: _payerPhone,
                    keyboardType: TextInputType.phone,
                    decoration: InputDecoration(labelText: '${paymentLabel(_method)} number', prefixIcon: const Icon(Icons.phone_android_rounded)),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          SectionCard(
            title: 'Summary',
            child: _quoting && _quote == null
                ? const Padding(padding: EdgeInsets.all(12), child: LinearProgressIndicator(color: DsColors.orange))
                : _quoteError != null
                    ? Text(errorMessage(_quoteError!), style: const TextStyle(color: DsColors.red))
                    : _quote == null
                        ? const Text('Add a delivery address to see the total.', style: TextStyle(color: DsColors.muted))
                        : Opacity(opacity: _quoting ? 0.5 : 1, child: PriceBreakdown(quote: _quote!)),
          ),
          const SizedBox(height: 100),
        ],
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
          child: PrimaryButton(
            label: _quote == null
                ? 'Place order'
                : _method == 'CASH'
                    ? 'Place order · ${formatMoney(_quote!.totalLocalCents, _quote!.currency)}'
                    : 'Pay ${formatMoney(_quote!.totalLocalCents, _quote!.currency)}',
            loading: _placing,
            onPressed: _quote == null || _quoting ? null : _placeOrder,
          ),
        ),
      ),
    );
  }
}

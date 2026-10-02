import 'dart:async';

import 'package:doorstep_core/doorstep_core.dart';
import 'package:flutter/material.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:provider/provider.dart';

import '../../state/address_controller.dart';
import '../../widgets/checkout_widgets.dart';
import '../../widgets/map_pin_picker.dart';
import '../address/address_picker_sheet.dart';
import '../checkout/payment_screen.dart';
import '../orders/order_detail_screen.dart';

/// Point-to-point parcel delivery: pickup pin + landmark, drop-off address, recipient.
class SendParcelScreen extends StatefulWidget {
  const SendParcelScreen({super.key});

  @override
  State<SendParcelScreen> createState() => _SendParcelScreenState();
}

class _SendParcelScreenState extends State<SendParcelScreen> {
  final _form = GlobalKey<FormState>();
  LatLng _pickup = const LatLng(AppConfig.defaultLat, AppConfig.defaultLng);
  final _pickupAddress = TextEditingController();
  final _pickupLandmark = TextEditingController();
  final _recipientName = TextEditingController();
  final _recipientPhone = TextEditingController();
  final _description = TextEditingController();
  late final _payerPhone = TextEditingController(text: context.read<AuthController>().profile?.phone ?? '');
  String _size = 'SMALL';
  String _method = 'CASH';
  late String _currency = context.read<AuthController>().profile?.preferredCurrency ?? 'USD';
  int _tipCents = 0;
  Quote? _quote;
  Object? _quoteError;
  bool _busy = false;
  bool _quoting = false;

  @override
  void initState() {
    super.initState();
    _locate();
  }

  Future<void> _locate() async {
    try {
      final p = await currentPosition();
      if (mounted) setState(() => _pickup = LatLng(p.latitude, p.longitude));
    } catch (_) {}
  }

  @override
  void dispose() {
    for (final c in [_pickupAddress, _pickupLandmark, _recipientName, _recipientPhone, _description, _payerPhone]) {
      c.dispose();
    }
    super.dispose();
  }

  Map<String, dynamic>? _body() {
    final dropoff = context.read<AddressController>().selected;
    if (dropoff == null) return null;
    return {
      'pickup': {
        'lat': _pickup.latitude,
        'lng': _pickup.longitude,
        'address': _pickupAddress.text.trim(),
        'landmark': _pickupLandmark.text.trim(),
      },
      'recipientName': _recipientName.text.trim(),
      'recipientPhone': _recipientPhone.text.trim(),
      'description': _description.text.trim(),
      'size': _size,
      'addressId': dropoff.id,
      'tipCents': _tipCents,
      'currency': _currency,
    };
  }

  Future<void> _getQuote() async {
    if (!_form.currentState!.validate()) return;
    final body = _body();
    if (body == null) {
      showSnack(context, 'Choose a drop-off address', error: true);
      return;
    }
    setState(() {
      _quoting = true;
      _quoteError = null;
    });
    try {
      final data = await context.read<ApiClient>().post('/orders/parcel/quote', body: body);
      if (!mounted) return;
      final quote = Quote.fromJson(data as Map<String, dynamic>);
      setState(() {
        _quote = quote;
        // Riders can only carry so much cash: larger orders are paid online.
        if (!quote.cashAllowed && _method == 'CASH') _method = 'ECOCASH';
      });
    } catch (e) {
      if (mounted) setState(() => _quoteError = e);
    } finally {
      if (mounted) setState(() => _quoting = false);
    }
  }

  Future<void> _book() async {
    if (!_form.currentState!.validate()) return;
    final body = _body();
    if (body == null) return;
    final isMobile = _method == 'ECOCASH' || _method == 'ONEMONEY';
    setState(() => _busy = true);
    final navigator = Navigator.of(context);
    try {
      final data = await context.read<ApiClient>().post('/orders/parcel', body: {
        ...body,
        'paymentMethod': _method,
        if (isMobile) 'payerPhone': _payerPhone.text.trim(),
      }) as Map<String, dynamic>;
      final order = Order.fromJson(data['order'] as Map<String, dynamic>);
      if (!mounted) return;
      navigator.pushReplacement(MaterialPageRoute<void>(
        builder: (_) => _method == 'CASH'
            ? OrderDetailScreen(orderId: order.id)
            : PaymentScreen(
                orderId: order.id,
                method: _method,
                payerPhone: _payerPhone.text.trim(),
                initialPayment: data['payment'] == null ? null : PaymentInfo.fromJson(data['payment'] as Map<String, dynamic>),
                initialError: data['paymentError'] as String?,
              ),
      ));
    } catch (e) {
      if (mounted) showSnack(context, errorMessage(e), error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _invalidateQuote() {
    if (_quote != null) setState(() => _quote = null);
  }

  String? _required(String? v) => (v ?? '').trim().length < 2 ? 'Required' : null;

  @override
  Widget build(BuildContext context) {
    final dropoff = context.watch<AddressController>().selected;
    final isMobile = _method == 'ECOCASH' || _method == 'ONEMONEY';
    return Scaffold(
      appBar: AppBar(title: const Text('Send a parcel')),
      body: Form(
        key: _form,
        onChanged: _invalidateQuote,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            SectionCard(
              title: '1. Pickup',
              child: Column(
                children: [
                  MapPinPicker(
                    key: ValueKey('${_pickup.latitude.toStringAsFixed(4)},${_pickup.longitude.toStringAsFixed(4)}'),
                    initial: _pickup,
                    height: 220,
                    onChanged: (p) {
                      _pickup = p;
                      _invalidateQuote();
                    },
                  ),
                  const SizedBox(height: 12),
                  TextFormField(controller: _pickupAddress, maxLength: 160, validator: _required, decoration: const InputDecoration(labelText: 'Pickup address')),
                  TextFormField(
                    controller: _pickupLandmark,
                    maxLength: 200,
                    validator: _required,
                    decoration: const InputDecoration(labelText: 'Landmark', hintText: 'e.g. Reception desk, 2nd floor'),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            SectionCard(
              title: '2. Drop-off',
              trailing: TextButton(onPressed: () => showAddressPicker(context).then((_) => _invalidateQuote()), child: Text(dropoff == null ? 'Choose' : 'Change')),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(dropoff == null ? 'Choose a saved address or add a new one.' : '${dropoff.label} · ${dropoff.landmark}',
                      style: TextStyle(fontWeight: dropoff == null ? FontWeight.w400 : FontWeight.w700)),
                  if (dropoff != null) Text(dropoff.summary, style: const TextStyle(color: DsColors.muted)),
                  const SizedBox(height: 12),
                  TextFormField(controller: _recipientName, maxLength: 80, validator: _required, decoration: const InputDecoration(labelText: 'Recipient name')),
                  TextFormField(
                    controller: _recipientPhone,
                    keyboardType: TextInputType.phone,
                    validator: (v) => looksLikePhone(v ?? '') ? null : 'Enter a valid phone number',
                    decoration: const InputDecoration(labelText: 'Recipient phone'),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            SectionCard(
              title: '3. Parcel',
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  TextFormField(controller: _description, maxLength: 200, validator: _required, decoration: const InputDecoration(labelText: "What's inside?", hintText: 'e.g. Documents envelope')),
                  Wrap(
                    spacing: 8,
                    children: [
                      for (final (code, label) in const [('SMALL', 'Small (envelope)'), ('MEDIUM', 'Medium (shoebox)'), ('LARGE', 'Large (box)')])
                        ChoiceChip(
                          label: Text(label),
                          selected: _size == code,
                          onSelected: (_) {
                            setState(() => _size = code);
                            _invalidateQuote();
                          },
                        ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            SectionCard(
              title: '4. Payment',
              trailing: CurrencyToggle(value: _currency, onChanged: (v) => setState(() {
                    _currency = v;
                    _quote = null;
                  })),
              child: Column(
                children: [
                  PaymentMethodSelector(
                    value: _method,
                    onChanged: (m) => setState(() => _method = m),
                    allowCash: _quote?.cashAllowed ?? true,
                    cashLimitCents: _quote?.cashLimitCents,
                  ),
                  if (isMobile)
                    TextField(controller: _payerPhone, keyboardType: TextInputType.phone, decoration: InputDecoration(labelText: '${paymentLabel(_method)} number')),
                  const SizedBox(height: 8),
                  TipSelector(valueCents: _tipCents, onChanged: (v) => setState(() {
                        _tipCents = v;
                        _quote = null;
                      })),
                ],
              ),
            ),
            const SizedBox(height: 12),
            if (_quoteError != null) Text(errorMessage(_quoteError!), style: const TextStyle(color: DsColors.red)),
            if (_quote != null) SectionCard(title: 'Price', child: PriceBreakdown(quote: _quote!)),
            const SizedBox(height: 90),
          ],
        ),
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
          child: _quote == null
              ? PrimaryButton(label: 'Get price', loading: _quoting, onPressed: _getQuote)
              : PrimaryButton(label: 'Book rider · ${formatMoney(_quote!.totalLocalCents, _quote!.currency)}', loading: _busy, onPressed: _book),
        ),
      ),
    );
  }
}

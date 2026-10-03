import 'dart:async';

import 'package:doorstep_core/doorstep_core.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../widgets/checkout_widgets.dart';
import '../orders/order_detail_screen.dart';

/// Waits for a Paynow payment (EcoCash/OneMoney USSD prompt or card page) to
/// complete, polling the API. Also used for post-delivery tips (`isTip`).
class PaymentScreen extends StatefulWidget {
  const PaymentScreen({
    super.key,
    required this.orderId,
    required this.method,
    this.initialPayment,
    this.initialError,
    this.payerPhone,
    this.isTip = false,
  });

  final String orderId;
  final String method;
  final PaymentInfo? initialPayment;
  final String? initialError;
  final String? payerPhone;
  final bool isTip;

  @override
  State<PaymentScreen> createState() => _PaymentScreenState();
}

class _PaymentScreenState extends State<PaymentScreen> {
  static const _timeout = Duration(minutes: 5);

  PaymentInfo? _payment;
  String? _error;
  late String _method = widget.method;
  late final _phone = TextEditingController(text: widget.payerPhone ?? context.read<AuthController>().profile?.phone ?? '');
  Timer? _poll;
  DateTime _startedAt = DateTime.now();
  bool _retrying = false;
  bool _openedCard = false;

  @override
  void initState() {
    super.initState();
    _payment = widget.initialPayment;
    _error = widget.initialError;
    if (_payment != null) _startPolling();
  }

  @override
  void dispose() {
    _poll?.cancel();
    _phone.dispose();
    super.dispose();
  }

  void _startPolling() {
    _poll?.cancel();
    _startedAt = DateTime.now();
    final interval = context.read<AppSettings>().lowDataMode ? const Duration(seconds: 8) : const Duration(seconds: 4);
    _poll = Timer.periodic(interval, (_) => _check());
    if (_method == 'CARD' && _payment?.redirectUrl != null && !_openedCard) {
      _openedCard = true;
      openExternal(_payment!.redirectUrl!);
    }
  }

  Future<void> _check() async {
    final payment = _payment;
    if (payment == null) return;
    if (DateTime.now().difference(_startedAt) > _timeout) {
      _poll?.cancel();
      setState(() => _error = "We didn't get confirmation from ${paymentLabel(_method)}. If money left your account, contact support — otherwise try again.");
      return;
    }
    try {
      final data = await context.read<ApiClient>().get('/payments/${payment.id}');
      final fresh = PaymentInfo.fromJson(data as Map<String, dynamic>);
      if (!mounted) return;
      setState(() => _payment = fresh);
      if (fresh.isPaid) {
        _poll?.cancel();
        await Future<void>.delayed(const Duration(milliseconds: 900));
        if (!mounted) return;
        if (widget.isTip) {
          showSnack(context, 'Thank you! Your tip was sent to the rider.');
          Navigator.pop(context, true);
        } else {
          Navigator.pushReplacement(context, MaterialPageRoute<void>(builder: (_) => OrderDetailScreen(orderId: widget.orderId)));
        }
      } else if (!fresh.isPending) {
        _poll?.cancel();
        setState(() => _error = 'Payment ${fresh.status.toLowerCase()}. You can try again.');
      }
    } catch (_) {
      // Transient network issue — keep polling.
    }
  }

  Future<void> _retry() async {
    final isMobile = _method == 'ECOCASH' || _method == 'ONEMONEY';
    if (isMobile && !looksLikePhone(_phone.text)) {
      showSnack(context, 'Enter the ${paymentLabel(_method)} number', error: true);
      return;
    }
    setState(() {
      _retrying = true;
      _error = null;
      _openedCard = false;
    });
    try {
      final data = await context.read<ApiClient>().post('/orders/${widget.orderId}/pay', body: {
        'method': _method,
        if (isMobile) 'payerPhone': _phone.text.trim(),
      });
      if (!mounted) return;
      setState(() => _payment = PaymentInfo.fromJson(data as Map<String, dynamic>));
      _startPolling();
    } catch (e) {
      if (mounted) setState(() => _error = errorMessage(e));
    } finally {
      if (mounted) setState(() => _retrying = false);
    }
  }

  Future<void> _cancelOrder() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Cancel this order?'),
        content: const Text('Nothing has been charged yet.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Keep order')),
          TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('Cancel order')),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    final result = await runWithFeedback(context, () => context.read<ApiClient>().post('/orders/${widget.orderId}/cancel', body: {'reason': 'Payment not completed'}), success: 'Order cancelled');
    if (result != null && mounted) Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    final p = _payment;
    final waiting = p != null && p.isPending && _error == null;
    return Scaffold(
      appBar: AppBar(title: Text(widget.isTip ? 'Send tip' : 'Complete payment')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          const SizedBox(height: 12),
          Center(
            child: Container(
              padding: const EdgeInsets.all(22),
              decoration: BoxDecoration(color: p?.isPaid == true ? DsColors.greenLight : DsColors.orangeLight, shape: BoxShape.circle),
              child: Icon(
                p?.isPaid == true
                    ? Icons.check_rounded
                    : _method == 'CARD'
                        ? Icons.credit_card_rounded
                        : Icons.phone_android_rounded,
                size: 56,
                color: p?.isPaid == true ? DsColors.green : DsColors.orange,
              ),
            ),
          ),
          const SizedBox(height: 20),
          Text(
            p?.isPaid == true ? 'Payment received!' : waiting ? 'Waiting for ${paymentLabel(_method)}…' : 'Payment',
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.headlineSmall,
          ),
          if (p != null) ...[
            const SizedBox(height: 8),
            Text(formatMoney(p.amountCents, p.currency), textAlign: TextAlign.center, style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w800, color: DsColors.orange)),
          ],
          const SizedBox(height: 16),
          if (waiting) ...[
            SectionCard(
              child: Column(
                children: [
                  Text(
                    p.instructions ??
                        (_method == 'CARD' ? 'Complete the payment on the secure Paynow page.' : 'Check your phone and enter your PIN to approve the payment.'),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 16),
                  const LinearProgressIndicator(color: DsColors.orange),
                  const SizedBox(height: 8),
                  const Text('Keep this screen open — we’ll update automatically.', style: TextStyle(color: DsColors.muted, fontSize: 12)),
                ],
              ),
            ),
            if (_method == 'CARD' && p.redirectUrl != null) ...[
              const SizedBox(height: 12),
              OutlinedButton.icon(
                onPressed: () => openExternal(p.redirectUrl!),
                icon: const Icon(Icons.open_in_new_rounded),
                label: const Text('Open payment page'),
              ),
            ],
          ],
          if (_error != null) ...[
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(color: DsColors.redLight, borderRadius: BorderRadius.circular(14)),
              child: Text(_error!, style: const TextStyle(color: DsColors.red)),
            ),
            const SizedBox(height: 16),
            if (!widget.isTip) ...[
              Text('Try again', style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 8),
              PaymentMethodSelector(value: _method, allowCash: false, onChanged: (m) => setState(() => _method = m)),
              if (_method != 'CARD')
                TextField(
                  controller: _phone,
                  keyboardType: TextInputType.phone,
                  decoration: InputDecoration(labelText: '${paymentLabel(_method)} number'),
                ),
              const SizedBox(height: 16),
              PrimaryButton(label: 'Retry payment', loading: _retrying, onPressed: _retry),
              TextButton(onPressed: _cancelOrder, child: const Text('Cancel order')),
            ] else
              OutlinedButton(onPressed: () => Navigator.pop(context, false), child: const Text('Close')),
          ],
        ],
      ),
    );
  }
}

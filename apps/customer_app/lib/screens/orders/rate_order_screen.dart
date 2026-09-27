import 'package:doorstep_core/doorstep_core.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../widgets/checkout_widgets.dart';
import '../checkout/payment_screen.dart';

/// Rate the store and rider, and optionally tip the rider (via Paynow).
class RateOrderScreen extends StatefulWidget {
  const RateOrderScreen({super.key, required this.order, this.tipOnly = false});
  final Order order;
  final bool tipOnly;

  @override
  State<RateOrderScreen> createState() => _RateOrderScreenState();
}

class _RateOrderScreenState extends State<RateOrderScreen> {
  int _vendorScore = 0;
  int _riderScore = 0;
  final _vendorComment = TextEditingController();
  final _riderComment = TextEditingController();
  int _tipCents = 0;
  String _tipMethod = 'ECOCASH';
  bool _submitting = false;

  @override
  void dispose() {
    _vendorComment.dispose();
    _riderComment.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final order = widget.order;
    final api = context.read<ApiClient>();
    final navigator = Navigator.of(context);
    final profile = context.read<AuthController>().profile;
    setState(() => _submitting = true);
    try {
      if (!widget.tipOnly && (_vendorScore > 0 || _riderScore > 0)) {
        await api.post('/orders/${order.id}/rate', body: {
          if (_vendorScore > 0 && !order.isParcel) 'vendorScore': _vendorScore,
          if (_vendorComment.text.trim().isNotEmpty && !order.isParcel) 'vendorComment': _vendorComment.text.trim(),
          if (_riderScore > 0) 'riderScore': _riderScore,
          if (_riderComment.text.trim().isNotEmpty) 'riderComment': _riderComment.text.trim(),
        });
      }
      if (_tipCents > 0) {
        final data = await api.post('/orders/${order.id}/tip', body: {
          'amountCents': _tipCents,
          'method': _tipMethod,
          if (_tipMethod != 'CARD' && profile != null) 'payerPhone': profile.phone,
        });
        if (!mounted) return;
        await navigator.push(MaterialPageRoute<bool>(
          builder: (_) => PaymentScreen(
            orderId: order.id,
            method: _tipMethod,
            initialPayment: PaymentInfo.fromJson(data as Map<String, dynamic>),
            isTip: true,
          ),
        ));
      } else if (mounted) {
        showSnack(context, 'Thanks for your feedback!');
      }
      if (mounted) navigator.pop();
    } catch (e) {
      if (mounted) showSnack(context, errorMessage(e), error: true);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Widget _stars(int value, ValueChanged<int> onChanged) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        for (var i = 1; i <= 5; i++)
          IconButton(
            iconSize: 38,
            onPressed: () => onChanged(i),
            icon: Icon(i <= value ? Icons.star_rounded : Icons.star_border_rounded, color: DsColors.orange),
            tooltip: '$i star${i == 1 ? '' : 's'}',
          ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final order = widget.order;
    final canSubmit = _tipCents > 0 || (!widget.tipOnly && (_vendorScore > 0 || _riderScore > 0));
    return Scaffold(
      appBar: AppBar(title: Text(widget.tipOnly ? 'Tip your rider' : 'Rate your order')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (!widget.tipOnly && !order.isParcel) ...[
            SectionCard(
              title: 'How was ${order.vendorName ?? 'the food'}?',
              child: Column(children: [
                _stars(_vendorScore, (v) => setState(() => _vendorScore = v)),
                TextField(controller: _vendorComment, maxLength: 500, decoration: const InputDecoration(hintText: 'Tell others about it (optional)')),
              ]),
            ),
            const SizedBox(height: 12),
          ],
          if (!widget.tipOnly && order.rider != null) ...[
            SectionCard(
              title: 'How was ${order.rider!.name ?? 'your rider'}?',
              child: Column(children: [
                _stars(_riderScore, (v) => setState(() => _riderScore = v)),
                TextField(controller: _riderComment, maxLength: 500, decoration: const InputDecoration(hintText: 'Comment (optional)')),
              ]),
            ),
            const SizedBox(height: 12),
          ],
          if (order.rider != null)
            SectionCard(
              title: 'Add a tip',
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('100% of tips go to your rider.', style: TextStyle(color: DsColors.muted)),
                  const SizedBox(height: 10),
                  TipSelector(valueCents: _tipCents, onChanged: (v) => setState(() => _tipCents = v)),
                  if (_tipCents > 0) ...[
                    const SizedBox(height: 12),
                    PaymentMethodSelector(value: _tipMethod, allowCash: false, onChanged: (m) => setState(() => _tipMethod = m)),
                  ],
                ],
              ),
            ),
          const SizedBox(height: 20),
          PrimaryButton(
            label: _tipCents > 0 ? 'Submit & tip ${formatMoney(_tipCents)}' : 'Submit',
            loading: _submitting,
            onPressed: canSubmit ? _submit : null,
          ),
        ],
      ),
    );
  }
}

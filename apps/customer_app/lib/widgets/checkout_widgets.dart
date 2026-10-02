import 'package:doorstep_core/doorstep_core.dart';
import 'package:flutter/material.dart';

class PaymentMethodSelector extends StatelessWidget {
  const PaymentMethodSelector({super.key, required this.value, required this.onChanged, this.allowCash = true, this.cashLimitCents});
  final String value;
  final ValueChanged<String> onChanged;
  final bool allowCash;

  /// When cash is not allowed because of the riders' cash limit, explains it.
  final int? cashLimitCents;

  static const _options = [
    ('ECOCASH', 'EcoCash', Icons.phone_android_rounded, 'USSD prompt on your phone'),
    ('ONEMONEY', 'OneMoney', Icons.phone_android_rounded, 'USSD prompt on your phone'),
    ('CARD', 'Card', Icons.credit_card_rounded, 'Visa / Mastercard via Paynow'),
    ('CASH', 'Cash on delivery', Icons.payments_outlined, 'Pay the rider in cash'),
  ];

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        for (final (code, label, icon, hint) in _options)
          if (code != 'CASH' || allowCash)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: InkWell(
                borderRadius: BorderRadius.circular(14),
                onTap: () => onChanged(code),
                child: Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: value == code ? DsColors.orange : DsColors.line, width: value == code ? 2 : 1),
                    color: value == code ? DsColors.orangeLight : DsColors.white,
                  ),
                  child: Row(
                    children: [
                      Icon(icon, color: value == code ? DsColors.orange : DsColors.inkSoft),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(label, style: const TextStyle(fontWeight: FontWeight.w700)),
                            Text(hint, style: const TextStyle(fontSize: 12, color: DsColors.muted)),
                          ],
                        ),
                      ),
                      Icon(value == code ? Icons.radio_button_checked_rounded : Icons.radio_button_off_rounded,
                          color: value == code ? DsColors.orange : DsColors.muted),
                    ],
                  ),
                ),
              ),
            ),
        if (!allowCash && cashLimitCents != null)
          Padding(
            padding: const EdgeInsets.only(top: 2),
            child: Row(
              children: [
                const Icon(Icons.info_outline_rounded, size: 16, color: DsColors.muted),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    'Cash on delivery is for orders up to ${formatMoney(cashLimitCents!)}. Please pay online.',
                    style: const TextStyle(fontSize: 12, color: DsColors.muted),
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }
}

class CurrencyToggle extends StatelessWidget {
  const CurrencyToggle({super.key, required this.value, required this.onChanged});
  final String value;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return SegmentedButton<String>(
      segments: const [
        ButtonSegment(value: 'USD', label: Text('USD')),
        ButtonSegment(value: 'ZWG', label: Text('ZiG')),
      ],
      selected: {value},
      showSelectedIcon: false,
      onSelectionChanged: (s) => onChanged(s.first),
    );
  }
}

class TipSelector extends StatelessWidget {
  const TipSelector({super.key, required this.valueCents, required this.onChanged});
  final int valueCents;
  final ValueChanged<int> onChanged;

  static const _presets = [0, 50, 100, 200];

  @override
  Widget build(BuildContext context) {
    final custom = !_presets.contains(valueCents);
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        for (final cents in _presets)
          ChoiceChip(
            label: Text(cents == 0 ? 'No tip' : formatMoney(cents)),
            selected: valueCents == cents,
            onSelected: (_) => onChanged(cents),
          ),
        ChoiceChip(
          label: Text(custom ? formatMoney(valueCents) : 'Other'),
          selected: custom,
          onSelected: (_) async {
            final result = await showDialog<int>(context: context, builder: (_) => const _CustomTipDialog());
            if (result != null) onChanged(result);
          },
        ),
      ],
    );
  }
}

class _CustomTipDialog extends StatefulWidget {
  const _CustomTipDialog();

  @override
  State<_CustomTipDialog> createState() => _CustomTipDialogState();
}

class _CustomTipDialogState extends State<_CustomTipDialog> {
  final _controller = TextEditingController();
  String? _error;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Tip your rider'),
      content: TextField(
        controller: _controller,
        autofocus: true,
        keyboardType: const TextInputType.numberWithOptions(decimal: true),
        decoration: InputDecoration(prefixText: 'US\$ ', hintText: '1.50', errorText: _error),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
        FilledButton(
          onPressed: () {
            final cents = parseMoney(_controller.text);
            if (cents == null || cents > 5000) {
              setState(() => _error = 'Enter an amount up to US\$50');
              return;
            }
            Navigator.pop(context, cents);
          },
          style: FilledButton.styleFrom(minimumSize: const Size(88, 44)),
          child: const Text('Add tip'),
        ),
      ],
    );
  }
}

/// Price breakdown in the chosen currency (USD figures shown alongside ZiG).
class PriceBreakdown extends StatelessWidget {
  const PriceBreakdown({super.key, required this.quote, this.subtotalLabel = 'Subtotal'});
  final Quote quote;
  final String subtotalLabel;

  @override
  Widget build(BuildContext context) {
    String fmt(int usd) => formatInCurrency(usd, quote.currency, quote.exchangeRate);
    return Column(
      children: [
        if (quote.subtotalCents > 0) KeyValueRow(label: subtotalLabel, value: fmt(quote.subtotalCents)),
        KeyValueRow(label: 'Delivery (${quote.distanceKm.toStringAsFixed(1)} km)', value: fmt(quote.deliveryFeeCents)),
        if (quote.tipCents > 0) KeyValueRow(label: 'Rider tip', value: fmt(quote.tipCents)),
        const Divider(height: 20),
        KeyValueRow(label: 'Total', value: formatMoney(quote.totalLocalCents, quote.currency), bold: true, valueColor: DsColors.orange),
        if (quote.currency == 'ZWG')
          Align(
            alignment: Alignment.centerRight,
            child: Text('≈ ${formatMoney(quote.totalCents)} at ${quote.exchangeRate} ZiG/US\$',
                style: const TextStyle(fontSize: 12, color: DsColors.muted)),
          )
        else
          Align(
            alignment: Alignment.centerRight,
            child: Text('≈ ${formatMoney((quote.totalCents * quote.exchangeRate).round(), 'ZWG')}',
                style: const TextStyle(fontSize: 12, color: DsColors.muted)),
          ),
        const SizedBox(height: 4),
        Row(
          children: [
            const Icon(Icons.schedule_rounded, size: 16, color: DsColors.muted),
            const SizedBox(width: 4),
            Text('Estimated delivery ~${quote.etaMinutes} min', style: const TextStyle(color: DsColors.muted, fontSize: 13)),
          ],
        ),
      ],
    );
  }
}
